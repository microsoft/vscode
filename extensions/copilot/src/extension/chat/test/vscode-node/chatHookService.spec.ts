/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatHookCommand, ChatHookResult, ChatHookResultKind, ChatRequestHooks, Uri } from 'vscode';
import { IPostToolUseHookResult, IPreToolUseHookResult } from '../../../../platform/chat/common/chatHookService';
import { HookCommandResultKind, IHookCommandResult } from '../../../../platform/chat/common/hookExecutor';
import { IToolValidationResult } from '../../../tools/common/toolsService';
import { isCompatibleHookEventName } from '../../vscode-node/chatHookService';

function cmd(command: string, cwd?: Uri): ChatHookCommand {
	return { command, cwd } as ChatHookCommand;
}

/**
 * A testable version of ChatHookService.executeHook logic,
 * reimplemented here to stay within the layering constraints.
 * This mirrors the real implementation's result conversion and iteration logic.
 */
class TestableExecuteHookService {
	public executorCalls: Array<{ hookCommand: ChatHookCommand; input: unknown }> = [];
	public executorHandler: (hookCommand: ChatHookCommand, input: unknown) => IHookCommandResult = () => ({ kind: HookCommandResultKind.Success, result: '' });
	public transcriptPath: Uri | undefined;
	public flushedSessionIds: string[] = [];

	async executeHook(hookType: string, hooks: ChatRequestHooks | undefined, input: unknown, sessionId?: string): Promise<ChatHookResult[]> {
		if (!hooks) {
			return [];
		}

		const hookCommands = hooks[hookType];
		if (!hookCommands || hookCommands.length === 0) {
			return [];
		}

		if (sessionId) {
			this.flushedSessionIds.push(sessionId);
		}

		const commonInput = {
			timestamp: new Date().toISOString(),
			hook_event_name: hookType,
			...(sessionId ? { session_id: sessionId } : undefined),
			...(this.transcriptPath ? { transcript_path: this.transcriptPath } : undefined),
		};
		const fullInput = (typeof input === 'object' && input !== null)
			? { ...commonInput, ...input }
			: commonInput;

		const results: ChatHookResult[] = [];

		for (const hookCommand of hookCommands) {
			try {
				const commandInput = hookCommand.cwd
					? { ...fullInput, cwd: hookCommand.cwd }
					: fullInput;
				this.executorCalls.push({ hookCommand, input: commandInput });
				const commandResult = this.executorHandler(hookCommand, commandInput);
				const result = this._toHookResult(hookType, commandResult);
				results.push(result);

				if (result.stopReason !== undefined) {
					break;
				}
			} catch (err) {
				results.push({
					resultKind: 'warning',
					output: undefined,
					warningMessage: err instanceof Error ? err.message : String(err),
				});
			}
		}

		return results;
	}

	private _toHookResult(hookType: string, commandResult: IHookCommandResult): ChatHookResult {
		switch (commandResult.kind) {
			case HookCommandResultKind.Error: {
				const message = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
				return { resultKind: 'error', output: message };
			}
			case HookCommandResultKind.NonBlockingError: {
				const errorMessage = typeof commandResult.result === 'string' ? commandResult.result : JSON.stringify(commandResult.result);
				return { resultKind: 'warning', output: undefined, warningMessage: errorMessage };
			}
			case HookCommandResultKind.Success: {
				if (typeof commandResult.result !== 'object') {
					return { resultKind: 'success', output: commandResult.result };
				}

				const resultObj = commandResult.result as Record<string, unknown>;
				const stopReason = typeof resultObj['stopReason'] === 'string' ? resultObj['stopReason'] : undefined;
				const continueFlag = resultObj['continue'];
				const systemMessage = typeof resultObj['systemMessage'] === 'string' ? resultObj['systemMessage'] : undefined;

				let effectiveStopReason = stopReason;
				if (continueFlag === false && !effectiveStopReason) {
					effectiveStopReason = '';
				}

				// Check hookEventName at top level — if present and mismatched, skip this result
				const topLevelHookEventName = resultObj['hookEventName'];
				if (typeof topLevelHookEventName === 'string' && !isCompatibleHookEventName(topLevelHookEventName, hookType)) {
					return { resultKind: 'success', output: undefined };
				}

				// Check hookEventName inside hookSpecificOutput — if mismatched, strip hookSpecificOutput but keep the rest
				let stripHookSpecificOutput = false;
				const hookSpecificOutput = resultObj['hookSpecificOutput'];
				if (typeof hookSpecificOutput === 'object' && hookSpecificOutput !== null) {
					const nestedHookEventName = (hookSpecificOutput as Record<string, unknown>)['hookEventName'];
					if (typeof nestedHookEventName === 'string' && !isCompatibleHookEventName(nestedHookEventName, hookType)) {
						stripHookSpecificOutput = true;
					}
				}

				const commonFields = new Set(['continue', 'stopReason', 'systemMessage']);
				if (stripHookSpecificOutput) {
					commonFields.add('hookSpecificOutput');
				}
				const hookOutput: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(resultObj)) {
					if (value !== undefined && !commonFields.has(key)) {
						hookOutput[key] = value;
					}
				}

				return {
					resultKind: 'success',
					stopReason: effectiveStopReason,
					warningMessage: systemMessage,
					output: Object.keys(hookOutput).length > 0 ? hookOutput : undefined,
				};
			}
			default:
				return { resultKind: 'warning', warningMessage: `Unexpected hook command result kind: ${(commandResult as IHookCommandResult).kind}`, output: undefined };
		}
	}
}

