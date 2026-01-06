'use client';

import Image from 'next/image';

const STUDENTS_IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/moon-japan-lp.firebasestorage.app/o/s-2160x1233_v-frms_webp_85298fef-46f7-4cbc-ab1d-bf1d546230eb.png?alt=media&token=946bd167-e3bf-4c51-a631-636558e881f6';

export const MoonShotSection = () => {
  return (
    <section id="moonshot" className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* セクションタイトル */}
        <div className="mb-12 md:mb-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-primary text-3xl md:text-4xl font-bold">&gt;</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">
              MoonShotとは
            </h2>
            <span className="text-sm md:text-base text-gray-500 ml-2">About</span>
          </div>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-6 leading-relaxed">
            進学・就職を検討する高校生を対象とした<br className="hidden sm:block" />
            探究学習プログラム「MoonShot」が目指すもの
          </p>
          <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
            地域の課題に向き合うことで<br />
            新たな価値を生み出す『探究学習プログラム』
          </h3>
        </div>

        {/* セクション1：MoonShotの基本理念（左：説明文、右：図解） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 mb-16 md:mb-20 items-center">
          {/* 左側：説明文 */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-primary text-2xl sm:text-3xl font-bold">&gt;</span>
              <h4 className="text-2xl sm:text-3xl font-bold text-gray-900">
                MoonShotの基本理念
              </h4>
            </div>
            <div className="space-y-4 pl-4">
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                日本のインフラを支え、暮らしを回してきた企業は、毎日「正解のない問い」と向き合いながら、試行錯誤を重ねてきたプロの集団だと私たちは考えています。
              </p>
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                そのプロたちが実際に抱えているリアルな課題を題材に、高校生が同じ目線で考え、解決策を探っていく——それが、MoonJapanの探究DXプラットフォーム「MoonShot」による共育型探究プログラムです。
              </p>
            </div>
          </div>

          {/* 右側：図解 */}
          <div className="flex flex-col items-center order-1 lg:order-2">
            <div className="relative w-full max-w-md">
              <div className="relative w-full aspect-square">
                <div className="absolute inset-0 rounded-full border-4 border-gray-200 bg-white shadow-xl flex items-center justify-center">
                  <div className="grid grid-cols-2 gap-6 w-4/5 h-4/5">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-3 shadow-md">
                        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-gray-900 text-center">教育界</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3 shadow-md">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-gray-900 text-center">産業動向</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 shadow-md">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-gray-900 text-center">産業界</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-3 shadow-md">
                        <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-gray-900 text-center">社会ニーズ</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* セクション2：本気の学びが生まれる理由（左：図解、右：説明文） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 mb-16 md:mb-20 items-center">
          {/* 左側：図解 */}
          <div className="flex flex-col items-center order-1">
            <div className="w-full max-w-md space-y-6">
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-100 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">職業理解</p>
                </div>
                <div className="bg-orange-100 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">人材確保</p>
                </div>
                <div className="bg-emerald-100 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">視野拡大</p>
                </div>
                <div className="bg-cyan-100 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">地域活性</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-200 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">高校</p>
                </div>
                <div className="bg-gray-200 rounded-2xl p-4 sm:p-5 text-center shadow-md hover:shadow-lg transition-shadow">
                  <p className="text-sm sm:text-base font-bold text-gray-900">企業</p>
                </div>
              </div>
            </div>
          </div>

          {/* 右側：説明文 */}
          <div className="space-y-6 order-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-primary text-2xl sm:text-3xl font-bold">&gt;</span>
              <h4 className="text-2xl sm:text-3xl font-bold text-gray-900">
                本気の学びが生まれる理由
              </h4>
            </div>
            <div className="space-y-4 pl-4">
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                教室にいながら、企業のみなさんの意思決定の裏側や仕事へのこだわりに触れられるからこそ、ただ"話を聞く"だけの企業説明会とは違う、本気の学びが生まれます。
              </p>
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                産業界が持つ最新の産業動向や社会課題、そこで働く人の価値観が、高校生の日々の授業や探究テーマとつながっていく——その接続点をつくるのが、私たちMoonJapanの役割です。
              </p>
            </div>
          </div>
        </div>

        {/* セクション3：進路指導のアップデート（左：説明文、右：図解） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 mb-16 md:mb-20 items-center">
          {/* 左側：説明文 */}
          <div className="space-y-6 order-2 lg:order-1">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-primary text-2xl sm:text-3xl font-bold">&gt;</span>
              <h4 className="text-2xl sm:text-3xl font-bold text-gray-900">
                進路指導のアップデート
              </h4>
            </div>
            <div className="space-y-4 bg-gray-50 rounded-xl p-6 md:p-8">
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                従来の偏差値・大学名だけに頼った進路指導から、
              </p>
              <div className="space-y-2 pl-4 border-l-2 border-primary">
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  「どんな社会課題に向き合いたいか」
                </p>
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  「どんな人たちと、どんな価値を生み出したいか」
                </p>
              </div>
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                という問いを起点にした進路選択へとアップデートしていく。
              </p>
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed mt-4">
                産業界のリアルな情報を教育に取り入れることで、社会のニーズに合った人材を増やすと同時に、就職時の「思っていた仕事と違った」「こんなはずじゃなかった」というようなミスマッチも減らしていきます。
              </p>
            </div>
          </div>

          {/* 右側：図解 */}
          <div className="flex flex-col items-center order-1 lg:order-2">
            <div className="w-full max-w-md">
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 shadow-lg">
                <Image
                  src={STUDENTS_IMAGE_URL}
                  alt="学生と企業の人のイラスト"
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* セクション4：MoonJapanの想い（左：図解、右：説明文） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 mb-16 md:mb-20 items-center">
          {/* 左側：図解（利用者数） */}
          <div className="flex flex-col items-center order-1">
            <div className="w-full max-w-md p-5 md:p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl border-2 border-primary/30 shadow-lg">
              <p className="text-base sm:text-lg md:text-xl font-bold text-gray-900 text-center">
                MoonShot利用生徒数
              </p>
              <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary text-center mt-2">
                約〇〇万人
              </p>
              <p className="text-sm sm:text-base text-gray-600 text-center mt-2">
                （2021年度〜2024年度累計実績）
              </p>
            </div>
          </div>

          {/* 右側：説明文 */}
          <div className="space-y-6 order-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-primary text-2xl sm:text-3xl font-bold">&gt;</span>
              <h4 className="text-2xl sm:text-3xl font-bold text-gray-900">
                MoonJapanの想い
              </h4>
            </div>
            <div className="space-y-4 bg-primary/5 rounded-xl p-6 md:p-8 border border-primary/20">
              <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
                企業と高校生、そして学校。三者が"共に育ち合う（共育）"関係をつくることで、育った学生が、誇りを持ちながら、自分らしい未来を選べる状態を増やしていきたい——MoonJapanはそんな想いで、このプログラムを届けています。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
