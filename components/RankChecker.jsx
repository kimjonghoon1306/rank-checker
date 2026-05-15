'use client';
import { useState, useRef, useEffect } from 'react';

/* ─── 순위 색상 ─── */
function getRank(rank) {
  if (!rank) return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', badge: '미노출' };
  if (rank === 1)  return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', badge: '1위' };
  if (rank <= 3)   return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', badge: `${rank}위` };
  if (rank <= 10)  return { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', badge: `${rank}위` };
  if (rank <= 30)  return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', badge: `${rank}위` };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', badge: `${rank}위` };
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }); }
  catch { return d; }
}

function exportCSV(posts, results) {
  const rows = [['제목', '날짜', '순위', '링크']];
  posts.forEach(p => {
    const r = results[p.logNo];
    rows.push([p.title, formatDate(p.pubDate), r === undefined ? '확인중' : (r.found ? `${r.rank}위` : '미노출'), p.link]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'rank.csv'; a.click();
}

const LS = 'naver_api_v2';

export default function RankChecker() {
  const [tab, setTab] = useState('posts'); // posts | keyword
  const [blogId, setBlogId] = useState('');
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [posts, setPosts] = useState([]);
  const [results, setResults] = useState({});
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });

  // 키워드 랭커
  const [kwBlogId, setKwBlogId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [kwResults, setKwResults] = useState([]);
  const [kwLoading, setKwLoading] = useState(false);

  // API 설정
  const [showApi, setShowApi] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiReady, setApiReady] = useState(false);

  const abortRef = useRef(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || '{}');
      if (s.id && s.secret) { setClientId(s.id); setClientSecret(s.secret); setApiReady(true); }
    } catch {}
  }, []);

  const saveApi = () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    localStorage.setItem(LS, JSON.stringify({ id: clientId.trim(), secret: clientSecret.trim() }));
    setApiReady(true); setShowApi(false);
  };

  /* ── 글 순위 분석 ── */
  const handleStart = async () => {
    if (!blogId.trim()) { setError('블로그 ID를 입력하세요.'); return; }
    if (!clientId || !clientSecret) { setShowApi(true); return; }

    abortRef.current = false;
    setError(''); setPosts([]); setResults({});
    setPhase('fetching');
    setProgress({ current: 0, total: 0, label: '글 목록 수집 중...' });

    let fetched = [];
    try {
      const res = await fetch('/api/blog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: blogId.trim(), maxPosts: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetched = data.posts;
      setPosts(fetched);
    } catch (e) { setError(e.message); setPhase('idle'); return; }

    setPhase('ranking');
    setProgress({ current: 0, total: fetched.length, label: '' });

    for (let i = 0; i < fetched.length; i++) {
      if (abortRef.current) break;
      const post = fetched[i];
      setProgress({ current: i + 1, total: fetched.length, label: post.title.slice(0, 20) + '...' });

      try {
        const res = await fetch('/api/blog/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: post.title, // 제목 전체로 검색
            blogId: post.blogId,
            logNo: post.logNo,
            clientId, clientSecret,
          }),
        });
        const data = await res.json();
        setResults(prev => ({ ...prev, [post.logNo]: { rank: data.rank, found: data.found } }));
      } catch {
        setResults(prev => ({ ...prev, [post.logNo]: { rank: null, found: false } }));
      }
      await new Promise(r => setTimeout(r, 250));
    }
    setPhase('done');
  };

  /* ── 키워드 랭커 ── */
  const handleKeywordCheck = async () => {
    if (!kwBlogId.trim() || !keywords.trim()) return;
    if (!clientId || !clientSecret) { setShowApi(true); return; }

    setKwLoading(true);
    setKwResults([]);
    const kws = keywords.split('\n').map(k => k.trim()).filter(Boolean);

    const res = [];
    for (const kw of kws) {
      try {
        const r = await fetch('/api/blog/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: kwBlogId.trim(), clientId, clientSecret }),
        });
        const d = await r.json();
        res.push({ keyword: kw, rank: d.rank, found: d.found });
      } catch {
        res.push({ keyword: kw, rank: null, found: false });
      }
      setKwResults([...res]);
      await new Promise(r => setTimeout(r, 250));
    }
    setKwLoading(false);
  };

  const isRunning = phase === 'fetching' || phase === 'ranking';
  const isDone = phase === 'done';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const allVals = Object.values(results);
  const stats = {
    total: posts.length,
    top10: allVals.filter(r => r.found && r.rank <= 10).length,
    exposed: allVals.filter(r => r.found).length,
    hidden: allVals.filter(r => !r.found).length,
  };

  return (
    <div style={{
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', -apple-system, sans-serif",
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
      color: '#e2e8f0',
      padding: '0',
    }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; backdrop-filter: blur(10px); }
        .glow { box-shadow: 0 0 30px rgba(99,102,241,0.15); }
        .btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; color: #fff; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.4); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .input-field { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #e2e8f0; font-family: inherit; transition: border-color 0.2s; outline: none; }
        .input-field:focus { border-color: rgba(99,102,241,0.6); background: rgba(255,255,255,0.08); }
        .input-field::placeholder { color: rgba(255,255,255,0.25); }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .post-row { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; transition: all 0.2s; }
        .post-row:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .slide-in { animation: slideIn 0.3s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ─── 헤더 ─── */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 99, padding: '6px 18px', marginBottom: 16, fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            네이버 블로그 순위 분석
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1px', marginBottom: 8 }}>
            Blog Rank Checker
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
            블로그 전체 글 순위 자동 분석 · 키워드별 순위 확인
          </p>
        </div>

        {/* ─── API 설정 버튼 ─── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setShowApi(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: apiReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${apiReady ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: apiReady ? '#10b981' : '#f59e0b', cursor: 'pointer' }}>
            {apiReady ? '🔑 API 연결됨' : '⚙️ API 설정'}
          </button>
        </div>

        {/* ─── API 패널 ─── */}
        {showApi && (
          <div className="card glow slide-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>네이버 검색 API 키</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  <a href="https://developers.naver.com/apps/#/register" target="_blank" rel="noreferrer" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}>developers.naver.com</a>
                  {' '}→ 앱 등록 → 검색 API → Client ID/Secret
                </div>
              </div>
              <button onClick={() => setShowApi(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {[['Client ID', clientId, setClientId, 'text'], ['Client Secret', clientSecret, setClientSecret, 'password']].map(([label, val, setter, type]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
                  <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={label}
                    className="input-field" style={{ width: '100%', height: 40, padding: '0 12px', fontSize: 13, fontFamily: 'monospace' }} />
                </div>
              ))}
            </div>
            <button onClick={saveApi} disabled={!clientId || !clientSecret} className="btn-primary"
              style={{ width: '100%', height: 40, fontSize: 13 }}>
              저장
            </button>
          </div>
        )}

        {/* ─── 탭 ─── */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[['posts', '📊 글 순위 분석'], ['keyword', '🔍 키워드 랭커']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className="tab-btn"
              style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 14, fontWeight: 600, color: tab === v ? '#fff' : 'rgba(255,255,255,0.35)', background: tab === v ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'none', boxShadow: tab === v ? '0 2px 12px rgba(99,102,241,0.3)' : 'none' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ════════════════ 글 순위 분석 탭 ════════════════ */}
        {tab === 'posts' && (
          <>
            {!posts.length && (
              <div className="card" style={{ padding: '1.75rem' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600 }}>블로그 ID</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>blog.naver.com/</span>
                    <input type="text" value={blogId} onChange={e => setBlogId(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !isRunning && handleStart()}
                      placeholder="myblogid" className="input-field"
                      style={{ width: '100%', height: 48, paddingLeft: 130, paddingRight: 12, fontSize: 14 }} />
                  </div>
                  <button onClick={handleStart} disabled={isRunning} className="btn-primary"
                    style={{ height: 48, padding: '0 28px', fontSize: 14, whiteSpace: 'nowrap' }}>
                    분석 시작
                  </button>
                </div>
                {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>⚠️ {error}</div>}
              </div>
            )}

            {/* 진행률 */}
            {isRunning && (
              <div className="card slide-in" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    {phase === 'fetching' ? '📥 글 목록 수집 중...' : `🔍 ${progress.current}/${progress.total} · ${progress.label}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {phase === 'ranking' && <span style={{ fontSize: 13, fontWeight: 800, color: '#818cf8' }}>{pct}%</span>}
                    <button onClick={() => abortRef.current = true}
                      style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      중단
                    </button>
                  </div>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: phase === 'fetching' ? '15%' : `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)', borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}

            {/* 통계 */}
            {posts.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.25rem' }}>
                  {[
                    { label: '전체 글', value: stats.total, color: '#e2e8f0', icon: '📄' },
                    { label: 'TOP 10', value: stats.top10, color: '#10b981', icon: '🏆' },
                    { label: '노출', value: stats.exposed, color: '#6366f1', icon: '✅' },
                    { label: '미노출', value: stats.hidden, color: '#f87171', icon: '❌' },
                  ].map(s => (
                    <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    {isDone ? '✓ 분석 완료' : '분석 중...'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isDone && (
                      <button onClick={() => exportCSV(posts, results)}
                        style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>
                        📥 CSV
                      </button>
                    )}
                    <button onClick={() => { setPosts([]); setResults({}); setPhase('idle'); setBlogId(''); }}
                      style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                      초기화
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {posts.map((post, i) => {
                    const r = results[post.logNo];
                    const rs = r ? getRank(r.rank) : null;
                    const checking = isRunning && !r;
                    return (
                      <div key={post.logNo} className="post-row slide-in" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, animationDelay: `${i * 0.02}s` }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={post.link} target="_blank" rel="noreferrer"
                            style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {post.title}
                          </a>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2, display: 'block' }}>{formatDate(post.pubDate)}</span>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {checking ? (
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', animation: 'pulse 1.5s infinite' }}>확인 중</span>
                          ) : r ? (
                            <span style={{ fontSize: 13, fontWeight: 800, color: rs.color, background: rs.bg, padding: '4px 12px', borderRadius: 99, display: 'inline-block' }}>
                              {rs.badge}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.1)' }}>-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ════════════════ 키워드 랭커 탭 ════════════════ */}
        {tab === 'keyword' && (
          <div>
            <div className="card" style={{ padding: '1.75rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600 }}>블로그 ID</div>
                  <input type="text" value={kwBlogId} onChange={e => setKwBlogId(e.target.value)}
                    placeholder="myblogid" className="input-field"
                    style={{ width: '100%', height: 44, padding: '0 14px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600 }}>
                    검색 키워드 <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>(줄바꿈으로 여러 개 입력)</span>
                  </div>
                  <textarea value={keywords} onChange={e => setKeywords(e.target.value)}
                    placeholder={"원주 초밥 맛집\n강남 스시\n네이버 블로그 체험단"}
                    className="input-field"
                    style={{ width: '100%', height: 90, padding: '10px 14px', fontSize: 13, resize: 'none', lineHeight: 1.6 }} />
                </div>
              </div>
              <button onClick={handleKeywordCheck} disabled={kwLoading || !kwBlogId || !keywords}
                className="btn-primary" style={{ width: '100%', height: 44, fontSize: 14 }}>
                {kwLoading ? '확인 중...' : '🔍 순위 확인'}
              </button>
            </div>

            {kwResults.length > 0 && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                  키워드 순위 결과
                </div>
                {kwResults.map((r, i) => {
                  const rs = getRank(r.rank);
                  return (
                    <div key={i} className="slide-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', animationDelay: `${i * 0.05}s` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 700, minWidth: 18 }}>{i + 1}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{r.keyword}</span>
                      </div>
                      {r.rank === undefined ? (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', animation: 'pulse 1.5s infinite' }}>확인 중</span>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 800, color: rs.color, background: rs.bg, padding: '5px 16px', borderRadius: 99 }}>
                          {rs.badge}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!kwLoading && (
                  <div style={{ padding: '12px 20px', display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                    <span>TOP10 {kwResults.filter(r => r.found && r.rank <= 10).length}개</span>
                    <span>노출 {kwResults.filter(r => r.found).length}개</span>
                    <span>미노출 {kwResults.filter(r => !r.found).length}개</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.8 }}>
              💡 <strong style={{ color: 'rgba(255,255,255,0.5)' }}>활용 팁:</strong> 내 글에서 노출시키고 싶은 키워드를 입력해서 현재 순위를 확인하고, 
              경쟁이 낮은 키워드를 찾아 글 제목과 태그에 적용해보세요.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
