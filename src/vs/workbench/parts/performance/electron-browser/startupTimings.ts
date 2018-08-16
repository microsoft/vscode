/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILifecycleService, LifecyclePhase, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import * as files from 'vs/workbench/parts/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITimerService, didUseCachedData } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

class StartupTimings implements IWorkbenchContribution {

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
	) {

		this._reportVariedStartupTimes().then(undefined, onUnexpectedError);
		this._reportStandardStartupTimes().then(undefined, onUnexpectedError);
	}

	private async _reportVariedStartupTimes(): Promise<void> {
		/* __GDPR__
			"startupTimeVaried" : {
				"${include}": [
					"${IStartupMetrics}"
				]
			}
		*/
		this._telemetryService.publicLog('startupTimeVaried', await this._timerService.startupMetrics);
	}

	private async _reportStandardStartupTimes(): Promise<void> {
		// check for standard startup:
		// * new window (no reload)
		// * just one window
		// * explorer viewlet visible
		// * one text editor (not multiple, not webview, welcome etc...)
		// * cached data present (not rejected, not created)
		if (this._lifecycleService.startupKind !== StartupKind.NewWindow) {
			this._logService.info('no standard startup: not a new window');
			return;
		}
		if (await this._windowsService.getWindowCount() !== 1) {
			this._logService.info('no standard startup: not just one window');
			return;
		}
		if (!this._viewletService.getActiveViewlet() || this._viewletService.getActiveViewlet().getId() !== files.VIEWLET_ID) {
			this._logService.info('no standard startup: not the explorer viewlet');
			return;
		}
		const visibleControls = this._editorService.visibleControls;
		if (visibleControls.length !== 1 || !isCodeEditor(visibleControls[0].getControl())) {
			this._logService.info('no standard startup: not just one text editor');
			return;
		}
		if (this._panelService.getActivePanel()) {
			this._logService.info('no standard startup: panel is active');
			return;
		}
		if (!didUseCachedData()) {
			this._logService.info('no standard startup: not using cached data');
			return;
		}
		if (!await this._updateService.isLatestVersion()) {
			this._logService.info('no standard startup: not running latest version');
			return;
		}

		/* __GDPR__
		"startupTime" : {
			"${include}": [
				"${IStartupMetrics}"
			]
		}
		*/
		const metrics = await this._timerService.startupMetrics;
		this._telemetryService.publicLog('startupTime', metrics);
		this._logService.info('standard startup', metrics);
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupTimings, LifecyclePhase.Running);
