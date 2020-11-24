/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

function _factory(sharedObj, nodeRequire) {
	if (!sharedObj.MonacoStartupPerformanceMarks) {

		const { PerformanceObserver } = nodeRequire('perf_hooks');

		let startupEntries = [];

		const startupObs = new PerformanceObserver(list => { startupEntries = startupEntries.concat(list.getEntries()); });
		startupObs.observe({ buffered: true, entryTypes: ['mark'] });

		sharedObj.MonacoStartupPerformanceMarks = {
			startupEntries,
			dispose() {
				startupObs.disconnect();
				startupEntries.length = 0;
				delete sharedObj.MonacoStartupPerformanceMarks;
			},
		};
	}

	return {
		consumeAndStop() {
			const entries = sharedObj.startupEntries.slice(0);
			sharedObj.MonacoStartupPerformanceMarks.dispose();
			return entries;
		}
	};
}

// This module can be loaded in an amd and commonjs-context.
// Because we want both instances to use the same perf-data
// we store them globally
if (typeof define === 'function') {
	// amd
	define([], function () { return _factory(global, require.__$__nodeRequire); });
} else if (typeof module === 'object' && typeof module.exports === 'object') {
	// commonjs
	module.exports = _factory(global, require);
}
