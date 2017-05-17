/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var requireProfiler;

if (typeof define !== "function" && typeof module === "object" && typeof module.exports === "object") {
	// this is commonjs, fake amd
	global.define = function (dep, callback) {
		module.exports = callback();
		global.define = undefined;
	}
	requireProfiler = function () {
		return require('v8-profiler');
	}
} else {
	// this is amd
	requireProfiler = function () {
		return require.__$__nodeRequire('v8-profiler');
	}
}

define([], function () {

	function Tick(name, started, stopped, profile) {
		this.name = name
		this.started = started
		this.stopped = stopped
		this.duration = stopped - started;
		this.profile = profile;
	}
	Tick.compareByStart = function (a, b) {
		if (a.started < b.started) {
			return -1;
		} else if (a.started > b.started) {
			return 1;
		} else {
			return 0;
		}
	};

	// This module can be loaded in an amd and commonjs-context.
	// Because we want both instances to use the same tick-data
	// we store them globally
	global._perfStarts = global._perfStarts || new Map();
	global._perfTicks = global._perfTicks || [];
	global._perfToBeProfiled = global._perfToBeProfiled || new Set();

	const _starts = global._perfStarts;
	const _ticks = global._perfTicks;
	const _toBeProfiled = global._perfToBeProfiled

	function startTimer(name, started) {
		if (typeof started !== 'number') {
			started = Date.now();
		}
		if (_starts.has(name)) {
			throw new Error("${name}" + " already exists");
		}
		if (_toBeProfiled.has(name)) {
			requireProfiler().startProfiling(name, true);
		}
		_starts.set(name, { name: name, started: started });
		const stop = stopTimer.bind(undefined, name);
		return {
			stop: stop,
			while: function (thenable) {
				thenable.then(function () { stop(); }, function () { stop(); });
				return thenable;
			}
		};
	}

	function stopTimer(name, stopped) {
		if (typeof stopped !== 'number') {
			stopped = Date.now();
		}
		const profile = _toBeProfiled.has(name) ? requireProfiler().stopProfiling(name) : undefined;
		const start = _starts.get(name);
		const tick = new Tick(start.name, start.started, stopped, profile);
		_ticks.push(tick);
		_starts.delete(name);
	}

	function ticks() {
		return _ticks;
	}

	function setProfileList(names) {
		_toBeProfiled.clear();
		names.forEach(function (name) { _toBeProfiled.add(name) });
	}

	const exports = {
		Tick: Tick,
		startTimer: startTimer,
		stopTimer: stopTimer,
		ticks: ticks,
		setProfileList: setProfileList,
		disable: disable,
	};

	function disable() {
		const emptyController = Object.freeze({ while: function (t) { return t; }, stop: function () { } });
		const emptyTicks = Object.create([]);
		exports.startTimer = function () { return emptyController; };
		exports.stopTimer = function () { };
		exports.ticks = function () { return emptyTicks; };

		delete global._perfStarts;
		delete global._perfTicks;
	}

	return exports;
});
