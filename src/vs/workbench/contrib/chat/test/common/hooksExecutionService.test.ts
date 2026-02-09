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
		service = store.add(new HooksExecutionService(new NullLogService(), createMockOutputService()));
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
			assert.strictEqual(results[0].resultKind, 'success');
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
			assert.strictEqual(results[0].resultKind, 'error');
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
			assert.strictEqual(results[0].resultKind, 'success');
			assert.strictEqual(results[0].stopReason, 'User requested stop');
			assert.strictEqual(results[0].warningMessage, 'Warning: hook triggered');
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
			assert.strictEqual(results[0].warningMessage, undefined);
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
			assert.strictEqual(results[0].resultKind, 'error');
			assert.strictEqual(results[0].output, 'command failed with error');
			// Defaults are still applied
			assert.strictEqual(results[0].stopReason, undefined);
		});

		test('handles non-blocking error results from command', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.NonBlockingError,
				result: 'non-blocking warning message'
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].resultKind, 'warning');
			assert.strictEqual(results[0].output, undefined);
			assert.strictEqual(results[0].warningMessage, 'non-blocking warning message');
			assert.strictEqual(results[0].stopReason, undefined);
		});

		test('handles non-blocking error with object result', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.NonBlockingError,
				result: { code: 'WARN_001', message: 'Something went wrong' }
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('echo test')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const results = await service.executeHook(HookType.PreToolUse, sessionUri);

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].resultKind, 'warning');
			assert.strictEqual(results[0].output, undefined);
			assert.strictEqual(results[0].warningMessage, '{"code":"WARN_001","message":"Something went wrong"}');
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
			assert.strictEqual(results[0].resultKind, 'success');
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

	suite('executePreToolUseHook', () => {
		test('returns allow result when hook allows', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'allow',
						permissionDecisionReason: 'Tool is safe'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'allow');
			assert.strictEqual(result.permissionDecisionReason, 'Tool is safe');
		});

		test('returns ask result when hook requires confirmation', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'ask',
						permissionDecisionReason: 'Requires user approval'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'ask');
			assert.strictEqual(result.permissionDecisionReason, 'Requires user approval');
		});

		test('deny takes priority over ask and allow', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				// First hook returns allow, second returns ask, third returns deny
				if (callCount === 1) {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'allow' } }
					};
				} else if (callCount === 2) {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'ask' } }
					};
				} else {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'Blocked' } }
					};
				}
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook1'), cmd('hook2'), cmd('hook3')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'deny');
			assert.strictEqual(result.permissionDecisionReason, 'Blocked');
		});

		test('ask takes priority over allow', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				// First hook returns allow, second returns ask
				if (callCount === 1) {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'allow' } }
					};
				} else {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Need confirmation' } }
					};
				}
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook1'), cmd('hook2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'ask');
			assert.strictEqual(result.permissionDecisionReason, 'Need confirmation');
		});

		test('ignores results with wrong hookEventName', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				if (callCount === 1) {
					// First hook returns allow but with wrong hookEventName
					return {
						kind: HookCommandResultKind.Success,
						result: {
							hookSpecificOutput: {
								hookEventName: 'PostToolUse',  // Wrong hook type
								permissionDecision: 'deny'
							}
						}
					};
				} else {
					// Second hook returns allow with correct hookEventName
					return {
						kind: HookCommandResultKind.Success,
						result: {
							hookSpecificOutput: {
								hookEventName: 'PreToolUse',
								permissionDecision: 'allow'
							}
						}
					};
				}
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook1'), cmd('hook2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			// The deny with wrong hookEventName should be ignored
			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'allow');
		});

		test('allows results without hookEventName (optional field)', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						// No hookEventName - should be accepted
						permissionDecision: 'allow'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'allow');
		});

		test('returns updatedInput when hook provides it', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'allow',
						updatedInput: { path: '/safe/path.ts' }
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: { path: '/original/path.ts' }, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'allow');
			assert.deepStrictEqual(result.updatedInput, { path: '/safe/path.ts' });
		});

		test('later hook updatedInput overrides earlier one', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				if (callCount === 1) {
					return {
						kind: HookCommandResultKind.Success,
						result: { hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { value: 'first' } } }
					};
				}
				return {
					kind: HookCommandResultKind.Success,
					result: { hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { value: 'second' } } }
				};
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook1'), cmd('hook2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.deepStrictEqual(result.updatedInput, { value: 'second' });
		});

		test('returns result with updatedInput even without permission decision', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						updatedInput: { modified: true }
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.deepStrictEqual(result.updatedInput, { modified: true });
			assert.strictEqual(result.permissionDecision, undefined);
		});

		test('updatedInput combined with ask shows modified input to user', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'ask',
						permissionDecisionReason: 'Modified input needs review',
						updatedInput: { command: 'echo safe' }
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: { command: 'rm -rf /' }, toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.permissionDecision, 'ask');
			assert.strictEqual(result.permissionDecisionReason, 'Modified input needs review');
			assert.deepStrictEqual(result.updatedInput, { command: 'echo safe' });
		});
	});

	suite('executePostToolUseHook', () => {
		test('returns undefined when no hooks configured', async () => {
			const proxy = createMockProxy();
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, getToolResponseText: () => 'tool output', toolCallId: 'call-1' }
			);

			assert.strictEqual(result, undefined);
		});

		test('returns block decision when hook blocks', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					decision: 'block',
					reason: 'Lint errors found'
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, getToolResponseText: () => 'tool output', toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.decision, 'block');
			assert.strictEqual(result.reason, 'Lint errors found');
		});

		test('returns additionalContext from hookSpecificOutput', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						hookEventName: 'PostToolUse',
						additionalContext: 'File was modified successfully'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, getToolResponseText: () => 'tool output', toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.deepStrictEqual(result.additionalContext, ['File was modified successfully']);
			assert.strictEqual(result.decision, undefined);
		});

		test('block takes priority and collects all additionalContext', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				if (callCount === 1) {
					return {
						kind: HookCommandResultKind.Success,
						result: {
							decision: 'block',
							reason: 'Tests failed'
						}
					};
				} else {
					return {
						kind: HookCommandResultKind.Success,
						result: {
							hookSpecificOutput: {
								additionalContext: 'Extra context from second hook'
							}
						}
					};
				}
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('hook1'), cmd('hook2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, getToolResponseText: () => 'tool output', toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.strictEqual(result.decision, 'block');
			assert.strictEqual(result.reason, 'Tests failed');
			assert.deepStrictEqual(result.additionalContext, ['Extra context from second hook']);
		});

		test('ignores results with wrong hookEventName', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				if (callCount === 1) {
					return {
						kind: HookCommandResultKind.Success,
						result: {
							hookSpecificOutput: {
								hookEventName: 'PreToolUse',
								additionalContext: 'Should be ignored'
							}
						}
					};
				} else {
					return {
						kind: HookCommandResultKind.Success,
						result: {
							hookSpecificOutput: {
								hookEventName: 'PostToolUse',
								additionalContext: 'Correct context'
							}
						}
					};
				}
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('hook1'), cmd('hook2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'test-tool', toolInput: {}, getToolResponseText: () => 'tool output', toolCallId: 'call-1' }
			);

			assert.ok(result);
			assert.deepStrictEqual(result.additionalContext, ['Correct context']);
		});

		test('passes tool response text as string to external command', async () => {
			let receivedInput: unknown;
			const proxy = createMockProxy((_cmd, input) => {
				receivedInput = input;
				return { kind: HookCommandResultKind.Success, result: {} };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'my-tool', toolInput: { arg: 'val' }, getToolResponseText: () => 'file contents here', toolCallId: 'call-42' }
			);

			assert.ok(typeof receivedInput === 'object' && receivedInput !== null);
			const input = receivedInput as Record<string, unknown>;
			assert.strictEqual(input['tool_name'], 'my-tool');
			assert.deepStrictEqual(input['tool_input'], { arg: 'val' });
			assert.strictEqual(input['tool_response'], 'file contents here');
			assert.strictEqual(input['tool_use_id'], 'call-42');
			assert.strictEqual(input['hookEventName'], HookType.PostToolUse);
		});

		test('does not call getter when no PostToolUse hooks registered', async () => {
			const proxy = createMockProxy();
			service.setProxy(proxy);

			// Register hooks only for PreToolUse, not PostToolUse
			const hooks = { [HookType.PreToolUse]: [cmd('hook')] };
			store.add(service.registerHooks(sessionUri, hooks));

			let getterCalled = false;
			const result = await service.executePostToolUseHook(
				sessionUri,
				{
					toolName: 'test-tool',
					toolInput: {},
					getToolResponseText: () => { getterCalled = true; return ''; },
					toolCallId: 'call-1'
				}
			);

			assert.strictEqual(result, undefined);
			assert.strictEqual(getterCalled, false);
		});
	});

	suite('preToolUse smoke tests — input → output', () => {
		test('single hook: allow', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'allow',
						permissionDecisionReason: 'Trusted tool',
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('lint-check')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const input = { toolName: 'readFile', toolInput: { path: '/src/index.ts' }, toolCallId: 'call-1' };
			const result = await service.executePreToolUseHook(sessionUri, input);

			assert.deepStrictEqual(
				JSON.stringify({ permissionDecision: result?.permissionDecision, permissionDecisionReason: result?.permissionDecisionReason, additionalContext: result?.additionalContext }),
				JSON.stringify({ permissionDecision: 'allow', permissionDecisionReason: 'Trusted tool', additionalContext: undefined })
			);
		});

		test('single hook: deny', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						permissionDecision: 'deny',
						permissionDecisionReason: 'Path is outside workspace',
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('path-guard')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const input = { toolName: 'writeFile', toolInput: { path: '/etc/passwd' }, toolCallId: 'call-2' };
			const result = await service.executePreToolUseHook(sessionUri, input);

			assert.deepStrictEqual(
				JSON.stringify({ permissionDecision: result?.permissionDecision, permissionDecisionReason: result?.permissionDecisionReason }),
				JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: 'Path is outside workspace' })
			);
		});

		test('multiple hooks: deny wins over allow and ask', async () => {
			// Three hooks return allow, ask, deny (in that order).
			// deny must win regardless of ordering.
			let callCount = 0;
			const decisions = ['allow', 'ask', 'deny'] as const;
			const proxy = createMockProxy(() => {
				const decision = decisions[callCount++];
				return {
					kind: HookCommandResultKind.Success,
					result: { hookSpecificOutput: { permissionDecision: decision, permissionDecisionReason: `hook-${callCount}` } }
				};
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('h1'), cmd('h2'), cmd('h3')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'runCommand', toolInput: { cmd: 'rm -rf /' }, toolCallId: 'call-3' }
			);

			assert.deepStrictEqual(
				JSON.stringify({ permissionDecision: result?.permissionDecision, permissionDecisionReason: result?.permissionDecisionReason }),
				JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: 'hook-3' })
			);
		});

		test('multiple hooks: ask wins over allow', async () => {
			let callCount = 0;
			const decisions = ['allow', 'ask'] as const;
			const proxy = createMockProxy(() => {
				const decision = decisions[callCount++];
				return {
					kind: HookCommandResultKind.Success,
					result: { hookSpecificOutput: { permissionDecision: decision, permissionDecisionReason: `reason-${decision}` } }
				};
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PreToolUse]: [cmd('h1'), cmd('h2')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePreToolUseHook(
				sessionUri,
				{ toolName: 'exec', toolInput: {}, toolCallId: 'call-4' }
			);

			assert.deepStrictEqual(
				JSON.stringify({ permissionDecision: result?.permissionDecision, permissionDecisionReason: result?.permissionDecisionReason }),
				JSON.stringify({ permissionDecision: 'ask', permissionDecisionReason: 'reason-ask' })
			);
		});
	});

	suite('postToolUse smoke tests — input → output', () => {
		test('single hook: block', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					decision: 'block',
					reason: 'Lint errors found'
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('lint')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const input = { toolName: 'writeFile', toolInput: { path: 'foo.ts' }, getToolResponseText: () => 'wrote 42 bytes', toolCallId: 'call-5' };
			const result = await service.executePostToolUseHook(sessionUri, input);

			assert.deepStrictEqual(
				JSON.stringify({ decision: result?.decision, reason: result?.reason, additionalContext: result?.additionalContext }),
				JSON.stringify({ decision: 'block', reason: 'Lint errors found', additionalContext: undefined })
			);
		});

		test('single hook: additionalContext only', async () => {
			const proxy = createMockProxy(() => ({
				kind: HookCommandResultKind.Success,
				result: {
					hookSpecificOutput: {
						additionalContext: 'Tests still pass after this edit'
					}
				}
			}));
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('test-runner')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const input = { toolName: 'editFile', toolInput: {}, getToolResponseText: () => 'ok', toolCallId: 'call-6' };
			const result = await service.executePostToolUseHook(sessionUri, input);

			assert.deepStrictEqual(
				JSON.stringify({ decision: result?.decision, reason: result?.reason, additionalContext: result?.additionalContext }),
				JSON.stringify({ decision: undefined, reason: undefined, additionalContext: ['Tests still pass after this edit'] })
			);
		});

		test('multiple hooks: block wins and all hooks run', async () => {
			let callCount = 0;
			const proxy = createMockProxy(() => {
				callCount++;
				if (callCount === 1) {
					return { kind: HookCommandResultKind.Success, result: { decision: 'block', reason: 'Tests failed' } };
				}
				return { kind: HookCommandResultKind.Success, result: { hookSpecificOutput: { additionalContext: 'context from second hook' } } };
			});
			service.setProxy(proxy);

			const hooks = { [HookType.PostToolUse]: [cmd('test'), cmd('lint')] };
			store.add(service.registerHooks(sessionUri, hooks));

			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 'writeFile', toolInput: {}, getToolResponseText: () => 'data', toolCallId: 'call-7' }
			);

			assert.deepStrictEqual(
				JSON.stringify({ decision: result?.decision, reason: result?.reason, additionalContext: result?.additionalContext }),
				JSON.stringify({ decision: 'block', reason: 'Tests failed', additionalContext: ['context from second hook'] })
			);
		});

		test('no hooks registered → undefined (getter never called)', async () => {
			const proxy = createMockProxy();
			service.setProxy(proxy);

			// Register PreToolUse only — no PostToolUse
			store.add(service.registerHooks(sessionUri, { [HookType.PreToolUse]: [cmd('h')] }));

			let getterCalled = false;
			const result = await service.executePostToolUseHook(
				sessionUri,
				{ toolName: 't', toolInput: {}, getToolResponseText: () => { getterCalled = true; return ''; }, toolCallId: 'c' }
			);

			assert.strictEqual(result, undefined);
			assert.strictEqual(getterCalled, false);
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
