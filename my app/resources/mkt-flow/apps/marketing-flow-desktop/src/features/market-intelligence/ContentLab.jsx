import React, { useState, useEffect, useCallback } from 'react';
import { getInitialModel, getAIApiConfig, getGeminiModels } from '../../utils.js';
import ModelSelector from '../../shared/components/ModelSelector.jsx';
import { buildMIAgentPool, serializeAgentPool } from '../../utils/orchestrator/router.js';

// ─── Constants ──────────────────────────────────────────────
const FRAMEWORKS = [
  {
    id: 'first_principles',
    icon: '🔬',
    name: 'Product Feature Analytics',
    desc: 'Phân tích sản phẩm chi tiết đặc tính, điểm mạnh, điểm yếu của sản phẩm.',
  },
  {
    id: 'pain_point',
    icon: '🧠',
    name: 'Customer Insight Analytics',
    desc: 'Phân tích insight khách hàng mục tiêu, từ đó khai thác nỗi đau và các điểm chạm của khách hàng.',
  },
  {
    id: 'full',
    icon: '⚡',
    name: 'Full Market Intelligence',
    desc: 'Ma trận phân tích tổng hợp — khuyến nghị cho chiến dịch quan trọng.',
    recommended: true,
  },
];

const LOCATIONS = [
  { value: 'Campuchia (Tổng quan)', label: '🇰🇭 Campuchia (Tổng quan)' },
  { value: 'Phnom Penh', label: '🏙️ Phnom Penh' },
  { value: 'Siem Reap', label: '🏛️ Siem Reap' },
  { value: 'Sihanoukville', label: '⛱️ Sihanoukville' },
  { value: 'Battambang', label: '🌾 Battambang' },
  { value: 'Kandal', label: '🏘️ Kandal' },
  { value: 'Prey Veng', label: '🌿 Prey Veng' },
  { value: 'Takeo', label: '🌺 Takeo' },
];

const LOADING_STEPS = [
  { icon: '🔍', text: 'Đang quét thị trường Campuchia...' },
  { icon: '🕵️', text: 'Đang phân tích đối thủ cạnh tranh...' },
  { icon: '📊', text: 'Đang xây dựng bản đồ giá thị trường...' },
  { icon: '🧠', text: 'Đang khai thác insight khách hàng...' },
  { icon: '🎯', text: 'Đang xây dựng ma trận góc tiếp cận...' },
  { icon: '✅', text: 'Hoàn tất báo cáo nghiên cứu...' },
];

// Dynamic tabs theo framework
const TABS_FULL = [
  { id: 0, icon: '🕵️', label: 'Báo cáo Đối thủ' },
  { id: 1, icon: '👤', label: 'Insight Khách hàng' },
  { id: 2, icon: '🎯', label: 'Ma trận Góc tiếp cận' },
  { id: 3, icon: '📱', label: 'Facebook Ads Library' },
];
const TABS_PRODUCT = [
  { id: 0, icon: '🔬', label: 'Phân rã Tính năng' },
  { id: 1, icon: '⚡', label: 'Điểm mạnh / Yếu' },
  { id: 2, icon: '📊', label: 'Ma trận Giá trị' },
  { id: 3, icon: '🖥️', label: 'Lộ trình Sản phẩm' },
];
const TABS_INSIGHT = [
  { id: 0, icon: '👤', label: 'Chân dung Thấu cảm' },
  { id: 1, icon: '💢', label: 'Nỗi đau & Kỳ vọng' },
  { id: 2, icon: '🗺️', label: 'Bản đồ Điểm chạm' },
  { id: 3, icon: '💡', label: 'Insight Vàng' },
];
function getTabsForFramework(fw) {
  if (fw === 'first_principles') return TABS_PRODUCT;
  if (fw === 'pain_point') return TABS_INSIGHT;
  return TABS_FULL;
}

const ANGLE_COLORS = [
  { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', accent: '#818cf8', tag: 'rgba(99,102,241,0.15)' },
  { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', accent: '#34d399', tag: 'rgba(16,185,129,0.12)' },
  { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', accent: '#fbbf24', tag: 'rgba(245,158,11,0.12)' },
  { bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.2)', accent: '#f472b6', tag: 'rgba(236,72,153,0.12)' },
  { bg: 'rgba(6,182,212,0.06)', border: 'rgba(6,182,212,0.2)', accent: '#22d3ee', tag: 'rgba(6,182,212,0.12)' },
];

// getInitialModel & getAIApiConfig are imported from '../utils.js'

// ─── PRODUCT FEATURE ANALYTICS COMPONENTS ─────────────────────

function ScoreBadge({ score }) {
  const s = Number(score) || 0;
  const color = s >= 8 ? '#34d399' : s >= 6 ? '#fbbf24' : '#f87171';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: `${color}18`, border: `1.5px solid ${color}40`, fontSize: '11px', fontWeight: 800, color, flexShrink: 0 }}>
      {s}
    </span>
  );
}

function FeatureGroup({ label, accent, items = [] }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent, display: 'inline-block' }} />
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((f, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <ScoreBadge score={f.score} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '3px' }}>{f.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{f.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductFeatureTab({ data }) {
  const { core_features = [], supporting_features = [], usp_features = [] } = data?.feature_deconstruction || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} className="tab-content-anim">
      <FeatureGroup label="Ðặc tính Cốt lõi (Core)" accent="#818cf8" items={core_features} />
      <FeatureGroup label="Ðặc tính Bổ trợ (Supporting)" accent="#fbbf24" items={supporting_features} />
      <FeatureGroup label="Ðặc tính Khác biệt / USP" accent="#34d399" items={usp_features} />
    </div>
  );
}

