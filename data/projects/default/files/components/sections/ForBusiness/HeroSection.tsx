'use client';

import Image from 'next/image';

const HERO_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-2160x1233_v-frms_webp_85298fef-46f7-4cbc-ab1d-bf1d546230eb.png?alt=media&token=946bd167-e3bf-4c51-a631-636558e881f6';

export const HeroSection = () => {
  return (
    <section className="relative min-h-[500px] md:min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* 背景画像 */}
      <div className="absolute inset-0 z-0">
        <Image
          src={HERO_IMAGE_URL}
          alt="企業向けLP ヒーロー画像"
          fill
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>
      
      {/* コンテンツ */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6 leading-tight">
          貴社の<span className="text-primary">"事業"</span>を<span className="text-primary">"授業"</span>に。
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-white/90 mb-8 md:mb-10 font-medium">
          共育で日本の未来を変えていこう。
        </p>
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm sm:text-base md:text-lg text-white/80">
          <div className="flex items-center gap-2">
            <span className="font-semibold">全国〇〇〇校</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">既存プログラム〇〇以上</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">代表文科省アントレ大使</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">メディア</span>
          </div>
        </div>
      </div>
    </section>
  );
};

