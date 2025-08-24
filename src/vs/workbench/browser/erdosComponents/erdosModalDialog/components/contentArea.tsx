/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './contentArea.css';

import React, { PropsWithChildren } from 'react';

export const ContentArea = (props: PropsWithChildren) => {
	return (
		<div className='content-area'>
			{props.children}
		</div>
	);
};
