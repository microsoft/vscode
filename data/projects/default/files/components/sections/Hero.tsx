'use client';

import Image from 'next/image';

const HERO_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-2160x1233_v-frms_webp_85298fef-46f7-4cbc-ab1d-bf1d546230eb.png?alt=media&token=946bd167-e3bf-4c51-a631-636558e881f6';

interface HeroProps {
  title: string;
  subtitle?: string;
  ctaText: string;
  onCtaClick: () => void;
}

export const Hero = ({
  title,
  subtitle,
  ctaText,
  onCtaClick,
}: HeroProps) => {
  return (
    <section 
      className="relative w-full min-h-screen overflow-hidden pt-16 md:pt-20"
      style={{ 
        width: '100%',
        position: 'relative',
      }}
    >
      {/* 背景画像 */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <img
          src={HERO_IMAGE_URL}
          alt="Hero background"
          className="w-full h-full object-cover"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    </section>
  );
};

