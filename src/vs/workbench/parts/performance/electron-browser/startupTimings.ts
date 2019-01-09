/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFile } from 'fs';
import { nfcall, timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/node/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as files from 'vs/workbench/parts/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { didUseCachedData, ITimerService } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export class StartupTimings implements IWorkbenchContribution {

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITimerService private readonly _timerService: ITimerService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IViewletService private readonly _viewletService: IViewletService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IEnvironmentService private readonly _envService: IEnvironmentService,
	) {
		//
		this._report().catch(onUnexpectedError);
	}

	private async _report() {
		const isStandardStartup = await this._isStandardStartup();
		this._reportStartupTimes(isStandardStartup).catch(onUnexpectedError);
		this._appendStartupTimes(isStandardStartup).catch(onUnexpectedError);
	}

	private async _reportStartupTimes(isStandardStartup: boolean): Promise<void> {
		const metrics = await this._timerService.startupMetrics;

		/* __GDPR__
			"startupTimeVaried" : {
				"${include}": [
					"${IStartupMetrics}"
				]
			}
		*/
		this._telemetryService.publicLog('startupTimeVaried', metrics);

		/* __GDPR__
		"startupTime" : {
			"${include}": [
				"${IStartupMetrics}"
			]
		}
		*/
		this._telemetryService.publicLog('startupTime', metrics);
	}

	private async _appendStartupTimes(isStandardStartup: boolean) {
		let appendTo = this._envService.args['prof-append-timers'];
		if (!appendTo) {
			// nothing to do
			return;
		}

		const waitWhenNoCachedData: () => Promise<void> = () => {
			// wait 15s for cached data to be produced
			return !didUseCachedData()
				? timeout(15000)
				: Promise.resolve<void>();
		};

		const { sessionId } = await this._telemetryService.getTelemetryInfo();

		Promise.all([
			this._timerService.startupMetrics,
			waitWhenNoCachedData(),
		]).then(([startupMetrics]) => {
			return nfcall(appendFile, appendTo, `${startupMetrics.ellapsed}\t${product.nameShort}\t${(product.commit || '').slice(0, 10) || '0000000000'}\t${sessionId}\t${isStandardStartup ? 'standard_start' : 'NO_standard_start'}\n`);
		}).then(() => {
			this._windowsService.quit();
		}).catch(err => {
			console.error(err);
			this._windowsService.quit();
		});
	}

	private async _isStandardStartup(): Promise<boolean> {
		// check for standard startup:
		// * new window (no reload)
		// * just one window
		// * explorer viewlet visible
		// * one text editor (not multiple, not webview, welcome etc...)
		// * cached data present (not rejected, not created)
		if (this._lifecycleService.startupKind !== StartupKind.NewWindow) {
			this._logService.info('no standard startup: not a new window');
			return false;
		}
		if (await this._windowsService.getWindowCount() !== 1) {
			this._logService.info('no standard startup: not just one window');
			return false;
		}
		if (!this._viewletService.getActiveViewlet() || this._viewletService.getActiveViewlet().getId() !== files.VIEWLET_ID) {
			this._logService.info('no standard startup: not the explorer viewlet');
			return false;
		}
		const visibleControls = this._editorService.visibleControls;
		if (visibleControls.length !== 1 || !isCodeEditor(visibleControls[0].getControl())) {
			this._logService.info('no standard startup: not just one text editor');
			return false;
		}
		if (this._panelService.getActivePanel()) {
			this._logService.info('no standard startup: panel is active');
			return false;
		}
		if (!didUseCachedData()) {
			this._logService.info('no standard startup: not using cached data');
			return false;
		}
		if (!await this._updateService.isLatestVersion()) {
			this._logService.info('no standard startup: not running latest version');
			return false;
		}
		this._logService.info('standard startup');
		return true;
	}
}

