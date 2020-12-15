/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

function _factory(sharedObj) {

	if (typeof performance === 'object' && typeof performance.mark === 'function') {
		// in a browser context, reuse performance-util
		function mark(name) {
			performance.mark(name);
		}
		function getMarks() {
			let timeOrigin = performance.timeOrigin;
			if (!timeOrigin) {
				// polyfill for Safari
				const entry = performance.timing;
				timeOrigin = entry.navigationStart || entry.redirectStart || entry.fetchStart;
			}
			return performance.getEntriesByType('mark').map(entry => {
				return {
					name: entry.name,
					startTime: Math.round(timeOrigin + entry.startTime)
				};
			});
		}

		return { mark, getMarks };

	} else {
		// node.js context, use mock and a shared obj that's share between module systems
		sharedObj.MonacoPerformanceMarks = sharedObj.MonacoPerformanceMarks || [];

		function mark(name) {
			sharedObj.MonacoPerformanceMarks.push(name, Date.now());
		}

		function getMarks() {
			const result = [];
			const entries = sharedObj.MonacoPerformanceMarks;
			for (let i = 0; i < entries.length; i += 2) {
				result.push({
					name: entries[i],
					startTime: entries[i + 1],
				});
			}
			return result;
		}

		return { mark, getMarks };
	}
}

// This module can be loaded in an amd and commonjs-context.
// Because we want both instances to use the same perf-data
// we store them globally

// eslint-disable-next-line no-var
var sharedObj;
if (typeof global === 'object') {
	// nodejs
	sharedObj = global;
} else if (typeof self === 'object') {
	// browser
	sharedObj = self;
} else {
	sharedObj = {};
}

if (typeof define === 'function') {
	// amd
	define([], function () { return _factory(sharedObj); });
} else if (typeof module === 'object' && typeof module.exports === 'object') {
	// commonjs
	module.exports = _factory(sharedObj);
} else {
	sharedObj.perf = _factory(sharedObj);
}
