'use client';
import { useState } from 'react';

const RANK_COLOR = (rank) => {
  if (!rank) return { bg: '#f3f4f6', text: '#6b7280', label: '미노출' };
  if (rank === 1) return { bg: '#fef9c3', text: '#854d0e', label: `${rank}위` };
  if (rank <= 3) return { bg: '#dcfce7', text: '#166534', label: `${rank}위` };
  if (rank <= 10) return { bg: '#dbeafe', text: '#1e40af', label: `${rank}위` };
  return { bg: '#f3f4f6', text: '#374151', label: `${rank}위` };
};

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function RankChecker() {
  const [naverId, setNaverId] = useState('');
  const [naverPw, setNaverPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [blogData, setBlogData] = useState(null);
  const [rankResults, setRankResults] = useState({});
  const [checkingRank, setCheckingRank] = useState({});

  const handleLogin = async () => {
    if (!naverId.trim() || !naverPw.trim()) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    setError('');
    setBlogData(null);
    setRankResults({});

    try {
      setLoadingMsg('네이버 로그인 중...');
      await new Promise(r => setTimeout(r, 400));
      setLoadingMsg('블로그 ID 확인 중...');

      const res = await fetch('/api/naver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId, naverPw }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '로그인 실패');

      setLoadingMsg('블로그 글 목록 수집 중...');
      setBlogData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const checkRank = async (post, keyword) => {
    const key = `${post.logNo}_${keyword}`;
    setCheckingRank(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/naver/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, blogId: blogData.blogId, logNo: post.logNo }),
      });
      const data = await res.json();
      setRankResults(prev => ({ ...prev, [key]: { rank: data.rank, found: data.found } }));
    } catch {
      setRankResults(prev => ({ ...prev, [key]: { rank: null, found: false } }));
    } finally {
      setCheckingRank(prev => ({ ...prev, [key]: false }));
    }
  };

  const checkAllRanks = async (post) => {
    if (!post.keywords?.length) return;
    for (const kw of post.keywords) {
      await checkRank(post, kw);
      await new Promise(r => setTimeout(r, 800));
    }
  };

  const stats = blogData ? {
    total: blogData.totalPosts,
    withTags: blogData.posts.filter(p => p.keywords?.length > 0).length,
    exposed: Object.values(rankResults).filter(r => r.found).length,
    notExposed: Object.values(rankResults).filter(r => r.rank === null && r.found === false).length,
  } : null;

  return (
    <div style={{ fontFamily: 'Pretendard, -apple-system, sans-serif', maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 4 }}>
          네이버 블로그 노출 순위 체커
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          네이버 아이디로 로그인하면 블로그 ID가 달라도 자동으로 글을 가져와 키워드 순위를 확인합니다.
        </p>
      </div>

      {!blogData && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
          padding: '1.5rem', marginBottom: '1.5rem',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 5 }}>
                네이버 아이디
              </label>
              <input
                type="text"
                placeholder="네이버 아이디"
                value={naverId}
                onChange={e => setNaverId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{
                  width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 8,
                  padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 5 }}>
                네이버 비밀번호
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="비밀번호"
                  value={naverPw}
                  onChange={e => setNaverPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  style={{
                    width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 8,
                    padding: '0 40px 0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                  title={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', height: 42,
              background: loading ? '#86efac' : '#03c75a',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? `⏳ ${loadingMsg}` : '로그인 후 블로그 글 불러오기'}
          </button>

          {error && (
            <div style={{
              marginTop: 10, padding: '10px 12px', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626',
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{
            marginTop: 12, padding: '10px 12px', background: '#f0fdf4',
            borderRadius: 8, fontSize: 12, color: '#166534',
          }}>
            🔒 입력하신 정보는 서버에 저장되지 않으며, 순위 확인 용도로만 사용됩니다.
          </div>
        </div>
      )}

      {blogData && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            padding: '12px 16px', marginBottom: '1rem',
          }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>
                ✅ {blogData.naverId} 로그인 완료
              </span>
              <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 10 }}>
                블로그 ID: <strong style={{ color: '#111' }}>{blogData.blogId}</strong>
              </span>
            </div>
            <button
              onClick={() => { setBlogData(null); setNaverPw(''); setRankResults({}); }}
              style={{
                fontSize: 13, color: '#6b7280', background: 'none',
                border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
              }}
            >
              로그아웃
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
            {[
              { label: '전체 글', value: stats.total, color: '#111' },
              { label: '태그 있는 글', value: stats.withTags, color: '#185FA5' },
              { label: '노출 확인', value: stats.exposed, color: '#16a34a' },
              { label: '미노출', value: stats.notExposed, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} style={{
                background: '#f9fafb', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blogData.posts.map((post, pi) => (
              <div key={post.logNo} style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: post.keywords?.length ? '1px solid #f3f4f6' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11, background: '#e0f2fe', color: '#0369a1',
                        padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                      }}>{pi + 1}</span>
                      <a
                        href={post.link} target="_blank" rel="noreferrer"
                        style={{ fontSize: 15, fontWeight: 600, color: '#111', textDecoration: 'none' }}
                      >
                        {post.title}
                      </a>
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {post.pubDate ? new Date(post.pubDate).toLocaleDateString('ko-KR') : '날짜 미상'}
                    </div>
                  </div>
                  {post.keywords?.length > 0 && (
                    <button
                      onClick={() => checkAllRanks(post)}
                      style={{
                        fontSize: 12, color: '#fff', background: '#6366f1',
                        border: 'none', borderRadius: 6, padding: '5px 12px',
                        cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 10,
                      }}
                    >
                      전체 순위 확인
                    </button>
                  )}
                </div>

                {post.keywords?.length > 0 ? (
                  <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {post.keywords.map(kw => {
                      const key = `${post.logNo}_${kw}`;
                      const result = rankResults[key];
                      const isChecking = checkingRank[key];
                      const color = result ? RANK_COLOR(result.rank) : null;
                      return (
                        <div
                          key={kw}
                          onClick={() => !isChecking && checkRank(post, kw)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 99, cursor: 'pointer',
                            border: '1px solid #e5e7eb',
                            background: result ? color.bg : '#f9fafb',
                            transition: 'all 0.2s',
                          }}
                        >
                          <span style={{ fontSize: 13, color: result ? color.text : '#374151' }}>
                            #{kw}
                          </span>
                          {isChecking ? (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>확인 중...</span>
                          ) : result ? (
                            <span style={{
                              fontSize: 12, fontWeight: 700, color: color.text,
                              background: 'rgba(255,255,255,0.6)', padding: '1px 6px', borderRadius: 99,
                            }}>
                              {color.label}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>클릭</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '10px 16px', fontSize: 13, color: '#9ca3af' }}>
                    태그 없음 — 키워드 순위 확인 불가
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
