# 네이버 블로그 순위 체커 v3.0

## ⚠️ 기존 작동 안 하던 원인

이전 버전은 **서버에서 네이버 검색 페이지를 스크래핑**하는 방식이었음.
Vercel 서버 IP는 네이버가 봇으로 감지해 빈 결과 또는 403 반환 → 순위 체크 불가.

## ✅ v3 해결책: 네이버 공식 검색 API

- 공식 API → 차단 없음, 안정적
- 블로그 탭 기준 100위까지 1회 요청으로 확인
- 무료 25,000회/일

---

## 🔑 네이버 API 키 발급 (필수)

1. https://developers.naver.com/apps/#/register 접속
2. 애플리케이션 이름 입력 (예: "블로그 순위체커")
3. 사용 API → **검색** 선택
4. 웹 서비스 URL → `http://localhost` 입력 후 등록
5. **Client ID** / **Client Secret** 복사
6. 앱 화면 우측 상단 **"API 키 설정"** 버튼 클릭 후 입력

> API 키는 브라우저 localStorage에만 저장되며 서버에 보관되지 않습니다.

---

## 설치 & 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

## Vercel 배포

```bash
vercel --prod
```

### 선택적 환경변수 (팀 공유용)

```
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
ANTHROPIC_API_KEY=sk-ant-...  # AI 키워드 추출 (없어도 동작)
```

환경변수 설정 시 UI에서 API 키 입력 불필요.

---

## 파일 구조

```
pages/api/blog/
  posts.js      # RSS로 블로그 글 목록 수집
  rank.js       # 네이버 검색 API로 순위 확인
  keywords.js   # AI 키워드 추출 (선택)
components/
  RankChecker.jsx
lib/
  naverBlog.js
```

## 사용 흐름

1. API 키 설정 (최초 1회)
2. 블로그 ID 입력 → 글 목록 불러오기
3. 태그에서 키워드 자동 인식
4. 키워드 칩 클릭 or "전체 일괄 확인" → 순위 확인
5. ✨ AI 키워드 버튼으로 제목 기반 키워드 추가 추출
6. CSV 내보내기
