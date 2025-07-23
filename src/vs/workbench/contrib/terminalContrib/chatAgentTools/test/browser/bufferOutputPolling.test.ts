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
	test('should resolve with poll result if polling finishes first', async () => {
		let pollResolved = false;
		const pollFn = async () => {
			pollResolved = true;
			return { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 100 };
		};
		const promptFn = () => ({ promise: new Promise<boolean>(() => { }), part: undefined });
		const originalResult = { terminalExecutionIdleBeforeTimeout: false, output: '', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
		const token = CancellationToken.None;
		const languageModelsService = {} as any;
		const execution = { getOutput: () => 'output' };

		const result = await racePollingOrPrompt(pollFn, promptFn, originalResult, token, languageModelsService, execution);
		assert.ok(pollResolved);
		assert.deepEqual(result, { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 100 });
	});

	test('should resolve with poll result if prompt is rejected', async () => {
		const pollFn = async () => {
			return { terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 100 };
		};
		const promptFn = () => ({ promise: Promise.resolve(false), part: undefined });
		const originalResult = { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
		const token = CancellationToken.None;
		const languageModelsService = {} as any;
		const execution = { getOutput: () => 'output' };

		const result = await racePollingOrPrompt(pollFn, promptFn, originalResult, token, languageModelsService, execution);
		assert.deepEqual(result, originalResult);
	});

	test('should poll again if prompt is accepted', async () => {
		let extraPollCount = 0;
		const pollFn = async () => {
			extraPollCount++;
			return { terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 100 };
		};
		const promptFn = () => ({ promise: Promise.resolve(true), part: undefined });
		const originalResult = { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
		const token = CancellationToken.None;
		const languageModelsService = {
			selectLanguageModels: async () => [],
			sendChatRequest: async () => ({ result: '', stream: [] })
		} as any;
		const execution = { getOutput: () => 'output' };

		const result = await racePollingOrPrompt(pollFn, promptFn, originalResult, token, languageModelsService, execution);
		assert.ok(extraPollCount === 1);
		assert(result?.pollDurationMs && result.pollDurationMs > originalResult.pollDurationMs);
	});
	test('should call part.hide() if polling finishes before prompt resolves', async () => {
		let hideCalled = false;
		const part: Pick<ChatElicitationRequestPart, 'hide' | 'onDidRequestHide'> = { hide: () => { hideCalled = true; }, onDidRequestHide: () => new Emitter() };
		const pollFn = async () => {
			return { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 100 };
		};
		let promptResolve: (v: boolean) => void;
		const promptFn = () => ({
			promise: new Promise<boolean>(resolve => { promptResolve = resolve; }),
			part
		});
		const originalResult = { terminalExecutionIdleBeforeTimeout: false, output: '', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
		const token = CancellationToken.None;
		const languageModelsService = {} as any;
		const execution = { getOutput: () => 'output' };

		const result = await racePollingOrPrompt(pollFn, promptFn, originalResult, token, languageModelsService, execution);
		assert.strictEqual(hideCalled, true);
		assert.deepEqual(result, { terminalExecutionIdleBeforeTimeout: true, output: 'output', pollDurationMs: 100 });
	});

	test('should return promptly if cancellation is requested', async () => {
		let pollCalled = false;
		const pollFn = async () => {
			pollCalled = true;
			return { terminalExecutionIdleBeforeTimeout: false, output: 'output', pollDurationMs: 100 };
		};
		const promptFn = () => ({
			promise: new Promise<boolean>(() => { }),
			part: undefined
		});
		const originalResult = { terminalExecutionIdleBeforeTimeout: false, output: 'original', pollDurationMs: PollingConsts.FirstPollingMaxDuration };
		const token = { isCancellationRequested: true } as CancellationToken;
		const languageModelsService = {} as any;
		const execution = { getOutput: () => 'output' };

		const result = await racePollingOrPrompt(pollFn, promptFn, originalResult, token, languageModelsService, execution);
		assert.ok(pollCalled);
		assert.deepEqual(result, await pollFn());
	});
});
