import { checkKeywordRank } from '../../../lib/naverBlog';

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { keyword, blogId, logNo } = req.body;
  if (!keyword || !blogId) return res.status(400).json({ error: 'keyword, blogId 필수' });

  try {
    const result = await checkKeywordRank(keyword, blogId, logNo);
    return res.status(200).json({ success: true, keyword, blogId, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
