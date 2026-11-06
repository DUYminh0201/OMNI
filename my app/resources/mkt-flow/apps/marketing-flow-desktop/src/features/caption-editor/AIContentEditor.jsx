import React, { useState, useEffect } from 'react';
import { Sparkles, Clipboard, Check, AlertCircle, RefreshCw, Languages, Wand2 } from 'lucide-react';
import { getInitialModel, getAIApiConfig, getGeminiModels } from '../../utils.js';
import ModelSelector from '../../shared/components/ModelSelector.jsx';

const TEMPLATES = [
  {
    id: "viral_story",
    name: "🔥 Viral Kể chuyện (Storytelling)",
    text: "Trời ơi tin được không! Mình từng tốn hàng chục triệu mà không hiệu quả. Vậy mà từ khi dùng thử món này do bạn giới thiệu, mọi thứ đã thay đổi ngoạn mục! Ai đang gặp tình trạng giống mình thì thử ngay nhé, đảm bảo không hối hận đâu!"
  },
  {
    id: "seo_product",
    name: "📈 Chuẩn SEO (Giới thiệu sản phẩm)",
    text: "[Tên sản phẩm] - Giải pháp toàn diện từ thiên nhiên. Với ưu điểm vượt trội giúp giải quyết vấn đề hiệu quả và an toàn. [Tên sản phẩm] là lựa chọn hàng đầu cho khách hàng. Đặt mua chính hãng ngay hôm nay để nhận ưu đãi giảm giá 30% và miễn phí giao hàng toàn quốc!"
  },
  {
    id: "flash_sale",
    name: "⚡ Flash Sale (Chốt Sale Nhanh)",
    text: "🚨 DEAL SỐC CHỈ DUY NHẤT HÔM NAY 🚨\nGiảm ngay 50% cho 100 khách hàng đầu tiên đăng ký mua. \n🔥 Tặng kèm combo quà tặng siêu khủng.\n👉 Click ngay vào link để đặt hàng vì số lượng có hạn!"
  },
  {
    id: "feedback",
    name: "⭐ Feedback Khách Hàng (Tăng Uy Tín)",
    text: "Khách nhà em feedback khen nức nở luôn ạ! 'Từ lúc xài sản phẩm bên em, mọi thứ trộm vía quá tốt, ai cũng hỏi thăm. Điểm 10 cho chất lượng.' Cảm ơn khách hàng luôn tin tưởng. Đừng chần chừ nữa, inbox shop ngay để được tư vấn nhé!"
  }
];

const STYLES = [
  { id: "story", label: "Storytelling" },
  { id: "viral", label: "Tạo Viral" },
  { id: "seo", label: "Chuẩn SEO" },
  { id: "sale", label: "Tối ưu Bán hàng" }
];

const STYLE_FULL_LABELS = {
  "story": "Storytelling (Kể chuyện dẫn dắt, cảm xúc)",
  "viral": "Tạo độ Viral (Thu hút rầm rộ, Bắt trend)",
  "seo": "Chuẩn SEO (Tối ưu tìm kiếm, Rõ ràng)",
  "sale": "Tối ưu Bán Hàng (Thuyết phục, Kêu gọi hành động mạnh)"
};

const LENGTHS = [
  { id: "short", label: "Ngắn (3–5 câu)" },
  { id: "medium", label: "Vừa (5–10 câu)" },
  { id: "long", label: "Chi tiết (10+ câu)" }
];

const LENGTH_FULL_LABELS = {
  "short": "Ngắn gọn (3-5 câu)",
  "medium": "Vừa phải (5-10 câu)",
  "long": "Chi tiết (Hơn 10 câu, chia nhiều đoạn)"
};

