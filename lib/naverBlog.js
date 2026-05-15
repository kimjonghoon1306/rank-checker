const axios = require('axios');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function extractLogNo(url) {
  // blog.naver.com/id/123456789 또는 naver.me/... 형태 처리
  const m = url.match(/\/(\d{8,})/);
  return m ? m[1] : null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 블로그 글 목록 수집 (로그인 불필요 - 공개 RSS)
 */
async function fetchPostsByRSS(blogId, maxPosts = 50) {
  const posts = [];

  // 방법 1: RSS
  try {
    const res = await axios.get(`https://rss.blog.naver.com/${blogId}.xml`, {
      headers: BASE_HEADERS,
      timeout: 12000,
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

      if (title && logNo) {
        posts.push({ title, link, pubDate, description: desc, logNo, blogId, keywords: [] });
      }
    });
  } catch (e) {
    console.error('[RSS] Error:', e.message);
  }

  // 방법 2: PostTitleListAsync API (RSS 실패/보완)
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
          if (!posts.find(x => x.logNo === logNo)) {
            posts.push({
              title: p.titleWithInspectMessage || p.title || '제목 없음',
              link: `https://blog.naver.com/${blogId}/${logNo}`,
              pubDate: p.addDate || '',
              description: '',
              logNo, blogId, keywords: [],
            });
          }
        });
        if (posts.length >= maxPosts) break;
      }
    } catch (e) {
      console.error('[PostTitleList] Error:', e.message);
    }
  }

  return posts.slice(0, maxPosts);
}

/**
 * 글 태그(키워드) 수집
 * - 정확한 태그 컨테이너만 파싱 (UI 버튼 텍스트 오염 방지)
 */

// UI 버튼/메뉴에서 자주 나오는 단어 필터
const UI_BLACKLIST = new Set([
  '취소','확인','닫기','저장','삭제','수정','공유','신고','댓글','이웃','구독',
  '더보기','이전','다음','홈','목록','검색','로그인','로그아웃','설정',
  'cancel','confirm','close','save','delete','edit','share','report',
]);

async function fetchPostTags(blogId, logNo) {
  // 태그 전용 컨테이너 셀렉터만 사용 (범용 [class*="tag"] 제거)
  const STRICT_SELECTORS = [
    '.post_tag a',           // 구 에디터
    '.tag_area a',           // 구 에디터
    '.__naverBlog_tag a',    // 구 에디터
    '.se-tags .se-tag',      // 스마트에디터 ONE
    '.se-tags a',            // 스마트에디터 ONE
    '.blog_tag a',
  ];

  const urls = [
    `https://blog.naver.com/PostView.nhn?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`,
    `https://blog.naver.com/${blogId}/${logNo}`,
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` },
        timeout: 8000,
      });
      const $ = cheerio.load(res.data);
      const tags = [];

      for (const sel of STRICT_SELECTORS) {
        $(sel).each((_, el) => {
          const raw = $(el).text().replace(/^#/, '').trim();
          // 한글/영문/숫자 포함, 2~20자, UI 단어 제외
          if (
            raw &&
            raw.length >= 2 &&
            raw.length <= 20 &&
            !UI_BLACKLIST.has(raw) &&
            /[가-힣a-zA-Z0-9]/.test(raw) &&
            !tags.includes(raw)
          ) {
            tags.push(raw);
          }
        });
        if (tags.length > 0) break;
      }

      if (tags.length > 0) return tags.slice(0, 10);
    } catch {}
  }
  return [];
}

/**
 * ✅ 네이버 공식 검색 API로 순위 체크
 *    - 스크래핑 ZERO → 차단 없음, 안정적
 *    - 1회 요청으로 최대 100위까지 확인
 *    - 무료 25,000회/일
 *
 * @param {string} keyword
 * @param {string} blogId
 * @param {string} logNo      - 특정 글 지정 (선택)
 * @param {string} clientId   - 네이버 API Client ID
 * @param {string} clientSecret - 네이버 API Client Secret
 * @returns {{ rank, found, totalChecked, bloggerlink }}
 */
async function checkKeywordRankWithAPI(keyword, blogId, logNo, clientId, clientSecret) {
  const display = 100; // 한 번에 최대 100개
  let rank = null;
  let found = false;
  let totalChecked = 0;

  try {
    const res = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
      params: { query: keyword, display, start: 1, sort: 'sim' },
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    const items = res.data.items || [];
    totalChecked = items.length;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // bloggerlink: "https://blog.naver.com/myblogid"
      const bloggerlink = (item.bloggerlink || '').toLowerCase();
      const link = (item.link || '').toLowerCase();

      const isSameBlog = bloggerlink.includes(blogId.toLowerCase()) ||
                         link.includes(`blog.naver.com/${blogId.toLowerCase()}`);

      // logNo까지 일치 여부 (특정 글 지정 시)
      const isSamePost = logNo ? link.includes(logNo) : isSameBlog;

      if (isSameBlog && isSamePost && !found) {
        rank = i + 1;
        found = true;
        break;
      }
    }

    return { rank, found, totalChecked };

  } catch (e) {
    // API 인증 오류 구분
    if (e.response?.status === 401 || e.response?.status === 403) {
      throw new Error('네이버 API 인증 실패: Client ID / Secret을 확인하세요.');
    }
    if (e.response?.status === 429) {
      throw new Error('네이버 API 호출 한도 초과 (25,000회/일). 내일 다시 시도하세요.');
    }
    throw new Error(`API 오류: ${e.message}`);
  }
}

module.exports = { fetchPostsByRSS, fetchPostTags, checkKeywordRankWithAPI };
