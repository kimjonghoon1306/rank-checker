const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const forge = require('node-forge');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
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

async function getEncryptionKeys(client) {
  const ts = Date.now();
  const res = await client.get(
    `https://nid.naver.com/login/ext/keys.nhn?svctype=0&s=${ts}`,
    { headers: { Referer: 'https://nid.naver.com/nidlogin.login' } }
  );
  const parts = res.data.trim().split(',');
  return {
    sessionKey: parts[0],
    keyName: parts[1],
    publicKeyHex: parts[2],
  };
}

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

async function naverLogin(naverId, naverPw) {
  const { client, jar } = createClient();

  await client.get('https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com/', {
    headers: { Referer: 'https://www.naver.com/' },
  });

  await new Promise(r => setTimeout(r, 800));

  const { sessionKey, keyName, publicKeyHex } = await getEncryptionKeys(client);
  const encpw = encryptCredentials(sessionKey, publicKeyHex, naverId, naverPw);

  const params = new URLSearchParams({
    svctype: '0',
    enctp: '1',
    encpw,
    encnm: keyName,
    url: 'https://www.naver.com/',
    nvlong: '0',
    locale: 'ko_KR',
    id: '',
    pw: '',
  });

  await client.post(
    'https://nid.naver.com/nidlogin.login',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com/',
        'Origin': 'https://nid.naver.com',
      },
    }
  );

  const cookies = await jar.getCookies('https://naver.com');
  const nidAut = cookies.find(c => c.key === 'NID_AUT');
  const nidSes = cookies.find(c => c.key === 'NID_SES');

  if (!nidAut || !nidSes) {
    const allKeys = cookies.map(c => c.key).join(', ') || '없음';
    throw new Error(`로그인 실패 (쿠키: ${allKeys}) - 아이디/비밀번호를 확인하거나 잠시 후 다시 시도하세요.`);
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
