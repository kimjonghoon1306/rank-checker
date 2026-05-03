const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const forge = require('node-forge');
const cheerio = require('cheerio');
const LZString = require('lz-string');
const { v4: uuidv4 } = require('uuid');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    maxRedirects: 10,
    headers: BASE_HEADERS,
    timeout: 20000,
  }));
  return { client, jar };
}

// 로그인 페이지에서 dynamicKey 추출
async function getLoginPage(client) {
  const res = await client.get(
    'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fm.naver.com%2F&svctype=262144',
    { headers: { Referer: 'https://m.naver.com/' } }
  );
  const $ = cheerio.load(res.data);
  const dynamicKey = $('input[name=dynamicKey]').val() || '';
  return { dynamicKey };
}

// RSA 키 획득 (모바일용 svctype=262144)
async function getEncryptionKeys(client) {
  const ts = Date.now();
  const res = await client.get(
    `https://nid.naver.com/login/ext/keys.nhn?svctype=262144&s=${ts}`,
    { headers: { Referer: 'https://nid.naver.com/nidlogin.login' } }
  );
  const parts = res.data.trim().split(',');
  return {
    sessionKey: parts[0],
    keyName: parts[1],
    publicKeyHex: parts[2],
  };
}

// RSA 암호화
function encryptCredentials(sessionKey, publicKeyHex, id, pw) {
  const sessionKeyBuf = Buffer.from(sessionKey, 'utf8');
  const idBuf = Buffer.from(id, 'utf8');
  const pwBuf = Buffer.from(pw, 'utf8');

  const message = Buffer.concat([
    Buffer.from([sessionKeyBuf.length]),
    sessionKeyBuf,
    Buffer.from([idBuf.length]),
    idBuf,
    Buffer.from([pwBuf.length]),
    pwBuf,
  ]);

  const n = new forge.jsbn.BigInteger(publicKeyHex, 16);
  const e = new forge.jsbn.BigInteger('10001', 16);
  const publicKey = forge.pki.rsa.setPublicKey(n, e);
  const encrypted = publicKey.encrypt(message.toString('binary'), 'RSAES-PKCS1-V1_5');

  return Buffer.from(encrypted, 'binary').toString('hex');
}

// bvsd 생성 (브라우저 행동 데이터 - 없으면 캡챠 발생)
function generateBvsd(naverId) {
  const uuid = uuidv4();
  const now = Date.now();

  // 키보드 입력 시뮬레이션 (아이디 타이핑 흉내)
  const keyLogs = [];
  let t = 0;
  for (let i = 0; i < naverId.length; i++) {
    t += Math.floor(Math.random() * 150 + 80);
    keyLogs.push(`${t},d,${naverId[i]},0`);
    t += Math.floor(Math.random() * 80 + 40);
    keyLogs.push(`${t},u,${naverId[i]},0`);
  }

  const stateData = {
    a: uuid,           // uuidWithCaptchaSequence
    b: '1.3.8',        // bvsdVersion
    c: false,          // deviceTouchable
    d: [{              // keyboardLogs
      a: keyLogs,
      b: { a: null, b: 0 }
    }],
    e: [],             // touchLogs
    f: false,          // gyroscopeAvailable
    g: [],             // gyroscopeLogs
    h: false,          // accelerometerAvailable
    i: [],             // accelerometerLogs
    j: false,          // deviceMotionAvailable
    k: [],             // deviceMotionLogs
    l: 0,              // captchaSequence
    m: now,            // startTime
  };

  const encData = LZString.compressToEncodedURIComponent(JSON.stringify(stateData));

  return JSON.stringify({ uuid, encData });
}

async function naverLogin(naverId, naverPw) {
  const { client, jar } = createClient();

  // 1) 로그인 페이지 접근 + dynamicKey 추출
  const { dynamicKey } = await getLoginPage(client);
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));

  // 2) RSA 키 획득
  const { sessionKey, keyName, publicKeyHex } = await getEncryptionKeys(client);

  // 3) 암호화
  const encpw = encryptCredentials(sessionKey, publicKeyHex, naverId, naverPw);

  // 4) bvsd 생성
  const bvsd = generateBvsd(naverId);

  // 5) 로그인 POST
  const params = new URLSearchParams({
    localechange: '',
    dynamicKey,
    enctp: '1',
    encpw,
    encnm: keyName,
    svctype: '262144',
    smart_LEVEL: '-1',
    bvsd,
    locale: 'ko_KR',
    url: 'https://m.naver.com/aside/',
    nvlong: 'on',
    appSchemeView: 'true',
    id: '',
    pw: '',
  });

  const loginRes = await client.post(
    'https://nid.naver.com/nidlogin.login',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fm.naver.com%2F&svctype=262144',
        'Origin': 'https://nid.naver.com',
        'Upgrade-Insecure-Requests': '1',
      },
    }
  );

  // 6) 리다이렉트 처리 및 최종 URL에서 추가 쿠키 수집
  const finalUrl = loginRes.request?.res?.responseUrl || loginRes.config?.url || '';
  if (finalUrl && finalUrl !== 'https://nid.naver.com/nidlogin.login') {
    try { await client.get(finalUrl, { headers: { Referer: 'https://nid.naver.com/' } }); } catch {}
  }

  // 7) 쿠키 확인 (여러 도메인 체크)
  const domains = ['https://naver.com', 'https://www.naver.com', 'https://nid.naver.com', 'https://m.naver.com'];
  let allCookies = [];
  for (const domain of domains) {
    try {
      const c = await jar.getCookies(domain);
      allCookies = allCookies.concat(c);
    } catch {}
  }

  const nidAut = allCookies.find(c => c.key === 'NID_AUT');
  const nidSes = allCookies.find(c => c.key === 'NID_SES');

  if (!nidAut || !nidSes) {
    const allKeys = [...new Set(allCookies.map(c => c.key))].join(', ') || '없음';
    throw new Error(`로그인 실패 (쿠키: ${allKeys})\n아이디/비밀번호를 확인하거나, 네이버에서 직접 로그인 후 다시 시도하세요.`);
  }

  // 8) 블로그 ID 확인
  const blogId = await getBlogId(client, naverId);
  return { client, jar, blogId, naverId };
}

async function getBlogId(client, naverId) {
  try {
    const res = await client.get('https://blog.naver.com/BlogInfo.nhn?blogId=&output=json', {
      headers: { Referer: 'https://blog.naver.com/' },
    });
    if (res.data?.blogId) return res.data.blogId;
  } catch {}

  try {
    const res = await client.get('https://blog.naver.com/myblog.nhn', { maxRedirects: 5 });
    const finalUrl = res.request?.res?.responseUrl || '';
    const match = finalUrl.match(/blog\.naver\.com\/([^/?#]+)/);
    if (match && match[1] !== 'myblog.nhn') return match[1];
  } catch {}

  try {
    const res = await client.get(`https://blog.naver.com/${naverId}`, {
      headers: { Referer: 'https://www.naver.com/' },
    });
    const $ = cheerio.load(res.data);
    const canonical = $('link[rel=canonical]').attr('href') || '';
    const match = canonical.match(/blog\.naver\.com\/([^/?#]+)/);
    if (match) return match[1];
  } catch {}

  return naverId;
}

module.exports = { naverLogin, getBlogId };
