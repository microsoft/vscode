/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

function _factory(sharedObj, nodeRequire) {

	let _data = sharedObj.MonacoStartupPerformanceMarks;

	if (!_data) {
		_data = sharedObj.MonacoStartupPerformanceMarks = {
			startupEntries: [],
			observer: undefined,
		};
	}

	return {
		start() {
			if (!_data.observer) {
				const { PerformanceObserver } = nodeRequire('perf_hooks');
				const observer = new PerformanceObserver(list => {
					_data.startupEntries.push(list.getEntries());
				});
				observer.observe({ buffered: true, entryTypes: ['mark'] });
				_data.observer = observer;
			}
		},
		consumeAndStop() {
			if (_data.observer) {
				const entries = [].concat(..._data.startupEntries);
				_data.observer.disconnect();
				_data.startupEntries.length = 0;
				return entries;
			}
			return []; // never started
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
