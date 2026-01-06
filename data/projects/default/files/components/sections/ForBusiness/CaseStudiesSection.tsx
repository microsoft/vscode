'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BEMoonJapan%E3%83%AD%E3%82%B3%E3%82%99.png?alt=media&token=a156be8f-d8d9-4381-8d96-d67ebb9cf5e3';

export const CaseStudiesSection = () => {
  const [activeCase, setActiveCase] = useState<number | null>(null);

  // ロゴを30枚生成（ローテーション用）
  const logos = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    url: LOGO_URL,
  }));

  return (
    <section id="cases" className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* セクションタイトル */}
        <div className="mb-12 md:mb-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              導入事例
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">Case Studies</span>
          </div>
          <p className="text-xl sm:text-2xl text-gray-700 font-medium">
            業界も規模も違う企業と、一緒に授業をつくっています。
          </p>
        </div>

        {/* 会社ロゴ羅列（ローテーションアニメーション） */}
        <div className="mb-16 overflow-hidden">
          <div className="relative">
            {/* アニメーション用のコンテナ */}
            <div className="animate-scroll">
              {/* 最初のセット */}
              {logos.map((logo) => (
                <div
                  key={logo.id}
                  className="flex-shrink-0 w-32 h-20 md:w-40 md:h-24 mx-4 flex items-center justify-center"
                >
                  <div className="relative w-full h-full flex items-center justify-center">
                    <Image
                      src={logo.url}
                      alt={`企業ロゴ ${logo.id + 1}`}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
              ))}
              {/* 2回目のセット（シームレスなループ用） */}
              {logos.map((logo) => (
                <div
                  key={`duplicate-${logo.id}`}
                  className="flex-shrink-0 w-32 h-20 md:w-40 md:h-24 mx-4 flex items-center justify-center"
                >
                  <div className="relative w-full h-full flex items-center justify-center">
                    <Image
                      src={logo.url}
                      alt={`企業ロゴ ${logo.id + 1}`}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 事例カード */}
        <div className="max-w-4xl mx-auto">
          <div
            className="bg-white border-2 border-gray-200 rounded-xl p-6 md:p-8 cursor-pointer hover:border-primary transition-all duration-200 hover:shadow-lg"
            onClick={() => setActiveCase(activeCase === 1 ? null : 1)}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">【事例A】</h3>
            <div className="space-y-2 text-base text-gray-700">
              <p><span className="font-semibold">業種：</span>医療・ヘルスケア関連企業</p>
              <p><span className="font-semibold">実施形態：</span>オンライン＋対面のハイブリッド</p>
              <p><span className="font-semibold">対象：</span>高校2年生 全学年</p>
              <p><span className="font-semibold">テーマ例：</span>「命をつなぐ物流を止めないには？」</p>
            </div>
            <p className="mt-4 text-base text-gray-600">
              生徒たちは、医薬品が患者さんに届くまでの流れを学び、災害時や人口減少社会で想定されるリスクを自分たちなりに整理。最後は「もし自分たちが現場担当なら、どんな準備をするか？」を企業の方に提案しました。
            </p>
          </div>

          {/* 詳細ポップアップ */}
          {activeCase === 1 && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActiveCase(null)}>
              <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 max-w-3xl max-h-[90vh] overflow-y-auto w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setActiveCase(null)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-2xl"
                >
                  ×
                </button>
                <h3 className="text-2xl font-bold text-gray-900 mb-6">【事例A】詳細</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold text-primary mb-2">授業のねらい</h4>
                    <p className="text-base text-gray-700">
                      医療・ヘルスケア業界の課題を理解し、物流の重要性を学ぶ。
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-primary mb-2">授業構成</h4>
                    <p className="text-base text-gray-700">
                      全8時間のうち、企業が関わる時間は2時間。MoonShotが設計する部分は6時間。
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-primary mb-2">生徒のアウトプット例</h4>
                    <p className="text-base text-gray-700">
                      スライド、ポスター、動画などで提案をまとめました。
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-primary mb-2">担当教員・企業担当者のコメント</h4>
                    <p className="text-base text-gray-700">
                      生徒たちの視点が新鮮で、企業としても学びが多かった。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </section>
  );
};
