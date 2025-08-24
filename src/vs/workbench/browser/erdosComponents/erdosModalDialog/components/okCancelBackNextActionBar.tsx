/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './okCancelBackNextActionBar.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/erdosComponents/button/button.js';
import * as platform from '../../../../../base/common/platform.js';

export interface OKCancelBackNextActionBarProps {
	okButtonConfig?: ActionBarButtonConfig;
	cancelButtonConfig?: ActionBarButtonConfig;
	backButtonConfig?: ActionBarButtonConfig;
	nextButtonConfig?: ActionBarButtonConfig;
}

export interface ActionBarButtonConfig {
	title?: string;
	disable?: boolean;
	onClick?: () => void;
}

export const OKCancelBackNextActionBar = ({ okButtonConfig, cancelButtonConfig, backButtonConfig, nextButtonConfig }: OKCancelBackNextActionBarProps) => {
	const cancelButton = (cancelButtonConfig ?
		<Button className='action-bar-button' disabled={cancelButtonConfig.disable ?? false} onPressed={cancelButtonConfig.onClick}>
			{cancelButtonConfig.title ?? localize('erdosCancel', "Cancel")}
		</Button> : null);
	const okButton = (okButtonConfig ?
		<Button className='action-bar-button default' disabled={okButtonConfig.disable ?? false} onPressed={okButtonConfig.onClick}>
			{okButtonConfig.title ?? localize('erdosOK', "OK")}
		</Button> : null);
	const nextButton = (nextButtonConfig ?
		<Button className='action-bar-button default' disabled={nextButtonConfig.disable ?? false} onPressed={nextButtonConfig.onClick}>
			{nextButtonConfig.title ?? localize('erdosNext', "Next")}
		</Button> : null);

	return (
		<div className='ok-cancel-back-action-bar top-separator'>
			<div className='left-actions'>
				{backButtonConfig ?
					<Button className='action-bar-button' disabled={backButtonConfig.disable ?? false} onPressed={backButtonConfig.onClick}>
						{backButtonConfig.title ?? localize('erdosBack', "Back")}
					</Button> : null
				}
			</div>
			<div className='right-actions'>
				{platform.isWindows
					? <>{nextButton}{okButton}{cancelButton}</>
					: <>{cancelButton}{nextButton}{okButton}</>
				}
			</div>
		</div>
	);
};
