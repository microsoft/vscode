/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { inputLatency } from '../../../../base/browser/performance.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class InputLatencyContrib extends Disposable implements IWorkbenchContribution {
	private readonly _listener = this._register(new MutableDisposable());
	private readonly _scheduler: RunOnceScheduler;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		// The current sampling strategy is when the active editor changes, start sampling and
		// report the results after 60 seconds. It's done this way as we don't want to sample
		// everything, just somewhat randomly, and using an interval would utilize CPU when the
		// application is inactive.
		this._scheduler = this._register(new RunOnceScheduler(() => {
			this._logSamples();
			this._setupListener();
		}, 60000));


		// Only log 1% of users selected randomly to reduce the volume of data, always report if GPU
		// acceleration is enabled as it's opt-in
		if (Math.random() <= 0.01 || this._configurationService.getValue('editor.experimentalGpuAcceleration') === 'on') {
			this._setupListener();
		}

	}

	private _setupListener(): void {
		this._listener.value = Event.once(this._editorService.onDidActiveEditorChange)(() => this._scheduler.schedule());
	}

	private _logSamples(): void {
		const measurements = inputLatency.getAndClearMeasurements();
		if (!measurements) {
			return;
		}

		type InputLatencyStatisticFragment = {
			owner: 'tyriar';
			comment: 'Represents a set of statistics collected about input latencies';
			average: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The average time it took to execute.' };
			max: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The maximum time it took to execute.' };
			min: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The minimum time it took to execute.' };
		};

		type PerformanceInputLatencyClassification = {
			owner: 'tyriar';
			comment: 'This is a set of samples of the time (in milliseconds) that various events took when typing in the editor';
			keydown: InputLatencyStatisticFragment;
			input: InputLatencyStatisticFragment;
			render: InputLatencyStatisticFragment;
			total: InputLatencyStatisticFragment;
			sampleCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of samples measured.' };
			gpuAcceleration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether GPU acceleration was enabled at the time the event was reported.' };
		};

		type PerformanceInputLatencyEvent = inputLatency.IInputLatencyMeasurements & {
			gpuAcceleration: boolean;
		};

		this._telemetryService.publicLog2<PerformanceInputLatencyEvent, PerformanceInputLatencyClassification>('performance.inputLatency', {
			keydown: measurements.keydown,
			input: measurements.input,
			render: measurements.render,
			total: measurements.total,
			sampleCount: measurements.sampleCount,
			gpuAcceleration: this._configurationService.getValue('editor.experimentalGpuAcceleration') === 'on'
		});
	}
}
