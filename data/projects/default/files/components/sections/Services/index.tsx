import Link from 'next/link';
import { ServiceBanner } from './ServiceBanner';
import { MoonShot } from './MoonShot';
import { MoonAcademy } from './MoonAcademy';

export const Services = () => {
  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: '株式会社MoonJapan サービス',
    description: '"教育を共育で変える"をミッションに、高校生に探究教育を普及するための支援サービスなどを展開',
    provider: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
    },
    serviceType: ['教育プラットフォーム', '探究学習支援', '総合型選抜対策'],
  };

  return (
    <section id="services" className="bg-white relative" aria-label="サービス">
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      
      {/* トップバナー（右上に配置、最上層） */}
      <ServiceBanner />
      
      {/* メインコンテンツ */}
      <div className="py-12 md:py-16 lg:py-20 mt-[100px] relative z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* セクション見出し、サービス一覧ボタン、ミッションステートメントをカラムでグループ化（最大幅1200px） */}
          <div className="mb-12 md:mb-16 flex flex-col mx-auto" style={{ maxWidth: '1200px' }}>
            {/* 1行目: Service - サービスとサービス一覧ボタンを横並び */}
            <div className="flex flex-row items-start justify-between mb-6">
              {/* 左側: セクション見出し（ServiceBannerに被らないように60%幅、左寄せ） */}
              <div className="text-left flex-shrink-0" style={{ width: '60%', maxWidth: '60%' }}>
                <Link href="/services" className="inline-block">
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 whitespace-nowrap hover:opacity-80 transition-opacity">
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
                </Link>
              </div>
              
              {/* 右側: サービス一覧ボタン（ServiceBanner内、右寄せ、被ってもOK） */}
              <div className="flex-shrink-0 relative z-[10000] flex justify-end">
                <Link
                  href="/services"
                  className="bg-white border-2 border-gray-300 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-center group inline-flex px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 h-8 sm:h-10 md:h-12"
                  style={{ 
                    borderRadius: '50px',
                  }}
                >
                  <span 
                    className="text-gray-700 group-hover:text-primary font-medium whitespace-nowrap text-[10px] sm:text-xs md:text-sm lg:text-base"
                    style={{ 
                      lineHeight: '1.2',
                    }}
                  >
                    サービス一覧はこちら
                  </span>
                  <svg
                    className="text-gray-400 group-hover:text-primary ml-1.5 sm:ml-2 flex-shrink-0 w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            </div>
            
            {/* 2行目: ミッションステートメント（420px以上ではServiceBannerに被らないように60%幅、420px以下では幅を全て使う） */}
            <div className="text-left w-full max-[420px]:w-full max-[420px]:max-w-full max-[420px]:-mx-4 max-[420px]:px-4 min-[421px]:w-[60%] min-[421px]:max-w-[60%]">
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
  );
};

