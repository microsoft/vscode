/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Platform from 'vs/base/common/platform';

/**
 * To enable diagnostics, open a browser console and type: window.Monaco.Diagnostics.<diagnostics name> = true.
 * Then trigger an action that will write to diagnostics to see all cached output from the past.
 */

var globals = Platform.globals;
if (!globals.Monaco) {
	globals.Monaco = {};
}
globals.Monaco.Diagnostics = {};

var switches = globals.Monaco.Diagnostics;
var map = {};
var data: any[] = [];

function fifo(array: any[], size: number) {
	while (array.length > size) {
		array.shift();
	}
}

export function register(what: string, fn: Function): (...args: any[]) => void {

	let disable = true; // Otherwise we have unreachable code.
	if (disable) {
		return () => {
			// Intentional empty, disable for now because it is leaking memory
		};
	}

	// register switch
	var flag = switches[what] || false;
	switches[what] = flag;

	// register function
	var tracers = map[what] || [];
	tracers.push(fn);
	map[what] = tracers;

	var result = function (...args: any[]) {

		var idx: number;

		if (switches[what] === true) {
			// replay back-in-time functions
			var allArgs = [arguments];
			idx = data.indexOf(fn);
			if (idx !== -1) {
				allArgs.unshift.apply(allArgs, data[idx + 1] || []);
				data[idx + 1] = [];
			}

			var doIt: () => void = function () {
				var thisArguments = allArgs.shift();
				fn.apply(fn, thisArguments);
				if (allArgs.length > 0) {
					Platform.setTimeout(doIt, 500);
				}
			};
			doIt();

		} else {
			// know where to store
			idx = data.indexOf(fn);
			idx = idx !== -1 ? idx : data.length;
			var dataIdx = idx + 1;

			// store arguments
			var allargs = data[dataIdx] || [];
			allargs.push(arguments);
			fifo(allargs, 50);

			// store data
			data[idx] = fn;
			data[dataIdx] = allargs;
		}
	};

	return result;
}
