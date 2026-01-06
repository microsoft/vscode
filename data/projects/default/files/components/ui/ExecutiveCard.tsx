import Image from 'next/image';

interface ExecutiveCardProps {
  imageUrl: string;
  imageAlt: string;
  englishName: string;
  japaneseName: string;
  position: string;
  message: string;
  imageWidth?: number;
  imageHeight?: number;
}

export const ExecutiveCard = ({
  imageUrl,
  imageAlt,
  englishName,
  japaneseName,
  position,
  message,
  imageWidth = 249,
  imageHeight = 362,
}: ExecutiveCardProps) => {
  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
      <div className="flex-shrink-0">
        <Image
          src={imageUrl}
          alt={imageAlt}
          width={imageWidth}
          height={imageHeight}
          className="rounded-lg object-cover object-top w-[200px] sm:w-[249px]"
          style={{ height: '300px' }}
          sizes="(max-width: 640px) 200px, 249px"
        />
      </div>
      <div 
        className="flex-1 pl-4 md:pl-6 flex flex-col"
        style={{ 
          borderLeft: '4px solid #f5b655',
          minHeight: '300px',
        }}
      >
        <div className="mb-4 flex flex-col md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="flex flex-col mb-2 md:mb-0">
            <h3 
              className="mb-1"
              style={{ 
                color: '#848484',
                fontSize: '24px',
                fontWeight: 500,
              }}
            >
              {englishName}
            </h3>
            <p 
              className="mb-1"
              style={{ 
                fontSize: '32px',
                fontWeight: 500,
                color: '#1f2937',
              }}
            >
              {japaneseName}
            </p>
          </div>
          <p 
            className="text-base text-gray-600 md:text-right"
            style={{ fontWeight: 500 }}
          >
            {position}
          </p>
        </div>
        <p className="text-sm sm:text-base text-gray-700 leading-relaxed flex-1">
          {message}
        </p>
      </div>
    </div>
  );
};