describe('ChatHookService.executeHook', () => {
	let service: TestableExecuteHookService;

	beforeEach(() => {
		service = new TestableExecuteHookService();
	});

	it('returns empty array when hooks is undefined', async () => {
		const results = await service.executeHook('Stop', undefined, {});
		expect(results).toEqual([]);
	});

	it('returns empty array when no commands for hook type', async () => {
		const results = await service.executeHook('Stop', { PreToolUse: [cmd('echo test')] }, {});
		expect(results).toEqual([]);
	});

	it('executes hook and returns success result', async () => {
		service.executorHandler = () => ({ kind: HookCommandResultKind.Success, result: { decision: 'block', reason: 'test' } });
		const results = await service.executeHook('Stop', { Stop: [cmd('echo test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toEqual({ decision: 'block', reason: 'test' });
	});

	it('converts exit code 2 to error result with message in output', async () => {
		service.executorHandler = () => ({ kind: HookCommandResultKind.Error, result: 'fatal error' });
		const results = await service.executeHook('Stop', { Stop: [cmd('fail')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('error');
		expect(results[0].output).toBe('fatal error');
		expect(results[0].stopReason).toBeUndefined();
	});

	it('does not stop processing on error results (callers decide)', async () => {
		let callCount = 0;
		service.executorHandler = () => {
			callCount++;
			if (callCount === 1) {
				return { kind: HookCommandResultKind.Error, result: 'error from first' };
			}
			return { kind: HookCommandResultKind.Success, result: 'second ok' };
		};
		const results = await service.executeHook('Stop', { Stop: [cmd('first'), cmd('second')] }, {});

		expect(results).toHaveLength(2);
		expect(callCount).toBe(2);
		expect(results[0].resultKind).toBe('error');
		expect(results[1].resultKind).toBe('success');
	});

	it('converts non-blocking error to warning', async () => {
		service.executorHandler = () => ({ kind: HookCommandResultKind.NonBlockingError, result: 'warning msg' });
		const results = await service.executeHook('Stop', { Stop: [cmd('warn')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('warning');
		expect(results[0].warningMessage).toBe('warning msg');
		expect(results[0].stopReason).toBeUndefined();
	});

	it('stops processing after first hook with stopReason', async () => {
		let callCount = 0;
		service.executorHandler = () => {
			callCount++;
			if (callCount === 1) {
				return { kind: HookCommandResultKind.Success, result: { stopReason: 'stop here' } };
			}
			return { kind: HookCommandResultKind.Success, result: 'second' };
		};
		const results = await service.executeHook('Stop', { Stop: [cmd('first'), cmd('second')] }, {});

		expect(results).toHaveLength(1);
		expect(callCount).toBe(1);
		expect(results[0].stopReason).toBe('stop here');
	});

	it('stops processing on empty string stopReason (continue: false)', async () => {
		let callCount = 0;
		service.executorHandler = () => {
			callCount++;
			return { kind: HookCommandResultKind.Success, result: { continue: false } };
		};
		const results = await service.executeHook('Stop', { Stop: [cmd('first'), cmd('second')] }, {});

		expect(results).toHaveLength(1);
		expect(callCount).toBe(1);
		expect(results[0].stopReason).toBe('');
	});

	it('catches executor errors and returns warning', async () => {
		service.executorHandler = () => { throw new Error('spawn failed'); };
		const results = await service.executeHook('Stop', { Stop: [cmd('fail')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('warning');
		expect(results[0].warningMessage).toBe('spawn failed');
	});

	it('includes sessionId in common input', async () => {
		service.executorHandler = () => ({ kind: HookCommandResultKind.Success, result: '' });
		await service.executeHook('Stop', { Stop: [cmd('test')] }, {}, 'session-123');

		expect(service.executorCalls[0].input).toMatchObject({ session_id: 'session-123', hook_event_name: 'Stop' });
	});

	it('includes cwd from hook command in input', async () => {
		const cwdUri = { scheme: 'file', path: '/my/project' } as Uri;
		service.executorHandler = () => ({ kind: HookCommandResultKind.Success, result: '' });
		await service.executeHook('Stop', { Stop: [cmd('test', cwdUri)] }, {});

		expect(service.executorCalls[0].input).toMatchObject({ cwd: cwdUri });
	});

	it('merges caller input with common input', async () => {
		service.executorHandler = () => ({ kind: HookCommandResultKind.Success, result: '' });
		await service.executeHook('PreToolUse', { PreToolUse: [cmd('test')] }, { tool_name: 'myTool', tool_input: { x: 1 } });

		const input = service.executorCalls[0].input as Record<string, unknown>;
		expect(input['tool_name']).toBe('myTool');
		expect(input['tool_input']).toEqual({ x: 1 });
		expect(input['hook_event_name']).toBe('PreToolUse');
		expect(typeof input['timestamp']).toBe('string');
	});

	it('includes transcript_path when configured', async () => {
		const transcriptUri = { scheme: 'file', path: '/tmp/transcript.jsonl' } as Uri;
		service.transcriptPath = transcriptUri;
		service.executorHandler = () => ({ kind: HookCommandResultKind.Success, result: '' });
		await service.executeHook('Stop', { Stop: [cmd('test')] }, {}, 'session-1');

		expect(service.flushedSessionIds).toContain('session-1');
		expect(service.executorCalls[0].input).toMatchObject({ transcript_path: transcriptUri });
	});

	it('extracts systemMessage as warningMessage', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { systemMessage: 'be careful' },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results[0].warningMessage).toBe('be careful');
	});

	it('separates common fields from hook-specific output', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { continue: true, systemMessage: 'msg', decision: 'block', reason: 'test' },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results[0].output).toEqual({ decision: 'block', reason: 'test' });
		expect(results[0].warningMessage).toBe('msg');
		expect(results[0].stopReason).toBeUndefined();
	});

	it('executes multiple hooks in sequence', async () => {
		const commands: string[] = [];
		service.executorHandler = (hookCmd) => {
			commands.push(hookCmd.command);
			return { kind: HookCommandResultKind.Success, result: '' };
		};
		const results = await service.executeHook('Stop', { Stop: [cmd('a'), cmd('b'), cmd('c')] }, {});

		expect(results).toHaveLength(3);
		expect(commands).toEqual(['a', 'b', 'c']);
	});

	it('filters out results with mismatched top-level hookEventName', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookEventName: 'PreToolUse', decision: 'block', reason: 'wrong event' },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toBeUndefined();
	});

	it('strips hookSpecificOutput with mismatched nested hookEventName but keeps other fields', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'PostToolUse', permissionDecision: 'deny' }, decision: 'block', reason: 'kept' },
		});
		const results = await service.executeHook('PreToolUse', { PreToolUse: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toEqual({ decision: 'block', reason: 'kept' });
	});

	it('discards entire output when hookSpecificOutput is the only non-common field and hookEventName mismatches', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'PostToolUse', permissionDecision: 'deny' } },
		});
		const results = await service.executeHook('PreToolUse', { PreToolUse: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toBeUndefined();
	});

	it('allows results with matching hookEventName', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookEventName: 'Stop', decision: 'block', reason: 'correct event' },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].output).toEqual({ hookEventName: 'Stop', decision: 'block', reason: 'correct event' });
	});

	it('allows results without hookEventName', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { decision: 'block', reason: 'no event name' },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].output).toEqual({ decision: 'block', reason: 'no event name' });
	});

	it('treats Stop hookEventName as compatible with SubagentStop hook type', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason: 'tests failing' } },
		});
		const results = await service.executeHook('SubagentStop', { SubagentStop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toEqual({ hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason: 'tests failing' } });
	});

	it('does NOT treat SubagentStop hookEventName as compatible with Stop hook type', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'SubagentStop', decision: 'block', reason: 'not done' } },
		});
		const results = await service.executeHook('Stop', { Stop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		// hookSpecificOutput should be stripped because SubagentStop -> Stop is not compatible
		expect(results[0].output).toBeUndefined();
	});

	it('treats SessionStart hookEventName as compatible with SubagentStart hook type', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'context' } },
		});
		const results = await service.executeHook('SubagentStart', { SubagentStart: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toEqual({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'context' } });
	});

	it('does NOT treat SubagentStart hookEventName as compatible with SessionStart hook type', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: 'context' } },
		});
		const results = await service.executeHook('SessionStart', { SessionStart: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		// hookSpecificOutput should be stripped because SubagentStart -> SessionStart is not compatible
		expect(results[0].output).toBeUndefined();
	});

	it('treats top-level Stop hookEventName as compatible with SubagentStop', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookEventName: 'Stop', decision: 'block', reason: 'from stop hook' },
		});
		const results = await service.executeHook('SubagentStop', { SubagentStop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toEqual({ hookEventName: 'Stop', decision: 'block', reason: 'from stop hook' });
	});

	it('still strips hookSpecificOutput when hookEventName is truly incompatible', async () => {
		service.executorHandler = () => ({
			kind: HookCommandResultKind.Success,
			result: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } },
		});
		const results = await service.executeHook('SubagentStop', { SubagentStop: [cmd('test')] }, {});

		expect(results).toHaveLength(1);
		expect(results[0].resultKind).toBe('success');
		expect(results[0].output).toBeUndefined();
	});
});

