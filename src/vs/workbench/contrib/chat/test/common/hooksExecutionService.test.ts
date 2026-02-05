/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { HookCommandResultKind, IHookCommandResult } from '../../common/hooks/hooksCommandTypes.js';
import { HooksExecutionService, IHooksExecutionProxy } from '../../common/hooks/hooksExecutionService.js';
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

		test('executes hook commands via proxy and returns semantic results', async () => {
			const proxy = createMockProxy((cmd) => ({
				kind: HookCommandResultKind.Success,
				result: `executed: ${cmd.command}`
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri, { input: 'test-input' });

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].success, true);
			assert.strictEqual(results[0].stopReason, undefined);
			assert.strictEqual(results[0].output, 'executed: echo test');
		});

		test('executes multiple hook commands in order', async () => {
			const executedCommands: string[] = [];
			const proxy = createMockProxy((cmd) => {
				executedCommands.push(cmd.command ?? '');
				return { kind: HookCommandResultKind.Success, result: 'ok' };
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

		test('wraps proxy errors in error result', async () => {
			const proxy = createMockProxy(() => {
				throw new Error('proxy failed');
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('fail')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].success, false);
			assert.strictEqual(results[0].output, 'proxy failed');
			// Error results still have default common fields
			assert.strictEqual(results[0].stopReason, undefined);
		});

		test('passes cancellation token to proxy', async () => {
			let receivedToken: CancellationToken | undefined;
			const proxy = createMockProxy((_cmd, _input, token) => {
				receivedToken = token;
				return { kind: HookCommandResultKind.Success, result: 'ok' };
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
				return { kind: HookCommandResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(receivedToken, CancellationToken.None);
		});

		test('extracts common fields from successful result', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					stopReason: 'User requested stop',
					systemMessage: 'Warning: hook triggered',
					hookSpecificOutput: {
						permissionDecision: 'allow'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].success, true);
			assert.strictEqual(results[0].stopReason, 'User requested stop');
			assert.strictEqual(results[0].messageForUser, 'Warning: hook triggered');
			// Hook-specific fields are in output with wrapper
			assert.deepStrictEqual(results[0].output, { hookSpecificOutput: { permissionDecision: 'allow' } });
		});

		test('uses defaults when no common fields present', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'allow'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].stopReason, undefined);
			assert.strictEqual(results[0].messageForUser, undefined);
			assert.deepStrictEqual(results[0].output, { hookSpecificOutput: { permissionDecision: 'allow' } });
		});

		test('handles error results from command', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Error,
				result: 'command failed with error'
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].success, false);
			assert.strictEqual(results[0].output, 'command failed with error');
			// Defaults are still applied
			assert.strictEqual(results[0].stopReason, undefined);
		});

		test('passes through hook-specific output fields for non-preToolUse hooks', async () => {
			// Stop hooks return different fields (decision, reason) than preToolUse hooks
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					decision: 'block',
					reason: 'Please run the tests'
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.Stop]: [cmd('check-stop')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.Stop, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].success, true);
			// Hook-specific fields should be in output, not undefined
			assert.deepStrictEqual(results[0].output, {
				decision: 'block',
				reason: 'Please run the tests'
			});
		});

		test('passes input to proxy', async () => {
			let receivedInput: unknown;
			const proxy = createMockProxy((_cmd, input) => {
				receivedInput = input;
				return { kind: HookCommandResultKind.Success, result: 'ok' };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const testInput = { foo: 'bar', nested: { value: 123 } };
			await service.executeHook(HookType.PreToolUse, sessionUri, { input: testInput });

			// Input includes caller properties merged with common hook properties
			assert.ok(typeof receivedInput === 'object' && receivedInput !== null);
			const input = receivedInput as Record<string, unknown>;
			assert.strictEqual(input['foo'], 'bar');
			assert.deepStrictEqual(input['nested'], { value: 123 });
			// Common properties are also present
			assert.strictEqual(typeof input['timestamp'], 'string');
			assert.strictEqual(input['hookEventName'], HookType.PreToolUse);
		});
	});

	function createMockProxy(handler?: (cmd: IHookCommand, input: unknown, token: CancellationToken) => IHookCommandResult): IHooksExecutionProxy {
		return {
			runHookCommand: async (hookCommand, input, token) => {
				if (handler) {
					return handler(hookCommand, input, token);
				}
				return { kind: HookCommandResultKind.Success, result: 'mock result' };
			}
		};
	}
});
