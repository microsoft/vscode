/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AbstractGettingStarted } from 'vs/workbench/parts/welcome/common/abstractGettingStarted';
import * as platform from 'vs/base/common/platform';

export class GettingStarted extends AbstractGettingStarted implements IWorkbenchContribution {

	protected openExternal(url: string) {
		// Don't open the welcome page as the root user on Linux, this is due to a bug with xdg-open
		// which recommends against running itself as root.
		if (platform.isLinux && platform.isRootUser) {
			return;
		}
		window.open(url);
	}

	protected handleWelcome(): void {
		//make sure the user is online, otherwise refer to the next run to show the welcome page
		if (navigator.onLine) {
			super.handleWelcome();
		}
	}
}