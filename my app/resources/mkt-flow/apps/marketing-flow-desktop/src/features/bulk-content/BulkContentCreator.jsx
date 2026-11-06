import React, { useState, useRef, useEffect } from 'react';
import { getInitialModel, getAIApiConfig, getGeminiModels } from '../../utils.js';
import ModelSelector from '../../shared/components/ModelSelector.jsx';

// ─── Constants ────────────────────────────────────────────────
const PLATFORMS = ['Facebook', 'TikTok', 'Instagram', 'Zalo', 'Google'];
const TONES = [
  'Thân thiện, gần gũi',
  'Chuyên nghiệp',
  'Hài hước, dí dỏm',
  'Cấp bách, thúc giục',
  'Kể chuyện (Storytelling)',
  'Bi thương, xúc động',
];
const MAX_TOTAL_MEDIA_SIZE = 32 * 1024 * 1024;

// getInitialModel & getAIApiConfig are imported from '../utils.js'

// ─── ContentCard ──────────────────────────────────────────────
function ContentCard({ content, index, onUpdate, selectedModel }) {
  const [copied, setCopied] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [viewMode, setViewMode] = useState('vietnamese');
  const [isEditing, setIsEditing] = useState(false);
  const [localBody, setLocalBody] = useState(content.body || '');
  const [tempBody, setTempBody] = useState(content.body || '');

  useEffect(() => {
    setLocalBody(content.body || '');
    setTempBody(content.body || '');
  }, [content.body]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTranslate = async (lang) => {
    if (lang === 'khmer' && content.khmerBody) { setViewMode(viewMode === 'khmer' ? 'vietnamese' : 'khmer'); return; }
    if (lang === 'lao' && content.laoBody) { setViewMode(viewMode === 'lao' ? 'vietnamese' : 'lao'); return; }
    setIsTranslating(true);
    const { provider, apiKey, model } = getAIApiConfig(selectedModel);
    try {
      const resp = await fetch('/api/bulk-content/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: localBody, lang, provider, apiKey, model }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.error);
      if (onUpdate) onUpdate({ ...content, [lang === 'khmer' ? 'khmerBody' : 'laoBody']: json.data.body, [lang === 'khmer' ? 'khmerScore' : 'laoScore']: json.data.score });
      setViewMode(lang);
    } catch (err) { alert('Lỗi dịch thuật: ' + err.message); }
    finally { setIsTranslating(false); }
  };

  const displayText = viewMode === 'khmer' ? (content.khmerBody || '') : viewMode === 'lao' ? (content.laoBody || '') : localBody;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', transition: 'border-color 0.2s', boxShadow: 'var(--shadow-md)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
    >
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: '11px', fontWeight: 700 }}>{index + 1}</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isEditing ? 'Chế độ chỉnh sửa' : viewMode === 'khmer' ? '🇰🇭 Bản dịch Khmer' : viewMode === 'lao' ? '🇱🇦 Bản dịch Lào' : '🇻🇳 Tiếng Việt'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} style={btnStyle('ghost')}>Hủy</button>
              <button onClick={() => { setLocalBody(tempBody); setIsEditing(false); if (onUpdate) onUpdate({ ...content, body: tempBody, khmerBody: undefined, laoBody: undefined }); }} style={btnStyle('success')}>Lưu</button>
            </>
          ) : (
            <>
              {viewMode === 'khmer' && content.khmerScore && <span style={qualityBadge(content.khmerScore)}>Chất lượng: {content.khmerScore}/10</span>}
              {viewMode === 'lao' && content.laoScore && <span style={qualityBadge(content.laoScore)}>Chất lượng: {content.laoScore}/10</span>}
              <button onClick={() => { setTempBody(localBody); setIsEditing(true); setViewMode('vietnamese'); }} style={btnStyle('outline')}>✏️ Sửa</button>
              <button onClick={() => handleTranslate('khmer')} disabled={isTranslating} style={btnStyle(viewMode === 'khmer' ? 'amber' : 'outline')}>{isTranslating ? '⏳' : viewMode === 'khmer' ? '↩ Gốc' : '🇰🇭 Khmer'}</button>
              <button onClick={() => handleTranslate('lao')} disabled={isTranslating} style={btnStyle(viewMode === 'lao' ? 'emerald' : 'outline')}>{isTranslating ? '⏳' : viewMode === 'lao' ? '↩ Gốc' : '🇱🇦 Lào'}</button>
              <button onClick={() => handleCopy(displayText)} style={btnStyle(copied ? 'copied' : 'primary')}>{copied ? '✅ Đã copy' : '📋 Copy'}</button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        <div style={{ border: `1px solid ${isEditing ? 'rgba(99,102,241,0.5)' : 'var(--border-color)'}`, borderRadius: '12px', overflow: 'hidden', boxShadow: isEditing ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none', transition: 'all 0.2s' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.015)' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px' }}>AI</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>Marketing Expert ✓</div>
              <div style={{ fontSize: '10px', color: 'var(--text-sub)' }}>Được tài trợ · 🌐</div>
            </div>
          </div>
          <div style={{ padding: '14px 16px', background: viewMode !== 'vietnamese' ? 'rgba(245,158,11,0.02)' : 'transparent' }}>
            {isEditing ? (
              <textarea value={tempBody} onChange={e => setTempBody(e.target.value)} autoFocus style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', minHeight: '180px', fontSize: '13px', lineHeight: '1.7', color: 'var(--text-main)', fontFamily: 'inherit', whiteSpace: 'pre-wrap', boxSizing: 'border-box' }} />
            ) : (
              <div style={{ fontSize: '13px', lineHeight: viewMode !== 'vietnamese' ? '1.9' : '1.7', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{displayText}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(variant) {
  const base = { padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s' };
  const variants = {
    ghost: { ...base, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' },
    success: { ...base, background: '#16a34a', color: '#fff' },
    outline: { ...base, background: 'rgba(99,102,241,0.08)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' },
    primary: { ...base, background: 'var(--accent-primary)', color: '#fff', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' },
    copied: { ...base, background: '#16a34a', color: '#fff' },
    amber: { ...base, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' },
    emerald: { ...base, background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' },
  };
  return variants[variant] || variants.ghost;
}

function qualityBadge(score) {
  return { fontSize: '10px', fontWeight: 700, padding: '3px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: score >= 8 ? '#34d399' : '#fbbf24' };
}

// ─── InputPanel ───────────────────────────────────────────────
function InputPanel({ input, onChange, onGenerate, isLoading, selectedModel, setSelectedModel, hasApiKey }) {
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [geminiModels, setGeminiModels] = useState(() => getGeminiModels());

  useEffect(() => {
    const handleUpdate = () => {
      setGeminiModels(getGeminiModels());
    };
    window.addEventListener('gemini_models_updated', handleUpdate);
    return () => window.removeEventListener('gemini_models_updated', handleUpdate);
  }, []);

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files) return;
    setFileError(null);
    const currentMedia = [...input.media];
    Array.from(files).forEach((file) => {
      const currentBytes = currentMedia.reduce((total, media) => total + (media.size || 0), 0);
      if (currentBytes + file.size > MAX_TOTAL_MEDIA_SIZE) {
        setFileError('Tổng dung lượng media vượt 32MB. Hãy giảm số lượng hoặc kích thước file.');
        return;
      }
      const reader = new FileReader();
      reader.onloadstart = () => setIsProcessing(true);
      reader.onloadend = () => {
        currentMedia.push({ data: reader.result, mimeType: file.type || 'image/jpeg', size: file.size, name: file.name });
        onChange('media', [...currentMedia]);
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const labelStyle = { fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '5px' };
  const inputStyle = { fontFamily: 'var(--font-sans)', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '9px 12px', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' };

  const focusProps = {
    onFocus: e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; },
    onBlur: e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; },
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: 'var(--shadow-md)' }}>
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Thông tin chiến dịch</h2>
        <p style={{ fontSize: '11px', color: 'var(--text-sub)', margin: '3px 0 0' }}>AI tự động nhận diện sản phẩm từ mô tả và media.</p>
      </div>

      {/* Model AI selection */}
      <ModelSelector
        value={selectedModel}
        onChange={(val) => setSelectedModel(val)}
        storageKey="model_bulk_content"
        geminiModels={geminiModels}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Tên sản phẩm *</label>
          <input type="text" placeholder="VD: Mỹ phẩm trị nám" value={input.product_name} onChange={e => onChange('product_name', e.target.value)} style={inputStyle} {...focusProps} />
        </div>
        <div>
          <label style={labelStyle}>Đối tượng khách hàng</label>
          <input type="text" placeholder="VD: Mẹ bỉm tại Campuchia" value={input.target_customer} onChange={e => onChange('target_customer', e.target.value)} style={inputStyle} {...focusProps} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Mô tả & USP sản phẩm *</label>
          <textarea placeholder="Nhập các đặc điểm nổi bật nhất giúp sản phẩm ra đơn..." value={input.product_description} onChange={e => onChange('product_description', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} {...focusProps} />
        </div>

        {/* Media upload */}
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Hình ảnh / Media minh họa</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {input.media.map((item, idx) => (
              <div key={idx} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}
                onMouseEnter={e => e.currentTarget.querySelector('.del-btn').style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.querySelector('.del-btn').style.opacity = '0'}
              >
                {item.mimeType.startsWith('video/') ? (
                  <video src={item.data} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                ) : (
                  <img src={item.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <button className="del-btn" onClick={() => onChange('media', input.media.filter((_, i) => i !== idx))}
                  style={{ position: 'absolute', top: '2px', right: '2px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', opacity: 0, transition: 'opacity 0.15s' }}>×</button>
              </div>
            ))}
            <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}
              style={{ width: '72px', height: '72px', borderRadius: '8px', border: '2px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', color: 'var(--text-sub)', gap: '4px', transition: 'all 0.2s', opacity: isProcessing ? 0.5 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = '#a5b4fc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-sub)'; }}
            >
              {isProcessing ? <><span style={{ animation: 'cl-spin 1s linear infinite', display: 'inline-block' }}>⟳</span><span style={{ fontSize: '8px' }}>Đang xử lý</span></> : <><span style={{ fontSize: '18px' }}>+</span><span style={{ fontSize: '9px', fontWeight: 600 }}>Media</span></>}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,video/mp4" style={{ display: 'none' }} />
          </div>
          {fileError && <div style={{ marginTop: '6px', fontSize: '11px', color: '#f87171', padding: '6px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.15)' }}>{fileError}</div>}
        </div>

        <div>
          <label style={labelStyle}>Tông giọng</label>
          <select value={input.tone} onChange={e => onChange('tone', e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
            {TONES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Nền tảng</label>
          <select value={input.platform} onChange={e => onChange('platform', e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Số lượng mẫu content (1–10)</label>
          <input type="number" min="1" max="10"
            value={isNaN(input.number_of_contents) ? '' : input.number_of_contents}
            onChange={e => onChange('number_of_contents', e.target.value === '' ? NaN : parseInt(e.target.value))}
            style={inputStyle} {...focusProps} />
        </div>
      </div>

      <button onClick={onGenerate} disabled={isLoading || !input.product_name || !input.product_description || isProcessing || !hasApiKey}
        className="btn btn-primary" style={{ width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700 }}>
        {isLoading ? <><span style={{ animation: 'cl-spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Đang sáng tạo...</> : '✨ Bắt Đầu Tạo Content Ra Đơn'}
      </button>
      <style>{`@keyframes cl-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

// ─── Main BulkContentCreator ─────────────────────────────────
export default function BulkContentCreator() {
  const [input, setInput] = useState({
    product_name: '', product_description: '', target_customer: '',
    platform: 'Facebook', tone: 'Thân thiện, gần gũi',
    number_of_contents: 3, media: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(() => getInitialModel('model_bulk_content'));
  const hasApiKey = true;

  const handleInputChange = (field, value) => setInput(prev => ({ ...prev, [field]: value }));

  const handleGenerate = async () => {
    setIsLoading(true); setError(null);
    const { provider, apiKey, model } = getAIApiConfig(selectedModel);
    try {
      const resp = await fetch('/api/bulk-content/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, provider, apiKey, model }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.error);
      setResults(json.data.contents || []);
      setTimeout(() => document.getElementById('bulk-results-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) { setError(err.message || 'Có lỗi xảy ra.'); }
    finally { setIsLoading(false); }
  };

  const handleTranslateAll = async (lang) => {
    if (!results.length) return;
    setIsTranslatingAll(true);
    const { provider, apiKey, model } = getAIApiConfig(selectedModel);
    const updated = await Promise.all(results.map(async (c) => {
      if (lang === 'khmer' && c.khmerBody) return c;
      if (lang === 'lao' && c.laoBody) return c;
      try {
        const resp = await fetch('/api/bulk-content/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: c.body, lang, provider, apiKey, model }) });
        const json = await resp.json();
        if (!json.success) return c;
        return { ...c, [lang === 'khmer' ? 'khmerBody' : 'laoBody']: json.data.body, [lang === 'khmer' ? 'khmerScore' : 'laoScore']: json.data.score };
      } catch { return c; }
    }));
    setResults(updated);
    setIsTranslatingAll(false);
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.5rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.4)', flexShrink: 0, fontSize: '20px' }}>✨</div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Tạo Content</h1>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, padding: '0.3rem 0.8rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc', letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI · Multimodal</span>
        </div>
      </div>

      {!hasApiKey && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div>
            <strong>Thiếu cấu hình API Key:</strong> Chuyển qua tab <strong>Cấu hình</strong> ở menu bên trái và nhập API Key cho model được chọn để sử dụng tính năng này.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left panel */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <InputPanel
            input={input}
            onChange={handleInputChange}
            onGenerate={handleGenerate}
            isLoading={isLoading}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            hasApiKey={hasApiKey}
          />
          {error && (
            <div className="alert alert-error" style={{ marginTop: '12px', fontSize: '13px' }}>
              <span>⚠️</span><span>{error}</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div id="bulk-results-section">
          {results.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Kết quả ({results.length} mẫu)</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => handleTranslateAll('khmer')} disabled={isTranslatingAll} style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: isTranslatingAll ? 'var(--text-sub)' : '#a5b4fc', padding: '4px 6px', borderRadius: '6px' }}>
                    {isTranslatingAll ? '⏳ Đang dịch...' : '🇰🇭 Dịch tất cả Khmer'}
                  </button>
                  <button onClick={() => handleTranslateAll('lao')} disabled={isTranslatingAll} style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: isTranslatingAll ? 'var(--text-sub)' : '#34d399', padding: '4px 6px', borderRadius: '6px' }}>
                    {isTranslatingAll ? '⏳ Đang dịch...' : '🇱🇦 Dịch tất cả Lào'}
                  </button>
                  <button onClick={() => setResults([])} style={{ fontSize: '12px', color: 'var(--text-sub)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 6px' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-sub)'}>
                    🗑 Xóa tất cả
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {results.map((content, idx) => (
                  <ContentCard key={idx} content={content} index={idx} selectedModel={selectedModel} onUpdate={(updated) => setResults(prev => { const n = [...prev]; n[idx] = updated; return n; })} />
                ))}
              </div>
            </>
          ) : !isLoading ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', marginBottom: '14px' }}>💡</div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px' }}>Chưa có nội dung nào</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-sub)', maxWidth: '280px', margin: 0, lineHeight: 1.6 }}>Nhập thông tin sản phẩm và tải ảnh/video minh họa bên trái để bắt đầu.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[...Array(isNaN(input.number_of_contents) ? 1 : input.number_of_contents)].map((_, i) => (
                <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', width: '25%', marginBottom: '12px', animation: 'sk-pulse 1.5s ease infinite' }} />
                  <div style={{ height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', width: '70%', marginBottom: '10px', animation: 'sk-pulse 1.5s ease infinite' }} />
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', width: '100%', marginBottom: '8px', animation: 'sk-pulse 1.5s ease infinite' }} />
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', width: '85%', animation: 'sk-pulse 1.5s ease infinite' }} />
                </div>
              ))}
              <style>{`@keyframes sk-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
