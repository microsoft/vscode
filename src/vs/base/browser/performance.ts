/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function reportInputLatency() {
	// Measures from cursor edit to the end of the task
	window.queueMicrotask(() => {
		if ((window as any).frameStart && (window as any).frameSelection && (window as any).frameRender) {
			performance.mark('inputlatency/end');
			performance.measure('inputlatency', 'inputlatency/start', 'inputlatency/end');
			const measure = performance.getEntriesByName('inputlatency')[0];
			const startMark = performance.getEntriesByName('inputlatency/start')[0];

			performance.measure('render', 'render/start', 'render/end');
			const measure2 = performance.getEntriesByName('render')[0];

			console.info(`frame stats for ${(startMark as any).detail.padEnd(5, ' ')}, text render time: ${(measure2.duration).toFixed(1).padStart(4, ' ')}ms, latency: ${(measure.duration).toFixed(1).padStart(4, ' ')}ms`);

			performance.clearMarks('inputlatency/start');
			performance.clearMarks('inputlatency/end');
			performance.clearMeasures('inputlatency');
			performance.clearMarks('render/start');
			performance.clearMarks('render/end');
			performance.clearMeasures('render');

			(window as any).frameStart = false;
			(window as any).frameSelection = false;
			(window as any).frameRender = false;
		}
	});
}

export function recordRenderStart() {
	if ((window as any).frameStart && !(window as any).frameRender) {
		// Only measure the first render after keyboard input
		performance.mark('render/start');
	}
}

export function recordRenderEnd() {
	if ((window as any).frameStart && !(window as any).frameRender) {
		// Only measure the first render after keyboard input
		performance.mark('render/end');
		(window as any).frameRender = true;
	}
	reportInputLatency();
}
