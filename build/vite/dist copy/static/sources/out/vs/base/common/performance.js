/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
function _definePolyfillMarks(timeOrigin) {
    const _data = [];
    if (typeof timeOrigin === 'number') {
        _data.push('code/timeOrigin', timeOrigin);
    }
    function mark(name, markOptions) {
        _data.push(name, markOptions?.startTime ?? Date.now());
    }
    function getMarks() {
        const result = [];
        for (let i = 0; i < _data.length; i += 2) {
            result.push({
                name: _data[i],
                startTime: _data[i + 1],
            });
        }
        return result;
    }
    function clearMarks(prefix) {
        for (let i = _data.length - 2; i >= 0; i -= 2) {
            if (typeof _data[i] === 'string' && _data[i].startsWith(prefix)) {
                _data.splice(i, 2);
            }
        }
    }
    return { mark, getMarks, clearMarks };
}
function _define() {
    // Identify browser environment when following property is not present
    // https://nodejs.org/dist/latest-v16.x/docs/api/perf_hooks.html#performancenodetiming
    // @ts-ignore
    if (typeof performance === 'object' && typeof performance.mark === 'function' && !performance.nodeTiming) {
        // in a browser context, reuse performance-util
        if (typeof performance.timeOrigin !== 'number' && !performance.timing) {
            // safari & webworker: because there is no timeOrigin and no workaround
            // we use the `Date.now`-based polyfill.
            return _definePolyfillMarks();
        }
        else {
            // use "native" performance for mark and getMarks
            return {
                mark(name, markOptions) {
                    performance.mark(name, markOptions);
                },
                clearMarks(prefix) {
                    const toRemove = new Set();
                    for (const entry of performance.getEntriesByType('mark')) {
                        if (entry.name.startsWith(prefix)) {
                            toRemove.add(entry.name);
                        }
                    }
                    for (const name of toRemove) {
                        performance.clearMarks(name);
                    }
                },
                getMarks() {
                    let timeOrigin = performance.timeOrigin;
                    if (typeof timeOrigin !== 'number') {
                        // safari: there is no timerOrigin but in renderers there is the timing-property
                        // see https://bugs.webkit.org/show_bug.cgi?id=174862
                        timeOrigin = (performance.timing.navigationStart || performance.timing.redirectStart || performance.timing.fetchStart) ?? 0;
                    }
                    const result = [{ name: 'code/timeOrigin', startTime: Math.round(timeOrigin) }];
                    for (const entry of performance.getEntriesByType('mark')) {
                        result.push({
                            name: entry.name,
                            startTime: Math.round(timeOrigin + entry.startTime)
                        });
                    }
                    return result;
                }
            };
        }
    }
    else if (typeof process === 'object') {
        // node.js: use the normal polyfill but add the timeOrigin
        // from the node perf_hooks API as very first mark
        const timeOrigin = performance?.timeOrigin;
        return _definePolyfillMarks(timeOrigin);
    }
    else {
        // unknown environment
        console.trace('perf-util loaded in UNKNOWN environment');
        return _definePolyfillMarks();
    }
}
function _factory(sharedObj) {
    if (!sharedObj.MonacoPerformanceMarks) {
        sharedObj.MonacoPerformanceMarks = _define();
    }
    return sharedObj.MonacoPerformanceMarks;
}
const perf = _factory(globalThis);
export const mark = perf.mark;
/**
 * Clears all marks whose name starts with the given prefix.
 */
export const clearMarks = perf.clearMarks;
/**
 * Returns all marks, sorted by `startTime`.
 */
export const getMarks = perf.getMarks;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZm9ybWFuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxTQUFTLG9CQUFvQixDQUFDLFVBQW1CO0lBQ2hELE1BQU0sS0FBSyxHQUF1QixFQUFFLENBQUM7SUFDckMsSUFBSSxPQUFPLFVBQVUsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNwQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCxTQUFTLElBQUksQ0FBQyxJQUFZLEVBQUUsV0FBb0M7UUFDL0QsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLFNBQVMsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBQ0QsU0FBUyxRQUFRO1FBQ2hCLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDMUMsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDWCxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDZCxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDdkIsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUNELFNBQVMsVUFBVSxDQUFDLE1BQWM7UUFDakMsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZ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