export default function AIContentEditor() {
  const [khmerText, setKhmerText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [styleId, setStyleId] = useState('story');
  const [lengthId, setLengthId] = useState('medium');
  const [replicationMode, setReplicationMode] = useState(false);
  const [useFramework, setUseFramework] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState('PAS');
  const [selectedModel, setSelectedModel] = useState(() => getInitialModel('model_ai_content_editor'));
  const [geminiModels, setGeminiModels] = useState(() => getGeminiModels());

  useEffect(() => {
    const handleUpdate = () => {
      setGeminiModels(getGeminiModels());
    };
    window.addEventListener('gemini_models_updated', handleUpdate);
    return () => window.removeEventListener('gemini_models_updated', handleUpdate);
  }, []);
  const [replicationOption, setReplicationOption] = useState('option1');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  
  const [copiedVi, setCopiedVi] = useState(false);
  const [copiedKh, setCopiedKh] = useState(false);
  const hasApiKey = true;

  const handleTemplateChange = (e) => {
    const val = e.target.value;
    setSelectedTemplate(val);
    if (val) {
      const template = TEMPLATES.find(t => t.id === val);
      if (template) setKhmerText(template.text);
    } else {
      setKhmerText('');
    }
  };

  const handleTranslate = async () => {
    if (!khmerText.trim()) return;
    setIsLoading(true);
    setError('');
    setResult(null);

    const { provider, apiKey, model } = getAIApiConfig(selectedModel);

    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: khmerText,
          style: (replicationMode || useFramework) ? undefined : STYLE_FULL_LABELS[styleId],
          length: (replicationMode || useFramework) ? undefined : LENGTH_FULL_LABELS[lengthId],
          provider,
          apiKey,
          model,
          replicationMode,
          replicationOption,
          framework: (replicationMode || !useFramework) ? undefined : selectedFramework
        })
      });
      const data = await response.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        throw new Error(data.error || 'Biên tập nội dung thất bại. Vui lòng kiểm tra lại cấu hình API Key.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi hệ thống khi kết nối tới AI.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'vi') {
      setCopiedVi(true);
      setTimeout(() => setCopiedVi(false), 2000);
    } else {
      setCopiedKh(true);
      setTimeout(() => setCopiedKh(false), 2000);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* Page Header */}
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.55rem' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(139,92,246,0.4)', flexShrink: 0
          }}>
            <Languages size={22} color="white" />
          </div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>BIÊN TẬP CAPTION</h1>
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
            padding: '0.3rem 0.8rem', borderRadius: '999px',
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
            color: '#c4b5fd', letterSpacing: '0.05em', textTransform: 'uppercase'
          }}>ContentBridge AI</span>
        </div>
        <p className="header-desc">Viết lại và dịch sang tiếng Khmer tự động với các phong cách đa dạng — chuẩn viral, SEO, storytelling và chốt sale.</p>
      </div>

      {!hasApiKey && (
        <div className="alert alert-error">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Thiếu cấu hình API Key:</strong> Chuyển qua tab <strong>Cấu hình</strong> ở menu bên trái và nhập API Key cho model đã chọn để sử dụng tính năng này.
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid-2" style={{ gridTemplateColumns: '330px 1fr', alignItems: 'start' }}>
        
        {/* Left – Config */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', padding: '1.5rem', overflow: 'visible' }}>
          {/* Model AI Selection */}
          <ModelSelector
            value={selectedModel}
            onChange={(val) => setSelectedModel(val)}
            storageKey="model_ai_content_editor"
            geminiModels={geminiModels}
          />

          {/* Template */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">NỘI DUNG GỐC / CHỌN MẪU</label>
            <select
              value={selectedTemplate}
              onChange={handleTemplateChange}
              className="input-control"
              style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
            >
              <option value="">-- Hoặc chọn mẫu có sẵn --</option>
              {TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Input Text */}
          <div className="form-group" style={{ margin: 0 }}>
            <textarea
              className="input-control"
              placeholder="Nhập hoặc dán văn bản mẫu tiếng Việt vào đây..."
              value={khmerText}
              onChange={(e) => setKhmerText(e.target.value)}
              style={{ minHeight: '200px', fontSize: '0.85rem', lineHeight: 1.6, resize: 'vertical', backgroundColor: 'rgba(0,0,0,0.25)' }}
              disabled={isLoading}
            />
          </div>

          {/* Toggle for Replication Mode */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '4px', marginBottom: '4px' }}>
            <span className="form-label" style={{ margin: 0, userSelect: 'none' }}>
              BÓC TÁCH VÀ NHÂN BẢN CAPTION
            </span>
            <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={replicationMode} 
                onChange={(e) => setReplicationMode(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
              />
              <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: replicationMode ? 'var(--accent-primary, #8b5cf6)' : 'rgba(255,255,255,0.08)',
                border: replicationMode ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.12)',
                transition: 'all 0.2s ease', borderRadius: '20px',
                boxShadow: replicationMode ? '0 0 8px rgba(139,92,246,0.4)' : 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '0 3px'
              }}>
                <span style={{
                  height: '12px', width: '12px', 
                  backgroundColor: '#ffffff', 
                  borderRadius: '50%',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  transform: replicationMode ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }} />
              </span>
            </label>
          </div>

          {/* Toggle for Framework Selector */}
          {!replicationMode && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '4px', marginBottom: '4px' }}>
              <span className="form-label" style={{ margin: 0, userSelect: 'none' }}>
                KHUNG VIẾT QUẢNG CÁO
              </span>
              <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer', margin: 0 }}>
                <input 
                  type="checkbox" 
                  checked={useFramework} 
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseFramework(checked);
                    if (checked && (selectedFramework === 'none' || !selectedFramework)) {
                      setSelectedFramework('PAS');
                    }
                  }}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: useFramework ? 'var(--accent-primary, #8b5cf6)' : 'rgba(255,255,255,0.08)',
                  border: useFramework ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.12)',
                  transition: 'all 0.2s ease', borderRadius: '20px',
                  boxShadow: useFramework ? '0 0 8px rgba(139,92,246,0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 3px'
                }}>
                  <span style={{
                    height: '12px', width: '12px', 
                    backgroundColor: '#ffffff', 
                    borderRadius: '50%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    transform: useFramework ? 'translateX(16px)' : 'translateX(0)',
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </span>
              </label>
            </div>
          )}

          {/* Framework Selector Dropdown */}
          {!replicationMode && useFramework && (
            <div className="form-group" style={{ margin: 0 }}>
              <select
                value={selectedFramework}
                onChange={(e) => setSelectedFramework(e.target.value)}
                className="input-control"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
              >
                <option value="PAS">PAS (Problem - Agitate - Solve)</option>
                <option value="AIDA">AIDA (Attention - Interest - Desire - Action)</option>
                <option value="SSS">SSS (Star - Story - Solution)</option>
              </select>
            </div>
          )}


          {/* Style Dropdown */}
          {!replicationMode && !useFramework && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">PHONG CÁCH VIẾT</label>
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                className="input-control"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
              >
                {STYLES.map(s => (
                  <option key={s.id} value={s.id}>{STYLE_FULL_LABELS[s.id] || s.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Length Dropdown */}
          {!replicationMode && !useFramework && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">ĐỘ DÀI NỘI DUNG</label>
              <select
                value={lengthId}
                onChange={(e) => setLengthId(e.target.value)}
                className="input-control"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
              >
                {LENGTHS.map(l => (
                  <option key={l.id} value={l.id}>{LENGTH_FULL_LABELS[l.id] || l.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={handleTranslate}
            disabled={isLoading || !khmerText.trim() || !hasApiKey}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.875rem', justifyContent: 'center', fontSize: '0.9rem', marginTop: '0.25rem' }}
          >
            {isLoading ? (
              <><RefreshCw size={16} className="spinner" /> Đang sáng tạo nội dung...</>
            ) : (
              <><Wand2 size={16} /> Chuyển Đổi &amp; Sáng Tạo</>
            )}
          </button>

          {error && (
            <div className="alert alert-error" style={{ fontSize: '0.8rem', padding: '0.6rem 0.875rem', margin: 0 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
        </div>

        {/* Right – Output */}
        {(() => {
          const activeResult = result ? (
            replicationMode && result.option1 ? result[replicationOption] : result
          ) : null;
          
          return (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '500px', padding: '1.5rem' }}>
              {/* Output header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={16} style={{ color: '#a78bfa' }} /> Kết Quả Song Ngữ
                </h3>
                {isLoading && (
                  <span className="api-status-badge" style={{ padding: '0.25rem 0.75rem', fontSize: '0.73rem', backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.25)', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <RefreshCw size={11} className="spinner" /> Đang xử lý...
                  </span>
                )}
                {result && !isLoading && (
                  <span style={{ padding: '0.25rem 0.75rem', fontSize: '0.73rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7', borderRadius: '999px', fontWeight: 700 }}>
                    ✓ Đã hoàn thành
                  </span>
                )}
              </div>

              {/* Win Factor Analysis */}
              {result && replicationMode && result.winFactor && (
                <div style={{
                  padding: '1.25rem',
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.18)',
                  borderRadius: '12px',
                  marginTop: '0.2rem',
                  marginBottom: '0.6rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem'
                }}>
                  <h4 style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: '#c4b5fd',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase'
                  }}>
                    🔑 Phân Tích Win Factor (Bài Gốc)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <strong style={{ color: '#a78bfa', display: 'block', marginBottom: '0.25rem' }}>🪝 Tiêu đề / Hook:</strong>
                      <span style={{ color: '#e2e8f0' }}>{result.winFactor.hook}</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <strong style={{ color: '#a78bfa', display: 'block', marginBottom: '0.25rem' }}>❤️ Cấu trúc cảm xúc:</strong>
                      <span style={{ color: '#e2e8f0' }}>{result.winFactor.emotionalStructure}</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <strong style={{ color: '#a78bfa', display: 'block', marginBottom: '0.25rem' }}>🛡️ Yếu tố tạo uy tín (Trust):</strong>
                      <span style={{ color: '#e2e8f0' }}>{result.winFactor.trustFactors}</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <strong style={{ color: '#a78bfa', display: 'block', marginBottom: '0.25rem' }}>🎯 Kêu gọi hành động (CTA):</strong>
                      <span style={{ color: '#e2e8f0' }}>{result.winFactor.cta}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Selector for Replication Options */}
              {result && replicationMode && result.option1 && (
                <div style={{
                  display: 'flex',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  alignSelf: 'flex-start',
                  marginTop: '0.2rem',
                  marginBottom: '0.2rem',
                  gap: '2px'
                }}>
                  {[
                    { id: 'option1', label: 'Tùy chọn 1 (Giữ phom - Đổi ruột)' },
                    { id: 'option2', label: 'Tùy chọn 2 (Đa dạng Hooks)' },
                    { id: 'option3', label: 'Tùy chọn 3 (Nâng cấp tối ưu)' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setReplicationOption(tab.id)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: replicationOption === tab.id ? 'var(--accent-primary, #8b5cf6)' : 'transparent',
                        color: replicationOption === tab.id ? '#ffffff' : 'var(--text-sub, #94a3b8)',
                        boxShadow: replicationOption === tab.id ? '0 2px 8px rgba(139,92,246,0.3)' : 'none'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Bilingual result columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', flexGrow: 1 }}>
                {/* Vietnamese */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: '#818cf8', fontWeight: 800 }}>VN</span> BẢN TIẾNG VIỆT
                    </span>
                    {activeResult && (
                      <button
                        onClick={() => handleCopyText(activeResult.vietnamese, 'vi')}
                        style={{ background: 'none', border: 'none', color: copiedVi ? 'var(--accent-success)' : 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}
                      >
                        {copiedVi ? <Check size={12} /> : <Clipboard size={12} />}
                        {copiedVi ? 'Đã chép' : 'Sao chép'}
                      </button>
                    )}
                  </div>
                  <div style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', fontSize: '0.875rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: '#f1f5f9', overflowY: 'auto', minHeight: '320px', maxHeight: '420px' }}>
                    {activeResult ? activeResult.vietnamese : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', fontSize: '0.8rem', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>🇻🇳</span>
                        Phiên bản Tiếng Việt sẽ hiển thị ở đây
                      </div>
                    )}
                  </div>
                </div>

                {/* Khmer */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: '#22d3ee', fontWeight: 800 }}>KH</span> BẢN TIẾNG KHMER
                    </span>
                    {activeResult && (
                      <button
                        onClick={() => handleCopyText(activeResult.khmer, 'kh')}
                        style={{ background: 'none', border: 'none', color: copiedKh ? 'var(--accent-success)' : 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}
                      >
                        {copiedKh ? <Check size={12} /> : <Clipboard size={12} />}
                        {copiedKh ? 'Đã chép' : 'Sao chép'}
                      </button>
                    )}
                  </div>
                  <div style={{ flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', fontSize: '0.875rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#f1f5f9', overflowY: 'auto', minHeight: '320px', maxHeight: '420px', fontFamily: 'serif' }}>
                    {activeResult ? activeResult.khmer : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', fontSize: '0.8rem', flexDirection: 'column', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>🇰🇭</span>
                        Phiên bản Tiếng Khmer sẽ hiển thị ở đây
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.76rem', color: 'var(--text-sub)' }}>
                💡 Mẹo: Chọn mẫu có sẵn ở bên trái để kiểm thử nhanh — AI sẽ viết lại theo phong cách bạn chọn.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
