/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';

export type WorkbenchClientProfileResult = { type: 'exit'; code: number | null } | { type: 'error'; message: string };

// This fork is the POSIX process-group leader, so cleanup includes itself and all workbench helpers.
function stop(): void {
	process.kill(-process.pid, 'SIGKILL');
}

function report(result: WorkbenchClientProfileResult): void {
	if (!process.connected) {
		stop();
		return;
	}
	process.send!(result, error => {
		if (error) {
			stop();
		}
	});
}

// Install the guard before spawning; the workbench must never exist without a parent-death guard.
process.once('disconnect', stop);
if (process.connected) {
	const environment = { ...process.env };
	delete environment.ELECTRON_RUN_AS_NODE;
	const child = spawn(process.argv[2], process.argv.slice(3), { env: environment, stdio: 'inherit' });
	child.once('error', error => report({ type: 'error', message: error.message }));
	child.once('exit', code => report({ type: 'exit', code }));
}
