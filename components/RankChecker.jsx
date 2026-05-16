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

// SEO 종합 점수 계산
function calcSEOScore(allRows) {
  if (!allRows.length) return { score: 0, grade: 'D', color: '#ef4444', label: '데이터 없음' };
  const checked = allRows.filter(r => r.rank !== undefined || r.found !== undefined);
  if (!checked.length) return { score: 0, grade: 'D', color: '#ef4444', label: '분석 중' };
  const top1  = allRows.filter(r => r.found && r.rank === 1).length;
  const top3  = allRows.filter(r => r.found && r.rank <= 3).length;
  const top10 = allRows.filter(r => r.found && r.rank <= 10).length;
  const top30 = allRows.filter(r => r.found && r.rank <= 30).length;
  const exposed = allRows.filter(r => r.found).length;
  const total = checked.length;
  const expRate = exposed / total;
  let score = 0;
  score += top1  * 12;
  score += (top3  - top1)  * 8;
  score += (top10 - top3)  * 5;
  score += (top30 - top10) * 2;
  score += expRate * 30;
  score = Math.min(100, Math.round(score));
  let grade, color, label;
  if (score >= 80) { grade='S'; color='#f59e0b'; label='최상위 블로그'; }
  else if (score >= 60) { grade='A'; color='#10b981'; label='우수한 SEO 상태'; }
  else if (score >= 40) { grade='B'; color='#3b82f6'; label='양호 - 개선 여지 있음'; }
  else if (score >= 20) { grade='C'; color='#f97316'; label='개선이 필요한 상태'; }
  else { grade='D'; color='#ef4444'; label='즉각적인 SEO 개선 필요'; }
  return { score, grade, color, label };
}

