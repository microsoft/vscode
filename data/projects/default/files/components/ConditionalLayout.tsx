'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/sections/Footer';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');

  if (isAdminPage) {
    // 管理画面ではHeaderとFooterを表示しない
    return <main>{children}</main>;
  }

  // 通常のページではHeaderとFooterを表示
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}

