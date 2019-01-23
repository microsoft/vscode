/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import product from 'vs/platform/node/product';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IRequestService } from 'vs/platform/request/node/request';
import { State, IUpdate, AvailableForDownload, UpdateType } from 'vs/platform/update/common/update';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { createUpdateURL, AbstractUpdateService } from 'vs/platform/update/electron-main/abstractUpdateService';
import { asJson } from 'vs/base/node/request';
import { shell } from 'electron';
import { CancellationToken } from 'vs/base/common/cancellation';
import * as path from 'path';
import { spawn } from 'child_process';
import { realpath } from 'fs';

export class LinuxUpdateService extends AbstractUpdateService {

	_serviceBrand: any;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService
	) {
		super(lifecycleService, configurationService, environmentService, requestService, logService);
	}

	protected buildUpdateFeedUrl(quality: string): string {
		return createUpdateURL(`linux-${process.arch}`, quality);
	}

	protected doCheckForUpdates(context: any): void {
		if (!this.url) {
			return;
		}

		this.setState(State.CheckingForUpdates(context));

		if (process.env.SNAP && process.env.SNAP_REVISION) {
			this.checkForSnapUpdate();
		} else {
			this.requestService.request({ url: this.url }, CancellationToken.None)
				.then<IUpdate>(asJson)
				.then(update => {
					if (!update || !update.url || !update.version || !update.productVersion) {
						/* __GDPR__
								"update:notAvailable" : {
									"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
								}
							*/
						this.telemetryService.publicLog('update:notAvailable', { explicit: !!context });

						this.setState(State.Idle(UpdateType.Archive));
					} else {
						this.setState(State.AvailableForDownload(update));
					}
				})
				.then(undefined, err => {
					this.logService.error(err);

					/* __GDPR__
						"update:notAvailable" : {
							"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
						}
						*/
					this.telemetryService.publicLog('update:notAvailable', { explicit: !!context });

					// only show message when explicitly checking for updates
					const message: string | undefined = !!context ? (err.message || err) : undefined;
					this.setState(State.Idle(UpdateType.Archive, message));
				});
		}
	}

	private checkForSnapUpdate(): void {
		// If the application was installed as a snap, updates happen in the
		// background automatically, we just need to check to see if an update
		// has already happened.
		realpath(`${path.dirname(process.env.SNAP!)}/current`, (err, resolvedCurrentSnapPath) => {
			if (err) {
				this.logService.error('update#checkForSnapUpdate(): Could not get realpath of application.');
				return;
			}

			const currentRevision = path.basename(resolvedCurrentSnapPath);

			if (process.env.SNAP_REVISION !== currentRevision) {
				// TODO@joao: snap
				this.setState(State.Ready({ version: '', productVersion: '' }));
			} else {
				this.setState(State.Idle(UpdateType.Archive));
			}
		});
	}

	protected async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		// Use the download URL if available as we don't currently detect the package type that was
		// installed and the website download page is more useful than the tarball generally.
		if (product.downloadUrl && product.downloadUrl.length > 0) {
			shell.openExternal(product.downloadUrl);
		} else if (state.update.url) {
			shell.openExternal(state.update.url);
		}

		this.setState(State.Idle(UpdateType.Archive));
	}

	protected doQuitAndInstall(): void {
		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		const snap = process.env.SNAP;

		// TODO@joao what to do?
		if (!snap) {
			return;
		}

		// Allow 3 seconds for VS Code to close
		spawn('bash', ['-c', path.join(snap, `usr/share/${product.applicationName}/snapUpdate.sh`)], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore']
		});
	}
}
