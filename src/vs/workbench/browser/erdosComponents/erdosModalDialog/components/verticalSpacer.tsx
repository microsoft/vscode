/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './verticalSpacer.css';

import React, { PropsWithChildren } from 'react';

export const VerticalSpacer = (props: PropsWithChildren) => {
	return (
		<div className='vertical-spacer'>
			{props.children}
		</div>
	);
};
