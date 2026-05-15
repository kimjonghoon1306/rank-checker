'use client';
import { useState, useRef, useEffect } from 'react';

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

function exportCSV(posts, rankResults) {
  const rows = [['제목', '날짜', '키워드', '순위', '링크']];
  posts.forEach(p => {
    (p.keywords || []).forEach(kw => {
      const r = rankResults[`${p.logNo}_${kw}`];
      rows.push([p.title, formatDate(p.pubDate), kw, r === undefined ? '확인중' : (r.found ? `${r.rank}위` : '미노출'), p.link]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'rank.csv'; a.click();
}

export default function RankChecker() {
  const [tab, setTab]           = useState('posts');
  const [blogId, setBlogId]     = useState('');
  const [phase, setPhase]       = useState('idle');
  const [error, setError]       = useState('');
  const [posts, setPosts]       = useState([]);
  const [rankResults, setRankResults] = useState({});
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });

  // 키워드 랭커
  const [kwBlogId, setKwBlogId]   = useState('');
  const [keywords, setKeywords]   = useState('');
  const [kwResults, setKwResults] = useState([]);
  const [kwLoading, setKwLoading] = useState(false);

  const abortRef = useRef(false);

  /* ── 글 순위 분석 ── */
  const handleStart = async () => {
    if (!blogId.trim()) { setError('블로그 ID를 입력하세요.'); return; }
    abortRef.current = false;
    setError(''); setPosts([]); setRankResults({});
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

    // 태그가 있는 글만 순위 체크
    const tasks = fetched.flatMap(p =>
      (p.keywords || []).map(kw => ({ post: p, kw }))
    );

    setPhase('ranking');
    setProgress({ current: 0, total: tasks.length, label: '' });

    for (let i = 0; i < tasks.length; i++) {
      if (abortRef.current) break;
      const { post, kw } = tasks[i];
      setProgress({ current: i + 1, total: tasks.length, label: `#${kw}` });

      try {
        const res = await fetch('/api/blog/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: post.blogId, logNo: post.logNo }),
        });
        const data = await res.json();
        if (data.needsApiKey) { setError('서버 API 키 설정이 필요합니다. Vercel 환경변수를 확인하세요.'); abortRef.current = true; break; }
        setRankResults(prev => ({ ...prev, [`${post.logNo}_${kw}`]: { rank: data.rank, found: data.found } }));
      } catch {
        setRankResults(prev => ({ ...prev, [`${post.logNo}_${kw}`]: { rank: null, found: false } }));
      }
      await new Promise(r => setTimeout(r, 250));
    }
    setPhase('done');
  };

  /* ── 키워드 랭커 ── */
  const handleKeywordCheck = async () => {
    if (!kwBlogId.trim() || !keywords.trim()) return;
    setKwLoading(true); setKwResults([]);
    const kws = keywords.split('\n').map(k => k.trim()).filter(Boolean);
    const res = [];
    for (const kw of kws) {
      try {
        const r = await fetch('/api/blog/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, blogId: kwBlogId.trim() }),
        });
        const d = await r.json();
        res.push({ keyword: kw, rank: d.rank, found: d.found });
      } catch { res.push({ keyword: kw, rank: null, found: false }); }
      setKwResults([...res]);
      await new Promise(r => setTimeout(r, 250));
    }
    setKwLoading(false);
  };

  const isRunning = phase === 'fetching' || phase === 'ranking';
  const isDone    = phase === 'done';
  const pct       = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const allVals   = Object.values(rankResults);
  const stats = {
    total:   posts.length,
    top10:   allVals.filter(r => r.found && r.rank <= 10).length,
    exposed: allVals.filter(r => r.found).length,
    hidden:  allVals.filter(r => !r.found).length,
  };

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif", minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', color: '#e2e8f0', padding: 0 }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0}
        .card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px}
        .btn{background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;border-radius:10px;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
        .btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(99,102,241,.4)}
        .btn:disabled{opacity:.35;cursor:not-allowed;transform:none}
        .inp{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#e2e8f0;font-family:inherit;outline:none;transition:border-color .2s}
        .inp:focus{border-color:rgba(99,102,241,.6);background:rgba(255,255,255,0.08)}
        .inp::placeholder{color:rgba(255,255,255,.2)}
        .row{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;transition:all .2s}
        .row:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,.1)}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .in{animation:in .3s ease forwards}
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 99, padding: '5px 16px', marginBottom: 16, fontSize: 11, color: '#a5b4fc', fontWeight: 600, letterSpacing: '.5px' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            NAVER BLOG RANK
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, background: 'linear-gradient(135deg,#fff 0%,#a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1.5px', marginBottom: 8 }}>
            순위 체커
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>해시태그 기반 자동 순위 분석 · 키워드별 순위 확인</p>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 4, marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,.06)' }}>
          {[['posts','📊 글 순위 분석'],['keyword','🔍 키워드 랭커']].map(([v,l]) => (
            <button key={v} onClick={() => setTab(v)}
              style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: tab===v ? '#fff' : 'rgba(255,255,255,.35)', background: tab===v ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'none', boxShadow: tab===v ? '0 2px 12px rgba(99,102,241,.3)' : 'none', transition: 'all .2s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── 글 순위 분석 ── */}
        {tab === 'posts' && (
          <>
            {!posts.length && (
              <div className="card" style={{ padding: '1.75rem' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 8, fontWeight: 700, letterSpacing: '.5px' }}>블로그 ID</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,.2)', pointerEvents: 'none' }}>blog.naver.com/</span>
                    <input type="text" value={blogId} onChange={e => setBlogId(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !isRunning && handleStart()}
                      placeholder="myblogid" className="inp"
                      style={{ width: '100%', height: 48, paddingLeft: 128, paddingRight: 12, fontSize: 14 }} />
                  </div>
                  <button onClick={handleStart} disabled={isRunning} className="btn"
                    style={{ height: 48, padding: '0 28px', fontSize: 14 }}>
                    분석 시작
                  </button>
                </div>
                {error && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: 13, color: '#f87171' }}>
                    ⚠️ {error}
                  </div>
                )}
                <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,.25)', lineHeight: 1.7 }}>
                  💡 블로그의 해시태그를 키워드로 자동 순위 확인합니다
                </div>
              </div>
            )}

            {/* 진행률 */}
            {isRunning && (
              <div className="card in" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>
                    {phase === 'fetching' ? '📥 글 목록 수집 중...' : `🔍 ${progress.current}/${progress.total} · ${progress.label}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {phase === 'ranking' && <span style={{ fontSize: 13, fontWeight: 800, color: '#818cf8' }}>{pct}%</span>}
                    <button onClick={() => abortRef.current = true}
                      style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      중단
                    </button>
                  </div>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: phase==='fetching' ? '15%' : `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)', borderRadius: 99, transition: 'width .4s ease' }} />
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
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontWeight: 600 }}>
                    {isDone ? '✓ 분석 완료' : '분석 중...'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isDone && (
                      <button onClick={() => exportCSV(posts, rankResults)}
                        style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                        📥 CSV
                      </button>
                    )}
                    <button onClick={() => { setPosts([]); setRankResults({}); setPhase('idle'); setBlogId(''); setError(''); }}
                      style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', background: 'none', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      초기화
                    </button>
                  </div>
                </div>

                {/* 글 목록 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {posts.map((post, pi) => {
                    const postRanks = (post.keywords || []).map(kw => rankResults[`${post.logNo}_${kw}`]);
                    const bestRank = postRanks.filter(r => r?.found).map(r => r.rank).sort((a,b) => a-b)[0];
                    const checking = isRunning && postRanks.some(r => r === undefined);

                    return (
                      <div key={post.logNo} className="row in" style={{ padding: '14px 18px', animationDelay: `${pi * 0.02}s` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: post.keywords?.length ? 10 : 0 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', fontWeight: 700, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{pi+1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={post.link} target="_blank" rel="noreferrer"
                              style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {post.title}
                            </a>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', marginTop: 2, display: 'block' }}>{formatDate(post.pubDate)}</span>
                          </div>
                          {bestRank && (
                            <span style={{ fontSize: 12, fontWeight: 800, color: getRank(bestRank).color, background: getRank(bestRank).bg, padding: '3px 10px', borderRadius: 99, flexShrink: 0 }}>
                              최고 {bestRank}위
                            </span>
                          )}
                        </div>

                        {/* 태그 키워드 칩 */}
                        {post.keywords?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 32 }}>
                            {post.keywords.map(kw => {
                              const r = rankResults[`${post.logNo}_${kw}`];
                              const rs = r ? getRank(r.rank) : null;
                              const ck = isRunning && r === undefined;
                              return (
                                <span key={kw} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, fontWeight: 600, border: `1px solid ${rs ? rs.color + '40' : 'rgba(255,255,255,.08)'}`, background: rs ? rs.bg : 'rgba(255,255,255,.04)', color: rs ? rs.color : ck ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.4)', animation: ck ? 'pulse 1.5s infinite' : 'none' }}>
                                  #{kw}{rs ? ` · ${rs.badge}` : ck ? ' ···' : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {!post.keywords?.length && (
                          <div style={{ paddingLeft: 32, fontSize: 12, color: 'rgba(255,255,255,.2)' }}>태그 없음</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── 키워드 랭커 ── */}
        {tab === 'keyword' && (
          <>
            <div className="card" style={{ padding: '1.75rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 8, fontWeight: 700, letterSpacing: '.5px' }}>블로그 ID</div>
                  <input type="text" value={kwBlogId} onChange={e => setKwBlogId(e.target.value)}
                    placeholder="myblogid" className="inp"
                    style={{ width: '100%', height: 44, padding: '0 14px', fontSize: 14 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 8, fontWeight: 700, letterSpacing: '.5px' }}>
                    키워드 <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 11, fontWeight: 400 }}>줄바꿈으로 여러 개</span>
                  </div>
                  <textarea value={keywords} onChange={e => setKeywords(e.target.value)}
                    placeholder={"원주 초밥 맛집\n강남 스시\n네이버 블로그 체험단"}
                    className="inp"
                    style={{ width: '100%', height: 88, padding: '10px 14px', fontSize: 13, resize: 'none', lineHeight: 1.7 }} />
                </div>
              </div>
              <button onClick={handleKeywordCheck} disabled={kwLoading || !kwBlogId || !keywords}
                className="btn" style={{ width: '100%', height: 44, fontSize: 14 }}>
                {kwLoading ? '확인 중...' : '🔍 순위 확인'}
              </button>
            </div>

            {kwResults.length > 0 && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.4)', letterSpacing: '.5px' }}>
                  결과 · {kwResults.length}개 키워드
                </div>
                {kwResults.map((r, i) => {
                  const rs = getRank(r.rank);
                  return (
                    <div key={i} className="in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.04)', animationDelay: `${i * 0.05}s` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', fontWeight: 700, minWidth: 18 }}>{i+1}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{r.keyword}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: rs.color, background: rs.bg, padding: '4px 14px', borderRadius: 99 }}>
                        {rs.badge}
                      </span>
                    </div>
                  );
                })}
                {!kwLoading && (
                  <div style={{ padding: '12px 20px', display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,.25)' }}>
                    <span>🏆 TOP10 {kwResults.filter(r => r.found && r.rank <= 10).length}개</span>
                    <span>✅ 노출 {kwResults.filter(r => r.found).length}개</span>
                    <span>❌ 미노출 {kwResults.filter(r => !r.found).length}개</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,.3)', lineHeight: 1.8 }}>
              💡 노리는 키워드를 입력해서 현재 순위를 확인하고, 글 제목과 태그에 반영해보세요.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
