/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationChangeEvent } from '../../../../../../../platform/configuration/common/configuration.js';
import { ApiRequestError } from '../../../../../../../platform/github/common/missionControl/missionControlClient.js';
import { GetTaskResponse, ITasksClient, TaskEvent } from '../../../../../../../platform/github/common/missionControl/tasks.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../../../../../platform/extensions/common/extensions.js';
import { ChatSessionStatus, IChatSessionContentProvider, IChatSessionsService, SessionType } from '../../../../../chat/common/chatSessionsService.js';
import { IChatAgentImplementation, IChatAgentRequest, IChatAgentService } from '../../../../../chat/common/participants/chatAgents.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { CloudAutomationStore } from '../../browser/cloudAutomationStore.js';
import { CloudAutomationTaskConversations } from '../../browser/cloudAutomationTaskConversations.js';
import { CloudAutomationTaskRegistration } from '../../browser/cloudAutomationTaskRegistration.js';
import { ICloudAutomationTaskAccess } from '../../browser/githubCloudAutomationStore.js';

suite('Cloud automation task conversations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.from({ scheme: SessionType.CopilotCloud, path: '/task/original' });
	const date = '2026-01-01T00:00:00Z';
	const user = (id: string, type: string, content: string): TaskEvent => ({ id, parentId: null, timestamp: date, type, data: { content } });
	const original: GetTaskResponse = { id: 'original', automation_id: 'automation', created_at: date, remote_steerable: true, state: 'completed', sessions: [{ id: 'first', created_at: date, state: 'completed', prompt: 'Execution instructions', event_content: 'Review' }] };
	type Tasks = Pick<ITasksClient, 'get' | 'getEvents' | 'steer'>;
	const request = upcastPartial<IChatAgentRequest>({ sessionResource: resource, message: 'Continue', variables: { variables: [] } });
	function setup(tasks: Tasks, getAutomationPrompt: ICloudAutomationTaskAccess['getAutomationPrompt'] = async () => assert.fail('Event content should not require a prompt lookup')) {
		const access: ICloudAutomationTaskAccess = { isKnownRun: () => false, getAutomationPrompt, withTasks: async (token, operation) => { CancellationToken.throwIfCanceled(token); return operation(tasks, token); } };
		return { access, controller: disposables.add(new CloudAutomationTaskConversations(access, new NullLogService())) };
	}

	test('reopens the original task, deduplicates paged history, and steers it only on an explicit reply', async () => {
		const calls: string[] = [];
		let replied = false;
		const responses = [user('request', 'user.message', 'Review'), user('answer', 'assistant.message', 'Done')];
		const { controller } = setup({
			get: async id => {
				calls.push(`read:${id}`);
				return replied ? { ...original, sessions: [...original.sessions!, { id: 'next', created_at: date, state: 'completed' }] } : original;
			},
			getEvents: async (id, _token, options) => {
				calls.push(`events:${id}:${options?.query?.page}`);
				const events = replied ? [...responses, user('reply', 'user.message', 'Continue'), user('continued', 'assistant.message', 'Continued')] : responses;
				return options?.query?.page === 1 ? { data: { events: events.slice(0, 1), total: events.length }, nextLink: 'next' } : { data: { events, total: events.length } };
			},
			steer: async (id, value) => { calls.push(`steer:${id}:${JSON.stringify(value)}`); replied = true; },
		});
		const row = await controller.resolveChatSessionItem(resource, CancellationToken.None);
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const opening = [...calls];
		const initial = session.history.map(turn => turn.type === 'request' ? turn.prompt : turn.parts.map(part => part.kind === 'markdownContent' && part.content.value));
		const streamed: string[] = [];
		await session.requestHandler!(request, parts => streamed.push(...parts.flatMap(part => part.kind === 'markdownContent' ? [part.content.value] : [])), [], CancellationToken.None);
		assert.deepStrictEqual({ row: row?.resource, status: row?.status, opening, initial, writes: calls.filter(call => call.startsWith('steer:')), streamed }, {
			row: resource, status: ChatSessionStatus.Completed, opening: ['read:original', 'read:original', 'events:original:1', 'events:original:2'],
			initial: ['Review', ['Done']], writes: ['steer:original:{"type":"user_message","content":"Continue"}'], streamed: ['Continued'],
		});
	});

	test('rejects malformed, unrelated and mismatched resources before reading or writing their transcript', async () => {
		const reads: string[] = [];
		const { controller } = setup({
			get: async id => { reads.push(id); return id === 'unrelated' ? { ...original, id, automation_id: undefined } : original; },
			getEvents: async () => assert.fail('Unexpected transcript read'), steer: async () => assert.fail('Unexpected write'),
		});
		for (const bad of [resource.with({ scheme: 'cloud-sandbox' }), resource.with({ path: '/untitled' }), resource.with({ path: '/task/unrelated' }), resource.with({ path: '/task/wrong' })]) {
			assert.strictEqual(await controller.resolveChatSessionItem(bad, CancellationToken.None), undefined);
		}
		assert.deepStrictEqual({ reads, items: controller.items }, { reads: ['unrelated', 'wrong'], items: [] });
	});

	test('observed active history refreshes to the terminal task, not the stale session state', () => runWithFakedTimers({}, async () => {
		let reads = 0;
		const { controller } = setup({
			get: async () => ({ ...original, state: reads++ === 0 ? 'in_progress' : 'failed', sessions: [{ ...original.sessions![0], state: 'in_progress' }] }),
			getEvents: async () => ({ data: { events: [], total: 0 } }), steer: async () => assert.fail('Opening must not steer'),
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const history = await Event.toPromise(session.onDidChangeHistory!);
		assert.deepStrictEqual({ reads, failed: history.some(item => item.type === 'response' && !!item.errorDetails), status: controller.items[0].status }, { reads: 2, failed: true, status: ChatSessionStatus.Failed });
	}));

	test('an observed run recovers from a transient history read without steering or polling past completion', () => runWithFakedTimers({}, async () => {
		let reads = 0;
		const { controller } = setup({
			get: async () => ({ ...original, state: reads < 2 ? 'in_progress' : 'completed' }),
			getEvents: async () => {
				if (++reads === 2) {
					throw new ApiRequestError(503, 'server');
				}
				const events = reads === 1 ? [] : [user('answer', 'assistant.message', 'Recovered')];
				return { data: { events, total: events.length } };
			},
			steer: async () => assert.fail('Retrying a read must not steer'),
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const updates: string[] = [];
		disposables.add(session.onDidChangeHistory!(history => updates.push(...history.flatMap(turn => turn.type === 'response' ? turn.parts.flatMap(part => part.kind === 'markdownContent' ? [part.content.value] : []) : []))));
		await timeout(60_000);
		assert.deepStrictEqual({ reads, updates }, { reads: 3, updates: ['Recovered'] });
	}));

	test('a pending user message does not take output from the confirmed turn', async () => {
		const pending = { ...user('queued', 'user.message', 'Next'), pending: true };
		const events = [user('first', 'user.message', 'First'), pending, user('answer', 'assistant.message', 'Still answering First')];
		const { controller } = setup({
			get: async () => ({ ...original, sessions: [{ ...original.sessions![0], event_content: 'First' }] }), getEvents: async () => ({ data: { events, total: events.length } }), steer: async () => assert.fail('Unexpected write'),
		});

		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		assert.deepStrictEqual(session.history.map(turn => turn.type === 'request' ? turn.prompt : turn.parts.map(part => part.kind === 'markdownContent' && part.content.value)), [
			'First', ['Still answering First'],
		]);
	});

	test('only the first automation prompt is replaced or hidden; the response and later requests survive', async () => {
		const events = [
			{ ...user('first', 'user.message', 'Execution instructions'), data: { content: 'Execution instructions', transformedContent: 'Execution instructions' } },
			user('answer', 'assistant.message', 'Done'), user('next', 'user.message', 'Explain'),
		];
		const rendered = async (eventContent: string | null, prompt: string | Error, withEvents = true) => {
			let lookups = 0;
			const { controller } = setup({
				get: async () => ({ ...original, sessions: [{ ...original.sessions![0], event_content: eventContent }] }),
				getEvents: async () => ({ data: { events: withEvents ? events : [], total: withEvents ? events.length : 0 } }),
				steer: async () => assert.fail('Opening must not steer'),
			}, async () => {
				lookups++;
				if (prompt instanceof Error) { throw prompt; }
				return prompt;
			});
			const { history } = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
			return { lookups, turns: history.map(turn => turn.type === 'request' ? [turn.prompt, !!turn.isRequestHidden] : turn.parts.map(part => part.kind === 'markdownContent' && part.content.value)) };
		};
		assert.deepStrictEqual([
			await rendered('Trigger text', 'Configured'),
			await rendered(null, 'Recorded revision'),
			await rendered(null, new Error('Revision unavailable')),
			await rendered('', 'Recorded revision', false),
		], [
			{ lookups: 0, turns: [['Trigger text', false], ['Done'], ['Explain', false], []] },
			{ lookups: 1, turns: [['Recorded revision', false], ['Done'], ['Explain', false], []] },
			{ lookups: 1, turns: [['', true], ['Done'], ['Explain', false], []] },
			{ lookups: 1, turns: [['Recorded revision', false], []] },
		]);
	});

	test('steering an active task waits past prior completion for the confirmed reply and only streams its output', () => runWithFakedTimers({}, async () => {
		let polls = 0;
		let writes = 0;
		const echo = user('echo', 'user.message', request.message);
		const old = user('old-answer', 'assistant.message', 'Previous answer');
		const { controller } = setup({
			get: async () => ({ ...original, state: writes ? 'completed' : 'in_progress' }),
			getEvents: async () => {
				const events = [user('previous-echo', 'user.message', request.message)];
				if (writes) {
					polls++;
					events.push({ ...echo, pending: polls < 3 }, old);
					if (polls === 3) {
						events.push(user('new-answer', 'assistant.message', 'New answer'));
					}
				}
				return { data: { events, total: events.length } };
			},
			steer: async () => { writes++; },
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const answers: string[] = [];
		await session.requestHandler!(request, parts => answers.push(...parts.flatMap(part => part.kind === 'markdownContent' ? [part.content.value] : [])), [], CancellationToken.None);
		assert.deepStrictEqual({ polls, answers, writes }, { polls: 3, answers: ['New answer'], writes: 1 });
	}));

	test('a user echo on the previous completed turn is not the answer to an accepted reply', () => runWithFakedTimers({}, async () => {
		let sent = false;
		let polls = 0;
		const { controller } = setup({
			get: async () => original,
			getEvents: async () => {
				const events = sent ? [user('late', 'assistant.message', 'Previous turn'), user('echo', 'user.message', request.message)] : [];
				if (sent && ++polls === 2) {
					events.push(user('new', 'assistant.message', 'New answer'));
				}
				return { data: { events, total: events.length } };
			},
			steer: async () => { assert.strictEqual(sent, false); sent = true; },
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const answers: string[] = [];
		await session.requestHandler!(request, parts => answers.push(...parts.flatMap(part => part.kind === 'markdownContent' ? [part.content.value] : [])), [], CancellationToken.None);
		assert.deepStrictEqual({ polls, answers }, { polls: 2, answers: ['New answer'] });
	}));

	test('an accepted reply survives a transient event read without resending the message', () => runWithFakedTimers({}, async () => {
		let writes = 0;
		const reads: number[] = [];
		const { controller } = setup({
			get: async () => original,
			getEvents: async () => {
				if (writes) {
					reads.push(Date.now());
					if (reads.length === 1) {
						throw new ApiRequestError(503, 'server', undefined, undefined, 10);
					}
				}
				const events = writes ? [user('echo', 'user.message', request.message), user('answer', 'assistant.message', 'Done')] : [];
				return { data: { events, total: events.length } };
			},
			steer: async () => { writes++; },
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		const answers: string[] = [];
		await session.requestHandler!(request, parts => answers.push(...parts.flatMap(part => part.kind === 'markdownContent' ? [part.content.value] : [])), [], CancellationToken.None);
		assert.deepStrictEqual({ reads: reads.length, honoredRetryAfter: reads[1] - reads[0] >= 10_000, answers, writes }, { reads: 2, honoredRetryAfter: true, answers: ['Done'], writes: 1 });
	}));

	for (const cancel of [false, true]) {
		test(`accepted reply read retries stop on ${cancel ? 'cancellation' : 'exhaustion'}`, () => runWithFakedTimers({}, async () => {
			const source = disposables.add(new CancellationTokenSource());
			let writes = 0;
			let failedReads = 0;
			const { controller } = setup({
				get: async () => {
					if (writes) {
						failedReads++;
						if (cancel && failedReads === 1) {
							void timeout(1).then(() => source.cancel());
						}
						throw new ApiRequestError(503, 'server');
					}
					return original;
				},
				getEvents: async () => ({ data: { events: [], total: 0 } }),
				steer: async () => { writes++; },
			});
			const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
			const outcome = await session.requestHandler!(request, () => { }, [], source.token).then(
				() => 'completed',
				(error: Error) => isCancellationError(error) ? 'cancelled' : error.message,
			);
			assert.deepStrictEqual({ failedReads, writes, outcome }, {
				failedReads: cancel ? 1 : 4, writes: 1,
				outcome: cancel ? 'cancelled' : 'GitHub accepted the reply, but its progress could not be read. Reopen this run to check it.',
			});
		}));
	}

	test('disposal discards a late account read and an uncertain steer is never replayed', async () => {
		let writes = 0;
		const delayed = new DeferredPromise<GetTaskResponse>();
		let read = Promise.resolve(original);
		const { controller } = setup({
			get: () => read, getEvents: async () => ({ data: { events: [], total: 0 } }),
			steer: async () => { writes++; throw new Error('Acknowledgement lost'); },
		});
		const session = disposables.add(await controller.provideChatSessionContent(resource, CancellationToken.None));
		await assert.rejects(session.requestHandler!(request, () => { }, [], CancellationToken.None), /Acknowledgement lost/);
		read = delayed.p;
		const pending = controller.provideChatSessionContent(resource, CancellationToken.None);
		controller.dispose();
		await delayed.complete(original);
		await assert.rejects(pending, isCancellationError);
		assert.deepStrictEqual({ rows: controller.items, writes }, { rows: [], writes: 1 });
	});

	test('an absent contribution allows fallback; an installed contribution or explicit opt-out does not', async () => {
		const writes: string[] = [];
		const { access } = setup({
			get: async () => original,
			getEvents: async () => ({ data: { events: writes.length ? [user('echo', 'user.message', request.message), user('response', 'assistant.message', 'Done')] : [], total: writes.length * 2 } }),
			steer: async id => { writes.push(id); },
		});
		let installed = false;
		const changed = disposables.add(new Emitter<{ added: readonly IExtensionDescription[]; removed: readonly IExtensionDescription[] }>());
		const owner = upcastPartial<IExtensionDescription>({ contributes: { chatSessions: [{ type: SessionType.CopilotCloud }] } });
		const extensions = upcastPartial<IExtensionService>({
			whenInstalledExtensionsRegistered: async () => true, onDidChangeExtensions: changed.event, get extensions() { return installed ? [owner] : []; },
		});
		const config = new TestConfigurationService({ github: { copilot: { chat: { cloudAgent: { enabled: false } } } } });
		disposables.add(config.onDidChangeConfigurationEmitter);
		let registrations = 0;
		let content: IChatSessionContentProvider | undefined;
		let participant: IChatAgentImplementation | undefined;
		const sessions = upcastPartial<IChatSessionsService>({
			getChatSessionContribution: () => undefined,
			registerChatSessionContribution: () => Disposable.None, registerChatSessionItemController: () => Disposable.None,
			registerChatSessionContentProvider: (_type, provider) => { content = provider; registrations++; return toDisposable(() => { content = undefined; registrations--; }); },
			getOrCreateChatSession: async (uri, token) => disposables.add(await content!.provideChatSessionContent(uri, token)),
		});
		const agents = upcastPartial<IChatAgentService>({
			getAgent: () => undefined, registerDynamicAgent: (_data, impl) => { participant = impl; return toDisposable(() => participant = undefined); },
		});
		const registration = disposables.add(new CloudAutomationTaskRegistration(upcastPartial<CloudAutomationStore>({ taskAccess: observableValue<ICloudAutomationTaskAccess | undefined>('access', access) }), extensions, config, sessions, agents, new NullLogService()));
		const state = async () => ({ resolved: await registration.resolve(resource), registrations });
		const disabled = await state();
		await config.setUserConfiguration('github.copilot.chat.cloudAgent.enabled', true);
		config.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
		const absent = await state();
		await participant!.invoke(request, () => { }, [], CancellationToken.None);
		installed = true;
		changed.fire({ added: [owner], removed: [] });
		assert.deepStrictEqual({ disabled, absent, installed: await state(), writes }, {
			disabled: { resolved: false, registrations: 0 }, absent: { resolved: true, registrations: 1 }, installed: { resolved: undefined, registrations: 0 }, writes: ['original'],
		});
	});
});
