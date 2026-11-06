(function () {
  if (typeof window === "undefined") return;
  window.__omniErrors = window.__omniErrors || [];
  window.addEventListener("error", function (ev) {
    window.__omniErrors.push("[ERR] " + ev.message + "\n" + (ev.error && ev.error.stack ? ev.error.stack : ""));
  });
  window.addEventListener("unhandledrejection", function (ev) {
    window.__omniErrors.push("[REJ] " + (ev.reason && ev.reason.stack ? ev.reason.stack : String(ev.reason)));
  });
  const origConsoleErr = console.error;
  console.error = function () {
    const args = Array.prototype.slice.call(arguments);
    window.__omniErrors.push(
      "[CONSOLE_ERR] " +
        args
          .map(function (a) {
            return a && a.stack ? a.stack : String(a);
          })
          .join(" ")
    );
    return origConsoleErr.apply(console, args);
  };
  if (window.omni) return;

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  function parseJsonWithDates(text) {
    return JSON.parse(text, function (_key, value) {
      if (typeof value === "string" && ISO_DATE_RE.test(value)) {
        return new Date(value);
      }
      return value;
    });
  }


  const listeners = {
    "window:state-changed": new Set(),
    "app:navigate": new Set(),
    "license:changed": new Set(),
    "system:stats": new Set(),
    "inbox:changed": new Set()
  };

  function subscribe(channel, cb) {
    const set = listeners[channel];
    if (!set) return function () {};
    set.add(cb);
    return function () {
      set.delete(cb);
    };
  }

  try {
    const es = new EventSource("/__omni/events");
    es.onmessage = function (ev) {
      try {
        const msg = parseJsonWithDates(ev.data);
        const set = listeners[msg.channel];
        if (set) {
          set.forEach(function (cb) {
            try {
              cb(msg.payload);
            } catch (_e) {}
          });
        }
      } catch (_e) {}
    };
  } catch (_e) {}

  // Rewrite omni-media:// URLs to /__omni/media/ for standard web browsers
  function rewriteMediaAttr(el, attr) {
    const val = el.getAttribute(attr);
    if (val && val.startsWith("omni-media://")) {
      el.setAttribute(attr, "/__omni/media/" + val.slice("omni-media://".length));
    }
  }
  const obs = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      if (m.type === "attributes" && (m.attributeName === "src" || m.attributeName === "poster")) {
        rewriteMediaAttr(m.target, m.attributeName);
      } else if (m.type === "childList") {
        m.addedNodes.forEach(function (node) {
          if (node && node.nodeType === 1) {
            rewriteMediaAttr(node, "src");
            rewriteMediaAttr(node, "poster");
            node.querySelectorAll &&
              node.querySelectorAll("[src^='omni-media://'],[poster^='omni-media://']").forEach(function (child) {
                rewriteMediaAttr(child, "src");
                rewriteMediaAttr(child, "poster");
              });
          }
        });
      }
    }
  });
  if (document.documentElement) {
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "poster"]
    });
  }

  window.omni = {
    window: {
      minimize: function () {},
      toggleMaximize: function () {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () {});
        } else {
          document.exitFullscreen && document.exitFullscreen().catch(function () {});
        }
      },
      close: function () {
        window.close();
      },
      onStateChanged: function (cb) {
        return subscribe("window:state-changed", cb);
      }
    },
    app: {
      info: function () {
        return fetch("/__omni/info").then(function (r) {
          return r.json();
        });
      },
      setTheme: function (theme) {
        fetch("/__omni/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: theme })
        }).catch(function () {});
      },
      onNavigate: function (cb) {
        return subscribe("app:navigate", cb);
      },
      onLicenseChanged: function (cb) {
        return subscribe("license:changed", cb);
      }
    },
    system: {
      onStats: function (cb) {
        return subscribe("system:stats", cb);
      }
    },
    inbox: {
      onChanged: function (cb) {
        return subscribe("inbox:changed", cb);
      }
    },
    api: {
      invoke: function (endpoint, input) {
        if (typeof endpoint !== "string" || !/^[a-z][a-zA-Z]*\.[a-zA-Z]+$/.test(endpoint)) {
          return Promise.resolve({ ok: false, error: { code: "VALIDATION", message: "Endpoint không hợp lệ" } });
        }
        return fetch("/__omni/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input === undefined ? { endpoint: endpoint } : { endpoint: endpoint, input: input })
        })
          .then(function (r) {
            return r.text();
          })
          .then(function (txt) {
            return parseJsonWithDates(txt);
          })
          .catch(function (err) {
            return {
              ok: false,
              error: {
                code: "INTERNAL",
                message: "Lỗi gọi HTTP API: " + (err && err.message ? err.message : String(err))
              }
            };
          });
      }
    }
  };
})();

