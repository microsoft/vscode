import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const content = {
  '/terms': {
    title: 'شرایط استفاده',
    body: 'این پلتفرم هیچ‌گونه سود تضمینی ارائه نمی‌کند و کلیه سرمایه‌گذاری‌ها همراه با ریسک بازار هستند.'
  },
  '/privacy': {
    title: 'حریم خصوصی',
    body: 'اطلاعات کاربران فقط برای ارائه خدمات مالی استفاده شده و مطابق قوانین جاری کشور نگهداری می‌شود.'
  },
  '/kyc': {
    title: 'قوانین احراز هویت',
    body: 'انجام احراز هویت سطح ۲ برای برداشت، سرمایه‌گذاری و درخواست وام الزامی است.'
  },
  '/transparency': {
    title: 'شفافیت مالی',
    body: 'کارمزدها، جرایم دیرکرد و وضعیت هر پروژه قبل از تایید نهایی به‌صورت شفاف نمایش داده می‌شود.'
  }
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const page = useMemo(() => content[pathname] || content['/terms'], [pathname]);

  return (
    <section className="p-6 rounded-xl bg-white dark:bg-slate-800">
      <h1 className="text-2xl font-bold mb-4">{page.title}</h1>
      <p className="leading-8 text-slate-700 dark:text-slate-200">{page.body}</p>
    </section>
  );
}
