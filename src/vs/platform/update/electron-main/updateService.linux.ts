/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IRequestService } from 'vs/platform/request/node/request';
import { State, IUpdate } from 'vs/platform/update/common/update';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { createUpdateURL, AbstractUpdateService } from 'vs/platform/update/electron-main/abstractUpdateService';
import { asJson } from 'vs/base/node/request';

export class LinuxUpdateService extends AbstractUpdateService {

	_serviceBrand: any;

	private url: string | undefined;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRequestService private requestService: IRequestService,
		@ILogService logService: ILogService
	) {
		super(lifecycleService, configurationService, environmentService, logService);
	}

	protected setUpdateFeedUrl(quality: string): boolean {
		this.url = createUpdateURL(`linux-${process.arch}`, quality);
		return true;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		this.requestService.request({ url: this.url })
			.then<IUpdate>(asJson)
			.then(update => {
				if (!update || !update.url || !update.version || !update.productVersion) {
					/* __GDPR__
							"update:notAvailable" : {
								"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
						*/
					this.telemetryService.publicLog('update:notAvailable', { explicit });

					this.setState(State.Idle);
				} else {
					this.setState(State.Available(update));
				}
			})
			.then(null, err => {
				this.logService.error(err);

				/* __GDPR__
					"update:notAvailable" : {
					"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
					*/
				this.telemetryService.publicLog('update:notAvailable', { explicit });
				this.setState(State.Idle);
			});
	}

	protected doQuitAndInstall(): void {
		// not available
	}
}
