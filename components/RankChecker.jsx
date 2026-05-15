'use client';
import { useState, useRef, useEffect } from 'react';

function getRankStyle(rank) {
  if (!rank) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb', label: '미노출' };
  if (rank === 1)  return { bg: '#fef9c3', text: '#92400e', border: '#fde68a', label: '1위' };
  if (rank <= 3)   return { bg: '#dcfce7', text: '#14532d', border: '#86efac', label: `${rank}위` };
  if (rank <= 10)  return { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd', label: `${rank}위` };
  if (rank <= 30)  return { bg: '#f3e8ff', text: '#581c87', border: '#d8b4fe', label: `${rank}위` };
  return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: `${rank}위` };
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ko-KR'); } catch { return d; }
}

const STOP = new Set([
  '소개합니다','합니다','입니다','이야기','하는법','방법','알아보기','알아보자',
  '총정리','정리','후기','리뷰','정보','공략','꿀팁','추천','비교','구매',
  '사용','솔직','완전','제대로','가이드','방문','다녀왔어요','다녀왔습니다',
  '소개','안내','선정','잘되는','잘','법','및','위한','대한','하기','되는',
  '이란','에서','으로','이란','것','수','있는','있어요','했어요','해요',
]);

function extractFromTitle(title) {
  return title
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10 && !STOP.has(w) && /[가-힣]/.test(w))
    .slice(0, 4);
}

