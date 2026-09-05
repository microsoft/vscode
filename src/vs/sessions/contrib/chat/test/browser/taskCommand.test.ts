/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITaskEntry } from '../../browser/sessionsTasksService.js';
import { osToTaskTargetOS, resolveTaskCommand } from '../../browser/taskCommand.js';

suite('resolveTaskCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shell command with args', async () => {
		const task: ITaskEntry = { label: 'echo', type: 'shell', command: 'echo', args: ['hello', 'world'] };
		assert.strictEqual(await resolveTaskCommand(task), 'echo hello world');
	});

	test('plain string args containing spaces are POSIX strong-quoted', async () => {
		const task: ITaskEntry = { label: 'echo', type: 'shell', command: 'echo', args: ['hello world', 'plain'] };
		assert.strictEqual(await resolveTaskCommand(task), `echo 'hello world' plain`);
	});

	test('shell command without args', async () => {
		const task: ITaskEntry = { label: 'pwd', type: 'shell', command: 'pwd' };
		assert.strictEqual(await resolveTaskCommand(task), 'pwd');
	});

	test('npm script', async () => {
		const task: ITaskEntry = { label: 'build', type: 'npm', script: 'build' };
		assert.strictEqual(await resolveTaskCommand(task), 'npm run build');
	});

	test('npm script with no type defaults to npm', async () => {
		const task: ITaskEntry = { label: 'build', script: 'build' };
		assert.strictEqual(await resolveTaskCommand(task), 'npm run build');
	});

	test('command takes precedence over script', async () => {
		const task: ITaskEntry = { label: 'run', type: 'shell', command: 'make', script: 'ignored' };
		assert.strictEqual(await resolveTaskCommand(task), 'make');
	});

	test('os override replaces command and args', async () => {
		const task: ITaskEntry = {
			label: 'list',
			type: 'shell',
			command: 'ls',
			args: ['-la'],
			windows: { command: 'dir', args: ['/B'] },
		};
		assert.strictEqual(await resolveTaskCommand(task, { targetOS: 'windows' }), 'dir /B');
		assert.strictEqual(await resolveTaskCommand(task, { targetOS: 'linux' }), 'ls -la');
		assert.strictEqual(await resolveTaskCommand(task), 'ls -la');
	});

	test('CommandString arg with quoting=strong is single-quoted', async () => {
		const task: ITaskEntry = {
			label: 'echo',
			type: 'shell',
			command: 'echo',
			args: [{ value: 'hello world', quoting: 'strong' }],
		};
		assert.strictEqual(await resolveTaskCommand(task), `echo 'hello world'`);
	});

	test('CommandString arg with quoting=strong escapes embedded single quotes', async () => {
		const task: ITaskEntry = {
			label: 'echo',
			type: 'shell',
			command: 'echo',
			args: [{ value: `it's fine`, quoting: 'strong' }],
		};
		assert.strictEqual(await resolveTaskCommand(task), `echo 'it'\\''s fine'`);
	});

	test('CommandString arg with quoting=weak escapes shell metacharacters in double quotes', async () => {
		const task: ITaskEntry = {
			label: 'echo',
			type: 'shell',
			command: 'echo',
			args: [{ value: `$HOME "x"`, quoting: 'weak' }],
		};
		assert.strictEqual(await resolveTaskCommand(task), `echo "\\$HOME \\"x\\""`);
	});

	test('CommandString arg with quoting=escape backslash-escapes shell-special characters', async () => {
		const task: ITaskEntry = {
			label: 'echo',
			type: 'shell',
			command: 'echo',
			args: [{ value: 'a b;c', quoting: 'escape' }],
		};
		assert.strictEqual(await resolveTaskCommand(task), 'echo a\\ b\\;c');
	});

	test('returns undefined when no command or script is set', async () => {
		const task: ITaskEntry = { label: 'empty' };
		assert.strictEqual(await resolveTaskCommand(task), undefined);
	});

	// --- dependsOn ---

	function lookupFrom(...tasks: ITaskEntry[]): (label: string) => ITaskEntry | undefined {
		const map = new Map(tasks.map(t => [t.label, t]));
		return label => map.get(label);
	}

	test('dependsOn with a single string label chains the dependency before the own command', async () => {
		const dep: ITaskEntry = { label: 'prep', type: 'shell', command: 'npm', args: ['install'] };
		const task: ITaskEntry = { label: 'build', type: 'shell', command: 'make', dependsOn: 'prep' };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(dep) }),
			'npm install && make'
		);
	});

	test('dependsOn array with default sequence order joins with &&', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'] };
		const b: ITaskEntry = { label: 'b', type: 'shell', command: 'echo', args: ['b'] };
		const task: ITaskEntry = { label: 'top', dependsOn: ['a', 'b'] };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
			'echo a && echo b'
		);
	});

	test('dependsOrder=sequence is explicit and equivalent to default', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'] };
		const b: ITaskEntry = { label: 'b', type: 'shell', command: 'echo', args: ['b'] };
		const task: ITaskEntry = { label: 'top', dependsOn: ['a', 'b'], dependsOrder: 'sequence' };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
			'echo a && echo b'
		);
	});

	test('dependsOrder=parallel renders as backgrounded subshells with trailing wait', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'] };
		const b: ITaskEntry = { label: 'b', type: 'shell', command: 'echo', args: ['b'] };
		const task: ITaskEntry = { label: 'top', dependsOn: ['a', 'b'], dependsOrder: 'parallel' };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
			'( echo a ) & ( echo b ) & wait'
		);
	});

	test('dependsOn-only task (no own command) resolves to the dependency chain', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'] };
		const b: ITaskEntry = { label: 'b', type: 'shell', command: 'echo', args: ['b'] };
		const task: ITaskEntry = { label: 'group', dependsOn: ['a', 'b'], dependsOrder: 'sequence' };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
			'echo a && echo b'
		);
	});

	test('dependsOn missing in lookup is skipped, others still resolve', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'] };
		const task: ITaskEntry = { label: 'top', dependsOn: ['a', 'does-not-exist'] };
		assert.strictEqual(
			await resolveTaskCommand(task, { lookup: lookupFrom(a) }),
			'echo a'
		);
	});

	test('dependsOn cycles are broken by cycle-tracking', async () => {
		const a: ITaskEntry = { label: 'a', type: 'shell', command: 'echo', args: ['a'], dependsOn: 'b' };
		const b: ITaskEntry = { label: 'b', type: 'shell', command: 'echo', args: ['b'], dependsOn: 'a' };
		// Starting from `a`: a depends on b; b depends on a; a is already on the
		// stack so the inner reference contributes nothing — b resolves to its
		// own command, which then runs before a's own command.
		assert.strictEqual(
			await resolveTaskCommand(a, { lookup: lookupFrom(a, b) }),
			'echo b && echo a'
		);
	});

	test('nested dependencies resolve recursively', async () => {
		const leaf: ITaskEntry = { label: 'leaf', type: 'shell', command: 'echo', args: ['leaf'] };
		const mid: ITaskEntry = { label: 'mid', type: 'shell', command: 'echo', args: ['mid'], dependsOn: 'leaf' };
		const top: ITaskEntry = { label: 'top', type: 'shell', command: 'echo', args: ['top'], dependsOn: 'mid' };
		assert.strictEqual(
			await resolveTaskCommand(top, { lookup: lookupFrom(leaf, mid) }),
			'echo leaf && echo mid && echo top'
		);
	});

	test('dependsOn without lookup falls back to own command (or undefined)', async () => {
		const task: ITaskEntry = { label: 'top', type: 'shell', command: 'make', dependsOn: 'prep' };
		assert.strictEqual(await resolveTaskCommand(task), 'make');
		const taskNoOwn: ITaskEntry = { label: 'group', dependsOn: 'prep' };
		assert.strictEqual(await resolveTaskCommand(taskNoOwn), undefined);
	});

	test('resolveVariables is applied to args before quoting (plain path needs no quoting)', async () => {
		const resolveVariables = async (value: string) => value.replace('${workspaceFolder}', '/home/user/worktree');
		const task: ITaskEntry = {
			label: 'run',
			type: 'shell',
			command: './scripts/code.sh',
			args: ['--user-data-dir=${workspaceFolder}/.profile-oss'],
		};
		assert.strictEqual(
			await resolveTaskCommand(task, { resolveVariables }),
			'./scripts/code.sh --user-data-dir=/home/user/worktree/.profile-oss'
		);
	});

	test('resolveVariables result containing spaces is strong-quoted', async () => {
		const resolveVariables = async (value: string) => value.replace('${workspaceFolder}', '/Users/me/my worktree');
		const task: ITaskEntry = {
			label: 'run',
			type: 'shell',
			command: 'cat',
			args: ['${workspaceFolder}/file.txt'],
		};
		assert.strictEqual(
			await resolveTaskCommand(task, { resolveVariables }),
			`cat '/Users/me/my worktree/file.txt'`
		);
	});

	test('resolveVariables is applied to the command string', async () => {
		const resolveVariables = async (value: string) => value.replace('${workspaceRoot}', '/repo');
		const task: ITaskEntry = { label: 'run', type: 'shell', command: '${workspaceRoot}/scripts/code.sh' };
		assert.strictEqual(
			await resolveTaskCommand(task, { resolveVariables }),
			'/repo/scripts/code.sh'
		);
	});

	test('variables left untouched (and strong-quoted) when no resolveVariables hook provided', async () => {
		const task: ITaskEntry = { label: 'run', type: 'shell', command: 'echo', args: ['${workspaceFolder}'] };
		assert.strictEqual(await resolveTaskCommand(task), 'echo \'${workspaceFolder}\'');
	});
});

suite('osToTaskTargetOS', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps each OperatingSystem to its tasks.json key', async () => {
		assert.strictEqual(osToTaskTargetOS(OperatingSystem.Windows), 'windows');
		assert.strictEqual(osToTaskTargetOS(OperatingSystem.Macintosh), 'osx');
		assert.strictEqual(osToTaskTargetOS(OperatingSystem.Linux), 'linux');
	});
});
