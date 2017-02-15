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

abstract class AbstractGettingStarted implements IWorkbenchContribution {
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
				if (this.telemetryService.getExperiments().openGettingStarted !== false) {
					let url = this.getUrl(info);
					this.openExternal(url);
				}
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

	getId(): string {
		return 'vs.gettingstarted';
	}
}

export class GettingStarted implements IWorkbenchContribution {

	private static hideWelcomeSettingskey = 'workbench.hide.welcome';

	private welcomePageURL: string;
	private appName: string;

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

	getId(): string {
		return 'vs.gettingstarted';
	}

	private getUrl(telemetryInfo: ITelemetryInfo): string {
		return `${this.welcomePageURL}&&from=${this.appName}&&id=${telemetryInfo.machineId}`;
	}

	private openExternal(url: string) {
		// Don't open the welcome page as the root user on Linux, this is due to a bug with xdg-open
		// which recommends against running itself as root.
		if (platform.isLinux && platform.isRootUser) {
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
				if (this.telemetryService.getExperiments().openGettingStarted !== false) {
					let url = this.getUrl(info);
					this.openExternal(url);
				}
				this.storageService.store(GettingStarted.hideWelcomeSettingskey, true);
			});
		}
	}
}