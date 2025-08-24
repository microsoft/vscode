/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './verticalStack.css';

import React, { PropsWithChildren } from 'react';

export const VerticalStack = (props: PropsWithChildren) => {
	return (
		<div className='vertical-stack'>
			{props.children}
		</div>
	);
};
