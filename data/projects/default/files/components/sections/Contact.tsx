'use client';

import Link from 'next/link';
import Image from 'next/image';

const CONTACT_BACKGROUND_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-2160x1160_v-frms_webp_3922cd71-1e15-4286-b94b-1fecfe25f3e6.png?alt=media&token=9ff0e9c5-4dc5-44c2-8dce-eff9aabaa6d8';

export const Contact = () => {
  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'お問い合わせ - 株式会社MoonJapan',
    description: '株式会社MoonJapanへの各種お問い合わせは、こちらのフォームよりお送りください。',
    mainEntity: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'お問い合わせ',
        availableLanguage: ['Japanese'],
      },
    },
  };

  return (
    <section 
      id="contact" 
      className="relative py-12 md:py-16 lg:py-20 overflow-hidden min-h-[400px] md:min-h-[500px]" 
      aria-label="お問い合わせ"
      style={{ position: 'relative' }}
    >
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* 背景画像 */}
      <div className="absolute inset-0 z-0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Image
          src={CONTACT_BACKGROUND_IMAGE_URL}
          alt="Contact background"
          fill
          className="object-cover"
          priority
          quality={90}
          sizes="100vw"
          unoptimized
          style={{
            objectFit: 'cover',
          }}
        />
      </div>

      {/* コンテンツ */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* セクション見出し（左寄せ） */}
          <div className="mb-6 md:mb-8 text-left">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-6 md:mb-8 inline-block">
              Contact
              <span className="text-sm sm:text-base md:text-lg lg:text-xl font-normal text-white ml-2 sm:ml-3">
                - お問い合わせ
              </span>
            </h2>
          </div>

          {/* 説明文（中央揃え） */}
          <p className="text-white text-base sm:text-lg md:text-xl lg:text-2xl mb-8 md:mb-12 font-medium leading-relaxed text-center">
            各種お問い合わせは、こちらのフォームよりお送りください。
          </p>

          {/* お問い合わせフォームボタン */}
          <div className="flex justify-center">
            <Link
              href="/contact"
              className="bg-primary hover:bg-primary/90 text-black font-semibold px-8 py-4 md:px-12 md:py-5 rounded-full text-base sm:text-lg md:text-xl lg:text-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center"
              style={{
                minWidth: '280px',
              }}
            >
              お問い合わせフォームへ
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
