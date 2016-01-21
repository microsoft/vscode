/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IWorkbenchContribution} from 'vs/workbench/common/contributions';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService, StorageScope, StorageEvent, StorageEventType} from 'vs/platform/storage/common/storage';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';

import { shell } from 'electron';

/**
 * This extensions handles the first launch expereince for new users
 */
export class GettingStarted implements IWorkbenchContribution {
	private static hideWelcomeSettingskey = 'workbench.hide.welcome';

	private welcomePageURL: string;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		const env = contextService.getConfiguration().env;
		if (env.welcomePage) {
			this.welcomePageURL =  env.welcomePage;
			this.handleWelcome();
		}
	}

	private handleWelcome(): void {
		let firstStartup = !this.storageService.get(GettingStarted.hideWelcomeSettingskey);

		if (firstStartup && this.welcomePageURL) {
			this.telemetryService.getTelemetryInfo().then(info=>{
				let url = this.getUrl(info);
				shell.openExternal(url);
				this.storageService.store(GettingStarted.hideWelcomeSettingskey, true);
			});
		}

	}

	private getUrl(telemetryInfo: ITelemetryInfo): string {
		return `${this.welcomePageURL}&&from=vscode&&id=${telemetryInfo.machineId}`;
	}

	public getId(): string {
		return 'vs.gettingstarted';
	}
}