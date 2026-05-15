const axios = require('axios');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function extractLogNo(url) {
  const m = url.match(/\/(\d{8,})/);
  return m ? m[1] : null;
}

async function fetchPostsByRSS(blogId, maxPosts = 50) {
  const posts = [];

  try {
    const res = await axios.get(`https://rss.blog.naver.com/${blogId}.xml`, {
      headers: BASE_HEADERS, timeout: 12000,
    });
    const $ = cheerio.load(res.data, { xmlMode: true });
    $('item').each((i, el) => {
      if (i >= maxPosts) return false;
      const title   = $(el).find('title').text().trim();
      const link    = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      const desc    = $(el).find('description').text()
        .replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 300);
      const logNo   = extractLogNo(link);
      if (title && logNo) posts.push({ title, link, pubDate, description: desc, logNo, blogId, keywords: [] });
    });
  } catch (e) { console.error('[RSS]', e.message); }

  if (posts.length < 5) {
    try {
      for (let page = 1; page <= Math.ceil(maxPosts / 30); page++) {
        const res = await axios.get('https://blog.naver.com/PostTitleListAsync.nhn', {
          params: { blogId, currentPage: page, countPerPage: 30, postListType: 'POST', categoryNo: 0 },
          headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` },
          timeout: 10000,
        });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const list = data.postList || [];
        if (!list.length) break;
        list.forEach(p => {
          const logNo = String(p.logNo);
          if (!posts.find(x => x.logNo === logNo))
            posts.push({ title: p.titleWithInspectMessage || p.title || '제목 없음',
              link: `https://blog.naver.com/${blogId}/${logNo}`, pubDate: p.addDate || '',
              description: '', logNo, blogId, keywords: [] });
        });
        if (posts.length >= maxPosts) break;
      }
    } catch (e) { console.error('[PostTitleList]', e.message); }
  }

  return posts.slice(0, maxPosts);
}

const UI_BLACKLIST = new Set([
  '취소','확인','닫기','저장','삭제','수정','공유','신고','댓글','이웃','구독',
  '더보기','이전','다음','홈','목록','검색','로그인','로그아웃','설정','공감','스크랩','복사','인쇄','글쓰기',
  'cancel','confirm','close','save','delete','edit','share','report',
]);

function parseTags($) {
  const SELECTORS = [
    '.se-tags .se-tag', '.se-tags a', '.se-tagitem', '.se-tag-item',
    '.post_tag a', '.tag_area a', '.__naverBlog_tag a', '.blog_tag a', '.hash_tag a',
    '[class*="tagitem"]', '[class*="tag_item"]',
  ];
  const tags = [];
  for (const sel of SELECTORS) {
    $(sel).each((_, el) => {
      const raw = $(el).text().replace(/^#/, '').replace(/\s+/g, '').trim();
      if (raw && raw.length >= 2 && raw.length <= 20 &&
          !UI_BLACKLIST.has(raw) && /[가-힣a-zA-Z0-9]/.test(raw) && !tags.includes(raw))
        tags.push(raw);
    });
    if (tags.length > 0) break;
  }
  return tags;
}

async function fetchPostTags(blogId, logNo) {
  const attempts = [
    { url: `https://m.blog.naver.com/${blogId}/${logNo}`, headers: MOBILE_HEADERS },
    { url: `https://blog.naver.com/PostView.nhn?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`,
      headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } },
    { url: `https://blog.naver.com/${blogId}/${logNo}`,
      headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } },
  ];

  for (const { url, headers } of attempts) {
    try {
      const res = await axios.get(url, { headers, timeout: 8000 });
      const tags = parseTags(cheerio.load(res.data));
      if (tags.length > 0) return tags.slice(0, 10);
    } catch {}
  }
  return [];
}

async function checkKeywordRankWithAPI(keyword, blogId, logNo, clientId, clientSecret) {
  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
      params: { query: keyword, display: 100, start: 1, sort: 'sim' },
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret, 'Accept': 'application/json' },
      timeout: 10000,
    });

    const items = res.data.items || [];
    for (let i = 0; i < items.length; i++) {
      const bloggerlink = (items[i].bloggerlink || '').toLowerCase();
      const link = (items[i].link || '').toLowerCase();
      const isSameBlog = bloggerlink.includes(blogId.toLowerCase()) || link.includes(`blog.naver.com/${blogId.toLowerCase()}`);
      const isSamePost = logNo ? link.includes(logNo) : isSameBlog;
      if (isSameBlog && isSamePost) return { rank: i + 1, found: true, totalChecked: items.length };
    }
    return { rank: null, found: false, totalChecked: items.length };

  } catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403)
      throw new Error('네이버 API 인증 실패: Client ID / Secret을 확인하세요.');
    if (e.response?.status === 429)
      throw new Error('네이버 API 호출 한도 초과 (25,000회/일). 내일 다시 시도하세요.');
    throw new Error(`API 오류: ${e.message}`);
  }
}

module.exports = { fetchPostsByRSS, fetchPostTags, checkKeywordRankWithAPI };
