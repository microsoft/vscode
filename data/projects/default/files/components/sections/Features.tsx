import { Card } from '@/components/ui/Card';

const features = [
  {
    title: '高品質なサービス',
    description: '最新の技術と豊富な経験を活かした高品質なサービスを提供します。',
    icon: '✨',
  },
  {
    title: '迅速な対応',
    description: 'お客様のニーズに迅速かつ柔軟に対応いたします。',
    icon: '⚡',
  },
  {
    title: '継続的なサポート',
    description: '導入後も継続的なサポートとメンテナンスを提供します。',
    icon: '🤝',
  },
];

export const Features = () => {
  return (
    <section id="features" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
          特徴
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="text-center">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

