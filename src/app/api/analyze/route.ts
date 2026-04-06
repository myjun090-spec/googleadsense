import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const maxDuration = 60;

interface CheckResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  severity: "critical" | "major" | "minor";
  detail: string;
  solution: string;
}

interface PageAnalysis {
  url: string;
  title: string;
  charCount: number;
  wordCount: number;
  headingCount: number;
  imageCount: number;
  hasEnoughContent: boolean;
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string; status: number; headers: Headers } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });
    const html = await res.text();
    return { html, finalUrl: res.url, status: res.status, headers: res.headers };
  } catch {
    return null;
  }
}

// sitemap.xml에서 URL 목록 추출
async function parseSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapPaths = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/post-sitemap.xml"];

  for (const path of sitemapPaths) {
    try {
      const res = await fetch(baseUrl + path, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const $ = cheerio.load(xml, { xml: true });

      // sitemap index인 경우
      const sitemapLocs = $("sitemap > loc").map((_, el) => $(el).text()).get();
      if (sitemapLocs.length > 0) {
        // 첫 번째 하위 사이트맵만 파싱
        for (const loc of sitemapLocs.slice(0, 2)) {
          try {
            const subRes = await fetch(loc, { signal: AbortSignal.timeout(5000) });
            if (subRes.ok) {
              const subXml = await subRes.text();
              const sub$ = cheerio.load(subXml, { xml: true });
              sub$("url > loc").each((_, el) => { urls.push(sub$(el).text()); });
            }
          } catch { /* ignore */ }
        }
      }

      // 일반 sitemap
      $("url > loc").each((_, el) => { urls.push($(el).text()); });

      if (urls.length > 0) break;
    } catch { /* ignore */ }
  }

  return urls;
}

// RSS 피드에서 글 수 추정
async function parseRSSCount(baseUrl: string): Promise<number> {
  const rssPaths = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml"];
  for (const path of rssPaths) {
    try {
      const res = await fetch(baseUrl + path, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const $ = cheerio.load(xml, { xml: true });
      const itemCount = $("item, entry").length;
      if (itemCount > 0) return itemCount;
    } catch { /* ignore */ }
  }
  return 0;
}

// Google PageSpeed Insights API (무료, 키 불필요)
async function getPageSpeedScore(url: string): Promise<{ performance: number; mobile: boolean; details: string[] } | null> {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const data = await res.json();
    const categories = data.lighthouseResult?.categories;
    if (!categories) return null;

    const performance = Math.round((categories.performance?.score || 0) * 100);
    const seo = Math.round((categories.seo?.score || 0) * 100);
    const accessibility = Math.round((categories.accessibility?.score || 0) * 100);

    const details: string[] = [];
    details.push(`모바일 성능: ${performance}점`);
    details.push(`SEO 점수: ${seo}점`);
    details.push(`접근성: ${accessibility}점`);

    // 주요 메트릭 추출
    const audits = data.lighthouseResult?.audits;
    if (audits) {
      if (audits["first-contentful-paint"]) {
        details.push(`FCP(첫 콘텐츠 표시): ${audits["first-contentful-paint"].displayValue}`);
      }
      if (audits["largest-contentful-paint"]) {
        details.push(`LCP(최대 콘텐츠 표시): ${audits["largest-contentful-paint"].displayValue}`);
      }
      if (audits["cumulative-layout-shift"]) {
        details.push(`CLS(레이아웃 이동): ${audits["cumulative-layout-shift"].displayValue}`);
      }
    }

    return { performance, mobile: true, details };
  } catch {
    return null;
  }
}

