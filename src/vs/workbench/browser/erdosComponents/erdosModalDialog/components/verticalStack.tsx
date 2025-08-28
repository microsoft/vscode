/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
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
