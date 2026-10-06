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
import { ChatMessageRole, IChatMessage, ILanguageModelChatRequestOptions, ILanguageModelChatResponse, ILanguageModelChatSelector, ILanguageModelsService } from '../../common/languageModels.js';

suite('ChatUtilityModelService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let availableModels: Set<string>;
	let sent: { model: string; prompt: string; options: ILanguageModelChatRequestOptions }[];
	let running: number;
	let maxRunning: number;
	/** Requests whose prompt has an entry here wait for it before answering. */
	let held: Map<string, DeferredPromise<void>>;
	let logs: string[];
	let service: ChatUtilityModelService;

	function request(prompt: string, overrides: Partial<IChatUtilityModelRequest> = {}): IChatUtilityModelRequest {
		return {
			purpose: 'thinkingTitle',
			priority: 'interactive',
			messages: [{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
			...overrides,
		};
	}

	function rateLimitError(retryAfter?: number): Error {
		return Object.assign(new Error('Too many requests'), { name: 'LanguageModelError', code: 'RateLimited', retryAfter });
	}

	setup(() => {
		availableModels = new Set(['copilot-utility-small']);
		sent = [];
		running = 0;
		maxRunning = 0;
		held = new Map();
		logs = [];

		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override async selectLanguageModels(selector: ILanguageModelChatSelector) {
				return selector.id && availableModels.has(selector.id) ? [`copilot/${selector.id}`] : [];
			}
			override async sendChatRequest(model: string, _from: ExtensionIdentifier | undefined, messages: IChatMessage[], options: ILanguageModelChatRequestOptions): Promise<ILanguageModelChatResponse> {
				const prompt = messages[0].content[0].type === 'text' ? messages[0].content[0].value : '';
				sent.push({ model, prompt, options });
				running++;
				maxRunning = Math.max(maxRunning, running);
				return {
					stream: (async function* () {
						try {
							await (held.get(prompt)?.p ?? timeout(1));
							if (prompt.startsWith('rate-limited')) {
								const retryAfter = prompt.split(':')[1];
								throw rateLimitError(retryAfter ? Number(retryAfter) : undefined);
							}
							yield { type: 'text' as const, value: `Answer to ${prompt}` };
						} finally {
							running--;
						}
					})(),
					result: Promise.resolve({}),
				};
			}
		};
		const logService = new class extends NullLogService {
			override info(message: string) { logs.push(message); }
		};
		service = store.add(new ChatUtilityModelService(languageModelsService, logService));
	});

	teardown(() => {
		sinon.restore();
	});

	test('shares one model request between callers with the same key', async () => {
		const results = await Promise.all([
			service.sendRequest(request('block', { priority: 'background', key: 'session:block' }), CancellationToken.None),
			service.sendRequest(request('block', { priority: 'background', key: 'session:block' }), CancellationToken.None),
		]);

		assert.deepStrictEqual({ results, sent: sent.map(s => s.prompt) }, {
			results: [
				{ kind: 'success', text: 'Answer to block', model: 'copilot-utility-small' },
				{ kind: 'success', text: 'Answer to block', model: 'copilot-utility-small' },
			],
			sent: ['block'],
		});
	});

	test('limits background concurrency without holding back interactive requests', async () => {
		const background = ['b1', 'b2', 'b3', 'b4', 'b5'].map(prompt => service.sendRequest(request(prompt, { priority: 'background' }), CancellationToken.None));
		const interactive = service.sendRequest(request('interactive'), CancellationToken.None);
		await Promise.all([...background, interactive]);

		assert.deepStrictEqual({ sent: sent.map(s => s.prompt), maxRunning }, {
			sent: ['b1', 'b2', 'b3', 'interactive', 'b4', 'b5'],
			maxRunning: 4,
		});
	});

	test('drops queued background requests nobody waits for, but finishes started ones', async () => {
		for (const prompt of ['b1', 'b2', 'b3']) {
			held.set(prompt, new DeferredPromise());
		}
		const startedCts = store.add(new CancellationTokenSource());
		const queuedCts = store.add(new CancellationTokenSource());
		const started = service.sendRequest(request('b1', { priority: 'background' }), startedCts.token);
		const others = ['b2', 'b3'].map(prompt => service.sendRequest(request(prompt, { priority: 'background' }), CancellationToken.None));
		const queued = service.sendRequest(request('queued', { priority: 'background' }), queuedCts.token);
		await timeout(0);
		startedCts.cancel();
		queuedCts.cancel();
		for (const deferred of held.values()) {
			deferred.complete();
		}

		assert.deepStrictEqual({ started: await started, queued: await queued, others: await Promise.all(others), sent: sent.map(s => s.prompt) }, {
			started: { kind: 'success', text: 'Answer to b1', model: 'copilot-utility-small' },
			queued: { kind: 'failed', reason: 'cancelled' },
			others: [
				{ kind: 'success', text: 'Answer to b2', model: 'copilot-utility-small' },
				{ kind: 'success', text: 'Answer to b3', model: 'copilot-utility-small' },
			],
			sent: ['b1', 'b2', 'b3'],
		});
	});

	test('returns as soon as an interactive caller cancels', async () => {
		held.set('stalled', new DeferredPromise());
		const cts = store.add(new CancellationTokenSource());
		const result = service.sendRequest(request('stalled'), cts.token);
		await timeout(0);
		cts.cancel();

		assert.deepStrictEqual(await result, { kind: 'failed', reason: 'cancelled', model: 'copilot-utility-small' });
	});

	test('reports a timeout when the model does not answer in time', async () => {
		held.set('stalled', new DeferredPromise());

		assert.deepStrictEqual(await service.sendRequest(request('stalled', { timeout: 5 }), CancellationToken.None), { kind: 'failed', reason: 'timeout', model: 'copilot-utility-small' });
	});

	test('falls back through the requested models, passes options for the selected one, and names the purpose to the provider', async () => {
		availableModels = new Set(['copilot-utility-small']);
		const options = (model: string) => model === 'dedicated' ? { configuration: { reasoningEffort: 'none' } } : {};
		const fellBack = await service.sendRequest(request('cleanup', { models: ['dedicated', 'copilot-utility-small'], options }), CancellationToken.None);
		availableModels = new Set(['dedicated']);
		const dedicated = await service.sendRequest(request('cleanup', { models: ['dedicated', 'copilot-utility-small'], options }), CancellationToken.None);
		availableModels = new Set();
		const noModel = await service.sendRequest(request('cleanup'), CancellationToken.None);

		assert.deepStrictEqual({ fellBack, dedicated, noModel, sent: sent.map(s => [s.model, s.options]) }, {
			fellBack: { kind: 'success', text: 'Answer to cleanup', model: 'copilot-utility-small' },
			dedicated: { kind: 'success', text: 'Answer to cleanup', model: 'dedicated' },
			noModel: { kind: 'failed', reason: 'noModel' },
			sent: [
				['copilot/copilot-utility-small', { modelOptions: { _requestPurpose: 'thinkingTitle' } }],
				['copilot/dedicated', { configuration: { reasoningEffort: 'none' }, modelOptions: { _requestPurpose: 'thinkingTitle' } }],
			],
		});
	});

	test('holds back a rate limited model for its retry guidance, a doubling default, and at most 15 minutes', async () => {
		const clock = sinon.useFakeTimers({ toFake: ['Date'] });
		try {
			availableModels.add('other');
			const send = async (prompt: string, models?: string[]) => {
				const result = await service.sendRequest(request(prompt, { models }), CancellationToken.None);
				return result.kind === 'success' ? 'success' : `${result.reason}:${result.retryAfter}`;
			};

			const outcomes = [
				await send('rate-limited', ['other']),
				await send('rate-limited:90000'),
				await send('held back'),
			];
			clock.tick(90_000);
			outcomes.push(await send('rate-limited'), await send('other recovered', ['other']));
			clock.tick(120_000);
			outcomes.push(await send('rate-limited:86400000'));
			clock.tick(15 * 60_000);
			outcomes.push(await send('recovered'));

			assert.deepStrictEqual({ outcomes, sent: sent.map(s => s.prompt) }, {
				outcomes: [
					'rateLimited:60000',
					'rateLimited:90000',
					'rateLimited:90000',
					'rateLimited:120000',
					'success',
					'rateLimited:900000',
					'success',
				],
				sent: ['rate-limited', 'rate-limited:90000', 'rate-limited', 'other recovered', 'rate-limited:86400000', 'recovered'],
			});
		} finally {
			clock.restore();
		}
	});

	test('logs every request with the feature that made it', async () => {
		availableModels.add('other');
		await service.sendRequest(request('title', { purpose: 'thinkingTitle', priority: 'background' }), CancellationToken.None);
		await service.sendRequest(request('rate-limited:1000', { purpose: 'toolRiskAssessment', models: ['other'] }), CancellationToken.None);

		assert.deepStrictEqual(logs.map(log => log.replace(/ (elapsedMs|firstTextMs|totalMs)=\d+/g, '')), [
			'[ChatUtilityModel] purpose=thinkingTitle priority=background outcome=success model=copilot-utility-small',
			'[ChatUtilityModel] purpose=toolRiskAssessment priority=interactive outcome=rateLimited model=other retryAfterMs=1000',
		]);
	});
});
