'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const MOONACADEMY_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-500x375_webp_4a967d06-0e99-46cb-ac03-aa3e415070d4.png?alt=media&token=fc15b3c1-704c-4020-889b-67455c778f5f';

export const MoonAcademy = () => {
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* 左側: テキストコンテンツ */}
          <div className="space-y-6">
            {/* サブタイトル */}
            <p className="text-primary font-bold" style={{ fontSize: '24px' }}>
              ムーンアカデミー
            </p>
            
            {/* タイトル */}
            <h2 className="font-bold text-gray-900 text-4xl sm:text-5xl md:text-6xl lg:text-[64px] break-words">
              MoonAcademy
            </h2>
            
            {/* 説明見出し */}
            <h3 className="font-semibold text-gray-800 text-base sm:text-lg md:text-xl lg:text-2xl break-words">
              総合型選抜対策探究塾
            </h3>
            
            {/* 詳細説明 */}
            <p className="text-gray-600 text-sm md:text-base leading-relaxed">
              受験対策と将来設計を同時に叶える新しい形の学び舎
            </p>
            
            {/* 詳細リンク */}
            <div>
              <a
                href="https://moon-academy.online/"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border-2 border-gray-300 px-4 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-between group inline-flex"
                style={{ borderRadius: '50px', height: '60px' , width:'50%'}}
              >
                <span className="text-sm md:text-base text-gray-700 group-hover:text-primary font-medium">
                  詳細はこちら
                </span>
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
              </a>
            </div>
          </div>
          
          {/* 右側: 画像 */}
          <div className="relative w-full" style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <Image
              src={MOONACADEMY_IMAGE_URL}
              alt="MoonAcademy"
              width={500}
              height={375}
              className="object-contain w-full h-auto"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </article>
  );
};

