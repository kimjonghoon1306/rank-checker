import { fetchPostsByRSS, fetchPostTags } from '../../../lib/naverBlog';

export const config = { api: { responseLimit: false }, maxDuration: 60 };

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

    // 태그 수집 (상위 20개, 순차 딜레이)
    const tagLimit = Math.min(posts.length, 20);
    const withTags = await Promise.all(
      posts.slice(0, tagLimit).map(async (post, idx) => {
        await new Promise(r => setTimeout(r, idx * 120));
        const keywords = await fetchPostTags(id, post.logNo);
        return { ...post, keywords };
      })
    );

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
