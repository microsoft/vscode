'use client';

import { useState } from 'react';

interface InfinityDiagramProps {
  activePopup: 'school' | 'work' | null;
  setActivePopup: (popup: 'school' | 'work' | null) => void;
}

export const InfinityDiagram = ({ activePopup, setActivePopup }: InfinityDiagramProps) => {
  return (
    <div className="max-w-5xl mx-auto mb-16">
      <div className="relative bg-white rounded-2xl shadow-lg p-8 md:p-12">
        <div className="relative w-full aspect-video max-w-4xl mx-auto">
          {/* ∞型の図をSVGで表現 */}
          <svg
            viewBox="0 0 400 200"
            className="w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 左の円（学校） */}
            <circle
              cx="100"
              cy="100"
              r="60"
              fill="none"
              stroke="#f5b655"
              strokeWidth="3"
              className="animate-pulse"
            />
            <text
              x="100"
              y="105"
              textAnchor="middle"
              className="text-lg font-bold fill-gray-900"
            >
              学校
            </text>
            <text
              x="100"
              y="175"
              textAnchor="middle"
              className="text-sm font-semibold fill-primary"
            >
              MoonCareer
            </text>

            {/* 右の円（社会） */}
            <circle
              cx="300"
              cy="100"
              r="60"
              fill="none"
              stroke="#f5b655"
              strokeWidth="3"
              className="animate-pulse"
              style={{ animationDelay: '0.5s' }}
            />
            <text
              x="300"
              y="105"
              textAnchor="middle"
              className="text-lg font-bold fill-gray-900"
            >
              社会
            </text>
            <text
              x="300"
              y="175"
              textAnchor="middle"
              className="text-sm font-semibold fill-primary"
            >
              MoonShot
            </text>

            {/* ∞型の交差部分 */}
            <path
              d="M 100 40 Q 200 50 300 40 Q 200 150 100 160 Q 200 150 300 160"
              fill="none"
              stroke="#f5b655"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.6"
            />

            {/* 矢印（時計回り） */}
            <path
              d="M 40 100 A 60 60 0 0 1 100 40"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
            <path
              d="M 300 40 A 60 60 0 0 1 360 100"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
            <path
              d="M 360 100 A 60 60 0 0 1 300 160"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
            <path
              d="M 100 160 A 60 60 0 0 1 40 100"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />

            {/* 矢印のマーカー */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
              </marker>
            </defs>

            {/* 中央の交差点 - 学校での探究 */}
            <g
              className="cursor-pointer"
              onClick={() => setActivePopup(activePopup === 'school' ? null : 'school')}
            >
              <circle
                cx="200"
                cy="100"
                r="30"
                fill="#f5b655"
                opacity="0.3"
                className="hover:opacity-50 transition-opacity"
              />
              <circle
                cx="200"
                cy="100"
                r="8"
                fill="#f5b655"
              />
              <text
                x="200"
                y="95"
                textAnchor="middle"
                className="text-xs font-semibold fill-gray-700 pointer-events-none"
              >
                学校での探究
              </text>
            </g>
            {/* 右側の円 - 社会での探究 */}
            <g
              className="cursor-pointer"
              onClick={() => setActivePopup(activePopup === 'work' ? null : 'work')}
            >
              <circle
                cx="300"
                cy="100"
                r="30"
                fill="#3b82f6"
                opacity="0.2"
                className="hover:opacity-40 transition-opacity"
              />
              <circle
                cx="300"
                cy="100"
                r="8"
                fill="#3b82f6"
              />
              <text
                x="300"
                y="70"
                textAnchor="middle"
                className="text-xs font-semibold fill-gray-700 pointer-events-none"
              >
                社会での探究
              </text>
            </g>
          </svg>
        </div>

        {/* ポップアップ：学校での探究 */}
        {activePopup === 'school' && (
          <div className="absolute inset-0 bg-white/95 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 z-20 overflow-y-auto max-h-[80vh]">
            <button
              onClick={() => setActivePopup(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-2xl"
            >
              ×
            </button>
            <h3 className="text-2xl font-bold text-gray-900 mb-6">学校での探究</h3>
            <p className="text-base text-gray-700 mb-6">
              探究とは、あるテーマについて、自分なりの問いを立て、調べ、考え、形にしていく学びです。
              MoonShotでは、企業が実際に向き合っているテーマを素材に、クラス全員でこの探究サイクルを回していきます。
            </p>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ① 課題設定─ 企業のテーマを「自分ごと」にする。
                </h4>
                <p className="text-base text-gray-700">
                  企業から事業や社会課題のストーリーを知ったあと、生徒一人ひとりが「気になったこと」「もっと知りたいこと」を出し合い、グループごとの探究テーマを決めていきます。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ② 情報収集─ 現場のデータと人の声から学ぶ。
                </h4>
                <p className="text-base text-gray-700">
                  テーマが決まったら、教科書やインターネットだけでなく、企業から提供される資料・動画・データ、社員インタビューなど「現場ならでは」の素材に触れながら情報を集めます。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ③ 分析─ 集めた事実から「なぜ？」を考える。
                </h4>
                <p className="text-base text-gray-700">
                  集めた情報を整理し、「なぜこうなっているのか」「どこに課題がありそうか」をグループで議論しながら仮説を立て原因と打ち手を整理していきます。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ④ まとめ・表現─ 自分たちの答えを、社会に向けて届ける。
                </h4>
                <p className="text-base text-gray-700">
                  議論を通して見えてきた気づきやアイデアを、それぞれのテーマに合った形でまとめ・発表し、フィードバックを受けながら次の問いにつなげていきます。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ポップアップ：社会での探究 */}
        {activePopup === 'work' && (
          <div className="absolute inset-0 bg-white/95 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 z-20 overflow-y-auto max-h-[80vh]">
            <button
              onClick={() => setActivePopup(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-2xl"
            >
              ×
            </button>
            <h3 className="text-2xl font-bold text-gray-900 mb-6">社会での探究（仕事の探究）</h3>
            <p className="text-base text-gray-700 mb-6">
              社会の現場でも、毎日が探究の連続です。入社して学び、現場で経験を重ね、課題を見つけ、仲間と新しい挑戦をしていく。そのプロセスは、学校での「探究の4ステップ」とよく似ています。
              MoonShotでは、大人たちの探究の軌跡を授業の中に持ち込み、生徒の探究と重ね合わせていきます。
            </p>
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ① 入社─ どんな問いを抱えて、この会社を選んだのか。
                </h4>
                <p className="text-base text-gray-700">
                  大人たちも、学生時代に「どんな社会課題に向き合いたいか」「どんな人たちと働きたいか」という問いを抱えながら進路を選び、今の会社にたどり着いています。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ② 活躍─ 現場で学び続ける日々。
                </h4>
                <p className="text-base text-gray-700">
                  現場で先輩に教わりながら、失敗と挑戦を繰り返し、少しずつ役割を広げていきます。新しい技術を学んだり、取引先や地域の方と関わったりするなかで、大人たちも「情報収集」と「試行錯誤」を続けています。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ③ 課題発見─ 「おかしいな」「もっと良くできるのでは？」に気づく。
                </h4>
                <p className="text-base text-gray-700">
                  仕事に慣れてくると、日々の中で「ここはお客様が困っていそう」「このやり方は効率が悪い」といった小さな違和感に気づくようになります。それが、大人たちにとっての「課題発見」の瞬間です。
                </p>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary mb-2">
                  ④ 新たな挑戦─ 見つけた課題を、次の一歩につなげる。
                </h4>
                <p className="text-base text-gray-700">
                  見つけた課題を放っておかず、チームでアイデアを出し、社内外を巻き込みながら新しいプロジェクトやサービスとして形にしていく。それが、大人たちの「まとめ・表現」のプロセスです。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 説明文（キービジュアルの下） */}
        <div className="mt-12 max-w-4xl mx-auto text-center">
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-4">
            学校での「探究」と、社会で働く大人たちの「探究」は、本来とてもよく似たプロセスをたどっています。ただ、これまではその2つが別々の場所で完結してしまいがちでした。
          </p>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-4">
            左側のループは、教室の中で生徒がテーマを見つけ、調べ、まとめ、表現していく学びの循環。右側のループは、社会の現場で大人たちが課題を見つけ、仲間と試行錯誤し、新たな挑戦を続ける仕事の循環。
          </p>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-4">
            真ん中で2つのループが交差しているのは、MoonShot・MoonCareerを通じて「学校の探究」と「社会の探究」が何度でも行き来するイメージです。
          </p>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
            生徒は、社会で実際に起きている問いを題材に探究し、大人は、自分たちの仕事を振り返りながら次の挑戦のヒントを受け取る。その往復運動そのものが、MoonShotがつくりたい「共育」のかたちです。
          </p>
        </div>
      </div>
    </div>
  );
};

