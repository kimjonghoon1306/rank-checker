'use client';
import { useState, useRef, useEffect } from 'react';

/* ─────────── 유틸 ─────────── */
function getRankStyle(rank) {
  if (!rank) return { color: 'var(--rank-none)', bg: 'var(--rank-none-bg)', label: '미노출', tier: 0 };
  if (rank === 1)  return { color: '#f59e0b', bg: 'rgba(245,158,11,.15)', label: '1위 🥇', tier: 4 };
  if (rank <= 3)   return { color: '#ec4899', bg: 'rgba(236,72,153,.15)', label: `${rank}위`, tier: 3 };
  if (rank <= 10)  return { color: '#a855f7', bg: 'rgba(168,85,247,.15)', label: `${rank}위`, tier: 2 };
  if (rank <= 30)  return { color: 'var(--accent)', bg: 'var(--accent-bg)', label: `${rank}위`, tier: 1 };
  return { color: 'var(--text-muted)', bg: 'var(--surface2)', label: `${rank}위`, tier: 0 };
}

// 경쟁도: 해당 키워드 네이버 문서 수 기반
function getCompetition(total) {
  if (!total) return null;
  if (total < 3000)   return { label: '경쟁 낮음', short: '낮음', color: '#10b981', bg: 'rgba(16,185,129,.12)' };
  if (total < 30000)  return { label: '경쟁 보통', short: '보통', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' };
  if (total < 150000) return { label: '경쟁 높음', short: '높음', color: '#f97316', bg: 'rgba(249,115,22,.12)' };
  return { label: '경쟁 매우 높음', short: '매우 높음', color: '#ef4444', bg: 'rgba(239,68,68,.12)' };
}

// 제목에 키워드 포함 여부 (공백 무시, 소문자 비교)
function titleContains(title, kw) {
  const t = title.replace(/\s/g, '').toLowerCase();
  const k = kw.replace(/\s/g, '').toLowerCase();
  return t.includes(k);
}

// 핵심 인사이트: 미노출 이유 + 해결책
function getInsight(found, rank, total, inTitle) {
  const comp = getCompetition(total);
  if (found) {
    if (!comp) return null;
    if (comp.label === '경쟁 낮음') return { type: 'good', msg: '경쟁 적은 키워드에서 노출 중 — 유지하세요' };
    if (rank <= 3) return { type: 'great', msg: '치열한 경쟁에서 상위권 — 글 퀄리티 계속 유지' };
    return null;
  }
  // 미노출 케이스
  if (!comp) return { type: 'tip', msg: '제목과 본문에 이 키워드를 자연스럽게 포함시키세요' };
  if (comp.label === '경쟁 낮음' && !inTitle)
    return { type: 'opportunity', msg: '🎯 기회! 경쟁 적은데 제목에 키워드 없음 → 제목에 추가하면 상위 가능성 높음' };
  if (comp.label === '경쟁 낮음' && inTitle)
    return { type: 'tip', msg: '경쟁은 낮으나 미노출 → 글 길이·품질·내부링크 보강 필요' };
  if (comp.label === '경쟁 보통' && !inTitle)
    return { type: 'tip', msg: '제목에 키워드 추가 후 본문에도 2~3회 자연스럽게 삽입하세요' };
  if (comp.label === '경쟁 높음' || comp.label === '경쟁 매우 높음')
    return { type: 'warn', msg: '경쟁 포화 키워드 — 더 구체적인 롱테일 키워드로 교체 권장' };
  return { type: 'tip', msg: '제목과 본문에 이 키워드를 자연스럽게 포함시키세요' };
}

function getInsightStyle(type) {
  if (type === 'opportunity') return { color: '#10b981', bg: 'rgba(16,185,129,.1)', border: 'rgba(16,185,129,.3)' };
  if (type === 'great')       return { color: '#f59e0b', bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.3)' };
  if (type === 'good')        return { color: '#a855f7', bg: 'rgba(168,85,247,.1)', border: 'rgba(168,85,247,.3)' };
  if (type === 'warn')        return { color: '#ef4444', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.25)' };
  return { color: 'var(--text-sub)', bg: 'var(--surface2)', border: 'var(--border)' };
}


function getSourceBadge(src) {
  if (src === 'tag')   return { label: '태그', color: '#10b981' };
  if (src === 'ai')    return { label: 'AI', color: '#a78bfa' };
  if (src === 'title') return { label: '제목', color: '#94a3b8' };
  return null;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }); }
  catch { return d; }
}

