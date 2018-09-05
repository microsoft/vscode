/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/*global define*/

// This module can be loaded in an amd and commonjs-context.
// Because we want both instances to use the same perf-data
// we store them globally
// stores data as 'type','name','startTime','duration'

if (typeof define !== "function" && typeof module === "object" && typeof module.exports === "object") {
	// this is commonjs, fake amd
	global.define = function (dep, callback) {
		module.exports = callback();
		global.define = undefined;
	};
}

define([], function () {

	var _global = this;
	if (typeof global !== 'undefined') {
		_global = global;
	}
	_global._performanceEntries = _global._performanceEntries || [];

	// const _now = global.performance && performance.now ? performance.now : Date.now
	const _now = Date.now;

	function importEntries(entries) {
		global._performanceEntries.splice(0, 0, ...entries);
	}

	function exportEntries() {
		return global._performanceEntries.slice(0);
	}

	function getEntries(type, name) {
		const result = [];
		const entries = global._performanceEntries;
		for (let i = 0; i < entries.length; i += 5) {
			if (entries[i] === type && (name === void 0 || entries[i + 1] === name)) {
				result.push({
					type: entries[i],
					name: entries[i + 1],
					startTime: entries[i + 2],
					duration: entries[i + 3],
					seq: entries[i + 4],
				});
			}
		}

		return result.sort((a, b) => {
			return a.startTime - b.startTime || a.seq - b.seq;
		});
	}

	function getEntry(type, name) {
		const entries = global._performanceEntries;
		for (let i = 0; i < entries.length; i += 5) {
			if (entries[i] === type && entries[i + 1] === name) {
				return {
					type: entries[i],
					name: entries[i + 1],
					startTime: entries[i + 2],
					duration: entries[i + 3],
					seq: entries[i + 4],
				};
			}
		}
	}

	function getDuration(from, to) {
		const entries = global._performanceEntries;
		let target = to;
		let endTime = 0;
		for (let i = entries.length - 1; i >= 0; i -= 5) {
			if (entries[i - 3] === target) {
				if (target === to) {
					// found `to` (end of interval)
					endTime = entries[i - 2];
					target = from;
				} else {
					return endTime - entries[i - 2];
				}
			}
		}
		return 0;
	}

	let seq = 0;

	function mark(name) {
		global._performanceEntries.push('mark', name, _now(), 0, seq++);
		if (typeof console.timeStamp === 'function') {
			console.timeStamp(name);
		}
	}

	function measure(name, from, to) {

		let startTime;
		let duration;
		let now = _now();

		if (!from) {
			startTime = now;
		} else {
			startTime = _getLastStartTime(from);
		}

		if (!to) {
			duration = now - startTime;
		} else {
			duration = _getLastStartTime(to) - startTime;
		}

		global._performanceEntries.push('measure', name, startTime, duration);
	}

	function _getLastStartTime(name) {
		const entries = global._performanceEntries;
		for (let i = entries.length - 1; i >= 0; i -= 5) {
			if (entries[i - 3] === name) {
				return entries[i - 2];
			}
		}

		throw new Error(name + ' not found');
	}

	var exports = {
		mark: mark,
		measure: measure,
		getEntries: getEntries,
		getEntry: getEntry,
		getDuration: getDuration,
		importEntries: importEntries,
		exportEntries: exportEntries
	};

	return exports;
});
