/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

if (typeof define !== "function" && typeof module === "object" && typeof module.exports === "object") {

	global.define = function (dep, callback) {
		module.exports = callback();
		global.define = undefined;
	}
}
define([], function () {

	function Tick(name, started, stopped) {
		this.name = name
		this.started = started
		this.stopped = stopped
		this.duration = stopped - started;
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

	const _starts = global._perfStarts;
	const _ticks = global._perfTicks;

	function startTimer(name, started) {
		if (typeof started !== 'number') {
			started = Date.now();
		}
		if (_starts.has(name)) {
			throw new Error("${name}" + " already exists");
		}
		_starts.set(name, { name, started });
		const stop = stopTimer.bind(undefined, name);
		return {
			stop,
			while(thenable) {
				thenable.then(function() { stop() }, function() { stop() });
				return thenable;
			}
		};
	}

	function stopTimer(name, stopped) {
		if (typeof stopped !== 'number') {
			stopped = Date.now();
		}
		const start = _starts.get(name);
		const tick = new Tick(start.name, start.started, stopped);
		_ticks.push(tick);
		_starts.delete(name);
	}

	function ticks() {
		return _ticks;
	}

	const exports = {
		Tick: Tick,
		startTimer: startTimer,
		stopTimer: stopTimer,
		ticks: ticks,
		disable: disable
	};

	function disable() {
		const emptyController = Object.freeze({ while(t) { return t }, stop() { } });
		const emptyTicks = Object.create([]);
		exports.startTimer = function () { return emptyController; }
		exports.stopTimer = function () { };
		exports.ticks = function () { return emptyTicks; }

		delete global._perfStarts;
		delete global._perfTicks;
	}

	return exports;
});
