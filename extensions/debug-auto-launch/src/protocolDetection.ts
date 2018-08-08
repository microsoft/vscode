/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export const INSPECTOR_PORT_DEFAULT = 9229;
export const LEGACY_PORT_DEFAULT = 5858;

export interface DebugArguments {
	usePort: boolean;	// if true debug by using the debug port
	protocol?: 'legacy' | 'inspector';
	address?: string;
	port: number;
}

/*
 * analyse the given command line arguments and extract debug port and protocol from it.
 */
export function analyseArguments(args: string): DebugArguments {

	const DEBUG_FLAGS_PATTERN = /--(inspect|debug)(-brk)?(=((\[[0-9a-fA-F:]*\]|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[a-zA-Z0-9\.]*):)?(\d+))?/;
	const DEBUG_PORT_PATTERN = /--(inspect|debug)-port=(\d+)/;

	const result: DebugArguments = {
		usePort: false,
		port: -1
	};

	// match --debug, --debug=1234, --debug-brk, debug-brk=1234, --inspect, --inspect=1234, --inspect-brk, --inspect-brk=1234
	let matches = DEBUG_FLAGS_PATTERN.exec(args);
	if (matches && matches.length >= 2) {
		// attach via port
		result.usePort = true;
		if (matches.length >= 6 && matches[5]) {
			result.address = matches[5];
		}
		if (matches.length >= 7 && matches[6]) {
			result.port = parseInt(matches[6]);
		}
		result.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
	}

	// a debug-port=1234 or --inspect-port=1234 overrides the port
	matches = DEBUG_PORT_PATTERN.exec(args);
	if (matches && matches.length === 3) {
		// override port
		result.port = parseInt(matches[2]);
		result.protocol = matches[1] === 'debug' ? 'legacy' : 'inspector';
	}

	if (result.port < 0) {
		result.port = result.protocol === 'inspector' ? INSPECTOR_PORT_DEFAULT : LEGACY_PORT_DEFAULT;
	}

	return result;
}