/**
 * Minimal mock of ChatHookService that exposes executePreToolUseHook
 * without requiring the real vscode API.
 *
 * We replicate the collapsing logic from ChatHookService.executePreToolUseHook
 * by subclassing and overriding executeHook to return configurable results.
 */

interface IPreToolUseHookSpecificOutput {
	hookEventName?: string;
	permissionDecision?: 'allow' | 'deny' | 'ask';
	permissionDecisionReason?: string;
	updatedInput?: object;
	additionalContext?: string;
}

const permissionPriority: Record<string, number> = { 'deny': 2, 'ask': 1, 'allow': 0 };

/**
 * A testable version of the executePreToolUseHook collapsing logic,
 * decoupled from the vscode API. Takes raw ChatHookResult[] and returns
 * the collapsed IPreToolUseHookResult.
 */
function collapsePreToolUseHookResults(results: ChatHookResult[]): IPreToolUseHookResult | undefined {
	if (results.length === 0) {
		return undefined;
	}

	let mostRestrictiveDecision: 'allow' | 'deny' | 'ask' | undefined;
	let winningReason: string | undefined;
	let lastUpdatedInput: object | undefined;
	const allAdditionalContext: string[] = [];

	for (const result of results) {
		// Exit code 2 (error) means deny the tool
		if (result.resultKind === 'error') {
			const reason = typeof result.output === 'string' ? result.output : undefined;
			mostRestrictiveDecision = 'deny';
			winningReason = reason ?? winningReason;
			break;
		}

		if (result.resultKind !== 'success' || typeof result.output !== 'object' || result.output === null) {
			continue;
		}

		const output = result.output as { hookSpecificOutput?: IPreToolUseHookSpecificOutput };
		const hookSpecificOutput = output.hookSpecificOutput;
		if (!hookSpecificOutput) {
			continue;
		}

		if (hookSpecificOutput.hookEventName !== undefined && hookSpecificOutput.hookEventName !== 'PreToolUse') {
			continue;
		}

		if (hookSpecificOutput.additionalContext) {
			allAdditionalContext.push(hookSpecificOutput.additionalContext);
		}

		if (hookSpecificOutput.updatedInput) {
			lastUpdatedInput = hookSpecificOutput.updatedInput;
		}

		const decision = hookSpecificOutput.permissionDecision;
		if (decision && (mostRestrictiveDecision === undefined || (permissionPriority[decision] ?? 0) > (permissionPriority[mostRestrictiveDecision] ?? 0))) {
			mostRestrictiveDecision = decision;
			winningReason = hookSpecificOutput.permissionDecisionReason;
		}
	}

	if (!mostRestrictiveDecision && !lastUpdatedInput && allAdditionalContext.length === 0) {
		return undefined;
	}

	return {
		permissionDecision: mostRestrictiveDecision,
		permissionDecisionReason: winningReason,
		updatedInput: lastUpdatedInput,
		additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
	};
}

