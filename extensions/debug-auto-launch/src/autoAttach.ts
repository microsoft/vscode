/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { basename } from 'path';
import { pollProcesses, attachToProcess } from './nodeProcessTree';

const localize = nls.loadMessageBundle();

export function startAutoAttach(rootPid: number): vscode.Disposable {

	return pollProcesses(rootPid, true, (pid, cmdPath, args) => {
		const cmdName = basename(cmdPath, '.exe');
		if (cmdName === 'node') {
			const name = localize('process.with.pid.label', "Process {0}", pid);
			attachToProcess(undefined, name, pid, args);
		}
	});
}
