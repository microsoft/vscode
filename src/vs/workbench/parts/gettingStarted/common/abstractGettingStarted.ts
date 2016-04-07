/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';

/**
 * This extensions handles the first launch expereince for new users
 */
export abstract class AbstractGettingStarted implements IWorkbenchContribution {
	protected static hideWelcomeSettingskey = 'workbench.hide.welcome';

	protected welcomePageURL: string;
	protected appName: string;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		const env = contextService.getConfiguration().env;
		this.appName = env.appName;

		if (env.welcomePage && !env.extensionTestsPath /* do not open a browser when we run tests */) {
			this.welcomePageURL =  env.welcomePage;
			this.handleWelcome();
		}
	}

	protected handleWelcome(): void {
		let firstStartup = !this.storageService.get(AbstractGettingStarted.hideWelcomeSettingskey);

		if (firstStartup && this.welcomePageURL) {
			this.telemetryService.getTelemetryInfo().then(info=>{
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