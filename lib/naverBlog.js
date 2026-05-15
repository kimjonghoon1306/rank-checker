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

function isValidTag(raw) {
  if (!raw || raw.length < 2 || raw.length > 20) return false;
  if (UI_BLACKLIST.has(raw)) return false;
  if (!/[가-힣a-zA-Z]/.test(raw)) return false;          // 한글 또는 영문 반드시 포함

  // CSS 16진수 색상코드 제거 (#585858, #f7f7f7, #1c1c1c 등)
  if (/^[0-9a-fA-F]{3,8}$/.test(raw)) return false;

  // 짧은 영숫자 조합 (ct, 034, x27 등 템플릿 자동 태그)
  if (raw.length <= 4 && !/[가-힣]/.test(raw)) return false;

  // postlist, postview 등 Naver 내부 UI 태그
  const SYSTEM_TAGS = new Set(['postlist','postview','blogpost','naverblog','naver','blog','post','list','view','tag']);
  if (SYSTEM_TAGS.has(raw.toLowerCase())) return false;

  return true;
}

// CSS 셀렉터로 태그 파싱
function parseTags($) {
  const SELECTORS = [
    // 스마트에디터 ONE
    '.se-tags .se-tag', '.se-tags a', '.se-tagitem', '.se-tag-item',
    // 구 에디터
    '.post_tag a', '.tag_area a', '.__naverBlog_tag a', '.blog_tag a', '.hash_tag a',
    // 범용
    '[class*="tagitem"]', '[class*="tag_item"]', '[class*="tag-item"]',
    '[class*="PostTag"] a', '[class*="post_tag"] a',
    // 데이터 속성
    '[data-tag]',
  ];
  const tags = [];
  for (const sel of SELECTORS) {
    try {
      $(sel).each((_, el) => {
        const raw = ($(el).attr('data-tag') || $(el).text())
          .replace(/^#/, '').replace(/\s+/g, ' ').trim();
        if (isValidTag(raw) && !tags.includes(raw)) tags.push(raw);
      });
    } catch {}
    if (tags.length > 0) break;
  }
  return tags;
}

// HTML 원문에서 JSON 기반 태그 추출 (CSS 클래스명 오인 방지)
function parseTagsFromRaw(html) {
  const tags = [];

  // <style>, <script> 블록 먼저 제거 → CSS 셀렉터 오염 차단
  const stripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // "tagList":["태그1","태그2"] 패턴 (Naver API 응답 구조)
  const jsonMatch = stripped.match(/"tagList"\s*:\s*\[([^\]]+)\]/);
  if (jsonMatch) {
    const items = jsonMatch[1].match(/"([^"]{2,20})"/g) || [];
    items.forEach(s => {
      const raw = s.replace(/"/g, '').trim();
      if (isValidTag(raw) && !tags.includes(raw)) tags.push(raw);
    });
    if (tags.length) return tags.slice(0, 10);
  }

  // "tag":"값" 단일 패턴
  const tagMatches = stripped.match(/"tag"\s*:\s*"([^"]{2,20})"/g) || [];
  tagMatches.forEach(m => {
    const raw = m.match(/"tag"\s*:\s*"([^"]+)"/)?.[1]?.trim();
    if (raw && isValidTag(raw) && !tags.includes(raw)) tags.push(raw);
  });

  // ⚠️ #해시태그 직접 regex는 CSS 클래스명과 구분 불가 → 사용하지 않음

  return tags.slice(0, 10);
}

async function fetchPostTags(blogId, logNo) {
  const attempts = [
    // 1순위: 모바일 (서버사이드 렌더링, 태그 잘 노출됨)
    { url: `https://m.blog.naver.com/${blogId}/${logNo}`, headers: MOBILE_HEADERS },
    // 2순위: PostView.naver (최신 파라미터)
    { url: `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&isHttpsRedirect=true`,
      headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } },
    // 3순위: PostView.nhn (구 파라미터)
    { url: `https://blog.naver.com/PostView.nhn?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`,
      headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } },
    // 4순위: 직접 URL
    { url: `https://blog.naver.com/${blogId}/${logNo}`,
      headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } },
  ];

  for (const { url, headers } of attempts) {
    try {
      const res = await axios.get(url, { headers, timeout: 8000 });
      const html = res.data;

      // CSS 셀렉터로 먼저 시도
      const tags = parseTags(cheerio.load(html));
      if (tags.length > 0) return tags.slice(0, 10);

      // 실패하면 정규식 fallback
      const rawTags = parseTagsFromRaw(html);
      if (rawTags.length > 0) return rawTags.slice(0, 10);
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
