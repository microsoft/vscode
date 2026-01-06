'use client';

import Link from 'next/link';
import { ServiceBanner } from '@/components/sections/Services/ServiceBanner';
import { MoonShot } from '@/components/sections/Services/MoonShot';
import { MoonAcademy } from '@/components/sections/Services/MoonAcademy';

export default function ServicesPage() {
  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'サービス - 株式会社MoonJapan',
    description: '"教育を共育で変える"をミッションに、高校生に探究教育を普及するための支援サービスなどを展開',
    provider: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
    },
    serviceType: ['教育プラットフォーム', '探究学習支援', '総合型選抜対策'],
  };

  return (
    <>
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="min-h-screen bg-white pt-16 md:pt-20">
        {/* パンくずリスト */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Link href="/" className="text-gray-600 hover:text-primary transition-colors">
                ホーム
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-900">サービス</span>
            </div>
          </div>
        </div>

        {/* メインコンテンツ */}
        <section id="services" className="bg-white relative" aria-label="サービス">
          {/* トップバナー（右上に配置、最上層） */}
          <ServiceBanner />
          
          {/* メインコンテンツ */}
          <div className="py-12 md:py-16 lg:py-20 mt-[100px] relative z-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              {/* セクション見出し、サービス一覧ボタン、ミッションステートメントをカラムでグループ化（最大幅1200px） */}
              <div className="mb-12 md:mb-16 flex flex-col mx-auto" style={{ maxWidth: '1200px' }}>
                {/* 1行目: Service - サービス */}
                <div className="flex flex-row items-start justify-between mb-6">
                  {/* 左側: セクション見出し */}
                  <div className="text-left flex-shrink-0">
                    <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 whitespace-nowrap">
                      <span className="relative inline-block">
                        Service
                        <span 
                          className="absolute left-0 w-full"
                          style={{
                            height: '20px',
                            backgroundColor: '#ffe2b6',
                            bottom: '-2px',
                            zIndex: -1,
                          }}
                        />
                      </span>
                      <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-normal text-gray-700 ml-2 sm:ml-3">
                        - サービス
                      </span>
                    </h1>
                  </div>
                  
                </div>
                
                {/* 2行目: ミッションステートメント */}
                <div className="text-left w-full">
                  <p className="text-xs sm:text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed font-semibold max-[420px]:whitespace-normal max-[420px]:break-words" style={{ fontWeight: 600 }}>
                    &quot;教育を共育で変える&quot;をミッションに、<br />
                    高校生に探究教育を普及するための支援サービスなどを展開
                  </p>
                </div>
              </div>
              
              {/* サービス一覧エリア（それぞれ別々に囲む、最大幅1200px） */}
              <div id="services-list" className="space-y-6 md:space-y-8 mx-auto" style={{ maxWidth: '1200px' }}>
                <MoonShot />
                <MoonAcademy />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

