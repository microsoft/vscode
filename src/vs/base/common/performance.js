/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/*global define*/

// This module can be loaded in an amd and commonjs-context.
// Because we want both instances to use the same perf-data
// we store them globally
global._performanceEntries = global._performanceEntries || [];

if (typeof define !== "function" && typeof module === "object" && typeof module.exports === "object") {
	// this is commonjs, fake amd
	global.define = function (dep, callback) {
		module.exports = callback();
		global.define = undefined;
	};
}

define([], function () {

	// const _now = global.performance && performance.now ? performance.now : Date.now
	const _now = Date.now;

	class PerformanceEntry {
		constructor(type, name, startTime, duration) {
			this.type = type;
			this.name = name;
			this.startTime = startTime;
			this.duration = duration;
		}
	}

	function _getEntry(type, name) {
		for (let i = global._performanceEntries.length - 1; i >= 0; i--) {
			if (
				(type === undefined || global._performanceEntries[i].type === type) &&
				(name === undefined || global._performanceEntries[i].name === name)
			) {
				return global._performanceEntries[i];
			}
		}
	}

	function importEntries(entries) {
		global._performanceEntries.splice(0, 0, ...entries);
	}

	function getEntries(type, name) {
		return global._performanceEntries.filter(entry => {
			return (type === undefined || entry.type === type) &&
				(name === undefined || entry.name === name);
		}).sort((a, b) => {
			return a.startTime - b.startTime;
		});
	}

	function mark(name) {
		const entry = new PerformanceEntry('mark', name, _now(), 0);
		global._performanceEntries.push(entry);
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
			startTime = _getEntry(undefined, from).startTime;
		}

		if (!to) {
			duration = now - startTime;
		} else {
			duration = _getEntry(undefined, to).startTime - startTime;
		}

		const entry = new PerformanceEntry('measure', name, startTime, duration);
		global._performanceEntries.push(entry);
	}

	var exports = {
		mark: mark,
		measure: measure,
		time: time,
		getEntries: getEntries,
		importEntries: importEntries
	};

	return exports;
});
