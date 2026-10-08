/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { AsyncIterableObject, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatCompleteResponse, IChatService, IChatSessionStartOptions } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatMessage, IChatResponsePart, ILanguageModelChatRequestOptions, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IProjectBoardTopicSource, parseProjectBoardAnalysis, parseProjectBoardTopics, ProjectBoardSupervisor, projectBoardSupervisorLimits } from '../../browser/projectBoardSupervisor.js';
import { matchesProjectBoardFilter } from '../../common/projectBoardFilter.js';

suite('ProjectBoardSupervisor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const source = (id = 'chat-0'): IProjectBoardTopicSource => ({
		id, title: 'Deployment API', description: 'Retry network failures', workspace: 'Project', status: 'Busy', prompt: 'Investigate the API',
	});

	function harness() {
		const state = {
			available: true, response: '',
			requests: [] as { messages: IChatMessage[]; options: ILanguageModelChatRequestOptions; token: CancellationToken }[],
			starts: [] as (IChatSessionStartOptions | undefined)[],
			transcript: [] as IChatCompleteResponse[], errors: [] as string[],
			barrier: undefined as DeferredPromise<void> | undefined,
			part: undefined as IChatResponsePart | undefined,
			parts: undefined as (IChatResponsePart | IChatResponsePart[])[] | undefined,
			appendError: false, disposedModels: 0, opened: [] as string[],
		};
		const models = new class extends mock<ILanguageModelsService>() {
			override async selectLanguageModels() { return state.available ? ['utility'] : []; }
			override async sendChatRequest(_model: string, _from: ExtensionIdentifier | undefined, messages: IChatMessage[], options: ILanguageModelChatRequestOptions, token: CancellationToken) {
				state.requests.push({ messages, options, token });
				await state.barrier?.p;
				const input = messages[1].content[0];
				if (input.type !== 'text') { throw new Error('Expected text snapshot'); }
				const sources = JSON.parse(input.value).chats as IProjectBoardTopicSource[];
				const response = state.response || JSON.stringify({
					topics: [{ label: 'Deployment', sessions: sources.map((_, index) => index) }],
					summaries: sources.map((source, session) => ({ session, summary: `Working on ${source.title}.` })),
				});
				return { stream: AsyncIterableObject.fromArray(state.parts ?? [state.part ?? { type: 'text', value: response }]), result: Promise.resolve() };
			}
		}();
		const chat = new class extends mock<IChatService>() {
			override startNewLocalSession(_location: ChatAgentLocation, options?: IChatSessionStartOptions) {
				state.starts.push(options);
				const firstRequest = state.transcript.length;
				return {
					object: new class extends mock<IChatModel>() {
						override readonly sessionResource = URI.parse('vscodeLocalChatSession:supervisor');
						override getRequests() { return Array.from({ length: state.transcript.length - firstRequest }, () => new class extends mock<IChatRequestModel>() { }()); }
					}(),
					dispose() { state.disposedModels++; },
				};
			}
			override setSessionTitle() { }
			override addCompleteRequest(_resource: URI, _message: string, _variables: undefined, _attempt: undefined, response: IChatCompleteResponse) {
				if (state.appendError) { throw new Error('Transcript write failed'); }
				state.transcript.push(response);
			}
		}();
		const supervisor = store.add(new ProjectBoardSupervisor('Board', models, chat, new class extends mock<IChatWidgetService>() {
			override async openSession(resource: URI) { state.opened.push(resource.toString()); return undefined; }
		}(),
			store.add(new NullLogService()), new class extends mock<INotificationService>() {
				override error(message: string) { state.errors.push(message); }
			}()));
		return { supervisor, state };
	}

	test('details readiness queues summary analysis without waiting for every chat to load', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		const pending = { ...source(), details: 'pending' as const };
		supervisor.update([pending]);
		supervisor.setEnabled(true);
		await clock.tickAsync(0);
		assert.strictEqual(state.requests.length, 0, 'A discovered chat must wait for its asynchronous details');
		state.response = '{"topics":[{"label":"Deployment","sessions":[0]}],"summaries":[{"session":0,"summary":"Investigating deployment API retries."}]}';
		supervisor.update([{ ...pending, details: 'ready' }]);
		await clock.tickAsync(1000);
		assert.strictEqual(state.requests.length, 1);
		assert.strictEqual(supervisor.getSummary(pending.id)?.text, 'Investigating deployment API retries.');
		assert.strictEqual(supervisor.completed, 1);
	});

	test('incremental results preserve other chats and reject stale details or removed chat identities', async () => {
		const { supervisor, state } = harness();
		state.response = '{"topics":[{"label":"Deployment","sessions":[0]}],"summaries":[{"session":0,"summary":"First summary."}]}';
		supervisor.update([{ ...source(), details: 'ready' }]);
		supervisor.setEnabled(true);
		await timeout(0);
		assert.strictEqual(supervisor.getSummary('chat-0')?.text, 'First summary.');
		state.barrier = new DeferredPromise<void>();
		const next = { ...source('chat-1'), details: 'ready' as const };
		supervisor.update([{ ...source(), details: 'ready' }, next]);
		const refresh = supervisor.refresh();
		await timeout(0);
		supervisor.update([{ ...source(), details: 'ready' }, { ...next, prompt: 'Changed after analysis started' }]);
		await state.barrier.complete();
		await refresh;
		assert.strictEqual(supervisor.getSummary('chat-0')?.text, 'First summary.');
		assert.strictEqual(supervisor.getSummary('chat-1'), undefined, 'A late result must not describe a newer snapshot');
		supervisor.update([]);
		assert.deepStrictEqual(supervisor.topics, []);
		assert.strictEqual(supervisor.getSummary('chat-0'), undefined);
	});

	test('all seventy chats are covered incrementally with one request at a time and no sixty-chat cutoff', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		const sources = Array.from({ length: 70 }, (_, index) => ({ ...source(`chat-${index}`), details: 'ready' as const }));
		supervisor.update(sources);
		supervisor.setEnabled(true);
		await clock.tickAsync(0);
		const firstSummary = supervisor.getSummary('chat-0')?.text;
		for (let batch = 1; batch < 9; batch++) {
			await clock.tickAsync(projectBoardSupervisorLimits.refreshInterval);
			assert.strictEqual(state.requests.length, batch + 1);
		}
		assert.strictEqual(supervisor.completed, 70);
		assert.strictEqual(supervisor.queued, 0);
		assert.strictEqual(supervisor.getSummary('chat-0')?.text, firstSummary);
		assert.ok(supervisor.getSummary('chat-69')?.text);
		assert.strictEqual(supervisor.topics[0].cardIds.size, 70);
		assert.ok(state.requests.every(request => {
			const content = request.messages[1].content[0];
			return content.type === 'text' && JSON.parse(content.value).chats.length <= 8;
		}));
		const count = state.requests.length;
		supervisor.update(sources);
		await clock.tickAsync(projectBoardSupervisorLimits.refreshInterval * 2);
		assert.strictEqual(state.requests.length, count, 'Unchanged snapshots consume no additional model calls');
	});

	test('summary schema requires exactly one bounded plain-text brief per supplied chat', () => {
		const sources = [source('a'), source('b')];
		const summary = (session: number, text = 'Known task.') => ({ session, summary: text });
		assert.deepStrictEqual([...parseProjectBoardAnalysis(JSON.stringify({ topics: [], summaries: [summary(0), summary(1)] }), sources).summaries], [['a', 'Known task.'], ['b', 'Known task.']]);
		for (const summaries of [
			[], [summary(0)], [summary(0), summary(0)], [summary(0), summary(2)],
			[summary(0), summary(1, '')], [summary(0), summary(1, 'x'.repeat(401))], [summary(0), summary(1, 'Two\nlines')],
		]) {
			assert.throws(() => parseProjectBoardAnalysis(JSON.stringify({ topics: [], summaries }), sources));
		}
	});

	test('a second refresh cannot overlap inference and arriving details remain queued for a later batch', async () => {
		const { supervisor, state } = harness();
		state.barrier = new DeferredPromise<void>();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await timeout(0);
		supervisor.update([source(), source('later')]);
		await supervisor.refresh();
		assert.strictEqual(state.requests.length, 1);
		await state.barrier.complete();
		await timeout(0);
		assert.strictEqual(supervisor.completed, 1);
		assert.strictEqual(supervisor.queued, 1);
		state.barrier = undefined;
		await supervisor.refresh();
		assert.strictEqual(supervisor.completed, 2);
		assert.strictEqual(supervisor.topics[0].cardIds.size, 2);
	});

	test('unavailable history produces explicitly limited metadata-only summaries rather than blocking other chats', async () => {
		const { supervisor, state } = harness();
		supervisor.update([{ ...source(), details: 'unavailable' }, { ...source('waiting'), details: 'pending' }]);
		supervisor.setEnabled(true);
		await timeout(0);
		assert.strictEqual(supervisor.getSummary('chat-0')?.limited, true);
		assert.strictEqual(supervisor.getSummary('waiting'), undefined);
		assert.deepStrictEqual({ completed: supervisor.completed, waiting: supervisor.waiting, requests: state.requests.length }, { completed: 1, waiting: 1, requests: 1 });
	});

	test('pausing preserves partial results and resumes the unfinished queue without reanalyzing finished chats', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		supervisor.update(Array.from({ length: 20 }, (_, index) => source(`chat-${index}`)));
		supervisor.setEnabled(true);
		await clock.tickAsync(0);
		assert.strictEqual(supervisor.completed, 8);
		supervisor.setActive(false);
		await clock.tickAsync(240_000);
		assert.strictEqual(state.requests.length, 1);
		supervisor.setActive(true);
		await clock.tickAsync(1000);
		assert.strictEqual(supervisor.completed, 16);
		assert.strictEqual(state.requests.length, 2);
	});

	test('updates topic membership once per chat, replaces old memberships and removes disappeared chats', async () => {
		const { supervisor, state } = harness();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await timeout(0);
		supervisor.update([source(), source('second')]);
		state.response = '{"topics":[{"label":"deployment","sessions":[0]}],"summaries":[{"session":0,"summary":"Second task."}]}';
		await supervisor.refresh();
		assert.strictEqual(supervisor.topics.length, 1);
		assert.strictEqual(supervisor.topics[0].cardIds.size, 2);
		supervisor.update([{ ...source(), prompt: 'New topic' }, source('second')]);
		state.response = '{"topics":[{"label":"Testing","sessions":[0]}],"summaries":[{"session":0,"summary":"Testing task."}]}';
		await supervisor.refresh();
		assert.deepStrictEqual(supervisor.topics.map(topic => [topic.label, [...topic.cardIds]]), [['deployment', ['second']], ['Testing', ['chat-0']]]);
		supervisor.update([{ ...source(), prompt: 'New topic' }]);
		assert.deepStrictEqual(supervisor.topics.map(topic => [...topic.cardIds]), [['chat-0']]);
	});

	test('fuzzy filter combines terms across fields and supports abbreviated noncontiguous matches', () => {
		assert.strictEqual(matchesProjectBoardFilter('dpl API retry', ['Deployment API', 'Retry network']), true);
		assert.strictEqual(matchesProjectBoardFilter('dpl missing', ['Deployment API']), false);
		assert.strictEqual(matchesProjectBoardFilter('  ', []), true);
		assert.strictEqual(matchesProjectBoardFilter('[x]', ['Literal [x]']), true);
	});

	test('validates topic schema and maps opaque snapshot indices to exact conversation identities', () => {
		const sources = [source('provider-a\0chat'), source('provider-b\0chat')];
		assert.deepStrictEqual(parseProjectBoardTopics('```json\n{"topics":[{"label":"API","sessions":[1,1]}]}\n```', sources),
			[{ label: 'API', cardIds: new Set(['provider-b\0chat']) }]);
		for (const response of [
			'not JSON', '{}', '{"topics":[{"label":"API","sessions":[2]}]}',
			'{"topics":[{"label":"API","sessions":["0"]}]}', '{"topics":[{"label":"","sessions":[0]}]}',
			'{"topics":[{"label":"API","sessions":[0]},{"label":"api","sessions":[1]}]}',
			JSON.stringify({ topics: Array.from({ length: 7 }, (_, i) => ({ label: `Topic ${i}`, sessions: [0] })) }),
		]) {
			assert.throws(() => parseProjectBoardTopics(response, sources));
		}
		assert.deepStrictEqual(parseProjectBoardTopics('{"topics":[]}', sources), []);
	});

	test('does nothing until enabled, bounds each batch and creates a tool-free native chat transcript', async () => {
		const { supervisor, state } = harness();
		supervisor.update(Array.from({ length: 70 }, (_, i) => ({ ...source(`chat-${i}`), prompt: 'p'.repeat(2000) })));
		await supervisor.refresh();
		assert.strictEqual(state.requests.length, 0);
		supervisor.setEnabled(true);
		await timeout(0);
		assert.strictEqual(supervisor.busy, false);
		assert.strictEqual(supervisor.total, 70);
		assert.strictEqual(supervisor.completed, projectBoardSupervisorLimits.batchSize);
		const payload = state.requests[0].messages[1].content[0];
		assert.strictEqual(payload.type, 'text');
		if (payload.type !== 'text') { throw new Error('Expected text'); }
		const input = JSON.parse(payload.value).chats;
		assert.strictEqual(input.length, projectBoardSupervisorLimits.batchSize);
		assert.strictEqual(input[0].prompt.length, projectBoardSupervisorLimits.promptLength);
		assert.strictEqual(input[0].id, 0);
		assert.deepStrictEqual(state.requests[0].options, {});
		assert.strictEqual(state.starts[0]?.canUseTools, false);
		assert.strictEqual(state.transcript.length, 1);
		assert.deepStrictEqual(supervisor.topics[0].cardIds, new Set(Array.from({ length: projectBoardSupervisorLimits.batchSize }, (_, index) => `chat-${index}`)));
		assert.deepStrictEqual(state.errors, []);
	});

	test('coalesces changed snapshots, skips unchanged snapshots and pauses with the view', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await clock.tickAsync(0);
		supervisor.update([source()]);
		await clock.tickAsync(120_000);
		assert.strictEqual(state.requests.length, 1);
		supervisor.update([{ ...source(), title: 'Updated' }]);
		supervisor.setActive(false);
		await clock.tickAsync(120_000);
		assert.strictEqual(state.requests.length, 1);
		supervisor.setActive(true);
		await clock.tickAsync(1000);
		assert.strictEqual(state.requests.length, 2);
		supervisor.update([{ ...source(), title: 'Another update' }]);
		await clock.tickAsync(119_000);
		assert.strictEqual(state.requests.length, 2);
		await clock.tickAsync(1000);
		assert.strictEqual(state.requests.length, 3);
	});

	test('accepts text answers interleaved with reasoning and provider data, including batched parts', async () => {
		const { supervisor, state } = harness();
		state.parts = [
			{ type: 'thinking', value: ['Not the answer'] },
			[{ type: 'text', value: '{"topics":[' }, { type: 'data', mimeType: 'application/json', data: VSBuffer.fromString('{"usage":1}') }],
			{ type: 'text', value: '{"label":"Deployment","sessions":[0]}],"summaries":[{"session":0,"summary":"Working on deployment."}]}' },
		];
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await timeout(0);
		assert.deepStrictEqual({
			error: supervisor.error, errors: state.errors,
			topics: supervisor.topics.map(topic => ({ label: topic.label, ids: [...topic.cardIds] })),
			transcripts: state.transcript.length,
		}, { error: undefined, errors: [], topics: [{ label: 'Deployment', ids: ['chat-0'] }], transcripts: 1 });
	});

	test('releasing a filtered preview does not invalidate the bounded last-known snapshot', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await clock.tickAsync(0);
		supervisor.update([{ ...source(), prompt: undefined }]);
		assert.strictEqual(supervisor.stale, false);
		await clock.tickAsync(120_000);
		assert.strictEqual(state.requests.length, 1);
		supervisor.update([{ ...source(), prompt: '' }]);
		assert.strictEqual(supervisor.stale, true);
		await clock.tickAsync(1000);
		assert.strictEqual(state.requests.length, 2);
	});

	test('stopping cancels in-flight analysis and discards late results without notifying or creating chats', async () => {
		const { supervisor, state } = harness();
		state.barrier = new DeferredPromise<void>();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await timeout(0);
		supervisor.setEnabled(false);
		assert.strictEqual(state.requests[0].token.isCancellationRequested, true);
		await state.barrier.complete();
		await timeout(0);
		assert.deepStrictEqual(supervisor.topics, []);
		assert.deepStrictEqual(state.starts, []);
		assert.deepStrictEqual(state.errors, []);
	});

	test('timeout stops automatic retries and cancellation remains silent on disposal', async () => {
		const clock = sinon.useFakeTimers();
		store.add(toDisposable(() => clock.restore()));
		const { supervisor, state } = harness();
		state.barrier = new DeferredPromise<void>();
		supervisor.update([source()]);
		supervisor.setEnabled(true);
		await clock.tickAsync(45_000);
		assert.match(supervisor.error!, /timed out/);
		assert.strictEqual(state.errors.length, 1);
		assert.strictEqual(state.requests[0].token.isCancellationRequested, true);
		supervisor.update([{ ...source(), title: 'Changed' }]);
		await clock.tickAsync(240_000);
		assert.strictEqual(state.requests.length, 1);
		const retry = supervisor.refresh();
		await clock.tickAsync(0);
		supervisor.dispose();
		await retry;
		await state.barrier.complete();
		assert.strictEqual(state.errors.length, 1);
		assert.strictEqual(state.transcript.length, 0);
	});

	test('reports transcript write and open failures, and rotates owned references after twenty analyses', async () => {
		const { supervisor, state } = harness();
		supervisor.update([source()]);
		state.appendError = true;
		supervisor.setEnabled(true);
		await timeout(0);
		assert.match(supervisor.error!, /Transcript write failed/);
		assert.strictEqual(supervisor.topics.length, 0);
		state.appendError = false;
		for (let i = 0; i < 21; i++) {
			await supervisor.refresh();
		}
		assert.strictEqual(state.starts.length, 2);
		assert.strictEqual(state.disposedModels, 1);
		assert.strictEqual(state.transcript.length, 21);
		await supervisor.openTranscript();
		assert.deepStrictEqual(state.opened, ['vscodeLocalChatSession:supervisor']);
		assert.match(state.errors[1], /could not be opened/);
		supervisor.dispose();
		assert.strictEqual(state.disposedModels, 2);
	});

	for (const failure of ['model', 'schema', 'tool', 'size', 'empty'] as const) {
		test(`reports ${failure} failure explicitly without fabricated topics, and supports retry`, async () => {
			const { supervisor, state } = harness();
			state.available = failure !== 'model';
			if (failure === 'schema') { state.response = '{"topics":[{"label":"Wrong","sessions":[99]}]}'; }
			if (failure === 'size') { state.response = 'x'.repeat(16_001); }
			if (failure === 'tool') { state.part = { type: 'tool_use', toolCallId: 'call', name: 'run', parameters: {} }; }
			if (failure === 'empty') { state.part = { type: 'thinking', value: 'No answer' }; }
			supervisor.update([source()]);
			supervisor.setEnabled(true);
			await timeout(0);
			assert.ok(supervisor.error);
			if (failure === 'empty') {
				assert.match(supervisor.error, /no text answer.*Refresh Topics/);
			}
			assert.strictEqual(state.errors.length, 1);
			assert.strictEqual(supervisor.topics.length, 0);
			assert.deepStrictEqual(state.starts, []);
			state.available = true;
			state.part = undefined;
			state.response = '{"topics":[{"label":"Retry","sessions":[0]}],"summaries":[{"session":0,"summary":"Retry summary."}]}';
			await supervisor.refresh();
			assert.strictEqual(supervisor.error, undefined);
			assert.strictEqual(supervisor.topics[0].label, 'Retry');
		});
	}
});
