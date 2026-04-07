/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';

export type InitArgs = {
	runOutputDirName?: string;
	grep?: string;
};

/**
 * See {@link script/electron/simulationWorkbenchMain.js} for CLI args available.
 */
export function parseInitEventArgs(processArgv: string[]): InitArgs | undefined {

	const parsedArgs = minimist(processArgv);

	let runOutputDirName: string | undefined;
	if ('run-dir' in parsedArgs) {
		runOutputDirName = parsedArgs['run-dir'];
	}

	let grep: string | undefined;
	if ('grep' in parsedArgs) {
		grep = parsedArgs['grep'];
	}

	if (runOutputDirName !== undefined || grep !== undefined) {
		return { runOutputDirName, grep };
	}
}
