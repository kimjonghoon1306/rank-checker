const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const NodeRSA = require('node-rsa');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://nid.naver.com/',
};

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    maxRedirects: 10,
    headers: BASE_HEADERS,
    timeout: 15000,
  }));
  return { client, jar };
}

async function getEncryptionKeys(client) {
  const ts = Date.now();
  const res = await client.get(
    `https://nid.naver.com/login/ext/keys.nhn?svctype=0&s=${ts}`
  );
  const parts = res.data.split(',');
  // parts[0]=sessionKey, parts[1]=keyName, parts[2]=publicKey(hex)
  return {
    sessionKey: parts[0],
    keyName: parts[1],
    publicKey: parts[2],
  };
}

function encryptCredentials(sessionKey, publicKey, id, pw) {
  const key = new NodeRSA();
  key.setOptions({ encryptionScheme: 'pkcs1' });

  const n = BigInt('0x' + publicKey);
  const e = BigInt('0x' + '010001');
  key.importKey({
    n: Buffer.from(publicKey, 'hex'),
    e: 65537,
  }, 'components-public');

  const sessionKeyLen = String.fromCharCode(sessionKey.length);
  const sessionKeyStr = sessionKey;
  const idLen = String.fromCharCode(id.length);
  const pwLen = String.fromCharCode(pw.length);
  const message = sessionKeyLen + sessionKeyStr + idLen + id + pwLen + pw;

  const encrypted = key.encrypt(Buffer.from(message, 'utf8'), 'hex');
  return encrypted;
}

/**
 * 네이버 로그인 → 세션 쿠키 + 블로그ID 반환
 */
async function naverLogin(naverId, naverPw) {
  const { client, jar } = createClient();

  // 1) 로그인 페이지 접근 (쿠키 초기화)
  await client.get('https://nid.naver.com/nidlogin.login', {
    headers: { Referer: 'https://www.naver.com/' },
  });

  // 2) RSA 암호화 키 획득
  const { sessionKey, keyName, publicKey } = await getEncryptionKeys(client);

  // 3) 비밀번호 RSA 암호화
  const encpw = encryptCredentials(sessionKey, publicKey, naverId, naverPw);

  // 4) 로그인 POST
  const loginRes = await client.post(
    'https://nid.naver.com/nidlogin.login',
    new URLSearchParams({
      svctype: '0',
      enctp: '1',
      encpw,
      encnm: keyName,
      url: 'https://www.naver.com/',
      nvlong: '0',
      locale: 'ko_KR',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://nid.naver.com/nidlogin.login',
      },
      maxRedirects: 5,
    }
  );

  // 5) 로그인 성공 여부 확인
  const cookies = await jar.getCookies('https://naver.com');
  const hasSession = cookies.some(c => c.key === 'NID_AUT' || c.key === 'NID_SES');
  if (!hasSession) {
    throw new Error('로그인 실패: 아이디 또는 비밀번호를 확인하세요.');
  }

  // 6) 블로그 ID 추출 (네이버 ID ≠ 블로그 ID 대응)
  const blogId = await getBlogId(client, naverId);

  return { client, jar, blogId, naverId };
}

/**
 * 로그인된 세션으로 실제 블로그 ID 조회
 * 네이버 ID와 블로그 ID가 다른 경우 처리
 */
async function getBlogId(client, naverId) {
  try {
    // 방법1: 내 블로그 정보 API
    const res = await client.get(
      `https://blog.naver.com/BlogInfo.nhn?blogId=&output=json`,
      { headers: { Referer: 'https://blog.naver.com/' } }
    );
    if (res.data && res.data.blogId) return res.data.blogId;
  } catch {}

  try {
    // 방법2: 프로필 페이지에서 블로그 ID 파싱
    const res = await client.get(`https://blog.naver.com/${naverId}`, {
      headers: { Referer: 'https://www.naver.com/' },
    });
    const $ = cheerio.load(res.data);
    const canonical = $('link[rel=canonical]').attr('href') || '';
    const match = canonical.match(/blog\.naver\.com\/([^/?]+)/);
    if (match) return match[1];
  } catch {}

  try {
    // 방법3: 내 블로그 이동 후 최종 URL에서 파싱
    const res = await client.get('https://blog.naver.com/myblog.nhn', {
      maxRedirects: 5,
    });
    const finalUrl = res.request?.res?.responseUrl || '';
    const match = finalUrl.match(/blog\.naver\.com\/([^/?]+)/);
    if (match) return match[1];
  } catch {}

  // 방법4: 네이버 ID를 그대로 사용 (fallback)
  return naverId;
}

module.exports = { naverLogin, getBlogId };
