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

const globals = Platform.globals;
if (!globals.Monaco) {
	globals.Monaco = {};
}
globals.Monaco.Diagnostics = {};

const switches = globals.Monaco.Diagnostics;
const map = new Map<string, Function[]>();
const data: any[] = [];

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
	const flag = switches[what] || false;
	switches[what] = flag;

	// register function
	const tracers = map.get(what) || [];
	tracers.push(fn);
	map.set(what, tracers);

	const result = function (...args: any[]) {

		let idx: number;

		if (switches[what] === true) {
			// replay back-in-time functions
			const allArgs = [arguments];
			idx = data.indexOf(fn);
			if (idx !== -1) {
				allArgs.unshift.apply(allArgs, data[idx + 1] || []);
				data[idx + 1] = [];
			}

			const doIt: () => void = function () {
				const thisArguments = allArgs.shift();
				fn.apply(fn, thisArguments);
				if (allArgs.length > 0) {
					setTimeout(doIt, 500);
				}
			};
			doIt();

		} else {
			// know where to store
			idx = data.indexOf(fn);
			idx = idx !== -1 ? idx : data.length;
			const dataIdx = idx + 1;

			// store arguments
			const allargs = data[dataIdx] || [];
			allargs.push(arguments);
			fifo(allargs, 50);

			// store data
			data[idx] = fn;
			data[dataIdx] = allargs;
		}
	};

	return result;
}
