const axios = require('axios');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/**
 * 블로그 글 목록 수집 (RSS + 보완)
 */
async function fetchPosts(client, blogId, maxPosts = 30) {
  const posts = [];

  try {
    // 방법1: RSS 피드
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    const res = await (client || axios).get(rssUrl, { headers: BASE_HEADERS });
    const $ = cheerio.load(res.data, { xmlMode: true });

    $('item').each((i, el) => {
      if (i >= maxPosts) return false;
      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      const description = $(el).find('description').text().replace(/<[^>]+>/g, '').trim().slice(0, 200);
      const logNo = extractLogNo(link);
      if (title && logNo) {
        posts.push({ title, link, pubDate, description, logNo, blogId, keywords: [] });
      }
    });
  } catch (e) {
    console.error('RSS fetch error:', e.message);
  }

  // RSS 실패 시 블로그 포스트 목록 API 시도
  if (posts.length === 0) {
    try {
      const res = await (client || axios).get(
        `https://blog.naver.com/PostTitleListAsync.nhn?blogId=${blogId}&currentPage=1&countPerPage=${maxPosts}&postListType=POST&categoryNo=0`,
        { headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } }
      );
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      (data.postList || []).forEach(p => {
        posts.push({
          title: p.titleWithInspectMessage || p.title,
          link: `https://blog.naver.com/${blogId}/${p.logNo}`,
          pubDate: p.addDate,
          description: '',
          logNo: p.logNo,
          blogId,
          keywords: [],
        });
      });
    } catch (e) {
      console.error('PostList API error:', e.message);
    }
  }

  return posts;
}

/**
 * 글 URL에서 logNo 추출
 */
function extractLogNo(url) {
  const m = url.match(/\/(\d{10,})/);
  return m ? m[1] : null;
}

/**
 * 글 본문에서 태그(키워드) 추출
 */
async function fetchPostTags(client, blogId, logNo) {
  try {
    const res = await (client || axios).get(
      `https://blog.naver.com/${blogId}/${logNo}`,
      { headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}` } }
    );
    const $ = cheerio.load(res.data);
    const tags = [];

    // 태그 파싱 (여러 선택자 시도)
    $('.post_tag a, .tag_area a, .__naverBlog_tag a, [class*="tag"] a').each((_, el) => {
      const t = $(el).text().replace(/^#/, '').trim();
      if (t && t.length > 1 && !tags.includes(t)) tags.push(t);
    });

    // iframe 내 포스트 본문 API
    if (tags.length === 0) {
      try {
        const apiRes = await (client || axios).get(
          `https://blog.naver.com/PostView.nhn?blogId=${blogId}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true`,
          { headers: { ...BASE_HEADERS, Referer: `https://blog.naver.com/${blogId}/${logNo}` } }
        );
        const $2 = cheerio.load(apiRes.data);
        $2('.post_tag a, .tag_area a, .__naverBlog_tag a').each((_, el) => {
          const t = $2(el).text().replace(/^#/, '').trim();
          if (t && t.length > 1 && !tags.includes(t)) tags.push(t);
        });
      } catch {}
    }

    return tags.slice(0, 10);
  } catch (e) {
    return [];
  }
}

/**
 * 네이버 뷰탭 검색 → 내 블로그 글 순위 체크
 * 반환: { rank: number|null, found: boolean, totalChecked: number }
 */
async function checkKeywordRank(keyword, blogId, logNo) {
  const maxPages = 3; // 최대 30위까지 확인
  const perPage = 10;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await axios.get('https://search.naver.com/search.naver', {
        params: {
          where: 'view',
          query: keyword,
          start: (page - 1) * perPage + 1,
          display: perPage,
        },
        headers: {
          ...BASE_HEADERS,
          Referer: 'https://search.naver.com/',
        },
        timeout: 8000,
      });

      const $ = cheerio.load(res.data);
      let found = false;
      let posInPage = 0;

      // 검색 결과 목록 순회
      $('.view_wrap .total_group .bx, .view_wrap li[data-rank]').each((i, el) => {
        posInPage++;
        const link = $(el).find('a').attr('href') || '';
        const isMyPost = link.includes(`blog.naver.com/${blogId}`) &&
          (logNo ? link.includes(logNo) : true);

        if (isMyPost && !found) {
          found = true;
          const globalRank = (page - 1) * perPage + posInPage;
          return false; // each break
        }
      });

      if (found) {
        const posInPage2 = (() => {
          let rank = 0;
          let f = false;
          $('.view_wrap .total_group .bx, .view_wrap li[data-rank]').each((i, el) => {
            rank++;
            const link = $(el).find('a').attr('href') || '';
            if (link.includes(`blog.naver.com/${blogId}`) && (!logNo || link.includes(logNo))) {
              f = true;
              return false;
            }
          });
          return f ? rank : 0;
        })();
        return {
          rank: (page - 1) * perPage + posInPage2,
          found: true,
          totalChecked: page * perPage,
        };
      }

      // 결과가 더 없으면 중단
      if ($('.view_wrap .total_group .bx').length === 0) break;

    } catch (e) {
      console.error('Rank check error:', e.message);
      break;
    }
  }

  return { rank: null, found: false, totalChecked: maxPages * perPage };
}

module.exports = { fetchPosts, fetchPostTags, checkKeywordRank };
