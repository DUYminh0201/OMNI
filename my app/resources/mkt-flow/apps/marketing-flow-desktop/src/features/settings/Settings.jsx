import React, { useCallback, useState, useEffect } from 'react';
import { Save, Key, Shield, Info, Eye, EyeOff, Trash2, Settings as SettingsIcon, Plus, ExternalLink, RefreshCw } from 'lucide-react';
import { getGeminiModels } from '../../utils.js';

// ── Shared KeyManager component ────────────────────────────────────────
function KeyManager({ providerId, title, icon, placeholder, link, linkLabel }) {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data[providerId] || []);
      }
    } catch(e) { console.error(e); }
  }, [providerId]);

  useEffect(() => {
    fetchKeys();
    const interval = setInterval(fetchKeys, 5000); // Poll status every 5s
    return () => clearInterval(interval);
  }, [fetchKeys]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchKeys();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleAdd = async () => {
    const trimmed = newKey.trim();
    if (!trimmed) { alert('Vui lòng nhập API Key!'); return; }
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: trimmed })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Lỗi khi thêm key');
      } else {
        setNewKey('');
        fetchKeys();
        window.dispatchEvent(new Event('keys_updated'));
      }
    } catch(e) {
      alert('Lỗi kết nối server');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/keys/${providerId}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchKeys();
        window.dispatchEvent(new Event('keys_updated'));
      }
    } catch(e) {
      alert('Lỗi kết nối server');
    }
  };

  const getStatusDisplay = (status) => {
    if (status === 'ACTIVE') return <span title="Hoạt động tốt">🟢</span>;
    if (status === 'LIMITED_RPM') return <span title="Khóa tạm thời (Rate Limit Phút)">🟡</span>;
    if (status === 'LIMITED_RPD') return <span title="Khóa tạm thời (Hết hạn mức ngày)">🔴</span>;
    if (status === 'BLOCKED') return <span title="Lỗi khóa vô hiệu hóa">❌</span>;
    return <span>❓</span>;
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.01)',
      border: '1px solid var(--border-color)',
      borderRadius: '14px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }}>
      <h3 style={{
        fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', margin: 0,
        display: 'flex', alignItems: 'center', gap: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px'
      }}>
        <span>{icon}</span> {title}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" style={{
            marginLeft: 'auto', fontSize: '10px', color: '#818cf8', display: 'flex',
            alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 500
          }}>
            {linkLabel} <ExternalLink size={10} />
          </a>
        )}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
        {/* Left: Add form */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '12px',
          background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
          padding: '14px', border: '1px solid rgba(255,255,255,0.04)'
        }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#818cf8', margin: 0 }}>Thêm API Key</h4>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Key size={13} style={{ position: 'absolute', left: '10px', color: 'var(--text-sub)', flexShrink: 0 }} />
            <input
              type={showNew ? 'text' : 'password'}
              className="input-control"
              style={{ width: '100%', paddingLeft: '30px', paddingRight: '36px', fontSize: '12px', height: '38px' }}
              placeholder={placeholder}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer' }}
            >
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: '9px', fontSize: '12px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
          >
            <Plus size={14} /> Thêm Key
          </button>
        </div>

        {/* Right: Stored keys list */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '8px',
          background: 'rgba(0,0,0,0.15)', borderRadius: '10px',
          padding: '14px', border: '1px solid rgba(255,255,255,0.04)',
          minHeight: '120px'
        }}>
          <h4 style={{
            fontSize: '12px', fontWeight: 600, color: '#10b981', margin: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Danh Sách Keys (Backend)</span>
              <button 
                type="button" 
                onClick={handleRefresh} 
                style={{ 
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', 
                  color: 'var(--text-main)', display: 'flex', padding: '3px', borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                title="Làm mới trạng thái key"
              >
                <RefreshCw size={12} className={isRefreshing ? "spinner" : ""} />
              </button>
            </div>
            <span style={{ color: 'var(--text-sub)', fontWeight: 400 }}>({keys.length} key{keys.length !== 1 ? 's' : ''})</span>
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto', maxHeight: '160px' }}>
            {keys.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', flex: 1, minHeight: '80px',
                color: 'var(--text-sub)', gap: '6px'
              }}>
                <span style={{ fontSize: '20px' }}>🔑</span>
                <span style={{ fontSize: '11px', textAlign: 'center' }}>Chưa có key nào</span>
              </div>
            ) : (
              keys.map((item) => (
                <div key={item.id} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '7px', padding: '8px 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                    {getStatusDisplay(item.status)}
                    <span style={{
                      fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }} title={item.display_key}>
                      {item.display_key || '••••'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    style={{
                      background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: '5px',
                      width: '24px', height: '24px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#ef4444', cursor: 'pointer', flexShrink: 0
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ModelToggleManager component ─────────────────────────────────────────
function ModelToggleManager() {
  const [disabledModels, setDisabledModels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('disabled_models') || '[]');
    } catch {
      return [];
    }
  });
  const [keysByProvider, setKeysByProvider] = useState({ gemini: [], openai: [], nvidia: [] });

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeysByProvider({
          gemini: data.gemini || [],
          openai: data.openai || [],
          nvidia: data.nvidia || [],
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    window.addEventListener('keys_updated', fetchKeys);
    return () => window.removeEventListener('keys_updated', fetchKeys);
  }, [fetchKeys]);

  // Listen to cross-component toggle updates
  useEffect(() => {
    const handleUpdate = () => {
      try {
        setDisabledModels(JSON.parse(localStorage.getItem('disabled_models') || '[]'));
      } catch {
        setDisabledModels([]);
      }
    };
    window.addEventListener('model_toggles_updated', handleUpdate);
    return () => window.removeEventListener('model_toggles_updated', handleUpdate);
  }, []);

  const toggleModel = (modelValue) => {
    setDisabledModels(prev => {
      let updated;
      if (prev.includes(modelValue)) {
        updated = prev.filter(m => m !== modelValue);
      } else {
        updated = [...prev, modelValue];
      }
      localStorage.setItem('disabled_models', JSON.stringify(updated));
      window.dispatchEvent(new Event('model_toggles_updated'));
      return updated;
    });
  };

  const getToggleState = (modelValue) => !disabledModels.includes(modelValue);

  const hasValidKeys = (providerId) => {
    const list = keysByProvider[providerId] || [];
    return list.some(k => k.status !== 'BLOCKED');
  };

  // Group models by provider
  const providers = [
    {
      id: 'gemini',
      label: 'Google Gemini',
      color: '#4285F4',
      models: getGeminiModels().map(m => ({ value: m.value, label: m.label }))
    },
    {
      id: 'openai',
      label: 'OpenAI',
      color: '#10a37f',
      models: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
      ]
    },
    {
      id: 'nvidia',
      label: 'NVIDIA NIM',
      color: '#76b900',
      models: (() => {
        try {
          const nvList = JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]');
          return nvList.map(item => {
            const val = typeof item === 'string' ? item : item.model;
            return { value: val, label: val };
          });
        } catch { return []; }
      })()
    }
  ];

  const activeProviders = providers.filter(provider => hasValidKeys(provider.id) && provider.models.length > 0);

  if (activeProviders.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.01)',
      border: '1px solid var(--border-color)',
      borderRadius: '14px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      marginTop: '20px'
    }}>
      <h3 style={{
        fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', margin: 0,
        display: 'flex', alignItems: 'center', gap: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px'
      }}>
        <span>👁️</span> CẤU HÌNH HIỂN THỊ MODEL AI
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5 }}>
        Các Model được <strong>Bật</strong> sẽ hiển thị tại Khung Chọn Model của toàn bộ hệ thống. 
        Nếu bạn không muốn dùng model nào, hãy tắt nó đi để giao diện gọn gàng hơn.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {activeProviders.map(provider => {
          if (provider.models.length === 0) return null;
          return (
            <div key={provider.id} style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: provider.color, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px', marginBottom: '4px' }}>
                {provider.label}
              </div>
              {provider.models.map(model => {
                const isEnabled = getToggleState(model.value);
                return (
                  <label key={model.value} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    padding: '8px 12px', background: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                    border: isEnabled ? `1px solid ${provider.color}40` : '1px solid rgba(255,255,255,0.02)'
                  }}>
                    <span style={{ 
                      fontSize: '12px', fontWeight: 600, color: isEnabled ? 'white' : 'var(--text-muted)',
                      flex: 1, wordBreak: 'break-all'
                    }}>
                      {model.label}
                    </span>
                    <input 
                      type="checkbox" 
                      checked={isEnabled} 
                      onChange={() => toggleModel(model.value)} 
                      style={{ display: 'none' }} 
                    />
                    <div style={{
                      width: '32px', height: '18px', borderRadius: '10px',
                      background: isEnabled ? provider.color : 'rgba(255,255,255,0.1)',
                      position: 'relative', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', flexShrink: 0
                    }}>
                      <div style={{
                        width: '14px', height: '14px', borderRadius: '50%', background: 'white',
                        position: 'absolute', left: isEnabled ? '16px' : '2px', transition: 'all 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                      }} />
                    </div>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Settings component ────────────────────────────────────────────
export default function Settings({ onSettingsChange }) {
  const [provider, setProvider] = useState('gemini');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedProvider = localStorage.getItem('marketing_ai_provider') || 'gemini';
    setProvider(savedProvider);

    // Auto-migrate keys from localStorage to Backend Database
    const migrateKeys = async () => {
      if (localStorage.getItem('keys_migrated_to_db_v2')) return;

      const keysToMigrate = { gemini: [], openai: [], nvidia: [] };
      let hasData = false;

      const loadLegacy = (storageKey, fallbackKey) => {
        let result = [];
        try {
          const arr = JSON.parse(localStorage.getItem(storageKey) || 'null');
          if (Array.isArray(arr)) result = arr.map(k => k.key);
        } catch { /* Ignore malformed legacy storage and use the fallback key. */ }
        if (result.length === 0) {
          const legacy = localStorage.getItem(fallbackKey) || '';
          if (legacy.trim()) result = legacy.split(/[\s,;\n]+/).filter(Boolean);
        }
        return result;
      };

      keysToMigrate.gemini = loadLegacy('marketing_gemini_keys', 'marketing_gemini_key');
      keysToMigrate.openai = loadLegacy('marketing_openai_keys', 'marketing_openai_key');

      // Check if we have any data
      for (const k in keysToMigrate) {
        if (keysToMigrate[k].length > 0) hasData = true;
      }

      if (hasData) {
        try {
          await fetch('/api/keys/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: keysToMigrate })
          });
          // Xóa localstorage cũ để dọn dẹp
          ['marketing_gemini_keys', 'marketing_gemini_key', 'marketing_openai_keys', 'marketing_openai_key'].forEach(k => localStorage.removeItem(k));
          localStorage.setItem('keys_migrated_to_db_v2', 'true');
          window.location.reload();
        } catch(e) {
          console.error("Migration failed", e);
        }
      } else {
        localStorage.setItem('keys_migrated_to_db_v2', 'true');
      }
    };
    migrateKeys();
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('marketing_ai_provider', provider);
    setSaved(true);
    if (onSettingsChange) onSettingsChange({ provider });
    setTimeout(() => setSaved(false), 3000);
  };

  const PROVIDERS = [
    { id: 'gemini', label: '♊ Google Gemini' },
    { id: 'openai', label: '🧠 OpenAI' },
    { id: 'nvidia', label: '⚡ NVIDIA NIM' },
  ];

  const PROVIDER_CONFIG = {
    gemini: {
      title: 'Google Gemini (AI Studio)',
      icon: '♊',
      placeholder: 'AIzaSy...',
      link: 'https://aistudio.google.com/',
      linkLabel: 'AI Studio',
      storageKey: 'marketing_gemini_keys',
      fallbackKey: 'marketing_gemini_key',
    },
    openai: {
      title: 'OpenAI (GPT)',
      icon: '🧠',
      placeholder: 'sk-proj-...',
      link: 'https://platform.openai.com/api-keys',
      linkLabel: 'OpenAI Platform',
      storageKey: 'marketing_openai_keys',
      fallbackKey: 'marketing_openai_key',
    },
    nvidia: {
      title: 'NVIDIA NIM (API Keys)',
      icon: '⚡',
      placeholder: 'nvapi-...',
      link: 'https://build.nvidia.com/',
      linkLabel: 'build.nvidia.com',
    }
  };

  return (
    <div className="fade-in">
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.55rem' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #475569, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(71,85,105,0.4)', flexShrink: 0
          }}>
            <SettingsIcon size={22} color="white" />
          </div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Cấu hình</h1>
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
            padding: '0.3rem 0.8rem', borderRadius: '999px',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
            color: '#a5b4fc', letterSpacing: '0.05em', textTransform: 'uppercase'
          }}>Local · Bảo Mật</span>
        </div>
      </div>

      <div className="glass-panel" style={{ maxWidth: '100%' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Security notice */}
          <div className="alert alert-info" style={{ margin: 0 }}>
            <Info size={20} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
              <strong>Lưu ý bảo mật:</strong> Các API Key được lưu tập trung một cách bảo mật trên <strong>Backend Local Server</strong> của bạn. Chúng được xoay vòng tự động và cách ly hoàn toàn với giao diện Frontend.
            </div>
          </div>

          {/* Provider selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '12px', fontWeight: 700 }}>Nhà cung cấp dịch vụ AI mặc định</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {PROVIDERS.map(p => (
                <label key={p.id} style={{
                  padding: '9px', justifyContent: 'center', cursor: 'pointer', display: 'flex',
                  border: provider === p.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: provider === p.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                  color: provider === p.id ? 'white' : 'var(--text-muted)',
                  fontSize: '12px', fontWeight: 600, borderRadius: '8px',
                  transition: 'all 0.15s ease'
                }}>
                  <input type="radio" name="provider" value={p.id} checked={provider === p.id}
                    onChange={() => setProvider(p.id)} style={{ display: 'none' }} />
                  {p.label}
                </label>
              ))}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>
              Nhà cung cấp mặc định sẽ được dùng nếu bạn không chọn model cụ thể trong các mini-app.
            </span>
          </div>

          {/* Provider key management — filter to selected tab */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {PROVIDER_CONFIG[provider] && (
              <KeyManager
                providerId={provider}
                title={PROVIDER_CONFIG[provider].title}
                icon={PROVIDER_CONFIG[provider].icon}
                placeholder={PROVIDER_CONFIG[provider].placeholder}
                link={PROVIDER_CONFIG[provider].link}
                linkLabel={PROVIDER_CONFIG[provider].linkLabel}
              />
            )}
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              <Save size={18} />
              Lưu cấu hình
            </button>
          </div>

          {saved && (
            <div className="alert alert-success" style={{ marginTop: '0.5rem', margin: 0 }}>
              <Shield size={20} />
              Đã lưu cấu hình thành công!
            </div>
          )}
        </form>
        <ModelToggleManager />
      </div>
    </div>
  );
}
