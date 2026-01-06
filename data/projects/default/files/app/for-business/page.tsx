'use client';

import { BusinessHeader } from '@/components/layout/BusinessHeader';
import { Footer } from '@/components/sections/Footer';
import { HeroSection } from '@/components/sections/ForBusiness/HeroSection';
import { MoonShotSection } from '@/components/sections/ForBusiness/MoonShotSection';
import { WhyPartnershipSection } from '@/components/sections/ForBusiness/WhyPartnershipSection';
import { CaseStudiesSection } from '@/components/sections/ForBusiness/CaseStudiesSection';
import { IntroductionFlowSection } from '@/components/sections/ForBusiness/IntroductionFlowSection';
import { PricingSection } from '@/components/sections/ForBusiness/PricingSection';
import { FAQSection } from '@/components/sections/ForBusiness/FAQSection';
import { CTASection } from '@/components/sections/ForBusiness/CTASection';
import { CompanyInfoSection } from '@/components/sections/ForBusiness/CompanyInfoSection';
import { PrivacyPolicySection } from '@/components/sections/ForBusiness/PrivacyPolicySection';

export default function ForBusinessPage() {
  return (
    <>
      <BusinessHeader />
      <main className="pt-16 md:pt-20">
        <HeroSection />
        <MoonShotSection />
        <WhyPartnershipSection />
        <CaseStudiesSection />
        <IntroductionFlowSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
        <CompanyInfoSection />
        <PrivacyPolicySection />
      </main>
      <Footer />
    </>
  );
}
