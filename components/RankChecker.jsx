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
  const [view, setView]           = useState('rank');   // 'rank' | 'post'
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
  const abortRef = useRef(false);
  const inputRef = useRef(null);

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
      const res = await fetch('/api/blog/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: id, maxPosts: 50 }),
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
        setRankResults(p => ({ ...p, [`${post.logNo}_${kw}`]: { rank: data.rank, found: data.found } }));
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
        acc.push({ keyword: kw, rank: d.rank, found: d.found });
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
                      <span><span className="src-dot" style={{background:'#a78bfa'}}/>AI — Claude AI가 제목 분석</span>
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
                      {rankRows.map(({ post, kw, rank, found, checked }, i) => {
                        const rs = getRankStyle(found ? rank : null);
                        const srcInfo = getSourceBadge(post.keywordSource);
                        const isChecking = isRunning && !checked;
                        return (
                          <div key={`${post.logNo}_${kw}_${i}`} className="rank-row fade-up" style={{animationDelay:`${i*0.03}s`}}>
                            {/* 순위 숫자 */}
                            <div className="rank-num-wrap">
                              {isChecking ? (
                                <div className="rank-num pulse" style={{color:'var(--text-muted)',fontSize:20}}>···</div>
                              ) : (
                                <div className="rank-num" style={{color: found ? rs.color : 'var(--rank-none)'}}>
                                  {found ? rank : '—'}
                                </div>
                              )}
                              <div className="rank-num-label">{found ? '번째 노출' : (isChecking ? '확인중' : '미노출')}</div>
                            </div>
                            <div className="rank-divider" />
                            {/* 키워드 + 글 */}
                            <div className="rank-info">
                              <div className="rank-kw">
                                <span style={{color:rs.color,flexShrink:0}}>#</span>
                                <span className="rank-kw-text">{kw}</span>
                                {srcInfo && (
                                  <span className="src-badge" style={{color:srcInfo.color,borderColor:srcInfo.color+'40',background:srcInfo.color+'12'}}>
                                    {srcInfo.label}
                                  </span>
                                )}
                              </div>
                              <a href={post.link} target="_blank" rel="noreferrer" className="rank-post" style={{color:'var(--text-sub)'}}>
                                {post.title}
                              </a>
                            </div>
                            {/* 뱃지 */}
                            {!isChecking && (
                              <span
                                className={`rank-badge ${found?'exposed':'hidden'}`}
                                style={found ? {color:rs.color,borderColor:rs.color+'60',background:rs.bg} : {}}
                              >
                                {found ? rs.label : '미노출'}
                              </span>
                            )}
                          </div>
                        );
                      })}
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
                                return (
                                  <span key={kw} className={`kw-chip${checking?' pulse':''}`}
                                    style={{
                                      color:    rs ? rs.color : 'var(--text-muted)',
                                      borderColor: rs ? rs.color+'50' : 'var(--border)',
                                      background:  rs ? rs.bg : 'var(--surface2)',
                                    }}>
                                    <span>#{kw}</span>
                                    {rs && <span className="kw-chip-rank">{rs.found ? `${r.rank}위` : '미노출'}</span>}
                                    {checking && <span style={{fontSize:10}}>···</span>}
                                  </span>
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
                    return (
                      <div key={i} className="kw-result-row fade-up" style={{animationDelay:`${i*0.05}s`}}>
                        <div className="kw-result-left">
                          <span className="kw-result-idx">{i+1}</span>
                          <div>
                            <div className="kw-result-name">{r.keyword}</div>
                            <div className="kw-result-label" style={{color:rs.color}}>
                              {r.found ? `네이버 검색 결과 ${r.rank}번째 노출` : '검색 결과 미노출 (100위 밖)'}
                            </div>
                          </div>
                        </div>
                        <div className="kw-result-rank" style={{color: r.found ? rs.color : 'var(--rank-none)'}}>
                          {r.found ? `${r.rank}위` : '—'}
                        </div>
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
