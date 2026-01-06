import Link from 'next/link';
import Image from 'next/image';

const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BEMoonJapan%E3%83%AD%E3%82%B3%E3%82%99.png?alt=media&token=a156be8f-d8d9-4381-8d96-d67ebb9cf5e3';
const FOOTER_LEFT_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-100x240_995869d5-f019-40be-8987-ee2067a04c1d.svg?alt=media&token=2363708c-4ebe-4ab3-93d5-1712f7e2c222';
const FOOTER_RIGHT_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-101x239_webp_115ade81-f984-445a-9a2f-37a5f34c9de9.png?alt=media&token=0e0a6757-f67d-42a5-9ed3-dcb69047d4dd';

export const Footer = () => {
  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '株式会社MoonJapan',
    url: 'https://moon-japan.com',
    logo: LOGO_URL,
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'info@moon-japan.com',
      contactType: 'お問い合わせ',
      areaServed: 'JP',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: '豊島区',
      addressRegion: '東京都',
      streetAddress: '要町3-4-6',
      addressCountry: 'JP',
    },
  };

  return (
    <footer 
      className="relative py-12 md:py-16 overflow-hidden" 
      role="contentinfo"
      style={{ backgroundColor: '#fff6e8' }}
    >
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* 左上の装飾画像 */}
      <div className="absolute top-0 left-0 z-0" style={{ pointerEvents: 'none' }}>
        <Image
          src={FOOTER_LEFT_IMAGE_URL}
          alt=""
          width={100}
          height={240}
          className="object-contain"
          unoptimized
        />
      </div>

      {/* 右下の装飾画像 */}
      <div className="absolute bottom-0 right-0 z-0" style={{ pointerEvents: 'none' }}>
        <Image
          src={FOOTER_RIGHT_IMAGE_URL}
          alt=""
          width={101}
          height={239}
          className="object-contain"
          unoptimized
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col gap-8 md:gap-12">
          {/* 上: ナビゲーションリンク（横並び、中央揃え） */}
          <div className="flex flex-wrap gap-6 md:gap-8 lg:gap-12 justify-center">
            {/* 会社情報 */}
            <div>
              <Link
                href="/company"
                className="text-lg font-semibold text-gray-900 mb-4 block hover:text-primary transition-colors"
              >
                会社情報
              </Link>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/company#mvv"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    MVV
                  </Link>
                </li>
                <li>
                  <Link
                    href="/company#executives"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    役員紹介とメッセージ
                  </Link>
                </li>
                <li>
                  <Link
                    href="/company#company-profile"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    会社概要
                  </Link>
                </li>
              </ul>
            </div>

            {/* サービス */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">サービス</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/services"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    サービス一覧
                  </Link>
                </li>
              </ul>
            </div>

            {/* ニュース */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ニュース</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/news"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    ニュース一覧
                  </Link>
                </li>
              </ul>
            </div>

            {/* お問い合わせ */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">お問い合わせ</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/contact"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    お問い合わせフォーム
                  </Link>
                </li>
              </ul>
            </div>

            {/* プライバシーポリシー */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">プライバシーポリシー</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/privacy"
                    className="text-gray-600 hover:text-primary transition-colors text-sm"
                  >
                    プライバシーポリシー
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* 下: 会社情報（中央揃え） */}
          <div className="flex flex-col items-center">
            {/* ロゴと連絡先情報（横並び） */}
            <div className="flex flex-row items-center gap-0 mb-6">
              {/* ロゴ */}
              <div className="flex items-center">
                <Link href="/" className="inline-block">
                  <Image
                    src={LOGO_URL}
                    alt="MoonJapan ロゴ"
                    width={179}
                    height={126}
                    className="object-contain"
                    style={{ width: '179px', height: '126px' }}
                    sizes="179px"
                  />
                </Link>
              </div>

              {/* 連絡先情報 */}
              <div className="space-y-2 text-sm text-gray-600 text-center">
                <div>
                  <a
                    href="mailto:info@moon-japan.com"
                    className="hover:text-primary transition-colors"
                  >
                    info@moon-japan.com
                  </a>
                </div>
                <div>
                  <address className="not-italic">
                    東京都豊島区要町3-4-6
                  </address>
                </div>
              </div>
            </div>

            {/* 著作権 */}
            <div className="text-sm text-gray-500">
              <p>&copy;2025 Moon Japan</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
