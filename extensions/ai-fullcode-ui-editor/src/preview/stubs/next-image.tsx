import React from 'react';

/**
 * Next.js Image スタブ
 *
 * iframe 環境では next/image の代わりに通常の <img> タグを使用
 */
interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
  priority?: boolean;
  fill?: boolean;
}

export default function Image({
  src,
  alt,
  width,
  height,
  className,
  style,
  sizes,
  priority,
  fill,
}: ImageProps) {
  const imageStyle: React.CSSProperties = {
    ...style,
    ...(fill && { width: '100%', height: '100%', objectFit: 'cover' }),
  };

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={imageStyle}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
    />
  );
}

