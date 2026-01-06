'use client';

import Link from 'next/link';

export const PrivacyPolicySection = () => {
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">プライバシーポリシー</h2>
          <p className="text-base text-gray-700 leading-relaxed mb-4">
            本サービスにおける個人情報の取り扱いについては、株式会社MoonJapanのプライバシーポリシーに準拠します。
          </p>
          <p className="text-base text-gray-700 leading-relaxed">
            詳しくは、<Link href="/privacy" className="text-primary hover:underline">以下のページ</Link>をご確認ください。
          </p>
        </div>
      </div>
    </section>
  );
};

