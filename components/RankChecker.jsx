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
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    :root { ${Object.entries(vars).map(([k,v])=>`${k}:${v}`).join(';')} }
    html,body { background:var(--bg); -webkit-font-smoothing:antialiased; }
    ::-webkit-scrollbar { width:4px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:var(--border2); border-radius:99px; }

    .rc-wrap { font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif; min-height:100vh; background:var(--bg); color:var(--text); transition:background .35s,color .35s; overflow-x:hidden; }

    /* ─ BG 파티클 ─ */
    .rc-bg { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
    .rc-bg-orb { position:absolute; border-radius:50%; filter:blur(80px); }
    .rc-bg-orb1 { width:700px; height:700px; background:radial-gradient(circle,rgba(244,114,182,.22),transparent 70%); top:-250px; right:-200px; animation:orbMove1 18s ease-in-out infinite; }
    .rc-bg-orb2 { width:550px; height:550px; background:radial-gradient(circle,rgba(192,38,211,.18),transparent 70%); bottom:-200px; left:-150px; animation:orbMove2 22s ease-in-out infinite; }
    .rc-bg-orb3 { width:400px; height:400px; background:radial-gradient(circle,rgba(236,72,153,.12),transparent 70%); top:35%; left:35%; animation:orbMove3 15s ease-in-out infinite; }
    @keyframes orbMove1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-70px,90px)} }
    @keyframes orbMove2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(90px,-70px)} }
    @keyframes orbMove3 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(50px,-50px)} 66%{transform:translate(-40px,60px)} }

    .rc-inner { position:relative; z-index:1; max-width:860px; margin:0 auto; }

    /* ─ HEADER ─ */
    .rc-header { background:var(--header-bg); border-bottom:1px solid var(--border2); padding:16px 20px 0; position:sticky; top:0; z-index:100; backdrop-filter:blur(24px) saturate(180%); -webkit-backdrop-filter:blur(24px) saturate(180%); box-shadow:0 1px 0 var(--accent-bg),0 4px 24px rgba(236,72,153,.08); }
    .rc-header-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:8px; }
    .rc-logo { display:flex; align-items:center; gap:10px; min-width:0; }
    .rc-logo-icon { width:38px; height:38px; border-radius:12px; background:linear-gradient(135deg,var(--accent),var(--accent3)); display:flex; align-items:center; justify-content:center; font-size:19px; box-shadow:0 4px 20px var(--accent-glow),inset 0 1px 0 rgba(255,255,255,.2); flex-shrink:0; }
    .rc-logo-text { font-size:18px; font-weight:900; letter-spacing:-.5px; background:linear-gradient(135deg,var(--accent),var(--accent3)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; white-space:nowrap; }
    .rc-logo-sub { font-size:10px; color:var(--text-muted); font-weight:600; margin-top:1px; letter-spacing:.3px; white-space:nowrap; }
    .rc-header-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .hdr-btn { height:34px; border-radius:9px; border:1px solid var(--glass-border); background:var(--glass); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; transition:all .2s; color:var(--text); padding:0 10px; font-family:inherit; font-weight:600; white-space:nowrap; gap:5px; }
    .hdr-btn:hover { background:var(--accent-bg); border-color:var(--accent); color:var(--accent); }
    .hdr-btn-icon { width:34px; padding:0; }
    .hdr-btn-pdf { background:linear-gradient(135deg,var(--accent-bg),rgba(168,85,247,.12)); border-color:var(--accent); color:var(--accent); font-size:11px; }
    .hdr-btn-csv { font-size:11px; }

    /* ─ TABS ─ */
    .rc-tabs { display:flex; padding:0; }
    .rc-tab { padding:11px 18px; font-size:13px; font-weight:700; color:var(--text-muted); border:none; background:none; cursor:pointer; font-family:inherit; border-bottom:3px solid transparent; transition:all .2s; white-space:nowrap; letter-spacing:-.1px; }
    .rc-tab.active { color:var(--accent); border-bottom-color:var(--accent); text-shadow:0 0 20px var(--accent-glow); }
    .rc-tab:hover:not(.active) { color:var(--accent2); background:var(--accent-bg); border-radius:8px 8px 0 0; }

    /* ─ CONTENT ─ */
    .rc-content { padding:18px 20px 100px; }

    /* ─ CARDS ─ */
    .card { background:var(--glass); border:1px solid var(--glass-border); border-radius:18px; backdrop-filter:blur(12px); }
    .input-card { padding:20px; margin-bottom:14px; box-shadow:var(--shadow-sm); }
    .input-label { font-size:10px; color:var(--text-muted); font-weight:800; letter-spacing:.8px; text-transform:uppercase; margin-bottom:8px; }
    .input-row { display:flex; gap:10px; }
    .inp-wrap { flex:1; position:relative; min-width:0; }
    .inp-prefix { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:11px; color:var(--text-muted); pointer-events:none; white-space:nowrap; }
    .inp { width:100%; height:50px; padding-right:14px; background:var(--inp-bg); border:1.5px solid var(--border); border-radius:13px; color:var(--text); font-family:inherit; font-size:14px; font-weight:700; outline:none; transition:all .25s; }
    .inp:focus { border-color:var(--accent); box-shadow:0 0 0 4px var(--accent-bg); background:var(--surface2); }
    .inp::placeholder { color:var(--text-muted); font-weight:400; }
    .inp-pl { padding-left:132px; }
    .inp-sm { height:44px; padding-left:14px; }
    .inp-ta { height:100px; padding:12px 14px; resize:none; line-height:1.7; }

    /* ─ BUTTONS ─ */
    .btn-primary { height:50px; padding:0 28px; background:linear-gradient(135deg,var(--accent),var(--accent3)); border:none; border-radius:13px; color:#fff; font-family:inherit; font-size:14px; font-weight:800; cursor:pointer; transition:all .25s; white-space:nowrap; box-shadow:0 4px 20px var(--accent-glow); letter-spacing:-.2px; }
    .btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 28px var(--accent-glow); filter:brightness(1.1); }
    .btn-primary:active { transform:translateY(0); }
    .btn-primary:disabled { opacity:.3; cursor:not-allowed; transform:none; box-shadow:none; filter:none; }
    .btn-ghost { height:34px; padding:0 14px; background:var(--glass); border:1px solid var(--glass-border); border-radius:9px; color:var(--text-sub); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; transition:all .2s; }
    .btn-ghost:hover { border-color:var(--accent); color:var(--accent); background:var(--accent-bg); }

    /* ─ ERROR ─ */
    .err-box { margin-top:12px; padding:12px 16px; background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.2); border-radius:11px; font-size:13px; color:#f87171; line-height:1.6; }

    /* ─ PROGRESS ─ */
    .progress-card { padding:18px 20px; margin-bottom:14px; box-shadow:var(--shadow-sm); }
    .progress-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; }
    .progress-label { font-size:13px; color:var(--text-sub); font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .progress-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .progress-pct { font-size:16px; font-weight:900; background:linear-gradient(135deg,var(--accent),var(--accent3)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .progress-bar { height:5px; background:var(--surface2); border-radius:99px; overflow:hidden; }
    .progress-fill { height:100%; background:linear-gradient(90deg,var(--accent),var(--accent3),var(--gold)); border-radius:99px; transition:width .5s cubic-bezier(.4,0,.2,1); }
    .stop-btn { padding:5px 12px; border:1px solid rgba(239,68,68,.3); background:rgba(239,68,68,.08); border-radius:8px; color:#f87171; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; }
    .stop-btn:hover { background:rgba(239,68,68,.15); }

    /* ─ STATS ─ */
    .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
    .stat-card { padding:16px 10px; text-align:center; box-shadow:var(--shadow-sm); transition:all .25s; cursor:default; position:relative; overflow:hidden; }
    .stat-card::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg,var(--accent-bg),transparent); opacity:0; transition:opacity .2s; }
    .stat-card:hover { border-color:var(--accent2); transform:translateY(-2px); box-shadow:0 8px 24px var(--accent-glow); }
    .stat-card:hover::before { opacity:1; }
    .stat-icon { font-size:22px; margin-bottom:6px; line-height:1; }
    .stat-val { font-size:28px; font-weight:900; line-height:1; margin-bottom:3px; letter-spacing:-1px; }
    .stat-label { font-size:10px; color:var(--text-muted); font-weight:700; letter-spacing:.5px; }

    /* ─ VIEW TOGGLE ─ */
    .results-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; }
    .view-toggle { display:flex; gap:3px; background:var(--surface2); border-radius:11px; padding:3px; border:1px solid var(--border); }
    .view-btn { flex:1; padding:7px 14px; border-radius:8px; border:none; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; }
    .view-btn.active { background:linear-gradient(135deg,var(--accent),var(--accent3)); color:#fff; box-shadow:0 2px 14px var(--accent-glow); }
    .view-btn:not(.active) { background:none; color:var(--text-muted); }

    /* ─ RANK ROWS ─ */
    .rank-table { display:flex; flex-direction:column; gap:7px; }
    .rank-row { display:flex; align-items:center; gap:12px; background:var(--glass); border:1px solid var(--glass-border); border-radius:15px; padding:14px 16px; transition:all .25s; }
    .rank-row:hover { border-color:var(--accent2); box-shadow:0 4px 24px var(--accent-glow),inset 0 0 0 1px rgba(244,114,182,.1); transform:translateY(-1px); }
    .rank-num-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:50px; flex-shrink:0; }
    .rank-num { font-size:28px; font-weight:900; line-height:1; letter-spacing:-1.5px; }
    .rank-num-label { font-size:9px; font-weight:700; letter-spacing:.4px; color:var(--text-muted); margin-top:2px; white-space:nowrap; }
    .rank-divider { width:1px; height:42px; background:var(--border); flex-shrink:0; }
    .rank-info { flex:1; min-width:0; }
    .rank-kw { font-size:14px; font-weight:800; margin-bottom:4px; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
    .rank-kw-text { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
    .rank-post { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-decoration:none; display:block; }
    .rank-post:hover { color:var(--accent); }
    .rank-badge { font-size:12px; font-weight:800; padding:5px 13px; border-radius:99px; flex-shrink:0; border:1.5px solid; white-space:nowrap; }
    .rank-badge.hidden { background:var(--rank-none-bg); color:var(--rank-none); border-color:transparent; }

    /* ─ POST CARDS ─ */
    .post-list { display:flex; flex-direction:column; gap:8px; }
    .post-card { background:var(--glass); border:1px solid var(--glass-border); border-radius:15px; padding:16px 18px; transition:all .25s; }
    .post-card:hover { border-color:var(--border2); box-shadow:var(--shadow-sm); }
    .post-head { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
    .post-num { font-size:11px; color:var(--text-muted); font-weight:700; min-width:20px; padding-top:2px; text-align:right; flex-shrink:0; }
    .post-meta { flex:1; min-width:0; }
    .post-title { font-size:14px; font-weight:700; color:var(--text); text-decoration:none; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; }
    .post-title:hover { color:var(--accent); }
    .post-date { font-size:11px; color:var(--text-muted); }
    .post-best { font-size:12px; font-weight:800; padding:4px 12px; border-radius:99px; flex-shrink:0; white-space:nowrap; }
    .kw-chips { display:flex; flex-wrap:wrap; gap:6px; padding-left:30px; }
    .kw-chip { font-size:12px; font-weight:700; padding:6px 12px; border-radius:99px; border:1.5px solid; transition:all .2s; display:flex; align-items:center; gap:5px; }
    .kw-chip-rank { font-size:11px; font-weight:900; }

    /* ─ BADGES ─ */
    .src-badge { font-size:9px; font-weight:700; padding:2px 7px; border-radius:99px; border:1px solid; flex-shrink:0; }
    .comp-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; border:1px solid; flex-shrink:0; }
    .title-match-yes { font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; background:rgba(16,185,129,.12); color:#10b981; border:1px solid rgba(16,185,129,.3); }
    .title-match-no { font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; background:rgba(239,68,68,.08); color:#f87171; border:1px solid rgba(239,68,68,.2); }
    .opportunity-row { box-shadow:0 0 0 2px rgba(16,185,129,.4) !important; }

    /* ─ REPORT ─ */
    .report-card { background:var(--glass); border:1px solid var(--glass-border); border-radius:18px; padding:20px; margin-bottom:14px; box-shadow:var(--shadow-sm); }
    .report-title { font-size:15px; font-weight:800; color:var(--text); margin-bottom:18px; display:flex; align-items:center; gap:8px; }
    .report-section { padding:14px 0; border-top:1px solid var(--border); }
    .report-section:first-of-type { border-top:none; padding-top:0; }
    .report-section-title { font-size:13px; font-weight:800; margin-bottom:7px; }
    .report-section-body { font-size:12px; color:var(--text-sub); line-height:1.85; }

    /* ─ KW RANKER ─ */
    .kw-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .kw-result-list { background:var(--glass); border:1px solid var(--glass-border); border-radius:16px; overflow:hidden; box-shadow:var(--shadow-sm); }
    .kw-result-header { padding:13px 18px; border-bottom:1px solid var(--border); font-size:11px; font-weight:700; color:var(--text-muted); letter-spacing:.5px; display:flex; justify-content:space-between; }
    .kw-result-row { display:flex; align-items:flex-start; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); transition:background .15s; flex-direction:column; gap:8px; }
    .kw-result-row:last-child { border-bottom:none; }
    .kw-result-row:hover { background:var(--surface2); }
    .kw-result-top { display:flex; align-items:center; justify-content:space-between; width:100%; }
    .kw-result-left { display:flex; align-items:center; gap:10px; min-width:0; }
    .kw-result-idx { font-size:11px; color:var(--text-muted); font-weight:700; min-width:18px; flex-shrink:0; }
    .kw-result-rank { font-size:22px; font-weight:900; min-width:56px; text-align:center; flex-shrink:0; }
    .kw-result-name { font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .kw-result-label { font-size:11px; color:var(--text-muted); margin-top:2px; }
    .kw-stats { padding:12px 18px; display:flex; gap:14px; font-size:11px; color:var(--text-muted); border-top:1px solid var(--border); background:var(--surface2); flex-wrap:wrap; }

    /* ─ TIP BOX ─ */
    .tip-box { margin-top:14px; padding:14px 16px; background:var(--accent-bg); border:1px solid var(--glass-border); border-radius:13px; font-size:12px; color:var(--text-sub); line-height:1.85; }
    .src-dot { width:6px; height:6px; border-radius:50%; display:inline-block; margin-right:5px; }

    /* ─ ANIMATIONS ─ */
    @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-9px) scale(1.04)} }
    @keyframes glowPulse { 0%,100%{box-shadow:0 4px 24px var(--accent-glow)} 50%{box-shadow:0 8px 40px var(--accent-glow),0 0 0 8px rgba(244,114,182,.05)} }
    .fade-up { animation:fadeUp .3s ease forwards; }
    .pulse { animation:pulse 1.5s infinite; }

    /* ─ FLOATING GUIDE BUTTON ─ */
    .guide-float-btn { position:fixed; bottom:24px; right:20px; z-index:150; display:flex; align-items:center; gap:8px; padding:13px 20px; border-radius:99px; border:none; background:linear-gradient(135deg,var(--accent),var(--accent3)); color:#fff; font-family:inherit; font-size:13px; font-weight:800; cursor:pointer; animation:float 3s ease-in-out infinite,glowPulse 3s ease-in-out infinite; box-shadow:0 4px 24px var(--accent-glow); letter-spacing:-.1px; }
    .guide-float-btn:hover { animation:none; transform:scale(1.07); box-shadow:0 8px 36px var(--accent-glow); }

    /* ─ GUIDE MODAL ─ */
    .guide-modal { position:fixed; bottom:0; left:0; right:0; max-height:88vh; background:var(--bg2); z-index:201; border-radius:24px 24px 0 0; box-shadow:0 -8px 60px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; }
    .guide-modal-handle { width:40px; height:4px; border-radius:99px; background:var(--border2); margin:12px auto 0; flex-shrink:0; }
    .guide-section { padding:15px 0; border-bottom:1px solid var(--border); }
    .guide-section:last-child { border-bottom:none; }
    .guide-section-title { font-size:14px; font-weight:800; color:var(--text); margin-bottom:8px; }
    .guide-p { font-size:12px; color:var(--text-sub); line-height:1.8; margin-bottom:10px; }
    .guide-examples { display:flex; flex-direction:column; gap:7px; }
    .guide-example-row { display:flex; align-items:center; gap:10px; }

    /* ─ SETTINGS DRAWER ─ */
    .settings-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:200; backdrop-filter:blur(6px); }
    /* 모바일: 하단 시트 */
    .settings-drawer { position:fixed; bottom:0; left:0; right:0; max-height:92vh; background:var(--bg2); z-index:201; border-radius:24px 24px 0 0; box-shadow:0 -8px 60px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; animation:slideUp .3s cubic-bezier(.4,0,.2,1); }
    @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
    .drawer-handle { width:40px; height:4px; border-radius:99px; background:var(--border2); margin:12px auto 0; flex-shrink:0; }
    .settings-head { padding:16px 20px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
    .settings-title { font-size:15px; font-weight:800; color:var(--text); }
    .settings-close { width:34px; height:34px; border-radius:10px; border:1px solid var(--border2); background:var(--surface2); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--text); flex-shrink:0; }
    .settings-body { padding:16px 20px; flex:1; display:flex; flex-direction:column; gap:12px; overflow-y:auto; padding-bottom:40px; }
    .ai-card { background:var(--surface); border:1.5px solid var(--border); border-radius:14px; padding:14px; transition:all .2s; }
    .ai-card.active-card { border-color:var(--accent); background:var(--accent-bg); }
    .ai-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:6px; }
    .ai-name { font-size:13px; font-weight:800; color:var(--text); display:flex; align-items:center; gap:6px; min-width:0; }
    .ai-price-free { font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; background:rgba(16,185,129,.15); color:#10b981; border:1px solid rgba(16,185,129,.3); white-space:nowrap; flex-shrink:0; }
    .ai-price-partial { font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; background:rgba(245,158,11,.15); color:#f59e0b; border:1px solid rgba(245,158,11,.3); white-space:nowrap; flex-shrink:0; }
    .ai-price-paid { font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; background:rgba(239,68,68,.1); color:#f87171; border:1px solid rgba(239,68,68,.2); white-space:nowrap; flex-shrink:0; }
    .ai-active-badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:99px; background:var(--accent-bg); color:var(--accent); border:1px solid var(--accent); white-space:nowrap; flex-shrink:0; }
    .ai-inp-col { display:flex; flex-direction:column; gap:7px; }
    .ai-inp-row { display:flex; gap:7px; }
    .ai-inp { flex:1; height:42px; padding:0 12px; background:var(--inp-bg); border:1.5px solid var(--border); border-radius:10px; color:var(--text); font-size:13px; font-family:inherit; outline:none; transition:all .2s; min-width:0; }
    .ai-inp:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-bg); }
    .ai-inp::placeholder { color:var(--text-muted); font-size:11px; }
    .issue-btn { height:42px; padding:0 13px; border:1.5px solid var(--border2); border-radius:10px; background:var(--surface2); color:var(--text-sub); font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; font-family:inherit; transition:all .2s; flex-shrink:0; }
    .issue-btn:hover { border-color:var(--accent); color:var(--accent); }
    .use-ai-btn { width:100%; height:36px; border-radius:9px; border:1.5px solid var(--border2); background:var(--surface2); color:var(--text-sub); font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; margin-top:4px; }
    .use-ai-btn.selected { background:linear-gradient(135deg,var(--accent),var(--accent3)); border-color:var(--accent); color:#fff; box-shadow:0 2px 12px var(--accent-glow); }
    .device-warn { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.25); border-radius:12px; padding:12px 14px; font-size:11.5px; color:#f59e0b; line-height:1.8; }
    .active-ai-info { background:var(--accent-bg); border:1px solid var(--accent); border-radius:10px; padding:10px 14px; font-size:12px; color:var(--accent); font-weight:600; }

    /* 데스크탑: 우측 드로어 */
    @media(min-width:641px) {
      .settings-drawer { bottom:auto; top:0; left:auto; right:0; height:100%; max-height:100%; max-width:440px; border-radius:0; box-shadow:-8px 0 60px rgba(0,0,0,.4); }
      .drawer-handle { display:none; }
    }

    /* ─ MOBILE ─ */
    @media(max-width:640px) {
      .rc-header { padding:12px 16px 0; }
      .rc-logo-icon { width:34px; height:34px; font-size:17px; }
      .rc-logo-text { font-size:16px; }
      .rc-logo-sub { display:none; }
      .rc-tabs { overflow-x:auto; scrollbar-width:none; }
      .rc-tabs::-webkit-scrollbar { display:none; }
      .rc-tab { padding:10px 14px; font-size:12px; }
      .rc-content { padding:14px 14px 100px; }
      .input-card { padding:16px; }
      .input-row { flex-direction:column; }
      .inp { height:48px; }
      .inp-prefix { font-size:10px; }
      .inp-pl { padding-left:116px; }
      .btn-primary { width:100%; height:48px; }
      .stats-grid { grid-template-columns:repeat(2,1fr); gap:8px; }
      .stat-val { font-size:24px; }
      .stat-icon { font-size:20px; }
      .rank-row { padding:12px 13px; gap:9px; }
      .rank-num { font-size:22px; }
      .rank-num-wrap { min-width:42px; }
      .rank-kw-text { max-width:140px; }
      .kw-grid { grid-template-columns:1fr; }
      .results-header { flex-direction:column; align-items:flex-start; gap:8px; }
      .view-toggle { width:100%; }
      .rc-header-actions { gap:5px; }
      .hdr-btn { height:32px; padding:0 9px; font-size:10px; }
      .hdr-btn-icon { width:32px; padding:0; }
      .guide-float-btn { bottom:18px; right:14px; padding:11px 16px; font-size:12px; }
      .kw-result-rank { font-size:18px; min-width:48px; }
      .report-card { padding:16px; }
    }
    @media(max-width:390px) {
      .rc-logo-text { font-size:14px; }
      .hdr-btn span:not(:first-child) { display:none; }
      .stats-grid { gap:7px; }
    }
  `;

  return (
    <div className="rc-wrap" style={vars}>
      <style>{css}</style>
      {/* BG 파티클 */}
      <div className="rc-bg">
        <div className="rc-bg-orb rc-bg-orb1"/>
        <div className="rc-bg-orb rc-bg-orb2"/>
        <div className="rc-bg-orb rc-bg-orb3"/>
      </div>
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
                <>
                  <button className="hdr-btn hdr-btn-pdf" onClick={() => generatePDF(blogId, posts, rankResults)}>
                    <span>📄</span><span>SEO 보고서</span>
                  </button>
                  <button className="hdr-btn hdr-btn-csv" onClick={() => exportCSV(posts, rankResults)}>
                    <span>📊</span><span>순위 저장</span>
                  </button>
                </>
              )}
              <button className="hdr-btn hdr-btn-icon" title="AI 설정" onClick={() => setShowSettings(true)}>⚙️</button>
              <button className="hdr-btn hdr-btn-icon" onClick={() => setTheme(t => t==='dark'?'light':'dark')}>
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
                <div className="drawer-handle"/>
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
                        <div className="ai-inp-col">
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
                        </div>
                        <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <span style={{fontSize:11,color: hasKey ? '#10b981' : 'var(--text-muted)',fontWeight:600}}>
                            {hasKey ? '✓ 키 저장됨' : '키 미입력'}
                          </span>
                          <button
                            className={`use-ai-btn${isSelected?' selected':''}`}
                            style={{width:'auto',padding:'0 16px'}}
                            onClick={() => updateSelectedAI(isSelected ? '' : ai.key)}
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
                <div className="input-card card fade-up">
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
                <div className="progress-card card fade-up">
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
                      <div key={s.label} className="stat-card card">
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
                        return { post: p, kw, rank: r?.rank, found: r?.found ?? false, total: r?.total ?? 0 };
                      })
                    );
                    const seo         = calcSEOScore(allRows);
                    const top3List    = allRows.filter(r => r.found && r.rank <= 3).sort((a,b)=>a.rank-b.rank);
                    const top10List   = allRows.filter(r => r.found && r.rank > 3 && r.rank <= 10).sort((a,b)=>a.rank-b.rank);
                    const opportunities = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && !titleContains(r.post.title, r.kw));
                    const easyWins    = allRows.filter(r => !r.found && r.total > 0 && r.total < 3000 && titleContains(r.post.title, r.kw));
                    const midRange    = allRows.filter(r => !r.found && r.total >= 3000 && r.total < 150000);
                    const highComp    = allRows.filter(r => !r.found && r.total >= 150000);
                    const expRate     = allRows.length ? Math.round(allRows.filter(r=>r.found).length / allRows.length * 100) : 0;

                    return (
                      <div className="report-card fade-up">
                        {/* 헤더 + 점수 */}
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:18}}>
                          <div className="report-title" style={{marginBottom:0}}>📋 블로그 SEO 분석 리포트</div>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:32,fontWeight:900,color:seo.color,lineHeight:1}}>{seo.grade}</div>
                              <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,marginTop:2}}>SEO 등급</div>
                            </div>
                            <div style={{width:1,height:40,background:'var(--border)'}}/>
                            <div>
                              <div style={{fontSize:20,fontWeight:900,color:seo.color}}>{seo.score}<span style={{fontSize:12,color:'var(--text-muted)'}}>/100</span></div>
                              <div style={{fontSize:11,color:'var(--text-sub)',fontWeight:600}}>{seo.label}</div>
                            </div>
                          </div>
                        </div>

                        {/* 노출률 바 */}
                        <div style={{marginBottom:18}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',fontWeight:700,marginBottom:5}}>
                            <span>키워드 노출률</span><span style={{color:seo.color}}>{expRate}%</span>
                          </div>
                          <div style={{height:6,background:'var(--surface2)',borderRadius:99,overflow:'hidden'}}>
                            <div style={{width:`${expRate}%`,height:'100%',background:`linear-gradient(90deg,${seo.color},#ec4899)`,borderRadius:99,transition:'width .6s ease'}}/>
                          </div>
                        </div>

                        {/* 상위노출 중 */}
                        {top3List.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#f59e0b'}}>🥇 TOP 3 노출 키워드 — 지금 잘 되고 있어요</div>
                            <div className="report-section-body" style={{marginBottom:10}}>아래 키워드는 네이버 검색 3위 안에 노출 중이에요. 글 내용을 최신 상태로 유지하고, 관련 글끼리 내부 링크를 연결해 순위를 지켜나가세요.</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {top3List.slice(0,6).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:800,padding:'5px 12px',borderRadius:99,background:'rgba(245,158,11,.12)',color:'#f59e0b',border:'1px solid rgba(245,158,11,.3)'}}>#{r.kw} · {r.rank}위</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {top10List.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#a855f7'}}>🏆 TOP 4~10위 노출 키워드 — 첫 페이지 진입 완료</div>
                            <div className="report-section-body" style={{marginBottom:10}}>검색 첫 페이지에 노출 중이에요. 글 조회수와 체류 시간을 높이면 3위 안으로 올라갈 수 있어요.</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {top10List.slice(0,6).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:800,padding:'5px 12px',borderRadius:99,background:'rgba(168,85,247,.12)',color:'#a855f7',border:'1px solid rgba(168,85,247,.3)'}}>#{r.kw} · {r.rank}위</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 기회 키워드 */}
                        {opportunities.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#10b981'}}>🎯 지금 당장 할 수 있는 것 — 제목만 바꿔도 올라가요</div>
                            <div className="report-section-body" style={{marginBottom:10}}>
                              경쟁자가 <strong>3,000명 미만</strong>인데 아직 글 제목에 이 키워드가 없어요.<br/>
                              👉 해당 글 제목 맨 앞에 키워드를 추가하는 것만으로 상위 노출 가능성이 크게 높아집니다.
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {opportunities.slice(0,8).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:800,padding:'5px 12px',borderRadius:99,background:'rgba(16,185,129,.1)',color:'#10b981',border:'1px solid rgba(16,185,129,.3)'}}>#{r.kw}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {easyWins.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#3b82f6'}}>📝 본문 보강이 필요한 키워드 — 제목엔 있는데 미노출</div>
                            <div className="report-section-body" style={{marginBottom:10}}>
                              제목에는 키워드가 있지만 아직 검색에 안 잡혀요.<br/>
                              👉 본문에서 이 키워드를 <strong>2~3번 자연스럽게</strong> 반복하고, 글 길이를 1,500자 이상으로 늘려보세요.
                            </div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {easyWins.slice(0,8).map((r,i) => (
                                <span key={i} style={{fontSize:12,fontWeight:800,padding:'5px 12px',borderRadius:99,background:'rgba(59,130,246,.1)',color:'#3b82f6',border:'1px solid rgba(59,130,246,.3)'}}>#{r.kw}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {midRange.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#f59e0b'}}>🔥 중간 경쟁 키워드 — 전략적으로 접근하세요</div>
                            <div className="report-section-body">
                              경쟁자가 3,000~15만 명 사이인 키워드예요.<br/>
                              👉 단순 나열보다 <strong>전문적인 내용, 실제 경험, 사진</strong>으로 차별화하면 이길 수 있어요. 총 {midRange.length}개
                            </div>
                          </div>
                        )}

                        {highComp.length > 0 && (
                          <div className="report-section">
                            <div className="report-section-title" style={{color:'#f87171'}}>⚠️ 경쟁 포화 키워드 — 키워드 교체를 권장해요</div>
                            <div className="report-section-body">
                              검색 결과가 15만 개 이상으로 대형 블로그들과 경쟁해야 해요.<br/>
                              👉 "맛집" 대신 "강릉 중앙시장 현지인 맛집 추천"처럼 <strong>더 구체적인 롱테일 키워드</strong>로 바꾸세요. 총 {highComp.length}개
                            </div>
                          </div>
                        )}

                        {top3List.length === 0 && opportunities.length === 0 && easyWins.length === 0 && (
                          <div className="report-section-body" style={{color:'var(--text-muted)',paddingTop:8}}>
                            ⚙️ 설정에서 AI 키를 등록하면 더 정확한 키워드로 분석할 수 있어요.
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
                                {r.found ? `네이버 검색 결과 ${r.rank}번째 노출` : '이 키워드로 검색 시 내 글이 보이지 않음 (100위 밖)'}
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

        {/* ─── 떠다니는 가이드 버튼 ─── */}
        <button
          className="guide-float-btn"
          onClick={() => setShowGuide(g => !g)}
          title="용어 설명서"
        >
          <span className="guide-float-icon">📖</span>
          <span className="guide-float-label">용어 설명</span>
        </button>

        {/* ─── 가이드 모달 ─── */}
        {showGuide && (
          <>
            <div className="settings-overlay" onClick={() => setShowGuide(false)} />
            <div className="guide-modal fade-up">
              <div className="guide-modal-handle"/>
              <div className="settings-head">
                <div className="settings-title">📖 용어 & 지표 설명서</div>
                <button className="settings-close" onClick={() => setShowGuide(false)}>✕</button>
              </div>
              <div style={{padding:'0 24px 24px',overflowY:'auto',flex:1}}>

                {/* 순위 */}
                <div className="guide-section">
                  <div className="guide-section-title">🎯 순위란?</div>
                  <p className="guide-p">네이버 검색창에 키워드를 입력했을 때 내 블로그 글이 몇 번째에 나타나는지를 의미해요. 1위가 가장 위, 100위 밖이면 미노출입니다.</p>
                  <div className="guide-examples">
                    {[
                      {color:'#f59e0b',bg:'rgba(245,158,11,.15)',label:'1위 🥇',desc:'검색 최상단 · 클릭율 최고'},
                      {color:'#ec4899',bg:'rgba(236,72,153,.15)',label:'2~3위',desc:'상위권 · 충분히 좋음'},
                      {color:'#a855f7',bg:'rgba(168,85,247,.15)',label:'4~10위',desc:'첫 페이지 · 노출 양호'},
                      {color:'#6366f1',bg:'rgba(99,102,241,.15)',label:'11~30위',desc:'2페이지권 · 개선 여지'},
                      {color:'#64748b',bg:'rgba(100,116,139,.12)',label:'미노출',desc:'이 키워드로 검색해도 내 글이 보이지 않음 (100위 밖)'},
                    ].map(r => (
                      <div key={r.label} className="guide-example-row">
                        <span style={{fontSize:12,fontWeight:800,padding:'4px 12px',borderRadius:99,color:r.color,background:r.bg,border:`1px solid ${r.color}40`,flexShrink:0,minWidth:70,textAlign:'center'}}>{r.label}</span>
                        <span style={{fontSize:12,color:'var(--text-sub)'}}>{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 경쟁도 */}
                <div className="guide-section">
                  <div className="guide-section-title">⚔️ 경쟁도란?</div>
                  <p className="guide-p">해당 키워드로 네이버에서 검색했을 때 등록된 블로그 글이 몇 개인지를 보여줘요. 적을수록 내 글이 상위에 올라가기 쉽습니다.</p>
                  <div className="guide-examples">
                    {[
                      {color:'#10b981',bg:'rgba(16,185,129,.12)',label:'낮음',desc:'3,000개 미만 · 지금 바로 도전하세요!'},
                      {color:'#f59e0b',bg:'rgba(245,158,11,.12)',label:'보통',desc:'3,000~30,000개 · 글 품질로 승부 가능'},
                      {color:'#f97316',bg:'rgba(249,115,22,.12)',label:'높음',desc:'3만~15만개 · 전략적 접근 필요'},
                      {color:'#ef4444',bg:'rgba(239,68,68,.12)',label:'매우 높음',desc:'15만개 이상 · 더 구체적인 키워드 추천'},
                    ].map(r => (
                      <div key={r.label} className="guide-example-row">
                        <span style={{fontSize:11,fontWeight:800,padding:'3px 10px',borderRadius:99,color:r.color,background:r.bg,border:`1px solid ${r.color}40`,flexShrink:0,minWidth:70,textAlign:'center'}}>{r.label}</span>
                        <span style={{fontSize:12,color:'var(--text-sub)'}}>{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 키워드 출처 */}
                <div className="guide-section">
                  <div className="guide-section-title">🏷️ 키워드 출처란?</div>
                  <p className="guide-p">이 도구가 어떤 방법으로 키워드를 찾아냈는지를 표시해요.</p>
                  <div className="guide-examples">
                    {[
                      {color:'#10b981',label:'태그',desc:'블로그 글에 직접 등록한 해시태그 · 가장 정확'},
                      {color:'#a78bfa',label:'AI',desc:'AI가 글 제목/내용을 분석해 추출 · 설정에서 키 등록 필요'},
                      {color:'#94a3b8',label:'제목',desc:'글 제목 단어 조합으로 파싱 · 정확도 보통'},
                    ].map(r => (
                      <div key={r.label} className="guide-example-row">
                        <span style={{fontSize:11,fontWeight:800,padding:'3px 10px',borderRadius:99,color:r.color,background:`${r.color}18`,border:`1px solid ${r.color}40`,flexShrink:0,minWidth:50,textAlign:'center'}}>{r.label}</span>
                        <span style={{fontSize:12,color:'var(--text-sub)'}}>{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 인사이트 */}
                <div className="guide-section">
                  <div className="guide-section-title">💡 인사이트 메시지란?</div>
                  <p className="guide-p">각 키워드 상황에 맞게 자동으로 조언을 드려요. 아래 색상으로 구분됩니다.</p>
                  <div className="guide-examples">
                    {[
                      {color:'#10b981',border:'rgba(16,185,129,.3)',bg:'rgba(16,185,129,.1)',label:'🎯 기회!',desc:'경쟁 적고 제목에 키워드 없음 → 제목만 수정해도 상위 노출 가능'},
                      {color:'#a855f7',border:'rgba(168,85,247,.3)',bg:'rgba(168,85,247,.1)',label:'📝 보강 필요',desc:'제목엔 있는데 미노출 → 본문에 키워드 2~3회 더 자연스럽게 추가'},
                      {color:'#ef4444',border:'rgba(239,68,68,.25)',bg:'rgba(239,68,68,.08)',label:'⚠️ 교체 권장',desc:'경쟁 포화 → 더 좁고 구체적인 롱테일 키워드로 바꾸세요'},
                      {color:'#f59e0b',border:'rgba(245,158,11,.3)',bg:'rgba(245,158,11,.1)',label:'💪 유지',desc:'치열한 경쟁에서 상위권 중 → 글 품질 계속 유지하세요'},
                    ].map(r => (
                      <div key={r.label} style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${r.border}`,background:r.bg,marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:800,color:r.color,marginBottom:3}}>{r.label}</div>
                        <div style={{fontSize:12,color:'var(--text-sub)'}}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 분석 리포트 */}
                <div className="guide-section">
                  <div className="guide-section-title">📋 분석 리포트란?</div>
                  <p className="guide-p">분석이 끝나면 전체 결과를 요약해서 지금 당장 해야 할 것을 알려드려요. 기회 키워드, 개선 필요 글, 포기해야 할 키워드를 한눈에 볼 수 있어요.</p>
                </div>

                {/* TOP3/TOP10 */}
                <div className="guide-section" style={{borderBottom:'none',paddingBottom:0}}>
                  <div className="guide-section-title">🏆 TOP3 · TOP10이란?</div>
                  <p className="guide-p">분석한 전체 키워드 중에서 네이버 검색 3위 안, 10위 안에 들어온 키워드의 개수예요. 숫자가 높을수록 블로그 SEO 상태가 좋다는 의미입니다.</p>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
