/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';

export class GettingStarted implements IWorkbenchContribution {

	private static readonly hideWelcomeSettingskey = 'workbench.hide.welcome';

	private welcomePageURL: string;
	private appName: string;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.appName = product.nameLong;

		if (!product.welcomePage) {
			return;
		}

		if (environmentService.skipGettingStarted) {
			return;
		}

		if (environmentService.isExtensionDevelopment) {
			return;
		}

		this.welcomePageURL = product.welcomePage;
		this.handleWelcome();
	}

	private getUrl(telemetryInfo: ITelemetryInfo): string {
		return `${this.welcomePageURL}&&from=${this.appName}&&id=${telemetryInfo.machineId}`;
	}

	private openExternal(url: string) {
		// Don't open the welcome page as the root user on Linux, this is due to a bug with xdg-open
		// which recommends against running itself as root.
		if (platform.isLinux && platform.isRootUser()) {
			return;
		}
		window.open(url);
	}

	private handleWelcome(): void {
		//make sure the user is online, otherwise refer to the next run to show the welcome page
		if (!navigator.onLine) {
			return;
		}

		let firstStartup = !this.storageService.get(GettingStarted.hideWelcomeSettingskey);

		if (firstStartup && this.welcomePageURL) {
			this.telemetryService.getTelemetryInfo().then(info => {
				let url = this.getUrl(info);
				this.openExternal(url);
				this.storageService.store(GettingStarted.hideWelcomeSettingskey, true);
			});
		}
	}
}