function exportCSV(posts, rankResults) {
  const rows = [['제목', '날짜', '키워드', '순위', '링크']];
  posts.forEach(p => {
    (p.keywords || []).forEach(kw => {
      const r = rankResults[`${p.logNo}_${kw}`];
      rows.push([p.title, formatDate(p.pubDate), kw,
        r === undefined ? '확인중' : (r.found ? `${r.rank}위` : '미노출'), p.link]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'naver_rank.csv'; a.click();
}

const LS_KEY = 'naver_api_keys';

export default function RankChecker() {
  const [blogId,       setBlogId]       = useState('');
  const [phase,        setPhase]        = useState('idle'); // idle | fetching | ranking | done
  const [error,        setError]        = useState('');
  const [posts,        setPosts]        = useState([]);
  const [rankResults,  setRankResults]  = useState({});
  const [progress,     setProgress]     = useState({ current: 0, total: 0, label: '' });
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [clientId,     setClientId]     = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiSaved,     setApiSaved]     = useState(false);
  const [filter,       setFilter]       = useState('all');
  const abortRef = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (s.clientId)     setClientId(s.clientId);
      if (s.clientSecret) setClientSecret(s.clientSecret);
      if (s.clientId && s.clientSecret) setApiSaved(true);
    } catch {}
  }, []);

  const saveApi = () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }));
    setApiSaved(true); setShowApiPanel(false);
  };

  /* ── 전체 자동 실행 ── */
  const handleStart = async () => {
    if (!blogId.trim()) { setError('블로그 ID를 입력하세요.'); return; }
    if (!clientId || !clientSecret) { setShowApiPanel(true); setError('API 키를 먼저 설정하세요.'); return; }

    abortRef.current = false;
    setError(''); setPosts([]); setRankResults({});

    // 1단계: 글 목록 수집
    setPhase('fetching');
    setProgress({ current: 0, total: 0, label: '블로그 글 수집 중...' });
    let fetchedPosts = [];
    try {
      const res = await fetch('/api/blog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: blogId.trim(), maxPosts: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '글 목록 수집 실패');

      // 태그 없는 글 → 제목에서 자동 추출
      fetchedPosts = data.posts.map(p => ({
        ...p,
        keywords: p.keywords?.length > 0 ? p.keywords : extractFromTitle(p.title),
      }));
      setPosts(fetchedPosts);
    } catch (e) {
      setError(e.message); setPhase('idle'); return;
    }

    // 2단계: 순위 자동 확인
    setPhase('ranking');
    const tasks = fetchedPosts.flatMap(p =>
      (p.keywords || []).map(kw => ({ post: p, kw }))
    );
    setProgress({ current: 0, total: tasks.length, label: '' });

    for (let i = 0; i < tasks.length; i++) {
      if (abortRef.current) break;
      const { post, kw } = tasks[i];
      setProgress({ current: i + 1, total: tasks.length, label: `"${kw}"` });

      try {
        const res = await fetch('/api/blog/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: post.blogId, logNo: post.logNo, clientId, clientSecret }),
        });
        const data = await res.json();
        if (data.needsApiKey) { setShowApiPanel(true); setError(data.error); abortRef.current = true; break; }
        setRankResults(prev => ({ ...prev, [`${post.logNo}_${kw}`]: { rank: data.rank, found: data.found } }));
      } catch {
        setRankResults(prev => ({ ...prev, [`${post.logNo}_${kw}`]: { rank: null, found: false } }));
      }
      await new Promise(r => setTimeout(r, 250));
    }

    setPhase('done');
  };

  const handleReset = () => {
    setPosts([]); setRankResults({}); setPhase('idle');
    setProgress({ current: 0, total: 0, label: '' }); setBlogId(''); setError('');
  };

  const allResults = Object.values(rankResults);
  const stats = {
    total:   posts.length,
    top10:   allResults.filter(r => r.found && r.rank <= 10).length,
    exposed: allResults.filter(r => r.found).length,
    hidden:  allResults.filter(r => !r.found).length,
  };

  const filteredPosts = posts.filter(p => {
    if (filter === 'all') return true;
    const ranks = (p.keywords || []).map(kw => rankResults[`${p.logNo}_${kw}`]);
    if (filter === 'exposed') return ranks.some(r => r?.found);
    if (filter === 'hidden')  return ranks.some(r => r && !r.found);
    return true;
  });

  const isRunning = phase === 'fetching' || phase === 'ranking';
  const isDone    = phase === 'done';
  const isLoaded  = posts.length > 0;
  const pct       = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif", maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem', background: '#f8fafc', minHeight: '100vh' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: '#03c75a', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📊</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>네이버 블로그 순위 체커</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>블로그 ID 입력 → 전체 자동 분석 · 블로그탭 100위</div>
          </div>
        </div>
        <button onClick={() => setShowApiPanel(v => !v)}
          style={{ padding: '6px 14px', background: apiSaved ? '#f0fdf4' : '#fff7ed', border: `1px solid ${apiSaved ? '#86efac' : '#fed7aa'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: apiSaved ? '#16a34a' : '#c2410c', cursor: 'pointer' }}>
          {apiSaved ? '🔑 API 키 등록됨' : '⚠️ API 키 설정'}
        </button>
      </div>

      {/* API 키 패널 */}
      {showApiPanel && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>네이버 검색 API 키</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                <a href="https://developers.naver.com/apps/#/register" target="_blank" rel="noreferrer" style={{ color: '#03c75a', fontWeight: 600 }}>developers.naver.com</a>
                {' '}→ 앱 등록 → 검색 API → Client ID/Secret 복사
              </div>
            </div>
            <button onClick={() => setShowApiPanel(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Client ID</label>
              <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID"
                style={{ width: '100%', height: 38, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Client Secret</label>
              <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Client Secret"
                style={{ width: '100%', height: 38, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
            </div>
          </div>
          <button onClick={saveApi} disabled={!clientId || !clientSecret}
            style={{ width: '100%', height: 38, background: (!clientId || !clientSecret) ? '#e5e7eb' : '#03c75a', color: (!clientId || !clientSecret) ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            저장
          </button>
        </div>
      )}

      {/* 입력 */}
      {!isLoaded && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>네이버 블로그 ID</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', pointerEvents: 'none' }}>blog.naver.com/</span>
              <input type="text" placeholder="myblogid" value={blogId}
                onChange={e => setBlogId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isRunning && handleStart()}
                style={{ width: '100%', height: 46, border: '1px solid #d1d5db', borderRadius: 9, paddingLeft: 130, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa' }} />
            </div>
            <button onClick={handleStart} disabled={isRunning}
              style={{ height: 46, padding: '0 28px', background: '#03c75a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              🔍 분석 시작
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', whiteSpace: 'pre-line' }}>
              ⚠️ {error}
              {error.includes('API') && <button onClick={() => setShowApiPanel(true)} style={{ marginLeft: 8, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>API 키 설정</button>}
            </div>
          )}
        </div>
      )}

      {/* 진행률 */}
      {isRunning && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              {phase === 'fetching' ? '📥 글 목록 수집 중...' : `🔍 ${progress.current}/${progress.total} · ${progress.label} 확인 중`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {phase === 'ranking' && <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{pct}%</span>}
              <button onClick={() => abortRef.current = true} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>중단</button>
            </div>
          </div>
          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: phase === 'fetching' ? '15%' : `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#03c75a,#6366f1)', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* 결과 */}
      {isLoaded && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>✅ {blogId}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>· {posts.length}개 글</span>
              {isDone && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>· 분석 완료</span>}
            </div>
            <button onClick={handleReset} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>초기화</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: '전체 글', value: stats.total, color: '#111' },
              { label: 'TOP 10', value: stats.top10, color: '#16a34a' },
              { label: '노출', value: stats.exposed, color: '#2563eb' },
              { label: '미노출', value: stats.hidden, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {[['all','전체'],['exposed','노출'],['hidden','미노출']].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)}
                style={{ padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1px solid ${filter===v?'#03c75a':'#e5e7eb'}`, background: filter===v?'#03c75a':'#fff', color: filter===v?'#fff':'#6b7280', cursor: 'pointer' }}>
                {l}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {isDone && (
              <button onClick={() => exportCSV(posts, rankResults)}
                style={{ padding: '6px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📥 CSV
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredPosts.map((post, pi) => {
              const postRanks = (post.keywords||[]).map(kw => rankResults[`${post.logNo}_${kw}`]);
              const bestRank = postRanks.filter(r=>r?.found).map(r=>r.rank).sort((a,b)=>a-b)[0];

              return (
                <div key={post.logNo} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 99, fontWeight: 600, flexShrink: 0 }}>{pi+1}</span>
                    {bestRank && (
                      <span style={{ fontSize: 11, background: getRankStyle(bestRank).bg, color: getRankStyle(bestRank).text, padding: '2px 9px', borderRadius: 99, fontWeight: 700, border: `1px solid ${getRankStyle(bestRank).border}`, flexShrink: 0 }}>
                        최고 {bestRank}위
                      </span>
                    )}
                    <a href={post.link} target="_blank" rel="noreferrer"
                      style={{ fontSize: 14, fontWeight: 600, color: '#111', textDecoration: 'none', flex: 1 }}>
                      {post.title}
                    </a>
                    <span style={{ fontSize: 11, color: '#d1d5db', flexShrink: 0 }}>{formatDate(post.pubDate)}</span>
                  </div>
                  <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 40, alignItems: 'center' }}>
                    {(post.keywords||[]).length > 0 ? (post.keywords||[]).map(kw => {
                      const key = `${post.logNo}_${kw}`;
                      const r = rankResults[key];
                      const s = r ? getRankStyle(r.rank) : null;
                      const checking = isRunning && r === undefined;
                      return (
                        <div key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, border: `1px solid ${s ? s.border : checking ? '#e0e7ff' : '#e5e7eb'}`, background: s ? s.bg : checking ? '#f5f3ff' : '#f9fafb' }}>
                          <span style={{ fontSize: 12, color: s ? s.text : checking ? '#6366f1' : '#374151', fontWeight: 500 }}>#{kw}</span>
                          {checking
                            ? <span style={{ fontSize: 10, color: '#a5b4fc' }}>⏳</span>
                            : r ? <span style={{ fontSize: 11, fontWeight: 800, color: s.text }}>{s.label}</span>
                            : null}
                        </div>
                      );
                    }) : <span style={{ fontSize: 12, color: '#d1d5db' }}>키워드 없음</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {isDone && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {[['1위','#92400e'],['2-3위','#14532d'],['4-10위','#1e3a8a'],['11-30위','#581c87'],['31-100위','#374151'],['미노출','#9ca3af']].map(([l,c]) => (
                <span key={l} style={{ fontSize: 11, color: c, fontWeight: 500 }}>{l}</span>
              ))}
              <span style={{ fontSize: 11, color: '#d1d5db', marginLeft: 'auto' }}>네이버 블로그탭 기준</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
