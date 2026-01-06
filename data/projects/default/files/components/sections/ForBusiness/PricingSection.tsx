'use client';

export const PricingSection = () => {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              金額について
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">Pricing</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          <p className="text-lg text-gray-700 mb-6">
            提供人数に応じて変動します。一定の地域だけに提供することもできれば、全国に提供することも可能です。
          </p>
          <div className="bg-gray-50 rounded-xl p-6 md:p-8">
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              料金は、
            </p>
            <ul className="list-disc list-inside space-y-2 text-base text-gray-700 mb-4">
              <li>対象となる学年・生徒数</li>
              <li>実施地域（オンライン／対面）</li>
              <li>企業側の関わり方（フルオンライン／複数回の現地参加 など）</li>
            </ul>
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              をもとに、個別にお見積もりいたします。
            </p>
            <p className="text-base text-gray-700 leading-relaxed mb-4">
              「まずは1プログラムから試してみたい」「特定の地域だけに届けたい」といったご相談も可能です。
            </p>
            <p className="text-base text-gray-700 leading-relaxed">
              詳しい金額感は、オンラインミーティングの中でご説明します。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