function hookResult(output: unknown, kind: ChatHookResultKind = 'success'): ChatHookResult {
	return { resultKind: kind, output } as ChatHookResult;
}

/**
 * A testable ChatHookService that stubs executeHook to return configurable results,
 * so we can test executePreToolUseHook's collapsing logic without the real vscode API.
 */
class TestableChatHookService {
	public hookResults: ChatHookResult[] = [];
	public validateToolInputFn: ((name: string, input: string) => IToolValidationResult) | undefined;

	async executeHook(): Promise<ChatHookResult[]> {
		return this.hookResults;
	}

	async executePreToolUseHook(
		toolName: string,
		toolInput: unknown,
		toolCallId: string,
		toolInvocationToken: unknown,
		sessionId?: string,
	): Promise<IPreToolUseHookResult | undefined> {
		const results = await this.executeHook();
		const collapsed = collapsePreToolUseHookResults(results);
		if (!collapsed) {
			return undefined;
		}

		// Validate updatedInput against the tool's input schema, mirroring the real ChatHookService
		if (collapsed.updatedInput && this.validateToolInputFn) {
			const validationResult = this.validateToolInputFn(toolName, JSON.stringify(collapsed.updatedInput));
			if ('error' in validationResult) {
				collapsed.updatedInput = undefined;
			}
		}

		if (!collapsed.permissionDecision && !collapsed.updatedInput && !collapsed.additionalContext?.length) {
			return undefined;
		}

		return collapsed;
	}
}

