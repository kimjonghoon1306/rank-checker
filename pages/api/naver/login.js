import { naverLogin } from '../../../lib/naverAuth';
import { fetchPosts, fetchPostTags } from '../../../lib/naverBlog';

// Vercel 서버리스 함수 타임아웃 연장
export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { naverId, naverPw } = req.body;
  if (!naverId || !naverPw) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });

  try {
    // 1) 네이버 로그인 + 블로그 ID 자동 확인
    const { client, blogId } = await naverLogin(naverId, naverPw);

    // 2) 블로그 글 목록 수집
    const posts = await fetchPosts(client, blogId, 20);

    // 3) 각 글의 태그(키워드) 수집 (최대 10개 글만)
    const postsWithTags = await Promise.all(
      posts.slice(0, 10).map(async (post) => {
        const tags = await fetchPostTags(client, blogId, post.logNo);
        return { ...post, keywords: tags };
      })
    );

    return res.status(200).json({
      success: true,
      blogId,
      naverId,
      totalPosts: posts.length,
      posts: postsWithTags,
    });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(401).json({
      error: error.message || '로그인에 실패했습니다. 아이디/비밀번호를 확인하세요.',
    });
  }
}
