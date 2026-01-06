'use client';

export const WhyPartnershipSection = () => {
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              なぜ探究に企業との連携が必要か
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">Why Partnership</span>
          </div>
          <p className="text-xl sm:text-2xl text-gray-700 font-medium mb-4">
            探究が本物になるのは、社会のリアルとつながったとき。
          </p>
          <p className="text-lg sm:text-xl text-gray-600">
            学校だけでも、企業だけでも届かなかった学びを、二者が組むことで生み出していきます。
          </p>
        </div>

        {/* キービジュアル：学校・企業・社会のニーズの循環図 */}
        <div className="max-w-5xl mx-auto mb-12">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
            <div className="relative w-full aspect-video">
              <svg
                viewBox="0 0 600 300"
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* 学校（左） */}
                <rect
                  x="50"
                  y="100"
                  width="100"
                  height="100"
                  fill="#f5b655"
                  opacity="0.2"
                  rx="10"
                />
                <text
                  x="100"
                  y="155"
                  textAnchor="middle"
                  className="text-lg font-bold fill-gray-900"
                >
                  学校
                </text>

                {/* 企業（右） */}
                <rect
                  x="450"
                  y="100"
                  width="100"
                  height="100"
                  fill="#f5b655"
                  opacity="0.2"
                  rx="10"
                />
                <text
                  x="500"
                  y="155"
                  textAnchor="middle"
                  className="text-lg font-bold fill-gray-900"
                >
                  企業
                </text>

                {/* 社会のニーズ（中央） */}
                <circle
                  cx="300"
                  cy="150"
                  r="50"
                  fill="#f5b655"
                  opacity="0.3"
                />
                <text
                  x="300"
                  y="155"
                  textAnchor="middle"
                  className="text-sm font-bold fill-gray-900"
                >
                  社会の
                </text>
                <text
                  x="300"
                  y="175"
                  textAnchor="middle"
                  className="text-sm font-bold fill-gray-900"
                >
                  ニーズ
                </text>

                {/* 矢印（循環） */}
                <path
                  d="M 150 150 L 250 150"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead2)"
                />
                <path
                  d="M 300 100 L 300 50 L 500 50 L 500 100"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead2)"
                />
                <path
                  d="M 450 150 L 350 150"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead2)"
                />
                <path
                  d="M 300 200 L 300 250 L 100 250 L 100 200"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead2)"
                />

                <defs>
                  <marker
                    id="arrowhead2"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                  </marker>
                </defs>
              </svg>
            </div>

            {/* キーワード */}
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {['職業理解', '視野拡大', '選択肢拡大', '人材確保', '地域活性'].map((keyword) => (
                <div
                  key={keyword}
                  className="bg-primary/10 text-primary font-semibold px-4 py-2 rounded-full text-sm md:text-base"
                >
                  {keyword}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 説明文 */}
        <div className="max-w-4xl mx-auto">
          <div className="prose prose-lg max-w-none">
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-4">
              学校には、「生徒一人ひとりの学びを支えたい」という思いと、探究の時間という枠組みがあります。企業には、「社会のニーズに応え続けるために、現場で試行錯誤してきた知恵」と、日々更新されているリアルな課題があります。
            </p>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-4">
              その2つがつながると、探究は「教室の中だけの学び」から、実際の社会と行き来する生きた学びへと変わります。生徒にとっては、自分の将来や社会との距離がぐっと近くなり、企業にとっては、次の世代の視点から気づきやアイデアを受け取る機会になります。
            </p>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
              地域にとっても、学校と企業が協働することで、子どもたちが地元への誇りや愛着を育むきっかけになります。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

