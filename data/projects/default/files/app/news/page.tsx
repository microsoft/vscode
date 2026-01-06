'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getNewsList, News } from '@/lib/firebase/news';

export default function NewsPage() {
  const [newsList, setNewsList] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const news = await getNewsList({ publishedOnly: true });
      setNewsList(news);
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const getNewsUrl = (newsItem: News): string => {
    if (newsItem.slug) {
      return `/news/${newsItem.slug}`;
    }
    return `/news/${newsItem.id}`;
  };

  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ニュース一覧 - 株式会社MoonJapan',
    description: '株式会社MoonJapanの最新ニュース・お知らせ一覧',
    publisher: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: newsList.map((news, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'NewsArticle',
          headline: news.title,
          description: news.excerpt || news.content?.substring(0, 200) || '',
          datePublished: news.publishedAt instanceof Date
            ? news.publishedAt.toISOString()
            : new Date(news.publishedAt).toISOString(),
          dateModified: news.updatedAt instanceof Date
            ? news.updatedAt.toISOString()
            : new Date(news.updatedAt).toISOString(),
          author: {
            '@type': 'Organization',
            name: news.authorName || '株式会社MoonJapan',
          },
        },
      })),
    },
  };

  return (
    <>
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="min-h-screen bg-white pt-16 md:pt-20">
        {/* パンくずリスト */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Link href="/" className="text-gray-600 hover:text-primary transition-colors">
                ホーム
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-900">ニュース</span>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
          <div className="max-w-7xl mx-auto">
            {/* ヘッダー */}
            <div className="mb-8 md:mb-12">
              {/* ホームに戻るリンク */}
              <div className="mb-4 text-left">
                <Link
                  href="/"
                  className="text-black hover:text-gray-700 font-medium inline-flex items-center transition-colors"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  ホームに戻る
                </Link>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
                <span className="relative inline-block" style={{ zIndex: 1 }}>
                  News
                  <span
                    className="absolute left-0 w-full"
                    style={{
                      height: '20px',
                      backgroundColor: '#ffe2b6',
                      bottom: '-2px',
                      zIndex: -1,
                    }}
                  />
                </span>
                <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-normal text-gray-700 ml-2 sm:ml-3">
                  - ニュース
                </span>
              </h1>
            </div>

            {/* ニュース一覧（カードレイアウト） */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-600">読み込み中...</p>
              </div>
            ) : newsList.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">ニュースはありません</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {newsList.map((news) => (
                  <Link
                    key={news.id}
                    href={getNewsUrl(news)}
                    className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group"
                  >
                    {/* 画像エリア */}
                    <div className="relative w-full h-64 bg-gray-100 overflow-hidden">
                      {news.thumbnailUrl || news.heroImageUrl ? (
                        <Image
                          src={news.thumbnailUrl || news.heroImageUrl || ''}
                          alt={news.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white">
                          <span className="text-gray-400 text-sm">画像なし</span>
                        </div>
                      )}
                    </div>
                    
                    {/* コンテンツ */}
                    <div className="p-6">
                      <time
                        dateTime={
                          news.publishedAt instanceof Date
                            ? news.publishedAt.toISOString()
                            : new Date(news.publishedAt).toISOString()
                        }
                        className="text-primary font-medium text-sm mb-3 block"
                      >
                        {formatDate(news.publishedAt)}
                      </time>
                      <h2 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {news.title}
                      </h2>
                      {news.excerpt && (
                        <p className="text-gray-600 text-sm line-clamp-2">
                          {news.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

