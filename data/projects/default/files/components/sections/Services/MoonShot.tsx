'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const SCHOOL_ICON_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-28x28_b1f1f3ff-aee4-4607-87ba-0914b8310a23.svg?alt=media&token=c4336100-79f3-4fc7-895b-05e90f0cb574';
const GOVERNMENT_ICON_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-29x28_66f919f1-a49b-48fc-957c-62cd856286d1.svg?alt=media&token=ac5429b1-69ea-4ea0-b8bf-4d749838fccc';
const COMPANY_ICON_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-29x28_271449e2-8fce-4651-aa1e-508f418f2691.svg?alt=media&token=68314e7e-17a2-4247-bb06-ea3802ec5c00';

const MOONSHOT_LAPTOP_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-1188x828_v-fs_webp_3a435f99-7c14-47ef-a373-25dd9c865722.png?alt=media&token=3cb29780-de71-4f5a-9775-4d2f6108cc09';

export const MoonShot = () => {
  const [isVisible, setIsVisible] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    const currentRef = articleRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <article
      ref={articleRef}
      className={`py-12 md:py-16 lg:py-20 rounded-xl transition-opacity duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: '#fafafa' }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12 items-start w-full">
          {/* 左側: テキストコンテンツ */}
          <div className="space-y-6" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
            {/* サブタイトル */}
            <p className="text-primary font-bold" style={{ fontSize: '24px' }}>
              ムーンショット
            </p>
            
            {/* タイトル */}
            <h2 className="font-bold text-gray-900 text-4xl sm:text-5xl md:text-6xl lg:text-[64px] break-words">
              MoonShot
            </h2>
            
            {/* 説明見出し */}
            <h3 className="font-semibold text-gray-800 text-base sm:text-lg md:text-xl lg:text-2xl break-words">
              学校教育向け探究総合プラットフォーム
            </h3>
            
            {/* 詳細説明 */}
            <p className="text-gray-600 text-sm md:text-base leading-relaxed">
              小学校・中学校における「総合的な学習の時間」、高校における「総合的な探究の時間」を円滑に効果的に進めるための総合プラットフォーム
            </p>
            
          </div>
          
          {/* 右側: ラップトップ画像 */}
          <div className="flex flex-col" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
            <div className="relative w-full flex justify-center">
              <Image
                src={MOONSHOT_LAPTOP_IMAGE_URL}
                alt="MoonShot プラットフォームのスクリーンショット"
                width={500}
                height={375}
                className="object-contain"
                sizes="500px"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* 詳細はこちらテキストと3つのボタン（article全体の幅いっぱい） */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-8">
        {/* 詳細はこちらテキスト（クリック不可） */}
        <div className="mb-4">
          <span className="text-primary font-medium text-sm md:text-base inline-flex items-center gap-2 pointer-events-none">
            詳細はこちら
            <svg
              className="w-4 h-4"
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
          </span>
        </div>
        
        {/* 3つのボタン */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
          <Link
            href="/contact"
            className="bg-white border-2 border-gray-300 px-4 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-between group w-full"
            style={{ borderRadius: '50px', height: '60px'}}
          >
            <div className="flex items-center gap-3">
              <Image
                src={SCHOOL_ICON_URL}
                alt="学校"
                width={28}
                height={28}
                className="group-hover:opacity-80 transition-opacity"
              />
              <span className="text-sm md:text-base text-gray-700 group-hover:text-primary font-medium">
                学校関係者さまはこちら
              </span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-primary"
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
          
          <Link
            href="/contact"
            className="bg-white border-2 border-gray-300 px-4 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-between group w-full"
            style={{ borderRadius: '50px', height: '60px' }}
          >
            <div className="flex items-center gap-3">
              <Image
                src={GOVERNMENT_ICON_URL}
                alt="行政"
                width={29}
                height={28}
                className="group-hover:opacity-80 transition-opacity"
              />
              <span className="text-sm md:text-base text-gray-700 group-hover:text-primary font-medium">
                行政関係者さまはこちら
              </span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-primary"
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
          
          <Link
            href="/for-business"
            className="bg-white border-2 border-gray-300 px-4 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-between group w-full"
            style={{ borderRadius: '50px', height: '60px' }}
          >
            <div className="flex items-center gap-3">
              <Image
                src={COMPANY_ICON_URL}
                alt="企業"
                width={29}
                height={28}
                className="group-hover:opacity-80 transition-opacity"
              />
              <span className="text-sm md:text-base text-gray-700 group-hover:text-primary font-medium">
                企業関係者さまはこちら
              </span>
            </div>
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-primary"
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
    </article>
  );
};

