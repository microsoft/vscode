/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatUtilityModelService, IChatUtilityModelRequest } from '../../common/chatUtilityModelService.js';
import { ChatMessageRole, IChatMessage, ILanguageModelChatRequestOptions, ILanguageModelChatResponse, ILanguageModelsService } from '../../common/languageModels.js';

suite('ChatUtilityModelService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let sent: { prompt: string; options: ILanguageModelChatRequestOptions }[];
	let running: number;
	let maxRunning: number;
	/** Requests whose prompt has an entry here wait for it before answering. */
	let held: Map<string, DeferredPromise<void>>;
	let service: ChatUtilityModelService;

	function request(prompt: string, overrides: Partial<IChatUtilityModelRequest> = {}): IChatUtilityModelRequest {
		return { purpose: 'thinkingTitle', model: 'copilot/utility', messages: [{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }], ...overrides };
	}

	setup(() => {
		sent = [];
		running = 0;
		maxRunning = 0;
		held = new Map();
		service = store.add(new ChatUtilityModelService(new class extends mock<ILanguageModelsService>() {
			override async sendChatRequest(_model: string, _from: ExtensionIdentifier | undefined, messages: IChatMessage[], options: ILanguageModelChatRequestOptions): Promise<ILanguageModelChatResponse> {
				const prompt = messages[0].content[0].type === 'text' ? messages[0].content[0].value : '';
				sent.push({ prompt, options });
				maxRunning = Math.max(maxRunning, ++running);
				return {
					stream: (async function* () {
						try {
							await (held.get(prompt)?.p ?? timeout(1));
							if (prompt.startsWith('rate-limited')) {
								const retryAfter = prompt.split(':')[1];
								throw Object.assign(new Error('Too many requests'), { name: 'LanguageModelError', code: 'RateLimited', retryAfter: retryAfter ? Number(retryAfter) : undefined });
							}
							yield { type: 'text' as const, value: `Answer to ${prompt}` };
						} finally {
							running--;
						}
					})(),
					result: Promise.resolve({}),
				};
			}
		}, new NullLogService()));
	});

	test('shares keyed requests, limits background concurrency, and names the purpose', async () => {
		const results = await Promise.all([
			...['b1', 'b2', 'b3', 'b4'].map(prompt => service.sendRequest(request(prompt, { background: true, key: prompt }), CancellationToken.None)),
			service.sendRequest(request('b1', { background: true, key: 'b1' }), CancellationToken.None),
			service.sendRequest(request('interactive', { purpose: 'goalSummary' }), CancellationToken.None),
		]);

		assert.deepStrictEqual({ results, maxRunning, sent: sent.map(s => [s.prompt, s.options.modelOptions?._requestPurpose]) }, {
			results: ['Answer to b1', 'Answer to b2', 'Answer to b3', 'Answer to b4', 'Answer to b1', 'Answer to interactive'],
			maxRunning: 4,
			sent: [['b1', 'thinkingTitle'], ['b2', 'thinkingTitle'], ['b3', 'thinkingTitle'], ['interactive', 'goalSummary'], ['b4', 'thinkingTitle']],
		});
	});

	test('drops queued background requests nobody waits for, but finishes started ones', async () => {
		for (const prompt of ['b1', 'b2', 'b3']) {
			held.set(prompt, new DeferredPromise());
		}
		const startedCts = store.add(new CancellationTokenSource());
		const queuedCts = store.add(new CancellationTokenSource());
		const started = service.sendRequest(request('b1', { background: true }), startedCts.token);
		const others = ['b2', 'b3'].map(prompt => service.sendRequest(request(prompt, { background: true }), CancellationToken.None));
		const queued = service.sendRequest(request('queued', { background: true }), queuedCts.token);
		await timeout(0);
		startedCts.cancel();
		queuedCts.cancel();
		for (const deferred of held.values()) {
			deferred.complete();
		}

		assert.deepStrictEqual({ started: await started, queued: await queued, others: await Promise.all(others), sent: sent.map(s => s.prompt) }, {
			started: 'Answer to b1',
			queued: undefined,
			others: ['Answer to b2', 'Answer to b3'],
			sent: ['b1', 'b2', 'b3'],
		});
	});

	test('holds back a rate limited model for its retry guidance (even zero), 60 seconds by default, and at most 15 minutes', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['Date'] });
		try {
			const send = (prompt: string) => service.sendRequest(request(prompt), CancellationToken.None).then(() => 'ok', () => 'failed');
			const outcomes = [await send('rate-limited:90000'), await send('held back')];
			clock.tick(90_000);
			outcomes.push(await send('rate-limited'));
			clock.tick(59_999);
			outcomes.push(await send('held back'));
			clock.tick(1);
			outcomes.push(await send('rate-limited:86400000'));
			clock.tick(15 * 60_000);
			outcomes.push(await send('recovered'), await send('rate-limited:0'), await send('retried immediately'));

			assert.deepStrictEqual({ outcomes, sent: sent.map(s => s.prompt) }, {
				outcomes: ['failed', 'failed', 'failed', 'failed', 'failed', 'ok', 'failed', 'ok'],
				sent: ['rate-limited:90000', 'rate-limited', 'rate-limited:86400000', 'recovered', 'rate-limited:0', 'retried immediately'],
			});
		} finally {
			clock.restore();
		}
	});
});