// Wayback Machine CDX API로 도메인 나이 추정 (최초 아카이브 날짜)
async function getDomainAge(domain: string): Promise<{ firstSeen: string; ageMonths: number } | null> {
  try {
    // CDX API: 가장 오래된 스냅샷 1개만 가져오기
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=1&fl=timestamp&filter=statuscode:200`;
    const res = await fetch(cdxUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      // fallback: available API
      return await getDomainAgeFallback(domain);
    }
    const data = await res.json();
    // data[0]은 헤더, data[1]이 첫 번째 결과
    if (!data || data.length < 2 || !data[1]?.[0]) {
      return await getDomainAgeFallback(domain);
    }

    const ts = data[1][0];
    const year = parseInt(ts.substring(0, 4));
    const month = parseInt(ts.substring(4, 6));
    const firstSeen = `${year}년 ${month}월`;

    const now = new Date();
    const ageMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);

    return { firstSeen, ageMonths };
  } catch {
    return await getDomainAgeFallback(domain);
  }
}

async function getDomainAgeFallback(domain: string): Promise<{ firstSeen: string; ageMonths: number } | null> {
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${domain}&timestamp=20000101`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const snapshot = data.archived_snapshots?.closest;
    if (!snapshot?.timestamp) return null;

    const ts = snapshot.timestamp;
    const year = parseInt(ts.substring(0, 4));
    const month = parseInt(ts.substring(4, 6));
    const firstSeen = `${year}년 ${month}월 (추정)`;

    const now = new Date();
    const ageMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);

    return { firstSeen, ageMonths };
  } catch {
    return null;
  }
}

// 다중 페이지 콘텐츠 품질 분석
async function analyzePages(urls: string[], maxPages: number = 10): Promise<PageAnalysis[]> {
  const sampled = urls.slice(0, maxPages);
  const results: PageAnalysis[] = [];

  await Promise.all(
    sampled.map(async (url) => {
      const page = await fetchPage(url);
      if (!page) return;

      const $ = cheerio.load(page.html);
      // 스크립트, 스타일 등 제거 후 순수 텍스트 추출
      $("script, style, noscript, iframe").remove();
      const text = $("article, .post-content, .entry-content, .content, main, .post, #content").text().trim()
        || $("body").text().trim();
      const cleanText = text.replace(/\s+/g, " ");
      const hasKorean = /[가-힣]/.test(cleanText);
      const charCount = cleanText.replace(/\s/g, "").length;
      const wordCount = cleanText.split(/\s+/).length;
      const headingCount = $("h1, h2, h3, h4").length;
      const imageCount = $("img").length;

      results.push({
        url,
        title: $("title").text().trim() || url,
        charCount,
        wordCount,
        headingCount,
        imageCount,
        hasEnoughContent: hasKorean ? charCount >= 800 : wordCount >= 300,
      });
    })
  );

  return results;
}

// 정책 위반 키워드 스캔
function scanPolicyViolations(text: string): { violations: string[]; hasViolation: boolean } {
  const categories: Record<string, string[]> = {
    "성인 콘텐츠": ["포르노", "성인동영상", "야동", "19금", "성인사이트"],
    "도박": ["카지노", "슬롯머신", "도박사이트", "배팅", "토토사이트", "먹튀"],
    "약물": ["마약", "대마초", "필로폰", "불법약물"],
    "무기": ["총기판매", "총기거래", "불법무기"],
    "해킹/불법": ["해킹툴", "크랙", "불법다운로드", "시리얼키", "keygen"],
  };

  const lowerText = text.toLowerCase();
  const violations: string[] = [];

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        violations.push(`${category} 관련 키워드 감지: "${keyword}"`);
        break;
      }
    }
  }

  return { violations, hasViolation: violations.length > 0 };
}

