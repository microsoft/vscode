'use client';

import Link from 'next/link';

export const CompanyInfoSection = () => {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">運営会社</h2>
          <div className="prose prose-lg max-w-none">
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              本サービスは、「学校と社会の分断をつなげ直す」を掲げる教育系インパクトスタートアップ「株式会社MoonJapan」が運営しています。
            </p>
            <ul className="list-none space-y-2 text-base text-gray-700 mb-6">
              <li><span className="font-semibold">社名：</span>株式会社MoonJapan</li>
              <li><span className="font-semibold">所在地：</span>東京都豊島区要町3-4-6</li>
              <li><span className="font-semibold">支店：</span>徳島県鳴門市</li>
              <li><span className="font-semibold">代表者：</span>藤田 岳</li>
              <li><span className="font-semibold">事業内容：</span>探究学習プログラムの企画・運営／進路支援事業 ほか</li>
            </ul>
            <p className="text-base text-gray-700 leading-relaxed">
              会社概要の詳細は、<Link href="/company" className="text-primary hover:underline">MoonJapan公式サイト</Link>をご覧ください。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

