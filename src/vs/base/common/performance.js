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
		for (let i = 0; i < entries.length; i += 4) {
			if (entries[i] === type && (name === void 0 || entries[i + 1] === name)) {
				result.push({
					type: entries[i],
					name: entries[i + 1],
					startTime: entries[i + 2],
					duration: entries[i + 3],
				});
			}
		}

		return result.sort((a, b) => {
			return a.startTime - b.startTime;
		});
	}

	function getEntry(type, name) {
		const entries = global._performanceEntries;
		for (let i = 0; i < entries.length; i += 4) {
			if (entries[i] === type && entries[i + 1] === name) {
				return {
					type: entries[i],
					name: entries[i + 1],
					startTime: entries[i + 2],
					duration: entries[i + 3],
				};
			}
		}
	}

	function getDuration(from, to) {
		const entries = global._performanceEntries;
		let name = from;
		let startTime = 0;
		for (let i = 0; i < entries.length; i += 4) {
			if (entries[i + 1] === name) {
				if (name === from) {
					// found `from` (start of interval)
					name = to;
					startTime = entries[i + 2];
				} else {
					// from `to` (end of interval)
					return entries[i + 2] - startTime;
				}
			}
		}
		return 0;
	}

	function mark(name) {
		global._performanceEntries.push('mark', name, _now(), 0);
		if (typeof console.timeStamp === 'function') {
			console.timeStamp(name);
		}
	}

	function time(name) {
		let from = `${name}/start`;
		mark(from);
		return { stop() { measure(name, from); } };
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
		for (let i = entries.length - 1; i >= 0; i -= 4) {
			if (entries[i - 2] === name) {
				return entries[i - 1];
			}
		}

		throw new Error(name + ' not found');
	}

	var exports = {
		mark: mark,
		measure: measure,
		time: time,
		getEntries: getEntries,
		getEntry: getEntry,
		getDuration: getDuration,
		importEntries: importEntries,
		exportEntries: exportEntries
	};

	return exports;
});
