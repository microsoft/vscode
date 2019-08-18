/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { virtualMachineHint } from 'vs/base/node/id';
import * as perf from 'vs/base/common/performance';
import * as os from 'os';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUpdateService } from 'vs/platform/update/common/update';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';

/* __GDPR__FRAGMENT__
	"IMemoryInfo" : {
		"workingSetSize" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"privateBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"sharedBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
	}
*/
export interface IMemoryInfo {
	readonly workingSetSize: number;
	readonly privateBytes: number;
	readonly sharedBytes: number;
}

/* __GDPR__FRAGMENT__
	"IStartupMetrics" : {
		"version" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"ellapsed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"isLatestVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"didUseCachedData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"windowKind": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"windowCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"viewletId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"panelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"editorIds": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"timers.ellapsedAppReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWindowLoad" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWindowLoadToRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedExtensions" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedExtensionsReady" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedRequire" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWorkspaceStorageInit" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWorkspaceServiceInit" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedViewletRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedPanelRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedEditorRestore" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedTimersToTimersComputed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"timers.ellapsedNlsGeneration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"platform" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"release" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"arch" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"totalmem" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"freemem" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"meminfo" : { "${inline}": [ "${IMemoryInfo}" ] },
		"cpus.count" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"cpus.speed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"cpus.model" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
		"initialStartup" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"hasAccessibilitySupport" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"isVMLikelyhood" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"emptyWorkbench" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"loadavg" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	}
*/
export interface IStartupMetrics {

	/**
	 * The version of these metrics.
	 */
	readonly version: 2;

	/**
	 * If this started the main process and renderer or just a renderer (new or reloaded).
	 */
	readonly initialStartup: boolean;

	/**
	 * No folder, no file, no workspace has been opened
	 */
	readonly emptyWorkbench: boolean;

	/**
	 * This is the latest (stable/insider) version. Iff not we should ignore this
	 * measurement.
	 */
	readonly isLatestVersion: boolean;

	/**
	 * Whether we asked for and V8 accepted cached data.
	 */
	readonly didUseCachedData: boolean;

	/**
	 * How/why the window was created. See https://github.com/Microsoft/vscode/blob/d1f57d871722f4d6ba63e4ef6f06287121ceb045/src/vs/platform/lifecycle/common/lifecycle.ts#L50
	 */
	readonly windowKind: number;

	/**
	 * The total number of windows that have been restored/created
	 */
	readonly windowCount: number;

	/**
	 * The active viewlet id or `undedined`
	 */
	readonly viewletId?: string;

	/**
	 * The active panel id or `undefined`
	 */
	readonly panelId?: string;

	/**
	 * The editor input types or `[]`
	 */
	readonly editorIds: string[];

	/**
	 * The time it took to create the workbench.
	 *
	 * * Happens in the main-process *and* the renderer-process
	 * * Measured with the *start* and `didStartWorkbench`-performance mark. The *start* is either the start of the
	 * main process or the start of the renderer.
	 * * This should be looked at carefully because times vary depending on
	 *  * This being the first window, the only window, or a reloaded window
	 *  * Cached data being present and used or not
	 *  * The numbers and types of editors being restored
	 *  * The numbers of windows being restored (when starting 'fresh')
	 *  * The viewlet being restored (esp. when it's a contributed viewlet)
	 */
	readonly ellapsed: number;

