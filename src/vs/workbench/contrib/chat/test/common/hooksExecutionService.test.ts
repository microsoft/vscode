/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { HookResultKind, HooksExecutionService, IHookResult, IHooksExecutionProxy } from '../../common/hooksExecutionService.js';
import { HookType, IHookCommand } from '../../common/promptSyntax/hookSchema.js';
import { IOutputChannel, IOutputService } from '../../../../services/output/common/output.js';

function cmd(command: string): IHookCommand {
	return { type: 'command', command, cwd: URI.file('/') };
}

function createMockOutputService(): IOutputService {
	const mockChannel: Partial<IOutputChannel> = {
		append: () => { },
	};
	return {
		_serviceBrand: undefined,
		getChannel: () => mockChannel as IOutputChannel,
	} as unknown as IOutputService;
}

suite('HooksExecutionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: HooksExecutionService;
	const sessionUri = URI.file('/test/session');

	setup(() => {
		service = new HooksExecutionService(new NullLogService(), createMockOutputService());
	});

	suite('registerHooks', () => {
		test('registers hooks for a session', () => {
			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			assert.strictEqual(service.getHooksForSession(sessionUri), hooks);
		});

		test('returns disposable that unregisters hooks', () => {
			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			const disposable = service.registerHooks(sessionUri, hooks);

			assert.strictEqual(service.getHooksForSession(sessionUri), hooks);

			disposable.dispose();

			assert.strictEqual(service.getHooksForSession(sessionUri), undefined);
		});

		test('different sessions have independent hooks', () => {
			const session1 = URI.file('/test/session1');
			const session2 = URI.file('/test/session2');
			const hooks1 = { [HookType.PreToolUse]: [cmd('echo 1')] };
			const hooks2 = { [HookType.PostToolUse]: [cmd('echo 2')] };

			store.add(service.registerHooks(session1, hooks1));
			store.add(service.registerHooks(session2, hooks2));

			assert.strictEqual(service.getHooksForSession(session1), hooks1);
			assert.strictEqual(service.getHooksForSession(session2), hooks2);
		});
	});

	suite('getHooksForSession', () => {
		test('returns undefined for unregistered session', () => {
			assert.strictEqual(service.getHooksForSession(sessionUri), undefined);
		});
	});

	suite('executeHook', () => {
		test('returns empty array when no proxy set', async () => {
			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);
			assert.deepStrictEqual(results, []);
		});

		test('returns empty array when no hooks registered for session', async () => {
			const proxy = createMockProxy();
			service.setProxy(proxy);

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);
			assert.deepStrictEqual(results, []);
		});

		test('returns empty array when no hooks of requested type', async () => {
			const proxy = createMockProxy();
			service.setProxy(proxy);
			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PostToolUse, sessionUri);
			assert.deepStrictEqual(results, []);
		});

		test('executes hook commands via proxy and returns results', async () => {
			const proxyResults: IHookResult[] = [];
			const proxy = createMockProxy((cmd) => {
				const result: IHookResult = { kind: HookResultKind.Success, result: `executed: ${cmd.command}` };
				proxyResults.push(result);
				return result;
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri, { input: 'test-input' });

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].kind, HookResultKind.Success);
			assert.strictEqual(results[0].result, 'executed: echo test');
		});

		test('executes multiple hook commands in order', async () => {
			const executedCommands: string[] = [];
			const proxy = createMockProxy((cmd) => {
				executedCommands.push(cmd.command ?? '');
				return { kind: HookResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = {
				[HookType.PreToolUse]: [cmd('cmd1'), cmd('cmd2'), cmd('cmd3')]
			};
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 3);
			assert.deepStrictEqual(executedCommands, ['cmd1', 'cmd2', 'cmd3']);
		});

		test('wraps proxy errors in HookResultKind.Error', async () => {
			const proxy = createMockProxy(() => {
				throw new Error('proxy failed');
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('fail')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].kind, HookResultKind.Error);
			assert.strictEqual(results[0].result, 'proxy failed');
		});

		test('passes cancellation token to proxy', async () => {
			let receivedToken: CancellationToken | undefined;
			const proxy = createMockProxy((_cmd, _input, token) => {
				receivedToken = token;
				return { kind: HookResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const cts = store.add(new CancellationTokenSource());
			await service.executeHook(HookType.PreToolUse, sessionUri, { token: cts.token });

			assert.strictEqual(receivedToken, cts.token);
		});

		test('uses CancellationToken.None when no token provided', async () => {
			let receivedToken: CancellationToken | undefined;
			const proxy = createMockProxy((_cmd, _input, token) => {
				receivedToken = token;
				return { kind: HookResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(receivedToken, CancellationToken.None);
		});

		test('passes input to proxy', async () => {
			let receivedInput: unknown;
			const proxy = createMockProxy((_cmd, input) => {
				receivedInput = input;
				return { kind: HookResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const testInput = { foo: 'bar', nested: { value: 123 } };
			await service.executeHook(HookType.PreToolUse, sessionUri, { input: testInput });

			assert.deepStrictEqual(receivedInput, testInput);
		});
	});

	function createMockProxy(handler?: (cmd: IHookCommand, input: unknown, token: CancellationToken) => IHookResult): IHooksExecutionProxy {
		return {
			runHookCommand: async (hookCommand, input, token) => {
				if (handler) {
					return handler(hookCommand, input, token);
				}
				return { kind: HookResultKind.Success, result: 'mock result' };
			}
		};
	}
});
