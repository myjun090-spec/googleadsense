"use client";

import { useState } from "react";

interface CheckResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  severity: "critical" | "major" | "minor";
  detail: string;
  solution: string;
}

interface AnalysisResult {
  url: string;
  score: number;
  verdict: string;
  verdictColor: string;
  totalChecks: number;
  passedChecks: number;
  criticalFails: number;
  majorFails: number;
  minorFails: number;
  checks: CheckResult[];
  limitations: string[];
}

const ADSENSE_TIPS = [
  {
    title: "최소 20~30개의 고품질 글 작성",
    desc: "각 글은 최소 800~1500자 이상, 독창적이고 유용한 정보를 담아야 합니다. 복사/번역 콘텐츠는 절대 금지입니다.",
  },
  {
    title: "사이트 운영 기간 최소 3~6개월",
    desc: "새로 만든 사이트는 승인이 어렵습니다. 꾸준히 콘텐츠를 작성하며 3~6개월 이상 운영하세요.",
  },
  {
    title: "필수 페이지 구비",
    desc: "개인정보 처리방침, 이용약관, 소개(About), 연락처(Contact) 페이지는 반드시 있어야 합니다.",
  },
  {
    title: "자체 도메인 사용",
    desc: "blogspot, wordpress.com 등 무료 서브도메인 대신 자체 도메인(yourdomain.com)을 사용하세요.",
  },
  {
    title: "모바일 반응형 디자인",
    desc: "모바일에서도 깔끔하게 보이는 반응형 디자인을 적용하세요. Google은 모바일 우선 색인을 사용합니다.",
  },
  {
    title: "깔끔한 사이트 구조",
    desc: "명확한 네비게이션, 카테고리 분류, 사이트맵 등 사용자가 쉽게 탐색할 수 있는 구조를 만드세요.",
  },
  {
    title: "저작권 위반 콘텐츠 없음",
    desc: "다른 사이트에서 복사한 글, 무단 사용 이미지가 없어야 합니다. 모든 콘텐츠는 직접 작성하세요.",
  },
  {
    title: "Google Search Console 등록",
    desc: "사이트를 Google Search Console에 등록하고 사이트맵을 제출하세요. 검색 노출에 도움이 됩니다.",
  },
];

const REJECTION_CASES = [
  {
    reason: "콘텐츠 부족 (Insufficient Content)",
    solution:
      "최소 20~30개의 독창적인 글을 작성하세요. 각 글은 800자 이상이어야 하며, 특정 주제에 대한 깊이 있는 정보를 제공해야 합니다.",
    icon: "📝",
  },
  {
    reason: "사이트 탐색 문제 (Site Navigation Issues)",
    solution:
      "명확한 메뉴 구조, 카테고리 분류, 검색 기능을 추가하세요. 사용자가 3클릭 이내에 원하는 콘텐츠에 도달할 수 있어야 합니다.",
    icon: "🧭",
  },
  {
    reason: "정책 위반 (Policy Violations)",
    solution:
      "성인 콘텐츠, 폭력, 약물, 저작권 침해 등의 콘텐츠가 없는지 확인하세요. Google AdSense 프로그램 정책을 꼼꼼히 읽어보세요.",
    icon: "⚠️",
  },
  {
    reason: "복사 콘텐츠 (Copied Content)",
    solution:
      "다른 사이트에서 복사하거나 AI로 대량 생성한 콘텐츠는 거부됩니다. 직접 경험과 지식을 바탕으로 독창적인 글을 작성하세요.",
    icon: "🚫",
  },
  {
    reason: "가치 없는 콘텐츠 (Low-Value Content)",
    solution:
      "단순 나열이나 얕은 내용 대신, 문제 해결, 튜토리얼, 깊이 있는 분석 등 실질적으로 도움이 되는 콘텐츠를 만드세요.",
    icon: "💡",
  },
  {
    reason: "트래픽 부족 (Insufficient Traffic)",
    solution:
      "SEO 최적화, 소셜 미디어 홍보, 키워드 연구를 통해 자연 검색 트래픽을 늘리세요. 일일 100+ 방문자를 목표로 하세요.",
    icon: "📈",
  },
];

function ScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 85 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-200",
    major: "bg-orange-100 text-orange-800 border-orange-200",
    minor: "bg-blue-100 text-blue-800 border-blue-200",
  };
  const labels: Record<string, string> = {
    critical: "필수",
    major: "중요",
    minor: "권장",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${colors[severity]}`}
    >
      {labels[severity]}
    </span>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"result" | "guide" | "cases">(
    "guide"
  );

  const analyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setActiveTab("result");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const failedChecks = result?.checks.filter((c) => !c.passed) || [];
  const passedChecks = result?.checks.filter((c) => c.passed) || [];

  return (
    <main className="flex-1">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Google AdSense 승인 도우미
          </h1>
          <p className="text-blue-100 text-lg mb-8">
            사이트를 분석하여 AdSense 승인을 받을 수 있도록 단계별 솔루션을
            제공합니다
          </p>

          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="사이트 URL을 입력하세요 (예: myblog.com)"
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-300"
              disabled={loading}
            />
            <button
              onClick={analyze}
              disabled={loading || !url.trim()}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-400 text-gray-900 font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  분석중...
                </span>
              ) : (
                "분석하기"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex border-b border-gray-200 mt-6">
          {(
            [
              ["result", "분석 결과"],
              ["guide", "승인 가이드"],
              ["cases", "거절 사례 & 해결법"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Result Tab */}
        {activeTab === "result" && (
          <>
            {!result && !loading && !error && (
              <div className="text-center text-gray-400 py-16">
                <div className="text-5xl mb-4">🔍</div>
                <p className="text-lg">
                  URL을 입력하고 분석하기를 눌러주세요
                </p>
              </div>
            )}

            {loading && (
              <div className="text-center py-16">
                <div className="text-5xl mb-4 animate-pulse-slow">🔍</div>
                <p className="text-lg text-gray-500">
                  사이트를 분석하고 있습니다...
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  20개 항목을 점검합니다
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-8 animate-fade-in">
                {/* Score Section */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <div className="grid md:grid-cols-3 gap-6 items-center">
                    <div className="text-center">
                      <ScoreGauge score={result.score} />
                      <p className="mt-3 text-sm text-gray-500">
                        AdSense 준비 점수
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <div
                        className={`text-xl font-bold mb-2 ${
                          result.verdictColor === "green"
                            ? "text-green-600"
                            : result.verdictColor === "yellow"
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {result.verdict}
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        분석 URL: {result.url}
                      </p>
                      <div className="flex gap-4 text-sm">
                        <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
                          통과 {result.passedChecks}개
                        </div>
                        {result.criticalFails > 0 && (
                          <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">
                            필수 미통과 {result.criticalFails}개
                          </div>
                        )}
                        {result.majorFails > 0 && (
                          <div className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg">
                            중요 미통과 {result.majorFails}개
                          </div>
                        )}
                        {result.minorFails > 0 && (
                          <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
                            권장 미통과 {result.minorFails}개
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Plan */}
                {failedChecks.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="text-lg font-bold mb-4 text-red-600">
                      개선이 필요한 항목 ({failedChecks.length}개)
                    </h2>
                    <div className="space-y-3">
                      {failedChecks
                        .sort((a, b) => {
                          const order = { critical: 0, major: 1, minor: 2 };
                          return order[a.severity] - order[b.severity];
                        })
                        .map((check, i) => (
                          <div
                            key={check.id}
                            className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-red-500 mt-0.5 text-lg">
                                ✗
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold">
                                    {i + 1}. {check.name}
                                  </span>
                                  <SeverityBadge severity={check.severity} />
                                  <span className="text-xs text-gray-400">
                                    [{check.category}]
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                  {check.detail}
                                </p>
                                <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
                                  <p className="text-sm text-blue-800">
                                    <span className="font-semibold">
                                      해결 방법:
                                    </span>{" "}
                                    {check.solution}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Passed Items */}
                {passedChecks.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="text-lg font-bold mb-4 text-green-600">
                      통과한 항목 ({passedChecks.length}개)
                    </h2>
                    <div className="grid gap-2">
                      {passedChecks.map((check) => (
                        <div
                          key={check.id}
                          className="flex items-center gap-3 p-3 bg-green-50 rounded-lg"
                        >
                          <span className="text-green-500">✓</span>
                          <span className="font-medium text-sm">
                            {check.name}
                          </span>
                          <span className="text-xs text-gray-400">
                            [{check.category}]
                          </span>
                          <span className="text-xs text-green-600 ml-auto">
                            {check.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Steps */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                  <h2 className="text-lg font-bold mb-3 text-blue-800">
                    다음 단계
                  </h2>
                  <ol className="space-y-2 text-sm text-blue-900">
                    <li>
                      1. 위의 <strong>필수(빨간색)</strong> 항목부터 순서대로
                      해결하세요.
                    </li>
                    <li>
                      2. 그 다음 <strong>중요(주황색)</strong> 항목을
                      개선하세요.
                    </li>
                    <li>
                      3. <strong>권장(파란색)</strong> 항목도 가능하면
                      적용하세요.
                    </li>
                    <li>
                      4. 모든 항목 개선 후, 최소 2주간 꾸준히 콘텐츠를
                      발행하세요.
                    </li>
                    <li>
                      5. Google Search Console에 사이트를 등록하고 색인을
                      요청하세요.
                    </li>
                    <li>
                      6. 준비가 되면 AdSense 신청
                    </li>
                  </ol>
                </div>

                {/* Limitations */}
                {result.limitations && result.limitations.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">
                      분석 한계 안내
                    </h3>
                    <ul className="space-y-1 text-xs text-gray-500">
                      {result.limitations.map((l, i) => (
                        <li key={i}>- {l}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Guide Tab */}
        {activeTab === "guide" && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">
              Google AdSense 승인 필수 가이드
            </h2>
            <p className="text-gray-600">
              아래 8가지 핵심 조건을 모두 충족하면 AdSense 승인 확률이 크게
              높아집니다.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {ADSENSE_TIPS.map((tip, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{tip.title}</h3>
                      <p className="text-sm text-gray-600">{tip.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mt-6">
              <h3 className="font-bold text-yellow-800 mb-2">
                추가 팁: 승인률을 높이는 방법
              </h3>
              <ul className="space-y-1 text-sm text-yellow-900">
                <li>
                  - 한 가지 주제(니치)에 집중하는 전문 블로그가 유리합니다
                </li>
                <li>
                  - 글 발행 주기를 일정하게 유지하세요 (주 2~3회 권장)
                </li>
                <li>
                  - 이미지, 동영상 등 멀티미디어 콘텐츠를 적절히 활용하세요
                </li>
                <li>- 다른 AdSense가 아닌 광고 네트워크는 미리 제거하세요</li>
                <li>
                  - 거부 후 재신청 시 최소 2~4주 간격을 두고 개선 후
                  신청하세요
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Cases Tab */}
        {activeTab === "cases" && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">
              자주 거절되는 사유와 해결 방법
            </h2>
            <p className="text-gray-600">
              Google AdSense에서 가장 흔한 거절 사유와 구체적인 해결 방법을
              확인하세요.
            </p>
            <div className="space-y-4">
              {REJECTION_CASES.map((c, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">{c.icon}</span>
                    <div>
                      <h3 className="font-semibold text-red-700 mb-2">
                        {c.reason}
                      </h3>
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                        <p className="text-sm text-green-800">
                          <span className="font-semibold">해결 방법:</span>{" "}
                          {c.solution}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 border rounded-xl p-5">
              <h3 className="font-bold mb-3">
                AdSense 승인 체크리스트
              </h3>
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                {[
                  "독창적인 콘텐츠 20개 이상",
                  "각 글 800자 이상",
                  "개인정보 처리방침 페이지",
                  "이용약관 페이지",
                  "소개(About) 페이지",
                  "연락처(Contact) 페이지",
                  "HTTPS (SSL) 적용",
                  "자체 도메인 사용",
                  "모바일 반응형 디자인",
                  "명확한 네비게이션 메뉴",
                  "sitemap.xml 제출",
                  "Google Search Console 등록",
                  "robots.txt 설정",
                  "저작권 위반 콘텐츠 없음",
                  "깔끔한 디자인과 레이아웃",
                  "사이트 운영 3개월 이상",
                ].map((item, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-sm text-gray-400 border-t">
        <p>
          Google AdSense 승인 도우미 | 이 도구는 참고용이며, 실제 승인 여부는
          Google의 판단에 따릅니다.
        </p>
      </footer>
    </main>
  );
}
