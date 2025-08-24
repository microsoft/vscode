/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

interface ChevronIconProps {
	width?: number;
	height?: number;
	className?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	direction?: 'up' | 'down' | 'left' | 'right';
}

export const ChevronIcon: React.FC<ChevronIconProps> = ({
	width = 12,
	height = 12,
	className = '',
	fill = 'none',
	stroke = 'currentColor',
	strokeWidth = 1.5,
	direction = 'up'
}) => {
	const getPath = () => {
		switch (direction) {
			case 'up':
				return 'M7.5 11.25L12 6.75L16.5 11.25';
			case 'down':
				return 'M16.5 12.75L12 17.25L7.5 12.75';
			case 'left':
				return 'M11.25 7.5L6.75 12L11.25 16.5';
			case 'right':
				return 'M12.75 16.5L17.25 12L12.75 7.5';
			default:
				return 'M7.5 11.25L12 6.75L16.5 11.25';
		}
	};

	return (
		<svg
			width={width}
			height={height}
			viewBox="0 0 24 24"
			fill={fill}
			stroke={stroke}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d={getPath()} />
		</svg>
	);
};

