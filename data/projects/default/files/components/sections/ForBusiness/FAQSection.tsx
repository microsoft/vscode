'use client';

import { useState } from 'react';

const faqs = [
  {
    id: 1,
    q: 'どの部署が担当するケースが多いですか？',
    a: 'これまでの事例では、経営企画、新規事業、広報・ブランディング、人事・教育研修、CSRなど、「次の世代と関わりながら、事業や組織の未来を考える」役割の部署が多く担当されています。社内のどこが窓口になるとスムーズかも、一緒に整理させていただきます。',
  },
  {
    id: 2,
    q: '業界団体での相談は可能ですか？',
    a: 'もちろんでございます。これまでも「１社ではキツイけど、業界は盛り上げたいから何社かでやりたい」と地域の業界団体様や全国で活動されている業界団体様からのご相談を頂いております。沢山の業界との共育を我々も実現したいと強く考えておりますので、一度お問い合わせいただけますと幸いです。',
  },
  {
    id: 3,
    q: '社内の工数はどれくらいかかりますか？',
    a: '最小5時間程の工数で導入まで可能です。※社内事情や関わり方によって変動します。',
  },
  {
    id: 4,
    q: '社内から学校への人材派遣は必要ですか？',
    a: '必要ございません。弊社のコンテンツは教員の皆様でも実施可能なものに仕上げているため、貴社の人的負担を極限まで下げることを可能にしております。※ご希望に応じ、社内人材や専門人材の派遣も可能です。',
  },
  {
    id: 5,
    q: '学校で行われる授業はオンラインだけ、もしくは対面だけでも実施できますか？',
    a: '可能です。オンラインのみ・対面のみ・オンラインと対面の組み合わせなど、学校や地域の状況に合わせて形を決めていきます。提供地域に近い支社からの派遣などが可能なように設計することもあります。',
  },
  {
    id: 6,
    q: 'まだ具体的な学校や地域が決まっていないのですが、相談してもいいですか？',
    a: 'もちろんです。「首都圏の高校生とつながりたい」「地元の学校と一緒に何かを始めたい」など、ぼんやりとしたイメージの段階からご相談いただくケースも多くあります。実現可能性やスケジュール感も含めて、こちらからご提案させていただきます。',
  },
  {
    id: 7,
    q: '1回限りではなく、継続的な取り組みにすることもできますか？',
    a: 'むしろ単発のプログラムだけでなく、生徒個々人の「好き」や「ワクワク」を探りながら個別に探究していくので継続した設計が基本となっています。（8-36回）まずは小さく始めて、手応えや社内の反応を見ながら、徐々に規模を広げていく設計も可能です。',
  },
];

export const FAQSection = () => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const FAQCard = ({ faq, isExpanded }: { faq: typeof faqs[0]; isExpanded: boolean }) => (
    <div
      className={`bg-white rounded-lg p-4 md:p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-100 hover:border-primary/30 ${
        isExpanded ? 'md:col-span-2 lg:col-span-3' : ''
      }`}
      onClick={() => setExpandedId(isExpanded ? null : faq.id)}
    >
      {/* 質問 */}
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-shrink-0 text-primary font-bold text-sm md:text-base">Q.</span>
        <h3 className="text-sm md:text-base font-bold text-gray-900 leading-snug flex-1">
          {faq.q}
        </h3>
      </div>

      {/* 回答（アコーディオン） */}
      {isExpanded && (
        <div className="flex items-start gap-2 pt-2 animate-in fade-in duration-200">
          <span className="flex-shrink-0 text-primary font-semibold text-xs md:text-sm">A.</span>
          <p className="text-xs md:text-sm md:text-base text-gray-700 leading-relaxed flex-1">
            {faq.a}
          </p>
        </div>
      )}

      {/* 展開アイコン */}
      <div className="flex justify-end mt-2">
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              よくある質問
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">FAQ</span>
          </div>
        </div>

        {/* FAQをグリッドレイアウトで表示（展開されたFAQだけが広がる） */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {faqs.map((faq) => {
            const isExpanded = expandedId === faq.id;
            return <FAQCard key={faq.id} faq={faq} isExpanded={isExpanded} />;
          })}
        </div>
      </div>
    </section>
  );
};
