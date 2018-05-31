/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILifecycleService, LifecyclePhase, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import * as files from 'vs/workbench/parts/files/common/files';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

class StartupTimings implements IWorkbenchContribution {

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITimerService private readonly _timerService: ITimerService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IViewletService private readonly _viewletService: IViewletService,
		@IPanelService private readonly _panelService: IPanelService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {

		this._reportVariedStartupTimes().then(undefined, onUnexpectedError);
		this._reportStandardStartupTimes().then(undefined, onUnexpectedError);
	}

	private async _reportVariedStartupTimes(): TPromise<void> {
		await TPromise.join([
			this._extensionService.whenInstalledExtensionsRegistered(),
			this._lifecycleService.when(LifecyclePhase.Eventually)
		]);
		/* __GDPR__
			"startupTimeVaried" : {
				"${include}": [
					"${IStartupMetrics}"
				]
			}
		*/
		this._telemetryService.publicLog('startupTimeVaried', this._timerService.startupMetrics);
	}

	private async _reportStandardStartupTimes(): TPromise<void> {
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
		const visibleEditors = this._editorService.getVisibleEditors();
		if (visibleEditors.length !== 1 || !isCodeEditor(visibleEditors[0].getControl())) {
			this._logService.info('no standard startup: not just one text editor');
			return;
		}
		if (this._panelService.getActivePanel()) {
			this._logService.info('no standard startup: panel is active');
			return;
		}
		if (!this._didUseCachedData()) {
			this._logService.info('no standard startup: not using cached data');
			return;
		}

		// wait only know so that can check the restored state as soon as possible
		await TPromise.join([
			this._extensionService.whenInstalledExtensionsRegistered(),
			this._lifecycleService.when(LifecyclePhase.Eventually)
		]);

		/* __GDPR__
		"startupTime" : {
			"${include}": [
				"${IStartupMetrics}"
			]
		}
		*/
		this._telemetryService.publicLog('startupTime', this._timerService.startupMetrics);
		this._logService.info('standard startup', this._timerService.startupMetrics);
	}

	private _didUseCachedData(): boolean {
		// We surely don't use cached data when we don't tell the loader to do so
		if (!Boolean((<any>global).require.getConfig().nodeCachedDataDir)) {
			return false;
		}
		// whenever cached data is produced or rejected a onNodeCachedData-callback is invoked. That callback
		// stores data in the `MonacoEnvironment.onNodeCachedData` global. See:
		// https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/electron-browser/bootstrap/index.js#L219
		if (!isFalsyOrEmpty(MonacoEnvironment.onNodeCachedData)) {
			return false;
		}
		return true;
	}
}

declare type OnNodeCachedDataArgs = [{ errorCode: string, path: string, detail?: string }, { path: string, length: number }];
declare const MonacoEnvironment: { onNodeCachedData: OnNodeCachedDataArgs[] };

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupTimings, LifecyclePhase.Running);
