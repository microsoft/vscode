/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './folderTemplateLogo.css';

import React from 'react';

export const LogoPythonProject = () => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		xmlSpace='preserve'
		viewBox='0 0 100 100'
		className='folder-template-logo'
	>
		<linearGradient
			id='python-blue-snake'
			x1={732.466}
			x2={826.801}
			y1={-296.523}
			y2={-377.686}
			gradientTransform='matrix(.5625 0 0 -.568 -412.641 -165.03)'
			gradientUnits='userSpaceOnUse'
		>
			<stop
				offset={0}
				style={{
					stopColor: '#5c9fd3',
				}}
			/>
			<stop
				offset={1}
				style={{
					stopColor: '#316a99',
				}}
			/>
		</linearGradient>
		<path
			fill='url(#python-blue-snake)'
			d='M49.3.6c-4 0-7.8.4-11.1.9-9.8 1.7-11.6 5.4-11.6 12.1v8.8h23.2v2.9H17.9c-6.7 0-12.6 4.1-14.5 11.8-2.1 8.8-2.2 14.4 0 23.6C5 67.6 9 72.5 15.7 72.5h8V61.9c0-7.7 6.6-14.4 14.5-14.4h23.2c6.5 0 11.6-5.3 11.6-11.8V13.6c0-6.3-5.3-11-11.6-12.1-4-.6-8.2-.9-12.1-.9zM36.7 7.7c2.4 0 4.4 2 4.4 4.4 0 2.4-2 4.4-4.4 4.4-2.4 0-4.4-2-4.4-4.4.1-2.4 2-4.4 4.4-4.4z'
		/>
		<linearGradient
			id='python-yellow-snake'
			x1={863.271}
			x2={829.584}
			y1={-426.809}
			y2={-379.148}
			gradientTransform='matrix(.5625 0 0 -.568 -412.641 -165.03)'
			gradientUnits='userSpaceOnUse'
		>
			<stop
				offset={0}
				style={{
					stopColor: '#ffd53d',
				}}
			/>
			<stop
				offset={1}
				style={{
					stopColor: '#fee875',
				}}
			/>
		</linearGradient>
		<path
			fill='url(#python-yellow-snake)'
			d='M75.9 25.4v10.3c0 8-6.8 14.7-14.5 14.7H38.2c-6.3 0-11.6 5.4-11.6 11.8v22.1c0 6.3 5.5 10 11.6 11.8 7.3 2.2 14.4 2.5 23.2 0C67.2 94.4 73 91 73 84.3v-8.8H49.8v-2.9h34.8c6.7 0 9.3-4.7 11.6-11.8 2.4-7.3 2.3-14.3 0-23.6-1.7-6.7-4.8-11.8-11.6-11.8h-8.7zm-13.1 56c2.4 0 4.4 2 4.4 4.4 0 2.4-1.9 4.4-4.4 4.4-2.4 0-4.4-2-4.4-4.4.1-2.5 2-4.4 4.4-4.4z'
		/>
	</svg>
);
