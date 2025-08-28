/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './okActionBar.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';

interface OKActionBarProps {
	okButtonTitle?: string;
	onAccept: () => void;
}

export const OKActionBar = (props: OKActionBarProps) => {
	return (
		<div className='ok-action-bar top-separator'>
			<Button className='action-bar-button default' onPressed={props.onAccept}>
				{props.okButtonTitle ?? localize('erdosOK', "OK")}
			</Button>
		</div>
	);
};