describe('ChatHookService.executePreToolUseHook', () => {
	let service: TestableChatHookService;

	beforeEach(() => {
		service = new TestableChatHookService();
	});

	it('returns undefined when no hooks return results', async () => {
		service.hookResults = [];
		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toBeUndefined();
	});

	it('returns allow when single hook allows', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', permissionDecisionReason: 'Tool is safe' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toEqual({
			permissionDecision: 'allow',
			permissionDecisionReason: 'Tool is safe',
			updatedInput: undefined,
			additionalContext: undefined,
		});
	});

	it('returns deny when single hook denies', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'Blocked' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toEqual({
			permissionDecision: 'deny',
			permissionDecisionReason: 'Blocked',
			updatedInput: undefined,
			additionalContext: undefined,
		});
	});

	it('returns ask when single hook asks', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Needs review' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toEqual({
			permissionDecision: 'ask',
			permissionDecisionReason: 'Needs review',
			updatedInput: undefined,
			additionalContext: undefined,
		});
	});

	it('deny wins over allow and ask', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', permissionDecisionReason: 'ok' } }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'maybe' } }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'nope' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('deny');
		expect(result?.permissionDecisionReason).toBe('nope');
	});

	it('ask wins over allow', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', permissionDecisionReason: 'ok' } }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'confirm please' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('ask');
		expect(result?.permissionDecisionReason).toBe('confirm please');
	});

	it('ignores results with wrong hookEventName', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { hookEventName: 'PostToolUse', permissionDecision: 'deny' } }),
			hookResult({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
	});

	it('accepts results without hookEventName', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
	});

	it('returns updatedInput from hook', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { path: '/safe/path.ts' } } }),
		];

		const result = await service.executePreToolUseHook('tool', { path: '/original' }, 'call-1', undefined);
		expect(result?.updatedInput).toEqual({ path: '/safe/path.ts' });
	});

	it('later hook updatedInput overrides earlier one', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { value: 'first' } } }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { value: 'second' } } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.updatedInput).toEqual({ value: 'second' });
	});

	it('returns updatedInput even without permission decision', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { updatedInput: { modified: true } } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.updatedInput).toEqual({ modified: true });
		expect(result?.permissionDecision).toBeUndefined();
	});

	it('discards updatedInput when schema validation fails', async () => {
		service.validateToolInputFn = () => ({ error: 'Missing required property "command"' });
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { invalidField: 'wrong' } } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
		expect(result?.updatedInput).toBeUndefined();
	});

	it('keeps updatedInput when schema validation passes', async () => {
		service.validateToolInputFn = (_name, input) => ({ inputObj: JSON.parse(input) });
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { command: 'safe' } } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
		expect(result?.updatedInput).toEqual({ command: 'safe' });
	});

	it('returns undefined when only updatedInput is present but fails validation', async () => {
		service.validateToolInputFn = () => ({ error: 'invalid' });
		service.hookResults = [
			hookResult({ hookSpecificOutput: { updatedInput: { bad: true } } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toBeUndefined();
	});

	it('collects additionalContext from all hooks', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', additionalContext: 'context from hook 1' } }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', additionalContext: 'context from hook 2' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.additionalContext).toEqual(['context from hook 1', 'context from hook 2']);
	});

	it('returns undefined additionalContext when no hooks provide it', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.additionalContext).toBeUndefined();
	});

	it('combines updatedInput, additionalContext, and permission decision', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Modified input needs review', updatedInput: { command: 'echo safe' }, additionalContext: 'audit log enabled' } }),
		];

		const result = await service.executePreToolUseHook('tool', { command: 'rm -rf /' }, 'call-1', undefined);
		expect(result).toEqual({
			permissionDecision: 'ask',
			permissionDecisionReason: 'Modified input needs review',
			updatedInput: { command: 'echo safe' },
			additionalContext: ['audit log enabled'],
		});
	});

	it('treats error results (exit code 2) as deny', async () => {
		service.hookResults = [
			hookResult('hook blocked this tool', 'error'),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('deny');
		expect(result?.permissionDecisionReason).toBe('hook blocked this tool');
	});

	it('preserves context from prior hooks when error denies', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow', additionalContext: 'context from first hook' } }),
			hookResult('second hook errored', 'error'),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('deny');
		expect(result?.additionalContext).toEqual(['context from first hook']);
	});

	it('skips warning results', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'deny' } }, 'warning'),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
	});

	it('skips results with non-object output', async () => {
		service.hookResults = [
			hookResult('string output'),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('allow');
	});

	it('skips results without hookSpecificOutput', async () => {
		service.hookResults = [
			hookResult({ someOtherField: 'value' }),
			hookResult({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'blocked' } }),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result?.permissionDecision).toBe('deny');
	});

	it('returns undefined when all results are warnings', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { permissionDecision: 'deny' } }, 'warning'),
			hookResult({ hookSpecificOutput: { permissionDecision: 'allow' } }, 'warning'),
		];

		const result = await service.executePreToolUseHook('tool', {}, 'call-1', undefined);
		expect(result).toBeUndefined();
	});
});

