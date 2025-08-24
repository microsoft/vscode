/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './folderTemplateLogo.css';

import React from 'react';

export const LogoRProject = () => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		viewBox='0 0 724 561'
		className='folder-template-logo'
	>
		<defs>
			<linearGradient
				id='r-blue-circle'
				x1={0}
				x2={1}
				y1={0}
				y2={1}
				gradientUnits='objectBoundingBox'
				spreadMethod='pad'
			>
				<stop offset={0} stopColor='#CBCED0' />
				<stop offset={1} stopColor='#84838B' />
			</linearGradient>
			<linearGradient
				id='r-letter-r'
				x1={0}
				x2={1}
				y1={0}
				y2={1}
				gradientUnits='objectBoundingBox'
				spreadMethod='pad'
			>
				<stop offset={0} stopColor='#276DC3' />
				<stop offset={1} stopColor='#165CAA' />
			</linearGradient>
		</defs>
		<path
			fill='url(#r-blue-circle)'
			fillRule='evenodd'
			d='M361.453 485.937C162.329 485.937.906 377.828.906 244.469.906 111.109 162.329 3 361.453 3 560.578 3 722 111.109 722 244.469c0 133.359-161.422 241.468-360.547 241.468Zm55.188-388.531c-151.352 0-274.047 73.908-274.047 165.078s122.695 165.078 274.047 165.078c151.351 0 263.046-50.529 263.046-165.078 0-114.513-111.695-165.078-263.046-165.078Z'
		/>
		<path
			fill='url(#r-letter-r)'
			fillRule='evenodd'
			d='M550 377s21.822 6.585 34.5 13c4.399 2.226 12.01 6.668 17.5 12.5 5.378 5.712 8 11.5 8 11.5l86 145-139 .062L492 437s-13.31-22.869-21.5-29.5c-6.832-5.531-9.745-7.5-16.5-7.5h-33.026L421 558.974l-123 .052V152.938h247S657.5 154.967 657.5 262 550 377 550 377Zm-53.5-135.976-74.463-.048-.037 69.05 74.5-.024s34.5-.107 34.5-35.125c0-35.722-34.5-33.853-34.5-33.853Z'
		/>
	</svg>
);
