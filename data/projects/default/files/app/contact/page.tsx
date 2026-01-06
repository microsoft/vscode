'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { createContact } from '@/lib/firebase/contact';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    privacyAgreed: false,
  });
  const [emailError, setEmailError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // メールアドレスのバリデーション
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // フォームが有効かチェック
  const isFormValid = (): boolean => {
    return (
      formData.name.trim() !== '' &&
      formData.email.trim() !== '' &&
      validateEmail(formData.email) &&
      formData.company.trim() !== '' &&
      formData.message.trim() !== '' &&
      formData.privacyAgreed
    );
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.privacyAgreed) {
      alert('プライバシーポリシーに同意してください');
      return;
    }

    if (!validateEmail(formData.email)) {
      setEmailError('正しいメールアドレスを入力してください');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setEmailError('');

    try {
      await createContact({
        name: formData.name,
        email: formData.email,
        company: formData.company,
        message: formData.message,
      });
      setSubmitStatus('success');
      setFormData({ name: '', email: '', company: '', message: '', privacyAgreed: false });
    } catch (error) {
      console.error('Failed to submit contact:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    // メールアドレスのバリデーション
    if (name === 'email') {
      if (value.trim() === '') {
        setEmailError('');
      } else if (!validateEmail(value)) {
        setEmailError('正しいメールアドレスを入力してください');
      } else {
        setEmailError('');
      }
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  // 構造化データ（JSON-LD）を生成
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'お問い合わせフォーム - 株式会社MoonJapan',
    description: '株式会社MoonJapanへの各種お問い合わせフォーム',
    mainEntity: {
      '@type': 'Organization',
      name: '株式会社MoonJapan',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'お問い合わせ',
        availableLanguage: ['Japanese'],
        email: 'info@moon-japan.com',
        areaServed: 'JP',
      },
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
              <span className="text-gray-900">お問い合わせ</span>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
          <div className="max-w-3xl mx-auto">
            {/* ヘッダー */}
            <div className="mb-8 md:mb-12">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
                <span className="relative inline-block" style={{ zIndex: 1 }}>
                  Contact
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
                  - お問い合わせ
                </span>
              </h1>
              <p className="text-gray-600 text-sm sm:text-base md:text-lg leading-relaxed">
                お問い合わせはこちらのフォームよりお願いいたします。確認後、順次ご返信いたしますのでしばらくお待ちください。
              </p>
            </div>

            {/* フォーム */}
            <div className="rounded-lg p-6 md:p-8 lg:p-10 shadow-sm" style={{ backgroundColor: '#fafafa' }}>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* お名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                    お名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="山田太郎"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-900"
                  />
                </div>

                {/* メールアドレス */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-2">
                    メールアドレス <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="moonjapan@example.com"
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-900 ${
                      emailError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {emailError && (
                    <p className="mt-1 text-sm text-red-600">{emailError}</p>
                  )}
                </div>

                {/* 会社名 */}
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-gray-900 mb-2">
                    会社名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    required
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="株式会社MoonJapan"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-900"
                  />
                </div>

                {/* お問い合わせ */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-900 mb-2">
                    お問い合わせ <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="お問い合わせ内容を記入してください"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-gray-900 resize-none"
                  />
                </div>

                {/* プライバシーポリシー同意 */}
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="privacyAgreed"
                    name="privacyAgreed"
                    checked={formData.privacyAgreed}
                    onChange={handleChange}
                    required
                    className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="privacyAgreed" className="ml-2 text-sm text-gray-900">
                    プライバシーポリシーに同意する
                  </label>
                </div>

                {/* 送信ステータス */}
                {submitStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                    お問い合わせありがとうございます。送信が完了しました。
                  </div>
                )}
                {submitStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    送信に失敗しました。もう一度お試しください。
                  </div>
                )}

                {/* 送信ボタン */}
                <div className="pt-4 flex justify-center">
                  <button
                    type="submit"
                    disabled={isSubmitting || !isFormValid()}
                    className={`font-semibold px-6 py-3 rounded-full text-sm sm:text-base transition-all duration-200 inline-flex items-center justify-center ${
                      isFormValid() && !isSubmitting
                        ? 'bg-primary hover:bg-primary/90 text-black shadow-lg hover:shadow-xl transform hover:scale-105'
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                    style={{ width: '200px' }}
                  >
                    {isSubmitting ? '送信中...' : '送信'}
                    {!isSubmitting && (
                      <svg
                        className="w-4 h-4 ml-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
