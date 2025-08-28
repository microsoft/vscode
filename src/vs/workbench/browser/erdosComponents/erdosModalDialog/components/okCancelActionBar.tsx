/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './okCancelActionBar.css';

import React, { ReactElement } from 'react';

import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';
import { PlatformNativeDialogActionBar } from './platformNativeDialogActionBar.js';

interface OKCancelActionBarProps {
	okButtonTitle?: string;
	cancelButtonTitle?: string;
	preActions?: () => ReactElement;
	onAccept: () => void;
	onCancel: () => void;
}

export const OKCancelActionBar = (props: OKCancelActionBarProps) => {
	const preActions = props.preActions ? props.preActions() : null;
	const okButton = (
		<Button className='action-bar-button default' onPressed={props.onAccept}>
			{props.okButtonTitle ?? localize('erdosOK', "OK")}
		</Button>
	);
	const cancelButton = (
		<Button className='action-bar-button' onPressed={props.onCancel}>
			{props.cancelButtonTitle ?? localize('erdosCancel', "Cancel")}
		</Button>
	);

	return (
		<div className='ok-cancel-action-bar top-separator'>
			{preActions}
			<PlatformNativeDialogActionBar primaryButton={okButton} secondaryButton={cancelButton} />
		</div>
	);
};
