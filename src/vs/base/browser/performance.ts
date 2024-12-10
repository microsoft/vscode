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
	};

	/**
	 * Record the start of the keydown event.
	 */
	export function onKeyDown() {
		/** Direct Check C. See explanation in {@link recordIfFinished} */
		recordIfFinished();
		performance.mark('inputlatency/start');
		performance.mark('keydown/start');
		state.keydown = EventPhase.InProgress;
		queueMicrotask(markKeyDownEnd);
	}

	/**
	 * Mark the end of the keydown event.
	 */
	function markKeyDownEnd() {
		if (state.keydown === EventPhase.InProgress) {
			performance.mark('keydown/end');
			state.keydown = EventPhase.Finished;
		}
	}

	/**
	 * Record the start of the beforeinput event.
	 */
	export function onBeforeInput() {
		performance.mark('input/start');
		state.input = EventPhase.InProgress;
		/** Schedule Task A. See explanation in {@link recordIfFinished} */
		scheduleRecordIfFinishedTask();
	}

	/**
	 * Record the start of the input event.
	 */
	export function onInput() {
		if (state.input === EventPhase.Before) {
			// it looks like we didn't receive a `beforeinput`
			onBeforeInput();
		}
		queueMicrotask(markInputEnd);
	}

	function markInputEnd() {
		if (state.input === EventPhase.InProgress) {
			performance.mark('input/end');
			state.input = EventPhase.Finished;
		}
	}

	/**
	 * Record the start of the keyup event.
	 */
	export function onKeyUp() {
		/** Direct Check D. See explanation in {@link recordIfFinished} */
		recordIfFinished();
	}

	/**
	 * Record the start of the selectionchange event.
	 */
	export function onSelectionChange() {
		/** Direct Check E. See explanation in {@link recordIfFinished} */
		recordIfFinished();
	}

	/**
	 * Record the start of the animation frame performing the rendering.
	 */
	export function onRenderStart() {
		// Render may be triggered during input, but we only measure the following animation frame
		if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.render === EventPhase.Before) {
			// Only measure the first render after keyboard input
			performance.mark('render/start');
			state.render = EventPhase.InProgress;
			queueMicrotask(markRenderEnd);
			/** Schedule Task B. See explanation in {@link recordIfFinished} */
			scheduleRecordIfFinishedTask();
		}
	}

	/**
	 * Mark the end of the animation frame performing the rendering.
	 */
	function markRenderEnd() {
		if (state.render === EventPhase.InProgress) {
			performance.mark('render/end');
			state.render = EventPhase.Finished;
		}
	}

	function scheduleRecordIfFinishedTask() {
		// Here we can safely assume that the `setTimeout` will not be
		// artificially delayed by 4ms because we schedule it from
		// event handlers
		setTimeout(recordIfFinished);
	}

	/**
	 * Record the input latency sample if input handling and rendering are finished.
	 *
	 * The challenge here is that we want to record the latency in such a way that it includes
	 * also the layout and painting work the browser does during the animation frame task.
	 *
	 * Simply scheduling a new task (via `setTimeout`) from the animation frame task would
	 * schedule the new task at the end of the task queue (after other code that uses `setTimeout`),
	 * so we need to use multiple strategies to make sure our task runs before others:
	 *
	 * We schedule tasks (A and B):
	 *    - we schedule a task A (via a `setTimeout` call) when the input starts in `markInputStart`.
	 *      If the animation frame task is scheduled quickly by the browser, then task A has a very good
	 *      chance of being the very first task after the animation frame and thus will record the input latency.
	 *    - however, if the animation frame task is scheduled a bit later, then task A might execute
	 *      before the animation frame task. We therefore schedule another task B from `markRenderStart`.
	 *
	 * We do direct checks in browser event handlers (C, D, E):
	 *    - if the browser has multiple keydown events queued up, they will be scheduled before the `setTimeout` tasks,
	 *      so we do a direct check in the keydown event handler (C).
	 *    - depending on timing, sometimes the animation frame is scheduled even before the `keyup` event, so we
	 *      do a direct check there too (E).
	 *    - the browser oftentimes emits a `selectionchange` event after an `input`, so we do a direct check there (D).
	 */
	function recordIfFinished() {
		if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.render === EventPhase.Finished) {
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
			// 	`input latency=${performance.getEntriesByName('inputlatency')[0].duration.toFixed(1)} [` +
			// 	`keydown=${performance.getEntriesByName('keydown')[0].duration.toFixed(1)}, ` +
			// 	`input=${performance.getEntriesByName('input')[0].duration.toFixed(1)}, ` +
			// 	`render=${performance.getEntriesByName('render')[0].duration.toFixed(1)}` +
			// 	`]`
			// );

			measurementsCount++;

			reset();
		}
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
