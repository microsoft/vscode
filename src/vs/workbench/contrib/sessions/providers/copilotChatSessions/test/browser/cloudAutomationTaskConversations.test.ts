/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
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
	const original: GetTaskResponse = { id: 'original', automation_id: 'automation', created_at: date, remote_steerable: true, state: 'completed', sessions: [{ id: 'first', created_at: date, state: 'completed', prompt: 'Review' }] };
	type Tasks = Pick<ITasksClient, 'get' | 'getEvents' | 'steer'>;
	const request = upcastPartial<IChatAgentRequest>({ sessionResource: resource, message: 'Continue', variables: { variables: [] } });
	function setup(tasks: Tasks, known = false) {
		const access: ICloudAutomationTaskAccess = { isKnownRun: () => known, withTasks: async (token, operation) => { CancellationToken.throwIfCanceled(token); return operation(tasks, token); } };
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
