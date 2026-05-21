/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatResponseStream } from 'vscode';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { ChatHookType } from '../../../../vscodeTypes';
import { formatHookErrorMessage, HookAbortError, HookResult, isHookAbortError, processHookResults, ProcessHookResultsOptions } from '../../node/hookResultProcessor';

/**
 * Mock implementation of ChatResponseStream that tracks hookProgress calls.
 */
class MockChatResponseStream {
	readonly hookProgressCalls: Array<{ hookType: ChatHookType; stopReason?: string; systemMessage?: string }> = [];

	hookProgress(hookType: ChatHookType, stopReason?: string, systemMessage?: string): void {
		this.hookProgressCalls.push({ hookType, stopReason, systemMessage });
	}
}

describe('hookResultProcessor', () => {
	let logService: TestLogService;
	let mockStream: MockChatResponseStream;

	beforeEach(() => {
		logService = new TestLogService();
		mockStream = new MockChatResponseStream();
	});

	describe('HookAbortError', () => {
		it('should create error with hookType and stopReason', () => {
			const error = new HookAbortError('UserPromptSubmit', 'Build failed');
			expect(error.hookType).toBe('UserPromptSubmit');
			expect(error.stopReason).toBe('Build failed');
			expect(error.message).toBe('Hook UserPromptSubmit aborted: Build failed');
			expect(error.name).toBe('HookAbortError');
		});

		it('should be identifiable via isHookAbortError', () => {
			const hookError = new HookAbortError('Stop', 'reason');
			expect(isHookAbortError(hookError)).toBe(true);
			expect(isHookAbortError(new Error('regular error'))).toBe(false);
			expect(isHookAbortError(null)).toBe(false);
			expect(isHookAbortError(undefined)).toBe(false);
		});
	});

	describe('stopReason handling for all hook types', () => {
		const hookTypes: ChatHookType[] = [
			'UserPromptSubmit',
			'SessionStart',
			'Stop',
			'SubagentStart',
			'SubagentStop',
		];

		hookTypes.forEach((hookType) => {
			describe(`${hookType} hook`, () => {
				it('should throw HookAbortError when stopReason is present', () => {
					const results: HookResult[] = [
						{
							resultKind: 'success',
							output: {},
							stopReason: 'Build failed, fix errors before continuing',
						},
					];

					const onSuccess = vi.fn();
					const options: ProcessHookResultsOptions = {
						hookType,
						results,
						outputStream: mockStream as unknown as ChatResponseStream,
						logService,
						onSuccess,
					};

					expect(() => processHookResults(options)).toThrow(HookAbortError);
					expect(() => processHookResults(options)).toThrow(
						`Hook ${hookType} aborted: Build failed, fix errors before continuing`
					);
					// Verify hookProgress is called with the stopReason
					expect(mockStream.hookProgressCalls.length).toBeGreaterThan(0);
					expect(mockStream.hookProgressCalls[0].hookType).toBe(hookType);
					expect(mockStream.hookProgressCalls[0].stopReason).toContain('Build failed, fix errors before continuing');
				});

				it('should not call onSuccess when stopReason is present', () => {
					const results: HookResult[] = [
						{
							resultKind: 'success',
							output: { someData: 'value' },
							stopReason: 'Processing blocked',
						},
					];

					const onSuccess = vi.fn();
					const options: ProcessHookResultsOptions = {
						hookType,
						results,
						outputStream: mockStream as unknown as ChatResponseStream,
						logService,
						onSuccess,
					};

					try {
						processHookResults(options);
					} catch {
						// Expected to throw
					}

					expect(onSuccess).not.toHaveBeenCalled();
				});

				it('should throw HookAbortError immediately and stop processing remaining results', () => {
					const results: HookResult[] = [
						{
							resultKind: 'success',
							output: { index: 0 },
							stopReason: 'First hook aborted',
						},
						{
							resultKind: 'success',
							output: { index: 1 },
						},
					];

					const onSuccess = vi.fn();
					const options: ProcessHookResultsOptions = {
						hookType,
						results,
						outputStream: mockStream as unknown as ChatResponseStream,
						logService,
						onSuccess,
					};

					expect(() => processHookResults(options)).toThrow('First hook aborted');
					expect(onSuccess).not.toHaveBeenCalled();
					// Verify hookProgress is called with the stopReason
					expect(mockStream.hookProgressCalls).toHaveLength(1);
					expect(mockStream.hookProgressCalls[0].hookType).toBe(hookType);
					expect(mockStream.hookProgressCalls[0].stopReason).toContain('First hook aborted');
				});

				it('should throw HookAbortError when stopReason is empty string (continue: false)', () => {
					const results: HookResult[] = [
						{
							resultKind: 'success',
							output: {},
							stopReason: '',
						},
					];

					const onSuccess = vi.fn();
					const options: ProcessHookResultsOptions = {
						hookType,
						results,
						outputStream: mockStream as unknown as ChatResponseStream,
						logService,
						onSuccess,
					};

					expect(() => processHookResults(options)).toThrow(HookAbortError);
					expect(onSuccess).not.toHaveBeenCalled();
				});
			});
		});
	});

	describe('UserPromptSubmit exit codes', () => {
		// Exit code 0 - stdout shown to Claude (onSuccess called)
		it('should call onSuccess with output on exit code 0 (success)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: 'Additional context for Claude',
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'UserPromptSubmit',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith('Additional context for Claude');
		});

		// Exit code 2 - block processing, erase original prompt, and show stderr to user only
		it('should throw HookAbortError and push hookProgress on exit code 2 (error)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'Validation failed: missing required field',
				},
			];

			const onSuccess = vi.fn();
			expect(() =>
				processHookResults({
					hookType: 'UserPromptSubmit',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess,
				})
			).toThrow(HookAbortError);

			expect(onSuccess).not.toHaveBeenCalled();
			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].hookType).toBe('UserPromptSubmit');
			expect(mockStream.hookProgressCalls[0].stopReason).toContain('Validation failed: missing required field');
		});

		// Other exit codes - show stderr to user only (warnings flow)
		it('should show warning to user on other exit codes', () => {
			const results: HookResult[] = [
				{
					resultKind: 'warning',
					warningMessage: 'Process exited with code 1: Some warning',
					output: undefined,
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'UserPromptSubmit',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).not.toHaveBeenCalled();
			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].hookType).toBe('UserPromptSubmit');
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Process exited with code 1: Some warning');
		});

		it('should aggregate multiple warnings', () => {
			const results: HookResult[] = [
				{ resultKind: 'warning', warningMessage: 'Warning 1', output: undefined },
				{ resultKind: 'warning', warningMessage: 'Warning 2', output: undefined },
			];

			processHookResults({
				hookType: 'UserPromptSubmit',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: () => { },
			});

			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toContain('1. Warning 1');
			expect(mockStream.hookProgressCalls[0].systemMessage).toContain('2. Warning 2');
		});
	});

	describe('SessionStart exit codes', () => {
		// Exit code 0 - stdout shown to Claude
		it('should call onSuccess with output on exit code 0 (success)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { additionalContext: 'Session context data' },
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'SessionStart',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith({ additionalContext: 'Session context data' });
		});

		// Blocking errors are silently ignored (ignoreErrors: true) - no throw, no hookProgress
		it('should silently ignore errors when ignoreErrors is true (no throw, no hookProgress)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'Session hook error',
				},
			];

			const onSuccess = vi.fn();
			expect(() =>
				processHookResults({
					hookType: 'SessionStart',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess,
					ignoreErrors: true,
				})
			).not.toThrow();

			expect(onSuccess).not.toHaveBeenCalled();
			// hookProgress should NOT be called when ignoreErrors is true
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// stopReason (continue: false) is silently ignored (ignoreErrors: true)
		it('should silently ignore stopReason when ignoreErrors is true', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { additionalContext: 'Some context' },
					stopReason: 'Build failed, should be ignored',
				},
			];

			const onSuccess = vi.fn();
			expect(() =>
				processHookResults({
					hookType: 'SessionStart',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess,
					ignoreErrors: true,
				})
			).not.toThrow();

			// stopReason means the result is ignored entirely, so onSuccess is NOT called
			expect(onSuccess).not.toHaveBeenCalled();
			// hookProgress should NOT be called when ignoreErrors is true
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// Other exit codes - show stderr to user only (warnings)
		it('should show warning to user on other exit codes', () => {
			const results: HookResult[] = [
				{
					resultKind: 'warning',
					warningMessage: 'Session start warning',
					output: undefined,
				},
			];

			processHookResults({
				hookType: 'SessionStart',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: () => { },
			});

			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Session start warning');
		});
	});

	describe('Stop exit codes', () => {
		// Exit code 0 - stdout/stderr not shown (success silently processed)
		it('should call onSuccess with output on exit code 0 (success)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { decision: 'allow' },
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'Stop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith({ decision: 'allow' });
			// No hookProgress for success
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// Exit code 2 - show stderr to model and continue conversation (onError callback)
		it('should call onError callback on exit code 2 (error) instead of throwing', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'Stop hook blocking reason',
				},
			];

			const onSuccess = vi.fn();
			const onError = vi.fn();
			processHookResults({
				hookType: 'Stop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
				onError,
			});

			expect(onSuccess).not.toHaveBeenCalled();
			expect(onError).toHaveBeenCalledWith('Stop hook blocking reason');
			// hookProgress should NOT be called when onError is provided
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		it('should continue processing remaining results after onError', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'First error',
				},
				{
					resultKind: 'success',
					output: { reason: 'keep going' },
				},
				{
					resultKind: 'error',
					output: 'Second error',
				},
			];

			const onSuccess = vi.fn();
			const onError = vi.fn();
			processHookResults({
				hookType: 'Stop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
				onError,
			});

			expect(onError).toHaveBeenCalledTimes(2);
			expect(onError).toHaveBeenCalledWith('First error');
			expect(onError).toHaveBeenCalledWith('Second error');
			expect(onSuccess).toHaveBeenCalledWith({ reason: 'keep going' });
		});

		// Other exit codes - show stderr to user only (warnings)
		it('should show warning to user on other exit codes', () => {
			const results: HookResult[] = [
				{
					resultKind: 'warning',
					warningMessage: 'Stop hook warning',
					output: undefined,
				},
			];

			processHookResults({
				hookType: 'Stop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: () => { },
			});

			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Stop hook warning');
		});
	});

	describe('SubagentStart exit codes', () => {
		// Exit code 0 - stdout shown to subagent
		it('should call onSuccess with output on exit code 0 (success)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { additionalContext: 'Subagent context' },
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'SubagentStart',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith({ additionalContext: 'Subagent context' });
		});

		// Blocking errors are silently ignored (ignoreErrors: true) - no throw, no hookProgress
		it('should silently ignore errors when ignoreErrors is true (no throw, no hookProgress)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'Subagent start error',
				},
			];

			const onSuccess = vi.fn();
			expect(() =>
				processHookResults({
					hookType: 'SubagentStart',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess,
					ignoreErrors: true,
				})
			).not.toThrow();

			expect(onSuccess).not.toHaveBeenCalled();
			// hookProgress should NOT be called when ignoreErrors is true
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// stopReason (continue: false) is silently ignored (ignoreErrors: true)
		it('should silently ignore stopReason when ignoreErrors is true', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { additionalContext: 'Subagent context' },
					stopReason: 'Blocking condition, should be ignored',
				},
			];

			const onSuccess = vi.fn();
			expect(() =>
				processHookResults({
					hookType: 'SubagentStart',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess,
					ignoreErrors: true,
				})
			).not.toThrow();

			// stopReason means the result is ignored entirely, so onSuccess is NOT called
			expect(onSuccess).not.toHaveBeenCalled();
			// hookProgress should NOT be called when ignoreErrors is true
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// Other exit codes - show stderr to user only (warnings)
		it('should show warning to user on other exit codes', () => {
			const results: HookResult[] = [
				{
					resultKind: 'warning',
					warningMessage: 'Subagent start warning',
					output: undefined,
				},
			];

			processHookResults({
				hookType: 'SubagentStart',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: () => { },
			});

			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Subagent start warning');
		});
	});

	describe('SubagentStop exit codes', () => {
		// Exit code 0 - stdout/stderr not shown (success silently processed)
		it('should call onSuccess with output on exit code 0 (success)', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: { decision: 'allow' },
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'SubagentStop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith({ decision: 'allow' });
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// Exit code 2 - show stderr to subagent and continue having it run (onError callback)
		it('should call onError callback on exit code 2 (error) instead of throwing', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: 'Subagent stop blocking reason',
				},
			];

			const onSuccess = vi.fn();
			const onError = vi.fn();
			processHookResults({
				hookType: 'SubagentStop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
				onError,
			});

			expect(onSuccess).not.toHaveBeenCalled();
			expect(onError).toHaveBeenCalledWith('Subagent stop blocking reason');
			// hookProgress should NOT be called when onError is provided
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		// Other exit codes - show stderr to user only (warnings)
		it('should show warning to user on other exit codes', () => {
			const results: HookResult[] = [
				{
					resultKind: 'warning',
					warningMessage: 'Subagent stop warning',
					output: undefined,
				},
			];

			processHookResults({
				hookType: 'SubagentStop',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: () => { },
			});

			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Subagent stop warning');
		});
	});

	describe('formatHookErrorMessage', () => {
		it('should format error message with details', () => {
			const message = formatHookErrorMessage('Connection failed');
			expect(message).toContain('Connection failed');
			expect(message).toContain('A hook prevented chat from continuing');
		});

		it('should format error message without details', () => {
			const message = formatHookErrorMessage('');
			expect(message).toContain('A hook prevented chat from continuing');
			expect(message).not.toContain('Error message:');
		});
	});

	describe('edge cases', () => {
		it('should handle empty results array', () => {
			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'UserPromptSubmit',
				results: [],
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).not.toHaveBeenCalled();
			expect(mockStream.hookProgressCalls).toHaveLength(0);
		});

		it('should handle undefined outputStream', () => {
			const results: HookResult[] = [
				{ resultKind: 'warning', warningMessage: 'Warning message', output: undefined },
			];

			// Should not throw when outputStream is undefined
			expect(() =>
				processHookResults({
					hookType: 'UserPromptSubmit',
					results,
					outputStream: undefined,
					logService,
					onSuccess: () => { },
				})
			).not.toThrow();
		});

		it('should include warnings from success results', () => {
			const results: HookResult[] = [
				{
					resultKind: 'success',
					output: 'some output',
					warningMessage: 'Warning from success result',
				},
			];

			const onSuccess = vi.fn();
			processHookResults({
				hookType: 'UserPromptSubmit',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess,
			});

			expect(onSuccess).toHaveBeenCalledWith('some output');
			expect(mockStream.hookProgressCalls).toHaveLength(1);
			expect(mockStream.hookProgressCalls[0].systemMessage).toBe('Warning from success result');
		});

		it('should handle error result with empty output', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: '',
				},
			];

			expect(() =>
				processHookResults({
					hookType: 'UserPromptSubmit',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess: () => { },
				})
			).toThrow(HookAbortError);

			expect(mockStream.hookProgressCalls).toHaveLength(1);
		});

		it('should handle error result with non-string output', () => {
			const results: HookResult[] = [
				{
					resultKind: 'error',
					output: { complex: 'object' },
				},
			];

			expect(() =>
				processHookResults({
					hookType: 'UserPromptSubmit',
					results,
					outputStream: mockStream as unknown as ChatResponseStream,
					logService,
					onSuccess: () => { },
				})
			).toThrow(HookAbortError);

			// Empty error message when output is not a string
			expect(mockStream.hookProgressCalls).toHaveLength(1);
		});

		it('should process multiple results in order', () => {
			const results: HookResult[] = [
				{ resultKind: 'success', output: 'first' },
				{ resultKind: 'success', output: 'second' },
				{ resultKind: 'success', output: 'third' },
			];

			const outputs: unknown[] = [];
			processHookResults({
				hookType: 'UserPromptSubmit',
				results,
				outputStream: mockStream as unknown as ChatResponseStream,
				logService,
				onSuccess: (output) => outputs.push(output),
			});

			expect(outputs).toEqual(['first', 'second', 'third']);
		});
	});
});
