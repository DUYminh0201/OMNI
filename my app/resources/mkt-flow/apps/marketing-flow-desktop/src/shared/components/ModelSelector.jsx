import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { hasProviderKey, getGeminiModels } from '../../utils.js';

/**
 * Shared AI Model Selector component.
 * Renders a unified <select> dropdown with all configured providers.
 *
 * Props:
 *   value          {string}   - selected model value
 *   onChange       {fn}       - (newValue) => void
 *   storageKey     {string}   - localStorage key to persist selection
 *   geminiModels   {array}    - list from getGeminiModels() state in parent
 *   label          {string}   - optional label text (default: "🤖 CHỌN MODEL AI")
 *   className      {string}   - optional extra className on the wrapper div
 */
export default function ModelSelector({ value, onChange, storageKey, geminiModels, label = '🤖 CHỌN MODEL AI', className = '', providerOnly = null }) {
  const [, setProviderRevision] = useState(0);
  const [nvidiaList, setNvidiaList] = useState(() => {
    try {
      const local = JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]');
      if (Array.isArray(local) && local.length > 0) return local;
    } catch (_) {}
    return [
      { model: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { model: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { model: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
      { model: 'google/gemma-4-31b-it', label: 'Gemma 4 31B IT' },
      { model: 'google/diffusiongemma-26b-a4b-it', label: 'DiffusionGemma 26B' },
      { model: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B' },
      { model: 'nvidia/nemotron-3.5-bolt-e4b', label: 'Nemotron 3.5 Bolt' },
      { model: 'mistralai/mistral-large-4-1t-a52b', label: 'Mistral Large 4 1T' },
      { model: 'openai/gpt-oss-20b', label: 'GPT OSS 20B' }
    ];
  });

  useEffect(() => {
    fetch('/api/nvidia-models')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setNvidiaList(data);
          try { localStorage.setItem('marketing_nvidia_custom_models', JSON.stringify(data)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const [disabledModels, setDisabledModels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('disabled_models') || '[]'); }
    catch (_) { return []; }
  });

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

  useEffect(() => {
    const handleProviderUpdate = () => setProviderRevision((revision) => revision + 1);
    window.addEventListener('api_keys_updated', handleProviderUpdate);
    return () => window.removeEventListener('api_keys_updated', handleProviderUpdate);
  }, []);

  const noKey = !hasProviderKey('gemini') && !hasProviderKey('openai') &&
                nvidiaList.length === 0;

  // Helper models lists
  const openaiModels = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
  ].filter(m => !disabledModels.includes(m.value));

  const activeGeminiModels = (geminiModels || getGeminiModels()).filter(m => !disabledModels.includes(m.value));
  const activeNvidiaModels = nvidiaList.filter(m => !disabledModels.includes(m.model));

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (val) => {
    if (storageKey) localStorage.setItem(storageKey, val);
    onChange(val);
    setIsOpen(false);
  };

  const isProviderAllowed = (p) => {
    if (!providerOnly) return true;
    if (Array.isArray(providerOnly)) return providerOnly.includes(p);
    return providerOnly === p;
  };

  const groups = [];
  if (hasProviderKey('gemini') && activeGeminiModels.length > 0 && isProviderAllowed('gemini')) {
    groups.push({ id: 'gemini', label: 'Google Gemini', icon: '🔷', color: '#4285F4', models: activeGeminiModels });
  }
  if (hasProviderKey('openai') && openaiModels.length > 0 && isProviderAllowed('openai')) {
    groups.push({ id: 'openai', label: 'OpenAI', icon: '🟢', color: '#10a37f', models: openaiModels });
  }
  if ((activeNvidiaModels.length > 0 || hasProviderKey('nvidia')) && isProviderAllowed('nvidia')) {
    const sourceModels = activeNvidiaModels.length > 0 ? activeNvidiaModels : [
      { model: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { model: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { model: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
      { model: 'google/gemma-4-31b-it', label: 'Gemma 4 31B IT' },
      { model: 'google/diffusiongemma-26b-a4b-it', label: 'DiffusionGemma 26B' },
      { model: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B' },
      { model: 'nvidia/nemotron-3.5-bolt-e4b', label: 'Nemotron 3.5 Bolt' },
      { model: 'mistralai/mistral-large-4-1t-a52b', label: 'Mistral Large 4 1T' },
      { model: 'openai/gpt-oss-20b', label: 'GPT OSS 20B' }
    ];
    const nvMapped = sourceModels.map((item) => ({
      value: item.model || item.value,
      label: item.label ? (item.label.includes('(NVIDIA)') ? item.label : `${item.label} (NVIDIA)`) : `${item.model} (NVIDIA)`
    }));
    groups.push({ id: 'nvidia', label: 'NVIDIA NIM', icon: '🟩', color: '#76b900', models: nvMapped });
  }

  // Find selected model details and validate
  let isValidSelection = false;
  let selectedLabel = value || '-- Chọn Model --';
  let selectedIcon = '🤖';
  groups.forEach(g => {
    const match = g.models.find(m => m.value === value);
    if (match) {
      isValidSelection = true;
      selectedLabel = match.label;
      selectedIcon = g.icon;
    }
  });
  const fallbackModel = groups[0]?.models[0]?.value;

  useEffect(() => {
    if (!isValidSelection && fallbackModel) {
      if (storageKey) localStorage.setItem(storageKey, fallbackModel);
      onChange(fallbackModel);
    }
  }, [fallbackModel, isValidSelection, onChange, storageKey]);

  return (
    <div className={`ai-model-selector ${className}`} ref={containerRef} style={{ position: 'relative' }}>
      <label className="ams-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--text-sub)' }}>
        {label}
      </label>
      
      <div 
        onClick={() => !noKey && setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: isOpen ? 'rgba(22, 30, 52, 0.97)' : 'var(--bg-input)',
          border: `1px solid ${isOpen ? 'rgba(99, 102, 241, 0.55)' : 'var(--border-color)'}`,
          padding: '10px 14px', borderRadius: '10px', cursor: noKey ? 'not-allowed' : 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(99, 102, 241, 0.12)' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {noKey ? (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>-- Chưa cấu hình API Key nào --</span>
          ) : (
            <>
              <span style={{ fontSize: '14px' }}>{selectedIcon}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {selectedLabel}
              </span>
            </>
          )}
        </div>
        <ChevronDown size={16} style={{ color: 'var(--text-sub)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
      </div>

      {isOpen && !noKey && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 1000,
          background: '#0d111c', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '6px', maxHeight: '350px', overflowY: 'auto',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', gap: '4px',
          animation: 'fadeInDown 0.15s ease-out'
        }}>
          <style>{`
            @keyframes fadeInDown {
              from { opacity: 0; transform: translateY(-8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          
          {groups.map(group => (
            <div key={group.id} style={{ marginBottom: '4px' }}>
              <div style={{
                fontSize: '11px', fontWeight: 700, color: group.color, padding: '8px 10px 4px',
                display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em'
              }}>
                <span>{group.icon}</span> {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.models.map(m => {
                  const isSelected = m.value === value;
                  return (
                    <div 
                      key={m.value}
                      onClick={() => handleSelect(m.value)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent';
                      }}
                      style={{
                        padding: '8px 12px 8px 26px', borderRadius: '6px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        transition: 'background 0.1s ease', position: 'relative'
                      }}
                    >
                      {isSelected && <Check size={12} style={{ position: 'absolute', left: '8px', color: '#818cf8' }} />}
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'white' : 'var(--text-main)' }}>
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
