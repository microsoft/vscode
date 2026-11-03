/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { once } from 'events';
import { killTree } from '../../../node/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';

suite('killTree', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const children: ChildProcess[] = [];

	function spawnNode(script: string) {
		const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
		children.push(child);
		return child;
	}

	teardown(async () => {
		await Promise.all(children.splice(0).map(async child => {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, 'exit');
				child.kill('SIGKILL');
				await exited;
			}
		}));
	});

	test('resolves when the process exits on its own before taskkill reaches it', async () => {
		const pid = spawnNode('setTimeout(() => process.exit(0), 10000)').pid!;
		const messages: string[] = [];
		// Stands in for taskkill /T /F: terminating the children makes the process (a shell) exit before taskkill gets to it
		const output = [
			`SUCCESS: The process with PID 1228 (child process of PID ${pid}) has been terminated.`,
			`ERROR: The process with PID ${pid} (child process of PID ${process.pid}) could not be terminated.`,
			'Reason: There is no running instance of the task.',
		].join('\r\n');
		const taskkill = `
			setTimeout(() => process.exit(1), 5000).unref();
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
		await killTree(pid, true, message => messages.push(message), () => spawnNode(taskkill));
		assert.deepStrictEqual(messages, [
			`killTree: ignoring termination command failure for root PID ${pid}, which is no longer running (exit code: 255, signal: null): ${output}`,
		]);
	});

	test('does not log successful termination commands', async () => {
		const messages: string[] = [];
		await killTree(process.pid, true, message => messages.push(message), () => spawnNode('process.exitCode = 0'));
		assert.deepStrictEqual(messages, []);
	});

	test('rejects without logging when the root is still running', async () => {
		const messages: string[] = [];
		await assert.rejects(
			killTree(process.pid, true, message => messages.push(message), () => spawnNode('process.stderr.write("termination failed"); process.exitCode = 1')),
			{ message: 'taskkill exited with code 1: termination failed' },
		);
		assert.deepStrictEqual(messages, []);
	});

	test('rejects without logging when spawning the terminator fails', async () => {
		const messages: string[] = [];
		const error = new Error('Could not spawn terminator');
		await assert.rejects(killTree(process.pid, true, message => messages.push(message), () => { throw error; }), error);
		assert.deepStrictEqual(messages, []);
	});

	test('rejects without logging when the terminator emits an error', async () => {
		const messages: string[] = [];
		await assert.rejects(
			killTree(process.pid, true, message => messages.push(message), () => spawn(`${process.execPath}.missing-killTree-test`, [], { stdio: ['ignore', 'pipe', 'pipe'] })),
			{ code: 'ENOENT' },
		);
		assert.deepStrictEqual(messages, []);
	});

	test('includes stderr when logging an ignored termination failure', async () => {
		const target = spawnNode('');
		await once(target, 'exit');
		const messages: string[] = [];
		await killTree(target.pid!, true, message => messages.push(message), () => spawnNode('process.stderr.write("termination failed"); process.exitCode = 1'));
		assert.deepStrictEqual(messages, [
			`killTree: ignoring termination command failure for root PID ${target.pid}, which is no longer running (exit code: 1, signal: null): termination failed`,
		]);
	});

	test('logs the signal when an interrupted termination command is ignored', async () => {
		const target = spawnNode('');
		await once(target, 'exit');
		const messages: string[] = [];
		await killTree(target.pid!, true, message => messages.push(message), () => {
			const terminator = spawnNode('setTimeout(() => process.exit(0), 10000)');
			terminator.once('spawn', () => terminator.kill('SIGTERM'));
			return terminator;
		});
		assert.deepStrictEqual(messages, [
			`killTree: ignoring termination command failure for root PID ${target.pid}, which is no longer running (exit code: null, signal: SIGTERM): `,
		]);
	});

	test('rejects instead of leaving the promise pending when logging throws', async () => {
		const target = spawnNode('');
		await once(target, 'exit');
		const error = new Error('Logging failed');
		await assert.rejects(killTree(target.pid!, true, () => { throw error; }, () => spawnNode('process.exitCode = 255')), error);
	});
});
