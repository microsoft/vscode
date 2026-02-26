import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useMemo, useState } from 'react';

const steps = ['تایید شماره', 'تنظیم رمز عبور', 'اطلاعات هویتی', 'بارگذاری مدارک'];
const baseValues = { phone: '', password: '', fullName: '', nationalCode: '' };

export default function RegisterFlow() {
  const [step, setStep] = useState(Number(localStorage.getItem('registerStep') || 1));
  const initialValues = useMemo(
    () => ({ ...baseValues, ...JSON.parse(localStorage.getItem('registerForm') || '{}') }),
    []
  );

  const validationSchema = Yup.object({
    phone: Yup.string().min(11).required('شماره موبایل الزامی است'),
    password: step >= 2 ? Yup.string().min(8).required('رمز عبور الزامی است') : Yup.string(),
    fullName: step >= 3 ? Yup.string().required('نام و نام خانوادگی الزامی است') : Yup.string(),
    nationalCode: step >= 3 ? Yup.string().length(10).required('کد ملی الزامی است') : Yup.string()
  });

  const form = useFormik({
    initialValues,
    enableReinitialize: false,
    validationSchema,
    onSubmit: (values) => {
      localStorage.setItem('registerForm', JSON.stringify(values));
      const nextStep = Math.min(4, step + 1);
      localStorage.setItem('registerStep', String(nextStep));
      setStep(nextStep);
    }
  });

  return (
    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl space-y-4">
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${(step / 4) * 100}%` }} />
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">مرحله {step}: {steps[step - 1]}</p>

      <form onSubmit={form.handleSubmit} className="grid md:grid-cols-2 gap-3">
        <input name="phone" onChange={form.handleChange} value={form.values.phone} placeholder="شماره موبایل" className="p-2 rounded border" />
        <input name="password" type="password" onChange={form.handleChange} value={form.values.password} placeholder="رمز عبور" className="p-2 rounded border" />
        <input name="fullName" onChange={form.handleChange} value={form.values.fullName} placeholder="نام و نام خانوادگی" className="p-2 rounded border" />
        <input name="nationalCode" onChange={form.handleChange} value={form.values.nationalCode} placeholder="کد ملی" className="p-2 rounded border" />

        <div className="md:col-span-2 flex items-center justify-between">
          <span className="text-xs text-amber-600">هزینه هر مرحله: ۸۰٬۰۰۰ ریال</span>
          <button className="px-3 py-2 bg-emerald-600 text-white rounded">{step === 4 ? 'اتمام ثبت‌نام' : 'مرحله بعدی'}</button>
        </div>
      </form>
    </div>
  );
}