// 내부 링크 분석
function analyzeInternalLinks($: cheerio.CheerioAPI, baseUrl: string): { count: number; unique: number } {
  const origin = new URL(baseUrl).origin;
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href") || "")
    .get()
    .filter((href) => {
      try {
        const url = new URL(href, baseUrl);
        return url.origin === origin;
      } catch {
        return href.startsWith("/") || href.startsWith("./");
      }
    });

  return { count: links.length, unique: new Set(links).size };
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    const normalizedUrl = normalizeUrl(url);

    // 1단계: 메인 페이지 가져오기
    const mainPage = await fetchPage(normalizedUrl);
    if (!mainPage) {
      return NextResponse.json(
        { error: "사이트에 접속할 수 없습니다. URL을 확인해주세요." },
        { status: 400 }
      );
    }

    const { html, finalUrl, status: statusCode } = mainPage;
    const $ = cheerio.load(html);
    const baseUrl = new URL(finalUrl).origin;
    const hostname = new URL(finalUrl).hostname;
    const checks: CheckResult[] = [];

    // AdSense 연동 불가 플랫폼 감지
    const unsupportedPlatforms: Record<string, string> = {
      "naver.com": "네이버 블로그/카페는 Google AdSense를 연동할 수 없습니다. 자체 도메인으로 워드프레스 등을 사용하세요.",
      "blog.naver.com": "네이버 블로그는 Google AdSense를 연동할 수 없습니다.",
      "cafe.naver.com": "네이버 카페는 Google AdSense를 연동할 수 없습니다.",
      "blog.daum.net": "다음 블로그는 Google AdSense를 연동할 수 없습니다.",
      "velog.io": "velog는 Google AdSense를 연동할 수 없습니다. 자체 도메인 블로그를 만드세요.",
      "medium.com": "Medium은 자체 수익 프로그램이 있으며, AdSense를 직접 연동할 수 없습니다.",
      "brunch.co.kr": "브런치는 Google AdSense를 연동할 수 없습니다.",
      "notion.site": "Notion 사이트는 Google AdSense를 연동할 수 없습니다.",
    };

    const unsupportedKey = Object.keys(unsupportedPlatforms).find((key) =>
      hostname === key || hostname.endsWith("." + key)
    );
    if (unsupportedKey) {
      return NextResponse.json({
        url: finalUrl,
        statusCode,
        score: 0,
        verdict: "AdSense 연동 불가 플랫폼",
        verdictColor: "red",
        totalChecks: 0,
        passedChecks: 0,
        criticalFails: 1,
        majorFails: 0,
        minorFails: 0,
        checks: [{
          id: "unsupported-platform",
          category: "기본 요건",
          name: "AdSense 연동 가능 플랫폼",
          passed: false,
          severity: "critical" as const,
          detail: unsupportedPlatforms[unsupportedKey],
          solution: "자체 도메인(yourdomain.com)을 구매하고, WordPress, Ghost, Next.js 등으로 블로그를 만들어 호스팅하세요. Vercel, Netlify 등에서 무료 호스팅이 가능합니다.",
        }],
        deepAnalysis: {
          totalPages: 0, analyzedPages: 0, avgCharCount: 0, avgHeadings: 0,
          avgImages: 0, pageDetails: [], domainAge: null, pageSpeed: null,
          policyViolations: [], internalLinks: { count: 0, unique: 0 },
        },
      });
    }

    // 2단계: 병렬로 외부 데이터 수집
    const [
      sitemapUrls,
      rssCount,
      pageSpeedResult,
      domainAgeResult,
      pageExistence,
    ] = await Promise.all([
      parseSitemap(baseUrl),
      parseRSSCount(baseUrl),
      getPageSpeedScore(finalUrl),
      getDomainAge(new URL(finalUrl).hostname),
      // 필수 페이지 URL 직접 확인
      (async () => {
        const pages = [
          { key: "privacy", paths: ["/privacy", "/privacy-policy", "/policy", "/개인정보처리방침", "/개인정보"] },
          { key: "terms", paths: ["/terms", "/terms-of-service", "/tos", "/이용약관"] },
          { key: "about", paths: ["/about", "/about-us", "/intro", "/소개"] },
          { key: "contact", paths: ["/contact", "/contact-us", "/문의"] },
        ];
        const result: Record<string, boolean> = {};
        await Promise.all(
          pages.map(async ({ key, paths }) => {
            for (const p of paths) {
              try {
                const res = await fetch(baseUrl + encodeURI(p), {
                  method: "HEAD",
                  signal: AbortSignal.timeout(3000),
                  redirect: "follow",
                });
                if (res.ok) { result[key] = true; return; }
              } catch { /* ignore */ }
            }
            result[key] = false;
          })
        );
        return result;
      })(),
    ]);

    // 3단계: 사이트맵에서 발견된 페이지들의 콘텐츠 품질 분석
    const totalPageCount = sitemapUrls.length || rssCount;
    let pageAnalyses: PageAnalysis[] = [];
    if (sitemapUrls.length > 0) {
      // 메인 페이지 제외, 최대 10개 샘플링
      const contentUrls = sitemapUrls.filter((u) => u !== finalUrl && u !== baseUrl + "/");
      pageAnalyses = await analyzePages(contentUrls, 10);
    }

    // === 체크 항목 시작 ===

    // ── 기본 요건 ──

    // 1. HTTPS
    checks.push({
      id: "https",
      category: "기본 요건",
      name: "HTTPS (SSL) 적용",
      passed: finalUrl.startsWith("https://"),
      severity: "critical",
      detail: finalUrl.startsWith("https://")
        ? "HTTPS로 안전하게 연결됩니다."
        : "HTTP 연결 — 보안 취약.",
      solution: "호스팅에서 SSL 인증서를 설정하세요. Vercel, Netlify는 자동 HTTPS 지원.",
    });

    // 2. 커스텀 도메인
    const freeDomains = [
      "blogspot", "wordpress.com", "wixsite", "tistory.com", "github.io",
      "netlify.app", "vercel.app", "herokuapp.com", "weebly.com",
      "squarespace.com", "tumblr.com", "medium.com", "notion.site",
      "carrd.co", "webflow.io", "surge.sh", "pages.dev",
      "firebaseapp.com", "web.app",
    ];
    const isCustomDomain = !freeDomains.some((d) => finalUrl.includes(d));
    checks.push({
      id: "custom-domain",
      category: "기본 요건",
      name: "커스텀 도메인 사용",
      passed: isCustomDomain,
      severity: "critical",
      detail: isCustomDomain
        ? `커스텀 도메인 사용 중: ${new URL(finalUrl).hostname}`
        : "무료 서브도메인 사용 중 — AdSense 승인 불가.",
      solution: "자체 도메인(yourdomain.com)을 구매하세요. 연 1~2만원이면 가능합니다.",
    });

    // 3. 도메인 나이
    const domainAgeOk = domainAgeResult ? domainAgeResult.ageMonths >= 3 : false;
    checks.push({
      id: "domain-age",
      category: "기본 요건",
      name: "도메인 운영 기간 (3개월+)",
      passed: domainAgeOk,
      severity: "critical",
      detail: domainAgeResult
        ? `최초 발견: ${domainAgeResult.firstSeen} (약 ${domainAgeResult.ageMonths}개월 전)`
        : "도메인 나이를 확인할 수 없습니다. 신규 도메인일 수 있습니다.",
      solution: "최소 3~6개월 이상 꾸준히 사이트를 운영한 후 AdSense를 신청하세요.",
    });

    // ── 콘텐츠 ──

    // 4. 총 글(페이지) 수
    const hasEnoughPages = totalPageCount >= 20;
    checks.push({
      id: "total-pages",
      category: "콘텐츠",
      name: "충분한 글 수 (20개+)",
      passed: hasEnoughPages,
      severity: "critical",
      detail: totalPageCount > 0
        ? `사이트맵/RSS에서 ${totalPageCount}개의 페이지 발견.`
        : "사이트맵/RSS를 찾지 못했습니다. 글 수를 확인할 수 없습니다.",
      solution: "최소 20~30개의 독창적인 글을 작성하세요. 각 글은 800자 이상, 특정 주제에 대한 깊이 있는 내용이어야 합니다.",
    });

    // 5. 개별 글 콘텐츠 품질
    let avgCharCount = 0;
    let goodContentPages = 0;
    if (pageAnalyses.length > 0) {
      avgCharCount = Math.round(pageAnalyses.reduce((sum, p) => sum + p.charCount, 0) / pageAnalyses.length);
      goodContentPages = pageAnalyses.filter((p) => p.hasEnoughContent).length;
    }
    const contentQualityOk = pageAnalyses.length > 0 && goodContentPages >= pageAnalyses.length * 0.7;
    checks.push({
      id: "content-quality",
      category: "콘텐츠",
      name: "글별 콘텐츠 충분성 (800자+)",
      passed: contentQualityOk,
      severity: "critical",
      detail: pageAnalyses.length > 0
        ? `${pageAnalyses.length}개 글 분석 → 평균 ${avgCharCount.toLocaleString()}자, ${goodContentPages}/${pageAnalyses.length}개가 800자 이상.`
        : "사이트맵이 없어 개별 글을 분석할 수 없었습니다. sitemap.xml을 추가하세요.",
      solution: "모든 글이 최소 800~1500자 이상이어야 합니다. sitemap.xml도 반드시 추가하세요.",
    });

    // 6. 콘텐츠 구조 (제목, 이미지 활용)
    let avgHeadings = 0;
    let avgImages = 0;
    if (pageAnalyses.length > 0) {
      avgHeadings = Math.round(pageAnalyses.reduce((sum, p) => sum + p.headingCount, 0) / pageAnalyses.length);
      avgImages = Math.round(pageAnalyses.reduce((sum, p) => sum + p.imageCount, 0) / pageAnalyses.length);
    }
    const structureOk = pageAnalyses.length > 0 && avgHeadings >= 2 && avgImages >= 1;
    checks.push({
      id: "content-structure",
      category: "콘텐츠",
      name: "콘텐츠 구조 (소제목/이미지)",
      passed: structureOk,
      severity: "major",
      detail: pageAnalyses.length > 0
        ? `평균 소제목 ${avgHeadings}개, 이미지 ${avgImages}개 / 글.`
        : "사이트맵이 없어 글 구조를 분석할 수 없었습니다.",
      solution: "각 글에 H2/H3 소제목 3~5개, 관련 이미지 2~3개를 넣어 가독성을 높이세요.",
    });

    // 7. 메인 페이지 콘텐츠
    $("script, style, noscript, iframe").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const hasKorean = /[가-힣]/.test(bodyText);
    const mainCharCount = bodyText.replace(/\s/g, "").length;
    const mainWordCount = bodyText.split(/\s+/).length;
    const mainContentOk = hasKorean ? mainCharCount >= 500 : mainWordCount >= 300;
    checks.push({
      id: "main-content",
      category: "콘텐츠",
      name: "메인 페이지 콘텐츠",
      passed: mainContentOk,
      severity: "major",
      detail: `메인 페이지: ${hasKorean ? mainCharCount.toLocaleString() + "자" : mainWordCount + "단어"} 감지.`,
      solution: "메인 페이지에도 사이트 소개, 최신 글 목록 등 충분한 콘텐츠가 있어야 합니다.",
    });

    // 8. 정책 위반 스캔
    const policyResult = scanPolicyViolations(bodyText);
    // 하위 페이지도 스캔
    for (const pa of pageAnalyses) {
      const pageFetch = await fetchPage(pa.url);
      if (pageFetch) {
        const p$ = cheerio.load(pageFetch.html);
        p$("script, style").remove();
        const subResult = scanPolicyViolations(p$("body").text());
        policyResult.violations.push(...subResult.violations);
        if (subResult.hasViolation) policyResult.hasViolation = true;
      }
    }
    const uniqueViolations = [...new Set(policyResult.violations)];
    checks.push({
      id: "policy",
      category: "콘텐츠",
      name: "Google 정책 위반 콘텐츠",
      passed: !policyResult.hasViolation,
      severity: "critical",
      detail: policyResult.hasViolation
        ? `정책 위반 의심: ${uniqueViolations.join(", ")}`
        : "정책 위반 키워드가 감지되지 않았습니다.",
      solution: "성인, 도박, 약물, 무기, 해킹 관련 콘텐츠를 모두 제거하세요. Google AdSense 프로그램 정책을 반드시 확인하세요.",
    });

    // ── 필수 페이지 ──

    const allLinks = $("a")
      .map((_, el) => ({ href: $(el).attr("href") || "", text: $(el).text().toLowerCase() }))
      .get();

    // 9. 개인정보 처리방침
    const hasPrivacy = pageExistence["privacy"] || allLinks.some((l) =>
      l.text.includes("privacy") || l.text.includes("개인정보") ||
      l.text.includes("정보처리") || l.text.includes("정보보호") ||
      l.href.includes("privacy") || l.href.includes("policy")
    );
    checks.push({
      id: "privacy",
      category: "필수 페이지",
      name: "개인정보 처리방침",
      passed: hasPrivacy,
      severity: "critical",
      detail: hasPrivacy ? "개인정보 처리방침 페이지 확인됨." : "개인정보 처리방침 페이지 미발견.",
      solution: '반드시 "개인정보 처리방침" 페이지를 만들고 푸터에 링크하세요. AdSense 필수 요구사항.',
    });

    // 10. 이용약관
    const hasTerms = pageExistence["terms"] || allLinks.some((l) =>
      l.text.includes("terms") || l.text.includes("이용약관") ||
      l.text.includes("서비스 약관") || l.text.includes("이용 약관") ||
      l.text.includes("disclaimer") || l.href.includes("terms")
    );
    checks.push({
      id: "terms",
      category: "필수 페이지",
      name: "이용약관",
      passed: hasTerms,
      severity: "major",
      detail: hasTerms ? "이용약관 페이지 확인됨." : "이용약관 페이지 미발견.",
      solution: '"이용약관" 페이지를 만들고 푸터에 링크하세요.',
    });

    // 11. 소개 페이지
    const hasAbout = pageExistence["about"] || allLinks.some((l) =>
      l.text.includes("about") || l.text.includes("소개") ||
      l.text.includes("프로필") || l.text.includes("운영자") ||
      l.href.includes("about") || l.href.includes("profile")
    );
    checks.push({
      id: "about",
      category: "필수 페이지",
      name: "소개(About) 페이지",
      passed: hasAbout,
      severity: "major",
      detail: hasAbout ? "소개 페이지 확인됨." : "소개 페이지 미발견.",
      solution: '"소개" 페이지에 운영자 정보, 사이트 목적, 전문성을 명시하세요.',
    });

    // 12. 연락처
    const hasContact = pageExistence["contact"] || allLinks.some((l) =>
      l.text.includes("contact") || l.text.includes("연락") ||
      l.text.includes("문의") || l.text.includes("고객센터") ||
      l.href.includes("contact") || l.href.includes("mailto:")
    );
    checks.push({
      id: "contact",
      category: "필수 페이지",
      name: "연락처/문의 페이지",
      passed: hasContact,
      severity: "major",
      detail: hasContact ? "연락처 페이지 확인됨." : "연락처 페이지 미발견.",
      solution: '"연락처" 페이지에 이메일, 연락 양식 등을 제공하세요.',
    });

    // ── SEO ──

    // 13. 타이틀
    const title = $("title").text().trim();
    const hasGoodTitle = title.length >= 5 && title.length <= 70;
    checks.push({
      id: "title",
      category: "SEO",
      name: "페이지 타이틀",
      passed: hasGoodTitle,
      severity: "major",
      detail: title ? `"${title}" (${title.length}자)` : "타이틀 태그 없음.",
      solution: "5~70자의 명확한 타이틀을 설정하세요.",
    });

    // 14. 메타 디스크립션
    const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
    const hasGoodDesc = metaDesc.length >= 50 && metaDesc.length <= 160;
    checks.push({
      id: "meta-desc",
      category: "SEO",
      name: "메타 디스크립션",
      passed: hasGoodDesc,
      severity: "major",
      detail: metaDesc ? `${metaDesc.length}자` : "메타 디스크립션 없음.",
      solution: "50~160자의 사이트 설명을 meta description에 추가하세요.",
    });

    // 15. H1 태그
    const reloadedHtml = mainPage.html;
    const fresh$ = cheerio.load(reloadedHtml);
    const h1Count = fresh$("h1").length;
    checks.push({
      id: "h1",
      category: "SEO",
      name: "H1 태그",
      passed: h1Count === 1,
      severity: "minor",
      detail: h1Count === 0 ? "H1 태그 없음." : h1Count === 1 ? "H1 태그 1개 — 적절." : `H1 태그 ${h1Count}개 — 1개만 사용하세요.`,
      solution: "페이지당 H1 태그를 1개만 사용하세요.",
    });

    // 16. robots.txt
    let hasRobots = false;
    try {
      const res = await fetch(baseUrl + "/robots.txt", { signal: AbortSignal.timeout(3000) });
      hasRobots = res.ok;
    } catch { /* ignore */ }
    checks.push({
      id: "robots",
      category: "SEO",
      name: "robots.txt",
      passed: hasRobots,
      severity: "minor",
      detail: hasRobots ? "robots.txt 존재." : "robots.txt 미발견.",
      solution: "robots.txt를 만들어 크롤러가 사이트를 올바르게 색인하게 하세요.",
    });

    // 17. sitemap.xml
    const hasSitemap = sitemapUrls.length > 0;
    checks.push({
      id: "sitemap",
      category: "SEO",
      name: "sitemap.xml",
      passed: hasSitemap,
      severity: "minor",
      detail: hasSitemap ? `sitemap.xml 존재 (${sitemapUrls.length}개 URL).` : "sitemap.xml 미발견.",
      solution: "sitemap.xml을 생성하고 Google Search Console에 제출하세요.",
    });

    // 18. Open Graph 태그
    const hasOG = fresh$('meta[property="og:title"]').length > 0 || fresh$('meta[property="og:description"]').length > 0;
    checks.push({
      id: "og",
      category: "SEO",
      name: "Open Graph 태그",
      passed: hasOG,
      severity: "minor",
      detail: hasOG ? "OG 태그 설정됨." : "OG 태그 없음.",
      solution: "og:title, og:description, og:image를 추가하세요.",
    });

    // 19. Canonical 태그
    const hasCanonical = fresh$('link[rel="canonical"]').length > 0;
    checks.push({
      id: "canonical",
      category: "SEO",
      name: "Canonical 태그",
      passed: hasCanonical,
      severity: "minor",
      detail: hasCanonical ? "Canonical 태그 설정됨." : "Canonical 태그 없음.",
      solution: "canonical 태그를 추가하여 중복 콘텐츠를 방지하세요.",
    });

    // ── 사용자 경험 ──

    // 20. 모바일 반응형
    const hasViewport = fresh$('meta[name="viewport"]').length > 0;
    checks.push({
      id: "mobile",
      category: "사용자 경험",
      name: "모바일 반응형 (Viewport)",
      passed: hasViewport,
      severity: "critical",
      detail: hasViewport ? "viewport 메타태그 설정됨." : "viewport 메타태그 없음.",
      solution: "viewport 메타태그를 추가하세요. 모바일 최적화는 필수.",
    });

    // 21. 네비게이션
    const navLinks = fresh$(
      "nav a, header a, .nav a, .menu a, .navbar a, .navigation a, [role='navigation'] a, .gnb a, .lnb a, #header a, #nav a"
    ).length;
    const hasNav = navLinks >= 3;
    checks.push({
      id: "navigation",
      category: "사용자 경험",
      name: "네비게이션 메뉴",
      passed: hasNav,
      severity: "major",
      detail: hasNav ? `네비게이션 링크 ${navLinks}개.` : "명확한 네비게이션 미발견.",
      solution: "홈, 카테고리, 소개, 연락처 등을 포함한 네비게이션 메뉴를 만드세요.",
    });

    // 22. 내부 링크
    const internalLinks = analyzeInternalLinks(fresh$, baseUrl);
    const hasGoodLinking = internalLinks.unique >= 10;
    checks.push({
      id: "internal-links",
      category: "사용자 경험",
      name: "내부 링크 구조",
      passed: hasGoodLinking,
      severity: "major",
      detail: `내부 링크 ${internalLinks.count}개 (고유 ${internalLinks.unique}개).`,
      solution: "글 사이에 관련 글 링크를 넣어 사용자가 사이트 내에서 더 많은 글을 읽을 수 있게 하세요.",
    });

    // 23. 이미지 ALT
    const images = fresh$("img");
    const totalImages = images.length;
    const imagesWithAlt = images.filter((_, el) => (fresh$(el).attr("alt") || "").trim().length > 0).length;
    const altRatio = totalImages > 0 ? imagesWithAlt / totalImages : 1;
    checks.push({
      id: "img-alt",
      category: "사용자 경험",
      name: "이미지 ALT 속성",
      passed: altRatio >= 0.8,
      severity: "minor",
      detail: totalImages > 0
        ? `${totalImages}개 이미지 중 ${imagesWithAlt}개 ALT 있음 (${Math.round(altRatio * 100)}%).`
        : "이미지 없음.",
      solution: "모든 이미지에 설명적인 alt 속성을 추가하세요.",
    });

    // ── 성능 ──

    // 24. PageSpeed 성능
    if (pageSpeedResult) {
      const perfOk = pageSpeedResult.performance >= 50;
      checks.push({
        id: "pagespeed",
        category: "성능",
        name: "Google PageSpeed 점수 (모바일)",
        passed: perfOk,
        severity: "major",
        detail: pageSpeedResult.details.join(" | "),
        solution: "이미지 최적화, 코드 압축, 캐싱 설정으로 모바일 50점 이상을 목표로 하세요.",
      });
    }

    // 25. 페이지 크기
    const htmlSize = html.length;
    const isHeavy = htmlSize > 500000;
    checks.push({
      id: "page-size",
      category: "성능",
      name: "페이지 크기",
      passed: !isHeavy,
      severity: "minor",
      detail: `HTML 크기: ${(htmlSize / 1024).toFixed(0)}KB.`,
      solution: "불필요한 스크립트 제거, 이미지 최적화로 페이지를 가볍게 만드세요.",
    });

    // ── 기타 ──

    // 26. 저작권 표시
    const freshBodyText = fresh$("body").text();
    const hasCopyright = freshBodyText.includes("©") || freshBodyText.toLowerCase().includes("copyright") || freshBodyText.includes("저작권");
    checks.push({
      id: "copyright",
      category: "기타",
      name: "저작권 표시",
      passed: hasCopyright,
      severity: "minor",
      detail: hasCopyright ? "저작권 표시 있음." : "저작권 표시 없음.",
      solution: '푸터에 "© 2024 사이트명. All rights reserved." 표시를 추가하세요.',
    });

    // 27. 광고 과다
    const adScripts = fresh$('script[src*="adsbygoogle"], ins.adsbygoogle, [class*="ad-"], [id*="ad-banner"]').length;
    const hasExcessiveAds = adScripts > 5;
    checks.push({
      id: "ads",
      category: "기타",
      name: "광고 과다 여부",
      passed: !hasExcessiveAds,
      severity: "major",
      detail: adScripts > 0 ? `광고 관련 요소 ${adScripts}개 감지.` : "기존 광고 코드 미감지.",
      solution: "신청 전 다른 광고 네트워크를 모두 제거하세요. 콘텐츠 대비 광고가 많으면 거부됩니다.",
    });

    // === 점수 계산 ===
    const totalChecks = checks.length;
    const passedChecks = checks.filter((c) => c.passed).length;
    const criticalFails = checks.filter((c) => !c.passed && c.severity === "critical");
    const majorFails = checks.filter((c) => !c.passed && c.severity === "major");
    const minorFails = checks.filter((c) => !c.passed && c.severity === "minor");

    // 가중 점수: critical=5점, major=3점, minor=1점
    const maxScore = checks.reduce((sum, c) => sum + (c.severity === "critical" ? 5 : c.severity === "major" ? 3 : 1), 0);
    const lostScore = checks
      .filter((c) => !c.passed)
      .reduce((sum, c) => sum + (c.severity === "critical" ? 5 : c.severity === "major" ? 3 : 1), 0);
    const score = Math.max(0, Math.round(((maxScore - lostScore) / maxScore) * 100));

    let verdict: string;
    let verdictColor: string;
    if (score >= 85 && criticalFails.length === 0) {
      verdict = "승인 가능성 높음 — 신청을 추천합니다";
      verdictColor = "green";
    } else if (score >= 60 && criticalFails.length <= 1) {
      verdict = "보완 후 승인 가능 — 필수 항목을 먼저 해결하세요";
      verdictColor = "yellow";
    } else {
      verdict = "승인 어려움 — 아래 항목을 개선한 후 재시도하세요";
      verdictColor = "red";
    }

    // === 페이지 분석 상세 ===
    const pageDetails = pageAnalyses.map((p) => ({
      url: p.url,
      title: p.title.substring(0, 60),
      chars: p.charCount,
      headings: p.headingCount,
      images: p.imageCount,
      ok: p.hasEnoughContent,
    }));

    return NextResponse.json({
      url: finalUrl,
      statusCode,
      score,
      verdict,
      verdictColor,
      totalChecks,
      passedChecks,
      criticalFails: criticalFails.length,
      majorFails: majorFails.length,
      minorFails: minorFails.length,
      checks,
      // 심화 분석 데이터
      deepAnalysis: {
        totalPages: totalPageCount,
        analyzedPages: pageAnalyses.length,
        avgCharCount,
        avgHeadings,
        avgImages,
        pageDetails,
        domainAge: domainAgeResult,
        pageSpeed: pageSpeedResult,
        policyViolations: uniqueViolations,
        internalLinks,
      },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
