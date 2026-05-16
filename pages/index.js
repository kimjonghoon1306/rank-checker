import Head from 'next/head';
import RankChecker from '../components/RankChecker';

export default function Home() {
  return (
    <>
      <Head>
        <title>블로그 순위 체커 — 네이버 블로그 SEO 분석</title>
        <meta name="description" content="블로그 ID만 입력하면 네이버 검색 순위를 자동 분석. 키워드 노출 순위, 경쟁도, SEO 개선 리포트까지 한번에." />
        <meta property="og:title" content="🌸 블로그 순위 체커 — 네이버 블로그 SEO 분석" />
        <meta property="og:description" content="블로그 ID만 입력하면 네이버 검색 순위 자동 분석. 기회 키워드 발굴 · SEO 등급 · PDF 보고서 제공" />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="🌸 블로그 순위 체커" />
        <meta name="twitter:description" content="네이버 블로그 SEO 순위 자동 분석 도구" />
        <meta name="twitter:image" content="/og-image.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <RankChecker />
    </>
  );
}
