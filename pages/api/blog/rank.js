import { checkKeywordRankWithAPI } from '../../../lib/naverBlog';

export const config = { api: { responseLimit: false }, maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { keyword, blogId, logNo, clientId, clientSecret } = req.body;

  if (!keyword || !blogId) {
    return res.status(400).json({ error: 'keyword, blogId가 필요합니다.' });
  }

  // 환경변수 우선, 없으면 프론트에서 받은 값 사용
  const id     = process.env.NAVER_CLIENT_ID     || clientId;
  const secret = process.env.NAVER_CLIENT_SECRET || clientSecret;

  if (!id || !secret) {
    return res.status(400).json({
      error: '네이버 API 키가 없습니다. 설정 패널에서 Client ID / Secret을 입력하세요.',
      needsApiKey: true,
    });
  }

  try {
    const result = await checkKeywordRankWithAPI(keyword.trim(), blogId.trim(), logNo?.trim(), id, secret);
    return res.status(200).json({ success: true, keyword, blogId, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
