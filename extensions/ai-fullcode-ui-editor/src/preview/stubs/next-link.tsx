import React from 'react';

/**
 * Next.js Link スタブ
 * 
 * iframe 環境では next/link の代わりに通常の <a> タグを使用
 */
interface LinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  target?: string;
  rel?: string;
}

export default function Link({
  href,
  children,
  className,
  style,
  onClick,
  target,
  rel,
}: LinkProps) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={onClick}
      target={target}
      rel={rel}
    >
      {children}
    </a>
  );
}

