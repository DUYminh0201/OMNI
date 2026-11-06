function extractUrls(text) {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  const matches = text.match(urlRegex) || [];
  return matches.map(u => u.trim().replace(/[.,;!?]+$/, ''));
}
import { savePendingDubbingFile } from '../../utils/dubbingStorage.js';
import React, { useState, useEffect } from 'react';
import { Download, Clipboard, Link2, Trash2, Video, Music, ListPlus, Loader2, AlertCircle, CheckCircle2, RefreshCw, Edit2, Check, Send, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import { isSupportedVideoUrl } from '../../../../../packages/video-downloader/src/platforms.js';

export default function TikTokDownloader() {
  const [inputUrls, setInputUrls] = useState('');
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingUrl, setEditingUrl] = useState('');

  const [batchProgress, setBatchProgress] = useState({
    active: false,
    mode: '',
    current: 0,
    total: 0,
    message: '',
  });

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditingUrl(item.url);
  };

  const handleSaveEdit = (id) => {
    if (!editingUrl.trim()) return;
    setQueue(prev => prev.map(q => q.id === id ? { 
      ...q, 
      url: editingUrl.trim(), 
      status: 'pending', 
      errorMsg: '', 
      title: 'Đang chuẩn bị...' 
    } : q));
    setEditingId(null);
    setEditingUrl('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingUrl('');
  };

  const handleClipboardPaste = async () => {
    let clipText = '';

    // A. Try direct navigator.clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        clipText = await navigator.clipboard.readText();
      }
    } catch (err) {
      console.warn('[Clipboard] Direct read failed:', err.message);
    }

    // B. If empty or in iframe, ask parent window via postMessage
    if (!clipText && window.parent && window.parent !== window) {
      try {
        clipText = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', onMsg);
            resolve('');
          }, 600);
          const onMsg = (e) => {
            if (e.data && e.data.type === 'CLIPBOARD_RESPONSE') {
              clearTimeout(timer);
              window.removeEventListener('message', onMsg);
              resolve(e.data.text || '');
            }
          };
          window.addEventListener('message', onMsg);
          window.parent.postMessage({ type: 'GET_CLIPBOARD' }, '*');
        });
      } catch (_) {}
    }

    // C. Fallback: prompt or execCommand
    if (!clipText) {
      try {
        const activeElem = document.activeElement;
        const ta = document.createElement('textarea');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        if (document.execCommand('paste')) {
          clipText = ta.value;
        }
        document.body.removeChild(ta);
        if (activeElem?.focus) activeElem.focus();
      } catch (_) {}
    }

    if (!clipText) {
      alert('Không thể đọc Clipboard tự động. Vui lòng bấm vào ô nhập bên dưới và nhấn phím Ctrl + V.');
      return;
    }

    // Extract valid URLs
    const foundUrls = extractUrls(clipText);
    const validVideoUrls = foundUrls.filter(isSupportedVideoUrl);

    if (validVideoUrls.length > 0) {
      setInputUrls(prev => {
        const lines = prev.split('\n').map(l => l.trim()).filter(Boolean);
        const newOnes = validVideoUrls.filter(u => !lines.includes(u));
        if (newOnes.length === 0) return prev;
        return prev ? `${prev}\n${newOnes.join('\n')}` : newOnes.join('\n');
      });
    } else if (foundUrls.length > 0) {
      setInputUrls(prev => prev ? `${prev}\n${foundUrls.join('\n')}` : foundUrls.join('\n'));
    } else if (clipText.trim()) {
      setInputUrls(prev => prev ? `${prev}\n${clipText.trim()}` : clipText.trim());
    }
  };

  const handleAddToQueue = () => {
    if (!inputUrls.trim()) return;
    let urls = inputUrls
      .split(/[\n, ]+/)
      .map(url => url.trim())
      .filter(isSupportedVideoUrl);
    if (urls.length === 0) {
      urls = extractUrls(inputUrls).filter(isSupportedVideoUrl);
    }
    if (urls.length === 0) return;
    const newItems = urls.map(url => ({
      id: Math.random().toString(36).substr(2, 9),
      url,
      title: 'Đang chuẩn bị...',
      cover: '',
      status: 'pending',
      progress: 0,
      videoUrl: '',
      musicUrl: '',
      errorMsg: '',
      author: ''
    }));
    setQueue(prev => [...prev, ...newItems]);
    setInputUrls('');
  };

  const processQueueItem = async (item) => {
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'fetching' } : q));
    try {
      const response = await fetch('/api/video/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url })
      });
      const result = await response.json();
      if (result.success && result.data) {
        const data = result.data;
        setQueue(prev => prev.map(q => q.id === item.id ? {
          ...q, status: 'ready',
          title: data.title || 'Video',
          cover: data.origin_cover || data.cover,
          videoUrl: data.play,
          musicUrl: data.music_info ? data.music_info.play : '',
          author: data.author ? (data.author.unique_id ? `@${data.author.unique_id}` : data.author) : '',
          platform: data.platform || 'tiktok',
          originalUrl: data.originalUrl || item.url,
          progress: 100
        } : q));
      } else {
        throw new Error(result.error || 'Lỗi phân tích video');
      }
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === item.id ? {
        ...q, status: 'error',
        errorMsg: err.message || 'Không tìm thấy liên kết tải.'
      } : q));
    }
  };

  useEffect(() => {
    const pendingItem = queue.find(q => q.status === 'pending');
    if (pendingItem && !isProcessing) {
      setIsProcessing(true);
      processQueueItem(pendingItem).finally(() => setIsProcessing(false));
    }
  }, [queue, isProcessing]);

  const sanitizeFilename = (title, defaultName = 'Video') => {
    const clean = (title || defaultName).replace(/[\\/:*?"<>|]/g, '_').substring(0, 50).trim();
    return clean || defaultName;
  };

  const getUniqueFilename = (usedNames, title, extension) => {
    const baseName = sanitizeFilename(title);
    let candidate = `${baseName}.${extension}`;
    let counter = 1;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${baseName}_${counter}.${extension}`;
      counter++;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  };

  const handleDownload = async (item, type = 'video') => {
    const mediaUrl = type === 'audio' ? item.musicUrl : item.videoUrl;
    if (!mediaUrl && item.platform !== 'youtube') return;
    const extension = type === 'audio' ? 'mp3' : 'mp4';
    const filename = `${sanitizeFilename(item.title)}.${extension}`;
    const params = new URLSearchParams({
      url: mediaUrl || '',
      name: filename,
      platform: item.platform || '',
      originalUrl: item.originalUrl || '',
      type,
    });
    const proxyUrl = `/api/video/download?${params.toString()}`;

    // Cập nhật trạng thái bắt đầu tải
    setQueue(prev => prev.map(q => q.id === item.id ? {
      ...q,
      downloadStatus: 'downloading',
      downloadType: type,
      downloadPercent: 0,
      downloadLoadedMB: '0.0',
      downloadTotalMB: ''
    } : q));

    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        throw new Error(`Tải ${type === 'audio' ? 'âm thanh' : 'video'} thất bại (HTTP ${res.status})`);
      }

      const contentLengthHeader = res.headers.get('content-length');
      const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      const totalMB = total > 0 ? (total / (1024 * 1024)).toFixed(1) : '';

      let blob;
      if (!res.body || !res.body.getReader) {
        blob = await res.blob();
      } else {
        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        let lastUpdate = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;

          const now = Date.now();
          if (now - lastUpdate > 100 || (total > 0 && loaded >= total)) {
            lastUpdate = now;
            const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : -1;
            const loadedMB = (loaded / (1024 * 1024)).toFixed(1);

            setQueue(prev => prev.map(q => q.id === item.id ? {
              ...q,
              downloadStatus: 'downloading',
              downloadPercent: percent,
              downloadLoadedMB: loadedMB,
              downloadTotalMB: totalMB,
              downloadType: type
            } : q));
          }
        }

        const mime = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
        blob = new Blob(chunks, { type: res.headers.get('content-type') || mime });
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

      setQueue(prev => prev.map(q => q.id === item.id ? {
        ...q,
        downloadStatus: 'completed',
        downloadPercent: 100
      } : q));

      // Reset về trạng thái bình thường sau 4 giây
      setTimeout(() => {
        setQueue(prev => prev.map(q => (q.id === item.id && q.downloadStatus === 'completed') ? {
          ...q,
          downloadStatus: null,
          downloadPercent: 0
        } : q));
      }, 4000);

    } catch (err) {
      console.error('[DownloadError]', err);
      setQueue(prev => prev.map(q => q.id === item.id ? {
        ...q,
        downloadStatus: 'error',
        downloadErrorMsg: err.message || 'Lỗi tải video'
      } : q));
    }
  };

  const handleRemove = (id) => setQueue(prev => prev.filter(q => q.id !== id));
  const handleRetry = (id) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'pending', errorMsg: '', title: 'Đang chuẩn bị...' } : q));
  };
  const handleClearQueue = () => setQueue([]);

  const handleSendToDubbing = async (item) => {
    const extension = 'mp4';
    const filename = `${sanitizeFilename(item.title)}.${extension}`;
    const params = new URLSearchParams({
      url: item.videoUrl || '',
      name: filename,
      platform: item.platform || '',
      originalUrl: item.originalUrl || '',
      type: 'video',
    });
    const proxyUrl = `/api/video/download?${params.toString()}`;

    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, sending: true } : q));
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('Không tải được video');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type || 'video/mp4' });

      // 1. Save file to IndexedDB for persistent transfer across tabs / iframes
      await savePendingDubbingFile(file);

      // 2. Dispatch in local window (for standalone desktop app)
      window.dispatchEvent(new CustomEvent('send_to_dubbing', { detail: { file } }));

      // 3. Post message to parent window (Omnira Studio) to navigate sidebar to Lồng Tiếng Video
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'MKT_NAVIGATE', path: '/mkt/dubbing', tab: 'video-dubbing' }, '*');
      }
    } catch (err) {
      console.error('[SendToDubbing]', err);
      alert(`Không thể gửi video sang Lồng Tiếng: ${err.message}`);
    } finally {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, sending: false } : q));
    }
  };

  const fetchVideoBlob = async (item) => {
    const mediaUrl = item.videoUrl;
    const extension = 'mp4';
    const filename = `${sanitizeFilename(item.title)}.${extension}`;
    const params = new URLSearchParams({
      url: mediaUrl || '',
      name: filename,
      platform: item.platform || '',
      originalUrl: item.originalUrl || '',
      type: 'video',
    });
    const proxyUrl = `/api/video/download?${params.toString()}`;

    const res = await fetch(proxyUrl);
    if (!res.ok) {
      throw new Error(`Tải video "${item.title}" thất bại (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    return { blob, filename };
  };

  const handleDownloadZipAll = async () => {
    const readyItems = queue.filter(q => q.status === 'ready');
    if (readyItems.length === 0) return;

    setBatchProgress({
      active: true,
      mode: 'zip',
      current: 0,
      total: readyItems.length,
      message: `Đang bắt đầu chuẩn bị nén ${readyItems.length} video...`,
    });

    const zip = new JSZip();
    const usedNames = new Set();
    let successCount = 0;

    try {
      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        setBatchProgress(prev => ({
          ...prev,
          current: i + 1,
          message: `Đang tải & nén video ${i + 1}/${readyItems.length}: ${item.title.substring(0, 30)}...`,
        }));

        try {
          const { blob } = await fetchVideoBlob(item);
          const uniqueFilename = getUniqueFilename(usedNames, item.title, 'mp4');
          zip.file(uniqueFilename, blob);
          successCount++;
        } catch (err) {
          console.error(`[ZipDownload] Lỗi tải video "${item.title}":`, err);
        }
      }

      if (successCount === 0) {
        alert('Không thể tải video nào để nén ZIP. Vui lòng kiểm tra lại kết nối!');
        return;
      }

      setBatchProgress(prev => ({
        ...prev,
        message: `Đang hoàn tất đóng gói file ZIP (${successCount} video)...`,
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setBatchProgress(prev => ({
          ...prev,
          message: `Đang xuất file ZIP: ${Math.round(metadata.percent)}%`,
        }));
      });

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const zipName = `MarketingFlow_Videos_${dateStr}_${Math.floor(Math.random() * 1000)}.zip`;

      const blobUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', zipName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    } catch (err) {
      console.error('[ZipDownloadError]', err);
      alert(`Có lỗi xảy ra khi nén ZIP: ${err.message}`);
    } finally {
      setBatchProgress({ active: false, mode: '', current: 0, total: 0, message: '' });
    }
  };

  const handleDownloadAllSequential = async () => {
    const readyItems = queue.filter(q => q.status === 'ready');
    if (readyItems.length === 0) return;

    setBatchProgress({
      active: true,
      mode: 'sequential',
      current: 0,
      total: readyItems.length,
      message: `Đang chuẩn bị tải tuần tự ${readyItems.length} video...`,
    });

    const usedNames = new Set();

    try {
      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        setBatchProgress(prev => ({
          ...prev,
          current: i + 1,
          message: `Đang tải video ${i + 1}/${readyItems.length}: ${item.title.substring(0, 30)}...`,
        }));

        try {
          const { blob } = await fetchVideoBlob(item);
          const uniqueFilename = getUniqueFilename(usedNames, item.title, 'mp4');
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', uniqueFilename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

          if (i < readyItems.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (err) {
          console.error(`[SequentialDownload] Lỗi tải video "${item.title}":`, err);
        }
      }
    } finally {
      setBatchProgress({ active: false, mode: '', current: 0, total: 0, message: '' });
    }
  };

  const readyCount = queue.filter(q => q.status === 'ready').length;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.55rem' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)', flexShrink: 0
          }}>
            <Video size={22} color="white" />
          </div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Tải Video Đa Nền Tảng</h1>
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
            padding: '0.3rem 0.8rem', borderRadius: '999px',
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            color: '#a5b4fc', letterSpacing: '0.05em', textTransform: 'uppercase'
          }}>HD · No Watermark</span>
        </div>
      </div>

      {batchProgress.active && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.15))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={16} className="spinner" style={{ color: '#38bdf8' }} />
              {batchProgress.message}
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a5b4fc' }}>
              {batchProgress.current} / {batchProgress.total}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(batchProgress.current / (batchProgress.total || 1)) * 100}%`,
              background: 'linear-gradient(to right, #6366f1, #06b6d4)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <label className="form-label" style={{ margin: 0 }}>
              DÁN URL TIKTOK / DOUYIN / YOUTUBE (HỖ TRỢ TẢI HÀNG LOẠT)
            </label>
            <button
              type="button"
              onClick={handleClipboardPaste}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem', borderRadius: '7px', gap: '0.35rem', flexShrink: 0 }}
            >
              <Clipboard size={13} /> Đọc từ Clipboard
            </button>
          </div>

          <textarea
            className="input-control textarea-control"
            placeholder={`Ví dụ:\nhttps://www.tiktok.com/@username/video/1234567890\nhttps://www.youtube.com/watch?v=1234567890`}
            value={inputUrls}
            onChange={(e) => setInputUrls(e.target.value)}
            style={{ minHeight: '160px' }}
          />

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddToQueue}
            disabled={!inputUrls.trim()}
            style={{ width: '100%' }}
          >
            <ListPlus size={18} /> Thêm vào hàng đợi tải
          </button>
        </div>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Hàng đợi</h3>
              {queue.length > 0 && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' }}>
                  {queue.length}
                </span>
              )}
            </div>
            {queue.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {readyCount >= 2 && (
                  <button
                    onClick={handleDownloadZipAll}
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', borderRadius: '8px', gap: '0.35rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    disabled={batchProgress.active}
                    title="Tải gom tất cả thành 1 file ZIP (Dành cho 2 video trở lên)"
                  >
                    <FileArchive size={14} /> Tải file ZIP ({readyCount})
                  </button>
                )}
                {readyCount > 1 && (
                  <button
                    onClick={handleDownloadAllSequential}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', borderRadius: '8px', gap: '0.35rem' }}
                    disabled={batchProgress.active}
                    title="Tải riêng lẻ từng file theo thứ tự"
                  >
                    <Download size={14} /> Tải riêng lẻ ({readyCount})
                  </button>
                )}
                <button onClick={handleClearQueue} className="btn btn-secondary"
                  disabled={batchProgress.active}
                  style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', borderRadius: '8px', color: 'var(--accent-error)', borderColor: 'rgba(239,68,68,0.2)', gap: '0.3rem' }}>
                  <Trash2 size={14} /> Xóa
                </button>
              </div>
            )}
          </div>

          {queue.length === 0 ? (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', gap: '0.75rem' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Link2 size={22} style={{ opacity: 0.4 }} />
              </div>
              <p style={{ fontWeight: 500 }}>Chưa có video nào trong hàng đợi.</p>
              <p style={{ fontSize: '0.8rem', textAlign: 'center', maxWidth: '280px', lineHeight: 1.5 }}>Hãy sao chép link TikTok, Douyin hoặc YouTube và thêm vào khung bên trái.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', maxHeight: '420px', paddingRight: '0.25rem' }}>
              {queue.map((item) => (
                <div key={item.id} style={{
                  display: 'flex', gap: '0.875rem', padding: '0.875rem 1rem',
                  backgroundColor: item.status === 'error' ? 'rgba(239,68,68,0.04)' : item.status === 'ready' ? 'rgba(16,185,129,0.03)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${item.status === 'error' ? 'rgba(239,68,68,0.15)' : item.status === 'ready' ? 'rgba(16,185,129,0.12)' : 'var(--border-color)'}`,
                  borderRadius: '12px', alignItems: 'center', position: 'relative',
                  transition: 'background 0.3s ease, border-color 0.3s ease'
                }}>
                  {/* Thumbnail */}
                  <div style={{ width: '58px', height: '58px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.07)' }}>
                    {item.cover ? <img src={item.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Video size={22} style={{ color: 'var(--text-sub)' }} />}
                  </div>

                  {/* Info */}
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    {editingId === item.id ? (
                      <div style={{ display: 'flex', gap: '0.4rem', width: '100%', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="input-control"
                          value={editingUrl}
                          onChange={(e) => setEditingUrl(e.target.value)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.8rem',
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            border: '1px solid var(--accent-primary)',
                            color: 'white',
                            borderRadius: '6px',
                            flexGrow: 1
                          }}
                          placeholder="Nhập lại link TikTok, Douyin hoặc YouTube..."
                        />
                        <button
                          onClick={() => handleSaveEdit(item.id)}
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem' }}
                          title="Lưu"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.1)' }}
                          title="Hủy"
                        >
                          <AlertCircle size={14} className="rotate-45" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.2rem' }} title={item.url}>{item.title}</div>
                        {item.author && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{item.author}</div>}
                        <div>
                          {item.status === 'fetching' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}><Loader2 size={11} className="spinner" /> Đang quét...</span>}
                          {item.status === 'ready' && (
                            item.downloadStatus === 'downloading' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '170px', maxWidth: '250px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 600 }}>
                                  <span style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Loader2 size={11} className="spinner" /> {item.downloadType === 'audio' ? 'Đang tải âm thanh...' : 'Đang tải video...'}
                                  </span>
                                  <span style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 700 }}>
                                    {item.downloadPercent >= 0 ? `${item.downloadPercent}%` : `${item.downloadLoadedMB} MB`}
                                  </span>
                                </div>
                                <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: item.downloadPercent >= 0 ? `${Math.max(5, item.downloadPercent)}%` : '60%',
                                    background: 'linear-gradient(90deg, #6366f1, #06b6d4, #10b981)',
                                    borderRadius: '999px',
                                    transition: 'width 0.15s ease',
                                    animation: item.downloadPercent < 0 ? 'pulse 1.4s ease-in-out infinite alternate' : 'none'
                                  }} />
                                </div>
                              </div>
                            ) : item.downloadStatus === 'completed' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                                <CheckCircle2 size={11} /> Đã tải xong!
                              </span>
                            ) : item.downloadStatus === 'error' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', padding: '0.15rem 0.55rem', borderRadius: '999px' }} title={item.downloadErrorMsg}>
                                <AlertCircle size={11} /> Lỗi: {item.downloadErrorMsg}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                                <CheckCircle2 size={11} /> Sẵn sàng tải
                              </span>
                            )
                          )}
                          {item.status === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', padding: '0.15rem 0.55rem', borderRadius: '999px' }} title={item.url}><AlertCircle size={11} /> {item.errorMsg}</span>}
                          {item.status === 'pending' && <span style={{ display: 'inline-flex', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-sub)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>Đang chờ...</span>}
                        </div>
                        {item.status === 'fetching' && (
                          <div style={{ width: '100%', height: '2px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '60%', background: 'linear-gradient(to right, #6366f1, #06b6d4)', borderRadius: '2px', animation: 'pulse 1.4s ease-in-out infinite alternate' }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    {item.status === 'error' && editingId !== item.id && (
                      <>
                        <button 
                          onClick={() => handleStartEdit(item)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.45rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }} 
                          title="Cập nhật link mới"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button 
                          onClick={() => handleRetry(item.id)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.45rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }} 
                          title="Thử lại"
                        >
                          <RefreshCw size={15} />
                        </button>
                      </>
                    )}
                    {item.status === 'ready' && (
                      <>
                        <button
                          onClick={() => handleDownload(item, 'video')}
                          disabled={item.downloadStatus === 'downloading'}
                          className="btn btn-primary"
                          style={{
                            padding: '0.45rem 0.55rem',
                            borderRadius: '8px',
                            opacity: (item.downloadStatus === 'downloading' && item.downloadType === 'video') ? 0.7 : 1
                          }}
                          title="Tải Video"
                        >
                          {item.downloadStatus === 'downloading' && item.downloadType === 'video' ? (
                            <Loader2 size={15} className="spinner" />
                          ) : (
                            <Video size={15} />
                          )}
                        </button>
                        {item.musicUrl && (
                          <button
                            onClick={() => handleDownload(item, 'audio')}
                            disabled={item.downloadStatus === 'downloading'}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.45rem 0.55rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(6,182,212,0.2)',
                              color: 'var(--accent-cyan)',
                              opacity: (item.downloadStatus === 'downloading' && item.downloadType === 'audio') ? 0.7 : 1
                            }}
                            title="Tải Âm Thanh"
                          >
                            {item.downloadStatus === 'downloading' && item.downloadType === 'audio' ? (
                              <Loader2 size={15} className="spinner" />
                            ) : (
                              <Music size={15} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleSendToDubbing(item)}
                          disabled={item.sending}
                          className="btn btn-secondary"
                          style={{
                            padding: '0.45rem 0.55rem', borderRadius: '8px',
                            border: '1px solid rgba(139,92,246,0.3)',
                            color: item.sending ? 'var(--text-sub)' : '#c4b5fd',
                          }}
                          title="Gửi sang Lồng Tiếng Video"
                        >
                          {item.sending ? <Loader2 size={13} className="spinner" /> : <Send size={13} />}
                        </button>
                      </>
                    )}
                    {editingId !== item.id && (
                      <button onClick={() => handleRemove(item.id)} className="btn btn-secondary" style={{ padding: '0.45rem 0.55rem', borderRadius: '8px', color: 'var(--text-sub)', borderColor: 'transparent' }} title="Xóa"><Trash2 size={15} /></button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
