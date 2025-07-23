/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { PollingConsts, racePollingOrPrompt } from '../../browser/bufferOutputPolling.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatElicitationRequestPart } from '../../../../chat/browser/chatElicitationRequestPart.js';
import { Emitter } from '../../../../../../base/common/event.js';

suite('racePollingOrPrompt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const defaultOriginalResult = { terminalExecutionIdleBeforeTimeout: false, output: '', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
	const defaultToken = CancellationToken.None;
	const defaultLanguageModelsService = {} as any;
	const defaultExecution = { getOutput: () => 'output' };

	/**
	 * Returns a set of arguments for racePollingOrPrompt, allowing overrides for testing.
	 */
	function getArgs(overrides?: {
		pollFn?: () => Promise<ReturnType<typeof racePollingOrPrompt> extends Promise<infer R> ? R : any>;
		promptFn?: () => { promise: Promise<boolean>; part?: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> | undefined };
		originalResult?: Parameters<typeof racePollingOrPrompt>[2];
		token?: CancellationToken;
		languageModelsService?: typeof defaultLanguageModelsService;
		execution?: typeof defaultExecution;
	}) {
		return {
			pollFn: overrides?.pollFn ?? (async () => ({ terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 0 })),
			promptFn: overrides?.promptFn ?? (() => ({ promise: new Promise<boolean>(() => { }), part: undefined })),
			originalResult: overrides?.originalResult ?? defaultOriginalResult,
			token: overrides?.token ?? defaultToken,
			languageModelsService: overrides?.languageModelsService ?? defaultLanguageModelsService,
			execution: overrides?.execution ?? defaultExecution
		};
	}

	test('should resolve with poll result if polling finishes first', async () => {
		let pollResolved = false;
		const args = getArgs({
			pollFn: async () => {
				pollResolved = true;
				return { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 0 };
			}
		});
		const result = await racePollingOrPrompt(args.pollFn, args.promptFn, args.originalResult, args.token, args.languageModelsService, args.execution);
		assert.ok(pollResolved);
		assert.deepEqual(result, { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 0 });
	});

	test('should resolve with poll result if prompt is rejected', async () => {
		const args = getArgs({
			pollFn: async () => ({ terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 0 }),
			promptFn: () => ({ promise: Promise.resolve(false), part: undefined }),
			originalResult: { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration }
		});
		const result = await racePollingOrPrompt(args.pollFn, args.promptFn, args.originalResult, args.token, args.languageModelsService, args.execution);
		assert.deepEqual(result, args.originalResult);
	});

	test('should poll again if prompt is accepted', async () => {
		let extraPollCount = 0;
		const args = getArgs({
			pollFn: async () => {
				extraPollCount++;
				return { terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 0 };
			},
			promptFn: () => ({ promise: Promise.resolve(true), part: undefined }),
			originalResult: { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration },
			languageModelsService: {
				selectLanguageModels: async () => [],
				sendChatRequest: async () => ({ result: '', stream: [] })
			}
		});
		const result = await racePollingOrPrompt(args.pollFn, args.promptFn, args.originalResult, args.token, args.languageModelsService, args.execution);
		assert.ok(extraPollCount === 1);
		assert(result?.pollDurationMs && args.originalResult.pollDurationMs && result.pollDurationMs > args.originalResult.pollDurationMs);
	});

	test('should call part.hide() if polling finishes before prompt resolves', async () => {
		let hideCalled = false;
		const part: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> = { hide: () => { hideCalled = true; }, onDidRequestHide: () => new Emitter() };
		const args = getArgs({
			pollFn: async () => ({ terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 0 }),
			promptFn: () => ({
				promise: new Promise<boolean>(() => { }),
				part
			})
		});
		const result = await racePollingOrPrompt(args.pollFn, args.promptFn, args.originalResult, args.token, args.languageModelsService, args.execution);
		assert.strictEqual(hideCalled, true);
		assert.deepEqual(result, { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 0 });
	});

	test('should return promptly if cancellation is requested', async () => {
		let pollCalled = false;
		const args = getArgs({
			pollFn: async () => {
				pollCalled = true;
				return { terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 0 };
			},
			promptFn: () => ({
				promise: new Promise<boolean>(() => { }),
				part: undefined
			}),
			originalResult: { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration },
			token: { isCancellationRequested: true } as CancellationToken
		});
		const result = await racePollingOrPrompt(args.pollFn, args.promptFn, args.originalResult, args.token, args.languageModelsService, args.execution);
		assert.ok(pollCalled);
		assert.deepEqual(result, await args.pollFn());
	});
});
