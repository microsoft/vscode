/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as electron from 'electron';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { fromNodeEventEmitter } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { State, IUpdate, StateType } from 'vs/platform/update/common/update';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractUpdateService, createUpdateURL } from 'vs/platform/update/electron-main/abstractUpdateService';

export class DarwinUpdateService extends AbstractUpdateService {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	@memoize private get onRawError(): Event<string> { return fromNodeEventEmitter(electron.autoUpdater, 'error', (_, message) => message); }
	@memoize private get onRawUpdateNotAvailable(): Event<void> { return fromNodeEventEmitter<void>(electron.autoUpdater, 'update-not-available'); }
	@memoize private get onRawUpdateAvailable(): Event<IUpdate> { return fromNodeEventEmitter(electron.autoUpdater, 'update-available', (_, url, version) => ({ url, version, productVersion: version })); }
	@memoize private get onRawUpdateDownloaded(): Event<IUpdate> { return fromNodeEventEmitter(electron.autoUpdater, 'update-downloaded', (_, releaseNotes, version, date) => ({ releaseNotes, version, productVersion: version, date })); }

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService
	) {
		super(lifecycleService, configurationService, environmentService, logService);
		this.onRawError(this.onError, this, this.disposables);
		this.onRawUpdateAvailable(this.onUpdateAvailable, this, this.disposables);
		this.onRawUpdateDownloaded(this.onUpdateDownloaded, this, this.disposables);
		this.onRawUpdateNotAvailable(this.onUpdateNotAvailable, this, this.disposables);
	}

	private onError(err: string): void {
		this.logService.error('UpdateService error: ', err);
		this.setState(State.Idle);
	}

	protected setUpdateFeedUrl(quality: string): boolean {
		try {
			electron.autoUpdater.setFeedURL(createUpdateURL('darwin', quality));
		} catch (e) {
			// application is very likely not signed
			this.logService.error('Failed to set update feed URL');
			return false;
		}

		return true;
	}

	protected doCheckForUpdates(context: any): void {
		this.setState(State.CheckingForUpdates(context));
		electron.autoUpdater.checkForUpdates();
	}

	private onUpdateAvailable(update: IUpdate): void {
		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		this.setState(State.Downloading(update));
	}

	private onUpdateDownloaded(update: IUpdate): void {
		if (this.state.type !== StateType.Downloading) {
			return;
		}

		/* __GDPR__
			"update:downloaded" : {
				"version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('update:downloaded', { version: update.version });

		this.setState(State.Ready(update));
	}

	private onUpdateNotAvailable(): void {
		if (this.state.type !== StateType.CheckingForUpdates) {
			return;
		}

		/* __GDPR__
				"update:notAvailable" : {
					"explicit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
		this.telemetryService.publicLog('update:notAvailable', { explicit: !!this.state.context });

		this.setState(State.Idle);
	}

	protected doQuitAndInstall(): void {
		// for some reason updating on Mac causes the local storage not to be flushed.
		// we workaround this issue by forcing an explicit flush of the storage data.
		// see also https://github.com/Microsoft/vscode/issues/172
		this.logService.trace('update#quitAndInstall(): calling flushStorageData()');
		electron.session.defaultSession.flushStorageData();

		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');
		electron.autoUpdater.quitAndInstall();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