// PDF 보고서 생성
function generatePDF(blogId, posts, rankResults) {
  const allRows = posts.flatMap(p =>
    (p.keywords||[]).map(kw => {
      const r = rankResults[`${p.logNo}_${kw}`];
      return { post: p, kw, rank: r?.rank, found: r?.found ?? false, total: r?.total ?? 0 };
    })
  );
  const seo = calcSEOScore(allRows);
  const top3list   = allRows.filter(r => r.found && r.rank <= 3).sort((a,b)=>a.rank-b.rank);
  const top10list  = allRows.filter(r => r.found && r.rank > 3 && r.rank <= 10).sort((a,b)=>a.rank-b.rank);
  const opps       = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && !titleContains(r.post.title, r.kw));
  const easyWins   = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && titleContains(r.post.title, r.kw));
  const highComp   = allRows.filter(r => !r.found && r.total >= 150000);
  const midRange   = allRows.filter(r => !r.found && r.total >= 3000 && r.total < 150000);
  const now = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});

  const kwRow = (r, i) => `
    <tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:8px 12px;font-size:13px;color:#666">${i+1}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:700">${r.kw}</td>
      <td style="padding:8px 12px;font-size:13px">${r.found ? `<span style="color:#ec4899;font-weight:800">${r.rank}위</span>` : '<span style="color:#999">미노출</span>'}</td>
      <td style="padding:8px 12px;font-size:12px;color:#666;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.post.title}</td>
    </tr>`;

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
  <title>블로그 순위 분석 리포트 - ${blogId}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e1e2e;background:#fff;padding:40px;max-width:820px;margin:0 auto}
    .cover{text-align:center;padding:48px 0 40px;border-bottom:3px solid #ec4899;margin-bottom:36px}
    .cover-badge{display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;padding:6px 18px;border-radius:99px;font-size:12px;font-weight:700;margin-bottom:16px}
    .cover-title{font-size:28px;font-weight:900;letter-spacing:-1px;margin-bottom:8px}
    .cover-sub{font-size:14px;color:#888;margin-bottom:20px}
    .score-box{display:inline-flex;align-items:center;gap:16px;background:#fdf2f8;border:2px solid #ec4899;border-radius:16px;padding:16px 32px}
    .score-grade{font-size:48px;font-weight:900;color:#ec4899;line-height:1}
    .score-num{font-size:14px;color:#666;margin-top:4px}
    .score-label{font-size:15px;font-weight:700;color:#333}
    .section{margin-bottom:32px}
    .section-title{font-size:16px;font-weight:800;color:#1e1e2e;padding:10px 16px;background:#fdf2f8;border-left:4px solid #ec4899;border-radius:0 8px 8px 0;margin-bottom:14px}
    .kv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
    .kv-card{background:#f8f9fa;border-radius:10px;padding:14px;text-align:center}
    .kv-val{font-size:26px;font-weight:900;color:#ec4899}
    .kv-label{font-size:11px;color:#888;margin-top:4px}
    table{width:100%;border-collapse:collapse}
    th{background:#fdf2f8;padding:9px 12px;font-size:12px;font-weight:700;color:#888;text-align:left}
    .insight-block{background:#f8f9fa;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:3px solid #ec4899}
    .insight-block-title{font-size:13px;font-weight:800;color:#333;margin-bottom:4px}
    .insight-block-body{font-size:12px;color:#666;line-height:1.8}
    .action-item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0}
    .action-num{width:24px;height:24px;border-radius:50%;background:#ec4899;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
    .action-text{font-size:13px;color:#333;line-height:1.7}
    .footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
    @media print{body{padding:20px}@page{margin:15mm}}
  </style></head><body>
  <div class="cover">
    <div class="cover-badge">📊 NAVER BLOG SEO REPORT</div>
    <div class="cover-title">블로그 순위 종합 분석 리포트</div>
    <div class="cover-sub">블로그 ID: <strong>${blogId}</strong> &nbsp;·&nbsp; 분석일시: ${now}</div>
    <div class="score-box">
      <div><div class="score-grade" style="color:${seo.color}">${seo.grade}</div><div class="score-num">${seo.score}점 / 100점</div></div>
      <div style="width:1px;height:50px;background:#e5e7eb"></div>
      <div><div class="score-label">${seo.label}</div><div style="font-size:12px;color:#888;margin-top:4px">전체 ${posts.length}개 글 · ${allRows.length}개 키워드 분석</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📈 핵심 지표 요약</div>
    <div class="kv-grid">
      <div class="kv-card"><div class="kv-val">${posts.length}</div><div class="kv-label">전체 글</div></div>
      <div class="kv-card"><div class="kv-val" style="color:#f59e0b">${top3list.length}</div><div class="kv-label">TOP 3 키워드</div></div>
      <div class="kv-card"><div class="kv-val" style="color:#a855f7">${top3list.length+top10list.length}</div><div class="kv-label">TOP 10 키워드</div></div>
      <div class="kv-card"><div class="kv-val" style="color:#10b981">${allRows.filter(r=>r.found).length}</div><div class="kv-label">노출 키워드</div></div>
    </div>
  </div>

  ${top3list.length ? `<div class="section">
    <div class="section-title">🥇 상위 3위 노출 키워드</div>
    <table><thead><tr><th>#</th><th>키워드</th><th>순위</th><th>글 제목</th></tr></thead><tbody>
    ${top3list.map(kwRow).join('')}
    </tbody></table>
  </div>` : ''}

  ${top10list.length ? `<div class="section">
    <div class="section-title">🏆 TOP 4~10위 노출 키워드</div>
    <table><thead><tr><th>#</th><th>키워드</th><th>순위</th><th>글 제목</th></tr></thead><tbody>
    ${top10list.map(kwRow).join('')}
    </tbody></table>
  </div>` : ''}

  ${opps.length ? `<div class="section">
    <div class="section-title">🎯 즉시 활용 가능한 기회 키워드 (경쟁 낮음 + 제목 미포함)</div>
    <div class="insight-block"><div class="insight-block-title">📌 활용 방법</div>
    <div class="insight-block-body">아래 키워드들은 경쟁자가 3,000명 미만인데 아직 내 글 제목에 포함되어 있지 않아요.<br>해당 글 제목에 키워드를 추가하는 것만으로 상위 노출 가능성이 크게 높아집니다.</div></div>
    <table><thead><tr><th>#</th><th>키워드</th><th>현재 순위</th><th>글 제목</th></tr></thead><tbody>
    ${opps.slice(0,10).map(kwRow).join('')}
    </tbody></table>
  </div>` : ''}

  ${easyWins.length ? `<div class="section">
    <div class="section-title">📝 글 품질 보강 필요 (경쟁 낮음 + 제목 포함 중)</div>
    <div class="insight-block"><div class="insight-block-title">📌 활용 방법</div>
    <div class="insight-block-body">제목엔 키워드가 있는데 노출이 안 되고 있어요.<br>본문에서 해당 키워드를 2~3회 자연스럽게 추가하고, 글 길이를 1,500자 이상으로 늘려보세요.</div></div>
    <table><thead><tr><th>#</th><th>키워드</th><th>현재 순위</th><th>글 제목</th></tr></thead><tbody>
    ${easyWins.slice(0,10).map(kwRow).join('')}
    </tbody></table>
  </div>` : ''}

  ${highComp.length ? `<div class="section">
    <div class="section-title">⚠️ 경쟁 포화 키워드 (교체 권장)</div>
    <div class="insight-block"><div class="insight-block-title">📌 전략 제안</div>
    <div class="insight-block-body">검색 결과가 15만 개 이상인 고경쟁 키워드예요. 대형 블로그와 경쟁해야 하므로 단기간 상위 노출이 어렵습니다.<br>예: "맛집" → "강릉 중앙시장 현지인 맛집", "카페" → "성수동 감성 테라스 카페" 처럼 더 구체적으로 바꾸세요.</div></div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">✅ 우선순위별 액션 플랜</div>
    ${[
      opps.length ? `<div class="action-item"><div class="action-num">1</div><div class="action-text"><strong>[즉시 실행]</strong> 기회 키워드 ${opps.length}개를 해당 글 제목에 추가하세요. 제목 앞부분에 키워드를 자연스럽게 배치하면 효과가 큽니다.</div></div>` : '',
      easyWins.length ? `<div class="action-item"><div class="action-num">${opps.length?2:1}</div><div class="action-text"><strong>[이번 주 실행]</strong> 글 품질 보강 키워드 ${easyWins.length}개의 본문을 업데이트하세요. 키워드를 본문에 2~3회 추가하고 내부 링크를 연결하세요.</div></div>` : '',
      midRange.length ? `<div class="action-item"><div class="action-num">${[opps.length,easyWins.length].filter(Boolean).length+1}</div><div class="action-text"><strong>[중기 전략]</strong> 중간 경쟁도 키워드 ${midRange.length}개는 글의 전문성을 높이는 방향으로 접근하세요. 이미지, 표, 상세 설명을 보강해 체류 시간을 늘리세요.</div></div>` : '',
      highComp.length ? `<div class="action-item"><div class="action-num">${[opps.length,easyWins.length,midRange.length].filter(Boolean).length+1}</div><div class="action-text"><strong>[키워드 교체]</strong> 포화 키워드 ${highComp.length}개는 더 구체적인 롱테일 키워드로 교체를 검토하세요. 구체적일수록 타겟이 명확해지고 전환율도 높아집니다.</div></div>` : '',
    ].filter(Boolean).join('')}
  </div>

  <div class="footer">본 리포트는 블로그 순위 체커 자동 분석 결과입니다 · ${now} 기준</div>
  </body></html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 800);
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
  const [showGuide, setShowGuide]       = useState(false);
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
    '--bg':           '#0c0814',          // 핑크 틴트 다크
    '--bg2':          '#130d1f',
    '--bg3':          '#1a1030',
    '--surface':      'rgba(244,114,182,.06)',   // 핑크 틴트 서피스
    '--surface2':     'rgba(244,114,182,.10)',
    '--surface3':     'rgba(244,114,182,.16)',
    '--border':       'rgba(244,114,182,.12)',   // 핑크 테두리
    '--border2':      'rgba(244,114,182,.25)',
    '--text':         '#ffe8f5',
    '--text-sub':     'rgba(255,220,240,.65)',
    '--text-muted':   'rgba(255,200,230,.3)',
    '--accent':       '#f472b6',
    '--accent2':      '#ec4899',
    '--accent3':      '#c026d3',
    '--accent-bg':    'rgba(244,114,182,.15)',
    '--accent-glow':  'rgba(244,114,182,.5)',
    '--gold':         '#fbbf24',
    '--rank-none':    '#8b6f8b',
    '--rank-none-bg': 'rgba(139,111,139,.12)',
    '--inp-bg':       'rgba(244,114,182,.07)',
    '--shadow':       '0 8px 40px rgba(236,72,153,.2)',
    '--shadow-sm':    '0 2px 16px rgba(236,72,153,.12)',
    '--header-bg':    'rgba(12,8,20,.88)',
    '--glass':        'rgba(244,114,182,.07)',
    '--glass-border': 'rgba(244,114,182,.15)',
  } : {
    '--bg':           '#fff0f8',
    '--bg2':          '#fff',
    '--bg3':          '#ffe4f2',
    '--surface':      'rgba(255,255,255,.95)',
    '--surface2':     'rgba(244,114,182,.08)',
    '--surface3':     'rgba(244,114,182,.16)',
    '--border':       'rgba(236,72,153,.18)',
    '--border2':      'rgba(236,72,153,.35)',
    '--text':         '#1a0528',
    '--text-sub':     '#7b2d5e',
    '--text-muted':   '#d08ab0',
    '--accent':       '#ec4899',
    '--accent2':      '#db2777',
    '--accent3':      '#be185d',
    '--accent-bg':    'rgba(236,72,153,.1)',
    '--accent-glow':  'rgba(236,72,153,.35)',
    '--gold':         '#d97706',
    '--rank-none':    '#b08090',
    '--rank-none-bg': 'rgba(176,128,144,.1)',
    '--inp-bg':       '#fff',
    '--shadow':       '0 8px 32px rgba(236,72,153,.18)',
    '--shadow-sm':    '0 2px 12px rgba(236,72,153,.1)',
    '--header-bg':    'rgba(255,240,248,.92)',
    '--glass':        'rgba(255,255,255,.8)',
    '--glass-border': 'rgba(236,72,153,.2)',
  };

  const css = `
    /* v2 */ @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    html,body { background:var(--bg); height:100%; overflow-x:hidden; -webkit-font-smoothing:antialiased; }
    ::-webkit-scrollbar { width:3px; } ::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }

    .rc-wrap { font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif; min-height:100vh; background:var(--bg); color:var(--text); }

    /* ── BG ── */
    .rc-bg { position:fixed; inset:0; z-index:0; pointer-events:none; }
    .orb { position:absolute; border-radius:50%; filter:blur(90px); }
    .orb1 { width:800px;height:800px; background:radial-gradient(circle,rgba(244,114,182,.28) 0%,transparent 65%); top:-300px;right:-200px; animation:o1 20s ease-in-out infinite; }
    .orb2 { width:600px;height:600px; background:radial-gradient(circle,rgba(192,38,211,.2) 0%,transparent 65%); bottom:-200px;left:-100px; animation:o2 25s ease-in-out infinite; }
    .orb3 { width:400px;height:400px; background:radial-gradient(circle,rgba(236,72,153,.15) 0%,transparent 65%); top:40%;left:30%; animation:o3 18s ease-in-out infinite; }
    @keyframes o1{0%,100%{transform:translate(0,0)}50%{transform:translate(-80px,100px)}}
    @keyframes o2{0%,100%{transform:translate(0,0)}50%{transform:translate(100px,-80px)}}
    @keyframes o3{0%,100%{transform:translate(0,0)}33%{transform:translate(60px,-60px)}66%{transform:translate(-50px,70px)}}

    /* ── LAYOUT ── */
    .rc-layout { position:relative; z-index:1; display:flex; flex-direction:column; min-height:100vh; }

    /* ── HEADER ── */
    .rc-hdr { display:flex; align-items:center; justify-content:space-between; padding:0 32px; height:64px; background:var(--header-bg); backdrop-filter:blur(24px); border-bottom:1px solid rgba(244,114,182,.2); position:sticky; top:0; z-index:100; flex-shrink:0; box-shadow:0 1px 24px rgba(236,72,153,.12); }
    .rc-logo { display:flex; align-items:center; gap:10px; }
    .logo-icon { width:36px;height:36px;border-radius:10px; background:linear-gradient(135deg,#f472b6,#c026d3); display:flex;align-items:center;justify-content:center;font-size:18px; box-shadow:0 4px 16px rgba(244,114,182,.5); flex-shrink:0; }
    .logo-title { font-size:17px;font-weight:900;letter-spacing:-.5px; background:linear-gradient(135deg,#f9a8d4,#f472b6); -webkit-background-clip:text;-webkit-text-fill-color:transparent; }
    .logo-sub { font-size:9px;color:var(--text-sub);font-weight:700;letter-spacing:.5px;margin-top:1px; }
    .hdr-right { display:flex;align-items:center;gap:8px; }
    .hdr-btn { height:34px;padding:0 14px;border-radius:9px;border:1px solid rgba(244,114,182,.25);background:rgba(244,114,182,.08);color:#f9a8d4;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap;display:flex;align-items:center;gap:5px; }
    .hdr-btn:hover { background:rgba(244,114,182,.2);border-color:var(--text-sub); }
    .hdr-btn-icon { width:34px;padding:0;justify-content:center;font-size:15px; }
    .hdr-btn-pink { background:linear-gradient(135deg,rgba(244,114,182,.2),rgba(192,38,211,.15));border-color:var(--text-muted); }

    /* ── TABS ── */
    .rc-tabs { display:flex;align-items:center;gap:4px;background:rgba(244,114,182,.06);border-radius:10px;padding:3px;border:1px solid rgba(244,114,182,.15); }
    .rc-tab { padding:6px 16px;font-size:12px;font-weight:700;color:rgba(249,168,212,.5);border:none;background:none;cursor:pointer;font-family:inherit;border-radius:7px;transition:all .2s;white-space:nowrap; }
    .rc-tab.active { background:linear-gradient(135deg,#f472b6,#c026d3);color:#fff;box-shadow:0 2px 12px rgba(244,114,182,.4); }

    /* ── PC 2컬럼 ── */
    .rc-body { display:flex;flex:1; }
    .rc-sidebar { width:340px;flex-shrink:0;border-right:1px solid rgba(244,114,182,.12);padding:24px 20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;height:calc(100vh - 64px);position:sticky;top:64px;background:var(--bg2); }
    .rc-main { flex:1;min-width:0;padding:24px;overflow-y:auto;background:var(--bg); }

    /* ── INPUT ── */
    .inp-label { font-size:10px;color:var(--accent);font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px; }
    .inp-prefix-wrap { position:relative; }
    .inp-prefix { position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--text-muted);pointer-events:none;white-space:nowrap; }
    .inp { width:100%;height:48px;padding-right:12px;background:var(--inp-bg);border:1.5px solid rgba(244,114,182,.25);border-radius:12px;color:var(--text);font-family:inherit;font-size:14px;font-weight:700;outline:none;transition:all .25s; }
    .inp:focus { border-color:#f472b6;box-shadow:0 0 0 4px rgba(244,114,182,.15);background:var(--surface2); }
    .inp::placeholder { color:var(--text-muted);font-weight:400; }
    .inp-pl { padding-left:120px; }
    .inp-plain { padding-left:12px; }
    .inp-ta { height:90px;padding:12px;resize:none;line-height:1.7; }
    .btn-pink { width:100%;height:48px;background:linear-gradient(135deg,#f472b6,#c026d3);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;transition:all .25s;box-shadow:0 4px 20px rgba(244,114,182,.4);letter-spacing:-.2px; }
    .btn-pink:hover { transform:translateY(-2px);box-shadow:0 8px 32px rgba(244,114,182,.55);filter:brightness(1.08); }
    .btn-pink:active { transform:translateY(0); }
    .btn-pink:disabled { opacity:.3;cursor:not-allowed;transform:none;filter:none;box-shadow:none; }
    .btn-ghost { height:34px;padding:0 14px;background:rgba(244,114,182,.06);border:1px solid rgba(244,114,182,.2);border-radius:9px;color:rgba(244,114,182,.7);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s; }
    .btn-ghost:hover { background:rgba(244,114,182,.15);border-color:var(--text-muted);color:#f472b6; }
    .err-box { padding:10px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;font-size:12px;color:#f87171;line-height:1.6; }

    /* ── PROGRESS ── */
    .prog-card { background:rgba(244,114,182,.06);border:1px solid rgba(244,114,182,.15);border-radius:14px;padding:16px 18px; }
    .prog-row { display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px; }
    .prog-lbl { font-size:13px;color:var(--text-sub);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0; }
    .prog-pct { font-size:15px;font-weight:900;background:linear-gradient(135deg,#f472b6,#c026d3);-webkit-background-clip:text;-webkit-text-fill-color:transparent;flex-shrink:0; }
    .prog-bar { height:5px;background:rgba(244,114,182,.1);border-radius:99px;overflow:hidden; }
    .prog-fill { height:100%;background:linear-gradient(90deg,#f472b6,#c026d3,#fbbf24);border-radius:99px;transition:width .5s cubic-bezier(.4,0,.2,1); }
    .stop-btn { padding:4px 12px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);border-radius:7px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0; }

    /* ── STATS ── */
    .stats-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px; }
    .stat-box { background:rgba(244,114,182,.06);border:1px solid rgba(244,114,182,.15);border-radius:14px;padding:14px;text-align:center;transition:all .25s;cursor:default; }
    .stat-box:hover { background:rgba(244,114,182,.12);border-color:var(--text-muted);transform:translateY(-2px);box-shadow:0 6px 20px rgba(244,114,182,.2); }
    .stat-ico { font-size:20px;margin-bottom:5px; }
    .stat-num { font-size:26px;font-weight:900;line-height:1;margin-bottom:3px;letter-spacing:-1px; }
    .stat-lbl { font-size:10px;color:var(--text-sub);font-weight:700;letter-spacing:.4px; }

    /* ── SECTION HEADER ── */
    .sec-hdr { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap; }
    .view-toggle { display:flex;gap:3px;background:rgba(244,114,182,.06);border-radius:10px;padding:3px;border:1px solid rgba(244,114,182,.15); }
    .vbtn { flex:1;padding:7px 14px;border-radius:7px;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s;white-space:nowrap; }
    .vbtn.on { background:linear-gradient(135deg,#f472b6,#c026d3);color:#fff;box-shadow:0 2px 12px rgba(244,114,182,.4); }
    .vbtn:not(.on) { background:none;color:var(--text-muted); }

    /* ── RANK ROWS ── */
    .rank-list { display:flex;flex-direction:column;gap:8px; }
    .rank-row { display:flex;align-items:center;gap:14px;background:rgba(244,114,182,.05);border:1px solid rgba(244,114,182,.12);border-radius:14px;padding:14px 16px;transition:all .25s; }
    .rank-row:hover { border-color:var(--text-muted);background:rgba(244,114,182,.09);box-shadow:0 4px 20px rgba(244,114,182,.15);transform:translateY(-1px); }
    .rnum-wrap { display:flex;flex-direction:column;align-items:center;min-width:48px;flex-shrink:0; }
    .rnum { font-size:30px;font-weight:900;line-height:1;letter-spacing:-2px; }
    .rnum-sub { font-size:9px;font-weight:700;color:var(--text-muted);letter-spacing:.3px;margin-top:2px;white-space:nowrap; }
    .rdiv { width:1px;height:44px;background:rgba(244,114,182,.15);flex-shrink:0; }
    .rinfo { flex:1;min-width:0; }
    .rkw { font-size:14px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap; }
    .rkw-text { white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px; }
    .rpost { font-size:11px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;display:block; }
    .rpost:hover { color:#f472b6; }
    .rbadge { font-size:12px;font-weight:800;padding:5px 13px;border-radius:99px;flex-shrink:0;border:1.5px solid;white-space:nowrap; }
    .rbadge-hidden { background:rgba(139,111,139,.1);color:rgba(139,111,139,.7);border-color:transparent; }

    /* ── POST CARDS ── */
    .post-list { display:flex;flex-direction:column;gap:8px; }
    .post-card { background:rgba(244,114,182,.05);border:1px solid rgba(244,114,182,.12);border-radius:14px;padding:16px;transition:all .2s; }
    .post-card:hover { border-color:rgba(244,114,182,.3);background:rgba(244,114,182,.08); }
    .post-head { display:flex;align-items:flex-start;gap:10px;margin-bottom:10px; }
    .post-num { font-size:11px;color:var(--text-muted);font-weight:700;min-width:18px;padding-top:2px;text-align:right;flex-shrink:0; }
    .post-meta { flex:1;min-width:0; }
    .post-title { font-size:13px;font-weight:700;color:var(--text);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px; }
    .post-title:hover { color:#f472b6; }
    .post-date { font-size:11px;color:var(--text-muted); }
    .post-best { font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;flex-shrink:0;white-space:nowrap; }
    .kw-chips { display:flex;flex-wrap:wrap;gap:5px;padding-left:28px; }
    .kw-chip { font-size:11px;font-weight:700;padding:5px 10px;border-radius:99px;border:1.5px solid;transition:all .2s;display:flex;align-items:center;gap:4px; }

    /* ── BADGES ── */
    .src-badge { font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;border:1px solid;flex-shrink:0; }
    .comp-badge { font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;border:1px solid;flex-shrink:0; }
    .insight-box { margin-top:8px;padding:8px 12px;border-radius:9px;border:1px solid;font-size:11px;font-weight:600;line-height:1.6;margin-left:28px; }
    .opp-glow { box-shadow:0 0 0 2px rgba(16,185,129,.35) !important; }

    /* ── REPORT ── */
    .report-card { background:rgba(244,114,182,.05);border:1px solid rgba(244,114,182,.15);border-radius:16px;padding:18px;margin-bottom:16px; }
    .report-hdr { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(244,114,182,.12); }
    .report-title { font-size:14px;font-weight:800;color:var(--text); }
    .report-section { padding:12px 0;border-top:1px solid rgba(244,114,182,.08); }
    .report-section:first-of-type { border-top:none;padding-top:0; }
    .report-stitle { font-size:12px;font-weight:800;margin-bottom:6px; }
    .report-body { font-size:11px;color:var(--text-sub);line-height:1.85; }

    /* ── KW RANKER ── */
    .kw-2col { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px; }
    .kw-res-list { background:rgba(244,114,182,.05);border:1px solid rgba(244,114,182,.15);border-radius:14px;overflow:hidden; }
    .kw-res-hdr { padding:12px 16px;border-bottom:1px solid rgba(244,114,182,.1);font-size:10px;font-weight:700;color:var(--text-sub);letter-spacing:.5px;display:flex;justify-content:space-between; }
    .kw-res-row { padding:12px 16px;border-bottom:1px solid rgba(244,114,182,.06);transition:background .15s;display:flex;flex-direction:column;gap:6px; }
    .kw-res-row:last-child { border-bottom:none; }
    .kw-res-row:hover { background:rgba(244,114,182,.07); }
    .kw-res-top { display:flex;align-items:center;justify-content:space-between; }
    .kw-res-left { display:flex;align-items:center;gap:10px;min-width:0; }
    .kw-res-idx { font-size:10px;color:var(--text-muted);font-weight:700;min-width:16px;flex-shrink:0; }
    .kw-res-rank { font-size:20px;font-weight:900;min-width:52px;text-align:center;flex-shrink:0; }
    .kw-res-name { font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .kw-res-lbl { font-size:11px;color:var(--text-sub);margin-top:2px; }
    .kw-stats { padding:10px 16px;display:flex;gap:12px;font-size:11px;color:var(--text-muted);border-top:1px solid rgba(244,114,182,.08);flex-wrap:wrap; }

    /* ── TIP BOX ── */
    .tip-box { padding:12px 14px;background:rgba(244,114,182,.07);border:1px solid rgba(244,114,182,.18);border-radius:12px;font-size:11px;color:var(--text-sub);line-height:1.85; }
    .src-dot { width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:4px; }

    /* ── FLOATING BTN ── */
    @keyframes floatAnim{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes pinkGlow{0%,100%{box-shadow:0 4px 24px rgba(244,114,182,.5)}50%{box-shadow:0 8px 40px rgba(244,114,182,.75),0 0 0 8px rgba(244,114,182,.05)}}
    .float-btn { position:fixed;bottom:24px;right:22px;z-index:150;display:flex;align-items:center;gap:8px;padding:13px 20px;border-radius:99px;border:none;background:linear-gradient(135deg,#f472b6,#c026d3);color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;animation:floatAnim 3s ease-in-out infinite,pinkGlow 3s ease-in-out infinite;letter-spacing:-.1px; }
    .float-btn:hover { animation:none;transform:scale(1.08);box-shadow:0 8px 40px rgba(244,114,182,.7); }

    /* ── GUIDE MODAL ── */
    .guide-modal { position:fixed;bottom:0;left:0;right:0;max-height:88vh;background:var(--bg2);z-index:201;border-radius:24px 24px 0 0;box-shadow:0 -8px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;animation:slideUp .3s cubic-bezier(.4,0,.2,1); }
    .modal-handle { width:40px;height:4px;border-radius:99px;background:rgba(244,114,182,.3);margin:12px auto 0;flex-shrink:0; }
    .modal-head { padding:16px 20px 14px;border-bottom:1px solid rgba(244,114,182,.12);display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
    .modal-title { font-size:15px;font-weight:800;color:var(--text); }
    .modal-close { width:34px;height:34px;border-radius:10px;border:1px solid rgba(244,114,182,.2);background:rgba(244,114,182,.07);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text); }
    .modal-body { padding:16px 20px 40px;overflow-y:auto; }
    .guide-sec { padding:14px 0;border-bottom:1px solid rgba(244,114,182,.08); }
    .guide-sec:last-child { border-bottom:none; }
    .guide-sec-title { font-size:13px;font-weight:800;color:var(--text);margin-bottom:7px; }
    .guide-p { font-size:12px;color:var(--text-sub);line-height:1.8;margin-bottom:8px; }
    .guide-rows { display:flex;flex-direction:column;gap:6px; }
    .guide-row { display:flex;align-items:center;gap:10px; }
    @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }

    /* ── SETTINGS DRAWER ── */
    .overlay { position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:200;backdrop-filter:blur(6px); }
    .drawer { position:fixed;bottom:0;left:0;right:0;max-height:92vh;background:var(--bg2);z-index:201;border-radius:24px 24px 0 0;box-shadow:0 -8px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;animation:slideUp .3s cubic-bezier(.4,0,.2,1); }
    .drawer-handle { width:40px;height:4px;border-radius:99px;background:rgba(244,114,182,.3);margin:12px auto 0;flex-shrink:0; }
    .drawer-head { padding:16px 20px 14px;border-bottom:1px solid rgba(244,114,182,.12);display:flex;align-items:center;justify-content:space-between;flex-shrink:0; }
    .drawer-title { font-size:15px;font-weight:800;color:var(--text); }
    .drawer-close { width:34px;height:34px;border-radius:10px;border:1px solid rgba(244,114,182,.2);background:rgba(244,114,182,.07);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text); }
    .drawer-body { padding:16px 20px;flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto;padding-bottom:40px; }
    .ai-card { background:rgba(244,114,182,.05);border:1.5px solid rgba(244,114,182,.15);border-radius:14px;padding:14px;transition:all .2s; }
    .ai-card.sel { border-color:#f472b6;background:rgba(244,114,182,.1); }
    .ai-card-top { display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px; }
    .ai-name { font-size:13px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px;min-width:0; }
    .badge-free { font-size:9px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);white-space:nowrap;flex-shrink:0; }
    .badge-partial { font-size:9px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.3);white-space:nowrap;flex-shrink:0; }
    .badge-paid { font-size:9px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);white-space:nowrap;flex-shrink:0; }
    .badge-sel { font-size:9px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(244,114,182,.15);color:#f472b6;border:1px solid rgba(244,114,182,.4);white-space:nowrap;flex-shrink:0; }
    .ai-inp-col { display:flex;flex-direction:column;gap:7px; }
    .ai-inp-row { display:flex;gap:7px; }
    .ai-inp { flex:1;height:42px;padding:0 12px;background:rgba(244,114,182,.07);border:1.5px solid rgba(244,114,182,.18);border-radius:10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:all .2s;min-width:0; }
    .ai-inp:focus { border-color:#f472b6;box-shadow:0 0 0 3px rgba(244,114,182,.12); }
    .ai-inp::placeholder { color:rgba(244,114,182,.3);font-size:11px; }
    .issue-btn { height:42px;padding:0 13px;border:1.5px solid rgba(244,114,182,.25);border-radius:10px;background:rgba(244,114,182,.07);color:rgba(244,114,182,.7);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all .2s;flex-shrink:0; }
    .issue-btn:hover { border-color:#f472b6;color:#f472b6; }
    .use-btn { width:100%;height:36px;border-radius:9px;border:1.5px solid rgba(244,114,182,.25);background:rgba(244,114,182,.06);color:rgba(244,114,182,.6);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s;margin-top:4px; }
    .use-btn.sel { background:linear-gradient(135deg,#f472b6,#c026d3);border-color:#f472b6;color:#fff;box-shadow:0 2px 12px rgba(244,114,182,.4); }
    .dev-warn { background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.22);border-radius:11px;padding:11px 14px;font-size:11px;color:#f59e0b;line-height:1.8; }
    .ai-ok-info { background:rgba(244,114,182,.08);border:1px solid rgba(244,114,182,.3);border-radius:10px;padding:10px 14px;font-size:12px;color:#f472b6;font-weight:600; }
    .ai-no-info { background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.18);border-radius:10px;padding:10px 14px;font-size:12px;color:#f87171;font-weight:600; }

    /* ── PC RESPONSIVE ── */
    @media(min-width:641px) {
      .drawer { bottom:auto;top:0;left:auto;right:0;height:100%;max-height:100%;max-width:440px;border-radius:0;box-shadow:-8px 0 60px rgba(0,0,0,.4); }
      .drawer-handle { display:none; }
      .guide-modal { left:auto;right:0;width:480px;border-radius:24px 24px 0 0; }
      .stats-grid { grid-template-columns:repeat(4,1fr); }
      .kw-2col { grid-template-columns:1fr 1fr; }
      .float-btn { bottom:28px;right:28px; }
    }

    /* ── MOBILE ── */
    @media(max-width:640px) {
      .rc-hdr { padding:0 14px;height:58px; }
      .logo-title { font-size:15px; }
      .logo-sub { display:none; }
      .logo-icon { width:32px;height:32px;font-size:16px; }
      .rc-body { flex-direction:column; }
      .rc-sidebar { width:100%;height:auto;position:static;border-right:none;border-bottom:1px solid rgba(244,114,182,.12);padding:16px;gap:12px; }
      .rc-main { padding:14px;padding-bottom:100px; }
      .inp { height:46px; }
      .btn-pink { height:46px;font-size:14px; }
      .stats-grid { grid-template-columns:repeat(2,1fr);gap:8px; }
      .stat-num { font-size:22px; }
      .rnum { font-size:24px; }
      .rnum-wrap { min-width:42px; }
      .rkw-text { max-width:130px; }
      .sec-hdr { flex-direction:column;align-items:flex-start; }
      .view-toggle { width:100%; }
      .hdr-btn span:last-child { display:none; }
      .kw-2col { grid-template-columns:1fr; }
      .float-btn { bottom:18px;right:14px;padding:11px 16px;font-size:12px; }
      .rc-tabs { padding:3px; }
      .rc-tab { padding:6px 12px;font-size:11px; }
    }
    @media(max-width:380px) {
      .stat-num { font-size:20px; }
      .rnum { font-size:20px; }
    }

    /* ── ANIMATIONS ── */
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
    .fu { animation:fadeUp .3s ease forwards; }
    .pulse { animation:pulse 1.5s infinite; }
  `;

  return (
    <div className="rc-wrap" style={vars}>
      <style>{css}</style>
      <div className="rc-bg"><div className="orb orb1"/><div className="orb orb2"/><div className="orb orb3"/></div>

      <div className="rc-layout">
        {/* ─── HEADER ─── */}
        <div className="rc-hdr">
          <div className="rc-logo">
            <div className="logo-icon">🌸</div>
            <div>
              <div className="logo-title">블로그 순위 체커</div>
              <div className="logo-sub">NAVER BLOG RANK TRACKER</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className="rc-tabs">
              {[['posts','📊 글 순위'],['keyword','🔍 키워드']].map(([v,l]) => (
                <button key={v} className={`rc-tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="hdr-right">
            {isDone && <>
              <button className="hdr-btn hdr-btn-pink" onClick={() => generatePDF(blogId, posts, rankResults)}>
                <span>📄</span><span>SEO보고서</span>
              </button>
              <button className="hdr-btn" onClick={() => exportCSV(posts, rankResults)}>
                <span>📊</span><span>순위저장</span>
              </button>
            </>}
            <button className="hdr-btn hdr-btn-icon" onClick={() => setShowSettings(true)}>⚙️</button>
            <button className="hdr-btn hdr-btn-icon" onClick={() => setTheme(t => t==='dark'?'light':'dark')}>
              {dark?'☀️':'🌙'}
            </button>
          </div>
        </div>

        {/* ─── BODY ─── */}
        <div className="rc-body">

          {/* ── SIDEBAR ── */}
          <div className="rc-sidebar">
            {tab === 'posts' && (
              <>
                <div>
                  <div className="inp-label">네이버 블로그 ID</div>
                  <div className="inp-prefix-wrap">
                    <span className="inp-prefix">blog.naver.com/</span>
                    <input className="inp inp-pl" placeholder="myblogid" value={blogId}
                      onChange={e=>setBlogId(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&!isRunning&&handleStart()} />
                  </div>
                </div>
                <button className="btn-pink" onClick={handleStart} disabled={isRunning}>
                  {isRunning ? '분석 중...' : '🔍 순위 분석 시작'}
                </button>
                {error && <div className="err-box">⚠️ {error}</div>}

                {/* 진행 상태 */}
                {isRunning && (
                  <div className="prog-card fu">
                    <div className="prog-row">
                      <div className="prog-lbl">
                        {phase==='fetching' ? '📥 글 목록 수집 중...' : `🔍 "${progress.label}" 확인 중`}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {phase==='ranking' && <span className="prog-pct">{pct}%</span>}
                        <button className="stop-btn" onClick={()=>abortRef.current=true}>중단</button>
                      </div>
                    </div>
                    <div className="prog-bar">
                      <div className="prog-fill" style={{width:phase==='fetching'?'8%':`${pct}%`}}/>
                    </div>
                    {posts.length>0 && <div style={{marginTop:8,fontSize:11,color:'rgba(244,114,182,.4)'}}>{posts.length}개 글 수집 완료</div>}
                  </div>
                )}

                {/* 통계 */}
                {posts.length > 0 && (
                  <div className="stats-grid fu">
                    {[
                      {ico:'📄',num:stats.total,lbl:'전체 글',color:'var(--text)'},
                      {ico:'🥇',num:stats.top3,lbl:'TOP 3',color:'#f472b6'},
                      {ico:'🏆',num:stats.top10,lbl:'TOP 10',color:'#c026d3'},
                      {ico:'✅',num:stats.exposed,lbl:'노출',color:'#10b981'},
                    ].map(s=>(
                      <div key={s.lbl} className="stat-box">
                        <div className="stat-ico">{s.ico}</div>
                        <div className="stat-num" style={{color:s.color}}>{s.num}</div>
                        <div className="stat-lbl">{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                )}

                {isDone && (
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn-ghost" style={{flex:1}} onClick={()=>{setPosts([]);setRankResults({});setPhase('idle');setBlogId('');setError('');}}>초기화</button>
                  </div>
                )}

                <div className="tip-box">
                  💡 블로그 ID만 입력하면 자동으로 키워드 수집 후 순위 분석<br/>
                  <span style={{display:'flex',gap:10,marginTop:4,flexWrap:'wrap'}}>
                    <span><span className="src-dot" style={{background:'#10b981'}}/>태그</span>
                    <span><span className="src-dot" style={{background:'#a78bfa'}}/>AI 분석</span>
                    <span><span className="src-dot" style={{background:'#777'}}/>제목 파싱</span>
                  </span>
                </div>
              </>
            )}

            {tab === 'keyword' && (
              <>
                <div>
                  <div className="inp-label">블로그 ID</div>
                  <input className="inp inp-plain" placeholder="myblogid" value={kwBlogId} onChange={e=>setKwBlogId(e.target.value)} />
                </div>
                <div>
                  <div className="inp-label">키워드 <span style={{color:'rgba(244,114,182,.4)',fontWeight:400,textTransform:'none'}}>줄바꿈으로 여러 개</span></div>
                  <textarea className="inp inp-ta" placeholder={'강남 맛집\n부산 카페\n블로그 체험단'} value={kwInput} onChange={e=>setKwInput(e.target.value)} />
                </div>
                <button className="btn-pink" onClick={handleKwCheck} disabled={kwLoading||!kwBlogId||!kwInput}>
                  {kwLoading?'확인 중...':'🔍 순위 확인'}
                </button>
                <div className="tip-box">
                  💡 노리는 키워드를 입력해서 현재 순위를 확인하고 글 전략을 세우세요
                </div>
              </>
            )}
          </div>

          {/* ── MAIN ── */}
          <div className="rc-main">

            {/* ══ 글 순위 탭 ══ */}
            {tab === 'posts' && (
              <>
                {/* 분석 리포트 */}
                {isDone && (() => {
                  const allRows = posts.flatMap(p=>(p.keywords||[]).map(kw=>{
                    const r=rankResults[`${p.logNo}_${kw}`];
                    return {post:p,kw,rank:r?.rank,found:r?.found??false,total:r?.total??0};
                  }));
                  const seo=calcSEOScore(allRows);
                  const top3=allRows.filter(r=>r.found&&r.rank<=3).sort((a,b)=>a.rank-b.rank);
                  const top10=allRows.filter(r=>r.found&&r.rank>3&&r.rank<=10).sort((a,b)=>a.rank-b.rank);
                  const opps=allRows.filter(r=>!r.found&&r.total>0&&r.total<3000&&!titleContains(r.post.title,r.kw));
                  const easy=allRows.filter(r=>!r.found&&r.total>0&&r.total<3000&&titleContains(r.post.title,r.kw));
                  const mid=allRows.filter(r=>!r.found&&r.total>=3000&&r.total<150000);
                  const high=allRows.filter(r=>!r.found&&r.total>=150000);
                  const expRate=allRows.length?Math.round(allRows.filter(r=>r.found).length/allRows.length*100):0;
                  return (
                    <div className="report-card fu">
                      <div className="report-hdr">
                        <div className="report-title">📋 SEO 분석 리포트</div>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:30,fontWeight:900,color:seo.color,lineHeight:1}}>{seo.grade}</div>
                            <div style={{fontSize:9,color:'rgba(244,114,182,.4)',fontWeight:700,marginTop:2}}>SEO 등급</div>
                          </div>
                          <div style={{width:1,height:36,background:'rgba(244,114,182,.15)'}}/>
                          <div>
                            <div style={{fontSize:18,fontWeight:900,color:seo.color}}>{seo.score}<span style={{fontSize:11,color:'rgba(244,114,182,.4)'}}>/100</span></div>
                            <div style={{fontSize:10,color:'rgba(249,168,212,.5)',fontWeight:600}}>{seo.label}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'rgba(244,114,182,.5)',fontWeight:700,marginBottom:5}}>
                          <span>키워드 노출률</span><span style={{color:seo.color}}>{expRate}%</span>
                        </div>
                        <div style={{height:5,background:'rgba(244,114,182,.1)',borderRadius:99,overflow:'hidden'}}>
                          <div style={{width:`${expRate}%`,height:'100%',background:`linear-gradient(90deg,${seo.color},#f472b6)`,borderRadius:99,transition:'width .6s ease'}}/>
                        </div>
                      </div>
                      {top3.length>0&&<div className="report-section">
                        <div className="report-stitle" style={{color:'#fbbf24'}}>🥇 TOP 3 — 지금 잘 되고 있어요</div>
                        <div className="report-body" style={{marginBottom:8}}>이 키워드들은 네이버 검색 3위 안에 노출 중이에요. 글을 최신 상태로 유지하고 내부 링크를 연결해 순위를 지켜나가세요.</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {top3.slice(0,6).map((r,i)=><span key={i} style={{fontSize:11,fontWeight:800,padding:'4px 10px',borderRadius:99,background:'rgba(251,191,36,.1)',color:'#fbbf24',border:'1px solid rgba(251,191,36,.3)'}}>#{r.kw} · {r.rank}위</span>)}
                        </div>
                      </div>}
                      {top10.length>0&&<div className="report-section">
                        <div className="report-stitle" style={{color:'#f472b6'}}>🏆 TOP 4~10위 — 첫 페이지 진입 완료</div>
                        <div className="report-body" style={{marginBottom:8}}>검색 첫 페이지에 노출 중이에요. 글 조회수와 체류 시간을 높이면 3위 안으로 올라갈 수 있어요.</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {top10.slice(0,6).map((r,i)=><span key={i} style={{fontSize:11,fontWeight:800,padding:'4px 10px',borderRadius:99,background:'rgba(244,114,182,.1)',color:'#f472b6',border:'1px solid rgba(244,114,182,.3)'}}>#{r.kw} · {r.rank}위</span>)}
                        </div>
                      </div>}
                      {opps.length>0&&<div className="report-section">
                        <div className="report-stitle" style={{color:'#10b981'}}>🎯 지금 당장 — 제목만 바꿔도 올라가요</div>
                        <div className="report-body" style={{marginBottom:8}}>경쟁자 3,000명 미만인데 글 제목에 키워드가 없어요. 👉 제목 앞에 추가하는 것만으로 상위 노출 가능성이 크게 높아집니다.</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {opps.slice(0,8).map((r,i)=><span key={i} style={{fontSize:11,fontWeight:800,padding:'4px 10px',borderRadius:99,background:'rgba(16,185,129,.1)',color:'#10b981',border:'1px solid rgba(16,185,129,.3)'}}>#{r.kw}</span>)}
                        </div>
                      </div>}
                      {easy.length>0&&<div className="report-section">
                        <div className="report-stitle" style={{color:'#60a5fa'}}>📝 본문 보강 필요 — 제목엔 있는데 미노출</div>
                        <div className="report-body">본문에서 키워드를 <strong>2~3번 자연스럽게</strong> 반복하고 글 길이를 1,500자 이상으로 늘려보세요.</div>
                      </div>}
                      {high.length>0&&<div className="report-section">
                        <div className="report-stitle" style={{color:'#f87171'}}>⚠️ 경쟁 포화 — 롱테일로 교체하세요</div>
                        <div className="report-body">검색 결과 15만 개 이상이에요. "맛집" → "강릉 중앙시장 현지인 맛집"처럼 더 구체적으로 바꾸세요. ({high.length}개)</div>
                      </div>}
                      {top3.length===0&&opps.length===0&&easy.length===0&&<div className="report-body" style={{paddingTop:8}}>⚙️ 설정에서 AI 키를 등록하면 더 정확한 리포트를 볼 수 있어요.</div>}
                    </div>
                  );
                })()}

                {/* 뷰 전환 + 결과 */}
                {posts.length > 0 && (
                  <>
                    <div className="sec-hdr">
                      <div className="view-toggle">
                        <button className={`vbtn${view==='rank'?' on':''}`} onClick={()=>setView('rank')}>🎯 순위별</button>
                        <button className={`vbtn${view==='post'?' on':''}`} onClick={()=>setView('post')}>📄 글별</button>
                      </div>
                      <span style={{fontSize:11,color:'rgba(244,114,182,.4)'}}>{isDone?`✓ 완료 · ${stats.kwTotal}개 키워드`:'분석 중...'}</span>
                    </div>

                    {/* ── 순위별 ── */}
                    {view==='rank' && (() => {
                      const exposed=rankRows.filter(r=>r.found);
                      const hidden=rankRows.filter(r=>!r.found&&r.checked);
                      const checking=rankRows.filter(r=>!r.checked);
                      const hiddenByPost={};
                      hidden.forEach(r=>{if(!hiddenByPost[r.post.logNo])hiddenByPost[r.post.logNo]={post:r.post,kws:[]};hiddenByPost[r.post.logNo].kws.push(r.kw);});
                      return (
                        <div className="rank-list">
                          {checking.map(({post,kw},i)=>(
                            <div key={`ck_${post.logNo}_${kw}`} className="rank-row fu">
                              <div className="rnum-wrap"><div className="rnum pulse" style={{color:'rgba(244,114,182,.3)',fontSize:18}}>···</div><div className="rnum-sub">확인중</div></div>
                              <div className="rdiv"/>
                              <div className="rinfo"><div className="rkw"><span style={{color:'rgba(244,114,182,.3)'}}>#</span><span className="rkw-text">{kw}</span></div><span className="rpost">{post.title}</span></div>
                            </div>
                          ))}
                          {exposed.map(({post,kw,rank},i)=>{
                            const rs=getRankStyle(rank);
                            const r=rankResults[`${post.logNo}_${kw}`];
                            const comp=r?getCompetition(r.total):null;
                            const src=getSourceBadge(post.keywordSource);
                            return (
                              <div key={`ex_${post.logNo}_${kw}`} className="rank-row fu" style={{animationDelay:`${i*.03}s`}}>
                                <div className="rnum-wrap"><div className="rnum" style={{color:rs.color}}>{rank}</div><div className="rnum-sub">번째 노출</div></div>
                                <div className="rdiv"/>
                                <div className="rinfo">
                                  <div className="rkw">
                                    <span style={{color:rs.color}}>#</span>
                                    <span className="rkw-text">{kw}</span>
                                    {src&&<span className="src-badge" style={{color:src.color,borderColor:src.color+'40',background:src.color+'12'}}>{src.label}</span>}
                                    {comp&&<span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>{comp.short}</span>}
                                  </div>
                                  <a href={post.link} target="_blank" rel="noreferrer" className="rpost">{post.title}</a>
                                </div>
                                <span className="rbadge" style={{color:rs.color,borderColor:rs.color+'50',background:rs.bg}}>{rs.label}</span>
                              </div>
                            );
                          })}
                          {Object.values(hiddenByPost).map(({post,kws},i)=>{
                            const src=getSourceBadge(post.keywordSource);
                            return (
                              <div key={`hd_${post.logNo}`} className="rank-row fu" style={{opacity:.65,animationDelay:`${(exposed.length+i)*.03}s`}}>
                                <div className="rnum-wrap"><div className="rnum" style={{color:'rgba(139,111,139,.6)',fontSize:22}}>—</div><div className="rnum-sub">미노출</div></div>
                                <div className="rdiv"/>
                                <div className="rinfo">
                                  <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:4}}>
                                    {kws.map(kw=><span key={kw} style={{fontSize:11,fontWeight:700,color:'rgba(244,114,182,.4)',background:'rgba(244,114,182,.05)',border:'1px solid rgba(244,114,182,.12)',borderRadius:99,padding:'2px 8px'}}>#{kw}</span>)}
                                    {src&&<span className="src-badge" style={{color:src.color,borderColor:src.color+'40',background:src.color+'12'}}>{src.label}</span>}
                                  </div>
                                  <a href={post.link} target="_blank" rel="noreferrer" className="rpost">{post.title}</a>
                                </div>
                                <span className="rbadge rbadge-hidden">미노출</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* ── 글별 ── */}
                    {view==='post' && (
                      <div className="post-list">
                        {posts.map((post,pi)=>{
                          const postRanks=(post.keywords||[]).map(kw=>rankResults[`${post.logNo}_${kw}`]);
                          const bestRank=postRanks.filter(r=>r?.found).map(r=>r.rank).sort((a,b)=>a-b)[0];
                          const bestRs=getRankStyle(bestRank||null);
                          const src=getSourceBadge(post.keywordSource);
                          return (
                            <div key={post.logNo} className="post-card fu" style={{animationDelay:`${pi*.03}s`}}>
                              <div className="post-head">
                                <span className="post-num">{pi+1}</span>
                                <div className="post-meta">
                                  <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:2}}>
                                    <a href={post.link} target="_blank" rel="noreferrer" className="post-title">{post.title}</a>
                                    {src&&<span className="src-badge" style={{color:src.color,borderColor:src.color+'40',background:src.color+'12'}}>{src.label}</span>}
                                  </div>
                                  <div className="post-date">{fmtDate(post.pubDate)}</div>
                                </div>
                                {bestRank&&<span className="post-best" style={{color:bestRs.color,background:bestRs.bg}}>최고 {bestRank}위</span>}
                              </div>
                              <div className="kw-chips">
                                {(post.keywords||[]).map(kw=>{
                                  const r=rankResults[`${post.logNo}_${kw}`];
                                  const rs=r?getRankStyle(r.found?r.rank:null):null;
                                  const checking=isRunning&&!r;
                                  const comp=r?getCompetition(r.total):null;
                                  const inTitle=titleContains(post.title,kw);
                                  const insight=(r&&!checking)?getInsight(r.found,r.rank,r.total,inTitle):null;
                                  const iStyle=insight?getInsightStyle(insight.type):null;
                                  const isOpp=insight?.type==='opportunity';
                                  return (
                                    <div key={kw} style={{width:'100%'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                                        <span className={`kw-chip${checking?' pulse':''}${isOpp?' opp-glow':''}`} style={{color:rs?rs.color:'rgba(244,114,182,.4)',borderColor:rs?rs.color+'50':'rgba(244,114,182,.15)',background:rs?rs.bg:'rgba(244,114,182,.05)'}}>
                                          <span>#{kw}</span>
                                          {rs&&<span style={{fontSize:10,fontWeight:900}}>{r.found?`${r.rank}위`:'미노출'}</span>}
                                          {checking&&<span style={{fontSize:10}}>···</span>}
                                        </span>
                                        {comp&&!checking&&<span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>{comp.short}</span>}
                                      </div>
                                      {insight&&iStyle&&<div className="insight-box" style={{color:iStyle.color,background:iStyle.bg,borderColor:iStyle.border}}>{insight.msg}</div>}
                                    </div>
                                  );
                                })}
                                {!post.keywords?.length&&<span style={{fontSize:11,color:'rgba(244,114,182,.3)'}}>키워드 없음</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {!posts.length && !isRunning && (
                  <div style={{textAlign:'center',padding:'60px 20px',color:'rgba(244,114,182,.3)'}}>
                    <div style={{fontSize:48,marginBottom:12}}>🌸</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>블로그 ID를 입력하고 분석을 시작하세요</div>
                    <div style={{fontSize:12}}>키워드 순위 · SEO 등급 · 개선 리포트</div>
                  </div>
                )}
              </>
            )}

            {/* ══ 키워드 랭커 탭 ══ */}
            {tab === 'keyword' && (
              <>
                {kwResults.length > 0 && (
                  <div className="kw-res-list fu">
                    <div className="kw-res-hdr">
                      <span>키워드 순위 결과 · {kwResults.length}개</span>
                      {kwLoading&&<span className="pulse" style={{color:'#f472b6'}}>분석 중...</span>}
                    </div>
                    {kwResults.map((r,i)=>{
                      const rs=getRankStyle(r.found?r.rank:null);
                      const comp=getCompetition(r.total);
                      const insight=getInsight(r.found,r.rank,r.total,false);
                      const iStyle=insight?getInsightStyle(insight.type):null;
                      return (
                        <div key={i} className="kw-res-row fu" style={{animationDelay:`${i*.05}s`}}>
                          <div className="kw-res-top">
                            <div className="kw-res-left">
                              <span className="kw-res-idx">{i+1}</span>
                              <div>
                                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                                  <div className="kw-res-name">{r.keyword}</div>
                                  {comp&&<span className="comp-badge" style={{color:comp.color,borderColor:comp.color+'40',background:comp.bg}}>{comp.label}</span>}
                                  {r.total>0&&<span style={{fontSize:10,color:'rgba(244,114,182,.35)'}}>{r.total.toLocaleString()}개</span>}
                                </div>
                                <div className="kw-res-lbl" style={{color:rs.color}}>
                                  {r.found?`네이버 검색 결과 ${r.rank}번째 노출`:'이 키워드로 검색 시 내 글이 보이지 않음 (100위 밖)'}
                                </div>
                              </div>
                            </div>
                            <div className="kw-res-rank" style={{color:r.found?rs.color:'rgba(139,111,139,.5)'}}>{r.found?`${r.rank}위`:'—'}</div>
                          </div>
                          {insight&&iStyle&&<div style={{fontSize:11,fontWeight:600,padding:'7px 10px',borderRadius:8,border:`1px solid ${iStyle.border}`,background:iStyle.bg,color:iStyle.color}}>{insight.msg}</div>}
                        </div>
                      );
                    })}
                    {!kwLoading&&(
                      <div className="kw-stats">
                        <span>🥇 TOP3 {kwResults.filter(r=>r.found&&r.rank<=3).length}개</span>
                        <span>🏆 TOP10 {kwResults.filter(r=>r.found&&r.rank<=10).length}개</span>
                        <span>✅ 노출 {kwResults.filter(r=>r.found).length}개</span>
                        <span>❌ 미노출 {kwResults.filter(r=>!r.found).length}개</span>
                      </div>
                    )}
                  </div>
                )}
                {!kwResults.length&&!kwLoading&&(
                  <div style={{textAlign:'center',padding:'60px 20px',color:'rgba(244,114,182,.3)'}}>
                    <div style={{fontSize:48,marginBottom:12}}>🔍</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>블로그 ID와 키워드를 입력하세요</div>
                    <div style={{fontSize:12}}>네이버 검색에서 몇 번째에 노출되는지 확인</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── 설정 드로어 ─── */}
      {showSettings && (() => {
        const activeAI = getActiveAI();
        const AI_LIST = [
          {key:'groq',label:'Groq (Llama 3)',emoji:'⚡',pc:'free',pl:'무료',ph:'gsk_xxxxxxxxxxxxxxxx',url:'https://console.groq.com/keys',desc:'Meta Llama 3 기반 · 가장 빠름 · 완전 무료'},
          {key:'gemini',label:'Google Gemini',emoji:'✨',pc:'partial',pl:'일부 무료 / 유료',ph:'AIzaSyxxxxxxxxxxxxxxx',url:'https://aistudio.google.com/app/apikey',desc:'Gemini 2.0 Flash · 1,500회/일 무료'},
          {key:'openai',label:'OpenAI GPT',emoji:'🤖',pc:'paid',pl:'유료',ph:'sk-xxxxxxxxxxxxxxxx',url:'https://platform.openai.com/api-keys',desc:'GPT-4o Mini · 고품질 · 사용량 과금'},
        ];
        return (
          <>
            <div className="overlay" onClick={()=>setShowSettings(false)}/>
            <div className="drawer">
              <div className="drawer-handle"/>
              <div className="drawer-head">
                <div className="drawer-title">🤖 AI 키워드 분석 설정</div>
                <button className="drawer-close" onClick={()=>setShowSettings(false)}>✕</button>
              </div>
              <div className="drawer-body">
                <div className="dev-warn">⚠️ <strong>기기별 저장 안내</strong><br/>API 키는 현재 기기 브라우저에만 저장됩니다.<br/><strong>PC ↔ 모바일 ↔ 태블릿 변경 시</strong> 각 기기에서 다시 입력해야 합니다.</div>
                {activeAI
                  ? <div className="ai-ok-info">✅ 사용 중: <strong>{AI_LIST.find(a=>a.key===activeAI.provider)?.label}</strong></div>
                  : <div className="ai-no-info">❌ AI 미설정 — 제목 파싱으로만 키워드 추출됩니다</div>
                }
                {AI_LIST.map(ai=>{
                  const isSel=selectedAI===ai.key;
                  const hasKey=!!aiKeys[ai.key].trim();
                  return (
                    <div key={ai.key} className={`ai-card${isSel?' sel':''}`}>
                      <div className="ai-card-top">
                        <div className="ai-name"><span>{ai.emoji}</span><span>{ai.label}</span>{isSel&&<span className="badge-sel">사용 중</span>}</div>
                        <span className={`badge-${ai.pc}`}>{ai.pl}</span>
                      </div>
                      <div style={{fontSize:10,color:'rgba(244,114,182,.4)',marginBottom:10}}>{ai.desc}</div>
                      <div className="ai-inp-col">
                        <div className="ai-inp-row">
                          <input className="ai-inp" type="password" placeholder={ai.ph} value={aiKeys[ai.key]} onChange={e=>updateAiKey(ai.key,e.target.value)}/>
                          <button className="issue-btn" onClick={()=>window.open(ai.url,'_blank')}>🔑 발급받기</button>
                        </div>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                          <span style={{fontSize:10,color:hasKey?'#10b981':'rgba(244,114,182,.35)',fontWeight:600}}>{hasKey?'✓ 키 저장됨':'키 미입력'}</span>
                          <button className={`use-btn${isSel?' sel':''}`} style={{width:'auto',padding:'0 16px'}} onClick={()=>updateSelectedAI(isSel?'':ai.key)}>
                            {isSel?'✓ 사용 중':'이 AI 사용'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{fontSize:10,color:'rgba(244,114,182,.35)',textAlign:'center',lineHeight:1.8}}>AI 미설정 시 해시태그 또는 제목 파싱으로 키워드 추출</div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ─── 가이드 버튼 ─── */}
      <button className="float-btn" onClick={()=>setShowGuide(g=>!g)}>
        <span>📖</span><span>용어 설명</span>
      </button>

      {/* ─── 가이드 모달 ─── */}
      {showGuide && (
        <>
          <div className="overlay" onClick={()=>setShowGuide(false)}/>
          <div className="guide-modal fu">
            <div className="modal-handle"/>
            <div className="modal-head">
              <div className="modal-title">📖 용어 & 지표 설명서</div>
              <button className="modal-close" onClick={()=>setShowGuide(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="guide-sec">
                <div className="guide-sec-title">🎯 순위란?</div>
                <div className="guide-p">네이버 검색창에 키워드를 입력했을 때 내 블로그 글이 몇 번째에 나타나는지예요. 1위가 가장 위, 100위 밖이면 미노출입니다.</div>
                <div className="guide-rows">
                  {[{color:'#fbbf24',bg:'rgba(251,191,36,.12)',label:'1위 🥇',desc:'검색 최상단 · 클릭율 최고'},{color:'#f472b6',bg:'rgba(244,114,182,.12)',label:'2~3위',desc:'상위권 · 충분히 좋음'},{color:'#c026d3',bg:'rgba(192,38,211,.12)',label:'4~10위',desc:'첫 페이지 · 노출 양호'},{color:'rgba(139,111,139,.7)',bg:'rgba(139,111,139,.1)',label:'미노출',desc:'이 키워드로 검색 시 내 글이 보이지 않음 (100위 밖)'}].map(r=>(
                    <div key={r.label} className="guide-row">
                      <span style={{fontSize:11,fontWeight:800,padding:'4px 10px',borderRadius:99,color:r.color,background:r.bg,flexShrink:0,minWidth:64,textAlign:'center'}}>{r.label}</span>
                      <span style={{fontSize:11,color:'rgba(249,168,212,.6)'}}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="guide-sec">
                <div className="guide-sec-title">⚔️ 경쟁도란?</div>
                <div className="guide-p">해당 키워드로 네이버에 등록된 블로그 글이 몇 개인지예요. 적을수록 상위 노출이 쉽습니다.</div>
                <div className="guide-rows">
                  {[{color:'#10b981',bg:'rgba(16,185,129,.1)',label:'낮음',desc:'3,000개 미만 · 지금 바로 도전!'},{color:'#f59e0b',bg:'rgba(245,158,11,.1)',label:'보통',desc:'3천~3만개 · 글 품질로 승부'},{color:'#f97316',bg:'rgba(249,115,22,.1)',label:'높음',desc:'3만~15만개 · 전략 필요'},{color:'#ef4444',bg:'rgba(239,68,68,.1)',label:'매우 높음',desc:'15만개 이상 · 롱테일로 교체'}].map(r=>(
                    <div key={r.label} className="guide-row">
                      <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:99,color:r.color,background:r.bg,flexShrink:0,minWidth:64,textAlign:'center'}}>{r.label}</span>
                      <span style={{fontSize:11,color:'rgba(249,168,212,.6)'}}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="guide-sec">
                <div className="guide-sec-title">🏷️ 키워드 출처란?</div>
                <div className="guide-p">키워드를 어떻게 찾았는지 표시해요.</div>
                <div className="guide-rows">
                  {[{color:'#10b981',label:'태그',desc:'글에 직접 등록한 해시태그 · 가장 정확'},{color:'#a78bfa',label:'AI',desc:'AI가 제목/내용 분석해 추출 · ⚙️ 설정 필요'},{color:'#777',label:'제목',desc:'글 제목 단어 조합 파싱 · 정확도 보통'}].map(r=>(
                    <div key={r.label} className="guide-row">
                      <span style={{fontSize:11,fontWeight:800,padding:'3px 9px',borderRadius:99,color:r.color,background:`${r.color}18`,flexShrink:0,minWidth:46,textAlign:'center'}}>{r.label}</span>
                      <span style={{fontSize:11,color:'rgba(249,168,212,.6)'}}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="guide-sec" style={{borderBottom:'none'}}>
                <div className="guide-sec-title">💡 인사이트 메시지란?</div>
                <div className="guide-p">각 키워드 상황에 맞는 자동 조언이에요.</div>
                {[{color:'#10b981',border:'rgba(16,185,129,.3)',bg:'rgba(16,185,129,.08)',label:'🎯 기회!',desc:'경쟁 적고 제목에 키워드 없음 → 제목에 추가하면 상위 가능'},{color:'#60a5fa',border:'rgba(96,165,250,.3)',bg:'rgba(96,165,250,.08)',label:'📝 보강 필요',desc:'제목엔 있는데 미노출 → 본문에 2~3회 추가 + 글 길이 늘리기'},{color:'#ef4444',border:'rgba(239,68,68,.25)',bg:'rgba(239,68,68,.07)',label:'⚠️ 교체 권장',desc:'경쟁 포화 → 더 구체적인 롱테일로 바꾸세요'}].map(r=>(
                  <div key={r.label} style={{padding:'9px 12px',borderRadius:9,border:`1px solid ${r.border}`,background:r.bg,marginBottom:7}}>
                    <div style={{fontSize:12,fontWeight:800,color:r.color,marginBottom:2}}>{r.label}</div>
                    <div style={{fontSize:11,color:'rgba(249,168,212,.55)'}}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

