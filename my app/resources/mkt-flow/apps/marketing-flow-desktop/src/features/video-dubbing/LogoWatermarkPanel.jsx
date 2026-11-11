import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { X, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, Stamp, Video } from 'lucide-react';
import { resolveMktFlowUrl, extractMktFlowFilename } from '../../utils.js';

const POSITIONS = [
  { id: 'top-left',     name: 'Góc Trái Trên' },
  { id: 'top-right',   name: 'Góc Phải Trên' },
  { id: 'center',      name: 'Chính Giữa' },
  { id: 'bottom-left', name: 'Góc Trái Dưới' },
  { id: 'bottom-right',name: 'Góc Phải Dưới' },
  { id: 'tiled',       name: 'Rải Đều (Tiled)' },
  { id: 'custom',      name: 'Tùy chỉnh (Custom)' },
];

// Vẽ logo lên canvas (giống logic BulkWatermark.drawWatermarkOnCanvas)
function drawLogoOnCanvas(canvas, videoEl, logoImg, position, scale, opacity, customX, customY) {
  if (!canvas || !videoEl || !logoImg) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width  = videoEl.videoWidth  || 640;
  canvas.height = videoEl.videoHeight || 360;

  // Draw video frame
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  const W = canvas.width;
  const H = canvas.height;
  const logoW = W * (scale / 100);
  const aspect = logoImg.naturalHeight / logoImg.naturalWidth;
  const logoH = logoW * aspect;
  const pad = Math.max(12, W * 0.025);

  ctx.save();
  ctx.globalAlpha = opacity / 100;

  if (position === 'tiled') {
    const stepX = logoW * 2.5;
    const stepY = logoH * 2.5;
    for (let x = logoW / 2; x < W; x += stepX) {
      for (let y = logoH / 2; y < H; y += stepY) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-30 * Math.PI / 180);
        ctx.drawImage(logoImg, -logoW / 2, -logoH / 2, logoW, logoH);
        ctx.restore();
      }
    }
  } else {
    let x, y;
    switch (position) {
      case 'top-left':     x = pad;       y = pad;       break;
      case 'top-right':    x = W-logoW-pad; y = pad;     break;
      case 'bottom-left':  x = pad;       y = H-logoH-pad; break;
      case 'bottom-right': x = W-logoW-pad; y = H-logoH-pad; break;
      case 'custom':
        x = (W - logoW) * (customX / 100);
        y = (H - logoH) * (customY / 100);
        break;
      case 'center':
      default:
        x = (W - logoW) / 2;
        y = (H - logoH) / 2;
        break;
    }
    ctx.drawImage(logoImg, x, y, logoW, logoH);
  }
  ctx.restore();
}