interface IPostToolUseHookSpecificOutput {
	hookEventName?: string;
	additionalContext?: string;
}

function collapsePostToolUseHookResults(results: ChatHookResult[]): IPostToolUseHookResult | undefined {
	if (results.length === 0) {
		return undefined;
	}

	let hasBlock = false;
	let blockReason: string | undefined;
	const allAdditionalContext: string[] = [];

	for (const result of results) {
		// Exit code 2 (error) means block the tool result
		if (result.resultKind === 'error') {
			const reason = typeof result.output === 'string' ? result.output : undefined;
			if (!hasBlock) {
				hasBlock = true;
				blockReason = reason;
			}
			break;
		}

		if (result.resultKind !== 'success' || typeof result.output !== 'object' || result.output === null) {
			continue;
		}

		const output = result.output as {
			decision?: string;
			reason?: string;
			hookSpecificOutput?: IPostToolUseHookSpecificOutput;
		};

		if (output.hookSpecificOutput?.hookEventName !== undefined && output.hookSpecificOutput.hookEventName !== 'PostToolUse') {
			continue;
		}

		if (output.hookSpecificOutput?.additionalContext) {
			allAdditionalContext.push(output.hookSpecificOutput.additionalContext);
		}

		if (output.decision === 'block' && !hasBlock) {
			hasBlock = true;
			blockReason = output.reason;
		}
	}

	if (!hasBlock && allAdditionalContext.length === 0) {
		return undefined;
	}

	return {
		decision: hasBlock ? 'block' : undefined,
		reason: blockReason,
		additionalContext: allAdditionalContext.length > 0 ? allAdditionalContext : undefined,
	};
}

