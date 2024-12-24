/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions.js';
import { timeout } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { StartupTimings } from '../browser/startupTimings.js';
import { coalesce } from '../../../../base/common/arrays.js';

interface ITracingData {
	readonly args?: {
		readonly usedHeapSizeAfter?: number;
		readonly usedHeapSizeBefore?: number;
	};
	readonly dur: number; 	// in microseconds
	readonly name: string;	// e.g. MinorGC or MajorGC
	readonly pid: number;
}

interface IHeapStatistics {
	readonly used: number;
	readonly garbage: number;
	readonly majorGCs: number;
	readonly minorGCs: number;
	readonly duration: number;
}

export class NativeStartupTimings extends StartupTimings implements IWorkbenchContribution {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITimerService private readonly _timerService: ITimerService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IEditorService editorService: IEditorService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUpdateService updateService: IUpdateService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceTrustManagementService workspaceTrustService: IWorkspaceTrustManagementService
	) {
		super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);

		this._report().catch(onUnexpectedError);
	}

	private async _report() {
		const standardStartupError = await this._isStandardStartup();
		this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
	}

	private async _appendStartupTimes(standardStartupError: string | undefined) {
		const appendTo = this._environmentService.args['prof-append-timers'];
		const durationMarkers = this._environmentService.args['prof-duration-markers'];
		const durationMarkersFile = this._environmentService.args['prof-duration-markers-file'];
		if (!appendTo && !durationMarkers) {
			// nothing to do
			return;
		}

		try {
			await Promise.all([
				this._timerService.whenReady(),
				timeout(15000), // wait: cached data creation, telemetry sending
			]);

			const perfBaseline = await this._timerService.perfBaseline;
			const heapStatistics = await this._resolveStartupHeapStatistics();
			if (heapStatistics) {
				this._telemetryLogHeapStatistics(heapStatistics);
			}

			if (appendTo) {
				const content = coalesce([
					this._timerService.startupMetrics.ellapsed,
					this._productService.nameShort,
					(this._productService.commit || '').slice(0, 10) || '0000000000',
					this._telemetryService.sessionId,
					standardStartupError === undefined ? 'standard_start' : `NO_standard_start : ${standardStartupError}`,
					`${String(perfBaseline).padStart(4, '0')}ms`,
					heapStatistics ? this._printStartupHeapStatistics(heapStatistics) : undefined
				]).join('\t') + '\n';
				await this._appendContent(URI.file(appendTo), content);
			}

			if (durationMarkers?.length) {
				const durations: string[] = [];
				for (const durationMarker of durationMarkers) {
					let duration: number = 0;
					if (durationMarker === 'ellapsed') {
						duration = this._timerService.startupMetrics.ellapsed;
					} else if (durationMarker.indexOf('-') !== -1) {
						const markers = durationMarker.split('-');
						if (markers.length === 2) {
							duration = this._timerService.getDuration(markers[0], markers[1]);
						}
					}
					if (duration) {
						durations.push(durationMarker);
						durations.push(`${duration}`);
					}
				}

				const durationsContent = `${durations.join('\t')}\n`;
				if (durationMarkersFile) {
					await this._appendContent(URI.file(durationMarkersFile), durationsContent);
				} else {
					console.log(durationsContent);
				}
			}

		} catch (err) {
			console.error(err);
		} finally {
			this._nativeHostService.exit(0);
		}
	}

	protected override async _isStandardStartup(): Promise<string | undefined> {
		const windowCount = await this._nativeHostService.getWindowCount();
		if (windowCount !== 1) {
			return `Expected window count : 1, Actual : ${windowCount}`;
		}
		return super._isStandardStartup();
	}

	private async _appendContent(file: URI, content: string): Promise<void> {
		const chunks: VSBuffer[] = [];
		if (await this._fileService.exists(file)) {
			chunks.push((await this._fileService.readFile(file)).value);
		}
		chunks.push(VSBuffer.fromString(content));
		await this._fileService.writeFile(file, VSBuffer.concat(chunks));
	}

	private async _resolveStartupHeapStatistics(): Promise<IHeapStatistics | undefined> {
		if (
			!this._environmentService.args['enable-tracing'] ||
			!this._environmentService.args['trace-startup-file'] ||
			this._environmentService.args['trace-startup-format'] !== 'json' ||
			!this._environmentService.args['trace-startup-duration']
		) {
			return undefined; // unexpected arguments for startup heap statistics
		}

		const windowProcessId = await this._nativeHostService.getProcessId();
		const used = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0; // https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory

		let minorGCs = 0;
		let majorGCs = 0;
		let garbage = 0;
		let duration = 0;

		try {
			const traceContents: { traceEvents: ITracingData[] } = JSON.parse((await this._fileService.readFile(URI.file(this._environmentService.args['trace-startup-file']))).value.toString());
			for (const event of traceContents.traceEvents) {
				if (event.pid !== windowProcessId) {
					continue;
				}

				switch (event.name) {

					// Major/Minor GC Events
					case 'MinorGC':
						minorGCs++;
						break;
					case 'MajorGC':
						majorGCs++;
						break;

					// GC Events that block the main thread
					// Refs: https://v8.dev/blog/trash-talk
					case 'V8.GCFinalizeMC':
					case 'V8.GCScavenger':
						duration += event.dur;
						break;
				}

				if (event.name === 'MajorGC' || event.name === 'MinorGC') {
					if (typeof event.args?.usedHeapSizeAfter === 'number' && typeof event.args.usedHeapSizeBefore === 'number') {
						garbage += (event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter);
					}
				}
			}

			return { minorGCs, majorGCs, used, garbage, duration: Math.round(duration / 1000) };
		} catch (error) {
			console.error(error);
		}

		return undefined;
	}

	private _telemetryLogHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }: IHeapStatistics): void {
		type StartupHeapStatisticsClassification = {
			owner: 'bpasero';
			comment: 'An event that reports startup heap statistics for performance analysis.';
			heapUsed: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Used heap' };
			heapGarbage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Garbage heap' };
			majorGCs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Major GCs count' };
			minorGCs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Minor GCs count' };
			gcsDuration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'GCs duration' };
		};
		type StartupHeapStatisticsEvent = {
			heapUsed: number;
			heapGarbage: number;
			majorGCs: number;
			minorGCs: number;
			gcsDuration: number;
		};
		this._telemetryService.publicLog2<StartupHeapStatisticsEvent, StartupHeapStatisticsClassification>('startupHeapStatistics', {
			heapUsed: used,
			heapGarbage: garbage,
			majorGCs,
			minorGCs,
			gcsDuration: duration
		});
	}

	private _printStartupHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }: IHeapStatistics) {
		const MB = 1024 * 1024;
		return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
	}
}
