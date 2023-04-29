/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawnSync } from 'child_process';


export enum ProcTranslated {
	Error = -1,
	NotTranslated = 0,
	Translated = 1
}

export function isRosettaTranslated(): ProcTranslated {
	const sysCallOutput = spawnSync('sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf-8' }).stdout;
	if (sysCallOutput === '0\n') {
		return ProcTranslated.NotTranslated;
	} else if (sysCallOutput === '1\n') {
		return ProcTranslated.Translated;
	} else {
		return ProcTranslated.Error;
	}
}