	/**
	 * Individual timers...
	 */
	readonly timers: {
		/**
		 * The time it took to receieve the [`ready`](https://electronjs.org/docs/api/app#event-ready)-event. Measured from the first line
		 * of JavaScript code till receiving that event.
		 *
		 * * Happens in the main-process
		 * * Measured with the `main:started` and `main:appReady` performance marks.
		 * * This can be compared between insider and stable builds.
		 * * This should be looked at per OS version and per electron version.
		 * * This is often affected by AV software (and can change with AV software updates outside of our release-cycle).
		 * * It is not our code running here and we can only observe what's happening.
		 */
		readonly ellapsedAppReady?: number;

		/**
		 * The time it took to generate NLS data.
		 *
		 * * Happens in the main-process
		 * * Measured with the `nlsGeneration:start` and `nlsGeneration:end` performance marks.
		 * * This only happens when a non-english locale is being used.
		 * * It is our code running here and we should monitor this carefully for regressions.
		 */
		readonly ellapsedNlsGeneration?: number;

		/**
		 * The time it took to tell electron to open/restore a renderer (browser window).
		 *
		 * * Happens in the main-process
		 * * Measured with the `main:appReady` and `main:loadWindow` performance marks.
		 * * This can be compared between insider and stable builds.
		 * * It is our code running here and we should monitor this carefully for regressions.
		 */
		readonly ellapsedWindowLoad?: number;

		/**
		 * The time it took to create a new renderer (browser window) and to initialize that to the point
		 * of load the main-bundle (`workbench.desktop.main.js`).
		 *
		 * * Happens in the main-process *and* the renderer-process
		 * * Measured with the `main:loadWindow` and `willLoadWorkbenchMain` performance marks.
		 * * This can be compared between insider and stable builds.
		 * * It is mostly not our code running here and we can only observe what's happening.
		 *
		 */
		readonly ellapsedWindowLoadToRequire: number;

		/**
		 * The time it took to require the workspace storage DB, connect to it
		 * and load the initial set of values.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willInitWorkspaceStorage` and `didInitWorkspaceStorage` performance marks.
		 */
		readonly ellapsedWorkspaceStorageInit: number;

		/**
		 * The time it took to initialize the workspace and configuration service.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willInitWorkspaceService` and `didInitWorkspaceService` performance marks.
		 */
		readonly ellapsedWorkspaceServiceInit: number;

		/**
		 * The time it took to load the main-bundle of the workbench, e.g. `workbench.desktop.main.js`.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willLoadWorkbenchMain` and `didLoadWorkbenchMain` performance marks.
		 * * This varies *a lot* when V8 cached data could be used or not
		 * * This should be looked at with and without V8 cached data usage and per electron/v8 version
		 * * This is affected by the size of our code bundle (which  grows about 3-5% per release)
		 */
		readonly ellapsedRequire: number;

		/**
		 * The time it took to read extensions' package.json-files *and* interpret them (invoking
		 * the contribution points).
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willLoadExtensions` and `didLoadExtensions` performance marks.
		 * * Reading of package.json-files is avoided by caching them all in a single file (after the read,
		 * until another extension is installed)
		 * * Happens in parallel to other things, depends on async timing
		 *
		 * todo@joh/ramya this measures an artifical dealy we have added, see https://github.com/Microsoft/vscode/blob/2f07ddae8bf56e969e3f4ba1447258ebc999672f/src/vs/workbench/services/extensions/electron-browser/extensionService.ts#L311-L326
		 */
		readonly ellapsedExtensions: number;

		// the time from start till `didLoadExtensions`
		// remove?
		readonly ellapsedExtensionsReady: number;

		/**
		 * The time it took to restore the viewlet.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willRestoreViewlet` and `didRestoreViewlet` performance marks.
		 * * This should be looked at per viewlet-type/id.
		 * * Happens in parallel to other things, depends on async timing
		 */
		readonly ellapsedViewletRestore: number;

		/**
		 * The time it took to restore the panel.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willRestorePanel` and `didRestorePanel` performance marks.
		 * * This should be looked at per panel-type/id.
		 * * Happens in parallel to other things, depends on async timing
		 */
		readonly ellapsedPanelRestore: number;

		/**
		 * The time it took to restore editors - that is text editor and complex editor likes the settings UI
		 * or webviews (markdown preview).
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willRestoreEditors` and `didRestoreEditors` performance marks.
		 * * This should be looked at per editor and per editor type.
		 * * Happens in parallel to other things, depends on async timing
		 *
		 * todo@joh/ramya We should probably measures each editor individually?
		 */
		readonly ellapsedEditorRestore: number;

		/**
		 * The time it took to create the workbench.
		 *
		 * * Happens in the renderer-process
		 * * Measured with the `willStartWorkbench` and `didStartWorkbench` performance marks.
		 *
		 * todo@joh/ramya Not sure if this is useful because this includes too much
		 */
		readonly ellapsedWorkbench: number;

		// the time it took to generate this object.
		// remove?
		readonly ellapsedTimersToTimersComputed: number;
	};

	readonly hasAccessibilitySupport: boolean;
	readonly isVMLikelyhood?: number;
	readonly platform?: string;
	readonly release?: string;
	readonly arch?: string;
	readonly totalmem?: number;
	readonly freemem?: number;
	readonly meminfo?: IMemoryInfo;
	readonly cpus?: { count: number; speed: number; model: string; };
	readonly loadavg?: number[];
}

export interface ITimerService {
	_serviceBrand: any;
	readonly startupMetrics: Promise<IStartupMetrics>;
}

class TimerService implements ITimerService {

	_serviceBrand: any;

	private _startupMetrics?: Promise<IStartupMetrics>;

	constructor(
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IViewletService private readonly _viewletService: IViewletService,
		@IPanelService private readonly _panelService: IPanelService,
		@IEditorService private readonly _editorService: IEditorService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) { }

	get startupMetrics(): Promise<IStartupMetrics> {
		if (!this._startupMetrics) {
			this._startupMetrics = Promise
				.resolve(this._extensionService.whenInstalledExtensionsRegistered())
				.then(() => this._computeStartupMetrics());
		}
		return this._startupMetrics;
	}

