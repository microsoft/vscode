/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

interface PlotsIconProps {
	width?: number;
	height?: number;
	className?: string;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
}

/**
 * SVG bar chart icon for plots attachment
 * Based on Rao's plots icon design
 */
export const PlotsIcon: React.FC<PlotsIconProps> = ({
	width = 16,
	height = 16,
	className = '',
	fill = 'none',
	stroke = 'currentColor',
	strokeWidth = 1.5
}) => {
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
			{/* Bar chart bars - white and moderate gray */}
			<rect x="4" y="12" width="7" height="10" fill="#FFFFFF" stroke={stroke} strokeWidth="0.5" />
			<rect x="13" y="4" width="7" height="18" fill="#888888" />
			
			{/* Chart axes - lighter gray */}
			<line x1="2" y1="22" x2="22" y2="22" stroke="#AAAAAA" strokeWidth="2" />
			<line x1="2" y1="22" x2="2" y2="2" stroke="#AAAAAA" strokeWidth="2" />
		</svg>
	);
};