function exportCSV(posts, rankResults) {
  const rows = [['제목','날짜','키워드','출처','순위','링크']];
  posts.forEach(p => {
    (p.keywords || []).forEach(kw => {
      const r = rankResults[`${p.logNo}_${kw}`];
      rows.push([p.title, fmtDate(p.pubDate), kw, p.keywordSource || '',
        r === undefined ? '확인중' : r.found ? `${r.rank}위` : '미노출', p.link]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download='naver-rank.csv'; a.click();
}

/* ─────────── 메인 ─────────── */
export default function RankChecker() {
  const [theme, setTheme]         = useState('dark');
  const [tab, setTab]             = useState('posts');
  const [view, setView]           = useState('rank');
  const [blogId, setBlogId]       = useState('');
  const [phase, setPhase]         = useState('idle');
  const [error, setError]         = useState('');
  const [posts, setPosts]         = useState([]);
  const [rankResults, setRankResults] = useState({});
  const [progress, setProgress]   = useState({ cur: 0, total: 0, label: '' });
  const [kwBlogId, setKwBlogId]   = useState('');
  const [kwInput, setKwInput]     = useState('');
  const [kwResults, setKwResults] = useState([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiKeys, setAiKeys]       = useState({ openai: '', gemini: '', groq: '' });
  const [selectedAI, setSelectedAI] = useState(''); // 'groq' | 'gemini' | 'openai' | ''
  const abortRef = useRef(false);
  const inputRef = useRef(null);

  // localStorage에서 키 + 선택 로드
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rc_ai_keys') || '{}');
      setAiKeys(k => ({ ...k, ...saved }));
      const sel = localStorage.getItem('rc_ai_selected') || '';
      setSelectedAI(sel);
    } catch {}
  }, []);

  // 키 변경 시 localStorage 저장
  const updateAiKey = (provider, val) => {
    const next = { ...aiKeys, [provider]: val };
    setAiKeys(next);
    try { localStorage.setItem('rc_ai_keys', JSON.stringify(next)); } catch {}
  };

  // AI 선택 변경
  const updateSelectedAI = (val) => {
    setSelectedAI(val);
    try { localStorage.setItem('rc_ai_selected', val); } catch {}
  };

  // 현재 선택된 AI 키 반환
  const getActiveAI = () => {
    if (!selectedAI) return null;
    const key = aiKeys[selectedAI]?.trim();
    if (!key) return null;
    return { provider: selectedAI, key };
  };

  const dark = theme === 'dark';

  /* ── 분석 시작 ── */
  const handleStart = async () => {
    const id = blogId.trim();
    if (!id) { setError('블로그 ID를 입력하세요.'); return; }
    abortRef.current = false;
    setError(''); setPosts([]); setRankResults({});
    setPhase('fetching');
    setProgress({ cur: 0, total: 0, label: '글 목록 수집 중...' });

    let fetched = [];
    try {
      const ai = getActiveAI();
      const res = await fetch('/api/blog/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: id, maxPosts: 50, aiKey: ai?.key, aiProvider: ai?.provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetched = data.posts;
      setPosts(fetched);
    } catch (e) { setError(e.message); setPhase('idle'); return; }

    const tasks = fetched.flatMap(p => (p.keywords||[]).map(kw => ({ post: p, kw })));
    if (!tasks.length) { setError('키워드를 찾을 수 없습니다. RSS 공개 설정을 확인하세요.'); setPhase('done'); return; }

    setPhase('ranking');
    setProgress({ cur: 0, total: tasks.length, label: '' });

    for (let i = 0; i < tasks.length; i++) {
      if (abortRef.current) break;
      const { post, kw } = tasks[i];
      setProgress({ cur: i+1, total: tasks.length, label: kw });
      try {
        const res = await fetch('/api/blog/rank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: post.blogId, logNo: post.logNo }),
        });
        const data = await res.json();
        if (data.needsApiKey) { setError('Vercel 환경변수에 네이버 API 키가 없습니다.'); abortRef.current = true; break; }
        setRankResults(p => ({ ...p, [`${post.logNo}_${kw}`]: { rank: data.rank, found: data.found, total: data.total || 0 } }));
      } catch {
        setRankResults(p => ({ ...p, [`${post.logNo}_${kw}`]: { rank: null, found: false } }));
      }
      await new Promise(r => setTimeout(r, 250));
    }
    setPhase('done');
  };

  /* ── 키워드 랭커 ── */
  const handleKwCheck = async () => {
    if (!kwBlogId.trim() || !kwInput.trim()) return;
    setKwLoading(true); setKwResults([]);
    const kws = kwInput.split('\n').map(k => k.trim()).filter(Boolean);
    const acc = [];
    for (const kw of kws) {
      try {
        const r = await fetch('/api/blog/rank', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: kwBlogId.trim() }),
        });
        const d = await r.json();
        acc.push({ keyword: kw, rank: d.rank, found: d.found, total: d.total || 0 });
      } catch { acc.push({ keyword: kw, rank: null, found: false }); }
      setKwResults([...acc]);
      await new Promise(r => setTimeout(r, 250));
    }
    setKwLoading(false);
  };

  const isRunning  = phase === 'fetching' || phase === 'ranking';
  const isDone     = phase === 'done';
  const pct        = progress.total > 0 ? Math.round((progress.cur/progress.total)*100) : 0;
  const allVals    = Object.values(rankResults);

  // 순위별 정렬 목록
  const rankRows = posts.flatMap(p =>
    (p.keywords||[]).map(kw => {
      const r = rankResults[`${p.logNo}_${kw}`];
      return { post: p, kw, rank: r?.rank ?? null, found: r?.found ?? false, checked: r !== undefined };
    })
  ).sort((a,b) => {
    if (a.found && b.found) return a.rank - b.rank;
    if (a.found) return -1;
    if (b.found) return 1;
    return 0;
  });

  const stats = {
    total: posts.length,
    kwTotal: rankRows.length,
    top3:    allVals.filter(r => r.found && r.rank <= 3).length,
    top10:   allVals.filter(r => r.found && r.rank <= 10).length,
    exposed: allVals.filter(r => r.found).length,
    hidden:  allVals.filter(r => !r.found && r.rank !== undefined).length,
  };

  /* ── 테마 CSS 변수 ── */
  const vars = dark ? {
    '--bg':          '#0d0d1a',
    '--bg2':         '#13131f',
    '--surface':     'rgba(255,255,255,.04)',
    '--surface2':    'rgba(255,255,255,.08)',
    '--border':      'rgba(255,255,255,.08)',
    '--border2':     'rgba(255,255,255,.14)',
    '--text':        '#f1f0ff',
    '--text-sub':    'rgba(255,255,255,.55)',
    '--text-muted':  'rgba(255,255,255,.25)',
    '--accent':      '#ec4899',
    '--accent2':     '#f43f5e',
    '--accent-bg':   'rgba(236,72,153,.14)',
    '--accent-glow': 'rgba(236,72,153,.35)',
    '--inp-bg':      'rgba(255,255,255,.06)',
    '--rank-none':   '#64748b',
    '--rank-none-bg':'rgba(100,116,139,.12)',
    '--shadow':      '0 8px 32px rgba(0,0,0,.5)',
    '--header-grad': 'linear-gradient(135deg,#0d0d1a 0%,#1a0a2e 50%,#0d0d1a 100%)',
  } : {
    '--bg':          '#fdf2f8',
    '--bg2':         '#fff',
    '--surface':     '#fff',
    '--surface2':    'rgba(236,72,153,.06)',
    '--border':      'rgba(236,72,153,.15)',
    '--border2':     'rgba(236,72,153,.3)',
    '--text':        '#1e0a2e',
    '--text-sub':    '#6b3a7d',
    '--text-muted':  '#a78bbb',
    '--accent':      '#ec4899',
    '--accent2':     '#f43f5e',
    '--accent-bg':   'rgba(236,72,153,.1)',
    '--accent-glow': 'rgba(236,72,153,.25)',
    '--inp-bg':      '#fff',
    '--rank-none':   '#9ca3af',
    '--rank-none-bg':'rgba(156,163,175,.12)',
    '--shadow':      '0 8px 32px rgba(236,72,153,.12)',
    '--header-grad': 'linear-gradient(135deg,#fdf2f8 0%,#fce7f3 50%,#fdf2f8 100%)',
  };

  const css = `
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { ${Object.entries(vars).map(([k,v]) => `${k}:${v}`).join(';')} }
    body { background: var(--bg); }
    .rc-wrap { font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif; min-height:100vh; background:var(--bg); color:var(--text); transition:background .3s,color .3s; }
    .rc-inner { max-width:100%; padding:0; }
    /* header */
    .rc-header { background:var(--header-grad); border-bottom:1px solid var(--border); padding:20px 24px 0; position:sticky; top:0; z-index:100; backdrop-filter:blur(20px); }
    .rc-header-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .rc-logo { display:flex; align-items:center; gap:10px; }
    .rc-logo-icon { width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,var(--accent),var(--accent2)); display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 4px 16px var(--accent-glow); flex-shrink:0; }
    .rc-logo-text { font-size:20px; font-weight:900; letter-spacing:-0.5px; background:linear-gradient(135deg,var(--accent),var(--accent2)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .rc-logo-sub { font-size:11px; color:var(--text-muted); font-weight:500; margin-top:1px; }
    .rc-header-actions { display:flex; align-items:center; gap:8px; }
    .theme-btn { width:38px; height:38px; border-radius:10px; border:1px solid var(--border2); background:var(--surface2); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; transition:all .2s; color:var(--text); }
    .theme-btn:hover { background:var(--accent-bg); border-color:var(--accent); }
    /* tabs */
    .rc-tabs { display:flex; gap:0; padding:0 24px; }
    .rc-tab { padding:12px 20px; font-size:13px; font-weight:700; color:var(--text-muted); border:none; background:none; cursor:pointer; font-family:inherit; border-bottom:2px solid transparent; transition:all .2s; white-space:nowrap; }
    .rc-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
    .rc-tab:hover:not(.active) { color:var(--text-sub); }
    /* content */
    .rc-content { padding:20px 24px; }
    /* input card */
    .input-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; margin-bottom:16px; box-shadow:var(--shadow); }
    .input-label { font-size:11px; color:var(--text-muted); font-weight:700; letter-spacing:.6px; text-transform:uppercase; margin-bottom:8px; }
    .input-row { display:flex; gap:10px; }
    .inp-wrap { flex:1; position:relative; }
    .inp-prefix { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--text-muted); pointer-events:none; white-space:nowrap; }
    .inp { width:100%; height:48px; padding-right:14px; background:var(--inp-bg); border:1.5px solid var(--border); border-radius:12px; color:var(--text); font-family:inherit; font-size:14px; font-weight:600; outline:none; transition:border-color .2s,box-shadow .2s; }
    .inp:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-bg); }
    .inp::placeholder { color:var(--text-muted); font-weight:400; }
    .inp-pl { padding-left:130px; }
    .inp-sm { height:44px; padding-left:14px; }
    .inp-ta { height:96px; padding:12px 14px; resize:none; line-height:1.7; }
    .btn-primary { height:48px; padding:0 28px; background:linear-gradient(135deg,var(--accent),var(--accent2)); border:none; border-radius:12px; color:#fff; font-family:inherit; font-size:14px; font-weight:800; cursor:pointer; transition:all .2s; white-space:nowrap; box-shadow:0 4px 16px var(--accent-glow); }
    .btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 24px var(--accent-glow); }
    .btn-primary:disabled { opacity:.35; cursor:not-allowed; transform:none; box-shadow:none; }
    .btn-sm { height:36px; padding:0 16px; font-size:12px; }
    .btn-ghost { height:36px; padding:0 14px; background:var(--surface2); border:1px solid var(--border); border-radius:9px; color:var(--text-sub); font-family:inherit; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; }
    .btn-ghost:hover { border-color:var(--accent); color:var(--accent); }
    /* error */
    .err-box { margin-top:12px; padding:12px 16px; background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.2); border-radius:10px; font-size:13px; color:#f87171; line-height:1.6; }
    /* progress */
    .progress-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:16px; box-shadow:var(--shadow); }
    .progress-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; }
    .progress-label { font-size:13px; color:var(--text-sub); font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .progress-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .progress-pct { font-size:14px; font-weight:900; color:var(--accent); }
    .progress-bar { height:6px; background:var(--surface2); border-radius:99px; overflow:hidden; }
    .progress-fill { height:100%; background:linear-gradient(90deg,var(--accent),var(--accent2),#f59e0b); border-radius:99px; transition:width .4s ease; }
    .stop-btn { padding:4px 12px; border:1px solid rgba(239,68,68,.3); background:rgba(239,68,68,.08); border-radius:7px; color:#f87171; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; }
    /* stats */
    .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
    .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 12px; text-align:center; box-shadow:var(--shadow); transition:border-color .2s; }
    .stat-card:hover { border-color:var(--border2); }
    .stat-icon { font-size:22px; margin-bottom:6px; }
    .stat-val { font-size:26px; font-weight:900; line-height:1; margin-bottom:4px; }
    .stat-label { font-size:10px; color:var(--text-muted); font-weight:700; letter-spacing:.4px; }
    /* view toggle */
    .view-toggle { display:flex; gap:4px; background:var(--surface2); border-radius:10px; padding:3px; border:1px solid var(--border); }
    .view-btn { flex:1; padding:7px 12px; border-radius:7px; border:none; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; }
    .view-btn.active { background:var(--accent); color:#fff; box-shadow:0 2px 10px var(--accent-glow); }
    .view-btn:not(.active) { background:none; color:var(--text-muted); }
    .results-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    /* rank table */
    .rank-table { display:flex; flex-direction:column; gap:6px; }
    .rank-row { display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 16px; transition:all .2s; }
    .rank-row:hover { border-color:var(--border2); box-shadow:0 4px 16px var(--accent-glow); transform:translateY(-1px); }
    .rank-num-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:52px; }
    .rank-num { font-size:28px; font-weight:900; line-height:1; letter-spacing:-1px; }
    .rank-num-label { font-size:9px; font-weight:700; letter-spacing:.5px; color:var(--text-muted); margin-top:2px; }
    .rank-divider { width:1px; height:44px; background:var(--border); flex-shrink:0; }
    .rank-info { flex:1; min-width:0; }
    .rank-kw { font-size:14px; font-weight:800; color:var(--text); margin-bottom:4px; display:flex; align-items:center; gap:6px; }
    .rank-kw-text { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rank-post { font-size:12px; color:var(--text-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rank-badge { font-size:11px; font-weight:800; padding:4px 12px; border-radius:99px; flex-shrink:0; border:1.5px solid transparent; }
    .rank-badge.exposed { border-color:currentColor; }
    .rank-badge.hidden { background:var(--rank-none-bg); color:var(--rank-none); }
    /* post list */
    .post-list { display:flex; flex-direction:column; gap:8px; }
    .post-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px 18px; transition:all .2s; }
    .post-card:hover { border-color:var(--border2); box-shadow:var(--shadow); }
    .post-head { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
    .post-num { font-size:11px; color:var(--text-muted); font-weight:700; min-width:20px; padding-top:2px; text-align:right; }
    .post-meta { flex:1; min-width:0; }
    .post-title-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px; }
    .post-title { font-size:14px; font-weight:700; color:var(--text); text-decoration:none; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .post-title:hover { color:var(--accent); }
    .post-date { font-size:11px; color:var(--text-muted); }
    .post-best { font-size:12px; font-weight:800; padding:4px 12px; border-radius:99px; flex-shrink:0; }
    .kw-chips { display:flex; flex-wrap:wrap; gap:6px; padding-left:30px; }
    .kw-chip { font-size:12px; font-weight:700; padding:6px 12px; border-radius:99px; border:1.5px solid; transition:all .2s; display:flex; align-items:center; gap:5px; }
    .kw-chip-rank { font-size:11px; font-weight:900; }
    .comp-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid;flex-shrink:0}
    .insight-box{margin-top:10px;padding:10px 14px;border-radius:10px;border:1px solid;font-size:12px;font-weight:600;line-height:1.6;padding-left:30px}
    .title-match-yes{font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.3)}
    .title-match-no{font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.2)}
    .opportunity-row{box-shadow:0 0 0 2px rgba(16,185,129,.35) !important}
    /* 스마트 리포트 */
    .report-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:var(--shadow)}
    .report-title{font-size:15px;font-weight:800;color:var(--text);margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .report-section{padding:14px 0;border-top:1px solid var(--border)}
    .report-section:first-of-type{border-top:none;padding-top:0}
    .report-section-title{font-size:13px;font-weight:800;margin-bottom:6px}
    .report-section-body{font-size:12px;color:var(--text-sub);line-height:1.8}
    /* 설정 패널 */
    .settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;backdrop-filter:blur(4px)}
    .settings-drawer{position:fixed;top:0;right:0;height:100%;width:100%;max-width:440px;background:var(--bg2);z-index:201;overflow-y:auto;box-shadow:-8px 0 40px rgba(0,0,0,.4);display:flex;flex-direction:column}
    .settings-head{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg2);z-index:1}
    .settings-title{font-size:16px;font-weight:800;color:var(--text)}
    .settings-close{width:34px;height:34px;border-radius:9px;border:1px solid var(--border2);background:var(--surface2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text)}
    .settings-body{padding:20px 24px;flex:1;display:flex;flex-direction:column;gap:16px}
    .ai-card{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:16px;transition:border-color .2s}
    .ai-card.active-card{border-color:var(--accent)}
    .ai-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .ai-name{font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px}
    .ai-price-free{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3)}
    .ai-price-partial{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}
    .ai-price-paid{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
    .ai-active-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent)}
    .ai-inp-row{display:flex;gap:8px}
    .ai-inp{flex:1;height:40px;padding:0 12px;background:var(--inp-bg);border:1.5px solid var(--border);border-radius:9px;color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color .2s}
    .ai-inp:focus{border-color:var(--accent)}
    .ai-inp::placeholder{color:var(--text-muted);font-size:12px}
    .issue-btn{height:40px;padding:0 12px;border:1.5px solid var(--border2);border-radius:9px;background:var(--surface2);color:var(--text-sub);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all .2s;flex-shrink:0}
    .issue-btn:hover{border-color:var(--accent);color:var(--accent)}
    .device-warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:12px;padding:14px 16px;font-size:12px;color:#f59e0b;line-height:1.8}
    .active-ai-info{background:var(--accent-bg);border:1px solid var(--accent);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--accent);font-weight:600}
    @media(max-width:640px){.settings-drawer{max-width:100%}}
    .src-badge { font-size:9px; font-weight:700; padding:2px 7px; border-radius:99px; border:1px solid; flex-shrink:0; }
    /* kw ranker */
    .kw-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
    .kw-result-list { background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden; box-shadow:var(--shadow); }
    .kw-result-header { padding:14px 20px; border-bottom:1px solid var(--border); font-size:11px; font-weight:700; color:var(--text-muted); letter-spacing:.5px; display:flex; justify-content:space-between; }
    .kw-result-row { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--border); transition:background .15s; }
    .kw-result-row:last-child { border-bottom:none; }
    .kw-result-row:hover { background:var(--surface2); }
    .kw-result-left { display:flex; align-items:center; gap:12px; }
    .kw-result-idx { font-size:11px; color:var(--text-muted); font-weight:700; min-width:20px; }
    .kw-result-rank { font-size:22px; font-weight:900; min-width:64px; text-align:center; }
    .kw-result-name { font-size:15px; font-weight:700; color:var(--text); }
    .kw-result-label { font-size:11px; color:var(--text-muted); margin-top:2px; }
    .kw-stats { padding:12px 20px; display:flex; gap:16px; font-size:12px; color:var(--text-muted); border-top:1px solid var(--border); background:var(--surface2); }
    /* tip box */
    .tip-box { margin-top:14px; padding:14px 16px; background:var(--accent-bg); border:1px solid var(--border2); border-radius:12px; font-size:12px; color:var(--text-sub); line-height:1.8; }
    /* source legend */
    .src-legend { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
    .src-dot { width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:4px; }
    /* animations */
    @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    .fade-up { animation:fadeUp .3s ease forwards; }
    .pulse { animation:pulse 1.5s infinite; }
    /* mobile */
    @media(max-width:640px) {
      .rc-header { padding:16px 16px 0; }
      .rc-logo-text { font-size:17px; }
      .rc-logo-sub { display:none; }
      .rc-tabs { padding:0 16px; overflow-x:auto; scrollbar-width:none; }
      .rc-tabs::-webkit-scrollbar { display:none; }
      .rc-tab { padding:10px 14px; font-size:12px; }
      .rc-content { padding:16px; }
      .input-card { padding:16px; }
      .input-row { flex-direction:column; }
      .btn-primary { width:100%; }
      .stats-grid { grid-template-columns:repeat(2,1fr); }
      .stat-val { font-size:22px; }
      .rank-row { padding:12px 14px; gap:10px; }
      .rank-num { font-size:22px; }
      .rank-num-wrap { min-width:44px; }
      .kw-grid { grid-template-columns:1fr; }
      .results-header { flex-direction:column; align-items:flex-start; gap:8px; }
      .src-legend { gap:8px; }
      .kw-result-rank { font-size:18px; min-width:52px; }
      .view-toggle { flex:1; }
      .rc-header-actions { gap:6px; }
    }
    @media(max-width:400px) {
      .stats-grid { grid-template-columns:repeat(2,1fr); gap:8px; }
      .rank-num { font-size:20px; }
      .rc-logo-icon { width:30px; height:30px; font-size:15px; }
    }
  `;

  return (
    <div className="rc-wrap" style={vars}>
      <style>{css}</style>
      <div className="rc-inner">

        {/* ─── HEADER ─── */}
        <div className="rc-header">
          <div className="rc-header-top">
            <div className="rc-logo">
              <div className="rc-logo-icon">🌸</div>
              <div>
                <div className="rc-logo-text">블로그 순위 체커</div>
                <div className="rc-logo-sub">NAVER BLOG RANK TRACKER</div>
              </div>
            </div>
            <div className="rc-header-actions">
              {isDone && (
                <button className="btn-ghost" onClick={() => exportCSV(posts, rankResults)} style={{ height:36 }}>
                  📥 CSV
                </button>
              )}
              <button className="theme-btn" title="AI 설정" onClick={() => setShowSettings(true)} style={{fontSize:18}}>
                ⚙️
              </button>
              <button className="theme-btn" onClick={() => setTheme(t => t==='dark'?'light':'dark')}>
                {dark ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
          <div className="rc-tabs">
            {[['posts','📊 글 순위 분석'],['keyword','🔍 키워드 랭커']].map(([v,l]) => (
              <button key={v} className={`rc-tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* ─── 설정 드로어 ─── */}
        {showSettings && (() => {
          const activeAI = getActiveAI();
          const AI_LIST = [
            {
              key: 'groq', label: 'Groq (Llama 3)', emoji: '⚡',
              price: 'free', priceLabel: '무료',
              placeholder: 'gsk_xxxxxxxxxxxxxxxx',
              issueUrl: 'https://console.groq.com/keys',
              desc: 'Meta Llama 3 기반 · 가장 빠름 · 완전 무료',
            },
            {
              key: 'gemini', label: 'Google Gemini', emoji: '✨',
              price: 'partial', priceLabel: '일부 무료 / 유료',
              placeholder: 'AIzaSyxxxxxxxxxxxxxxx',
              issueUrl: 'https://aistudio.google.com/app/apikey',
              desc: 'Gemini 2.0 Flash · 1,500회/일 무료',
            },
            {
              key: 'openai', label: 'OpenAI GPT', emoji: '🤖',
              price: 'paid', priceLabel: '유료',
              placeholder: 'sk-xxxxxxxxxxxxxxxx',
              issueUrl: 'https://platform.openai.com/api-keys',
              desc: 'GPT-4o Mini · 고품질 · 사용량 과금',
            },
          ];
          return (
            <>
              <div className="settings-overlay" onClick={() => setShowSettings(false)} />
              <div className="settings-drawer">
                <div className="settings-head">
                  <div className="settings-title">🤖 AI 키워드 분석 설정</div>
                  <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
                </div>
                <div className="settings-body">

                  {/* 디바이스 경고 */}
                  <div className="device-warn">
                    ⚠️ <strong>기기별 저장 안내</strong><br/>
                    API 키는 현재 기기의 브라우저에만 저장됩니다.<br/>
                    <strong>PC ↔ 모바일 ↔ 태블릿 변경 시</strong> 각 기기에서 다시 입력해야 합니다.<br/>
                    서버에 저장되지 않으며 다른 사람과 공유되지 않습니다.
                  </div>

                  {/* 현재 활성 상태 */}
                  {activeAI ? (
                    <div className="active-ai-info">
                      ✅ 사용 중: <strong>{AI_LIST.find(a=>a.key===activeAI.provider)?.label}</strong>
                    </div>
                  ) : (
                    <div style={{padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',fontSize:12,color:'#f87171',fontWeight:600}}>
                      ❌ 선택된 AI 없음 — AI 선택 시 키워드 품질이 향상됩니다
                    </div>
                  )}

                  {/* AI 카드 3개 - 각각 독립 */}
                  {AI_LIST.map(ai => {
                    const isSelected = selectedAI === ai.key;
                    const hasKey = !!aiKeys[ai.key].trim();
                    return (
                      <div key={ai.key} className={`ai-card${isSelected ? ' active-card' : ''}`}>
                        <div className="ai-card-head">
                          <div className="ai-name">
                            <span>{ai.emoji}</span>
                            <span>{ai.label}</span>
                            {isSelected && <span className="ai-active-badge">선택됨</span>}
                          </div>
                          <span className={`ai-price-${ai.price}`}>{ai.priceLabel}</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>{ai.desc}</div>
                        <div className="ai-inp-row">
                          <input
                            className="ai-inp"
                            type="password"
                            placeholder={ai.placeholder}
                            value={aiKeys[ai.key]}
                            onChange={e => updateAiKey(ai.key, e.target.value)}
                          />
                          <button className="issue-btn" onClick={() => window.open(ai.issueUrl, '_blank')}>
                            🔑 발급받기
                          </button>
                        </div>
                        <div style={{marginTop:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <span style={{fontSize:11,color: hasKey ? '#10b981' : 'var(--text-muted)',fontWeight:600}}>
                            {hasKey ? '✓ 키 저장됨' : '키 미입력'}
                          </span>
                          <button
                            onClick={() => updateSelectedAI(isSelected ? '' : ai.key)}
                            style={{
                              height:30, padding:'0 14px', borderRadius:8, fontSize:12, fontWeight:700,
                              border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'}`,
                              background: isSelected ? 'var(--accent)' : 'var(--surface2)',
                              color: isSelected ? '#fff' : 'var(--text-sub)',
                              cursor:'pointer', fontFamily:'inherit', transition:'all .2s',
                            }}
                          >
                            {isSelected ? '✓ 사용 중' : '이 AI 사용'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{fontSize:11,color:'var(--text-muted)',textAlign:'center',lineHeight:1.8}}>
                    AI 미설정 시 글의 해시태그 또는 제목 파싱으로 키워드 추출
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ─── CONTENT ─── */}
        <div className="rc-content">

          {/* ═══ 글 순위 분석 ═══ */}
          {tab === 'posts' && (
            <>
              {/* 입력 */}
              {!posts.length && !isRunning && (
                <div className="input-card fade-up">
                  <div className="input-label">네이버 블로그 ID</div>
                  <div className="input-row">
                    <div className="inp-wrap">
                      <span className="inp-prefix">blog.naver.com/</span>
                      <input
                        ref={inputRef}
                        className="inp inp-pl"
                        placeholder="myblogid"
                        value={blogId}
                        onChange={e => setBlogId(e.target.value)}
                        onKeyDown={e => e.key==='Enter' && handleStart()}
                      />
                    </div>
                    <button className="btn-primary" onClick={handleStart} disabled={isRunning}>
                      분석 시작 →
                    </button>
                  </div>
                  {error && <div className="err-box">⚠️ {error}</div>}
                  <div className="tip-box" style={{ marginTop:14 }}>
                    💡 블로그 ID만 입력하면 자동으로 키워드를 찾아 순위를 체크합니다<br/>
                    <span style={{display:'flex',gap:14,marginTop:4,flexWrap:'wrap'}}>
                      <span><span className="src-dot" style={{background:'#10b981'}}/>태그 — 글의 해시태그 사용</span>
                      <span><span className="src-dot" style={{background:'#a78bfa'}}/>AI — AI가 제목 분석 (⚙️ 설정 필요)</span>
                      <span><span className="src-dot" style={{background:'#94a3b8'}}/>제목 — 제목 단어 파싱</span>
                    </span>
                  </div>
                </div>
              )}

              {/* 진행 중 */}
              {isRunning && (
                <div className="progress-card fade-up">
                  <div className="progress-row">
                    <div className="progress-label">
                      {phase==='fetching'
                        ? '📥 글 목록 + 키워드 수집 중...'
                        : `🔍 "${progress.label}" 순위 확인 중 (${progress.cur}/${progress.total})`}
                    </div>
                    <div className="progress-right">
                      {phase==='ranking' && <span className="progress-pct">{pct}%</span>}
                      <button className="stop-btn" onClick={() => abortRef.current=true}>중단</button>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{width: phase==='fetching'?'10%':`${pct}%`}} />
                  </div>
                  {posts.length > 0 && (
                    <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)'}}>
                      {posts.length}개 글 수집 완료 · 순위 분석 중
                    </div>
                  )}
                </div>
              )}

              {/* 결과 */}
              {posts.length > 0 && (
                <>
                  {/* 통계 */}
                  <div className="stats-grid fade-up">
                    {[
                      { icon:'📄', val:stats.total,   label:'전체 글',  color:'var(--text)' },
                      { icon:'🥇', val:stats.top3,    label:'TOP 3',    color:'#ec4899' },
                      { icon:'🏆', val:stats.top10,   label:'TOP 10',   color:'#a855f7' },
                      { icon:'✅', val:stats.exposed, label:'노출',     color:'#10b981' },
                    ].map(s => (
                      <div key={s.label} className="stat-card">
                        <div className="stat-icon">{s.icon}</div>
                        <div className="stat-val" style={{color:s.color}}>{s.val}</div>
                        <div className="stat-label">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── 스마트 리포트 (분석 완료 시) ── */}
                  {isDone && (() => {
                    const allRows = posts.flatMap(p =>
                      (p.keywords||[]).map(kw => {
                        const r = rankResults[`${p.logNo}_${kw}`];
                        return { post: p, kw, rank: r?.rank, found: r?.found, total: r?.total };
                      })
                    );

                    const top3List    = allRows.filter(r => r.found && r.rank <= 3);
                    const opportunities = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && !titleContains(r.post.title, r.kw));
                    const easyWins    = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && titleContains(r.post.title, r.kw));
                    const highComp    = allRows.filter(r => !r.found && r.total >= 150000);

                    return (
                      <div className="report-card fade-up">
                        <div className="report-title">📋 분석 리포트</div>

                        {/* 잘 되고 있는 것 */}
                        {top3List.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#ec4899'}}>🥇 상위 3위 안에 노출 중인 키워드</div>
                            <div className="report-section-body">
                              이 키워드들은 이미 네이버 검색 상위권에 있어요. 글 내용을 업데이트하거나 내부 링크를 추가해서 순위를 유지·강화하세요.
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                              {top3List.slice(0,5).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:700,padding:'4px 11px',borderRadius:99,background:'rgba(236,72,153,.12)',color:'#ec4899',border:'1px solid rgba(236,72,153,.3)'}}>
                                  #{r.kw} · {r.rank}위
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 기회 키워드 */}
                        {opportunities.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#10b981'}}>🎯 지금 당장 할 수 있는 것 (기회 키워드)</div>
                            <div className="report-section-body">
                              경쟁이 적은데 아직 노출이 안 되는 키워드예요. <strong>글 제목에 아래 키워드를 추가하는 것만으로</strong> 상위 노출될 가능성이 높아요.
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                              {opportunities.slice(0,5).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:700,padding:'4px 11px',borderRadius:99,background:'rgba(16,185,129,.1)',color:'#10b981',border:'1px solid rgba(16,185,129,.3)'}}>
                                  #{r.kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 쉬운 개선 */}
                        {easyWins.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#a855f7'}}>📝 글 품질 보강이 필요한 키워드</div>
                            <div className="report-section-body">
                              제목엔 키워드가 있는데 노출이 안 돼요. 본문에서 해당 키워드를 2~3회 더 자연스럽게 언급하고, 글 길이를 늘리면 순위가 올라갈 수 있어요.
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                              {easyWins.slice(0,5).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:700,padding:'4px 11px',borderRadius:99,background:'rgba(168,85,247,.1)',color:'#a855f7',border:'1px solid rgba(168,85,247,.3)'}}>
                                  #{r.kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 포화 키워드 */}
                        {highComp.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#f87171'}}>⚠️ 경쟁이 너무 심한 키워드</div>
                            <div className="report-section-body">
                              검색 결과가 15만 개 이상인 키워드예요. 단기간 상위 노출이 어려워요. 더 구체적인 키워드로 바꾸세요. 예: "맛집" → "강릉 중앙시장 맛집 추천"
                            </div>
                          </div>
                        )}

                        {/* 아무 이슈 없을 때 */}
                        {top3List.length === 0 && opportunities.length === 0 && easyWins.length === 0 && (
                          <div className="report-section-body" style={{color:'var(--text-muted)'}}>
                            태그 또는 AI 키워드 설정 후 분석하면 더 정확한 리포트를 볼 수 있어요.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="results-header">
                    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      <div className="view-toggle">
                        <button className={`view-btn${view==='rank'?' active':''}`} onClick={()=>setView('rank')}>🎯 순위별</button>
                        <button className={`view-btn${view==='post'?' active':''}`} onClick={()=>setView('post')}>📄 글별</button>
                      </div>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>
                        {isDone ? `✓ 완료 · ${stats.kwTotal}개 키워드 분석` : '분석 중...'}
                      </span>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button className="btn-ghost" onClick={()=>{setPosts([]);setRankResults({});setPhase('idle');setBlogId('');setError('');}}>
                        초기화
                      </button>
                    </div>
                  </div>

                  {/* ── 순위별 뷰 ── */}
                  {view === 'rank' && (
                    <div className="rank-table">
                      {rankRows.length === 0 && (
                        <div style={{textAlign:'center',padding:'40px',color:'var(--text-muted)',fontSize:14}}>
                          순위 분석 중...
                        </div>
                      )}
                      {/* 노출된 것 먼저, 미노출은 글 단위로 묶어서 */}
                      {(() => {
                        const exposed = rankRows.filter(r => r.found);
                        const hidden  = rankRows.filter(r => !r.found && r.checked);
                        const checking = rankRows.filter(r => !r.checked);

                        // 미노출은 같은 글끼리 묶기
                        const hiddenByPost = {};
                        hidden.forEach(r => {
                          if (!hiddenByPost[r.post.logNo]) hiddenByPost[r.post.logNo] = { post: r.post, kws: [] };
                          hiddenByPost[r.post.logNo].kws.push(r.kw);
                        });

                        return (
                          <>
                            {/* 확인 중 */}
                            {checking.map(({ post, kw }, i) => (
                              <div key={`ck_${post.logNo}_${kw}`} className="rank-row fade-up">
                                <div className="rank-num-wrap">
                                  <div className="rank-num pulse" style={{color:'var(--text-muted)',fontSize:20}}>···</div>
                                  <div className="rank-num-label">확인중</div>
                                </div>
                                <div className="rank-divider" />
                                <div className="rank-info">
                                  <div className="rank-kw"><span style={{color:'var(--text-muted)'}}>#</span><span className="rank-kw-text">{kw}</span></div>
                                  <div className="rank-post">{post.title}</div>
                                </div>
                              </div>
                            ))}

                            {/* 노출 */}
                            {exposed.map(({ post, kw, rank }, i) => {
                              const rs = getRankStyle(rank);
                              const srcInfo = getSourceBadge(post.keywordSource);
                              const r = rankResults[`${post.logNo}_${kw}`];
                              const comp = r ? getCompetition(r.total) : null;
                              const inTitle = titleContains(post.title, kw);
                              return (
                                <div key={`ex_${post.logNo}_${kw}`} className="rank-row fade-up" style={{animationDelay:`${i*0.03}s`}}>
                                  <div className="rank-num-wrap">
                                    <div className="rank-num" style={{color:rs.color}}>{rank}</div>
                                    <div className="rank-num-label">번째 노출</div>
                                  </div>
                                  <div className="rank-divider" />
                                  <div className="rank-info">
                                    <div className="rank-kw">
                                      <span style={{color:rs.color,flexShrink:0}}>#</span>
                                      <span className="rank-kw-text">{kw}</span>
                                      {srcInfo && <span className="src-badge" style={{color:srcInfo.color,borderColor:srcInfo.color+'40',background:srcInfo.color+'12'}}>{srcInfo.label}</span>}
                                      {comp && <span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>{comp.short}</span>}
                                    </div>
                                    <a href={post.link} target="_blank" rel="noreferrer" className="rank-post" style={{color:'var(--text-sub)'}}>{post.title}</a>
                                  </div>
                                  <span className="rank-badge exposed" style={{color:rs.color,borderColor:rs.color+'60',background:rs.bg}}>{rs.label}</span>
                                </div>
                              );
                            })}

                            {/* 미노출 - 글 단위 묶음 */}
                            {Object.values(hiddenByPost).map(({ post, kws }, i) => {
                              const srcInfo = getSourceBadge(post.keywordSource);
                              return (
                                <div key={`hd_${post.logNo}`} className="rank-row fade-up" style={{animationDelay:`${(exposed.length+i)*0.03}s`,opacity:.7}}>
                                  <div className="rank-num-wrap">
                                    <div className="rank-num" style={{color:'var(--rank-none)',fontSize:22}}>—</div>
                                    <div className="rank-num-label">미노출</div>
                                  </div>
                                  <div className="rank-divider" />
                                  <div className="rank-info">
                                    <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:5}}>
                                      {kws.map(kw => (
                                        <span key={kw} style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:99,padding:'2px 9px'}}>#{kw}</span>
                                      ))}
                                      {srcInfo && <span className="src-badge" style={{color:srcInfo.color,borderColor:srcInfo.color+'40',background:srcInfo.color+'12'}}>{srcInfo.label}</span>}
                                    </div>
                                    <a href={post.link} target="_blank" rel="noreferrer" className="rank-post" style={{color:'var(--text-muted)'}}>{post.title}</a>
                                  </div>
                                  <span className="rank-badge hidden">미노출</span>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── 글별 뷰 ── */}
                  {view === 'post' && (
                    <div className="post-list">
                      {posts.map((post, pi) => {
                        const postRanks = (post.keywords||[]).map(kw => rankResults[`${post.logNo}_${kw}`]);
                        const bestRank  = postRanks.filter(r=>r?.found).map(r=>r.rank).sort((a,b)=>a-b)[0];
                        const srcInfo   = getSourceBadge(post.keywordSource);
                        const bestRs    = getRankStyle(bestRank||null);

                        return (
                          <div key={post.logNo} className="post-card fade-up" style={{animationDelay:`${pi*0.03}s`}}>
                            <div className="post-head">
                              <span className="post-num">{pi+1}</span>
                              <div className="post-meta">
                                <div className="post-title-row">
                                  <a href={post.link} target="_blank" rel="noreferrer" className="post-title">
                                    {post.title}
                                  </a>
                                  {srcInfo && (
                                    <span className="src-badge" style={{color:srcInfo.color,borderColor:srcInfo.color+'40',background:srcInfo.color+'12'}}>
                                      {srcInfo.label}
                                    </span>
                                  )}
                                </div>
                                <div className="post-date">{fmtDate(post.pubDate)}</div>
                              </div>
                              {bestRank && (
                                <span className="post-best" style={{color:bestRs.color,background:bestRs.bg}}>
                                  최고 {bestRank}위
                                </span>
                              )}
                            </div>
                            <div className="kw-chips">
                              {(post.keywords||[]).map(kw => {
                                const r  = rankResults[`${post.logNo}_${kw}`];
                                const rs = r ? getRankStyle(r.found ? r.rank : null) : null;
                                const checking = isRunning && !r;
                                const comp = r ? getCompetition(r.total) : null;
                                const inTitle = titleContains(post.title, kw);
                                const insight = (r && !checking) ? getInsight(r.found, r.rank, r.total, inTitle) : null;
                                const insightStyle = insight ? getInsightStyle(insight.type) : null;
                                const isOpportunity = insight?.type === 'opportunity';

                                return (
                                  <div key={kw} style={{width:'100%'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                      {/* 키워드 칩 */}
                                      <span className={`kw-chip${checking?' pulse':''}${isOpportunity?' opportunity-row':''}`}
                                        style={{
                                          color:       rs ? rs.color : 'var(--text-muted)',
                                          borderColor: rs ? rs.color+'50' : 'var(--border)',
                                          background:  rs ? rs.bg : 'var(--surface2)',
                                        }}>
                                        <span>#{kw}</span>
                                        {rs && <span className="kw-chip-rank">{r.found ? `${r.rank}위` : '미노출'}</span>}
                                        {checking && <span style={{fontSize:10}}>···</span>}
                                      </span>
                                      {/* 경쟁도 */}
                                      {comp && !checking && (
                                        <span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>
                                          {comp.short}
                                        </span>
                                      )}
                                      {/* 제목 포함 여부 */}
                                      {r && !checking && (
                                        <span className={inTitle ? 'title-match-yes' : 'title-match-no'}>
                                          {inTitle ? '제목 ✓' : '제목 없음'}
                                        </span>
                                      )}
                                    </div>
                                    {/* 인사이트 */}
                                    {insight && insightStyle && (
                                      <div className="insight-box" style={{color:insightStyle.color,background:insightStyle.bg,borderColor:insightStyle.border}}>
                                        {insight.msg}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {!post.keywords?.length && (
                                <span style={{fontSize:12,color:'var(--text-muted)'}}>키워드 없음</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ 키워드 랭커 ═══ */}
          {tab === 'keyword' && (
            <>
              <div className="input-card fade-up">
                <div className="kw-grid">
                  <div>
                    <div className="input-label">블로그 ID</div>
                    <input className="inp inp-sm" placeholder="myblogid"
                      value={kwBlogId} onChange={e=>setKwBlogId(e.target.value)} />
                  </div>
                  <div>
                    <div className="input-label">키워드 <span style={{color:'var(--text-muted)',fontWeight:400,textTransform:'none',fontSize:11}}>줄바꿈으로 여러 개</span></div>
                    <textarea className="inp inp-ta" placeholder={"강남 맛집\n부산 카페\n네이버 블로그 체험단"}
                      value={kwInput} onChange={e=>setKwInput(e.target.value)} />
                  </div>
                </div>
                <button className="btn-primary" style={{width:'100%',height:44}} onClick={handleKwCheck}
                  disabled={kwLoading || !kwBlogId || !kwInput}>
                  {kwLoading ? '순위 확인 중...' : '🔍 순위 확인'}
                </button>
              </div>

              {kwResults.length > 0 && (
                <div className="kw-result-list fade-up">
                  <div className="kw-result-header">
                    <span>키워드 순위 결과 · {kwResults.length}개</span>
                    {kwLoading && <span className="pulse" style={{color:'var(--accent)'}}>분석 중...</span>}
                  </div>
                  {kwResults.map((r, i) => {
                    const rs = getRankStyle(r.found ? r.rank : null);
                    const comp = getCompetition(r.total);
                    const insight = getInsight(r.found, r.rank, r.total, false);
                    const insightStyle = insight ? getInsightStyle(insight.type) : null;
                    return (
                      <div key={i} className="kw-result-row fade-up" style={{animationDelay:`${i*0.05}s`,flexDirection:'column',alignItems:'stretch',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <div className="kw-result-left">
                            <span className="kw-result-idx">{i+1}</span>
                            <div>
                              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                <div className="kw-result-name">{r.keyword}</div>
                                {comp && <span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>{comp.label}</span>}
                                {r.total > 0 && <span style={{fontSize:11,color:'var(--text-muted)'}}>{r.total.toLocaleString()}개 문서</span>}
                              </div>
                              <div className="kw-result-label" style={{color:rs.color,marginTop:2}}>
                                {r.found ? `네이버 검색 결과 ${r.rank}번째 노출` : '검색 결과 미노출 (100위 밖)'}
                              </div>
                            </div>
                          </div>
                          <div className="kw-result-rank" style={{color: r.found ? rs.color : 'var(--rank-none)'}}>
                            {r.found ? `${r.rank}위` : '—'}
                          </div>
                        </div>
                        {insight && insightStyle && (
                          <div style={{fontSize:12,fontWeight:600,padding:'8px 12px',borderRadius:9,border:`1px solid ${insightStyle.border}`,background:insightStyle.bg,color:insightStyle.color,marginLeft:32}}>
                            {insight.msg}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!kwLoading && (
                    <div className="kw-stats">
                      <span>🥇 TOP3 {kwResults.filter(r=>r.found&&r.rank<=3).length}개</span>
                      <span>🏆 TOP10 {kwResults.filter(r=>r.found&&r.rank<=10).length}개</span>
                      <span>✅ 노출 {kwResults.filter(r=>r.found).length}개</span>
                      <span>❌ 미노출 {kwResults.filter(r=>!r.found).length}개</span>
                    </div>
                  )}
                </div>
              )}

              <div className="tip-box" style={{marginTop:16}}>
                💡 <strong>활용 팁</strong><br/>
                1위~3위 → 글 제목과 태그에 해당 키워드가 잘 녹아있는지 확인<br/>
                미노출 → 경쟁이 낮은 롱테일 키워드로 변경하거나 글 품질 개선 필요
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
