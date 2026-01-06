'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExecutiveCard } from '@/components/ui/ExecutiveCard';

const FUJITA_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-498x724_v-fs_webp_3861ca78-c16c-43fe-875a-b3c39b0bc492.png?alt=media&token=78e05264-a073-47e0-878d-cc4de73c6647';
const IMAI_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-249x362_webp_60b550f7-4ea3-47a3-b8f3-2f186047cf80.png?alt=media&token=6a3ab8de-86b3-4711-b904-2659a105c417';
const TRIANGLE_ICON_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-235x200_webp_18b5a803-5a2a-426f-9b54-45d7f6029795.png?alt=media&token=eb555415-9363-4208-baa9-1ff4b20c28e5';

export default function CompanyPage() {
  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: '会社情報 - 株式会社MoonJapan',
    description: '株式会社MoonJapanのMVV、役員紹介、会社概要',
    mainEntity: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
      foundingDate: '2024-02-07',
      founder: {
        '@type': 'Person',
        name: '藤田岳',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: '豊島区',
        addressRegion: '東京都',
        streetAddress: '要町3-4-6',
        addressCountry: 'JP',
      },
    },
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
              <span className="text-gray-900">会社情報</span>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
          <div className="max-w-4xl mx-auto">
            {/* ページタイトル */}
            <div className="mb-12 md:mb-16">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-8">
                <span className="relative inline-block">
                  Company
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
                <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-normal text-gray-700 ml-2 sm:ml-3">
                  - 会社概要
                </span>
              </h1>
            </div>

            {/* MVVセクション */}
            <section id="mvv" className="mb-16 md:mb-20">
              <h2 
                className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-8 pl-4 md:pl-6"
                style={{
                  borderLeft: '4px solid #f5b655',
                }}
              >
                MMV
              </h2>
              <div className="space-y-12 md:space-y-16 lg:space-y-20">
                {/* Mission */}
                <div className="group cursor-pointer transition-all duration-300 hover:scale-105">
                  <h3 
                    className="font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2 text-2xl sm:text-3xl md:text-4xl"
                    style={{ fontSize: 'clamp(24px, 5vw, 40px)' }}
                  >
                    <span>Mission</span>
                    <span className="text-primary" style={{ fontSize: 'clamp(28px, 6vw, 48px)' }}>&gt;</span>
                  </h3>
                  <div className="relative flex items-center min-h-[60px] md:min-h-[80px]">
                    <Image
                      src={TRIANGLE_ICON_URL}
                      alt=""
                      width={235}
                      height={200}
                      className="absolute left-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ 
                        width: 'clamp(60px, 15vw, 120px)', 
                        height: 'auto',
                        zIndex: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                      sizes="(max-width: 640px) 60px, (max-width: 768px) 80px, 120px"
                    />
                    <p 
                      className="relative text-gray-700 leading-relaxed transition-transform duration-300 group-hover:scale-105"
                      style={{ 
                        fontSize: 'clamp(20px, 4vw, 32px)',
                        fontWeight: 600,
                        zIndex: 1,
                        paddingLeft: 'clamp(20px, 5vw, 48px)',
                      }}
                    >
                      教育を共育で変える。
                    </p>
                  </div>
                </div>
                {/* Vision */}
                <div className="group cursor-pointer transition-all duration-300 hover:scale-105">
                  <h3 
                    className="font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2 text-2xl sm:text-3xl md:text-4xl"
                    style={{ fontSize: 'clamp(24px, 5vw, 40px)' }}
                  >
                    <span>Vision</span>
                    <span className="text-primary" style={{ fontSize: 'clamp(28px, 6vw, 48px)' }}>&gt;</span>
                  </h3>
                  <div className="relative flex items-center min-h-[60px] md:min-h-[80px]">
                    <Image
                      src={TRIANGLE_ICON_URL}
                      alt=""
                      width={235}
                      height={200}
                      className="absolute left-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ 
                        width: 'clamp(60px, 15vw, 120px)', 
                        height: 'auto',
                        zIndex: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                      sizes="(max-width: 640px) 60px, (max-width: 768px) 80px, 120px"
                    />
                    <p 
                      className="relative text-gray-700 leading-relaxed transition-transform duration-300 group-hover:scale-105"
                      style={{ 
                        fontSize: 'clamp(20px, 4vw, 32px)',
                        fontWeight: 600,
                        zIndex: 1,
                        paddingLeft: 'clamp(20px, 5vw, 48px)',
                      }}
                    >
                      可能性に満ちた日本の未来という白いキャンバスに沢山の共同アーティストと共に彩を加えていく
                    </p>
                  </div>
                </div>
                {/* Value */}
                <div className="group cursor-pointer transition-all duration-300 hover:scale-105">
                  <h3 
                    className="font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2 text-2xl sm:text-3xl md:text-4xl"
                    style={{ fontSize: 'clamp(24px, 5vw, 40px)' }}
                  >
                    <span>Value</span>
                    <span className="text-primary" style={{ fontSize: 'clamp(28px, 6vw, 48px)' }}>&gt;</span>
                  </h3>
                  <div className="relative flex items-center min-h-[60px] md:min-h-[80px]">
                    <Image
                      src={TRIANGLE_ICON_URL}
                      alt=""
                      width={235}
                      height={200}
                      className="absolute left-0 transition-transform duration-300 group-hover:scale-110"
                      style={{ 
                        width: 'clamp(60px, 15vw, 120px)', 
                        height: 'auto',
                        zIndex: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                      sizes="(max-width: 640px) 60px, (max-width: 768px) 80px, 120px"
                    />
                    <p 
                      className="relative text-gray-700 leading-relaxed transition-transform duration-300 group-hover:scale-105"
                      style={{ 
                        fontSize: 'clamp(20px, 4vw, 32px)',
                        fontWeight: 600,
                        zIndex: 1,
                        paddingLeft: 'clamp(20px, 5vw, 48px)',
                      }}
                    >
                      共同アーティストに共に実現する未来
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 役員紹介とメッセージセクション */}
            <section id="executives" className="mb-16 md:mb-20">
              <h2 
                className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-8 md:mb-12 pl-4 md:pl-6"
                style={{
                  borderLeft: '4px solid #f5b655',
                }}
              >
                役員紹介とメッセージ
              </h2>
              <div className="space-y-12 md:space-y-16">
                {/* 藤田岳 */}
                <ExecutiveCard
                  imageUrl={FUJITA_IMAGE_URL}
                  imageAlt="藤田岳"
                  englishName="Gaku Fujita"
                  japaneseName="藤田岳"
                  position="代表取締役"
                  message="日本は30年間、よく「失われた」と言われる暗い時代を過ごしてきました。次の30年を考えるとき、日本全体がこの暗い時代を乗り越えるためのイノベーションが必要です。そのイノベーションの鍵を握るのは誰でしょうか。私たちは、まだ社会に出ていない学生たちであると確信しています。日本の未来を担う学生たちを教育の観点からサポートし、日本の未来を共に明るくしていく仲間を増やしていくことを目指します。"
                  imageWidth={498}
                  imageHeight={724}
                />

                {/* 今井智紀 */}
                <ExecutiveCard
                  imageUrl={IMAI_IMAGE_URL}
                  imageAlt="今井智紀"
                  englishName="Tomoki Imai"
                  japaneseName="今井智紀"
                  position="取締役"
                  message="少子高齢化社会において、経済を維持・成長させていくことは重要な課題です。そのためには、生産性の向上、イノベーション、そして幸福の追求が重要です。そのために必要なのは、問いを立てる力、課題や問題を定義する力、そして解決する力の3つのスキルを身につけ、それを生涯にわたって活用できることです。そのためには、自分の居心地の良い場所から一歩踏み出し、世界を広げ、挑戦し続けることが必要です。また、自分自身と向き合い、自分の人生やキャリアについて考えることも重要です。私たちは、企業活動を通じて、日本の未来を共に創っていくことを目指します。"
                />
              </div>
            </section>

            {/* 会社概要セクション */}
            <section id="company-profile" className="mb-16 md:mb-20">
              <h2 
                className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-8 md:mb-12 pl-4 md:pl-6"
                style={{
                  borderLeft: '4px solid #f5b655',
                }}
              >
                会社概要
              </h2>
              <div className="bg-white rounded-lg p-6 md:p-8">
                <dl className="space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-start pb-4 border-b border-gray-200 gap-[5px]">
                    <dt 
                      className="mb-1 sm:mb-0 sm:w-32 sm:flex-shrink-0 flex items-center justify-between"
                      style={{ 
                        fontSize: '16px',
                        color: '#848484',
                        fontWeight: 500,
                      }}
                    >
                      <span>会社名</span>
                      <span 
                        className="inline-block rounded-full"
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#f5b655',
                        }}
                      />
                    </dt>
                    <dd className="text-sm sm:text-base text-gray-700">
                      株式会社MoonJapan
                    </dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start pt-4 pb-4 border-b border-gray-200 gap-[5px]">
                    <dt 
                      className="mb-1 sm:mb-0 sm:w-32 sm:flex-shrink-0 flex items-center justify-between"
                      style={{ 
                        fontSize: '16px',
                        color: '#848484',
                        fontWeight: 500,
                      }}
                    >
                      <span>設立年月日</span>
                      <span 
                        className="inline-block rounded-full"
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#f5b655',
                        }}
                      />
                    </dt>
                    <dd className="text-sm sm:text-base text-gray-700">
                      2024年2月7日
                    </dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start pt-4 pb-4 border-b border-gray-200 gap-[5px]">
                    <dt 
                      className="mb-1 sm:mb-0 sm:w-32 sm:flex-shrink-0 flex items-center justify-between"
                      style={{ 
                        fontSize: '16px',
                        color: '#848484',
                        fontWeight: 500,
                      }}
                    >
                      <span>代表取締役</span>
                      <span 
                        className="inline-block rounded-full"
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#f5b655',
                        }}
                      />
                    </dt>
                    <dd className="text-sm sm:text-base text-gray-700">
                      藤田 岳
                    </dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start pt-4 gap-[5px]">
                    <dt 
                      className="mb-1 sm:mb-0 sm:w-32 sm:flex-shrink-0 flex items-center justify-between"
                      style={{ 
                        fontSize: '16px',
                        color: '#848484',
                        fontWeight: 500,
                      }}
                    >
                      <span>本所在地</span>
                      <span 
                        className="inline-block rounded-full"
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#f5b655',
                        }}
                      />
                    </dt>
                    <dd className="text-sm sm:text-base text-gray-700">
                      東京都豊島区要町3-4-6
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

          </div>
        </div>
      </div>
    </>
  );
}
