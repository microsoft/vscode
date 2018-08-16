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
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITimerService, IStartupMetrics } from 'vs/workbench/services/timer/electron-browser/timerService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import * as files from 'vs/workbench/parts/files/common/files';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IUpdateService } from 'vs/platform/update/common/update';

/* __GDPR__FRAGMENT__
	"IStartupReflections" : {
		"isLatestVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"didUseCachedData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"windowKind": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"windowCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"viewletId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"panelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"editorIds": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	}
*/
interface IStartupReflections {
	/**
	 * This is the latest (stable/insider) version. Iff not we should ignore this
	 * measurement.
	 */
	isLatestVersion: boolean;

	/**
	 * Whether we asked for and V8 accepted cached data.
	 */
	didUseCachedData: boolean;

	/**
	 * How/why the window was created. See https://github.com/Microsoft/vscode/blob/d1f57d871722f4d6ba63e4ef6f06287121ceb045/src/vs/platform/lifecycle/common/lifecycle.ts#L50
	 */
	windowKind: number;

	/**
	 * The total number of windows that have been restored/created
	 */
	windowCount: number;

	/**
	 * The active viewlet id or `undedined`
	 */
	viewletId: string;

	/**
	 * The active panel id or `undefined`
	 */
	panelId: string;

	/**
	 * The editor input types or `[]`
	 */
	editorIds: string[];
}

type IStartupTimings = IStartupMetrics & IStartupReflections;

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
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IUpdateService private readonly _updateService: IUpdateService,
	) {

		this._reportVariedStartupTimes().then(undefined, onUnexpectedError);
		this._reportStandardStartupTimes().then(undefined, onUnexpectedError);
	}

	private async _reportVariedStartupTimes(): Promise<void> {
		/* __GDPR__
			"startupTimeVaried" : {
				"${include}": [
					"${IStartupMetrics}",
					"${IStartupReflections}"
				]
			}
		*/
		this._telemetryService.publicLog('startupTimeVaried', await this._getStartupTimings());
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
		if (!_didUseCachedData()) {
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
				"${IStartupMetrics}",
				"${IStartupReflections}"
			]
		}
		*/
		const timings = await this._getStartupTimings();
		this._telemetryService.publicLog('startupTime', timings);
		this._logService.info('standard startup', timings);
	}

	private async _getStartupTimings(): Promise<IStartupTimings> {

		await Promise.all([
			this._extensionService.whenInstalledExtensionsRegistered(),
			this._lifecycleService.when(LifecyclePhase.Eventually)
		]);

		const isLatestVersion = Boolean(await this._updateService.isLatestVersion());
		const didUseCachedData = _didUseCachedData();

		const windowKind = this._lifecycleService.startupKind;
		const windowCount = await this._windowsService.getWindowCount();

		const viewletId = this._viewletService.getActiveViewlet() ? this._viewletService.getActiveViewlet().getId() : undefined;
		const editorIds = this._editorService.visibleEditors.map(input => input.getTypeId());
		const panelId = this._panelService.getActivePanel() ? this._panelService.getActivePanel().getId() : undefined;

		const reflections = {
			isLatestVersion,
			didUseCachedData,
			windowKind,
			windowCount,
			viewletId,
			panelId,
			editorIds
		};

		const metrics = await this._timerService.startupMetrics;
		return { ...reflections, ...metrics };
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(StartupTimings, LifecyclePhase.Running);


//#region cached data logic

function _didUseCachedData(): boolean {
	// We surely don't use cached data when we don't tell the loader to do so
	if (!Boolean((<any>global).require.getConfig().nodeCachedDataDir)) {
		return false;
	}
	// whenever cached data is produced or rejected a onNodeCachedData-callback is invoked. That callback
	// stores data in the `MonacoEnvironment.onNodeCachedData` global. See:
	// https://github.com/Microsoft/vscode/blob/efe424dfe76a492eab032343e2fa4cfe639939f0/src/vs/workbench/electron-browser/bootstrap/index.js#L299
	if (!isFalsyOrEmpty(MonacoEnvironment.onNodeCachedData)) {
		return false;
	}
	return true;
}

declare type OnNodeCachedDataArgs = [{ errorCode: string, path: string, detail?: string }, { path: string, length: number }];
declare const MonacoEnvironment: { onNodeCachedData: OnNodeCachedDataArgs[] };

//#endregion
