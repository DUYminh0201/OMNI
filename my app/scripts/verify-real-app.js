const BASE = "http://127.0.0.1:5173";

async function rpc(endpoint, input) {
  const res = await fetch(`${BASE}/__omni/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input === undefined ? { endpoint } : { endpoint, input })
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`[${endpoint}] FAILED: ${JSON.stringify(json.error)}`);
  }
  return json.data;
}

async function main() {
  console.log("=== KIỂM THỬ TOÀN DIỆN OMNIRA STUDIO v1.2.7 (APP CHÍNH + SUPER ADMIN) ===");

  const infoRes = await fetch(`${BASE}/__omni/info`);
  const info = await infoRes.json();
  console.log("1. [__omni/info]:", JSON.stringify(info));

  const authState = await rpc("auth.state");
  console.log("2. [auth.state] User:", authState.user?.email, "| Name:", authState.user?.displayName, "| Plan:", authState.user?.plan);
  console.log("   [auth.state] License:", authState.license?.planName, "| Usable:", authState.license?.usable, "| MaxChannels:", authState.license?.maxChannels, "| Features:", authState.license?.features?.join(", "));

  const workspaces = await rpc("workspaces.list");
  console.log("3. [workspaces.list] Số Pocket/Workspace:", workspaces.length, "| Mẫu:", workspaces.map((w) => w.name).join(", "));

  const wsId = workspaces[0]?.id;
  const summary = await rpc("dashboard.summary", { workspaceId: wsId });
  const daemon = await rpc("dashboard.daemon", { workspaceId: wsId });
  console.log("4. [dashboard.summary & daemon] Kênh:", summary.channels?.total, "| Lượt xem 30d:", summary.reach?.views30d, "| Luật AutoReply:", daemon.autoReply?.enabledRules);

  const tree = await rpc("accounts.tree", { workspaceId: wsId });
  console.log("5. [accounts.tree] Số tài khoản VIA:", tree.length);

  const channels = await rpc("channels.list", { workspaceId: wsId });
  console.log("6. [channels.list] Số kênh:", channels.length);

  const quota = await rpc("channels.quota");
  console.log("7. [channels.quota] Limit:", quota.limit, "| Used:", quota.used, "| Blocked:", quota.blocked);

  const content = await rpc("content.list", { workspaceId: wsId });
  const contentStats = await rpc("content.stats", { workspaceId: wsId });
  console.log("8. [content.list & stats] Số bài viết kho nội dung:", content.length, "| Tổng tất cả Pocket:", contentStats.total);

  const now = Date.now();
  const range = await rpc("posts.range", {
    workspaceId: wsId,
    from: Math.floor(now - 7 * 86400000),
    to: Math.floor(now + 14 * 86400000)
  });
  console.log("9. [posts.range] Số bài lập lịch:", range.length);

  const convs = await rpc("inbox.conversations", { workspaceId: wsId });
  const inboxStats = await rpc("inbox.stats", { workspaceId: wsId });
  console.log("10. [inbox.conversations & stats] Số hội thoại:", convs.length, "| Chưa đọc:", inboxStats.unread);

  const analytics = await rpc("analytics.overview", { workspaceId: wsId, days: 30 });
  console.log("11. [analytics.overview] Tổng lượt xem:", analytics.totalViews, "| Tổng tương tác:", analytics.totalEngagements);

  const projects = await rpc("studio.projects", { workspaceId: wsId });
  console.log("12. [studio.projects] Số dự án Xưởng Video AI:", projects.length);

  const mediaDetect = await rpc("media.detect");
  console.log("13. [media.detect] FFmpeg Hardware Encoder:", JSON.stringify(mediaDetect));

  const newSeries = await rpc("series.create", { workspaceId: wsId, title: "Series Test Super Admin", productionMode: "film" });
  await rpc("series.delete", { id: newSeries.id });
  console.log("14. [series.create & delete] Tạo & xóa Series thành công:", newSeries.id);

  const filmGate = await rpc("film.gate");
  const newFilm = await rpc("film.create", { workspaceId: wsId, title: "Phim Điện Ảnh AI Test", idea: "Ý tưởng phim ngắn", aspect: "16:9", targetSec: 60 });
  await rpc("film.delete", { id: newFilm.id });
  console.log("15. [film.gate & film.create/delete] Gate OK:", filmGate.ok, "| Tạo & xóa Phim thành công:", newFilm.id);

  const flowStatus = await rpc("flow.status");
  const museStatus = await rpc("museFlow.status");
  const grokStatus = await rpc("grokFlow.status");
  console.log("16. [flow / museFlow / grokFlow] Google Flow:", flowStatus.source, "| Muse Flow:", museStatus.source, "| Grok Flow:", grokStatus.plan);

  const newImgProj = await rpc("imagestudio.create", { workspaceId: wsId, title: "Ảnh Quảng Cáo AI Test", imageType: "poster" });
  await rpc("imagestudio.delete", { id: newImgProj.id });
  console.log("17. [imagestudio.create/delete] Tạo & xóa Dự án Ảnh AI thành công:", newImgProj.id);

  const ttsJobs = await rpc("tts.list", {});
  const localTts = await rpc("localtts.status", {});
  console.log("18. [tts.list & localtts.status] TTS Jobs:", ttsJobs.length, "| Local VieNeu-TTS:", JSON.stringify(localTts));

  const aiProviders = await rpc("ai.providers");
  const aiOmnira = await rpc("ai.omnira");
  const vaultInfo = await rpc("vault.info");
  console.log("19. [ai.providers, ai.omnira, vault.info] Providers:", aiProviders.length, "| AI Omnira Quota:", JSON.stringify(aiOmnira.quota), "| Vault:", vaultInfo.backend);

  const plans = await rpc("billing.plans");
  const orders = await rpc("billing.orders");
  const devices = await rpc("license.devices");
  const support = await rpc("support.list");
  console.log("20. [billing/devices/support] Plans:", plans.length, "| Orders:", orders.length, "| Devices:", devices.length, "| Support Tickets:", support.length);

  const dbInfo = await rpc("system.dbInfo");
  const storage = await rpc("storage.location");
  console.log("21. [system.dbInfo & storage.location] DB:", dbInfo.path, "| Seeded:", dbInfo.seeded, "| Root:", storage.root);

  console.log("\n=== TẤT CẢ 21/21 NHÓM CHỨC NĂNG CỦA APP CHÍNH HOẠT ĐỘNG HOÀN HẢO 100%! ===");
}

main().catch((err) => {
  console.error("TEST ERROR:", err);
  process.exit(1);
});