export default function LogoWatermarkPanel({ finalVideoUrl, onClose, onLogoApplied, onLogoRemoved }) {
  const resolvedBaseUrl = resolveMktFlowUrl(finalVideoUrl);

  const [logoFile, setLogoFile]     = useState(null);
  const [logoImg, setLogoImg]       = useState(null); // HTMLImageElement
  const [position, setPosition]     = useState('bottom-right');
  const [scale, setScale]           = useState(20);
  const [opacity, setOpacity]       = useState(60);
  const [customX, setCustomX]       = useState(10);
  const [customY, setCustomY]       = useState(10);
  const [status, setStatus]         = useState('idle');
  const [errorMsg, setErrorMsg]     = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [videoSrc, setVideoSrc]     = useState(resolvedBaseUrl);
  const [savedLogos, setSavedLogos] = useState([]);

  const canvasRef             = useRef(null);
  const videoRef              = useRef(null);
  const seekFallbackTimerRef  = useRef(null);
  const fallbackBlobUrlRef    = useRef(null);
  const triedBlobFallbackRef  = useRef(false);

  const revokeFallbackBlob = useCallback(() => {
    if (fallbackBlobUrlRef.current) {
      URL.revokeObjectURL(fallbackBlobUrlRef.current);
      fallbackBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (seekFallbackTimerRef.current) {
      clearTimeout(seekFallbackTimerRef.current);
      seekFallbackTimerRef.current = null;
    }
    revokeFallbackBlob();
    triedBlobFallbackRef.current = false;
    setVideoReady(false);
    setVideoError('');
    setVideoSrc(resolvedBaseUrl);
  }, [resolvedBaseUrl, revokeFallbackBlob]);

  useEffect(() => () => {
    if (seekFallbackTimerRef.current) clearTimeout(seekFallbackTimerRef.current);
    revokeFallbackBlob();
  }, [revokeFallbackBlob]);

  // Load logo library from localStorage (shared with BulkWatermark)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('saved_watermark_logos');
      if (stored) setSavedLogos(JSON.parse(stored));
    } catch (e) {
      console.error('Failed to load saved logos:', e);
    }
  }, []);

  // Chọn logo từ thư viện (convert base64 → File + HTMLImageElement)
  const handleSelectSavedLogo = useCallback((logoItem) => {
    const arr = logoItem.data.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    const file = new File([u8arr], logoItem.name, { type: mime });
    setLogoFile(file);
    setStatus('idle');
    setErrorMsg('');
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = logoItem.data;
  }, []);

  const handleDeleteSavedLogo = useCallback((id, e) => {
    e.stopPropagation();
    setSavedLogos(prev => {
      const next = prev.filter(item => item.id !== id);
      localStorage.setItem('saved_watermark_logos', JSON.stringify(next));
      return next;
    });
  }, []);

  // Load logo image element khi user chọn file
  const onDrop = useCallback((accepted) => {
    const f = accepted[0];
    if (!f) return;
    setLogoFile(f);
    setStatus('idle');
    setErrorMsg('');
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setLogoImg(img);
      // Lưu vào thư viện chung với BulkWatermark
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSavedLogos(prev => {
          if (prev.some(item => item.data === ev.target.result)) return prev;
          const next = [...prev, { id: Date.now().toString(), name: f.name, data: ev.target.result }];
          localStorage.setItem('saved_watermark_logos', JSON.stringify(next));
          return next;
        });
      };
      reader.readAsDataURL(f);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: false,
    maxSize: 5 * 1024 * 1024,
  });

  // Vẽ lại canvas mỗi khi thay đổi tham số
  const redraw = useCallback(() => {
    const vid = videoRef.current;
    const cvs = canvasRef.current;
    if (!vid || !cvs || !videoReady) return;
    if (logoImg) {
      drawLogoOnCanvas(cvs, vid, logoImg, position, scale, opacity, customX, customY);
    } else {
      // Chỉ vẽ frame video nếu chưa có logo
      const ctx = cvs.getContext('2d');
      if (!ctx) return;
      cvs.width  = vid.videoWidth  || 640;
      cvs.height = vid.videoHeight || 360;
      ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);
    }
  }, [logoImg, position, scale, opacity, customX, customY, videoReady]);

  useEffect(() => { redraw(); }, [redraw]);

  const handleVideoLoaded = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setVideoError('');
    if (seekFallbackTimerRef.current) {
      clearTimeout(seekFallbackTimerRef.current);
      seekFallbackTimerRef.current = null;
    }

    const duration = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
    const targetTime = duration > 0 ? Math.min(0.5, Math.max(0.05, duration * 0.15)) : 0.1;

    if (Math.abs(vid.currentTime - targetTime) < 0.01) {
      setVideoReady(true);
      return;
    }

    try {
      vid.currentTime = targetTime;
    } catch {
      if (vid.readyState >= 2 && vid.videoWidth > 0) setVideoReady(true);
      return;
    }

    // Fallback nếu codec/stream không bắn onSeeked nhưng frame hiện tại đã decode
    seekFallbackTimerRef.current = setTimeout(() => {
      seekFallbackTimerRef.current = null;
      const cur = videoRef.current;
      if (cur && cur.readyState >= 2 && cur.videoWidth > 0) {
        setVideoReady(true);
      }
    }, 500);
  }, []);

  const handleVideoSeeked = useCallback(() => {
    if (seekFallbackTimerRef.current) {
      clearTimeout(seekFallbackTimerRef.current);
      seekFallbackTimerRef.current = null;
    }
    setVideoReady(true);
  }, []);

  const handleVideoError = useCallback(async () => {
    if (seekFallbackTimerRef.current) {
      clearTimeout(seekFallbackTimerRef.current);
      seekFallbackTimerRef.current = null;
    }
    if (!triedBlobFallbackRef.current && resolvedBaseUrl) {
      triedBlobFallbackRef.current = true;
      try {
        const res = await fetch(resolvedBaseUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        revokeFallbackBlob();
        const blobUrl = URL.createObjectURL(blob);
        fallbackBlobUrlRef.current = blobUrl;
        setVideoSrc(blobUrl);
        return;
      } catch (err) {
        console.warn('[LogoWatermarkPanel] Blob fallback failed:', err);
      }
    }
    setVideoError('Không thể tải frame xem trước. Bạn vẫn có thể chọn logo và bấm Đóng dấu & Lưu.');
  }, [resolvedBaseUrl, revokeFallbackBlob]);

  useEffect(() => {
    const vid = videoRef.current;
    if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && !videoReady) {
      handleVideoLoaded();
    }
  }, [videoSrc, videoReady, handleVideoLoaded]);

  const handleApply = async () => {
    if (!logoFile || !finalVideoUrl) return;
    const videoFilename = extractMktFlowFilename(finalVideoUrl);
    setStatus('processing');
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('logo', logoFile);
      fd.append('videoFilename', videoFilename);
      fd.append('position', position);
      fd.append('scale', (scale / 100).toFixed(2));
      fd.append('opacity', (opacity / 100).toFixed(2));
      
      // Tính toán kích thước tuyệt đối truyền xuống backend
      const vid = videoRef.current;
      if (vid && logoImg) {
        const W = vid.videoWidth || 640;
        const logoW = Math.round(W * (scale / 100));
        const aspect = logoImg.naturalHeight / logoImg.naturalWidth;
        const logoH = Math.round(logoW * aspect);
        fd.append('logoW', logoW);
        fd.append('logoH', logoH);
      }

      if (position === 'custom') {
        fd.append('customX', customX);
        fd.append('customY', customY);
      }
      const res  = await fetch('/api/video/add-logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Lỗi không xác định.');
      setStatus('success');
      setTimeout(() => onLogoApplied(data.url), 1400);
    } catch (err) {
      console.error('[LogoWatermarkPanel]', err);
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  const labelSm = {
    fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '0.4rem', display: 'block',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(3,7,18,0.6)', backdropFilter: 'blur(6px)' }}
      />

      {/* Centered wide modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        style={{
          position: 'relative',
          width: '90vw',
          maxWidth: '940px',
          maxHeight: '90vh',
          backgroundColor: '#0a0f1e',
          borderRadius: '18px',
          border: '1px solid rgba(139,92,246,0.25)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '0.9rem 1.25rem', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
            }}>
              <Stamp size={16} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white', margin: 0 }}>Chèn Logo vào Video</h3>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-sub)', margin: 0 }}>Xem trước thời gian thực · Đóng dấu thương hiệu trước khi tải về</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={17} />
          </button>
        </div>

        {/* ── 2-Column Body ── */}
        <div style={{
          display: 'flex', flexDirection: 'row', flexGrow: 1, overflow: 'hidden',
          minHeight: 0,
        }}>

          {/* LEFT: Canvas Preview */}
          <div style={{
            flex: '0 0 52%',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            backgroundColor: '#050913',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            gap: '0.5rem',
            position: 'relative',
            minHeight: 0,
          }}>
            {/* Hidden video element để lấy frame */}
            <video
              key={videoSrc || 'empty'}
              ref={videoRef}
              src={videoSrc || undefined}
              style={{ display: 'none' }}
              preload="auto"
              onLoadedData={handleVideoLoaded}
              onCanPlay={() => {
                const vid = videoRef.current;
                if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && !videoReady && !seekFallbackTimerRef.current) {
                  handleVideoLoaded();
                }
              }}
              onSeeked={handleVideoSeeked}
              onError={handleVideoError}
            />

            {/* Canvas hiển thị preview */}
            <canvas
              ref={canvasRef}
              onClick={(e) => {
                if (position !== 'custom' || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const pctX = Math.round(Math.max(0, Math.min(100, (clickX / rect.width) * 100)));
                const pctY = Math.round(Math.max(0, Math.min(100, (clickY / rect.height) * 100)));
                setCustomX(pctX);
                setCustomY(pctY);
              }}
              title={position === 'custom' ? 'Click lên khung video để đặt vị trí logo' : undefined}
              style={{
                width: '100%',
                height: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '6px',
                backgroundColor: '#000',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                display: videoReady ? 'block' : 'none',
                cursor: position === 'custom' ? 'crosshair' : 'default',
              }}
            />

            {/* Placeholder khi chưa load video */}
            {!videoReady && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', color: 'var(--text-sub)', textAlign: 'center', maxWidth: '280px' }}>
                {videoError ? (
                  <>
                    <AlertCircle size={32} style={{ color: '#f87171', opacity: 0.9 }} />
                    <span style={{ fontSize: '0.75rem', color: '#fca5a5', lineHeight: 1.4 }}>{videoError}</span>
                    <button
                      type="button"
                      onClick={() => {
                        triedBlobFallbackRef.current = false;
                        setVideoError('');
                        setVideoReady(false);
                        setVideoSrc(resolvedBaseUrl ? `${resolvedBaseUrl}${resolvedBaseUrl.includes('?') ? '&' : '?'}retry=${Date.now()}` : '');
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      Thử tải lại frame
                    </button>
                  </>
                ) : (
                  <>
                    <Video size={40} style={{ opacity: 0.2 }} />
                    <span style={{ fontSize: '0.75rem' }}>Đang tải frame video...</span>
                  </>
                )}
              </div>
            )}

            {/* Label */}
            <div style={{
              position: 'absolute', top: '20px', left: '20px',
              fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)',
              backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: '4px',
              padding: '0.12rem 0.4rem', letterSpacing: '0.06em',
            }}>
              {logoImg ? 'XEM TRƯỚC VỚI LOGO' : 'XEM TRƯỚC'}
            </div>
          </div>

          {/* RIGHT: Controls */}
          <div style={{
            flex: '0 0 48%',
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex', flexDirection: 'column', gap: '0.9rem',
          }}>

            {/* ── Logo Library (shared with BulkWatermark) ── */}
            {savedLogos.length > 0 && (
              <div>
                <label style={labelSm}>Thư Viện Logo Đã Lưu</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {savedLogos.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectSavedLogo(item)}
                      style={{
                        position: 'relative',
                        width: '54px', height: '54px',
                        borderRadius: '8px',
                        border: `2px solid ${logoFile?.name === item.name ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'border-color 0.15s ease',
                        background: 'repeating-conic-gradient(#1a1f35 0% 25%, #0d1022 0% 50%) 0 0/10px 10px',
                      }}
                      title={item.name}
                    >
                      <img src={item.data} alt={item.name} style={{ maxWidth: '46px', maxHeight: '46px', objectFit: 'contain' }} />
                      {logoFile?.name === item.name && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          border: '2px solid #6366f1', borderRadius: '6px',
                          backgroundColor: 'rgba(99,102,241,0.15)',
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '2px'
                        }}>
                          <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#a5b4fc', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: '3px', padding: '1px 3px' }}>✓</span>
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDeleteSavedLogo(item.id, e)}
                        style={{
                          position: 'absolute', top: '2px', right: '2px',
                          width: '16px', height: '16px',
                          background: 'rgba(239,68,68,0.85)',
                          border: 'none', borderRadius: '50%',
                          color: 'white', fontSize: '0.65rem',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: 1, padding: 0,
                        }}
                        title="Xóa logo khỏi thư viện"
                      >×</button>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-sub)', marginTop: '0.35rem' }}>Click chọn · Dùng chung với Đóng Dấu Ảnh</p>
              </div>
            )}

            {/* Logo Upload */}
            <div>
              <label style={labelSm}>Tải Ảnh Logo Mới</label>
              <div {...getRootProps()} style={{
                border: `2px dashed ${isDragActive ? '#818cf8' : logoFile ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '10px', padding: '0.7rem', cursor: 'pointer',
                backgroundColor: isDragActive ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease',
                display: 'flex', flexDirection: logoFile ? 'row' : 'column',
                alignItems: 'center', justifyContent: 'center', gap: '0.65rem', minHeight: '68px',
              }}>
                <input {...getInputProps()} />
                {logoFile ? (
                  <>
                    {logoImg && (
                      <img src={logoImg.src} alt="logo"
                        style={{ maxHeight: '44px', maxWidth: '80px', objectFit: 'contain', borderRadius: '5px', background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0/10px 10px' }}
                      />
                    )}
                    <div>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'white', margin: '0 0 0.1rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logoFile.name}</p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-sub)', margin: 0 }}>{(logoFile.size / 1024).toFixed(0)} KB · Kéo để thay</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ImageIcon size={16} color="#818cf8" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', margin: '0 0 0.15rem' }}>{isDragActive ? 'Thả vào đây...' : 'Kéo thả hoặc bấm chọn logo'}</p>
                      <p style={{ fontSize: '0.62rem', color: 'var(--text-sub)', margin: 0 }}>PNG (nền trong) · JPG · WebP · Max 5MB</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Remove Logo Button (Hiển thị nếu video đã có logo) */}
            {finalVideoUrl && (finalVideoUrl.includes('_logo.mp4') || finalVideoUrl.includes('logo=true')) && (
              <button
                onClick={() => onLogoRemoved && onLogoRemoved()}
                style={{
                  width: '100%',
                  marginTop: '0.2rem',
                  padding: '0.65rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
              >
                Xóa Logo
              </button>
            )}

            {/* Position Grid */}
            <div>
              <label style={labelSm}>Vị trí của Logo</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
                {POSITIONS.map(pos => (
                  <button key={pos.id} type="button" onClick={() => setPosition(pos.id)}
                    style={{
                      padding: '0.42rem 0.2rem', fontSize: '0.73rem', borderRadius: '7px',
                      border: position === pos.id ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: position === pos.id ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                      color: position === pos.id ? 'white' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.13s ease',
                      fontWeight: position === pos.id ? 700 : 400,
                      gridColumn: pos.id === 'custom' ? 'span 3' : 'span 1',
                    }}
                  >{pos.name}</button>
                ))}
              </div>
            </div>

            {/* Custom X/Y */}
            <AnimatePresence>
              {position === 'custom' && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c7d2fe', letterSpacing: '0.03em' }}>
                      ĐIỀU CHỈNH TỌA ĐỘ LOGO
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-sub)' }}>
                      Click lên video hoặc kéo thanh
                    </span>
                  </div>

                  {/* Tọa độ X (Ngang) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Tọa độ X (Ngang)
                      </span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, color: '#818cf8',
                        background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '5px'
                      }}>
                        {customX}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={customX}
                      onChange={e => setCustomX(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer', height: '6px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-sub)' }}>
                      <span>Mép trái (0%)</span>
                      <span>Chính giữa (50%)</span>
                      <span>Mép phải (100%)</span>
                    </div>
                  </div>

                  {/* Tọa độ Y (Dọc) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Tọa độ Y (Dọc)
                      </span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, color: '#818cf8',
                        background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '5px'
                      }}>
                        {customY}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={customY}
                      onChange={e => setCustomY(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer', height: '6px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-sub)' }}>
                      <span>Mép trên (0%)</span>
                      <span>Chính giữa (50%)</span>
                      <span>Mép dưới (100%)</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scale */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                <label style={{ ...labelSm, margin: 0 }}>Kích thước: {scale}%</label>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-sub)' }}>so với chiều rộng video</span>
              </div>
              <input type="range" min={5} max={80} step={1} value={scale}
                onChange={e => setScale(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.59rem', color: 'var(--text-sub)', marginTop: '0.15rem' }}>
                <span>5%</span><span>80%</span>
              </div>
            </div>

            {/* Opacity */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                <label style={{ ...labelSm, margin: 0 }}>Độ trong suốt: {opacity}%</label>
              </div>
              <input type="range" min={10} max={100} step={5} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.59rem', color: 'var(--text-sub)', marginTop: '0.15rem' }}>
                <span>10% (gần trong)</span><span>100% (đục)</span>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {status === 'error' && errorMsg && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.6rem 0.8rem', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.75rem' }}
                >
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Spacer */}
            <div style={{ flexGrow: 1 }} />

            {/* CTA Button */}
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div key="s" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', padding: '0.78rem', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  <CheckCircle2 size={16} /> Logo đã được chèn thành công!
                </motion.div>
              ) : (
                <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={handleApply}
                  disabled={!logoFile || status === 'processing'}
                  style={{
                    width: '100%', padding: '0.82rem', borderRadius: '10px', border: 'none',
                    cursor: !logoFile || status === 'processing' ? 'not-allowed' : 'pointer',
                    background: !logoFile ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: !logoFile ? 'var(--text-sub)' : 'white',
                    fontSize: '0.87rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                    opacity: status === 'processing' ? 0.8 : 1,
                    boxShadow: logoFile ? '0 4px 18px rgba(99,102,241,0.35)' : 'none',
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {status === 'processing'
                    ? <><Loader2 size={15} className="spinner" /> Đang xử lý ffmpeg...</>
                    : <><Stamp size={15} />{logoFile ? `Đóng dấu & Lưu — ${POSITIONS.find(p => p.id === position)?.name}` : 'Chọn ảnh logo trước'}</>
                  }
                </motion.button>
              )}
            </AnimatePresence>

            {status === 'processing' && (
              <p style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-sub)', margin: '-0.3rem 0 0' }}>
                Đang render video — thường mất 5–30 giây tùy độ dài video
              </p>
            )}
          </div>
        </div>
      </motion.div>
      </div>
  );
}
