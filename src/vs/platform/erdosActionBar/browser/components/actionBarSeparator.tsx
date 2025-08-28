/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBarSeparator.css';

import React from 'react';

import { optionalBoolean, erdosClassNames } from '../../../../base/common/erdosUtilities.js';

export interface ActionBarSeparatorProps {
	fadeIn?: boolean;
}

export const ActionBarSeparator = (props: ActionBarSeparatorProps) => {
	return (
		<div
			aria-hidden='true'
			className={erdosClassNames(
				'action-bar-separator',
				{ 'fade-in': optionalBoolean(props.fadeIn) }
			)} >
			<div className='action-bar-separator-icon codicon codicon-erdos-separator' />
		</div>
	);
};