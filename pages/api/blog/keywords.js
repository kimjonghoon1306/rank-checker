export const config = { api: { responseLimit: false }, maxDuration: 10 };

function extractFromTitle(title) {
  return title
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 15)
    .slice(0, 5);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'title이 필요합니다.' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ success: true, keywords: extractFromTitle(title), fallback: true });
  }

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
          content: `네이버 블로그 글 제목을 보고 사람들이 실제로 네이버에서 검색할 핵심 키워드 3~5개 추출.

제목: ${title}
${description ? `내용: ${description.slice(0, 200)}` : ''}

규칙: 2~6글자 구체적 키워드. JSON 배열만 반환: ["키워드1","키워드2","키워드3"]`,
        }],
      }),
    });

    const data = await response.json();
    const text = (data.content?.[0]?.text || '[]').replace(/```[a-z]*|```/g, '').trim();
    const keywords = JSON.parse(text);
    return res.status(200).json({ success: true, keywords: keywords.slice(0, 5) });
  } catch {
    return res.status(200).json({ success: true, keywords: extractFromTitle(title), fallback: true });
  }
}