function StrengthsWeaknessesTab({ data }) {
  const { strengths = [], weaknesses = [] } = data?.strengths_weaknesses || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      <div>
        <SectionTitle icon="✅" title="Điểm mạnh nổi bật" badge="Vũ khí cạnh tranh" badgeColor="#34d399" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {strengths.map((s, i) => (
            <div key={i} style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#6ee7b7', marginBottom: '4px' }}>{s.feature}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{s.reason}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <SectionTitle icon="⚠️" title="Điểm yếu & Lỗ hổng" badge="Cần khắc phục" badgeColor="#ef4444" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {weaknesses.map((w, i) => (
            <div key={i} style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fca5a5', marginBottom: '4px' }}>{w.feature}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '6px' }}>{w.issue}</div>
              {w.competitor_gap && <div style={{ fontSize: '11px', color: '#f472b6', borderTop: '1px solid rgba(239,68,68,0.1)', paddingTop: '6px' }}>🛡️ Đối thủ hơn: {w.competitor_gap}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ValueMatrixTab({ data }) {
  const { quick_wins = [], major_projects = [], fill_ins = [], thankless_tasks = [] } = data?.value_matrix || {};
  const quadrants = [
    { key: 'quick_wins', label: '⚡ Quick Wins', sub: 'Giá trị cao • Dễ thực hiện', items: quick_wins, accent: '#34d399', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)' },
    { key: 'major_projects', label: '🚀 Major Projects', sub: 'Giá trị cao • Phức tạp', items: major_projects, accent: '#818cf8', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.2)' },
    { key: 'fill_ins', label: '📌 Fill-ins', sub: 'Giá trị thấp • Dễ làm', items: fill_ins, accent: '#fbbf24', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
    { key: 'thankless_tasks', label: '❌ Thankless Tasks', sub: 'Giá trị thấp • Tốn kém', items: thankless_tasks, accent: '#f87171', bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.15)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="tab-content-anim">
      {quadrants.map(q => (
        <div key={q.key} style={{ background: q.bg, border: `1px solid ${q.border}`, borderRadius: '12px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: q.accent, marginBottom: '2px' }}>{q.label}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-sub)', marginBottom: '10px' }}>{q.sub}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {q.items.map((it, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '2px' }}>{it.feature}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.45 }}>{it.why}</div>
              </div>
            ))}
            {q.items.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-sub)', fontStyle: 'italic' }}>Không có</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoadmapTab({ data }) {
  const { keep_optimize = [], remove_reduce = [], add_urgently = [] } = data?.roadmap_recommendations || {};
  const benchmark = data?.competitive_benchmark || [];
  const sections = [
    { items: keep_optimize, icon: '✅', label: 'Giữ nguyên / Tối ưu', accent: '#34d399', bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.15)', fieldKey: 'action' },
    { items: add_urgently, icon: '⚡', label: 'Thêm mới khẩn cấp', accent: '#818cf8', bg: 'rgba(99,102,241,0.05)', border: 'rgba(99,102,241,0.15)', fieldKey: 'reason' },
    { items: remove_reduce, icon: '🗑️', label: 'Loại bỏ / Thu gọn', accent: '#f87171', bg: 'rgba(239,68,68,0.04)', border: 'rgba(239,68,68,0.12)', fieldKey: 'reason' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      {sections.map((s) => (
        <div key={s.label}>
          <SectionTitle icon={s.icon} title={s.label} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {s.items.map((it, i) => (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{s.icon}</span>
                <div><div style={{ fontSize: '12px', fontWeight: 700, color: s.accent, marginBottom: '2px' }}>{it.feature}</div><div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{it[s.fieldKey]}</div></div>
              </div>
            ))}
            {s.items.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-sub)', fontStyle: 'italic', padding: '8px 0' }}>Không có</div>}
          </div>
        </div>
      ))}
      {benchmark.length > 0 && (
        <div>
          <SectionTitle icon="⚔️" title="Bảng Đối sánh Cạnh tranh" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {benchmark.map((b, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>🏢 {b.competitor}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[{ l: 'Đi trước chúng tôi', v: b.ahead_of_us, c: '#f87171' }, { l: 'Bằng vai', v: b.on_par, c: '#fbbf24' }, { l: 'Chúng tôi dẫn đầu', v: b.we_lead, c: '#34d399' }].map(col => (
                    <div key={col.l} style={{ fontSize: '11px' }}><div style={{ color: col.c, fontWeight: 700, marginBottom: '3px' }}>{col.l}</div><div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{col.v || '—'}</div></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CUSTOMER INSIGHT ANALYTICS COMPONENTS ──────────────────

function EmpathyPersonaTab({ data }) {
  const personas = data?.empathy_personas || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="tab-content-anim">
      {personas.map((p, i) => (
        <div key={i} style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,#4c1d95,#1e1b4b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>👤</div>
            <div><div style={{ fontSize: '14px', fontWeight: 800, color: '#c7d2fe' }}>{p.persona_name}</div><div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>{p.demographics}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[{ icon: '📱', label: 'Hành vi số', val: p.digital_behavior }, { icon: '🕸️', label: 'Động lực ẩn (Motive)', val: p.hidden_motive }].map(row => (
              <div key={row.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 700, marginBottom: '4px' }}>{row.icon} {row.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{row.val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 700, marginBottom: '4px' }}>🌅 Thói quen hàng ngày</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{p.daily_habits}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PainGainsTab({ data }) {
  const pg = data?.pain_gains || {};
  const painLayers = [
    { label: '💸 Tài chính — Lãng phí tiền bạc', val: pg.pain_financial, accent: '#ef4444' },
    { label: '⏱️ Năng suất — Mất thời gian', val: pg.pain_productivity, accent: '#f97316' },
    { label: '🔄 Quá trình — Trải nghiệm bất tiện', val: pg.pain_process, accent: '#eab308' },
    { label: '💔 Cảm xúc — Lo lắng, thiếu an tâm', val: pg.pain_emotional, accent: '#f472b6' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      <div>
        <SectionTitle icon="💢" title="Nỗi đau — 4 tầng phân tích" badge="Pain Points" badgeColor="#ef4444" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {painLayers.map((pl, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: `${pl.accent}08`, border: `1px solid ${pl.accent}20`, borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: pl.accent, minWidth: '140px', flexShrink: 0, lineHeight: 1.4 }}>{pl.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, flex: 1 }}>{pl.val || '—'}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <SectionTitle icon="✨" title="Kỳ vọng — Mong muốn tối thượng" badge="Gains" badgeColor="#34d399" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', marginBottom: '6px' }}>🧠 Lý tính</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{pg.gains_rational || '—'}</div>
          </div>
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', marginBottom: '6px' }}>💖 Cảm tính</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{pg.gains_emotional || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TouchpointJourneyTab({ data }) {
  const tj = data?.touchpoint_journey || {};
  const getTempStyle = (temp) => {
    if (temp === 'hot') return { icon: '🔥', color: '#34d399', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' };
    if (temp === 'cold') return { icon: '❄️', color: '#f87171', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.18)' };
    return { icon: '🌡️', color: '#fbbf24', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)' };
  };
  const phases = [
    { label: '👀 Trước khi mua', key: 'pre_purchase', accent: '#818cf8' },
    { label: '🛝 Trong khi mua', key: 'during_purchase', accent: '#34d399' },
    { label: '📦 Sau khi mua', key: 'post_purchase', accent: '#fbbf24' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      {phases.map(ph => (
        <div key={ph.key}>
          <SectionTitle icon="" title={ph.label} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(tj[ph.key] || []).map((tp, i) => {
              const ts = getTempStyle(tp.temperature);
              return (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: ts.bg, border: `1px solid ${ts.border}`, borderRadius: '10px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>{ts.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: ts.color, marginBottom: '2px' }}>{tp.touchpoint}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{tp.emotion}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {tj.hot_touchpoints?.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '12px', padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', marginBottom: '8px' }}>🔥 Điểm chạm nóng — Quyết định mua hàng</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tj.hot_touchpoints.map((ht, i) => <span key={i} style={{ padding: '4px 10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '999px', fontSize: '11px', color: '#fbbf24' }}>{ht}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function GoldenInsightTab({ data }) {
  const gi = data?.golden_insight || {};
  const angles = data?.messaging_angles || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      {/* Golden Insight Formula */}
      <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(99,102,241,0.06))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '16px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{ fontSize: '20px' }}>💡</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>INSIGHT VÀNG</span>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.7, fontStyle: 'italic', fontWeight: 500, marginBottom: '16px', borderLeft: '3px solid #fbbf24', paddingLeft: '14px' }}>
          "{gi.insight_statement}"
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[{l: '🎯 Khách hàng muốn...', v: gi.formula_want, c: '#34d399'}, {l: '🚫 NHƯĐ họ gặp khó khăn vì...', v: gi.formula_barrier, c: '#f87171'}, {l: '✨ VÌ VẬY họ khát khao...', v: gi.formula_truth, c: '#fbbf24'}].map(row => (
            <div key={row.l} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: row.c, minWidth: '170px', flexShrink: 0, lineHeight: 1.5 }}>{row.l}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{row.v || '—'}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Messaging Angles */}
      {angles.length > 0 && (
        <div>
          <SectionTitle icon="🎨" title="Góc tiếp cận Truyền thông" badge={`${angles.length} angles`} badgeColor="#818cf8" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {angles.map((a, i) => {
              const col = ANGLE_COLORS[i % ANGLE_COLORS.length];
              return (
                <div key={i} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: col.accent, background: col.tag, padding: '2px 8px', borderRadius: '999px' }}>Angle #{i + 1}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{a.angle_name}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[{l: '🔋 Tâm lý kích hoạt', v: a.psychology_trigger}, {l: '💬 Thông điệp', v: a.message}].map(row => (
                      <div key={row.l} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '10px', color: col.accent, fontWeight: 700, marginBottom: '3px' }}>{row.l}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{row.v}</div>
                      </div>
                    ))}
                  </div>
                  {a.content_scenario && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', borderLeft: `2px solid ${col.accent}` }}>
                      <div style={{ fontSize: '10px', color: col.accent, fontWeight: 700, marginBottom: '2px' }}>🎥 Kịch bản Content</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{a.content_scenario}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 1: Competitor Report ──────────────────────────────
function CompetitorTab({ data }) {
  const { competitors = [], price_map_summary, visual_strategy_summary, flaws = [] } = data || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <SummaryCard icon="💰" label="Bản đồ giá thị trường" text={price_map_summary} color="#fbbf24" />
        <SummaryCard icon="🎬" label="Xu hướng Visual/Content" text={visual_strategy_summary} color="#818cf8" />
      </div>
      {competitors.length > 0 && (
        <div>
          <SectionTitle icon="🏪" title="Đối thủ cạnh tranh đang hoạt động" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {competitors.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Đối thủ</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{c.name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Khoảng giá</div>
                  <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 600 }}>{c.price_range || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Ưu đãi mồi khách</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.promotions || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Visual Strategy</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{c.visual_style || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {flaws.length > 0 && (
        <div>
          <SectionTitle icon="⚠️" title="Bảng đào bới điểm yếu đối thủ" badge="Cơ hội khai thác" badgeColor="#ef4444" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {flaws.map((f, i) => (
              <div key={i} style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>🔴</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fca5a5', marginBottom: '6px' }}>{f.issue}</div>
                    {f.evidence && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '2px solid rgba(239,68,68,0.3)' }}>💬 {f.evidence}</div>}
                    {f.opportunity && <div style={{ fontSize: '12px', color: '#34d399', display: 'flex', alignItems: 'flex-start', gap: '6px' }}><span style={{ flexShrink: 0 }}>→</span><span><strong style={{ color: '#6ee7b7' }}>Cơ hội:</strong> {f.opportunity}</span></div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Buyer Persona ──────────────────────────────────
function PersonaTab({ data }) {
  const { phnom_penh_behavior, provincial_behavior, logistics_barriers = [], payment_preferences, size_recommendations, key_concerns = [] } = data || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>🏙️</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc' }}>PHNOM PENH</div>
              <div style={{ fontSize: '10px', color: 'var(--text-sub)' }}>Thủ đô · Thu nhập cao</div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65 }}>{phnom_penh_behavior || '—'}</p>
        </div>
        <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>🌾</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399' }}>TỈNH THÀNH</div>
              <div style={{ fontSize: '10px', color: 'var(--text-sub)' }}>Nông thôn · Ưu tiên giá</div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65 }}>{provincial_behavior || '—'}</p>
        </div>
      </div>
      {payment_preferences && (
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>💳</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thói quen thanh toán & ABA / Wing / COD</div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65 }}>{payment_preferences}</p>
        </div>
      )}
      {logistics_barriers.length > 0 && (
        <div>
          <SectionTitle icon="🚚" title="Rào cản Logistics & Vận chuyển" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {logistics_barriers.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                <span style={{ color: '#f87171', fontWeight: 700, fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>!</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {key_concerns.length > 0 && (
        <div>
          <SectionTitle icon="🧠" title="Rào cản tâm lý khi mua hàng" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {key_concerns.map((c, i) => (
              <span key={i} style={{ padding: '6px 12px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '999px', fontSize: '12px', color: '#c4b5fd' }}>🔒 {c}</span>
            ))}
          </div>
        </div>
      )}
      {size_recommendations && (
        <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>📐</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Khuyến nghị thông số & Kích thước bản địa</div>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65 }}>{size_recommendations}</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Marketing Angles ───────────────────────────────
function AnglesTab({ data }) {
  const angles = data || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr', gap: '12px', padding: '8px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px' }}>
        {['Góc tiếp cận', 'Nỗi đau / Điểm chặn', 'Ý tưởng Visual', 'Hook gợi ý'].map((h, i) => (
          <div key={i} style={{ fontSize: '10px', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>
      {angles.map((angle, i) => {
        const colors = ANGLE_COLORS[i % ANGLE_COLORS.length];
        return (
          <div key={i} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '16px 14px', display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr', gap: '12px', alignItems: 'start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: colors.tag, borderRadius: '999px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px' }}>🎯</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent }}>Angle {i + 1}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>{angle.angle_name}</div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{angle.pain_point}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: `2px solid ${colors.accent}` }}>🎬 {angle.visual_idea}</div>
            <div style={{ fontSize: '12px', color: colors.accent, lineHeight: 1.6, fontStyle: 'italic' }}>"{angle.hook_suggestion}"</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab 4: Facebook Ads Library ───────────────────────────
function FacebookAdsTab({ data, product }) {
  const { search_query, activity_level, active_competitors = [], ad_creative_insights, recommended_ad_angles = [] } = data || {};
  
  // Build Facebook Ads Library link (KH for Cambodia)
  const queryToUse = search_query || product || '';
  const fbLink = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&q=${encodeURIComponent(queryToUse)}&country=KH&media_type=all`;

  const getActivityBadgeColor = (level) => {
    const lvl = (level || '').toLowerCase();
    if (lvl.includes('cao')) return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.25)', text: '#fca5a5' };
    if (lvl.includes('trung bình') || lvl.includes('vừa')) return { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.25)', text: '#fbbf24' };
    return { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.25)', text: '#34d399' };
  };

  const badgeColor = getActivityBadgeColor(activity_level);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="tab-content-anim">
      {/* Search Header */}
      <div style={{ background: 'rgba(24,119,242,0.06)', border: '1px solid rgba(24,119,242,0.15)', borderRadius: '14px', padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '20px' }}>📘</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>FACEBOOK ADS LIBRARY</div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
            Tìm kiếm trực tiếp các quảng cáo đang hoạt động tại thị trường Campuchia bằng từ khóa tối ưu đã được AI phân tích.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-sub)' }}>Từ khóa tối ưu:</span>
            <strong style={{ color: '#93c5fd' }}>"{queryToUse}"</strong>
          </div>
        </div>
        
        <a 
          href={fbLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn btn-primary" 
          style={{ background: '#1877f2', borderColor: '#1877f2', padding: '12px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'white', textDecoration: 'none', fontWeight: 600, fontSize: '13px', borderRadius: '8px', whiteSpace: 'nowrap' }}
        >
          <span>🔗</span> Mở Ads Library
        </a>
      </div>

      {/* Activity and Competitors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mức độ cạnh tranh quảng cáo</span>
          </div>
          <div style={{ display: 'inline-flex', padding: '4px 12px', background: badgeColor.bg, border: `1px solid ${badgeColor.border}`, color: badgeColor.text, borderRadius: '999px', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
            {activity_level || 'Chưa xác định'}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            {activity_level?.toLowerCase().includes('cao') 
              ? 'Thị trường quảng cáo trên Facebook rất khốc liệt. Cần đầu tư mạnh vào Visual Creative độc lạ để giữ chân khách hàng.'
              : 'Mức độ cạnh tranh vừa phải hoặc thấp. Cơ hội tốt để chiếm lĩnh thị trường qua các chiến dịch phễu hiệu quả.'}
          </p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>👥</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Fanpage hoạt động tích cực</span>
          </div>
          {active_competitors.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {active_competitors.map((comp, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#1877f2' }}>•</span>
                  <span>{comp}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: 0 }}>Không phát hiện fanpage đối thủ nổi bật chạy ads qua OSINT.</p>
          )}
        </div>
      </div>

      {/* Insights */}
      {ad_creative_insights && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '18px' }}>🎬</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Insight thiết kế hình ảnh & Video quảng cáo</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
            {ad_creative_insights}
          </p>
        </div>
      )}

      {/* Recommended angles */}
      {recommended_ad_angles.length > 0 && (
        <div>
          <SectionTitle icon="🎯" title="Góc quảng cáo tối ưu cho Facebook Ads" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {recommended_ad_angles.map((ang, idx) => (
              <div key={idx} style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc', marginBottom: '4px' }}>Ý tưởng #{idx + 1}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{ang}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI ──────────────────────────────────────────────
function SummaryCard({ icon, label, text, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: color || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>{text || '—'}</p>
    </div>
  );
}

function SectionTitle({ icon, title, badge, badgeColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{title}</span>
      {badge && <span style={{ padding: '2px 8px', background: `${badgeColor}18`, border: `1px solid ${badgeColor}30`, borderRadius: '999px', fontSize: '10px', fontWeight: 700, color: badgeColor }}>{badge}</span>}
    </div>
  );
}

function LoadingState({ step }) {
  const current = LOADING_STEPS[step] || LOADING_STEPS[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '420px', gap: '32px' }}>
      <div style={{ position: 'relative', width: '100px', height: '100px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)', animation: 'orb-pulse 2s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: '10px', borderRadius: '50%', border: '2px solid rgba(99,102,241,0.4)', animation: 'cl-spin 3s linear infinite' }} />
        <div style={{ position: 'absolute', inset: '20px', borderRadius: '50%', border: '1px solid rgba(139,92,246,0.3)', animation: 'cl-spin 2s linear infinite reverse' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>{current.icon}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>{current.text}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>Đang sử dụng Google Search để thu thập dữ liệu thực tế...</div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {LOADING_STEPS.map((_, i) => (
          <div key={i} style={{ width: i === step ? '24px' : '8px', height: '8px', borderRadius: '999px', background: i === step ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)', transition: 'all 0.4s ease' }} />
        ))}
      </div>
      <style>{`
        @keyframes orb-pulse { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.2);opacity:1} }
        @keyframes cl-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '420px', textAlign: 'center', gap: '16px' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🕵️</div>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Chờ lệnh kích hoạt</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-sub)', maxWidth: '300px', lineHeight: 1.6 }}>
          Nhập sản phẩm và nhấn <strong style={{ color: 'var(--text-muted)' }}>Kích hoạt Nghiên cứu</strong> để AI thu thập dữ liệu thực tế từ thị trường Campuchia.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {['🔍 OSINT & Web Search', '📊 Phân tích đối thủ', '🇰🇭 Insight bản địa'].map(tag => (
          <span key={tag} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '999px', fontSize: '11px', color: 'var(--text-sub)' }}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Export: ContentLab = Market Intelligence ─────────
export default function ContentLab() {
  const [product, setProduct] = useState('');
  const [location, setLocation] = useState('Campuchia (Tổng quan)');
  const [competitorLink, setCompetitorLink] = useState('');
  const [framework, setFramework] = useState('full');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  // ── Nhập thông tin sản phẩm bằng tay ────────────────────────
  const [manualInput, setManualInput] = useState(false);
  const [manualProductInfo, setManualProductInfo] = useState({ price: '', description: '', features: '' });
  const [selectedModel, setSelectedModel] = useState(() => getInitialModel('model_market_intelligence'));
  const [geminiModels, setGeminiModels] = useState(() => getGeminiModels());
  // ── Multi-Agent Orchestrator state ──────────────────────────
  const [multiAgentOn, setMultiAgentOn]   = useState(() => {
    try { return localStorage.getItem('mi_multi_agent_on') === 'true'; } catch { return false; }
  });
  const [agentPoolSummary, setAgentPoolSummary] = useState(null);
  const [agentPoolLoading, setAgentPoolLoading] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setGeminiModels(getGeminiModels());
    };
    window.addEventListener('gemini_models_updated', handleUpdate);
    return () => window.removeEventListener('gemini_models_updated', handleUpdate);
  }, []);

  // Load agentPool preview khi toggle bật
  const handleToggleMultiAgent = useCallback(async (newVal) => {
    setMultiAgentOn(newVal);
    try { localStorage.setItem('mi_multi_agent_on', String(newVal)); } catch { /* Storage may be unavailable. */ }
    if (newVal) {
      setAgentPoolLoading(true);
      try {
        const pool = await buildMIAgentPool({});
        setAgentPoolSummary(pool.summary || []);
      } catch (e) {
        console.warn('[Orchestrator] Không load được agent pool:', e.message);
        setAgentPoolSummary([]);
      } finally {
        setAgentPoolLoading(false);
      }
    } else {
      setAgentPoolSummary(null);
    }
  }, []);

  // Load preview lần đầu nếu toggle đang ON
  useEffect(() => {
    if (multiAgentOn) handleToggleMultiAgent(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // API Key Check
  const hasApiKey = true;

  useEffect(() => {
    if (!isLoading) return;
    let s = 0;
    const id = setInterval(() => { s = (s + 1) % LOADING_STEPS.length; setLoadingStep(s); }, 2800);
    return () => clearInterval(id);
  }, [isLoading]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setImageBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Gộp thông tin nhập tay thành chuỗi context cho AI
  const buildManualProductString = () => {
    const parts = [];
    if (product.trim()) parts.push(`Tên / Link sản phẩm: ${product.trim()}`);
    if (manualProductInfo.price.trim()) parts.push(`Giá bán: ${manualProductInfo.price.trim()}`);
    if (manualProductInfo.description.trim()) parts.push(`Mô tả sản phẩm: ${manualProductInfo.description.trim()}`);
    if (manualProductInfo.features.trim()) parts.push(`Đặc điểm nổi bật: ${manualProductInfo.features.trim()}`);
    return parts.join(' | ');
  };

  const handleAnalyze = async () => {
    if (!product.trim() && !imageBase64) { setError('Vui lòng nhập tên sản phẩm hoặc tải lên hình ảnh sản phẩm.'); return; }
    setIsLoading(true); setError(null); setResult(null); setActiveTab(0); setLoadingStep(0);

    try {
      let body;
      const productPayload = manualInput ? buildManualProductString() : product.trim();
      if (multiAgentOn) {
        // ── CHẾ ĐỘ ORCHESTRATOR ──────────────────────────────
        const pool = await buildMIAgentPool({ image: imageBase64 });
        body = JSON.stringify({
          product: productPayload,
          location,
          competitor_link: competitorLink.trim(),
          framework,
          mode: 'orchestrated',
          agentPool: serializeAgentPool(pool),
          image: imageBase64,
        });
      } else {
        // ── CHẾ ĐỘ CŨ (giữ nguyên 100%) ─────────────────────
        const { provider, apiKey, model } = getAIApiConfig(selectedModel);
        body = JSON.stringify({
          product: productPayload,
          location,
          competitor_link: competitorLink.trim(),
          framework,
          provider,
          apiKey,
          model,
          image: imageBase64,
        });
      }

      const resp = await fetch('/api/market-intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.error);
      // Đính kèm framework vào result để frontend route đúng component render
      setResult({ ...json.data, _framework: json.framework || framework });
      setActiveTab(0); // reset về tab đầu tiên khi có kết quả mới
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    fontFamily: 'var(--font-sans)', background: 'var(--bg-input)', border: '1px solid var(--border-color)',
    color: 'var(--text-main)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
    outline: 'none', width: '100%', transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
  };

  return (
    <div className="fade-in">
      <style>{`
        .mi-input:focus { border-color: rgba(99,102,241,0.5) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.1) !important; }
        .mi-input::placeholder { color: var(--text-sub); }
        .mi-input option { background: #121626; color: var(--text-main); }
        .fw-card { cursor: pointer; transition: all 0.2s ease; }
        .fw-card:hover { border-color: rgba(99,102,241,0.4) !important; transform: translateY(-1px); }
        .fw-card.active { background: rgba(99,102,241,0.1) !important; border-color: rgba(99,102,241,0.4) !important; }
        .intel-tab { cursor: pointer; transition: all 0.15s; border: none; background: none; font-family: var(--font-display); }
        .intel-tab:hover:not(.active-tab) { color: var(--text-main) !important; }
        @keyframes tab-fade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .tab-content-anim { animation: tab-fade 0.25s ease forwards; }
        .manual-toggle-btn { cursor: pointer; transition: all 0.2s; }
        .manual-toggle-btn:hover { border-color: rgba(16,185,129,0.4) !important; }
        .manual-form-field:focus { border-color: rgba(16,185,129,0.5) !important; box-shadow: 0 0 0 3px rgba(16,185,129,0.1) !important; }
        .manual-form-field::placeholder { color: var(--text-sub); }
      `}</style>

      {/* Header */}
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.5rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e1b4b, #4c1d95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.4), 0 0 0 1px rgba(99,102,241,0.2)', flexShrink: 0, fontSize: '20px' }}>🕵️</div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Nghiên Cứu Thị Trường</h1>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, padding: '0.3rem 0.8rem', borderRadius: '999px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc', letterSpacing: '0.05em', textTransform: 'uppercase' }}>OSINT · AI Search</span>
        </div>
      </div>

      {!hasApiKey && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
          <div>
            <strong>Thiếu cấu hình API Key:</strong> Chuyển qua tab <strong>Cấu hình</strong> ở menu bên trái và nhập API Key cho model đã chọn để sử dụng tính năng này.
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>

        {/* LEFT: Input */}
        <div style={{ position: 'sticky', top: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Block 1 */}
          <div className="glass-panel" style={{ padding: '18px', overflow: 'visible', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '16px' }}>📦</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>Thông tin sản phẩm & Thị trường</div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Hỗ trợ tìm bằng ảnh, từ khóa & link sản phẩm</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>Tên / Link sản phẩm *</label>
                <input className="mi-input" type="text" placeholder="VD: Váy công sở, hoặc dán link Shopee..." value={product} onChange={e => setProduct(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()} style={inputStyle} />
              </div>

              {/* ── NHẬP TAY TOGGLE ──────────────────────────── */}
              <div>
                <button
                  id="mi-manual-input-toggle"
                  className="manual-toggle-btn"
                  onClick={() => setManualInput(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                    background: manualInput ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                    border: manualInput ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    transition: 'all 0.2s',
                  }}
                  aria-label="Nhập thông tin sản phẩm bằng tay"
                >
                  {/* Checkbox tự vẽ */}
                  <span style={{
                    width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                    border: manualInput ? '2px solid #34d399' : '2px solid rgba(255,255,255,0.2)',
                    background: manualInput ? '#34d399' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {manualInput && <span style={{ color: '#0f172a', fontSize: '10px', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: manualInput ? '#6ee7b7' : 'var(--text-muted)' }}>
                    ✏️ Nhập thông tin sản phẩm bằng tay
                  </span>
                </button>

                {/* Form nhập tay — expand/collapse bằng max-height */}
                <div style={{
                  overflow: 'hidden',
                  maxHeight: manualInput ? '400px' : '0px',
                  opacity: manualInput ? 1 : 0,
                  transition: 'max-height 0.35s ease, opacity 0.25s ease',
                }}>
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: 'rgba(16,185,129,0.04)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    borderRadius: '10px',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                  }}>
                    {/* Giá bán */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Giá bán</label>
                      <input
                        className="manual-form-field"
                        type="text"
                        placeholder="VD: 150,000 VNĐ / 5$ / 20,000 KHR..."
                        value={manualProductInfo.price}
                        onChange={e => setManualProductInfo(p => ({ ...p, price: e.target.value }))}
                        style={{ ...inputStyle, border: '1px solid rgba(16,185,129,0.2)' }}
                      />
                    </div>
                    {/* Mô tả / Đặc điểm */}
                    <div>
                      <label style={{ fontSize: '10px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Mô tả / Đặc điểm nổi bật</label>
                      <textarea
                        className="manual-form-field"
                        placeholder="VD: Chất liệu PVC trong suốt, chống nước, độ bền cao, phù hợp che mưa & công trình..."
                        value={manualProductInfo.description}
                        onChange={e => setManualProductInfo(p => ({ ...p, description: e.target.value }))}
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical', minHeight: '72px', border: '1px solid rgba(16,185,129,0.2)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>Hình ảnh sản phẩm (Tìm bằng hình ảnh)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {imagePreview ? (
                    <div style={{ position: 'relative', width: '100%', height: '120px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button 
                        onClick={() => { setImagePreview(''); setImageBase64(''); }}
                        style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                        title="Xóa ảnh"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70px', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)', transition: 'all 0.2s' }} className="fw-card">
                      <span style={{ fontSize: '20px', marginBottom: '2px' }}>📷</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Tải ảnh lên hoặc kéo thả vào đây</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>Khu vực mục tiêu</label>
                <select className="mi-input" value={location} onChange={e => setLocation(e.target.value)} style={inputStyle}>
                  {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              {/* ModelSelector - ẩn khi Multi-Agent bật */}
              <div style={{
                overflow: multiAgentOn ? 'hidden' : 'visible',
                maxHeight: multiAgentOn ? '0px' : '500px',
                opacity: multiAgentOn ? 0 : 1,
                transition: 'max-height 0.3s ease, opacity 0.2s ease',
                marginBottom: multiAgentOn ? 0 : undefined,
              }}>
                <ModelSelector
                  value={selectedModel}
                  onChange={(val) => {
                    setSelectedModel(val);
                    localStorage.setItem('model_market_intelligence', val);
                  }}
                  storageKey="model_market_intelligence"
                  geminiModels={geminiModels}
                  label="🤖 Chọn Model AI"
                  providerOnly={['gemini', 'nvidia']}
                />
              </div>

              {/* ── MULTI-AGENT TOGGLE ────────────────────── */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: multiAgentOn
                  ? '1px solid rgba(99,102,241,0.4)'
                  : '1px solid rgba(255,255,255,0.07)',
                background: multiAgentOn
                  ? 'rgba(99,102,241,0.08)'
                  : 'rgba(255,255,255,0.02)',
                transition: 'all 0.25s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: agentPoolSummary ? '10px' : 0 }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: multiAgentOn ? '#a5b4fc' : 'var(--text-muted)' }}>
                      ⚡ Đa Chuyên Gia (Multi-Agent)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px' }}>
                      {multiAgentOn ? 'Orchestrator đang điều phối' : 'Bật để dùng AI tốt nhất cho từng bước'}
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <button
                    id="mi-multi-agent-toggle"
                    onClick={() => handleToggleMultiAgent(!multiAgentOn)}
                    style={{
                      width: '42px', height: '24px', borderRadius: '12px', border: 'none',
                      background: multiAgentOn ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                      cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                    aria-label="Toggle Multi-Agent"
                  >
                    <span style={{
                      position: 'absolute', top: '3px',
                      left: multiAgentOn ? '21px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>

                {/* Agent Pool Status — hiển thị khi toggle ON */}
                {multiAgentOn && (
                  <div style={{ borderTop: '1px solid rgba(99,102,241,0.15)', paddingTop: '8px' }}>
                    {agentPoolLoading ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="spinner" style={{ fontSize: '12px' }}>⟳</span> Đang phân tích kho model...
                      </div>
                    ) : agentPoolSummary && agentPoolSummary.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {agentPoolSummary.map(item => (
                          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                            <span style={{
                              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                              background: item.provider === 'nvidia' ? '#76b900'
                                        : item.provider === 'openai' ? '#10a37f'
                                        : '#4285f4',
                            }} />
                            <span style={{ color: 'var(--text-sub)', minWidth: '90px' }}>{item.label}:</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                              {item.provider === 'nvidia' ? '🟢' : item.provider === 'openai' ? '🟡' : '🔵'} {item.display || item.modelId}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : agentPoolSummary !== null ? (
                      // summary = [] (load xong nhưng không có Nvidia) — chỉ hiện Gemini fallback
                      <div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>
                        🔵 Dùng Gemini fallback — Vào Settings để thêm model Nvidia/OpenAI
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Block 2 */}
          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '16px' }}>🎯</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>Nghiên cứu Đối thủ</div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Để trống → AI tự động OSINT</div>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>Link Fanpage / Website đối thủ (Tùy chọn)</label>
              <input className="mi-input" type="text" placeholder="https://facebook.com/... hoặc để trống" value={competitorLink} onChange={e => setCompetitorLink(e.target.value)} style={inputStyle} />
              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.12)' }}>
                <span style={{ fontSize: '11px', color: '#a5b4fc' }}>💡 Nếu để trống, AI sẽ kích hoạt OSINT để tự tìm top competitors đang chạy quảng cáo tại Campuchia.</span>
              </div>
            </div>
          </div>

          {/* Block 3 */}
          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '16px' }}>🔬</span>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>Khung phân tích chiến lược</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {FRAMEWORKS.map(fw => (
                <div key={fw.id} className={`fw-card ${framework === fw.id ? 'active' : ''}`} onClick={() => setFramework(fw.id)}
                  style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${framework === fw.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`, background: framework === fw.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', position: 'relative' }}>
                  {fw.recommended && <div style={{ position: 'absolute', top: '8px', right: '10px', fontSize: '9px', fontWeight: 700, color: '#fbbf24', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(245,158,11,0.2)' }}>⭐ KHUYẾN NGHỊ</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px' }}>{fw.icon}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: framework === fw.id ? '#c7d2fe' : 'var(--text-main)' }}>{fw.name}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5, paddingLeft: '24px' }}>{fw.desc}</p>
                </div>
              ))}
            </div>
          </div>



          <button onClick={handleAnalyze} disabled={isLoading || (!product.trim() && !imageBase64) || !hasApiKey} className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '14px', fontWeight: 700 }}>
            {isLoading ? <><span className="spinner" style={{ fontSize: '16px' }}>⟳</span> Đang phân tích...</> : <><span>🕵️</span> Kích hoạt Nghiên cứu</>}
          </button>

          {error && <div className="alert alert-error" style={{ fontSize: '12px' }}><span>⚠️</span><span>{error}</span></div>}
        </div>

        {/* RIGHT: Dashboard */}
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', minHeight: '520px' }}>
          {result && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', background: 'rgba(99,102,241,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>📋</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Executive Summary</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>{result.executive_summary}</p>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px' }}>
            {getTabsForFramework(result ? (result._framework || framework) : framework).map(tab => (
              <button key={tab.id} className={`intel-tab ${activeTab === tab.id ? 'active-tab' : ''}`} onClick={() => setActiveTab(tab.id)}
                style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: activeTab === tab.id ? 'white' : 'var(--text-muted)', borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent', marginBottom: '-1px' }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <div style={{ padding: '20px' }}>
            {isLoading && <LoadingState step={loadingStep} />}
            {!isLoading && !result && <EmptyState />}
            {!isLoading && result && (() => {
              // Lấy framework từ result (server trả về cùng framework) hoặc từ state
              const fw = result._framework || framework;
              const tabs = getTabsForFramework(fw);
              const activeTabData = tabs[activeTab];
              if (!activeTabData) return null;

              if (fw === 'first_principles') {
                return (
                  <div className="tab-content-anim">
                    {activeTab === 0 && <ProductFeatureTab data={result} />}
                    {activeTab === 1 && <StrengthsWeaknessesTab data={result} />}
                    {activeTab === 2 && <ValueMatrixTab data={result} />}
                    {activeTab === 3 && <RoadmapTab data={result} />}
                  </div>
                );
              }
              if (fw === 'pain_point') {
                return (
                  <div className="tab-content-anim">
                    {activeTab === 0 && <EmpathyPersonaTab data={result} />}
                    {activeTab === 1 && <PainGainsTab data={result} />}
                    {activeTab === 2 && <TouchpointJourneyTab data={result} />}
                    {activeTab === 3 && <GoldenInsightTab data={result} />}
                  </div>
                );
              }
              // default: full
              return (
                <div className="tab-content-anim">
                  {activeTab === 0 && <CompetitorTab data={result.competitor_report} />}
                  {activeTab === 1 && <PersonaTab data={result.buyer_persona} />}
                  {activeTab === 2 && <AnglesTab data={result.marketing_angles} />}
                  {activeTab === 3 && <FacebookAdsTab data={result.facebook_ads_data} product={product} />}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
