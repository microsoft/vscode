/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IStartupMetrics, AbstractTimerService, Writeable, ITimerService } from '../browser/timerService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { process } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';

export class TimerService extends AbstractTimerService {

	constructor(
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IExtensionService extensionService: IExtensionService,
		@IUpdateService updateService: IUpdateService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IEditorService editorService: IEditorService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IProductService private readonly _productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super(lifecycleService, contextService, extensionService, updateService, paneCompositeService, editorService, accessibilityService, telemetryService, layoutService);
		this.setPerformanceMarks('main', _environmentService.window.perfMarks);
	}

	protected _isInitialStartup(): boolean {
		return Boolean(this._environmentService.window.isInitialStartup);
	}
	protected _didUseCachedData(): boolean {
		return didUseCachedData(this._productService, this._storageService, this._environmentService);
	}
	protected _getWindowCount(): Promise<number> {
		return this._nativeHostService.getWindowCount();
	}

	protected async _extendStartupInfo(info: Writeable<IStartupMetrics>): Promise<void> {
		try {
			const [osProperties, osStatistics, virtualMachineHint, isARM64Emulated] = await Promise.all([
				this._nativeHostService.getOSProperties(),
				this._nativeHostService.getOSStatistics(),
				this._nativeHostService.getOSVirtualMachineHint(),
				this._nativeHostService.isRunningUnderARM64Translation()
			]);

			info.totalmem = osStatistics.totalmem;
			info.freemem = osStatistics.freemem;
			info.platform = osProperties.platform;
			info.release = osProperties.release;
			info.arch = osProperties.arch;
			info.loadavg = osStatistics.loadavg;
			info.isARM64Emulated = isARM64Emulated;

			const processMemoryInfo = await process.getProcessMemoryInfo();
			info.meminfo = {
				workingSetSize: processMemoryInfo.residentSet,
				privateBytes: processMemoryInfo.private,
				sharedBytes: processMemoryInfo.shared
			};

			info.isVMLikelyhood = Math.round((virtualMachineHint * 100));

			const rawCpus = osProperties.cpus;
			if (rawCpus && rawCpus.length > 0) {
				info.cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
			}
		} catch (error) {
			// ignore, be on the safe side with these hardware method calls
		}
	}

	protected override _shouldReportPerfMarks(): boolean {
		// always send when running with the prof-append-timers flag
		return super._shouldReportPerfMarks() || Boolean(this._environmentService.args['prof-append-timers']);
	}
}

registerSingleton(ITimerService, TimerService, InstantiationType.Delayed);

//#region cached data logic

const lastRunningCommitStorageKey = 'perf/lastRunningCommit';
let _didUseCachedData: boolean | undefined = undefined;

export function didUseCachedData(productService: IProductService, storageService: IStorageService, environmentService: INativeWorkbenchEnvironmentService): boolean {
	// browser code loading: only a guess based on
	// this being the first start with the commit
	// or subsequent
	if (typeof _didUseCachedData !== 'boolean') {
		if (!environmentService.window.isCodeCaching || !productService.commit) {
			_didUseCachedData = false; // we only produce cached data whith commit and code cache path
		} else if (storageService.get(lastRunningCommitStorageKey, StorageScope.APPLICATION) === productService.commit) {
			_didUseCachedData = true; // subsequent start on same commit, assume cached data is there
		} else {
			storageService.store(lastRunningCommitStorageKey, productService.commit, StorageScope.APPLICATION, StorageTarget.MACHINE);
			_didUseCachedData = false; // first time start on commit, assume cached data is not yet there
		}
	}
	return _didUseCachedData;
}

//#endregion
