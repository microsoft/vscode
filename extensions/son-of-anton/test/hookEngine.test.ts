/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { HookEngine } from '../src/hooks/HookEngine';

suite('HookEngine', () => {
	let engine: HookEngine;

	setup(() => {
		engine = new HookEngine();
	});

	test('loads hooks from config', () => {
		engine.loadConfig({
			hooks: [
				{
					name: 'test-hook',
					trigger: 'onFileSave',
					filter: '**/*.ts',
					agent: 'anton-code',
					instruction: 'Lint the file',
					blocking: false,
				},
			],
		});

		assert.strictEqual(engine.getHooks().length, 1);
		assert.strictEqual(engine.getHooks()[0].name, 'test-hook');
	});

	test('getHooksForTrigger filters by trigger type', () => {
		engine.loadConfig({
			hooks: [
				{ name: 'hook-a', trigger: 'onFileSave', agent: 'a', instruction: 'a', blocking: false },
				{ name: 'hook-b', trigger: 'preCommit', agent: 'b', instruction: 'b', blocking: true },
				{ name: 'hook-c', trigger: 'onFileSave', agent: 'c', instruction: 'c', blocking: false },
			],
		});

		const fileSaveHooks = engine.getHooksForTrigger('onFileSave');
		assert.strictEqual(fileSaveHooks.length, 2);

		const preCommitHooks = engine.getHooksForTrigger('preCommit');
		assert.strictEqual(preCommitHooks.length, 1);
	});

	test('disableHook prevents hook from firing', () => {
		engine.loadConfig({
			hooks: [
				{ name: 'my-hook', trigger: 'preCommit', agent: 'a', instruction: 'a', blocking: true },
			],
		});

		engine.disableHook('my-hook');
		assert.strictEqual(engine.isDisabled('my-hook'), true);
	});

	test('enableHook re-enables a disabled hook', () => {
		engine.disableHook('my-hook');
		engine.enableHook('my-hook');
		assert.strictEqual(engine.isDisabled('my-hook'), false);
	});

	test('triggerPreCommit returns true when no hooks match', async () => {
		engine.loadConfig({ hooks: [] });
		const result = await engine.triggerPreCommit(['file.ts']);
		assert.strictEqual(result, true);
	});

	test('triggerPreCommit calls invoke callback', async () => {
		const invoked: string[] = [];

		engine.loadConfig({
			hooks: [
				{ name: 'pre-commit-scan', trigger: 'preCommit', agent: 'anton-security', instruction: 'Scan', blocking: true },
			],
		});

		engine.setInvokeCallback(async (hook) => {
			invoked.push(hook.name);
			return { success: true };
		});

		const result = await engine.triggerPreCommit(['file.ts']);
		assert.strictEqual(result, true);
		assert.deepStrictEqual(invoked, ['pre-commit-scan']);
	});

	test('triggerPreCommit returns false when blocking hook fails', async () => {
		engine.loadConfig({
			hooks: [
				{ name: 'blocker', trigger: 'preCommit', agent: 'a', instruction: 'a', blocking: true },
			],
		});

		engine.setInvokeCallback(async () => ({ success: false, message: 'Security issue found' }));

		const result = await engine.triggerPreCommit(['file.ts']);
		assert.strictEqual(result, false);
	});

	test('triggerPreCommit skips disabled hooks', async () => {
		engine.loadConfig({
			hooks: [
				{ name: 'disabled-hook', trigger: 'preCommit', agent: 'a', instruction: 'a', blocking: true },
			],
		});

		engine.disableHook('disabled-hook');
		engine.setInvokeCallback(async () => ({ success: false }));

		const result = await engine.triggerPreCommit(['file.ts']);
		assert.strictEqual(result, true);
	});

	test('onDidExecuteHook fires after hook execution', async () => {
		const results: string[] = [];

		engine.loadConfig({
			hooks: [
				{ name: 'test-hook', trigger: 'preCommit', agent: 'a', instruction: 'a', blocking: false },
			],
		});

		engine.setInvokeCallback(async () => ({ success: true }));
		engine.onDidExecuteHook(result => results.push(result.hookName));

		await engine.triggerPreCommit([]);
		assert.deepStrictEqual(results, ['test-hook']);
	});
});
