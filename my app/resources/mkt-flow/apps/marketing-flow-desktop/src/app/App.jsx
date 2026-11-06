import { Component, useEffect, useState, lazy, Suspense } from 'react';
import { Video, Layers, Sparkles, Beaker, Settings as SettingsIcon, ChevronLeft, ChevronRight, Mic, FileStack } from 'lucide-react';
import './App.css';
import appPackage from '../../package.json';
import { fetchGeminiModels } from '../utils';

// Code-split all mini apps with React.lazy
const TikTokDownloader = lazy(() => import('../features/tiktok-downloader/TikTokDownloader'));
const BulkWatermark = lazy(() => import('../features/bulk-watermark/BulkWatermark'));
const AIContentEditor = lazy(() => import('../features/caption-editor/AIContentEditor'));
const ContentLab = lazy(() => import('../features/market-intelligence/ContentLab'));
const VideoDubbing = lazy(() => import('../features/video-dubbing/VideoDubbing'));
const Settings = lazy(() => import('../features/settings/Settings'));
const BulkContentCreator = lazy(() => import('../features/bulk-content/BulkContentCreator'));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[MKT FLOW] Uncaught error in component:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ff6b6b' }}>
          <h3>Đã xảy ra lỗi khi tải mini app</h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '1rem 0' }}>
            {this.state.error?.message || 'Lỗi không xác định'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.2rem',
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ initialTab: propInitialTab, embedded: propEmbedded } = {}) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isEmbedded = propEmbedded ?? (params?.get('embedded') === 'true' || (typeof window !== 'undefined' && window.self !== window.top));
  const initialTab = propInitialTab || params?.get('tab') || 'tiktok';
  const initialTheme = params?.get('theme') || 'dark';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([initialTab]));
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [isMainSidebarCollapsed, setIsMainSidebarCollapsed] = useState(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('main_sidebar_collapsed') === 'true' : false;
  });
  const [currentVersion, setCurrentVersion] = useState(() => {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : appPackage.version;
  });

  const activateTab = (key) => {
    setActiveTab(key);
    setVisitedTabs((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = initialTheme;
      if (initialTheme === 'halloween') {
        document.body.classList.add('theme-halloween');
      } else {
        document.body.classList.remove('theme-halloween');
      }
    }
  }, [initialTheme]);

  useEffect(() => {
    if (propInitialTab) {
      activateTab(propInitialTab);
    }
  }, [propInitialTab]);

  useEffect(() => {
    fetch('/api/version')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.version) {
          setCurrentVersion(data.version);
        }
      })
      .catch(() => {});
  }, []);

  const checkApiKeys = async () => {
    try {
      const provider = localStorage.getItem('marketing_ai_provider') || 'gemini';
      
      const res = await fetch('/api/keys');
      if (!res.ok) return;
      const keys = await res.json();
      
      const nvidiaModels = (() => {
        try { return JSON.parse(localStorage.getItem('marketing_nvidia_custom_models') || '[]'); }
        catch (_) { return []; }
      })();

      let isConfigured = false;
      const hasKey = (prov) => keys[prov] && keys[prov].length > 0;
      const configuredProviders = ['gemini', 'openai', 'nvidia'].filter(hasKey);
      if (nvidiaModels.length > 0 && !configuredProviders.includes('nvidia')) configuredProviders.push('nvidia');
      localStorage.setItem('marketing_configured_providers', JSON.stringify(configuredProviders));
      window.dispatchEvent(new CustomEvent('api_keys_updated'));

      if (hasKey('nvidia')) {
        try {
          const nvRes = await fetch('/api/nvidia-models');
          if (nvRes.ok) {
            const nvData = await nvRes.json();
            if (Array.isArray(nvData) && nvData.length > 0) {
              localStorage.setItem('marketing_nvidia_custom_models', JSON.stringify(nvData));
            }
          }
        } catch (_) {
          /* ignore */
        }
      }

      if      (provider === 'gemini'   && hasKey('gemini'))         isConfigured = true;
      else if (provider === 'openai'   && hasKey('openai'))         isConfigured = true;
      else if (provider === 'nvidia'   && hasKey('nvidia'))         isConfigured = true;
      // Also show as configured if ANY provider has at least one key
      else if (hasKey('gemini') || hasKey('openai') || hasKey('nvidia')) {
        isConfigured = true;
      }

      setApiKeyConfigured(isConfigured);
    } catch (error) {
      console.error('Lỗi khi kiểm tra trạng thái API Keys:', error);
    }
  };

  useEffect(() => {
    checkApiKeys();
    fetchGeminiModels();

    const handleMsg = (e) => {
      if (e.data && e.data.type === 'SET_TAB' && e.data.tab) {
        activateTab(e.data.tab);
      }
      if (e.data && e.data.type === 'SET_THEME' && e.data.theme) {
        document.documentElement.dataset.theme = e.data.theme;
        if (e.data.theme === 'halloween') {
          document.body.classList.add('theme-halloween');
        } else {
          document.body.classList.remove('theme-halloween');
        }
      }
    };
    window.addEventListener('message', handleMsg);
    window.addEventListener('keys_updated', checkApiKeys);
    return () => {
      window.removeEventListener('message', handleMsg);
      window.removeEventListener('keys_updated', checkApiKeys);
    };
  }, []);

  // Lắng nghe event "Gửi sang Lồng Tiếng" từ TikTokDownloader
  useEffect(() => {
    const handleSendToDubbing = (e) => {
      activateTab('video-dubbing');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_video_in_dubbing', { detail: e.detail }));
      }, 100);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_video_in_dubbing', { detail: e.detail }));
      }, 500);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_video_in_dubbing', { detail: e.detail }));
      }, 1200);
    };

    window.addEventListener('send_to_dubbing', handleSendToDubbing);
    return () => window.removeEventListener('send_to_dubbing', handleSendToDubbing);
  }, []);

  // Lắng nghe event "Gửi sang Tạo Content" từ ContentLab
  useEffect(() => {
    const handleSendToBulkContent = (e) => {
      activateTab('bulk-content');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_idea_in_bulk_content', { detail: e.detail }));
      }, 100);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_idea_in_bulk_content', { detail: e.detail }));
      }, 500);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load_idea_in_bulk_content', { detail: e.detail }));
      }, 1200);
    };

    window.addEventListener('send_to_bulk_content', handleSendToBulkContent);
    return () => window.removeEventListener('send_to_bulk_content', handleSendToBulkContent);
  }, []);

  const handleSettingsChange = () => {
    checkApiKeys();
    fetchGeminiModels();
  };

  const navItems = [
    { key: 'tiktok',        icon: <Video className="nav-item-icon" />,        label: 'Tải Video Đa Nền Tảng' },
    { key: 'watermark',     icon: <Layers className="nav-item-icon" />,       label: 'Đóng Dấu Ảnh' },
    { key: 'ai-content',    icon: <Sparkles className="nav-item-icon" />,     label: 'Biên Tập Caption' },
    { key: 'content-lab',   icon: <Beaker className="nav-item-icon" />,       label: 'Nghiên Cứu Thị Trường' },
    { key: 'video-dubbing', icon: <Mic className="nav-item-icon" />,          label: 'Lồng Tiếng Video' },
    { key: 'bulk-content',  icon: <FileStack className="nav-item-icon" />,    label: 'Tạo Content Hàng Loạt' },
    { key: 'settings',      icon: <SettingsIcon className="nav-item-icon" />, label: 'Cấu hình' },
  ];

  // Show/hide panels via CSS — components are mounted only after first visit and preserved afterwards
  const tabStyle = (key) => ({
    display: activeTab === key ? 'block' : 'none',
    width: '100%',
    height: '100%',
  });

  return (
    <div className={`app-container ${isMainSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isEmbedded ? 'embedded' : ''}`}>
      {!isEmbedded && (
      <aside className={`sidebar ${isMainSidebarCollapsed ? 'collapsed' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
          <div className="logo-section">
            <div className="logo-icon">M</div>
            {!isMainSidebarCollapsed && <div className="logo-text">MARKETING FLOW</div>}
          </div>
          
          <nav className="nav-links">
            {navItems.map(item => (
              <button 
                key={item.key}
                onClick={() => activateTab(item.key)}
                className={`nav-item ${activeTab === item.key ? 'active' : ''}`}
                title={isMainSidebarCollapsed ? item.label : ''}
              >
                {item.icon}
                <span className="nav-item-text">{item.label}</span>
              </button>
            ))}
            
            <button 
              onClick={() => {
                setIsMainSidebarCollapsed(prev => {
                  const next = !prev;
                  localStorage.setItem('main_sidebar_collapsed', String(next));
                  return next;
                });
              }}
              className="nav-item collapse-toggle-btn"
              title={isMainSidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            >
              {isMainSidebarCollapsed 
                ? <ChevronRight className="nav-item-icon" /> 
                : <ChevronLeft className="nav-item-icon" />
              }
              <span className="nav-item-text">Thu gọn</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div 
            className="api-status-badge"
            title={isMainSidebarCollapsed ? `AI API: ${apiKeyConfigured ? 'Đang hoạt động' : 'Chưa thiết lập'}` : ''}
          >
            <div className={`status-dot ${apiKeyConfigured ? 'active' : ''}`} />
            <span>AI API: {apiKeyConfigured ? 'Đang hoạt động' : 'Chưa thiết lập'}</span>
          </div>
          {!isMainSidebarCollapsed && (
            <div style={{
              textAlign: 'center',
              fontSize: '0.62rem',
              color: 'rgba(255,255,255,0.18)',
              letterSpacing: '0.04em',
              marginTop: '0.45rem',
              fontWeight: 500,
              userSelect: 'none',
            }}>
              v{currentVersion}
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Mini apps are lazy loaded and mounted only after first visit to optimize memory and startup */}
      <main className="main-content" style={isEmbedded ? { padding: '16px', maxWidth: '100%', height: '100%', overflowY: 'auto' } : undefined}>
        <ErrorBoundary>
          <Suspense fallback={<div className="loading-spinner" style={{ padding: '2rem', textAlign: 'center', color: '#8083ff' }}>Đang tải ứng dụng...</div>}>
            {visitedTabs.has('tiktok') && <div style={tabStyle('tiktok')}><TikTokDownloader /></div>}
            {visitedTabs.has('watermark') && <div style={tabStyle('watermark')}><BulkWatermark /></div>}
            {visitedTabs.has('ai-content') && <div style={tabStyle('ai-content')}><AIContentEditor /></div>}
            {visitedTabs.has('content-lab') && <div style={tabStyle('content-lab')}><ContentLab /></div>}
            {visitedTabs.has('video-dubbing') && <div style={tabStyle('video-dubbing')}><VideoDubbing /></div>}
            {visitedTabs.has('bulk-content') && <div style={tabStyle('bulk-content')}><BulkContentCreator /></div>}
            {visitedTabs.has('settings') && <div style={tabStyle('settings')}><Settings onSettingsChange={handleSettingsChange} /></div>}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
