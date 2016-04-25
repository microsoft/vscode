/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as minimist from 'minimist';

export interface ParsedArgs extends minimist.ParsedArgs {
	help: boolean;
	version: boolean;
	wait: boolean;
}

const options = {
	alias: {
		help: 'h',
		version: 'v',
		wait: 'w'
	}
} as minimist.Opts;

export function parseArgs(args: string[]) {
	return minimist(args, options) as ParsedArgs;
}