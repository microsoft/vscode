/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { killTree } from '../../../node/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';

suite('killTree', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function spawnNode(script: string) {
		return spawn(process.execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
	}

	test('resolves when the process exits on its own before taskkill reaches it', async () => {
		const pid = spawnNode('setInterval(() => {}, 1000)').pid!;
		// Stands in for taskkill /T /F: terminating the children makes the process (a shell) exit before taskkill gets to it
		const output = [
			`SUCCESS: The process with PID 1228 (child process of PID ${pid}) has been terminated.`,
			`ERROR: The process with PID ${pid} (child process of PID ${process.pid}) could not be terminated.`,
			'Reason: There is no running instance of the task.',
		].join('\r\n');
		const taskkill = `
			process.kill(${pid});
			const poll = setInterval(() => {
				try {
					process.kill(${pid}, 0);
				} catch {
					clearInterval(poll);
					process.stdout.write(${JSON.stringify(output)});
					process.exitCode = 255;
				}
			}, 10);`;
		await killTree(pid, true, () => spawnNode(taskkill));
	});
});
