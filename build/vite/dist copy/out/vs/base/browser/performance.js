/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var inputLatency;
(function (inputLatency) {
    const totalKeydownTime = { total: 0, min: Number.MAX_VALUE, max: 0 };
    const totalInputTime = { ...totalKeydownTime };
    const totalRenderTime = { ...totalKeydownTime };
    const totalInputLatencyTime = { ...totalKeydownTime };
    let measurementsCount = 0;
    // The state of each event, this helps ensure the integrity of the measurement and that
    // something unexpected didn't happen that could skew the measurement.
    let EventPhase;
    (function (EventPhase) {
        EventPhase[EventPhase["Before"] = 0] = "Before";
        EventPhase[EventPhase["InProgress"] = 1] = "InProgress";
        EventPhase[EventPhase["Finished"] = 2] = "Finished";
    })(EventPhase || (EventPhase = {}));
    const state = {
        keydown: 0 /* EventPhase.Before */,
        input: 0 /* EventPhase.Before */,
        render: 0 /* EventPhase.Before */,
    };
    /**
     * Record the start of the keydown event.
     */
    function onKeyDown() {
        /** Direct Check C. See explanation in {@link recordIfFinished} */
        recordIfFinished();
        performance.mark('inputlatency/start');
        performance.mark('keydown/start');
        state.keydown = 1 /* EventPhase.InProgress */;
        queueMicrotask(markKeyDownEnd);
    }
    inputLatency.onKeyDown = onKeyDown;
    /**
     * Mark the end of the keydown event.
     */
    function markKeyDownEnd() {
        if (state.keydown === 1 /* EventPhase.InProgress */) {
            performance.mark('keydown/end');
            state.keydown = 2 /* EventPhase.Finished */;
        }
    }
    /**
     * Record the start of the beforeinput event.
     */
    function onBeforeInput() {
        performance.mark('input/start');
        state.input = 1 /* EventPhase.InProgress */;
        /** Schedule Task A. See explanation in {@link recordIfFinished} */
        scheduleRecordIfFinishedTask();
    }
    inputLatency.onBeforeInput = onBeforeInput;
    /**
     * Record the start of the input event.
     */
    function onInput() {
        if (state.input === 0 /* EventPhase.Before */) {
            // it looks like we didn't receive a `beforeinput`
            onBeforeInput();
        }
        queueMicrotask(markInputEnd);
    }
    inputLatency.onInput = onInput;
    function markInputEnd() {
        if (state.input === 1 /* EventPhase.InProgress */) {
            performance.mark('input/end');
            state.input = 2 /* EventPhase.Finished */;
        }
    }
    /**
     * Record the start of the keyup event.
     */
    function onKeyUp() {
        /** Direct Check D. See explanation in {@link recordIfFinished} */
        recordIfFinished();
    }
    inputLatency.onKeyUp = onKeyUp;
    /**
     * Record the start of the selectionchange event.
     */
    function onSelectionChange() {
        /** Direct Check E. See explanation in {@link recordIfFinished} */
        recordIfFinished();
    }
    inputLatency.onSelectionChange = onSelectionChange;
    /**
     * Record the start of the animation frame performing the rendering.
     */
    function onRenderStart() {
        // Render may be triggered during input, but we only measure the following animation frame
        if (state.keydown === 2 /* EventPhase.Finished */ && state.input === 2 /* EventPhase.Finished */ && state.render === 0 /* EventPhase.Before */) {
            // Only measure the first render after keyboard input
            performance.mark('render/start');
            state.render = 1 /* EventPhase.InProgress */;
            queueMicrotask(markRenderEnd);
            /** Schedule Task B. See explanation in {@link recordIfFinished} */
            scheduleRecordIfFinishedTask();
        }
    }
    inputLatency.onRenderStart = onRenderStart;
    /**
     * Mark the end of the animation frame performing the rendering.
     */
    function markRenderEnd() {
        if (state.render === 1 /* EventPhase.InProgress */) {
            performance.mark('render/end');
            state.render = 2 /* EventPhase.Finished */;
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
        if (state.keydown === 2 /* EventPhase.Finished */ && state.input === 2 /* EventPhase.Finished */ && state.render === 2 /* EventPhase.Finished */) {
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
    function addMeasure(entryName, cumulativeMeasurement) {
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
        state.keydown = 0 /* EventPhase.Before */;
        state.input = 0 /* EventPhase.Before */;
        state.render = 0 /* EventPhase.Before */;
    }
    /**
     * Gets all input latency samples and clears the internal buffers to start recording a new set
     * of samples.
     */
    function getAndClearMeasurements() {
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
    inputLatency.getAndClearMeasurements = getAndClearMeasurements;
    function cumulativeToFinalMeasurement(cumulative) {
        return {
            average: cumulative.total / measurementsCount,
            max: cumulative.max,
            min: cumulative.min,
        };
    }
    function clearCumulativeMeasurement(cumulative) {
        cumulative.total = 0;
        cumulative.min = Number.MAX_VALUE;
        cumulative.max = 0;
    }
})(inputLatency || (inputLatency = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZm9ybWFuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvcGVyZm9ybWFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxLQUFXLFlBQVksQ0EwUTVCO0FBMVFELFdBQWlCLFlBQVk7SUFTNUIsTUFBTSxnQkFBZ0IsR0FBMkIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztJQUM3RixNQUFNLGNBQWMsR0FBMkIsRUFBRSxHQUFHLGdCQUFnQixFQUFFLENBQUM7SUFDdkUsTUFBTSxlQUFlLEdBQTJCLEVBQUUsR0FBRyxnQkFBZ0IsRUFBRSxDQUFDO0lBQ3hFLE1BQU0scUJBQXFCLEdBQTJCLEVBQUUsR0FBRyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzlFLElBQUksaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO0lBSTFCLHVGQUF1RjtJQUN2RixzRUFBc0U7SUFDdEUsSUFBVyxVQUlWO0lBSkQsV0FBVyxVQUFVO1FBQ3BCLCtDQUFVLENBQUE7UUFDVix1REFBYyxDQUFBO1FBQ2QsbURBQVksQ0FBQTtJQUNiLENBQUMsRUFKVSxVQUFVLEtBQVYsVUFBVSxRQUlwQjtJQUNELE1BQU0sS0FBSyxHQUFHO1FBQ2IsT0FBTywyQkFBbUI7UUFDMUIsS0FBSywyQkFBbUI7UUFDeEIsTUFBTSwyQkFBbUI7S0FDekIsQ0FBQztJQUVGOztPQUVHO0lBQ0gsU0FBZ0IsU0FBUztRQUN4QixrRUFBa0U7UUFDbEUsZ0JBQWdCLEVBQUUsQ0FBQztRQUNuQixXQUFXLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDdkMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsQyxLQUFLLENBQUMsT0FBTyxn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