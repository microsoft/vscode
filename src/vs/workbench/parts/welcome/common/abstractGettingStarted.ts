/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import product from 'vs/platform/product';

/**
 * This extensions handles the first launch expereince for new users
 */
export abstract class AbstractGettingStarted implements IWorkbenchContribution {
	protected static hideWelcomeSettingskey = 'workbench.hide.welcome';

	protected welcomePageURL: string;
	protected appName: string;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.appName = product.nameLong;

		if (product.welcomePage && !environmentService.isExtensionDevelopment /* do not open a browser when we run an extension */) {
			this.welcomePageURL = product.welcomePage;
			this.handleWelcome();
		}
	}

	protected handleWelcome(): void {
		let firstStartup = !this.storageService.get(AbstractGettingStarted.hideWelcomeSettingskey);

		if (firstStartup && this.welcomePageURL) {
			this.telemetryService.getTelemetryInfo().then(info => {
				let url = this.getUrl(info);
				this.openExternal(url);
				this.storageService.store(AbstractGettingStarted.hideWelcomeSettingskey, true);
			});
		}
	}

	private getUrl(telemetryInfo: ITelemetryInfo): string {
		return `${this.welcomePageURL}&&from=${this.appName}&&id=${telemetryInfo.machineId}`;
	}

	protected openExternal(url: string) {
		throw new Error('implement me');
	}

	public getId(): string {
		return 'vs.gettingstarted';
	}
}