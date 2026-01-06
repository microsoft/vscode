'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getNewsList, News } from '@/lib/firebase/news';

export const NewsSection = () => {
  const [newsList, setNewsList] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const news = await getNewsList({ 
          limitCount: 3, 
          publishedOnly: true 
        });
        setNewsList(news);
      } catch (error) {
        console.error('Failed to fetch news:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  // 日付フォーマット関数（年月日のみ）
  const formatDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  // 記事のURLを生成
  const getNewsUrl = (news: News): string => {
    if (news.slug) {
      return `/news/${news.slug}`;
    }
    return `/news/${news.id}`;
  };

  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: '株式会社MoonJapan ニュース',
    description: '株式会社MoonJapanの最新ニュース・お知らせ',
    publisher: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
    },
    newsArticles: newsList.map((news) => ({
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
    })),
  };

  return (
    <section id="news" className="bg-white py-12 md:py-16 lg:py-20" aria-label="ニュース">
      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto" style={{ maxWidth: '1200px' }}>
          {/* セクション見出し */}
          <div className="mb-8 md:mb-12">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900">
              <span className="relative inline-block" style={{ position: 'relative', display: 'inline-block' }}>
                <span style={{ position: 'relative', zIndex: 1 }}>News</span>
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: '100%',
                    height: '20px',
                    backgroundColor: '#ffe2b6',
                    bottom: '-2px',
                    zIndex: 0,
                  }}
                />
              </span>
              <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-normal text-gray-700 ml-2 sm:ml-3">
                - ニュース
              </span>
            </h2>
          </div>

          {/* ニュース一覧 */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">読み込み中...</p>
            </div>
          ) : newsList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">ニュースはありません</p>
            </div>
          ) : (
            <div className="space-y-4 mb-8 md:mb-12">
              {newsList.map((news, index) => (
                <Link
                  key={news.id}
                  href={getNewsUrl(news)}
                  className="block pb-4 border-b border-gray-200 hover:opacity-80 transition-opacity"
                  style={{ borderBottomWidth: '1px' }}
                >
                  <article className="flex flex-col gap-2">
                    {/* 日付 */}
                    <time
                      dateTime={
                        news.publishedAt instanceof Date
                          ? news.publishedAt.toISOString()
                          : new Date(news.publishedAt).toISOString()
                      }
                      className="text-primary font-medium text-sm sm:text-base"
                    >
                      {formatDate(news.publishedAt)}
                    </time>
                    {/* タイトル */}
                    <h3 className="text-gray-900 font-medium text-sm sm:text-base md:text-lg">
                      {news.title}
                    </h3>
                  </article>
                </Link>
              ))}
            </div>
          )}

          {/* ニュース一覧ボタン */}
          <div className="flex justify-center">
            <Link
              href="/news"
              className="bg-white border-2 border-gray-300 hover:border-primary hover:bg-primary/5 transition-all duration-200 flex items-center justify-center group inline-flex px-4 py-2 sm:px-5 sm:py-2.5 md:px-6 md:py-3 rounded-lg"
            >
              <span className="text-gray-800 group-hover:text-primary font-medium text-sm sm:text-base">
                ニュース一覧はこちら
              </span>
              <svg
                className="w-3 h-3 sm:w-4 sm:h-4 text-gray-800 group-hover:text-primary ml-2 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

