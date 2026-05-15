import { fetchPostsByRSS, fetchPostTags } from '../../../lib/naverBlog';

export const config = { api: { responseLimit: false }, maxDuration: 60 };

// 제목에서 키워드 추출 (AI 없을 때 fallback)
// 제목 자체가 검색어 → 3단어/2단어 의미 구문 단위로 추출
function extractFromTitle(title) {
  const stopWords = new Set([
    '그리고','하지만','또는','때문에','그래서','하는','있는','없는','되는','하기',
    '위한','대한','통한','관한','이후','이전','다음','처럼','보다','까지','부터',
    '완벽한','완벽','가이드','정리','소개','총정리','모음','알아보기','알아보자',
    '해보자','입니다','합니다','됩니다','이란','것은','것을','것이',
    '달라지는','바뀌는','새로운','최신','핵심','중요한',
  ]);

  const clean = title
    .replace(/[!！?？,，.。~:：「」【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const words = clean.split(' ').filter(w => w.length >= 2 && !stopWords.has(w));
  const keywords = [];

  // 3단어 조합 우선 (네이버 검색 구문으로 자연스러움)
  for (let i = 0; i < words.length - 2 && keywords.length < 2; i++) {
    const combo = `${words[i]} ${words[i+1]} ${words[i+2]}`;
    if (combo.length <= 20) keywords.push(combo);
  }

  // 2단어 조합으로 보완
  for (let i = 0; i < words.length - 1 && keywords.length < 3; i++) {
    const combo = `${words[i]} ${words[i+1]}`;
    if (combo.length <= 14 && !keywords.some(k => k.includes(combo))) keywords.push(combo);
  }

  return [...new Set(keywords)].slice(0, 3);
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
          content: `네이버 블로그 글 제목을 보고, 사람들이 네이버 검색창에 실제로 입력할 검색어 3개를 추출해.

제목: ${title}
${description ? `내용: ${description.slice(0, 200)}` : ''}

규칙:
- 2~4단어로 구성된 검색 구문 (예: "실업급여 신청 조건", "강남 점심 맛집", "블로그 체험단 신청")
- 제목에서 핵심 주제를 가장 잘 담은 구문 우선
- 단독 단어 1개는 절대 안됨 (예: "맛집" X → "강남 맛집" O)
- 지역명+업종, 제품명+후기, 주제+방법 같은 조합
- JSON 배열만 반환, 다른 텍스트 금지: ["검색어1","검색어2","검색어3"]`,
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

    // 태그 수집 (상위 20개 - HTTP 요청 제한)
    const tagLimit = Math.min(posts.length, 20);
    const withTags = await Promise.all(
      posts.slice(0, tagLimit).map(async (post, idx) => {
        await new Promise(r => setTimeout(r, idx * 120));
        const keywords = await fetchPostTags(id, post.logNo);
        return { ...post, keywords, keywordSource: keywords.length ? 'tag' : null };
      })
    );

    // 21번 이후 글은 태그 수집 생략 → keywords 빈 배열로 초기화
    const remaining = posts.slice(tagLimit).map(p => ({ ...p, keywords: [], keywordSource: null }));

    // 전체 글 합치기
    const allPosts = [...withTags, ...remaining];

    // 태그 없는 글 전체 → AI 키워드 추출 (배치, 동시 5개)
    const noTagPosts = allPosts.filter(p => !p.keywords.length);
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
      posts: allPosts,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
