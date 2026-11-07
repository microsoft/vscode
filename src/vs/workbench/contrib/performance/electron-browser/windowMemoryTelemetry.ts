/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowsCount } from '../../../../base/browser/dom.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { BlinkMemoryInfo, HeapStatistics } from '../../../../base/parts/sandbox/electron-browser/electronTypes.js';
import { process } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { AwakeUptimeClock, isMemorySampled, MEMORY_SAMPLING_INTERVAL, toMegabytes } from '../../../../platform/process/common/processMemory.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';

type WindowMemorySampleEvent = {
	milestoneMinutes: number;
	workingSetMb: number | undefined;
	peakWorkingSetMb: number | undefined;
	privateMb: number | undefined;
	jsHeapUsedMb: number;
	jsHeapTotalMb: number;
	jsHeapLimitMb: number;
	domAllocatedMb: number;
	domTotalMb: number;
	editorCount: number;
	editorGroupCount: number;
	terminalCount: number;
	chatSessionCount: number;
	activatedExtensionCount: number;
	auxiliaryWindowCount: number;
};

type WindowMemorySampleClassification = {
	owner: 'alexdima';
	comment: 'Memory of a window when it has been open for a while, with what is open in it, to detect memory leaks and growth.';
	milestoneMinutes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Minutes the window has been open while the machine was awake: 15, 60, 240, 480, 1440, and then every 1440 more.' };
	workingSetMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Working set of the process of the window in megabytes.' };
	peakWorkingSetMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Largest working set of the process of the window so far in megabytes.' };
	privateMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Private memory of the process of the window in megabytes. Only on Windows.' };
	jsHeapUsedMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Used JavaScript heap of the window in megabytes, including garbage that was not collected yet.' };
	jsHeapTotalMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Size of the JavaScript heap of the window in megabytes.' };
	jsHeapLimitMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Size limit of the JavaScript heap of the window in megabytes.' };
	domAllocatedMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Size of the objects that Blink allocated for the DOM and rendering of the window in megabytes.' };
	domTotalMb: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Space that Blink allocated for the DOM and rendering of the window in megabytes.' };
	editorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of open editors in the window.' };
	editorGroupCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of editor groups in the window.' };
	terminalCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of terminals in the window.' };
	chatSessionCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of chat sessions loaded in the window.' };
	activatedExtensionCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of extensions activated for the window.' };
	auxiliaryWindowCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of auxiliary windows of the window.' };
};

/**
 * The JavaScript and DOM memory of the renderer process.
 */
export interface IRendererMemory {
	getHeapStatistics(): HeapStatistics;
	getBlinkMemoryInfo(): BlinkMemoryInfo;
}

/**
 * Reports the memory of the window, with what is open in it, when the window
 * reaches a milestone of awake uptime.
 */
export class WindowMemoryTelemetry extends Disposable {

	private readonly random = Math.random();

	constructor(
		private readonly rendererMemory: IRendererMemory,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IChatService private readonly chatService: IChatService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		const clock = new AwakeUptimeClock(performance.timeOrigin, Date.now());
		const timer = this._register(new IntervalTimer());
		timer.cancelAndSet(() => {
			const milestoneMinutes = clock.advance(Date.now());
			if (milestoneMinutes !== undefined && isMemorySampled(this.random, this.configurationService, this.telemetryService)) {
				this.report(milestoneMinutes).catch(onUnexpectedError);
			}
		}, MEMORY_SAMPLING_INTERVAL);
	}

	private async report(milestoneMinutes: number): Promise<void> {
		const heap = this.rendererMemory.getHeapStatistics();
		const dom = this.rendererMemory.getBlinkMemoryInfo();
		const workload = {
			editorCount: this.editorService.count,
			editorGroupCount: this.editorGroupsService.count,
			terminalCount: this.terminalService.instances.length,
			chatSessionCount: Iterable.length(this.chatService.chatModels.get()),
			activatedExtensionCount: Object.values(this.extensionService.getExtensionsStatus()).filter(status => status.activationTimes).length,
			auxiliaryWindowCount: getWindowsCount() - 1
		};
		const processMemory = await this.nativeHostService.getProcessMemory();

		this.telemetryService.publicLog2<WindowMemorySampleEvent, WindowMemorySampleClassification>('memory.windowSample', {
			milestoneMinutes,
			workingSetMb: processMemory ? toMegabytes(processMemory.workingSetSize) : undefined,
			peakWorkingSetMb: processMemory ? toMegabytes(Math.max(processMemory.peakWorkingSetSize, processMemory.workingSetSize)) : undefined,
			privateMb: processMemory?.privateBytes !== undefined ? toMegabytes(processMemory.privateBytes) : undefined,
			jsHeapUsedMb: toMegabytes(heap.usedHeapSize),
			jsHeapTotalMb: toMegabytes(heap.totalHeapSize),
			jsHeapLimitMb: toMegabytes(heap.heapSizeLimit),
			domAllocatedMb: toMegabytes(dom.allocated),
			domTotalMb: toMegabytes(dom.total),
			...workload
		});
	}
}

export class WindowMemoryTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.windowMemoryTelemetry';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this._register(instantiationService.createInstance(WindowMemoryTelemetry, process));
	}
}
