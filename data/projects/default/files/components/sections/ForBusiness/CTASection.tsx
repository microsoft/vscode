'use client';

import Link from 'next/link';

export const CTASection = () => {
  return (
    <section id="contact" className="py-16 md:py-24 bg-primary text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
          迷った方はまず30分の面談を！
        </h2>
        <Link
          href="/contact"
          className="inline-block bg-white text-primary font-semibold px-8 py-4 rounded-full text-lg md:text-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          お問い合わせフォームへ
        </Link>
      </div>
    </section>
  );
};

