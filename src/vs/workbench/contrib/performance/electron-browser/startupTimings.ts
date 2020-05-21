/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFile } from 'fs';
import { timeout } from 'vs/base/common/async';
import { promisify } from 'util';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-browser/environmentService';
import { ILifecycleService, StartupKind, StartupKindToString } from 'vs/platform/lifecycle/common/lifecycle';
import product from 'vs/platform/product/common/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import * as files from 'vs/workbench/contrib/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { didUseCachedData, ITimerService } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { getEntries } from 'vs/base/common/performance';

export class StartupTimings implements IWorkbenchContribution {

	constructor(
		@ITimerService private readonly _timerService: ITimerService,
		@IElectronService private readonly _electronService: IElectronService,
		@IEditorService private readonly _editorService: IEditorService,
		@IViewletService private readonly _viewletService: IViewletService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IWorkbenchEnvironmentService private readonly _envService: INativeWorkbenchEnvironmentService
	) {
		//
		this._report().catch(onUnexpectedError);
	}

	private async _report() {
		const standardStartupError = await this._isStandardStartup();
		this._reportStartupTimes().catch(onUnexpectedError);
		this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
		this._reportPerfTicks();
	}

	private async _reportStartupTimes(): Promise<void> {
		const metrics = await this._timerService.startupMetrics;

		/* __GDPR__
			"startupTimeVaried" : {
				"${include}": [
					"${IStartupMetrics}"
				]
			}
		*/
		this._telemetryService.publicLog('startupTimeVaried', metrics);
	}

	private async _appendStartupTimes(standardStartupError: string | undefined) {
		const appendTo = this._envService.args['prof-append-timers'];
		if (!appendTo) {
			// nothing to do
			return;
		}

		const { sessionId } = await this._telemetryService.getTelemetryInfo();

		Promise.all([
			this._timerService.startupMetrics,
			timeout(15000), // wait: cached data creation, telemetry sending
		]).then(([startupMetrics]) => {
			return promisify(appendFile)(appendTo, `${startupMetrics.ellapsed}\t${product.nameShort}\t${(product.commit || '').slice(0, 10) || '0000000000'}\t${sessionId}\t${standardStartupError === undefined ? 'standard_start' : 'NO_standard_start : ' + standardStartupError}\n`);
		}).then(() => {
			this._electronService.quit();
		}).catch(err => {
			console.error(err);
			this._electronService.quit();
		});
	}

	private async _isStandardStartup(): Promise<string | undefined> {
		// check for standard startup:
		// * new window (no reload)
		// * just one window
		// * explorer viewlet visible
		// * one text editor (not multiple, not webview, welcome etc...)
		// * cached data present (not rejected, not created)
		if (this._lifecycleService.startupKind !== StartupKind.NewWindow) {
			return StartupKindToString(this._lifecycleService.startupKind);
		}
		const windowCount = await this._electronService.getWindowCount();
		if (windowCount !== 1) {
			return 'Expected window count : 1, Actual : ' + windowCount;
		}
		const activeViewlet = this._viewletService.getActiveViewlet();
		if (!activeViewlet || activeViewlet.getId() !== files.VIEWLET_ID) {
			return 'Explorer viewlet not visible';
		}
		const visibleEditorPanes = this._editorService.visibleEditorPanes;
		if (visibleEditorPanes.length !== 1) {
			return 'Expected text editor count : 1, Actual : ' + visibleEditorPanes.length;
		}
		if (!isCodeEditor(visibleEditorPanes[0].getControl())) {
			return 'Active editor is not a text editor';
		}
		const activePanel = this._panelService.getActivePanel();
		if (activePanel) {
			return 'Current active panel : ' + this._panelService.getPanel(activePanel.getId())?.name;
		}
		if (!didUseCachedData()) {
			return 'Either cache data is rejected or not created';
		}
		if (!await this._updateService.isLatestVersion()) {
			return 'Not on latest version, updates available';
		}
		return undefined;
	}

	private _reportPerfTicks(): void {
		const entries: Record<string, number> = Object.create(null);
		for (const entry of getEntries()) {
			entries[entry.name] = entry.timestamp;
		}
		/* __GDPR__
			"startupRawTimers" : {
				"entries": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		*/
		this._telemetryService.publicLog('startupRawTimers', { entries });
	}
}

