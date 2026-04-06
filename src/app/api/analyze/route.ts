import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface CheckResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  severity: "critical" | "major" | "minor";
  detail: string;
  solution: string;
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    const normalizedUrl = normalizeUrl(url);

    let html: string;
    let finalUrl: string;
    let responseHeaders: Headers;
    let statusCode: number;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
      });
      clearTimeout(timeout);
      html = await res.text();
      finalUrl = res.url;
      responseHeaders = res.headers;
      statusCode = res.status;
    } catch {
      return NextResponse.json(
        {
          error:
            "사이트에 접속할 수 없습니다. URL을 확인해주세요. (HTTPS 필요, 사이트가 온라인 상태인지 확인)",
        },
        { status: 400 }
      );
    }

    const $ = cheerio.load(html);
    const checks: CheckResult[] = [];

    // 1. HTTPS 확인
    checks.push({
      id: "https",
      category: "보안",
      name: "HTTPS (SSL) 적용",
      passed: finalUrl.startsWith("https://"),
      severity: "critical",
      detail: finalUrl.startsWith("https://")
        ? "사이트가 HTTPS로 안전하게 연결됩니다."
        : "사이트가 HTTP로 연결되어 보안이 취약합니다.",
      solution: finalUrl.startsWith("https://")
        ? ""
        : "호스팅 제공업체에서 무료 SSL 인증서(Let's Encrypt)를 설정하세요. Vercel, Netlify 등은 자동 HTTPS를 지원합니다.",
    });

    // 2. 타이틀 태그
    const title = $("title").text().trim();
    const hasGoodTitle = title.length >= 5 && title.length <= 70;
    checks.push({
      id: "title",
      category: "SEO",
      name: "페이지 타이틀",
      passed: hasGoodTitle,
      severity: "major",
      detail: title
        ? `타이틀: "${title}" (${title.length}자)`
        : "타이틀 태그가 없습니다.",
      solution: hasGoodTitle
        ? ""
        : "5~70자 사이의 명확하고 독창적인 타이틀을 설정하세요. 사이트의 핵심 주제를 포함해야 합니다.",
    });

    // 3. 메타 디스크립션
    const metaDesc =
      $('meta[name="description"]').attr("content")?.trim() || "";
    const hasGoodDesc = metaDesc.length >= 50 && metaDesc.length <= 160;
    checks.push({
      id: "meta-desc",
      category: "SEO",
      name: "메타 디스크립션",
      passed: hasGoodDesc,
      severity: "major",
      detail: metaDesc
        ? `디스크립션: "${metaDesc.substring(0, 80)}..." (${metaDesc.length}자)`
        : "메타 디스크립션이 없습니다.",
      solution: hasGoodDesc
        ? ""
        : "50~160자 사이의 사이트 설명을 <meta name='description'> 태그에 추가하세요. 검색엔진이 이를 활용합니다.",
    });

    // 4. 콘텐츠 양 체크
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(/\s+/).length;
    const hasEnoughContent = wordCount >= 300;
    checks.push({
      id: "content-amount",
      category: "콘텐츠",
      name: "충분한 콘텐츠 양",
      passed: hasEnoughContent,
      severity: "critical",
      detail: `메인 페이지 텍스트 약 ${wordCount}단어 감지.`,
      solution: hasEnoughContent
        ? ""
        : "Google은 최소 20~30개의 고품질 글(각 800~1500자 이상)을 권장합니다. 독창적이고 유용한 콘텐츠를 꾸준히 작성하세요.",
    });

    // 5. 네비게이션 메뉴
    const navLinks = $("nav a, header a, .nav a, .menu a, .navbar a").length;
    const hasNav = navLinks >= 3;
    checks.push({
      id: "navigation",
      category: "사용자 경험",
      name: "네비게이션 메뉴",
      passed: hasNav,
      severity: "major",
      detail: hasNav
        ? `네비게이션에 ${navLinks}개의 링크가 있습니다.`
        : "명확한 네비게이션 메뉴를 찾지 못했습니다.",
      solution: hasNav
        ? ""
        : "사이트 상단에 명확한 네비게이션 메뉴를 추가하세요. 홈, 카테고리, 소개, 연락처 등의 메뉴가 필요합니다.",
    });

    // 6. 개인정보 처리방침
    const allLinks = $("a")
      .map((_, el) => ({
        href: $(el).attr("href") || "",
        text: $(el).text().toLowerCase(),
      }))
      .get();
    const hasPrivacy = allLinks.some(
      (l) =>
        l.text.includes("privacy") ||
        l.text.includes("개인정보") ||
        l.href.includes("privacy") ||
        l.text.includes("프라이버시")
    );
    checks.push({
      id: "privacy-policy",
      category: "필수 페이지",
      name: "개인정보 처리방침",
      passed: hasPrivacy,
      severity: "critical",
      detail: hasPrivacy
        ? "개인정보 처리방침 링크가 발견되었습니다."
        : "개인정보 처리방침 페이지 링크를 찾지 못했습니다.",
      solution: hasPrivacy
        ? ""
        : '반드시 "개인정보 처리방침(Privacy Policy)" 페이지를 만들고 푸터에 링크를 추가하세요. Google AdSense 필수 요구사항입니다.',
    });

    // 7. 이용약관 / 서비스 약관
    const hasTerms = allLinks.some(
      (l) =>
        l.text.includes("terms") ||
        l.text.includes("이용약관") ||
        l.text.includes("서비스 약관") ||
        l.href.includes("terms")
    );
    checks.push({
      id: "terms",
      category: "필수 페이지",
      name: "이용약관",
      passed: hasTerms,
      severity: "major",
      detail: hasTerms
        ? "이용약관 링크가 발견되었습니다."
        : "이용약관 페이지 링크를 찾지 못했습니다.",
      solution: hasTerms
        ? ""
        : '"이용약관(Terms of Service)" 페이지를 만들고 푸터에 링크를 추가하세요.',
    });

    // 8. 소개 페이지 (About)
    const hasAbout = allLinks.some(
      (l) =>
        l.text.includes("about") ||
        l.text.includes("소개") ||
        l.href.includes("about") ||
        l.text.includes("회사소개")
    );
    checks.push({
      id: "about",
      category: "필수 페이지",
      name: "소개 페이지",
      passed: hasAbout,
      severity: "major",
      detail: hasAbout
        ? "소개(About) 페이지 링크가 발견되었습니다."
        : "소개(About) 페이지 링크를 찾지 못했습니다.",
      solution: hasAbout
        ? ""
        : '"소개(About)" 페이지를 만들어 사이트 운영자 정보, 사이트 목적 등을 명시하세요.',
    });

    // 9. 연락처 페이지
    const hasContact = allLinks.some(
      (l) =>
        l.text.includes("contact") ||
        l.text.includes("연락") ||
        l.text.includes("문의") ||
        l.href.includes("contact")
    );
    checks.push({
      id: "contact",
      category: "필수 페이지",
      name: "연락처 / 문의 페이지",
      passed: hasContact,
      severity: "major",
      detail: hasContact
        ? "연락처 페이지 링크가 발견되었습니다."
        : "연락처/문의 페이지 링크를 찾지 못했습니다.",
      solution: hasContact
        ? ""
        : '"연락처(Contact)" 페이지를 만들어 이메일, 연락 양식 등을 제공하세요.',
    });

    // 10. 이미지 alt 태그
    const images = $("img");
    const totalImages = images.length;
    const imagesWithAlt = images.filter(
      (_, el) => ($(el).attr("alt") || "").trim().length > 0
    ).length;
    const altRatio = totalImages > 0 ? imagesWithAlt / totalImages : 1;
    checks.push({
      id: "img-alt",
      category: "SEO",
      name: "이미지 ALT 속성",
      passed: altRatio >= 0.8,
      severity: "minor",
      detail:
        totalImages > 0
          ? `${totalImages}개 이미지 중 ${imagesWithAlt}개에 ALT 속성 있음 (${Math.round(altRatio * 100)}%)`
          : "이미지가 감지되지 않았습니다.",
      solution:
        altRatio >= 0.8
          ? ""
          : "모든 이미지에 설명적인 alt 속성을 추가하세요. 검색엔진 최적화와 접근성에 중요합니다.",
    });

    // 11. 모바일 반응형 (viewport)
    const hasViewport = $('meta[name="viewport"]').length > 0;
    checks.push({
      id: "mobile",
      category: "사용자 경험",
      name: "모바일 반응형 (Viewport)",
      passed: hasViewport,
      severity: "critical",
      detail: hasViewport
        ? "viewport 메타태그가 설정되어 있습니다."
        : "viewport 메타태그가 없습니다.",
      solution: hasViewport
        ? ""
        : '<head>에 <meta name="viewport" content="width=device-width, initial-scale=1"> 태그를 추가하세요. 모바일 최적화는 필수입니다.',
    });

    // 12. H1 태그
    const h1Count = $("h1").length;
    checks.push({
      id: "h1",
      category: "SEO",
      name: "H1 태그 사용",
      passed: h1Count === 1,
      severity: "minor",
      detail:
        h1Count === 0
          ? "H1 태그가 없습니다."
          : h1Count === 1
            ? "H1 태그가 적절히 1개 사용되었습니다."
            : `H1 태그가 ${h1Count}개 사용되었습니다. 1개만 사용하세요.`,
      solution:
        h1Count === 1
          ? ""
          : "페이지당 H1 태그를 정확히 1개만 사용하세요. 페이지의 주제를 명확히 나타내야 합니다.",
    });

    // 13. robots.txt 확인
    let hasRobots = false;
    try {
      const robotsUrl = new URL("/robots.txt", finalUrl).toString();
      const robotsRes = await fetch(robotsUrl, {
        signal: AbortSignal.timeout(5000),
      });
      hasRobots = robotsRes.ok;
    } catch {
      // ignore
    }
    checks.push({
      id: "robots",
      category: "SEO",
      name: "robots.txt 파일",
      passed: hasRobots,
      severity: "minor",
      detail: hasRobots
        ? "robots.txt 파일이 존재합니다."
        : "robots.txt 파일을 찾지 못했습니다.",
      solution: hasRobots
        ? ""
        : "루트 디렉토리에 robots.txt 파일을 만들어 검색엔진 크롤러가 사이트를 올바르게 색인할 수 있게 하세요.",
    });

    // 14. sitemap 확인
    let hasSitemap = false;
    try {
      const sitemapUrl = new URL("/sitemap.xml", finalUrl).toString();
      const sitemapRes = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(5000),
      });
      hasSitemap = sitemapRes.ok;
    } catch {
      // ignore
    }
    checks.push({
      id: "sitemap",
      category: "SEO",
      name: "sitemap.xml 파일",
      passed: hasSitemap,
      severity: "minor",
      detail: hasSitemap
        ? "sitemap.xml 파일이 존재합니다."
        : "sitemap.xml 파일을 찾지 못했습니다.",
      solution: hasSitemap
        ? ""
        : "sitemap.xml을 생성하여 Google Search Console에 제출하세요. 검색엔진이 사이트 구조를 파악하는 데 도움이 됩니다.",
    });

    // 15. 광고 과다 여부 (기존 애드센스 코드 등)
    const adScripts = $('script[src*="adsbygoogle"], ins.adsbygoogle').length;
    const hasExcessiveAds = adScripts > 5;
    checks.push({
      id: "ads",
      category: "콘텐츠",
      name: "광고 과다 여부",
      passed: !hasExcessiveAds,
      severity: "major",
      detail:
        adScripts > 0
          ? `${adScripts}개의 광고 스크립트/슬롯이 감지되었습니다.`
          : "기존 광고 코드가 감지되지 않았습니다.",
      solution: hasExcessiveAds
        ? "광고가 너무 많으면 승인이 거부됩니다. 콘텐츠 대비 광고 비율을 줄이세요."
        : "",
    });

    // 16. 페이지 로딩 속도 (간접 지표 - HTML 크기)
    const htmlSize = html.length;
    const isHeavy = htmlSize > 500000;
    checks.push({
      id: "page-size",
      category: "성능",
      name: "페이지 크기",
      passed: !isHeavy,
      severity: "minor",
      detail: `HTML 크기: ${(htmlSize / 1024).toFixed(0)}KB`,
      solution: isHeavy
        ? "HTML이 너무 큽니다. 이미지 최적화, 불필요한 스크립트 제거, 코드 압축을 적용하세요."
        : "",
    });

    // 17. 저작권 / 복사 콘텐츠 경고 체크
    const hasCopyrightNotice =
      bodyText.includes("©") ||
      bodyText.toLowerCase().includes("copyright") ||
      bodyText.includes("저작권");
    checks.push({
      id: "copyright",
      category: "콘텐츠",
      name: "저작권 표시",
      passed: hasCopyrightNotice,
      severity: "minor",
      detail: hasCopyrightNotice
        ? "저작권 표시가 있습니다."
        : "저작권(Copyright) 표시를 찾지 못했습니다.",
      solution: hasCopyrightNotice
        ? ""
        : '푸터에 "© 2024 사이트명. All rights reserved." 같은 저작권 표시를 추가하세요.',
    });

    // 18. 도메인 나이 / 커스텀 도메인
    const isCustomDomain =
      !finalUrl.includes("blogspot") &&
      !finalUrl.includes("wordpress.com") &&
      !finalUrl.includes("wixsite") &&
      !finalUrl.includes("tistory") &&
      !finalUrl.includes("github.io");
    checks.push({
      id: "custom-domain",
      category: "기본 요건",
      name: "커스텀 도메인 사용",
      passed: isCustomDomain,
      severity: "critical",
      detail: isCustomDomain
        ? "커스텀 도메인을 사용하고 있습니다."
        : "무료 서브도메인을 사용하고 있습니다.",
      solution: isCustomDomain
        ? ""
        : "자체 도메인(예: yourdomain.com)을 구매하여 사용하세요. 무료 서브도메인은 AdSense 승인이 어렵습니다.",
    });

    // 19. Open Graph 태그
    const hasOG =
      $('meta[property="og:title"]').length > 0 ||
      $('meta[property="og:description"]').length > 0;
    checks.push({
      id: "og-tags",
      category: "SEO",
      name: "Open Graph 태그",
      passed: hasOG,
      severity: "minor",
      detail: hasOG
        ? "Open Graph 메타태그가 설정되어 있습니다."
        : "Open Graph 메타태그가 없습니다.",
      solution: hasOG
        ? ""
        : "og:title, og:description, og:image 등의 Open Graph 태그를 추가하면 소셜 미디어 공유 시 미리보기가 개선됩니다.",
    });

    // 20. canonical 태그
    const hasCanonical = $('link[rel="canonical"]').length > 0;
    checks.push({
      id: "canonical",
      category: "SEO",
      name: "Canonical 태그",
      passed: hasCanonical,
      severity: "minor",
      detail: hasCanonical
        ? "Canonical 태그가 설정되어 있습니다."
        : "Canonical 태그가 없습니다.",
      solution: hasCanonical
        ? ""
        : '<link rel="canonical" href="페이지URL"> 태그를 추가하여 중복 콘텐츠 문제를 방지하세요.',
    });

    // 점수 계산
    const totalChecks = checks.length;
    const passedChecks = checks.filter((c) => c.passed).length;
    const criticalFails = checks.filter(
      (c) => !c.passed && c.severity === "critical"
    );
    const majorFails = checks.filter(
      (c) => !c.passed && c.severity === "major"
    );
    const minorFails = checks.filter(
      (c) => !c.passed && c.severity === "minor"
    );

    let score = Math.round((passedChecks / totalChecks) * 100);
    // 크리티컬 항목 미통과 시 감점
    score -= criticalFails.length * 10;
    score = Math.max(0, Math.min(100, score));

    let verdict: string;
    let verdictColor: string;
    if (score >= 85 && criticalFails.length === 0) {
      verdict = "승인 가능성 높음";
      verdictColor = "green";
    } else if (score >= 60 && criticalFails.length <= 1) {
      verdict = "보완 후 승인 가능";
      verdictColor = "yellow";
    } else {
      verdict = "승인 어려움 - 개선 필요";
      verdictColor = "red";
    }

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
      contentType: responseHeaders.get("content-type") || "",
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "분석 중 오류가 발생했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
