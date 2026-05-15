'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

/* ─── 유틸 ─────────────────────────────────────────────── */
function getRankStyle(rank) {
  if (!rank) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb', label: '미노출', emoji: '—' };
  if (rank === 1) return { bg: '#fef9c3', text: '#92400e', border: '#fde68a', label: '1위', emoji: '🥇' };
  if (rank <= 3)  return { bg: '#dcfce7', text: '#14532d', border: '#86efac', label: `${rank}위`, emoji: '🥈' };
  if (rank <= 10) return { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd', label: `${rank}위`, emoji: '🔵' };
  if (rank <= 30) return { bg: '#f3e8ff', text: '#581c87', border: '#d8b4fe', label: `${rank}위`, emoji: '🟣' };
  return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: `${rank}위`, emoji: '⚪' };
}

function formatDate(d) {
  if (!d) return '날짜 미상';
  try { return new Date(d).toLocaleDateString('ko-KR'); } catch { return d; }
}

function exportCSV(posts, rankResults) {
  const rows = [['제목', '날짜', '키워드', '순위', '링크']];
  posts.forEach(p => {
    if (!p.keywords?.length) {
      rows.push([p.title, formatDate(p.pubDate), '', '미확인', p.link]);
    } else {
      p.keywords.forEach(kw => {
        const r = rankResults[`${p.logNo}_${kw}`];
        rows.push([p.title, formatDate(p.pubDate), kw, r ? (r.found ? `${r.rank}위` : '미노출') : '미확인', p.link]);
      });
    }
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'naver_rank.csv';
  a.click();
}

const LS_KEY = 'naver_api_keys';

/* ─── 메인 ─────────────────────────────────────────────── */
export default function RankChecker() {
  const [blogId,   setBlogId]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [loadMsg,  setLoadMsg]  = useState('');
  const [error,    setError]    = useState('');
  const [posts,    setPosts]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [rankResults,   setRankResults]   = useState({});
  const [checkingRank,  setCheckingRank]  = useState({});
  const [extractingAI,  setExtractingAI]  = useState({});
  const [batch,    setBatch]    = useState({ running: false, current: 0, total: 0, label: '' });
  const [filter,   setFilter]   = useState('all');

  // API 키 설정 패널
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [clientId,     setClientId]     = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiSaved,     setApiSaved]     = useState(false);

  const abortRef = useRef(false);

  // localStorage에서 API 키 로드
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (saved.clientId)     setClientId(saved.clientId);
      if (saved.clientSecret) setClientSecret(saved.clientSecret);
      if (saved.clientId && saved.clientSecret) setApiSaved(true);
    } catch {}
  }, []);

  const saveApiKeys = () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }));
    setApiSaved(true);
    setShowApiPanel(false);
  };

  const clearApiKeys = () => {
    localStorage.removeItem(LS_KEY);
    setClientId(''); setClientSecret(''); setApiSaved(false);
  };

  /* ── 글 목록 가져오기 ── */
  const handleFetch = async () => {
    if (!blogId.trim()) { setError('블로그 ID를 입력하세요.'); return; }
    setLoading(true); setError(''); setPosts([]); setRankResults({}); setTotal(0);
    try {
      setLoadMsg('RSS 수집 중...');
      const res = await fetch('/api/blog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: blogId.trim(), maxPosts: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '글 목록을 가져올 수 없습니다.');
      setPosts(data.posts);
      setTotal(data.totalPosts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setLoadMsg('');
    }
  };

  /* ── 단일 키워드 순위 체크 ── */
  const checkRank = useCallback(async (post, keyword) => {
    const key = `${post.logNo}_${keyword}`;
    setCheckingRank(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch('/api/blog/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword, blogId: post.blogId, logNo: post.logNo,
          clientId, clientSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsApiKey) {
          setShowApiPanel(true);
          throw new Error(data.error);
        }
        throw new Error(data.error);
      }
      setRankResults(p => ({ ...p, [key]: { rank: data.rank, found: data.found } }));
    } catch (e) {
      setError(e.message);
      setRankResults(p => ({ ...p, [key]: { rank: null, found: false, error: true } }));
    } finally {
      setCheckingRank(p => ({ ...p, [key]: false }));
    }
  }, [clientId, clientSecret]);

  /* ── 글 하나의 전체 키워드 순위 ── */
  const checkAllForPost = async (post) => {
    for (const kw of (post.keywords || [])) {
      await checkRank(post, kw);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  /* ── AI 키워드 추출 ── */
  const extractAI = async (post) => {
    setExtractingAI(p => ({ ...p, [post.logNo]: true }));
    try {
      const res = await fetch('/api/blog/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.title, description: post.description }),
      });
      const data = await res.json();
      if (data.keywords?.length) {
        const merged = [...new Set([...(post.keywords || []), ...data.keywords])].slice(0, 10);
        setPosts(prev => prev.map(p => p.logNo === post.logNo ? { ...p, keywords: merged } : p));
      }
    } catch {}
    finally { setExtractingAI(p => ({ ...p, [post.logNo]: false })); }
  };

  /* ── 전체 일괄 확인 ── */
  const batchCheck = async () => {
    if (!apiSaved && !clientId) { setShowApiPanel(true); return; }
    abortRef.current = false;
    const tasks = posts.flatMap(post =>
      (post.keywords || [])
        .filter(kw => !rankResults[`${post.logNo}_${kw}`])
        .map(kw => ({ post, kw }))
    );
    if (!tasks.length) return;

    setBatch({ running: true, current: 0, total: tasks.length, label: '' });
    for (let i = 0; i < tasks.length; i++) {
      if (abortRef.current) break;
      const { post, kw } = tasks[i];
      setBatch(p => ({ ...p, current: i + 1, label: `"${kw}"` }));
      await checkRank(post, kw);
      await new Promise(r => setTimeout(r, 300));
    }
    setBatch({ running: false, current: 0, total: 0, label: '' });
  };

  /* ── 통계 ── */
  const checked = Object.values(rankResults);
  const stats = {
    total,
    withKw: posts.filter(p => p.keywords?.length > 0).length,
    top10:  checked.filter(r => r.found && r.rank <= 10).length,
    exposed: checked.filter(r => r.found).length,
    hidden:  checked.filter(r => !r.found && !r.error).length,
  };

  const pendingCount = posts.reduce((acc, p) =>
    acc + (p.keywords || []).filter(kw => !rankResults[`${p.logNo}_${kw}`]).length, 0);

  const filteredPosts = posts.filter(p => {
    if (filter === 'all') return true;
    const ranks = (p.keywords || []).map(kw => rankResults[`${p.logNo}_${kw}`]);
    if (filter === 'exposed') return ranks.some(r => r?.found);
    if (filter === 'hidden')  return ranks.length > 0 && !ranks.some(r => r?.found);
    return true;
  });

  const isLoaded = posts.length > 0;

  /* ─── UI ─── */
  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif", maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem', background: '#f8fafc', minHeight: '100vh', color: '#111' }}>

      {/* ─── 헤더 ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: '#03c75a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📊</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>네이버 블로그 순위 체커</h1>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>공식 검색 API 기반 · 블로그 탭 최대 100위 확인</p>
          </div>
        </div>

        {/* API 키 상태 버튼 */}
        <button
          onClick={() => setShowApiPanel(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: apiSaved ? '#f0fdf4' : '#fff7ed', border: `1px solid ${apiSaved ? '#86efac' : '#fed7aa'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: apiSaved ? '#16a34a' : '#c2410c', cursor: 'pointer' }}
        >
          <span>{apiSaved ? '🔑 API 키 등록됨' : '⚠️ API 키 설정 필요'}</span>
        </button>
      </div>

      {/* ─── API 키 설정 패널 ─── */}
      {showApiPanel && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.25rem', marginBottom: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>네이버 검색 API 키 설정</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                <a href="https://developers.naver.com/apps/#/register" target="_blank" rel="noreferrer" style={{ color: '#03c75a', fontWeight: 600 }}>developers.naver.com</a>
                {' '}에서 앱 생성 → 검색 API 선택 → Client ID / Secret 복사
              </div>
            </div>
            <button onClick={() => setShowApiPanel(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>

          {/* 발급 안내 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
            📌 발급 방법: 네이버 개발자센터 → 애플리케이션 등록 → 사용 API에서 <strong>검색</strong> 선택 → 웹 서비스 URL에 <strong>http://localhost</strong> 입력 → 등록
            <br/>무료 25,000회/일 · 실시간 검색 순위 100위까지 정확히 확인 가능
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Client ID</label>
              <input
                type="text" placeholder="Naver Client ID"
                value={clientId} onChange={e => setClientId(e.target.value)}
                style={{ width: '100%', height: 38, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Client Secret</label>
              <input
                type="password" placeholder="Naver Client Secret"
                value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                style={{ width: '100%', height: 38, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={saveApiKeys}
              disabled={!clientId.trim() || !clientSecret.trim()}
              style={{ flex: 1, height: 38, background: (!clientId || !clientSecret) ? '#e5e7eb' : '#03c75a', color: (!clientId || !clientSecret) ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (!clientId || !clientSecret) ? 'not-allowed' : 'pointer' }}
            >
              저장 (브라우저 로컬에만 저장됨)
            </button>
            {apiSaved && (
              <button onClick={clearApiKeys} style={{ padding: '0 16px', height: 38, background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── 블로그 ID 입력 ─── */}
      {!isLoaded && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
            네이버 블로그 ID
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', pointerEvents: 'none' }}>
                blog.naver.com/
              </span>
              <input
                type="text" placeholder="myblogid"
                value={blogId} onChange={e => setBlogId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                style={{ width: '100%', height: 44, border: '1px solid #d1d5db', borderRadius: 9, paddingLeft: 130, paddingRight: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa' }}
              />
            </div>
            <button
              onClick={handleFetch} disabled={loading}
              style={{ height: 44, padding: '0 24px', background: loading ? '#86efac' : '#03c75a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? `⏳ ${loadMsg}` : '글 목록 불러오기'}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', whiteSpace: 'pre-line' }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      )}

      {/* ─── 결과 영역 ─── */}
      {isLoaded && (
        <>
          {/* 상단 바 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>✅ {blogId}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>· {total}개 글</span>
            </div>
            <button onClick={() => { setPosts([]); setRankResults({}); setTotal(0); setBlogId(''); setError(''); }}
              style={{ fontSize: 12, color: '#6b7280', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              초기화
            </button>
          </div>

          {/* 통계 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: '전체 글', value: stats.total, color: '#111' },
              { label: '키워드 있음', value: stats.withKw, color: '#6366f1' },
              { label: 'TOP 10', value: stats.top10, color: '#16a34a' },
              { label: '노출', value: stats.exposed, color: '#2563eb' },
              { label: '미노출', value: stats.hidden, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* 오류 메시지 */}
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              ⚠️ {error}
              {error.includes('API') && <button onClick={() => setShowApiPanel(true)} style={{ marginLeft: 8, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>API 키 설정</button>}
            </div>
          )}

          {/* 액션 바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[['all', '전체'], ['exposed', '노출'], ['hidden', '미노출']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1px solid ${filter === v ? '#03c75a' : '#e5e7eb'}`, background: filter === v ? '#03c75a' : '#fff', color: filter === v ? '#fff' : '#6b7280', cursor: 'pointer' }}>
                {l}
              </button>
            ))}
            <div style={{ flex: 1 }} />

            {!batch.running ? (
              <button onClick={batchCheck} disabled={pendingCount === 0}
                style={{ padding: '6px 16px', background: pendingCount === 0 ? '#e5e7eb' : '#6366f1', color: pendingCount === 0 ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: pendingCount === 0 ? 'not-allowed' : 'pointer' }}>
                ⚡ 전체 일괄 확인 ({pendingCount})
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>{batch.current}/{batch.total} · {batch.label}</span>
                <div style={{ width: 80, height: 4, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(batch.current / batch.total) * 100}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s' }} />
                </div>
                <button onClick={() => abortRef.current = true} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>중단</button>
              </div>
            )}

            {checked.length > 0 && (
              <button onClick={() => exportCSV(posts, rankResults)} style={{ padding: '6px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📥 CSV
              </button>
            )}
          </div>

          {/* 글 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredPosts.map((post, pi) => {
              const postRanks = (post.keywords || []).map(kw => rankResults[`${post.logNo}_${kw}`]);
              const bestRank = postRanks.filter(r => r?.found).map(r => r.rank).sort((a, b) => a - b)[0];

              return (
                <div key={post.logNo} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 99, fontWeight: 600, flexShrink: 0 }}>{pi + 1}</span>
                        {bestRank && (
                          <span style={{ fontSize: 10, background: getRankStyle(bestRank).bg, color: getRankStyle(bestRank).text, padding: '2px 8px', borderRadius: 99, fontWeight: 700, border: `1px solid ${getRankStyle(bestRank).border}`, flexShrink: 0 }}>
                            최고 {bestRank}위
                          </span>
                        )}
                        <a href={post.link} target="_blank" rel="noreferrer"
                          style={{ fontSize: 14, fontWeight: 600, color: '#111', textDecoration: 'none' }}>
                          {post.title}
                        </a>
                      </div>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(post.pubDate)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => extractAI(post)} disabled={extractingAI[post.logNo]}
                        style={{ fontSize: 11, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '4px 10px', cursor: extractingAI[post.logNo] ? 'wait' : 'pointer', fontWeight: 600 }}>
                        {extractingAI[post.logNo] ? '...' : '✨ AI키워드'}
                      </button>
                      {post.keywords?.length > 0 && (
                        <button onClick={() => checkAllForPost(post)}
                          style={{ fontSize: 11, color: '#fff', background: '#6366f1', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                          전체확인
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 44, alignItems: 'center' }}>
                    {post.keywords?.length > 0 ? post.keywords.map(kw => {
                      const key = `${post.logNo}_${kw}`;
                      const result = rankResults[key];
                      const checking = checkingRank[key];
                      const s = result ? getRankStyle(result.rank) : null;
                      return (
                        <div key={kw} onClick={() => !checking && checkRank(post, kw)}
                          title={result ? (result.found ? `네이버 블로그탭 ${result.rank}위` : '100위 이내 미노출') : '클릭하여 순위 확인'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, cursor: checking ? 'wait' : 'pointer', border: `1px solid ${s ? s.border : '#e5e7eb'}`, background: s ? s.bg : '#f9fafb', transition: 'all 0.15s', userSelect: 'none' }}>
                          <span style={{ fontSize: 12, color: s ? s.text : '#374151', fontWeight: 500 }}>#{kw}</span>
                          {checking
                            ? <span style={{ fontSize: 10, color: '#9ca3af' }}>⏳</span>
                            : result
                              ? <span style={{ fontSize: 11, fontWeight: 800, color: s.text }}>{s.emoji} {s.label}</span>
                              : <span style={{ fontSize: 10, color: '#d1d5db' }}>·</span>
                          }
                        </div>
                      );
                    }) : (
                      <span style={{ fontSize: 12, color: '#d1d5db' }}>태그 없음 · ✨ AI키워드 버튼으로 추출하세요</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── 범례 ─── */}
      {isLoaded && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['🥇','1위'], ['🥈','2-3위'], ['🔵','4-10위'], ['🟣','11-30위'], ['⚪','31-100위'], ['—','미노출']].map(([e, l]) => (
            <span key={l} style={{ fontSize: 11, color: '#6b7280' }}>{e} {l}</span>
          ))}
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>네이버 블로그탭 기준</span>
        </div>
      )}
    </div>
  );
}
