/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
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