class TestablePostToolUseChatHookService {
	public hookResults: ChatHookResult[] = [];

	async executeHook(): Promise<ChatHookResult[]> {
		return this.hookResults;
	}

	async executePostToolUseHook(
		toolName: string,
		toolInput: unknown,
		toolResponseText: string,
		toolCallId: string,
		toolInvocationToken: unknown,
		sessionId?: string,
	): Promise<IPostToolUseHookResult | undefined> {
		const results = await this.executeHook();
		return collapsePostToolUseHookResults(results);
	}
}

describe('ChatHookService.executePostToolUseHook', () => {
	let service: TestablePostToolUseChatHookService;

	beforeEach(() => {
		service = new TestablePostToolUseChatHookService();
	});

	it('returns undefined when no hooks return results', async () => {
		service.hookResults = [];
		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toBeUndefined();
	});

	it('returns block decision when hook blocks', async () => {
		service.hookResults = [
			hookResult({ decision: 'block', reason: 'Lint errors found' }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toEqual({
			decision: 'block',
			reason: 'Lint errors found',
			additionalContext: undefined,
		});
	});

	it('returns additionalContext from hookSpecificOutput', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { additionalContext: 'Tests still pass' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toEqual({
			decision: undefined,
			reason: undefined,
			additionalContext: ['Tests still pass'],
		});
	});

	it('collects additionalContext from all hooks', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { additionalContext: 'context from hook 1' } }),
			hookResult({ hookSpecificOutput: { additionalContext: 'context from hook 2' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.additionalContext).toEqual(['context from hook 1', 'context from hook 2']);
	});

	it('first block decision wins', async () => {
		service.hookResults = [
			hookResult({ decision: 'block', reason: 'First block' }),
			hookResult({ decision: 'block', reason: 'Second block' }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.decision).toBe('block');
		expect(result?.reason).toBe('First block');
	});

	it('block decision with additionalContext from different hooks', async () => {
		service.hookResults = [
			hookResult({ decision: 'block', reason: 'Tests failed' }),
			hookResult({ hookSpecificOutput: { additionalContext: 'Extra context from linter' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toEqual({
			decision: 'block',
			reason: 'Tests failed',
			additionalContext: ['Extra context from linter'],
		});
	});

	it('ignores results with wrong hookEventName', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'Should be ignored' } }),
			hookResult({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Correct context' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.additionalContext).toEqual(['Correct context']);
	});

	it('accepts results without hookEventName', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { additionalContext: 'No event name' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.additionalContext).toEqual(['No event name']);
	});

	it('treats error results (exit code 2) as block', async () => {
		service.hookResults = [
			hookResult('hook errored', 'error'),
			hookResult({ hookSpecificOutput: { additionalContext: 'Valid context' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.decision).toBe('block');
		expect(result?.reason).toBe('hook errored');
	});

	it('preserves context from prior hooks when error blocks', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: { additionalContext: 'context from first' } }),
			hookResult('second errored', 'error'),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.decision).toBe('block');
		expect(result?.additionalContext).toEqual(['context from first']);
	});

	it('skips warning results', async () => {
		service.hookResults = [
			hookResult({ decision: 'block', reason: 'Should be ignored' }, 'warning'),
			hookResult({ hookSpecificOutput: { additionalContext: 'Valid context' } }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.decision).toBeUndefined();
		expect(result?.additionalContext).toEqual(['Valid context']);
	});

	it('skips results with non-object output', async () => {
		service.hookResults = [
			hookResult('string output'),
			hookResult({ decision: 'block', reason: 'Valid block' }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result?.decision).toBe('block');
	});

	it('returns undefined when all results are warnings', async () => {
		service.hookResults = [
			hookResult({ decision: 'block' }, 'warning'),
			hookResult({ hookSpecificOutput: { additionalContext: 'ctx' } }, 'warning'),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toBeUndefined();
	});

	it('returns undefined when no hook provides block or additionalContext', async () => {
		service.hookResults = [
			hookResult({ hookSpecificOutput: {} }),
		];

		const result = await service.executePostToolUseHook('tool', {}, 'output', 'call-1', undefined);
		expect(result).toBeUndefined();
	});
});
