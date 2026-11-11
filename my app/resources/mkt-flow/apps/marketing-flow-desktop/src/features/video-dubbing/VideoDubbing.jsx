import { getPendingDubbingFile } from '../../utils/dubbingStorage.js';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { getInitialModel, getAIApiConfig, getGeminiModels, resolveMktFlowUrl, extractMktFlowFilename } from '../../utils.js';
import ModelSelector from '../../shared/components/ModelSelector.jsx';
import LogoWatermarkPanel from './LogoWatermarkPanel.jsx';
import { 
  Upload, 
  Languages, 
  Play, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Settings2,
  Video,
  Mic,
  History,
  RotateCcw,
  Trash2,
  Stamp,
  Volume2,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'Tiếng Anh' },
  { code: 'ja', name: 'Tiếng Nhật' },
  { code: 'ko', name: 'Tiếng Hàn' },
  { code: 'fr', name: 'Tiếng Pháp' },
  { code: 'de', name: 'Tiếng Đức' },
  { code: 'es', name: 'Tiếng Tây Ban Nha' },
  { code: 'lo', name: 'Tiếng Lào' },
  { code: 'km', name: 'Tiếng Khmer' },
];

const toMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(path)
    ? `omni-media://ext/${encodeURIComponent(path)}`
    : `omni-media://local/${path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
};

const DEFAULT_VOICE_GROUPS = [
  {
    label: 'VieNeu-TTS (Local) - Miễn phí (Tiếng Việt)',
    provider: 'local_tts',
    voices: [
      { id: 'adam', name: 'Adam bựa (Nam · Bắc)', provider: 'local_tts' },
      { id: 'doantrang', name: 'Đoan Trang (Nữ · Bắc)', provider: 'local_tts' },
      { id: 'vnev3_male_north', name: 'VieNeu v3 Nam (Bắc)', provider: 'local_tts' },
      { id: 'vnev3_female_north', name: 'VieNeu v3 Nữ (Bắc)', provider: 'local_tts' },
      { id: 'vnev3_male_south', name: 'VieNeu v3 Nam (Nam)', provider: 'local_tts' },
      { id: 'vnev3_female_south', name: 'VieNeu v3 Nữ (Nam)', provider: 'local_tts' },
      { id: 'vnev3_male_central', name: 'VieNeu v3 Nam (Trung)', provider: 'local_tts' },
      { id: 'vnev3_female_central', name: 'VieNeu v3 Nữ (Trung)', provider: 'local_tts' }
    ]
  },
  {
    label: 'Edge-TTS (Microsoft - Đa ngôn ngữ, có Khmer)',
    provider: 'edge_tts',
    voices: [
      { id: 'km-KH-SreymomNeural', name: '🇰🇭 Sreymom (Nữ Khmer - Chuẩn)', provider: 'edge_tts' },
      { id: 'km-KH-PisethNeural', name: '🇰🇭 Piseth (Nam Khmer - Chuẩn)', provider: 'edge_tts' },
      { id: 'vi-VN-HoaiMyNeural', name: '🇻🇳 Hoài My (Nữ miền Bắc - vi-VN)', provider: 'edge_tts' },
      { id: 'vi-VN-NamMinhNeural', name: '🇻🇳 Nam Minh (Nam miền Bắc - vi-VN)', provider: 'edge_tts' },
      { id: 'en-US-JennyNeural', name: 'Jenny (Nữ tiếng Anh - en-US)', provider: 'edge_tts' },
      { id: 'en-US-GuyNeural', name: 'Guy (Nam tiếng Anh - en-US)', provider: 'edge_tts' },
      { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Nữ tiếng Trung - zh-CN)', provider: 'edge_tts' },
      { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Nam tiếng Trung - zh-CN)', provider: 'edge_tts' },
      { id: 'ja-JP-NanamiNeural', name: 'Nanami (Nữ tiếng Nhật - ja-JP)', provider: 'edge_tts' },
      { id: 'ja-JP-KeitaNeural', name: 'Keita (Nam tiếng Nhật - ja-JP)', provider: 'edge_tts' },
      { id: 'ko-KR-SunHiNeural', name: 'SunHi (Nữ tiếng Hàn - ko-KR)', provider: 'edge_tts' },
      { id: 'ko-KR-InJoonNeural', name: 'InJoon (Nam tiếng Hàn - ko-KR)', provider: 'edge_tts' }
    ]
  },
  {
    label: 'Google Gemini TTS (Đa ngôn ngữ AI - Hỗ trợ Khmer)',
    provider: 'google_tts',
    voices: [
      { id: 'Kore', name: 'Gemini Kore (Nữ · chắc, rõ ràng)', provider: 'google_tts' },
      { id: 'Aoede', name: 'Gemini Aoede (Nữ · nhẹ nhàng)', provider: 'google_tts' },
      { id: 'Leda', name: 'Gemini Leda (Nữ · trẻ trung)', provider: 'google_tts' },
      { id: 'Zephyr', name: 'Gemini Zephyr (Nữ · tươi sáng)', provider: 'google_tts' },
      { id: 'Autonoe', name: 'Gemini Autonoe (Nữ · sáng)', provider: 'google_tts' },
      { id: 'Callirrhoe', name: 'Gemini Callirrhoe (Nữ · thoải mái)', provider: 'google_tts' },
      { id: 'Despina', name: 'Gemini Despina (Nữ · mượt)', provider: 'google_tts' },
      { id: 'Erinome', name: 'Gemini Erinome (Nữ · trong trẻo)', provider: 'google_tts' },
      { id: 'Laomedeia', name: 'Gemini Laomedeia (Nữ · vui tươi)', provider: 'google_tts' },
      { id: 'Achernar', name: 'Gemini Achernar (Nữ · mềm)', provider: 'google_tts' },
      { id: 'Gacrux', name: 'Gemini Gacrux (Nữ · trưởng thành)', provider: 'google_tts' },
      { id: 'Pulcherrima', name: 'Gemini Pulcherrima (Nữ · dứt khoát)', provider: 'google_tts' },
      { id: 'Sulafat', name: 'Gemini Sulafat (Nữ · ấm)', provider: 'google_tts' },
      { id: 'Vindemiatrix', name: 'Gemini Vindemiatrix (Nữ · dịu dàng)', provider: 'google_tts' },
      { id: 'Puck', name: 'Gemini Puck (Nam · sôi nổi)', provider: 'google_tts' },
      { id: 'Charon', name: 'Gemini Charon (Nam · kể chuyện, đều giọng)', provider: 'google_tts' },
      { id: 'Fenrir', name: 'Gemini Fenrir (Nam · hào hứng)', provider: 'google_tts' },
      { id: 'Orus', name: 'Gemini Orus (Nam · chắc)', provider: 'google_tts' },
      { id: 'Enceladus', name: 'Gemini Enceladus (Nam · trầm, thì thầm)', provider: 'google_tts' },
      { id: 'Iapetus', name: 'Gemini Iapetus (Nam · rõ ràng)', provider: 'google_tts' },
      { id: 'Umbriel', name: 'Gemini Umbriel (Nam · thoải mái)', provider: 'google_tts' },
      { id: 'Algieba', name: 'Gemini Algieba (Nam · mượt)', provider: 'google_tts' },
      { id: 'Algenib', name: 'Gemini Algenib (Nam · khàn)', provider: 'google_tts' },
      { id: 'Rasalgethi', name: 'Gemini Rasalgethi (Nam · truyền cảm)', provider: 'google_tts' },
      { id: 'Alnilam', name: 'Gemini Alnilam (Nam · vững)', provider: 'google_tts' },
      { id: 'Schedar', name: 'Gemini Schedar (Nam · đều)', provider: 'google_tts' },
      { id: 'Achird', name: 'Gemini Achird (Nam · thân thiện)', provider: 'google_tts' },
      { id: 'Zubenelgenubi', name: 'Gemini Zubenelgenubi (Nam · bình dân)', provider: 'google_tts' },
      { id: 'Sadachbia', name: 'Gemini Sadachbia (Nam · sinh động)', provider: 'google_tts' },
      { id: 'Sadaltager', name: 'Gemini Sadaltager (Nam · hiểu biết)', provider: 'google_tts' }
    ]
  },
  {
    label: 'OpenAI Audio TTS (Đa ngôn ngữ AI - Hỗ trợ Khmer)',
    provider: 'openai_tts',
    voices: [
      { id: 'alloy', name: 'Alloy (Trung tính, cân bằng)', provider: 'openai_tts' },
      { id: 'ash', name: 'Ash (Nam, tự nhiên)', provider: 'openai_tts' },
      { id: 'coral', name: 'Coral (Nữ, ấm áp)', provider: 'openai_tts' },
      { id: 'echo', name: 'Echo (Nam, mượt mà)', provider: 'openai_tts' },
      { id: 'fable', name: 'Fable (Anh-Anh, biểu cảm)', provider: 'openai_tts' },
      { id: 'nova', name: 'Nova (Nữ, sống động)', provider: 'openai_tts' },
      { id: 'onyx', name: 'Onyx (Nam, trầm ấm)', provider: 'openai_tts' },
      { id: 'sage', name: 'Sage (Nữ, điềm đạm)', provider: 'openai_tts' },
      { id: 'shimmer', name: 'Shimmer (Nữ, trong trẻo)', provider: 'openai_tts' }
    ]
  }
];

const VOICE_GROUPS = DEFAULT_VOICE_GROUPS;
const DUBBING_VOICES = VOICE_GROUPS.flatMap(g => g.voices);

const TranscriptItem = React.memo(({ 
  index, 
  seg, 
  targetLang, 
  onTextChange, 
  onTranslatedTextChange 
}) => {
  const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name.toUpperCase() || 'DỊCH';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1rem',
      padding: '1rem',
      borderRadius: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      transition: 'all 0.2s ease',
    }} className="group hover:border-indigo-500/30">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-sub)' }}>GỐC ({seg.start.toFixed(1)}s)</span>
        <textarea 
          value={seg.text}
          onChange={(e) => onTextChange(index, e.target.value)}
          rows={2}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            lineHeight: '1.5',
            outline: 'none',
            border: 'none',
            resize: 'none',
            height: '50px'
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderLeft: '1px solid rgba(255, 255, 255, 0.08)', paddingLeft: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#818cf8' }}>{targetLangName}</span>
          {seg.isTranslating && (
            <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#fbbf24', animation: 'pulse 1s infinite' }} /> Đang dịch lại...
            </span>
          )}
        </div>
        <textarea 
          value={seg.translatedText || ""}
          onChange={(e) => onTranslatedTextChange(index, e.target.value)}
          rows={2}
          placeholder={seg.isTranslating ? "Đang dịch lại..." : "Bản dịch..."}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            color: 'white',
            fontSize: '0.85rem',
            fontWeight: 500,
            lineHeight: '1.5',
            outline: 'none',
            border: 'none',
            resize: 'none',
            height: '50px'
          }}
        />
      </div>
    </div>
  );
});

// getInitialModel & getAIApiConfig are imported from '../utils.js'

export default function VideoDubbing() {
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [targetLang, setTargetLang] = useState('vi');
  const [selectedVoice, setSelectedVoice] = useState(DUBBING_VOICES[0].id);
  const [voiceGroups, setVoiceGroups] = useState(DEFAULT_VOICE_GROUPS);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const previewAudioRef = useRef(null);
  const [videoQuality, setVideoQuality] = useState('original');
  const [audioMode, setAudioMode] = useState('keep_fx');
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [maskOriginalSubtitles, setMaskOriginalSubtitles] = useState(false);
  
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [uploadedFilename, setUploadedFilename] = useState(null);
  const [originalAudioBase64, setOriginalAudioBase64] = useState(null);
  const [dubbedAudioBase64, setDubbedAudioBase64] = useState(null);
  
  const [lastProcessedLang, setLastProcessedLang] = useState(null);
  const [lastProcessedVoice, setLastProcessedVoice] = useState(null);
  const [lastProcessedAudioMode, setLastProcessedAudioMode] = useState(null);
  const [lastProcessedVideoQuality, setLastProcessedVideoQuality] = useState(null);
  const [lastProcessedIncludeSubtitles, setLastProcessedIncludeSubtitles] = useState(false);
  const [lastProcessedMaskSubtitles, setLastProcessedMaskSubtitles] = useState(false);
  
  const [isTranscriptEdited, setIsTranscriptEdited] = useState(false);
  const [isTranslatingOnly, setIsTranslatingOnly] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogoPanel, setShowLogoPanel] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => getInitialModel('model_video_dubbing'));
  const [geminiModels, setGeminiModels] = useState(() => getGeminiModels());

  // Đồng bộ toàn bộ giọng đọc từ Omnira Studio (Đọc văn bản /tts, Giọng của tôi, VieNeu, Edge)
  const syncOmniVoices = useCallback(async () => {
    if (typeof window === 'undefined' || !window.omni?.api?.invoke) return;
    try {
      const clonesRes = await window.omni.api.invoke("localtts.clones").catch(() => null);
      const clones = Array.isArray(clonesRes) ? clonesRes : (clonesRes?.data || []);

      const localVoicesRes = await window.omni.api.invoke("media.voices", { provider: "local_tts" }).catch(() => null);
      const localVoices = Array.isArray(localVoicesRes) ? localVoicesRes : [];

      const edgeVoicesRes = await window.omni.api.invoke("media.voices", { provider: "edge" }).catch(() => null);
      const edgeVoices = Array.isArray(edgeVoicesRes) ? edgeVoicesRes : [];

      const myClonedVoices = [];
      const presetLocalVoices = [];

      if (clones && clones.length > 0) {
        clones.forEach(c => {
          myClonedVoices.push({
            id: `clone:${c.id}`,
            name: `🗣️ ${c.name} (${c.durationSec ? c.durationSec.toFixed(1) + 's' : 'Giọng clone'})`,
            provider: 'local_tts'
          });
        });
      }

      if (localVoices.length > 0) {
        localVoices.forEach(v => {
          if (v.id.startsWith('clone:')) {
            if (!myClonedVoices.some(m => m.id === v.id)) {
              myClonedVoices.push({
                id: v.id,
                name: v.label || v.name,
                provider: 'local_tts'
              });
            }
          } else {
            presetLocalVoices.push({
              id: v.id,
              name: v.label || v.name,
              provider: 'local_tts'
            });
          }
        });
      }

      const updatedGroups = [];

      // Nhóm 1: Giọng của tôi (Clone) - Hiển thị ưu tiên đầu tiên nếu có
      if (myClonedVoices.length > 0) {
        updatedGroups.push({
          label: `⭐ Giọng của tôi (${myClonedVoices.length}) - Tiếng Việt`,
          provider: 'local_tts',
          voices: myClonedVoices
        });
      }

      // Nhóm 2: VieNeu-TTS (Local) - Miễn phí
      const finalPresets = presetLocalVoices.length > 0 ? presetLocalVoices : DEFAULT_VOICE_GROUPS[0].voices;
      updatedGroups.push({
        label: 'VieNeu-TTS (Local) - Miễn phí (Tiếng Việt)',
        provider: 'local_tts',
        voices: finalPresets
      });

      // Nhóm 3: Edge-TTS
      const finalEdgeVoices = [...DEFAULT_VOICE_GROUPS[1].voices];
      if (edgeVoices.length > 0) {
        edgeVoices.forEach(ev => {
          if (!finalEdgeVoices.some(e => e.id === ev.id)) {
            finalEdgeVoices.push({
              id: ev.id,
              name: ev.label || ev.name,
              provider: 'edge_tts'
            });
          }
        });
      }
      updatedGroups.push({
        label: 'Edge-TTS (Microsoft - Đa ngôn ngữ, có Khmer)',
        provider: 'edge_tts',
        voices: finalEdgeVoices
      });

      // Nhóm 4: Google Gemini TTS
      updatedGroups.push(DEFAULT_VOICE_GROUPS[2]);

      // Nhóm 5: OpenAI Audio TTS
      updatedGroups.push(DEFAULT_VOICE_GROUPS[3]);

      setVoiceGroups(updatedGroups);

      // Tự động chọn giọng clone đầu tiên nếu chưa chọn giọng khác (chỉ khi không phải tiếng Khmer)
      setSelectedVoice(prev => {
        if ((prev === 'adam' || prev === 'Kore') && myClonedVoices.length > 0) {
          return myClonedVoices[0].id;
        }
        return prev;
      });
    } catch (e) {
      console.warn('[VideoDubbing] Lỗi đồng bộ giọng Omnira:', e);
    }
  }, []);

  useEffect(() => {
    syncOmniVoices();
    window.addEventListener('focus', syncOmniVoices);
    return () => window.removeEventListener('focus', syncOmniVoices);
  }, [syncOmniVoices]);

  const generateSpeechAudio = async (text, voiceId, targetLanguage, model) => {
    const aiConfig = getAIApiConfig(selectedModel);
    const chosenModel = model || aiConfig.model;

    const allVoices = voiceGroups.flatMap(g => g.voices);
    const selectedVoiceObj = allVoices.find(v => v.id === voiceId);
    let voiceProvider = selectedVoiceObj?.provider || (
      voiceId.startsWith('clone:') ? 'local_tts' :
      voiceId.includes('Neural') ? 'edge_tts' :
      ['alloy','ash','coral','echo','fable','nova','onyx','sage','shimmer'].includes((voiceId || '').toLowerCase()) ? 'openai_tts' :
      ['adam', 'doantrang'].includes(voiceId) || voiceId?.startsWith('vnev3_') ? 'local_tts' :
      'google_tts'
    );
    if (voiceProvider === 'edge_tts') voiceProvider = 'edge';

    // KIỂM TRA NGÔN NGỮ: Giọng Clone & VieNeu-TTS chỉ hỗ trợ đọc Tiếng Việt (chưa hỗ trợ chữ Khmer/tiếng nước ngoài)
    const isKhmerText = /[\u1780-\u17FF]/.test(text) || targetLanguage === 'km' || targetLanguage === 'Tiếng Khmer';
    const isVietnameseOnlyVoice = voiceProvider === 'local_tts' || 
                                  voiceId?.startsWith('clone:') || 
                                  ['adam', 'doantrang'].includes(voiceId) || 
                                  voiceId?.startsWith('vnev3_') ||
                                  voiceId?.startsWith('vi-VN-');

    if (isKhmerText && isVietnameseOnlyVoice) {
      throw new Error('Giọng đọc Clone / VieNeu-TTS hiện chỉ hỗ trợ Tiếng Việt (không thể đọc chữ Khmer). Để lồng tiếng Tiếng Khmer, vui lòng chọn giọng Sreymom hoặc Piseth (Khmer) trong mục Edge-TTS hoặc Google Gemini nhé!');
    }

    if (window.omni?.api?.invoke) {
      try {
        console.log('[VideoDubbing] Gọi IPC media.synthesize:', { voiceProvider, voiceId, chosenModel });
        const synthRes = await window.omni.api.invoke('media.synthesize', {
          provider: voiceProvider,
          voiceId: voiceId,
          text: text,
          model: chosenModel
        });
        if (synthRes?.ok && synthRes?.data?.base64) {
          return synthRes.data.base64;
        }
        if (synthRes?.base64) {
          return synthRes.base64;
        }
        if (synthRes?.ok === false && synthRes?.error) {
          throw new Error(synthRes.error.message || 'Lỗi từ tiến trình chính khi tạo giọng đọc.');
        }
      } catch (err) {
        console.warn('[VideoDubbing] omni media.synthesize failed:', err);
        if (voiceProvider === 'local_tts' || voiceId?.startsWith('clone:')) {
          throw err;
        }
      }
    }

    const response = await fetch('/api/dubbing/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: voiceId,
        targetLanguage,
        model: chosenModel,
        provider: voiceProvider
      })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Tạo giọng đọc lồng tiếng thất bại.');
    return data.data;
  };

  const handlePreviewVoice = async () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (isPreviewing) {
      setIsPreviewing(false);
      setPreviewAudioUrl(null);
      return;
    }

    const aiConfig = getAIApiConfig(selectedModel);
    const chosenModel = aiConfig.model;

    const allVoices = voiceGroups.flatMap(g => g.voices);
    const selectedVoiceObj = allVoices.find(v => v.id === selectedVoice);
    let voiceProvider = selectedVoiceObj?.provider || (
      selectedVoice.startsWith('clone:') ? 'local_tts' :
      selectedVoice.includes('Neural') ? 'edge_tts' :
      ['alloy','ash','coral','echo','fable','nova','onyx','sage','shimmer'].includes((selectedVoice || '').toLowerCase()) ? 'openai_tts' :
      ['adam', 'doantrang'].includes(selectedVoice) || selectedVoice?.startsWith('vnev3_') ? 'local_tts' :
      'google_tts'
    );
    if (voiceProvider === 'edge_tts') voiceProvider = 'edge';

    setIsPreviewing(true);
    try {
      let sampleAudioUrl = null;
      if (window.omni?.api?.invoke) {
        const previewRes = await window.omni.api.invoke("media.previewVoice", {
          provider: voiceProvider,
          voiceId: selectedVoice
        }).catch(() => null);

        const relPath = previewRes?.ok ? previewRes.data : (typeof previewRes === 'string' ? previewRes : null);
        if (relPath) {
          sampleAudioUrl = toMediaUrl(relPath);
        } else {
          const synthRes = await window.omni.api.invoke("media.synthesize", {
            provider: voiceProvider,
            voiceId: selectedVoice,
            text: "Xin chào, đây là giọng đọc thử nghiệm trong Omnira Studio.",
            model: chosenModel
          }).catch((err) => ({ ok: false, error: err }));

          if (synthRes?.ok && synthRes?.data?.base64) {
            sampleAudioUrl = synthRes.data.base64;
          } else if (synthRes?.base64) {
            sampleAudioUrl = synthRes.base64;
          } else if (synthRes?.ok === false && synthRes?.error) {
            throw new Error(synthRes.error.message || "Không thể tạo giọng đọc mẫu");
          }
        }
      }

      if (!sampleAudioUrl && voiceProvider !== 'local_tts' && !selectedVoice?.startsWith('clone:')) {
        const res = await fetch('/api/dubbing/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: "Xin chào, đây là giọng đọc thử nghiệm trong Omnira Studio.",
            voiceName: selectedVoice,
            targetLanguage: 'Tiếng Việt',
            model: chosenModel
          })
        });
        const data = await res.json();
        if (data.success && data.data) {
          sampleAudioUrl = data.data.startsWith('data:') ? data.data : `data:audio/mp3;base64,${data.data}`;
        }
      }

      if (!sampleAudioUrl) {
        throw new Error("Không thể phát thử giọng đọc này. Hãy khởi động lại ứng dụng để cập nhật kết nối.");
      }

      const audio = new Audio(sampleAudioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setIsPreviewing(false);
        setPreviewAudioUrl(null);
        previewAudioRef.current = null;
      };
      audio.onerror = (e) => {
        console.error("Audio playback error:", e, audio.error);
        setIsPreviewing(false);
        setPreviewAudioUrl(null);
        previewAudioRef.current = null;
        alert("Không thể phát file âm thanh mẫu: " + (audio.error?.message || "Lỗi định dạng âm thanh"));
      };
      setPreviewAudioUrl(sampleAudioUrl);
      await audio.play();
    } catch (e) {
      console.warn('[VideoDubbing] Preview voice failed:', e);
      setIsPreviewing(false);
      setPreviewAudioUrl(null);
      alert(e.message || "Không thể phát thử giọng này.");
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
      setGeminiModels(getGeminiModels());
    };
    window.addEventListener('gemini_models_updated', handleUpdate);
    return () => window.removeEventListener('gemini_models_updated', handleUpdate);
  }, []);
  const hasApiKey = true;
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    // Load history
    const savedHistory = localStorage.getItem('dubmaster_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

    const onDrop = (acceptedFiles) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setVideoUrl(URL.createObjectURL(selectedFile));
      setVideoError(false);
      setFinalVideoUrl(null);
      setUploadedFilename(null);
      setOriginalAudioBase64(null);
      setDubbedAudioBase64(null);
      setTranscript([]);
      setLastProcessedLang(null);
      setLastProcessedVoice(null);
      setLastProcessedAudioMode(null);
      setLastProcessedVideoQuality(null);
      setLastProcessedIncludeSubtitles(false);
      setLastProcessedMaskSubtitles(false);
      setIsTranscriptEdited(false);
      setStatus('idle');
      setProgress(0);
      setErrorMessage('');
    }
  };

  // Nhận video được gửi từ mini app "Tải Video Đa Nền Tảng"
  useEffect(() => {
    // 1. Tự động kiểm tra file chuyển tiếp từ IndexedDB khi mở tab Lồng Tiếng
    getPendingDubbingFile().then(pendingFile => {
      if (pendingFile) {
        console.log('[VideoDubbing] Auto-loaded transferred video:', pendingFile.name);
        onDrop([pendingFile]);
      }
    }).catch(err => console.warn('[VideoDubbing] error loading pending file:', err));

    // 2. Lắng nghe custom event nạp trực tiếp
    const handleLoadVideo = (e) => {
      const { file } = e.detail || {};
      if (!file) return;
      onDrop([file]);
    };
    window.addEventListener('load_video_in_dubbing', handleLoadVideo);
    return () => window.removeEventListener('load_video_in_dubbing', handleLoadVideo);
  }, []);


  useEffect(() => {
    localStorage.setItem('dubmaster_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => () => {
    if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);



  // When blob URL fails (e.g. HEVC on Chrome without system codec), auto-upload
  // to get a proper server-side streaming URL with Range support
  const handleVideoError = async () => {
    if (!file || videoError) return; // avoid infinite retry
    setVideoError(true);
    if (!uploadedFilename) {
      try {
        const formData = new FormData();
        formData.append('video', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setUploadedFilename(data.filename);
          setVideoUrl(`/downloads/${data.filename}`);
        }
      } catch (e) {
        console.error('Video preview fallback upload failed:', e);
      }
    } else {
      setVideoUrl(`/downloads/${uploadedFilename}`);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    multiple: false
  });


  // Tự động dịch nếu đang ở bước xác nhận mà có câu chưa có bản dịch
  const isTranslatingMissingRef = useRef(false);
  useEffect(() => {
    if (status === 'awaiting_confirmation' && transcript.length > 0 && transcript.some(s => !s.translatedText)) {
      if (isTranslatingMissingRef.current) return;
      isTranslatingMissingRef.current = true;
      const { provider, model } = getAIApiConfig(selectedModel);
      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Tiếng Việt';
      fetch('/api/dubbing/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: transcript, targetLanguage: targetLangName, provider, model })
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data) {
            setTranscript(data.data);
            setLastProcessedLang(targetLang);
          }
        })
        .catch(err => console.warn('Auto-translate error:', err))
        .finally(() => {
          isTranslatingMissingRef.current = false;
        });
    }
  }, [status, transcript, selectedModel, targetLang]);

  const handleProcess = async () => {
    if (!file) return;
    const config = getAIApiConfig(selectedModel);

    try {
      let currentFilename = uploadedFilename;
      let currentAudioBase64 = originalAudioBase64;
      let currentTranscript = transcript;
      let currentDubbedAudio = dubbedAudioBase64;

      // 1. Upload to server
      if (!currentFilename) {
        setStatus('uploading');
        setProgress(10);
        const formData = new FormData();
        formData.append('video', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error('Upload video thất bại.');
        const uploadData = await response.json();
        
        currentFilename = uploadData.filename;
        setUploadedFilename(currentFilename);
        // Switch preview from local blob URL to server-side streaming URL
        // so that browsers (incl. Chrome) can play HEVC videos with Range support
        setVideoUrl(`/downloads/${currentFilename}`);
        setProgress(25);
      }

      // 2. Extract Audio
      if (currentFilename && !currentAudioBase64) {
        setStatus('transcribing');
        setProgress(35);
        
        const response = await fetch('/api/extract-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: currentFilename }),
        });
        let audioData;
        try {
          audioData = await response.json();
        } catch (error) {
          throw new Error('Tách âm thanh video thất bại.', { cause: error });
        }
        if (!response.ok) throw new Error(audioData.error || 'Tách âm thanh video thất bại.');

        currentAudioBase64 = audioData.audio;
        setOriginalAudioBase64(currentAudioBase64);
      }

      // 3. Transcribe
      let justTranscribed = false;
      if (currentAudioBase64 && currentTranscript.length === 0) {
        setStatus('transcribing');
        setProgress(45);
        
        const response = await fetch('/api/dubbing/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: currentAudioBase64, provider: config.provider, model: config.model })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Nhận diện lời thoại thất bại.');
        
        currentTranscript = data.data;
        setTranscript(currentTranscript);
        justTranscribed = true;
      }

      // TỰ ĐỘNG DỊCH NGAY LẬP TỨC để người dùng xem và chỉnh sửa được cả 2 cột
      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Tiếng Việt';
      if (justTranscribed || (currentTranscript.length > 0 && currentTranscript.some(s => !s.translatedText))) {
        setStatus('translating');
        setProgress(50);
        
        try {
          const transResponse = await fetch('/api/dubbing/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ segments: currentTranscript, targetLanguage: targetLangName, provider: config.provider, model: config.model })
          });
          const transData = await transResponse.json();
          if (transData.success && transData.data) {
            currentTranscript = transData.data;
            setTranscript(currentTranscript);
            setLastProcessedLang(targetLang);
          }
        } catch (e) {
          console.warn('Auto translation failed:', e);
        }

        setProgress(55);
        setStatus('awaiting_confirmation');
        return;
      }

      if (justTranscribed) {
        setStatus('awaiting_confirmation');
        return;
      }

      // 4. Translate
      const needsTranslation = currentTranscript.length > 0 && 
                               (!currentTranscript[0].translatedText || lastProcessedLang !== targetLang || isTranscriptEdited);
      
      if (needsTranslation) {
        setStatus('translating');
        setProgress(65);
        
        const response = await fetch('/api/dubbing/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments: currentTranscript, targetLanguage: targetLangName, provider: config.provider, model: config.model })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Dịch thuật phụ đề thất bại.');
        
        currentTranscript = data.data;
        setTranscript(currentTranscript);
        setLastProcessedLang(targetLang);
        currentDubbedAudio = null;
        setDubbedAudioBase64(null);
      }
      setProgress(75);

      // 5. Generate Dubbed Audio (TTS)
      const needsDubbing = !currentDubbedAudio || 
                           lastProcessedVoice !== selectedVoice || 
                           lastProcessedLang !== targetLang ||
                           isTranscriptEdited;
      
      if (needsDubbing) {
        setStatus('dubbing');
        setProgress(85);
        const fullTranslatedText = currentTranscript.map(s => s.translatedText || "").join(' ').trim();
        if (!fullTranslatedText) {
          throw new Error("Không có nội dung bản dịch để lồng tiếng.");
        }
        
        const dubbedAudioData = await generateSpeechAudio(fullTranslatedText, selectedVoice, targetLangName, config.model);
        currentDubbedAudio = dubbedAudioData;
        setDubbedAudioBase64(currentDubbedAudio);
        setLastProcessedVoice(selectedVoice);
        setLastProcessedLang(targetLang);
        setIsTranscriptEdited(false);
      }
      setProgress(90);

      // 6. Merge with Video
      const needsMerging = !finalVideoUrl || 
                           lastProcessedAudioMode !== audioMode || 
                           lastProcessedVideoQuality !== videoQuality || 
                           lastProcessedIncludeSubtitles !== includeSubtitles ||
                           lastProcessedMaskSubtitles !== maskOriginalSubtitles ||
                           needsDubbing;

      if (needsMerging) {
        setStatus('merging');
        setProgress(95);
        
        const response = await fetch('/api/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            videoFilename: currentFilename, 
            audioBase64: currentDubbedAudio,
            videoQuality: videoQuality,
            audioMode: audioMode,
            includeSubtitles: includeSubtitles,
            maskOriginalSubtitles: maskOriginalSubtitles,
            transcript: currentTranscript
          }),
        });
        const mergeData = await response.json();
        if (!mergeData.success) throw new Error(mergeData.error || 'Lỗi ghép âm thanh và video.');
        
        const finalUrl = mergeData.url;
        setFinalVideoUrl(finalUrl);
        
        setLastProcessedAudioMode(audioMode);
        setLastProcessedVideoQuality(videoQuality);
        setLastProcessedIncludeSubtitles(includeSubtitles);
        setLastProcessedMaskSubtitles(maskOriginalSubtitles);

        // Save history item
        const newHistoryItem = {
          id: Date.now().toString(),
          filename: currentFilename,
          originalName: file?.name || 'video.mp4',
          targetLang,
          voice: selectedVoice,
          finalVideoUrl: finalUrl,
          transcript: [...currentTranscript],
          timestamp: Date.now()
        };
        setHistory(prev => [newHistoryItem, ...prev]);
      }

      setStatus('completed');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Lỗi xử lý không xác định.');
    }
  };

  const handleTranslateOnly = async () => {
    if (transcript.length === 0) return;
    const { provider, model } = getAIApiConfig(selectedModel);
    
    try {
      setIsTranslatingOnly(true);
      setStatus('translating');
      setProgress(50);
      
      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Tiếng Việt';
      const response = await fetch('/api/dubbing/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: transcript, targetLanguage: targetLangName, provider, model })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Dịch thuật phụ đề thất bại.');
      
      setTranscript(data.data);
      setStatus('completed');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Lỗi khi dịch phụ đề.');
    } finally {
      setIsTranslatingOnly(false);
    }
  };

  const handleRedub = async () => {
    if (!uploadedFilename || transcript.length === 0) return;
    const { model } = getAIApiConfig(selectedModel);

    try {
      setFinalVideoUrl(null);
      setStatus('dubbing');
      setProgress(40);

      // Generate TTS from edited transcript
      const fullTranslatedText = transcript.map(s => s.translatedText || "").join(' ').trim();
      if (!fullTranslatedText) {
        throw new Error("Bản dịch trống. Hãy nhập nội dung dịch trước khi lồng tiếng lại.");
      }

      const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Tiếng Việt';
      const newAudioBase64 = await generateSpeechAudio(fullTranslatedText, selectedVoice, targetLangName, model);
      setDubbedAudioBase64(newAudioBase64);
      setLastProcessedVoice(selectedVoice);
      setLastProcessedLang(targetLang);
      setIsTranscriptEdited(false);
      setProgress(75);

      // Merge with Video
      setStatus('merging');
      const mergeResponse = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoFilename: uploadedFilename, 
          audioBase64: newAudioBase64,
          videoQuality: videoQuality,
          audioMode: audioMode,
          includeSubtitles: includeSubtitles,
          maskOriginalSubtitles: maskOriginalSubtitles,
          transcript: transcript
        }),
      });
      const mergeData = await mergeResponse.json();
      if (!mergeData.success) throw new Error(mergeData.error || 'Lỗi ghép video lồng tiếng mới.');
      
      const finalUrlPath = mergeData.url;
      setFinalVideoUrl(finalUrlPath);
      
      // Update history list
      setHistory(prev => prev.map(item => 
        item.filename === uploadedFilename 
          ? { ...item, finalVideoUrl: finalUrlPath, transcript: [...transcript], timestamp: Date.now() }
          : item
      ));

      setStatus('completed');
      setProgress(100);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Lỗi khi lồng tiếng lại.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setVideoUrl(null);
    setFinalVideoUrl(null);
    setTranscript([]);
    setUploadedFilename(null);
    setOriginalAudioBase64(null);
    setDubbedAudioBase64(null);
    setLastProcessedLang(null);
    setLastProcessedVoice(null);
    setLastProcessedAudioMode(null);
    setLastProcessedVideoQuality(null);
    setLastProcessedIncludeSubtitles(false);
    setLastProcessedMaskSubtitles(false);
    setIsTranscriptEdited(false);
    setStatus('idle');
    setProgress(0);
    setErrorMessage('');
    setDownloadError('');
  };

  const retranslateTimerRef = useRef({});

  const handleTextChange = useCallback((index, value) => {
    setTranscript(prev => {
      const next = [...prev];
      next[index] = { ...next[index], text: value, isTranslating: true };
      return next;
    });
    setIsTranscriptEdited(true);

    if (retranslateTimerRef.current[index]) {
      clearTimeout(retranslateTimerRef.current[index]);
    }

    retranslateTimerRef.current[index] = setTimeout(async () => {
      if (!value.trim()) {
        setTranscript(prev => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], translatedText: '', isTranslating: false };
          return next;
        });
        return;
      }
      try {
        const { provider, model } = getAIApiConfig(selectedModel);
        const targetLangName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Tiếng Việt';
        const res = await fetch('/api/dubbing/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segments: [{ start: 0, end: 0, text: value }],
            targetLanguage: targetLangName,
            provider,
            model
          })
        });
        const data = await res.json();
        if (data.success && data.data?.[0]?.translatedText) {
          setTranscript(prev => {
            const next = [...prev];
            if (next[index]) {
              next[index] = {
                ...next[index],
                translatedText: data.data[0].translatedText,
                isTranslating: false
              };
            }
            return next;
          });
        }
      } catch (err) {
        console.warn('Re-translate segment error:', err);
      } finally {
        setTranscript(prev => {
          const next = [...prev];
          if (next[index]) next[index] = { ...next[index], isTranslating: false };
          return next;
        });
      }
    }, 700);
  }, [selectedModel, targetLang]);

  const handleTranslatedTextChange = useCallback((index, value) => {
    setTranscript(prev => {
      const next = [...prev];
      next[index] = { ...next[index], translatedText: value };
      return next;
    });
    setIsTranscriptEdited(true);
  }, []);

  const loadFromHistory = (item) => {
    setUploadedFilename(item.filename);
    setTranscript(item.transcript);
    setFinalVideoUrl(item.finalVideoUrl);
    setTargetLang(item.targetLang);
    setSelectedVoice(item.voice);
    setLastProcessedLang(item.targetLang);
    setLastProcessedVoice(item.voice);
    setLastProcessedAudioMode(null);
    setLastProcessedVideoQuality(null);
    setStatus('completed');
    setProgress(100);
    setShowHistory(false);
    setFile({ name: item.originalName });
  };

  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleDownloadFinalVideo = async () => {
    if (!finalVideoUrl || isDownloading) return;
    const cleanFilename = extractMktFlowFilename(finalVideoUrl);
    if (!cleanFilename) {
      setDownloadError('Không xác định được tên file video để tải về.');
      return;
    }

    setIsDownloading(true);
    setDownloadError('');
    try {
      const res = await fetch(`/api/download/${encodeURIComponent(cleanFilename)}`);
      if (!res.ok) {
        let msg = `Tải video thất bại (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.error) msg = errJson.error;
        } catch {
          // ignore non-JSON error body
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const downloadName = cleanFilename.includes('_logo')
        ? 'video_long_tieng_logo.mp4'
        : 'video_long_tieng.mp4';
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (err) {
      console.error('[VideoDubbing] Download failed:', err);
      setDownloadError(err?.message || 'Không thể tải video đã lồng tiếng.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* Header */}
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.55rem' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)', flexShrink: 0
          }}>
            <Mic size={22} color="white" />
          </div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Lồng Tiếng Video</h1>
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', display: 'flex', gap: '0.35rem', borderRadius: '8px' }}
            >
              <History size={15} />
              Lịch sử
            </button>
          </div>
        </div>
      </div>

      {!hasApiKey && (
        <div className="alert alert-error">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Thiếu cấu hình API Key:</strong> Chuyển qua tab <strong>Cấu hình</strong> ở menu bên trái. Tính năng này yêu cầu <strong>khóa Google Gemini</strong> (để lồng tiếng) và <strong>khóa API của Model được chọn</strong> (để nhận diện thoại & dịch thuật).
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid-2" style={{ gridTemplateColumns: '350px 1fr', alignItems: 'start' }}>
        
        {/* Left column: Upload & Configuration */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.55rem' }}>
            <Settings2 size={16} style={{ color: '#818cf8' }} /> CẤU HÌNH LỒNG TIẾNG
          </h3>

          {/* Upload Section */}
          <div {...getRootProps()} style={{
            border: '2px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '1.5rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragActive ? 'rgba(99, 102, 241, 0.08)' : 'rgba(0,0,0,0.15)',
            borderColor: isDragActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.65rem'
          }}>
            <input {...getInputProps()} />
            <Upload size={24} style={{ color: 'var(--text-sub)' }} />
            <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {file ? file.name : "Kéo thả hoặc click chọn video"}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-sub)', display: 'block', marginTop: '0.2rem' }}>MP4 hoặc MOV (Tối đa 100MB)</span>
            </div>
          </div>

          {file && (status === 'completed' || status === 'idle' || status === 'error') && (
            <button 
              onClick={handleReset}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', borderRadius: '8px' }}
            >
              <RotateCcw size={14} /> Chọn video khác
            </button>
          )}

          {/* Model AI Selection */}
          <div className="form-group" style={{ margin: 0 }}>
            <ModelSelector
              value={selectedModel}
              onChange={(val) => setSelectedModel(val)}
              storageKey="model_video_dubbing"
              geminiModels={geminiModels}
              label="🤖 CHỌN MODEL AI"
            />
          </div>

          {/* Language Control */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Ngôn ngữ dịch tới</label>
            <select
              value={targetLang}
              onChange={(e) => {
                const newLang = e.target.value;
                setTargetLang(newLang);
                if (newLang === 'km') {
                  const isVietnameseOnly = selectedVoice.startsWith('clone:') || 
                                           selectedVoice === 'adam' || 
                                           selectedVoice === 'doantrang' || 
                                           selectedVoice.startsWith('vnev3_') ||
                                           selectedVoice.startsWith('vi-VN-');
                  if (isVietnameseOnly) {
                    setSelectedVoice('km-KH-SreymomNeural');
                  }
                } else if (newLang === 'vi') {
                  if (selectedVoice.startsWith('km-KH-')) {
                    setSelectedVoice('vi-VN-HoaiMyNeural');
                  }
                }
              }}
              className="input-control"
              style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Voice Control */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Giọng đọc AI (TTS)</label>
              <button
                type="button"
                onClick={handlePreviewVoice}
                style={{
                  background: isPreviewing ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                  border: `1px solid ${isPreviewing ? '#ef4444' : 'rgba(99, 102, 241, 0.4)'}`,
                  color: isPreviewing ? '#f87171' : '#a5b4fc',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
                title="Nghe thử giọng đọc đã chọn"
              >
                {isPreviewing ? <Square size={12} fill="currentColor" /> : <Volume2 size={12} />}
                {isPreviewing ? 'Dừng' : 'Nghe thử'}
              </button>
            </div>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="input-control"
              style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
            >
              {voiceGroups.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.voices.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {targetLang === 'km' && (
              <div style={{ fontSize: '0.73rem', color: '#38bdf8', marginTop: '0.35rem', lineHeight: 1.3 }}>
                🇰🇭 Đang dịch Tiếng Khmer: Khuyên dùng giọng <b>Sreymom</b> hoặc <b>Piseth</b> (mục Edge-TTS) hoặc Google Gemini. <i>(Giọng Clone/VieNeu chỉ đọc Tiếng Việt)</i>
              </div>
            )}
          </div>

          {/* Quality Control */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Độ phân giải xuất video</label>
            <select
              value={videoQuality}
              onChange={(e) => setVideoQuality(e.target.value)}
              className="input-control"
              style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem' }}
            >
              <option value="original">Gốc (Giữ nguyên)</option>
              <option value="1080p">Full HD (1080p)</option>
              <option value="720p">HD (720p)</option>
              <option value="480p">SD (480p)</option>
            </select>
          </div>

          {/* Audio Mixing Config */}
          <div className="form-group" style={{ margin: 0, gap: '0.35rem' }}>
            <label className="form-label">Xử lý âm thanh gốc</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', backgroundColor: audioMode === 'keep_fx' ? 'rgba(99,102,241,0.1)' : 'transparent', borderColor: audioMode === 'keep_fx' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: '0.8rem' }}>
                <input type="radio" checked={audioMode === 'keep_fx'} onChange={() => setAudioMode('keep_fx')} style={{ display: 'none' }} />
                <span>Loại bỏ giọng gốc (giữ nhạc và hiệu ứng)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', backgroundColor: audioMode === 'mute' ? 'rgba(99,102,241,0.1)' : 'transparent', borderColor: audioMode === 'mute' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: '0.8rem' }}>
                <input type="radio" checked={audioMode === 'mute'} onChange={() => setAudioMode('mute')} style={{ display: 'none' }} />
                <span>Tắt hoàn toàn âm gốc (chỉ lồng tiếng mới)</span>
              </label>
            </div>
          </div>

          {/* Subtitle options */}
          <div className="form-group" style={{ margin: 0, gap: '0.35rem' }}>
            <label className="form-label">Cài đặt phụ đề xuất</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={includeSubtitles} onChange={(e) => setIncludeSubtitles(e.target.checked)} />
                <span>Ghép phụ đề mới vào video xuất</span>
              </label>
              {includeSubtitles && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '1.25rem' }}>
                  <input type="checkbox" checked={maskOriginalSubtitles} onChange={(e) => setMaskOriginalSubtitles(e.target.checked)} />
                  <span>Che phụ đề video cũ (bôi đen)</span>
                </label>
              )}
            </div>
          </div>

          {/* Run Action */}
          <button
            onClick={handleProcess}
            disabled={!file || !hasApiKey || (status !== 'idle' && status !== 'completed' && status !== 'error' && status !== 'awaiting_confirmation')}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', justifyContent: 'center', fontSize: '0.9rem', marginTop: '0.5rem' }}
          >
            {status === 'idle' || status === 'completed' || status === 'error' ? (
              <><Play size={16} fill="currentColor" /> Bắt đầu lồng tiếng</>
            ) : status === 'awaiting_confirmation' ? (
              <><CheckCircle2 size={16} /> Xác nhận &amp; Lồng tiếng</>
            ) : (
              <><Loader2 size={16} className="spinner" /> Đang xử lý...</>
            )}
          </button>

          {/* Stepper Status Panel */}
          {status !== 'idle' && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.875rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>TIẾN TRÌNH</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8' }}>{progress}%</span>
              </div>
              <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
              </div>
              
              <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 500, marginTop: '0.2rem' }}>
                {status === 'uploading' && "Đang tải video lên server cục bộ..."}
                {status === 'transcribing' && "Đang gửi âm thanh lên Gemini nhận diện thoại..."}
                {status === 'awaiting_confirmation' && "Nhận diện xong! Kiểm tra lời thoại ở cột bên phải."}
                {status === 'translating' && "Đang dịch lời thoại sang tiếng đích..."}
                {status === 'dubbing' && "Đang gọi Gemini Neural TTS sinh giọng nói..."}
                {status === 'merging' && "Đang dùng FFmpeg ghép video và âm thanh..."}
                {status === 'completed' && "✓ Hoàn tất lồng tiếng video!"}
                {status === 'error' && "❌ Đã xảy ra lỗi khi xử lý!"}
              </span>
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="alert alert-error" style={{ fontSize: '0.8rem', padding: '0.65rem 0.85rem', margin: 0 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {errorMessage}
            </div>
          )}
        </div>

        {/* Right column: Preview Video & Subtitle Edit */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', minHeight: '550px' }}>
          
          {/* Video Preview Aspect Box */}
          <div style={{
            backgroundColor: '#030712',
            borderRadius: '12px',
            overflow: 'hidden',
            aspectRatio: '16/9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            {finalVideoUrl ? (
              <video 
                key={finalVideoUrl}
                src={resolveMktFlowUrl(finalVideoUrl)} 
                controls 
                preload="metadata"
                type="video/mp4"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : videoUrl ? (
              <video 
                key={videoUrl}
                src={resolveMktFlowUrl(videoUrl)} 
                controls 
                preload="metadata"
                onError={handleVideoError}
                type="video/mp4"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-sub)' }}>
                <Video size={36} />
                <span style={{ fontSize: '0.85rem' }}>Xem trước video tải lên tại đây</span>
              </div>
            )}

            {finalVideoUrl && (
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'var(--accent-success)',
                color: 'white',
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
              }}>
                <CheckCircle2 size={10} /> ĐÃ LỒNG TIẾNG
              </div>
            )}
          </div>

          {/* Subtitle section header & actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '0.85rem'
          }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Lời thoại &amp; Bản dịch</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>Chỉnh sửa trực tiếp text để tạo giọng đọc lồng tiếng mới</p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {status === 'awaiting_confirmation' && (
                <button 
                  onClick={handleProcess}
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '8px' }}
                >
                  <CheckCircle2 size={14} /> Xác nhận &amp; Tiếp tục
                </button>
              )}
              {transcript.length > 0 && (status === 'completed' || status === 'idle' || status === 'error') && (
                <>
                  <button 
                    onClick={handleTranslateOnly}
                    disabled={isTranslatingOnly}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
                  >
                    {isTranslatingOnly ? <Loader2 size={14} className="spinner" /> : <Languages size={14} />}
                    Dịch lại
                  </button>
                  <button 
                    onClick={handleRedub}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.3)', color: '#c7d2fe' }}
                  >
                    <Mic size={14} /> Lồng tiếng lại
                  </button>
                </>
              )}
              {finalVideoUrl && (
                <>
                  <button
                    onClick={() => setShowLogoPanel(true)}
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.35)', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Stamp size={14} /> Thêm Logo
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFinalVideo}
                    disabled={isDownloading}
                    className="btn btn-primary"
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '8px', opacity: isDownloading ? 0.75 : 1, cursor: isDownloading ? 'wait' : 'pointer' }}
                  >
                    {isDownloading ? (
                      <><Loader2 size={14} className="spinner" /> Đang tải...</>
                    ) : (
                      <><Download size={14} /> Tải về</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {downloadError && (
            <div className="alert alert-error" style={{ fontSize: '0.8rem', padding: '0.6rem 0.85rem', margin: 0 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {downloadError}
            </div>
          )}

          {/* Subtitle List */}
          <div style={{
            flexGrow: 1,
            maxHeight: '320px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.25rem'
          }}>
            {transcript.length > 0 ? (
              transcript.map((seg, i) => (
                <TranscriptItem 
                  key={`${seg.start}-${i}`}
                  index={i}
                  seg={seg}
                  targetLang={targetLang}
                  onTextChange={handleTextChange}
                  onTranslatedTextChange={handleTranslatedTextChange}
                />
              ))
            ) : (
              <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', fontSize: '0.8rem', gap: '0.5rem' }}>
                <Loader2 size={24} className={status !== 'idle' && status !== 'completed' && status !== 'awaiting_confirmation' && "spinner"} style={{ opacity: status !== 'idle' ? 0.7 : 0.2 }} />
                <span style={{ fontStyle: 'italic' }}>
                  {status === 'awaiting_confirmation' 
                    ? "Vui lòng xem lại thoại gốc ở trên rồi nhấn 'Xác nhận & Lồng tiếng'"
                    : status !== 'idle'
                      ? "Hệ thống đang trích xuất giọng nói..."
                      : "Tải video lên và bấm 'Bắt đầu lồng tiếng' để lấy lời thoại."
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logo Watermark Panel */}
      <AnimatePresence>
        {showLogoPanel && (
          <LogoWatermarkPanel
            finalVideoUrl={resolveMktFlowUrl(finalVideoUrl)}
            onClose={() => setShowLogoPanel(false)}
            onLogoApplied={(newUrl) => {
              setFinalVideoUrl(newUrl);
              setHistory(prev => prev.map(item =>
                item.filename === uploadedFilename ? { ...item, finalVideoUrl: newUrl, timestamp: Date.now() } : item
              ));
              setShowLogoPanel(false);
            }}
            onLogoRemoved={() => {
              if (finalVideoUrl) {
                const cleanUrl = finalVideoUrl.split('?')[0].replace('_logo.mp4', '.mp4');
                const nextUrl = cleanUrl + '?t=' + Date.now();
                setFinalVideoUrl(nextUrl);
                setHistory(prev => prev.map(item =>
                  item.filename === uploadedFilename ? { ...item, finalVideoUrl: nextUrl, timestamp: Date.now() } : item
                ));
              }
              setShowLogoPanel(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* History Slide-over overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(3, 7, 18, 0.4)',
                backdropFilter: 'blur(4px)',
                zIndex: 99
              }}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'fixed',
                right: 0,
                top: 0,
                bottom: 0,
                width: '100%',
                maxWidth: '400px',
                backgroundColor: '#0c1020',
                borderLeft: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History className="text-indigo-500" size={18} /> Lịch sử lồng tiếng
                </h4>
                <button 
                  onClick={() => setShowHistory(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Đóng
                </button>
              </div>

              <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {history.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-sub)', fontSize: '0.8rem', gap: '0.5rem' }}>
                    <History size={32} />
                    <span>Chưa có tệp video nào đã lồng tiếng</span>
                  </div>
                ) : (
                  history.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      style={{
                        padding: '1rem',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        position: 'relative',
                        transition: 'border-color 0.2s ease'
                      }}
                      className="group hover:border-indigo-500/40"
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', paddingRight: '1.5rem' }}>
                        {item.originalName}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                          {LANGUAGES.find(l => l.code === item.targetLang)?.name || item.targetLang}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-sub)' }}>
                          {new Date(item.timestamp).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => { deleteHistoryItem(item.id, e); }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '8px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-sub)',
                          cursor: 'pointer',
                          opacity: 0.5,
                          transition: 'opacity 0.2s ease'
                        }}
                        className="group-hover:opacity-100 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
