/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace inputLatency {

	const enum Constants {
		bufferLength = 256
	}

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

	const measurementsKeydown = new Float32Array(Constants.bufferLength);
	const measurementsInput = new Float32Array(Constants.bufferLength);
	const measurementsRender = new Float32Array(Constants.bufferLength);
	const measurementsInputLatency = new Float32Array(Constants.bufferLength);
	let measurementsIndex = 0;

	export function markKeydownStart() {
		performance.mark('inputlatency/start');
		performance.mark('keydown/start');
		state.keydown = EventPhase.InProgress;
		queueMicrotask(() => markKeydownEnd());
	}

	function markKeydownEnd() {
		// Only measure the first render after keyboard input
		performance.mark('keydown/end');
		state.keydown = EventPhase.Finished;
	}

	export function markInputStart() {
		performance.mark('input/start');
		state.input = EventPhase.InProgress;
	}

	export function markInputEnd() {
		queueMicrotask(() => {
			performance.mark('input/end');
			state.input = EventPhase.Finished;
		});
	}

	export function markRenderStart() {
		// Render may be triggered during input, but we only measure the following animation frame
		if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.render === EventPhase.Before) {
			// Only measure the first render after keyboard input
			performance.mark('render/start');
			state.render = EventPhase.InProgress;
			queueMicrotask(() => markRenderEnd());
		}
	}

	function markRenderEnd() {
		// Only measure the first render after keyboard input
		performance.mark('render/end');
		state.render = EventPhase.Finished;
		record();
	}

	export function markTextareaSelection() {
		state.selection = EventPhase.Finished;
		record();
	}

	function record() {
		// Skip recording this frame if the buffer is full
		if (measurementsIndex >= Constants.bufferLength) {
			return;
		}
		// Selection and render must have finished to record
		if (state.selection !== EventPhase.Finished || state.render !== EventPhase.Finished) {
			return;
		}
		// Measures from cursor edit to the end of the task
		window.queueMicrotask(() => {
			if (state.keydown === EventPhase.Finished && state.input === EventPhase.Finished && state.selection === EventPhase.Finished && state.render === EventPhase.Finished) {
				performance.mark('inputlatency/end');

				performance.measure('keydown', 'keydown/start', 'keydown/end');
				performance.measure('input', 'input/start', 'input/end');
				performance.measure('render', 'render/start', 'render/end');
				performance.measure('inputlatency', 'inputlatency/start', 'inputlatency/end');

				measurementsKeydown[measurementsIndex] = performance.getEntriesByName('keydown')[0].duration;
				measurementsInput[measurementsIndex] = performance.getEntriesByName('input')[0].duration;
				measurementsRender[measurementsIndex] = performance.getEntriesByName('render')[0].duration;
				measurementsInputLatency[measurementsIndex] = performance.getEntriesByName('inputlatency')[0].duration;

				console.info(
					`input latency=${measurementsInputLatency[measurementsIndex].toFixed(1)} [` +
					`keydown=${measurementsKeydown[measurementsIndex].toFixed(1)}, ` +
					`input=${measurementsInput[measurementsIndex].toFixed(1)}, ` +
					`render=${measurementsRender[measurementsIndex].toFixed(1)}` +
					`]`
				);

				measurementsIndex++;

				reset();
			}
		});
	}

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

}
