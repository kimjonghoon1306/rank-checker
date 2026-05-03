const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const forge = require('node-forge');
const cheerio = require('cheerio');
const LZString = require('lz-string');
const { randomUUID } = require('crypto'); // uuid 패키지 불필요

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

async function getLoginPage(client) {
  const res = await client.get(
    'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fm.naver.com%2F&svctype=262144',
    { headers: { Referer: 'https://m.naver.com/' } }
  );
  const $ = cheerio.load(res.data);
  const dynamicKey = $('input[name=dynamicKey]').val() || '';
  return { dynamicKey };
}

async function getEncryptionKeys(client) {
  const ts = Date.now();
  const res = await client.get(
    `https://nid.naver.com/login/ext/keys.nhn?svctype=262144&s=${ts}`,
    { headers: { Referer: 'https://nid.naver.com/nidlogin.login' } }
  );
  const parts = res.data.trim().split(',');
  return { sessionKey: parts[0], keyName: parts[1], publicKeyHex: parts[2] };
}

function encryptCredentials(sessionKey, publicKeyHex, id, pw) {
  const sessionKeyBuf = Buffer.from(sessionKey, 'utf8');
  const idBuf = Buffer.from(id, 'utf8');
  const pwBuf = Buffer.from(pw, 'utf8');
  const message = Buffer.concat([
    Buffer.from([sessionKeyBuf.length]), sessionKeyBuf,
    Buffer.from([idBuf.length]), idBuf,
    Buffer.from([pwBuf.length]), pwBuf,
  ]);
  const n = new forge.jsbn.BigInteger(publicKeyHex, 16);
  const e = new forge.jsbn.BigInteger('10001', 16);
  const publicKey = forge.pki.rsa.setPublicKey(n, e);
  const encrypted = publicKey.encrypt(message.toString('binary'), 'RSAES-PKCS1-V1_5');
  return Buffer.from(encrypted, 'binary').toString('hex');
}

function generateBvsd(naverId) {
  const uuid = randomUUID(); // Node.js 내장 crypto 사용
  const now = Date.now();
  const keyLogs = [];
  let t = 0;
  for (let i = 0; i < naverId.length; i++) {
    t += Math.floor(Math.random() * 150 + 80);
    keyLogs.push(`${t},d,${naverId[i]},0`);
    t += Math.floor(Math.random() * 80 + 40);
    keyLogs.push(`${t},u,${naverId[i]},0`);
  }
  const stateData = {
    a: uuid, b: '1.3.8', c: false,
    d: [{ a: keyLogs, b: { a: null, b: 0 } }],
    e: [], f: false, g: [], h: false, i: [], j: false, k: [], l: 0, m: now,
  };
  const encData = LZString.compressToEncodedURIComponent(JSON.stringify(stateData));
  return JSON.stringify({ uuid, encData });
}

// 모든 도메인에서 쿠키 수집
async function getAllCookies(jar) {
  const domains = [
    'https://naver.com', 'https://www.naver.com',
    'https://nid.naver.com', 'https://m.naver.com',
  ];
  let all = [];
  for (const d of domains) {
    try { all = all.concat(await jar.getCookies(d)); } catch {}
  }
  return all;
}

async function naverLogin(naverId, naverPw) {
  const { client, jar } = createClient();

  // 1) 로그인 페이지 + dynamicKey
  const { dynamicKey } = await getLoginPage(client);
  await new Promise(r => setTimeout(r, 800 + Math.random() * 400));

  // 2) RSA 키
  const { sessionKey, keyName, publicKeyHex } = await getEncryptionKeys(client);

  // 3) 암호화 + bvsd
  const encpw = encryptCredentials(sessionKey, publicKeyHex, naverId, naverPw);
  const bvsd = generateBvsd(naverId);

  // 4) 로그인 POST
  const params = new URLSearchParams({
    localechange: '', dynamicKey,
    enctp: '1', encpw, encnm: keyName,
    svctype: '262144', smart_LEVEL: '-1', bvsd,
    locale: 'ko_KR', url: 'https://m.naver.com/aside/',
    nvlong: 'on', appSchemeView: 'true', id: '', pw: '',
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

  // 5) SSO finalize URL 처리 (NID_AUT, NID_SES 최종 발급되는 단계)
  const responseText = typeof loginRes.data === 'string' ? loginRes.data : '';
  const finalizeMatch = responseText.match(/location\.replace\(["']([^"']+)["']\)/);
  if (finalizeMatch) {
    try {
      await client.get(finalizeMatch[1], { headers: { Referer: 'https://nid.naver.com/' } });
    } catch {}
  }

  // 리다이렉트된 최종 URL도 접근
  const finalUrl = loginRes.request?.res?.responseUrl || '';
  if (finalUrl && !finalUrl.includes('nidlogin.login')) {
    try { await client.get(finalUrl, { headers: { Referer: 'https://nid.naver.com/' } }); } catch {}
  }

  // naver.com 에도 접근해서 쿠키 동기화
  try { await client.get('https://www.naver.com/', { headers: { Referer: 'https://nid.naver.com/' } }); } catch {}

  // 6) 쿠키 확인
  const allCookies = await getAllCookies(jar);
  const nidAut = allCookies.find(c => c.key === 'NID_AUT');
  const nidSes = allCookies.find(c => c.key === 'NID_SES');

  if (!nidAut || !nidSes) {
    const allKeys = [...new Set(allCookies.map(c => c.key))].join(', ') || '없음';

    // NID_JST = 로그인은 됐으나 네이버가 기기 인증 요구
    if (allKeys.includes('NID_JST')) {
      throw new Error('네이버 기기 인증이 필요합니다. 네이버에 직접 로그인 후 "이 기기를 신뢰하는 기기로 등록"을 완료한 뒤 다시 시도하세요.');
    }

    throw new Error(`로그인 실패 (쿠키: ${allKeys})\n아이디/비밀번호를 확인하거나 잠시 후 다시 시도하세요.`);
  }

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
