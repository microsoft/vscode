/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/*global define*/

var requireProfiler;

if (typeof define !== "function" && typeof module === "object" && typeof module.exports === "object") {
	// this is commonjs, fake amd
	global.define = function (dep, callback) {
		module.exports = callback();
		global.define = undefined;
	};
	requireProfiler = function () {
		return require('v8-profiler');
	};
} else {
	// this is amd
	requireProfiler = function () {
		return require.__$__nodeRequire('v8-profiler');
	};
}

define([], function () {

	function Tick(name, started, stopped, profile) {
		this.name = name;
		this.started = started;
		this.stopped = stopped;
		this.duration = Math.round(((stopped[0] * 1.e9 + stopped[1]) - (started[0] * 1e9 + started[1])) / 1.e6);
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
	global._perfTicks = global._perfTicks || new Map();
	global._perfToBeProfiled = global._perfToBeProfiled || new Set();

	var _starts = global._perfStarts;
	var _ticks = global._perfTicks;
	var _toBeProfiled = global._perfToBeProfiled;

	function startTimer(name) {
		if (_starts.has(name)) {
			throw new Error("${name}" + " already exists");
		}
		if (_toBeProfiled.has(name)) {
			requireProfiler().startProfiling(name, true);
		}
		_starts.set(name, { name: name, started: process.hrtime() });
		var stop = stopTimer.bind(undefined, name);
		return {
			stop: stop,
			while: function (thenable) {
				thenable.then(function () { stop(); }, function () { stop(); });
				return thenable;
			}
		};
	}

	function stopTimer(name) {
		var profile = _toBeProfiled.has(name) ? requireProfiler().stopProfiling(name) : undefined;
		var start = _starts.get(name);
		if (start !== undefined) {
			var tick = new Tick(start.name, start.started, process.hrtime(), profile);
			_ticks.set(name, tick);
			_starts.delete(name);
		}
	}

	function ticks() {
		var ret = [];
		_ticks.forEach(function (value) { ret.push(value); });
		return ret;
	}

	function tick(name) {
		var ret = _ticks.get(name);
		if (!ret) {
			var now = Date.now();
			ret = new Tick(name, now, now);
		}
		return ret;
	}

	function setProfileList(names) {
		_toBeProfiled.clear();
		names.forEach(function (name) { _toBeProfiled.add(name); });
	}

	var exports = {
		Tick: Tick,
		startTimer: startTimer,
		stopTimer: stopTimer,
		ticks: ticks,
		tick: tick,
		setProfileList: setProfileList,
		disable: disable,
	};

	function disable() {
		var emptyController = Object.freeze({ while: function (t) { return t; }, stop: function () { } });
		var emptyTicks = Object.create([]);
		exports.startTimer = function () { return emptyController; };
		exports.stopTimer = function () { };
		exports.ticks = function () { return emptyTicks; };

		delete global._perfStarts;
		delete global._perfTicks;
	}

	return exports;
});
