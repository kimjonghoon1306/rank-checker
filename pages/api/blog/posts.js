import { fetchPostsByRSS, fetchPostTags } from '../../../lib/naverBlog';

export const config = { api: { responseLimit: false }, maxDuration: 60 };

// 제목에서 키워드 추출 (AI 없을 때 fallback)
// 단어 1개씩 쪼개면 너무 일반적 → 2단어 조합으로 실제 검색어에 가깝게
function extractFromTitle(title) {
  const stopWords = new Set([
    '그리고','하지만','또는','때문에','그래서','하는','있는','없는','되는','하기',
    '위한','대한','통한','관한','이후','이전','다음','처럼','보다','까지',
    '완벽','가이드','방법','정리','추천','소개','총정리','모음','리스트','후기','리뷰',
  ]);

  const words = title
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));

  const combos = [];

  // 2단어 인접 조합 (실제 사람들이 검색하는 패턴)
  for (let i = 0; i < words.length - 1 && combos.length < 3; i++) {
    const a = words[i], b = words[i + 1];
    const combo = `${a} ${b}`;
    if (combo.length <= 16 && a.length >= 2 && b.length >= 2) {
      combos.push(combo);
    }
  }

  // 2단어 조합이 부족하면 긴 단어 단독으로 보완
  if (combos.length < 2) {
    words
      .filter(w => w.length >= 4)
      .slice(0, 3)
      .forEach(w => { if (!combos.includes(w)) combos.push(w); });
  }

  return [...new Set(combos)].slice(0, 3);
}

// Claude AI로 키워드 추출
async function extractKeywordsWithAI(title, description) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-20240307',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `네이버 블로그 글 제목을 보고 사람들이 실제로 네이버에서 검색할 핵심 키워드 3~4개 추출.

제목: ${title}
${description ? `내용 일부: ${description.slice(0, 150)}` : ''}

규칙:
- 2~6글자 구체적 키워드
- 지역명+업종 조합 OK (예: 강남맛집, 부산카페)
- 제품명, 브랜드명 포함
- JSON 배열만 반환 (다른 텍스트 절대 금지): ["키워드1","키워드2","키워드3"]`,
        }],
      }),
    });
    const data = await response.json();
    const text = (data.content?.[0]?.text || '[]').replace(/```[a-z]*|```/g, '').trim();
    const keywords = JSON.parse(text);
    return Array.isArray(keywords) ? keywords.slice(0, 4) : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { blogId, maxPosts = 50 } = req.body;
  if (!blogId) return res.status(400).json({ error: 'blogId가 필요합니다.' });

  const id = blogId.trim().toLowerCase();

  try {
    const posts = await fetchPostsByRSS(id, Math.min(Number(maxPosts), 100));

    if (!posts.length) {
      return res.status(404).json({
        error: `"${id}" 블로그의 글을 찾을 수 없습니다.\n블로그 ID를 확인하거나, RSS 공개 설정을 확인하세요.\n(블로그 설정 → 기본설정 → RSS 허용)`,
      });
    }

    // 태그 수집 (상위 20개)
    const tagLimit = Math.min(posts.length, 20);
    const withTags = await Promise.all(
      posts.slice(0, tagLimit).map(async (post, idx) => {
        await new Promise(r => setTimeout(r, idx * 120));
        const keywords = await fetchPostTags(id, post.logNo);
        return { ...post, keywords, keywordSource: keywords.length ? 'tag' : null };
      })
    );

    // 태그 없는 글 → AI 키워드 추출 (배치, 동시 5개)
    const noTagPosts = withTags.filter(p => !p.keywords.length);
    if (noTagPosts.length > 0) {
      const BATCH = 5;
      for (let i = 0; i < noTagPosts.length; i += BATCH) {
        const batch = noTagPosts.slice(i, i + BATCH);
        await Promise.all(batch.map(async (post, bIdx) => {
          await new Promise(r => setTimeout(r, bIdx * 80));
          const aiKws = await extractKeywordsWithAI(post.title, post.description);
          if (aiKws && aiKws.length) {
            post.keywords = aiKws;
            post.keywordSource = 'ai';
          } else {
            // 최종 fallback: 제목 파싱
            post.keywords = extractFromTitle(post.title);
            post.keywordSource = 'title';
          }
        }));
      }
    }

    return res.status(200).json({
      success: true,
      blogId: id,
      totalPosts: posts.length,
      posts: [...withTags, ...posts.slice(tagLimit)],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
