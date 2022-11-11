/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace inputLatency {

	// Measurements are recorded as totals, the average is calculated when the final measurements
	// are created.
	interface ICumulativeMeasurement {
		total: number;
		min: number;
		max: number;
	}
	const totalKeydownTime: ICumulativeMeasurement = { total: 0, min: Number.MAX_VALUE, max: 0 };
	const totalInputTime: ICumulativeMeasurement = { ...totalKeydownTime };
	const totalRenderTime: ICumulativeMeasurement = { ...totalKeydownTime };
	const totalInputLatencyTime: ICumulativeMeasurement = { ...totalKeydownTime };
	let measurementsCount = 0;



	// The state of each event, this helps ensure the integrity of the measurement and that
	// something unexpected didn't happen that could skew the measurement.
	const enum EventPhase {
		Before = 0,
		InProgress = 1,
		Finished = 2
	}
	const state = {
		keydown: EventPhase.Before,
		input: EventPhase.Before,
		render: EventPhase.Before,
		selection: EventPhase.Before
	};

	/**
	 * Mark the start of the keydown event.
	 */
	export function markKeydownStart() {
		performance.mark('inputlatency/start');
		performance.mark('keydown/start');
		state.keydown = EventPhase.InProgress;
		queueMicrotask(() => markKeydownEnd());
	}

	/**
	 * Mark the end of the keydown event.
	 */
	function markKeydownEnd() {
		// Only measure the first render after keyboard input
		performance.mark('keydown/end');
		state.keydown = EventPhase.Finished;
	}

	/**
	 * Mark the start of the input event.
	 */
	export function markInputStart() {
		performance.mark('input/start');
		state.input = EventPhase.InProgress;
	}

	/**
	 * Mark the end of the input event.
	 */
	export function markInputEnd() {
		queueMicrotask(() => {
			performance.mark('input/end');
			state.input = EventPhase.Finished;
		});
	}

	/**
	 * Mark the start of the animation frame performing the rendering.
	 */
	export function markRenderStart() {
		// Render may be triggered during input, but we only measure the following animation frame
		if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.render === EventPhase.Before) {
			// Only measure the first render after keyboard input
			performance.mark('render/start');
			state.render = EventPhase.InProgress;
			queueMicrotask(() => markRenderEnd());
		}
	}

	/**
	 * Mark the end of the animation frame performing the rendering.
	 *
	 * An input latency sample is complete when both the textarea selection change event and the
	 * animation frame performing the rendering has triggered.
	 */
	function markRenderEnd() {
		performance.mark('render/end');
		state.render = EventPhase.Finished;
		record();
	}

	/**
	 * Mark when the editor textarea selection change event occurs.
	 *
	 * An input latency sample is complete when both the textarea selection change event and the
	 * animation frame performing the rendering has triggered.
	 */
	export function markTextareaSelection() {
		state.selection = EventPhase.Finished;
		record();
	}

	/**
	 * Record the input latency sample if it's ready.
	 */
	function record() {
		// Selection and render must have finished to record
		if (state.selection !== EventPhase.Finished || state.render !== EventPhase.Finished) {
			return;
		}
		// Finish the recording, use a timer to ensure that layout/paint is captured. setImmediate
		// is used if available (Electron) to get slightly more accurate results
		('setImmediate' in window ? (window as any).setImmediate : setTimeout)(() => {
			if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.selection === EventPhase.Finished && state.render === EventPhase.Finished) {
				performance.mark('inputlatency/end');

				performance.measure('keydown', 'keydown/start', 'keydown/end');
				performance.measure('input', 'input/start', 'input/end');
				performance.measure('render', 'render/start', 'render/end');
				performance.measure('inputlatency', 'inputlatency/start', 'inputlatency/end');

				addMeasure('keydown', totalKeydownTime);
				addMeasure('input', totalInputTime);
				addMeasure('render', totalRenderTime);
				addMeasure('inputlatency', totalInputLatencyTime);

				// console.info(
				// 	`input latency=${measurementsInputLatency[measurementsCount].toFixed(1)} [` +
				// 	`keydown=${measurementsKeydown[measurementsCount].toFixed(1)}, ` +
				// 	`input=${measurementsInput[measurementsCount].toFixed(1)}, ` +
				// 	`render=${measurementsRender[measurementsCount].toFixed(1)}` +
				// 	`]`
				// );

				measurementsCount++;

				reset();
			}
		}, 0);
	}

	function addMeasure(entryName: string, cumulativeMeasurement: ICumulativeMeasurement): void {
		const duration = performance.getEntriesByName(entryName)[0].duration;
		cumulativeMeasurement.total += duration;
		cumulativeMeasurement.min = Math.min(cumulativeMeasurement.min, duration);
		cumulativeMeasurement.max = Math.max(cumulativeMeasurement.max, duration);
	}

	/**
	 * Clear the current sample.
	 */
	function reset() {
		performance.clearMarks('keydown/start');
		performance.clearMarks('keydown/end');
		performance.clearMarks('input/start');
		performance.clearMarks('input/end');
		performance.clearMarks('render/start');
		performance.clearMarks('render/end');
		performance.clearMarks('inputlatency/start');
		performance.clearMarks('inputlatency/end');

		performance.clearMeasures('keydown');
		performance.clearMeasures('input');
		performance.clearMeasures('render');
		performance.clearMeasures('inputlatency');

		state.keydown = EventPhase.Before;
		state.input = EventPhase.Before;
		state.render = EventPhase.Before;
		state.selection = EventPhase.Before;
	}

	export interface IInputLatencyMeasurements {
		keydown: IInputLatencySingleMeasurement;
		input: IInputLatencySingleMeasurement;
		render: IInputLatencySingleMeasurement;
		total: IInputLatencySingleMeasurement;
		sampleCount: number;
	}

	export interface IInputLatencySingleMeasurement {
		average: number;
		min: number;
		max: number;
	}

	/**
	 * Gets all input latency samples and clears the internal buffers to start recording a new set
	 * of samples.
	 */
	export function getAndClearMeasurements(): IInputLatencyMeasurements | undefined {
		if (measurementsCount === 0) {
			return undefined;
		}

		// Assemble the result
		const result = {
			keydown: cumulativeToFinalMeasurement(totalKeydownTime),
			input: cumulativeToFinalMeasurement(totalInputTime),
			render: cumulativeToFinalMeasurement(totalRenderTime),
			total: cumulativeToFinalMeasurement(totalInputLatencyTime),
			sampleCount: measurementsCount
		};

		// Clear the cumulative measurements
		clearCumulativeMeasurement(totalKeydownTime);
		clearCumulativeMeasurement(totalInputTime);
		clearCumulativeMeasurement(totalRenderTime);
		clearCumulativeMeasurement(totalInputLatencyTime);
		measurementsCount = 0;

		return result;
	}

	function cumulativeToFinalMeasurement(cumulative: ICumulativeMeasurement): IInputLatencySingleMeasurement {
		return {
			average: cumulative.total / measurementsCount,
			max: cumulative.max,
			min: cumulative.min,
		};
	}

	function clearCumulativeMeasurement(cumulative: ICumulativeMeasurement): void {
		cumulative.total = 0;
		cumulative.min = Number.MAX_VALUE;
		cumulative.max = 0;
	}

}
