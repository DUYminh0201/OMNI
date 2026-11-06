import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App.jsx';

// 1. Quản lý Local Auth Token & tự động chuyển hướng / gắn header X-Omni-Token
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      window.__OMNI_TOKEN__ = tokenParam;
      sessionStorage.setItem('omni_local_token', tokenParam);
      params.delete('token');
      const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    } else {
      window.__OMNI_TOKEN__ = sessionStorage.getItem('omni_local_token') || '';
    }
  } catch {}

  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    let targetUrl = url;
    if (typeof targetUrl === 'string') {
      if (targetUrl.startsWith('/api/')) {
        targetUrl = 'http://127.0.0.1:3002' + targetUrl;
      } else if (targetUrl.startsWith('/downloads/')) {
        targetUrl = 'http://127.0.0.1:3002' + targetUrl;
      }
    }

    const isApi = (typeof targetUrl === 'string' && targetUrl.includes('/api/')) ||
                  (typeof url === 'string' && url.startsWith('/api/'));
    if (isApi) {
      const token = window.__OMNI_TOKEN__ || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('omni_local_token') : null);
      if (token) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('X-Omni-Token')) {
          headers.set('X-Omni-Token', token);
        }
        options = { ...options, headers };
      }
    }
    return originalFetch.call(this, targetUrl, options);
  };
}

let rootInstance = null;
let currentTabSetter = null;
let currentThemeSetter = null;

function NativeAppWrapper({ initialTab, initialTheme }) {
  const [tab, setTab] = React.useState(initialTab || 'tiktok');
  const [theme, setTheme] = React.useState(initialTheme || 'dark');

  React.useEffect(() => {
    currentTabSetter = setTab;
    currentThemeSetter = setTheme;
    return () => {
      currentTabSetter = null;
      currentThemeSetter = null;
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === 'halloween') {
      document.body.classList.add('theme-halloween');
    } else {
      document.body.classList.remove('theme-halloween');
    }
  }, [theme]);

  // Lắng nghe lệnh SET_TAB từ message / custom event
  React.useEffect(() => {
    const handleTabEvent = (e) => {
      if (e.detail) setTab(e.detail);
    };
    window.addEventListener('mkt:set-tab', handleTabEvent);
    return () => window.removeEventListener('mkt:set-tab', handleTabEvent);
  }, []);

  return (
    <div className="mkt-flow-root h-full w-full">
      <App initialTab={tab} embedded={true} />
    </div>
  );
}

export function mountMktFlow(container, options = {}) {
  if (!container) return;
  if (!rootInstance) {
    rootInstance = createRoot(container);
  }
  rootInstance.render(
    <NativeAppWrapper initialTab={options.tab || 'tiktok'} initialTheme={options.theme || 'dark'} />
  );
}

export function setMktFlowTab(tab) {
  if (currentTabSetter) currentTabSetter(tab);
  window.dispatchEvent(new CustomEvent('mkt:set-tab', { detail: tab }));
  window.postMessage({ type: 'SET_TAB', tab }, '*');
}

export function setMktFlowTheme(theme) {
  if (currentThemeSetter) currentThemeSetter(theme);
  window.postMessage({ type: 'SET_THEME', theme }, '*');
}

if (typeof window !== 'undefined') {
  window.mountMktFlow = mountMktFlow;
  window.setMktFlowTab = setMktFlowTab;
  window.setMktFlowTheme = setMktFlowTheme;
}
