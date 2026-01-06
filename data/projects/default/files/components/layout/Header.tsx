'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/navigation';

const LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BEMoonJapan%E3%83%AD%E3%82%B3%E3%82%99.png?alt=media&token=a156be8f-d8d9-4381-8d96-d67ebb9cf5e3';

interface HeaderProps {
  navItems?: NavItem[];
}

const defaultNavItems: NavItem[] = [
  { label: '会社情報', href: '/company', id: 'company' },
  { label: 'サービス', href: '/services', id: 'services' },
  { label: 'ニュース', href: '/news', id: 'news' },
  { label: 'お問い合わせ', href: '/contact', id: 'contact' },
];

export const Header = ({ navItems = defaultNavItems }: HeaderProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    setIsMenuOpen(false);
    // スムーススクロール処理（アンカーリンクの場合）
    if (href.startsWith('#')) {
      e.preventDefault();
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    // ページ遷移の場合は通常のリンク動作を許可
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-[9999] bg-white transition-shadow duration-300',
        isScrolled ? 'shadow-md' : 'shadow-sm'
      )}
      role="banner"
    >
      <nav
        className="w-full px-[20px]"
        aria-label="メインナビゲーション"
      >
        <div className="w-full flex items-center justify-between h-16 md:h-20">
          {/* ロゴ */}
          <div className="flex-shrink-0 z-10 h-full flex items-center">
            <Link
              href="/"
              className="flex items-center h-full hover:opacity-80 transition-opacity focus:outline-none rounded-md"
              aria-label="MoonJapan ホームへ"
            >
              <div className="relative h-full w-[60px] sm:w-[70px] md:w-[80px]">
                <Image
                  src={LOGO_URL}
                  alt="MoonJapan ロゴ"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 640px) 60px, (max-width: 768px) 70px, 80px"
                />
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6 lg:space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={(e) => handleNavClick(item.href, e)}
                className="text-gray-900 hover:text-primary transition-colors duration-200 text-sm lg:text-base font-medium relative group py-2"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-200 group-hover:w-full" />
              </Link>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 -mr-2 text-gray-900 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md z-10"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          >
            <span className="sr-only">メニューを開く</span>
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              {isMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        <div
          id="mobile-menu"
          className={cn(
            'md:hidden border-t border-gray-200 overflow-hidden transition-all duration-300 ease-in-out',
            isMenuOpen
              ? 'max-h-96 opacity-100 mt-2 pt-2 pb-4'
              : 'max-h-0 opacity-0 mt-0 pt-0 pb-0'
          )}
        >
          <div className="space-y-1">
            {navItems.map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={(e) => handleNavClick(item.href, e)}
                className={cn(
                  'block px-3 py-2 text-base font-medium text-gray-900 hover:text-primary hover:bg-primary/10 rounded-md transition-colors duration-200',
                  isMenuOpen
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-4'
                )}
                style={{
                  transitionDelay: isMenuOpen ? `${index * 50}ms` : '0ms',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
};
