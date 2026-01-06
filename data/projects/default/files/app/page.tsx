'use client';

import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { NewsSection } from "@/components/sections/News";
import { Contact } from "@/components/sections/Contact";

export default function Home() {
  const handleCtaClick = () => {
    const contactSection = document.getElementById("contact");
    contactSection?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white">
      <Hero
        title="株式会社MoonJapanへようこそ"
        subtitle="革新的なソリューションで未来を創造します"
        ctaText="お問い合わせ"
        onCtaClick={handleCtaClick}
      />
      <Services />
      <NewsSection />
      <Contact />
    </div>
  );
}