	private async _computeStartupMetrics(): Promise<IStartupMetrics> {

		const now = Date.now();
		const initialStartup = !!this._environmentService.configuration.isInitialStartup;
		const startMark = initialStartup ? 'main:started' : 'main:loadWindow';

		let totalmem: number | undefined;
		let freemem: number | undefined;
		let cpus: { count: number; speed: number; model: string; } | undefined;
		let platform: string | undefined;
		let release: string | undefined;
		let arch: string | undefined;
		let loadavg: number[] | undefined;
		let meminfo: IMemoryInfo | undefined;
		let isVMLikelyhood: number | undefined;

		try {
			totalmem = os.totalmem();
			freemem = os.freemem();
			platform = os.platform();
			release = os.release();
			arch = os.arch();
			loadavg = os.loadavg();

			const processMemoryInfo = await process.getProcessMemoryInfo();
			meminfo = {
				workingSetSize: processMemoryInfo.residentSet,
				privateBytes: processMemoryInfo.private,
				sharedBytes: processMemoryInfo.shared
			};

			isVMLikelyhood = Math.round((virtualMachineHint.value() * 100));

			const rawCpus = os.cpus();
			if (rawCpus && rawCpus.length > 0) {
				cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
			}
		} catch (error) {
			// ignore, be on the safe side with these hardware method calls
		}

		const activeViewlet = this._viewletService.getActiveViewlet();
		const activePanel = this._panelService.getActivePanel();
		return {
			version: 2,
			ellapsed: perf.getDuration(startMark, 'didStartWorkbench'),

			// reflections
			isLatestVersion: Boolean(await this._updateService.isLatestVersion()),
			didUseCachedData: didUseCachedData(),
			windowKind: this._lifecycleService.startupKind,
			windowCount: await this._windowsService.getWindowCount(),
			viewletId: activeViewlet ? activeViewlet.getId() : undefined,
			editorIds: this._editorService.visibleEditors.map(input => input.getTypeId()),
			panelId: activePanel ? activePanel.getId() : undefined,

			// timers
			timers: {
				ellapsedAppReady: initialStartup ? perf.getDuration('main:started', 'main:appReady') : undefined,
				ellapsedNlsGeneration: initialStartup ? perf.getDuration('nlsGeneration:start', 'nlsGeneration:end') : undefined,
				ellapsedWindowLoad: initialStartup ? perf.getDuration('main:appReady', 'main:loadWindow') : undefined,
				ellapsedWindowLoadToRequire: perf.getDuration('main:loadWindow', 'willLoadWorkbenchMain'),
				ellapsedRequire: perf.getDuration('willLoadWorkbenchMain', 'didLoadWorkbenchMain'),
				ellapsedWorkspaceStorageInit: perf.getDuration('willInitWorkspaceStorage', 'didInitWorkspaceStorage'),
				ellapsedWorkspaceServiceInit: perf.getDuration('willInitWorkspaceService', 'didInitWorkspaceService'),
				ellapsedExtensions: perf.getDuration('willLoadExtensions', 'didLoadExtensions'),
				ellapsedEditorRestore: perf.getDuration('willRestoreEditors', 'didRestoreEditors'),
				ellapsedViewletRestore: perf.getDuration('willRestoreViewlet', 'didRestoreViewlet'),
				ellapsedPanelRestore: perf.getDuration('willRestorePanel', 'didRestorePanel'),
				ellapsedWorkbench: perf.getDuration('willStartWorkbench', 'didStartWorkbench'),
				ellapsedExtensionsReady: perf.getDuration(startMark, 'didLoadExtensions'),
				ellapsedTimersToTimersComputed: Date.now() - now,
			},

			// system info
			platform,
			release,
			arch,
			totalmem,
			freemem,
			meminfo,
			cpus,
			loadavg,
			initialStartup,
			isVMLikelyhood,
			hasAccessibilitySupport: this._accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled,
			emptyWorkbench: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY
		};
	}
}

export const ITimerService = createDecorator<ITimerService>('timerService');

registerSingleton(ITimerService, TimerService, true);

//#region cached data logic

export function didUseCachedData(): boolean {
	// We surely don't use cached data when we don't tell the loader to do so
	if (!Boolean((<any>global).require.getConfig().nodeCachedData)) {
		return false;
	}
	// There are loader events that signal if cached data was missing, rejected,
	// or used. The former two mean no cached data.
	let cachedDataFound = 0;
	for (const event of require.getStats()) {
		switch (event.type) {
			case LoaderEventType.CachedDataRejected:
				return false;
			case LoaderEventType.CachedDataFound:
				cachedDataFound += 1;
				break;
		}
	}
	return cachedDataFound > 0;
}

//#endregion
