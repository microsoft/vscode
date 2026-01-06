'use client';

const steps = [
  {
    step: 'STEP1',
    title: 'お問い合わせ',
    description: '「まずは話を聞いてみたい」「ウチのこの商品や技術をもっと広めたい」「業界認知を広めたい」等何なりとお問合せください。',
  },
  {
    step: 'STEP2',
    title: 'オンラインミーティング・ヒアリング',
    description: '「どんなテーマで関われそうか」「どんな地域や学校とつながりたいか」をオンラインで30〜45分ほどヒアリングします。',
  },
  {
    step: 'STEP3',
    title: '初期ご提案',
    description: '貴社の事業内容や大切にしている価値観を踏まえ、授業のテーマ・探究の流れ・企業側の関わり方（登壇／インタビュー／フィードバックなど）をMoonShot側で案としてまとめ、ご提案します。',
  },
  {
    step: 'STEP4',
    title: 'ご契約',
    description: 'MoonShotでの掲載内容確認後、ご契約手続きを踏ませていただきます。',
  },
  {
    step: 'STEP5',
    title: '詳細詰め',
    description: '契約後、テーマや実施時期・授業時間数・オンライン／対面の形などの詳細をすり合わせます。先生方とのやり取りは、基本的にMoonShotが担当します。',
  },
  {
    step: 'STEP6',
    title: '学校提供',
    description: '出来上がったプログラムをMoonShotへ掲載し、学校・生徒への提供を開始します。※時期により学校への提供へバラツキが起こることがございます。',
  },
];

export const IntroductionFlowSection = () => {
  return (
    <section className="py-12 md:py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* セクションタイトル */}
        <div className="mb-8 md:mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              導入フロー
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">Introduction Flow</span>
          </div>
          <p className="text-xl sm:text-2xl text-gray-700 font-medium">
            6ステップで学生に届けることが可能です！
          </p>
        </div>

        {/* ステップを縦方向で表示（全画面サイズ） */}
        <div className="relative max-w-4xl mx-auto">
          <div className="flex flex-col gap-4 md:gap-6">
            {steps.map((item, index) => (
              <div
                key={index}
                className="relative bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 hover:border-primary/50 w-full"
              >
                <div className="p-4 md:p-6 lg:p-8">
                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm md:text-base lg:text-lg shadow-md">
                      {item.step.replace('STEP', '')}
                    </div>
                    <h3 className="font-bold text-gray-900 text-base md:text-lg lg:text-xl leading-tight">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed">
                    {item.description}
                  </p>
                </div>
                {/* 下向き矢印 */}
                {index < steps.length - 1 && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full z-10">
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-primary rounded-full flex items-center justify-center shadow-md">
                      <svg
                        className="w-4 h-4 md:w-5 md:h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
