/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgent, IAgentChats, IAgentCreateChatRequestOptions, IAgentModelInfo } from '../../common/agent.js';
import { CopilotModelTeamConfigKey, CopilotModelTeamRememberedConfigKey, copilotModelTeamSchema } from '../../common/copilotModelTeam.js';
import { AgentHostPersistentTeamMetaKey, readAgentHostPersistentTeamState } from '../../common/meta/agentHostPersistentTeamMeta.js';
import { toAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import type { ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, createErrorResponsePart, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus, type Message, type ModelSelection, type Turn } from '../../common/state/sessionState.js';
import { AgentHostPersistentTeamService } from '../../node/agentHostPersistentTeamService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createPersistentTeamServerToolGroup } from '../../node/shared/persistentTeamServerTools.js';
import { PersistentTeamToolName } from '../../common/serverToolNames.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';

interface ISavedPeer {
	readonly providerData: string;
	readonly title: string;
	readonly turns: Turn[];
	model: ModelSelection;
	error?: Error;
}

suite('AgentHostPersistentTeamService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('copilotcli:/persistent-team');
	const leadChat = URI.parse(buildDefaultChatUri(session));
	const team = { worker: { id: 'worker-model' }, scout: { id: 'scout-model' } };
	const models: readonly IAgentModelInfo[] = ['worker-model', 'scout-model', 'replacement'].map(id => ({
		id, name: id, provider: 'copilotcli', supportsVision: false,
		configSchema: { type: 'object', properties: { thinkingLevel: { type: 'string', title: 'Reasoning', enum: ['high', 'low'] } } },
	}));

	function harness(database = new TestSessionDatabase(), catalog = new Map<string, ISavedPeer>(), ready = true, providerModels = models) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session.toString(), provider: 'copilotcli', title: 'Team', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		});
		stateManager.setSessionConfig(session.toString(), {
			schema: copilotModelTeamSchema.toProtocol(),
			values: { [CopilotModelTeamConfigKey]: team, [CopilotModelTeamRememberedConfigKey]: team, autoApprove: 'default', sandboxEnabled: 'on' },
		});
		if (ready) {
			stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
		}
		for (const [chat, saved] of catalog) {
			stateManager.registerRestoredChatSummary(session.toString(), chat, {
				title: saved.title, providerData: saved.providerData,
				resolver: async () => {
					if (saved.error) {
						throw saved.error;
					}
					return { turns: saved.turns };
				},
			});
		}
		const changedModels: Array<{ chat: string; model: ModelSelection }> = [];
		const sends: string[] = [];
		const agent = new class extends mock<IAgent>() {
			override readonly models = constObservable(providerModels);
			override readonly chats = new class extends mock<IAgentChats>() {
				override getModel(chat: URI): ModelSelection | undefined {
					return catalog.get(chat.toString())?.model;
				}
				override async changeModel(chat: URI, model: ModelSelection): Promise<void> {
					changedModels.push({ chat: chat.toString(), model });
					const saved = catalog.get(chat.toString());
					if (saved) {
						saved.model = model;
					}
				}
				override async sendMessage(chat: URI): Promise<void> {
					sends.push(chat.toString());
				}
			}();
		}();
		const service = disposables.add(new AgentHostPersistentTeamService(stateManager, createTestAgentHostProviderService(() => agent), createSessionDataService(database), new NullLogService()));
		disposables.add(stateManager.onDidEmitEnvelope(envelope => service.observeAction({
			session: session.toString(), channel: envelope.channel, action: envelope.action, rejectionReason: envelope.rejectionReason,
		})));
		const created: Array<{ chat: string; options: IAgentCreateChatRequestOptions }> = [];
		let createGate: (() => Promise<void>) | undefined;
		disposables.add(service.registerHost({
			createChat: async (_session, chat, options) => {
				created.push({ chat: chat.toString(), options });
				await createGate?.();
				const model = options.model!;
				const providerData = JSON.stringify({ sdkSessionId: `sdk-${chat.path}`, model });
				catalog.set(chat.toString(), { providerData, model, title: options.title!, turns: [] });
				stateManager.addChat(session.toString(), chat.toString(), { providerData, title: options.title });
			},
		}));
		const configure = (value: object) => stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionConfigChanged, config: { [CopilotModelTeamConfigKey]: value },
		});
		const start = (chat: string, turnId: string, message: Message) => stateManager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted, turnId, message, startedAt: new Date(0).toISOString(),
		});
		const finish = (chat: string, turnId: string, reason: ITurnEnd['reason'] = { kind: 'success' }, text = `${turnId} report`) => {
			if (reason.kind === 'success') {
				stateManager.dispatchServerAction(chat, { type: ActionType.ChatResponsePart, turnId, part: { kind: ResponsePartKind.Markdown, id: `${turnId}-result`, content: text } });
				stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId, duration: 0 });
			} else if (reason.kind === 'error') {
				stateManager.dispatchServerAction(chat, { type: ActionType.ChatError, turnId, duration: 0, part: createErrorResponsePart(reason.error) });
			} else if (reason.kind === 'cancelled') {
				stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnCancelled, turnId, duration: 0 });
			}
			const saved = catalog.get(chat);
			if (saved) {
				saved.turns.splice(0, saved.turns.length, ...stateManager.getChatState(chat)!.turns);
			}
			service.observeTurnEnd({ session: session.toString(), channel: chat, turnId, reason });
		};
		return { service, stateManager, database, catalog, created, changedModels, sends, configure, start, finish, setCreateGate: (gate: () => Promise<void>) => { createGate = gate; } };
	}

	function assignment(leadTurnId: string): Message {
		return {
			text: 'Perform your part of the task', origin: { kind: MessageKind.Agent },
			_meta: toAgentMessageDelegationMeta({ sourceSession: session.toString(), sourceChat: leadChat.toString(), sourceTurnId: leadTurnId }),
		};
	}

	async function taskHarness() {
		const h = harness();
		h.start(leadChat.toString(), 'task', { text: 'Work as a team', origin: { kind: MessageKind.User } });
		await h.service.prepareTurn(session.toString(), leadChat.toString());
		const state = await h.service.getState(session, leadChat);
		assert.ok(state);
		for (const member of state.members) {
			await h.service.manageWork(session.toString(), leadChat.toString(), 'task', {
				action: 'assign', role: member.role, objective: `${member.role} engineering`, deliverable: `${member.role} verified result`,
			});
		}
		const review = async (role: 'worker' | 'scout', accept = true, feedback = 'Verified the deliverable and its test evidence') => {
			const assignment = (await h.service.getState(session, leadChat))?.task?.assignments.find(member => member.role === role);
			assert.ok(assignment?.reportMessageId);
			await h.service.manageWork(session.toString(), leadChat.toString(), 'task', {
				action: 'review', role, reportId: assignment.reportMessageId, accept, feedback,
			});
		};
		const acceptReports = async () => {
			for (const assignment of (await h.service.getState(session, leadChat))?.task?.assignments ?? []) {
				if (assignment.state === 'reported' && !assignment.reviewed) {
					await review(assignment.role);
				}
			}
		};
		return { ...h, members: state.members, review, acceptReports, stop: (token = CancellationToken.None) => h.service.beforeStop(session.toString(), leadChat.toString(), 'task', token) };
	}

	test('skipping a teammate cannot complete and correction is bounded', async () => {
		const h = await taskHarness();
		const correction = await h.stop();
		await assert.rejects(h.stop(), /did not assign work/);
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			namesBoth: correction?.includes('worker:') && correction.includes('scout:'),
			state: state?.task?.state,
			assignments: state?.task?.assignments.map(assignment => assignment.state),
			completionBlocked: !!h.service.completionError(session.toString(), leadChat.toString(), 'task'),
			sends: h.sends,
		}, { namesBoth: true, state: 'blocked', assignments: ['unassigned', 'unassigned'], completionBlocked: true, sends: [] });
	});

	test('unplanned token participation cannot satisfy an engineer deliverable', async () => {
		const h = harness();
		h.start(leadChat.toString(), 'task', { text: 'Build the feature', origin: { kind: MessageKind.User } });
		await h.service.prepareTurn(session.toString(), leadChat.toString());
		for (const member of (await h.service.getState(session, leadChat))!.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role, { kind: 'success' }, 'Looks good');
		}
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			assignments: state?.task?.assignments.map(member => member.state),
			reports: h.stateManager.getChatState(leadChat.toString())?.queuedMessages ?? [],
			lead: h.service.getLeadPhase(session.toString(), leadChat.toString()),
			engineers: state?.members.map(member => h.service.getLeadPhase(session.toString(), member.chat)),
		}, { assignments: ['unassigned', 'unassigned'], reports: [], lead: 'manager', engineers: [undefined, undefined] });
	});

	test('delivering a report is not reviewing it and an ignored review is bounded', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		await h.stop();
		const delivered = (await h.service.getState(session, leadChat))!.task!.assignments.map(member => ({ delivered: member.delivered, reviewed: member.reviewed }));
		const reminder = await h.stop();
		await assert.rejects(h.stop(), /did not review/);
		assert.deepStrictEqual({
			delivered,
			reminder: reminder?.includes('Explicitly review'),
			state: (await h.service.getState(session, leadChat))?.task?.state,
		}, { delivered: [{ delivered: true, reviewed: false }, { delivered: true, reviewed: false }], reminder: true, state: 'blocked' });
	});

	test('rework stays with its engineer and integration requires current accepted reports', async () => {
		const h = await taskHarness();
		const [worker] = h.members;
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		await h.stop();
		const originalReport = (await h.service.getState(session, leadChat))!.task!.assignments[0].reportMessageId!;
		await h.review('worker', false, 'Cover the empty-input edge case');
		await h.review('scout');
		await assert.rejects(h.service.manageWork(session.toString(), leadChat.toString(), 'task', { action: 'phase', phase: 'integration' }), /Accept every current/);
		const rework = (await h.service.getState(session, leadChat))!.task!.assignments[0];
		h.start(worker.chat, 'worker-rework', assignment('task'));
		h.finish(worker.chat, 'worker-rework');
		await h.service.getState(session, leadChat);
		const report = await h.stop();
		await assert.rejects(h.service.manageWork(session.toString(), leadChat.toString(), 'task', {
			action: 'review', role: 'worker', reportId: originalReport, accept: true, feedback: 'Stale approval',
		}), /exact current report/);
		await h.review('worker');
		await h.service.manageWork(session.toString(), leadChat.toString(), 'task', { action: 'phase', phase: 'integration' });
		const beforeYield = h.service.getLeadPhase(session.toString(), leadChat.toString());
		await h.stop();
		const integrating = h.service.getLeadPhase(session.toString(), leadChat.toString());
		await assert.rejects(h.service.manageWork(session.toString(), leadChat.toString(), 'task', {
			action: 'assign', role: 'worker', objective: 'More work', deliverable: 'Tests',
		}), /Return to the manager phase/);
		await h.service.manageWork(session.toString(), leadChat.toString(), 'task', { action: 'phase', phase: 'manager' });
		await h.stop();
		const managing = h.service.getLeadPhase(session.toString(), leadChat.toString());
		await h.stop();
		assert.deepStrictEqual({
			rework: { chat: rework.chat, revision: rework.revision, state: rework.state, feedback: rework.reviewFeedback },
			updatedReport: report?.includes('worker-rework report'),
			phases: [beforeYield, integrating, managing],
			state: (await h.service.getState(session, leadChat))?.task?.state,
			chatsCreated: h.created.length,
		}, {
			rework: { chat: worker.chat, revision: 2, state: 'unassigned', feedback: 'Cover the empty-input edge case' },
			updatedReport: true, phases: ['manager', 'integration', 'manager'], state: 'completed', chatsCreated: 2,
		});
	});

	test('workflow tool validates its inputs and cannot act for an engineer or send messages', async () => {
		const h = await taskHarness();
		const group = createPersistentTeamServerToolGroup(h.service);
		const context = { sessionUri: session.toString(), chatUri: leadChat.toString(), turnId: 'task' };
		assert.throws(() => group.execute(h.stateManager, context, PersistentTeamToolName, { action: 'assign', role: 'worker', objective: 'Missing deliverable' }), /Invalid manage_team input/);
		await assert.rejects(Promise.resolve(group.execute(h.stateManager, { ...context, chatUri: h.members[0].chat }, PersistentTeamToolName, { action: 'phase', phase: 'manager' })), /Only the Lead/);
		const result = await group.execute(h.stateManager, context, PersistentTeamToolName, { action: 'assign', role: 'worker', objective: 'Implementation', deliverable: 'Verified feature' });
		assert.deepStrictEqual({
			instructsOrdinarySend: result.includes('Use send_message'),
			sends: h.sends,
			permissions: h.stateManager.getSessionState(session.toString())?.config?.values.autoApprove,
			semanticContract: ['before dispatching work with send_message', 'not messages or permission approvals', 'yield'].every(text => group.definitions[0].description?.includes(text)),
		}, { instructsOrdinarySend: true, sends: [], permissions: 'default', semanticContract: true });
	});

	test('delivers finished reports while another engineer works and requires explicit acceptance', async () => {
		const h = await taskHarness();
		const [worker, scout] = h.members;
		h.start(worker.chat, 'worker-turn', assignment('task'));
		h.start(scout.chat, 'scout-turn', assignment('task'));
		await h.service.getState(session, leadChat);
		const stopping = h.stop();
		await h.service.getState(session, leadChat);
		h.stateManager.dispatchServerAction(leadChat.toString(), {
			type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'unrelated',
			message: { text: 'Next user task', origin: { kind: MessageKind.User } },
		});
		h.finish(worker.chat, 'worker-turn');
		const workerReport = await stopping;
		const workerBeforeReview = (await h.service.getState(session, leadChat))?.task?.assignments[0].reviewed;
		await h.review('worker');
		const waitingForScout = h.stop();
		h.stateManager.dispatchServerAction(leadChat.toString(), {
			type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'scout-report',
			message: {
				text: 'Explicit Scout findings', origin: { kind: MessageKind.Agent },
				_meta: toAgentMessageDelegationMeta({ sourceSession: session.toString(), sourceChat: scout.chat, sourceTurnId: 'scout-turn' }),
			},
		});
		h.finish(scout.chat, 'scout-turn');
		const scoutReport = await waitingForScout;
		h.service.observeTurnEnd({ session: session.toString(), channel: worker.chat, turnId: 'worker-turn', reason: { kind: 'success' } });
		await h.service.getState(session, leadChat);
		const beforeReview = h.service.completionError(session.toString(), leadChat.toString(), 'task');
		await h.review('scout');
		const completion = await h.stop();
		assert.deepStrictEqual({
			workerBeforeReview,
			workerIncluded: workerReport?.includes('worker-turn report'),
			scoutIncluded: scoutReport?.includes('Explicit Scout findings'),
			beforeReview: !!beforeReview,
			completion,
			task: (await h.service.getState(session, leadChat))?.task?.state,
			queued: h.stateManager.getChatState(leadChat.toString())?.queuedMessages?.map(message => message.id),
			completionError: h.service.completionError(session.toString(), leadChat.toString(), 'task'),
		}, { workerBeforeReview: false, workerIncluded: true, scoutIncluded: true, beforeReview: true, completion: undefined, task: 'completed', queued: ['unrelated'], completionError: undefined });
	});

	test('teammate failure blocks until explicit retry or removal', async () => {
		const h = await taskHarness();
		const [worker, scout] = h.members;
		h.start(worker.chat, 'worker-turn', assignment('task'));
		h.start(scout.chat, 'scout-turn', assignment('task'));
		await h.service.getState(session, leadChat);
		const stopping = assert.rejects(h.stop(), /scout.*failed verification/);
		h.finish(scout.chat, 'scout-turn', { kind: 'error', error: { errorType: 'test', message: 'failed verification' }, resumable: false });
		h.finish(worker.chat, 'worker-turn');
		await stopping;
		await assert.rejects(h.service.retryTurn(session.toString(), leadChat.toString(), 'task'), /failed verification/);
		h.configure({ worker: team.worker });
		await h.service.getState(session, leadChat);
		const continuation = await h.stop();
		await h.acceptReports();
		await h.stop();
		assert.deepStrictEqual({
			remainingReport: continuation?.includes('worker-turn report'),
			task: (await h.service.getState(session, leadChat))?.task?.state,
			scout: (await h.service.getState(session, leadChat))?.task?.assignments.find(member => member.role === 'scout')?.state,
			sends: h.sends,
		}, { remainingReport: true, task: 'completed', scout: 'removed', sends: [] });
	});

	test('waiting is cancellable without extra model requests', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
		}
		await h.service.getState(session, leadChat);
		const cts = disposables.add(new CancellationTokenSource());
		const waiting = assert.rejects(h.stop(cts.token), /Canceled/);
		await h.service.getState(session, leadChat);
		cts.cancel();
		await waiting;
		assert.deepStrictEqual(h.sends, []);
	});

	test('direct user turns and stale reports do not satisfy assignments', async () => {
		const h = await taskHarness();
		h.start(h.members[0].chat, 'direct', { text: 'Direct question', origin: { kind: MessageKind.User } });
		h.finish(h.members[0].chat, 'direct');
		h.start(h.members[1].chat, 'stale', assignment('older-task'));
		h.finish(h.members[1].chat, 'stale');
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			assignments: state?.task?.assignments.map(member => member.state),
			reports: h.stateManager.getChatState(leadChat.toString())?.queuedMessages ?? [],
		}, { assignments: ['unassigned', 'unassigned'], reports: [] });
	});

	test('later tasks reuse chats but never count previous results', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		await h.stop();
		await h.acceptReports();
		await h.stop();
		h.finish(leadChat.toString(), 'task');
		h.start(leadChat.toString(), 'next-task', { text: 'Next assignment', origin: { kind: MessageKind.User } });
		await h.service.prepareTurn(session.toString(), leadChat.toString());
		h.service.observeTurnEnd({ session: session.toString(), channel: h.members[0].chat, turnId: 'worker', reason: { kind: 'success' } });
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			chats: state?.members.map(member => member.chat),
			created: h.created.length,
			task: state?.task?.leadTurnId,
			assignments: state?.task?.assignments.map(member => member.state),
		}, { chats: h.members.map(member => member.chat), created: 2, task: 'next-task', assignments: ['unassigned', 'unassigned'] });
	});

	test('a new user turn is tracked even when emitted outside ordinary send preparation', async () => {
		const h = await taskHarness();
		h.finish(leadChat.toString(), 'task', { kind: 'cancelled' });
		h.start(leadChat.toString(), 'steered-task', { text: 'Use this new direction', origin: { kind: MessageKind.User } });
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			lead: state?.task?.leadTurnId,
			assignments: state?.task?.assignments.map(assignment => assignment.state),
			incomplete: !!h.service.completionError(session.toString(), leadChat.toString(), 'steered-task'),
		}, { lead: 'steered-task', assignments: ['unassigned', 'unassigned'], incomplete: true });
	});

	test('an untracked active user task cannot claim successful completion', async () => {
		const h = harness();
		await h.service.getState(session, leadChat);
		h.start(leadChat.toString(), 'new-task', { text: 'Work together', origin: { kind: MessageKind.User } });
		assert.match(h.service.completionError(session.toString(), leadChat.toString(), 'new-task') ?? '', /could not be tracked/);
		await h.service.getState(session, leadChat);
		assert.match(h.service.completionError(session.toString(), leadChat.toString(), 'new-task') ?? '', /incomplete/);
	});

	test('queued assignments count without starting duplicate helper work', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.stateManager.dispatchServerAction(member.chat, {
				type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: member.role, message: assignment('task'),
			});
		}
		const state = await h.service.getState(session, leadChat);
		const cts = disposables.add(new CancellationTokenSource());
		const waiting = assert.rejects(h.stop(cts.token), /Canceled/);
		await h.service.getState(session, leadChat);
		cts.cancel();
		await waiting;
		assert.deepStrictEqual({
			assignments: state?.task?.assignments.map(member => ({ state: member.state, message: member.messageId })),
			reminder: (await h.service.getState(session, leadChat))?.task?.assignmentReminderSent,
			sends: h.sends,
		}, { assignments: [{ state: 'queued', message: 'worker' }, { state: 'queued', message: 'scout' }], reminder: false, sends: [] });
	});

	test('turning Team off stops automatic reports without cancelling ordinary chats', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
		}
		await h.service.getState(session, leadChat);
		h.configure({});
		await h.service.getState(session, leadChat);
		for (const member of h.members) {
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			completion: await h.stop(),
			reports: h.stateManager.getChatState(leadChat.toString())?.queuedMessages ?? [],
			chats: h.catalog.size,
		}, { completion: undefined, reports: [], chats: 2 });
	});

	test('changing future Team membership does not rewrite a completed task', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		await h.stop();
		await h.acceptReports();
		await h.stop();
		const completed = (await h.service.getState(session, leadChat))?.task;
		h.service.observeTurnEnd({ session: session.toString(), channel: leadChat.toString(), turnId: 'task', reason: { kind: 'cancelled' } });
		h.configure({});
		const off = (await h.service.getState(session, leadChat))?.task;
		h.configure(team);
		const on = (await h.service.getState(session, leadChat))?.task;
		assert.deepStrictEqual({ off, on }, { off: completed, on: completed });
	});

	test('explicitly retrying a pre-enforcement Team turn creates its required assignments', async () => {
		const h = harness();
		const roster = await h.service.getState(session, leadChat);
		await h.service.retryTurn(session.toString(), leadChat.toString(), 'legacy-turn');
		const state = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			chats: state?.members.map(member => member.chat),
			lead: state?.task?.leadTurnId,
			assignments: state?.task?.assignments.map(assignment => assignment.state),
			created: h.created.length,
		}, { chats: roster?.members.map(member => member.chat), lead: 'legacy-turn', assignments: ['unassigned', 'unassigned'], created: 2 });
	});

	test('teammate-to-teammate follow-up work remains part of the original task', async () => {
		const h = await taskHarness();
		const [worker, scout] = h.members;
		h.start(worker.chat, 'implementation', assignment('task'));
		h.start(scout.chat, 'review', assignment('task'));
		await h.service.getState(session, leadChat);
		const feedback: Message = {
			text: 'Address this review finding', origin: { kind: MessageKind.Agent },
			_meta: toAgentMessageDelegationMeta({ sourceSession: session.toString(), sourceChat: scout.chat, sourceTurnId: 'review' }),
		};
		h.stateManager.dispatchServerAction(worker.chat, {
			type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'feedback', message: feedback,
		});
		h.finish(worker.chat, 'implementation');
		h.finish(scout.chat, 'review');
		const queued = await h.service.getState(session, leadChat);
		h.start(worker.chat, 'address-review', feedback);
		h.finish(worker.chat, 'address-review');
		await h.service.getState(session, leadChat);
		const synthesis = await h.stop();
		assert.deepStrictEqual({
			queued: queued?.task?.assignments[0].state,
			includesFinalWork: synthesis?.includes('address-review report'),
			includesReview: synthesis?.includes('review report'),
			keepsOriginalVerification: synthesis?.includes('implementation report'),
		}, { queued: 'queued', includesFinalWork: true, includesReview: true, keepsOriginalVerification: true });
	});

	test('cold restore requires explicit retry and reuses saved reports without rerunning helpers', async () => {
		const h = await taskHarness();
		for (const member of h.members) {
			h.start(member.chat, member.role, assignment('task'));
			h.finish(member.chat, member.role);
		}
		await h.service.getState(session, leadChat);
		await h.stop();
		await h.database.setTurnEventId('task', 'task-event');
		for (const member of h.members) {
			await h.database.setTurnEventId(member.role, `${member.role}-event`);
			const saved = h.catalog.get(member.chat)!;
			saved.turns.splice(0, saved.turns.length, ...saved.turns.map(turn => ({ ...turn, id: `${member.role}-event` })));
		}
		const restored = harness(h.database, h.catalog);
		await restored.service.restoreSessionIdentity(session);
		const before = (await restored.service.getState(session, leadChat))?.task?.state;
		await restored.service.retryTurn(session.toString(), leadChat.toString(), 'task-event');
		const continuation = await restored.service.beforeStop(session.toString(), leadChat.toString(), 'task-event', CancellationToken.None);
		assert.deepStrictEqual({
			before,
			worker: continuation?.includes('worker report'),
			scout: continuation?.includes('scout report'),
			created: restored.created.length,
			sends: restored.sends,
		}, { before: 'blocked', worker: true, scout: true, created: 0, sends: [] });
	});

	test('creates ordinary chats once, awaits setup, and never starts inference', async () => {
		const h = harness();
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		h.setCreateGate(async () => { await entered.complete(); await release.p; });
		const first = h.service.getState(session, leadChat);
		const second = h.service.getState(session, leadChat);
		await entered.p;
		assert.strictEqual(h.created.length, 1);
		await release.complete();
		const states = await Promise.all([first, second]);
		assert.deepStrictEqual({
			sameRoster: states[0]?.members.map(member => member.chat),
			reusedRoster: states[1]?.members.map(member => member.chat),
			options: h.created.map(item => item.options),
			interactivity: states[0]?.members.map(member => h.stateManager.getChatState(member.chat)?.interactivity),
			sends: h.sends,
			modelChanges: h.changedModels,
			draftModels: states[0]?.members.map(member => h.stateManager.getChatState(member.chat)?.draft?.model),
			approvals: h.stateManager.getSessionState(session.toString())?.config?.values.autoApprove,
			sandbox: h.stateManager.getSessionState(session.toString())?.config?.values.sandboxEnabled,
		}, {
			sameRoster: h.created.map(item => item.chat), reusedRoster: h.created.map(item => item.chat),
			options: [{ model: team.worker, title: 'Worker' }, { model: team.scout, title: 'Scout' }],
			interactivity: [undefined, undefined], sends: [], modelChanges: [], approvals: 'default', sandbox: 'on',
			draftModels: [team.worker, team.scout],
		});
	});

	test('an explicit teammate message model overrides its seeded draft without losing draft text', async () => {
		const h = harness();
		const state = await h.service.getState(session, leadChat);
		const worker = state!.members[0];
		h.stateManager.dispatchServerAction(worker.chat, {
			type: ActionType.ChatDraftChanged, draft: { text: 'Keep this note', origin: { kind: MessageKind.User }, model: team.worker },
		});
		h.start(worker.chat, 'direct-model', { text: 'Direct task', origin: { kind: MessageKind.User }, model: { id: 'replacement' } });
		await h.service.prepareTurn(session.toString(), worker.chat);
		assert.deepStrictEqual({
			draft: h.stateManager.getChatState(worker.chat)?.draft,
			member: (await h.service.getState(session, leadChat))?.members[0].model,
		}, { draft: { text: 'Keep this note', origin: { kind: MessageKind.User }, model: { id: 'replacement' } }, member: { id: 'replacement' } });
	});

	test('creation failure is awaited and does not publish a usable roster', async () => {
		const h = harness();
		h.setCreateGate(async () => { throw new Error('ordinary create failed'); });
		await assert.rejects(h.service.getState(session, leadChat), /ordinary create failed/);
		assert.deepStrictEqual({
			roster: readAgentHostPersistentTeamState(h.stateManager.getSessionState(session.toString())),
			catalog: [...h.catalog.keys()], sends: h.sends,
		}, { roster: undefined, catalog: [], sends: [] });
	});

	test('provisional drafts stay configuration-only until the normal first-turn setup', async () => {
		const h = harness(undefined, undefined, false);
		const before = await h.service.getState(session, leadChat);
		const createdBefore = h.created.length;
		h.stateManager.dispatchServerAction(leadChat.toString(), {
			type: ActionType.ChatTurnStarted, turnId: 'first', startedAt: new Date(0).toISOString(),
			message: { text: 'first task', origin: { kind: MessageKind.User } },
		});
		await h.service.prepareTurn(session.toString(), leadChat.toString());
		assert.deepStrictEqual({ before, createdBefore, createdAfter: h.created.length, sends: h.sends }, {
			before: undefined, createdBefore: 0, createdAfter: 2, sends: [],
		});
	});

	test('cold reload preserves exact peer backings, history, and selected models', async () => {
		const first = harness();
		const roster = (await first.service.getState(session, leadChat))!;
		const worker = roster.members[0];
		first.stateManager.dispatchServerAction(worker.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'earlier', startedAt: new Date(0).toISOString(),
			message: { text: 'previous work', origin: { kind: MessageKind.User } },
		});
		first.stateManager.dispatchServerAction(worker.chat, { type: ActionType.ChatTurnComplete, turnId: 'earlier', duration: 1 });
		first.catalog.get(worker.chat)!.turns.push(...first.stateManager.getChatState(worker.chat)!.turns);
		const backings = [...first.catalog].map(([chat, saved]) => [chat, saved.providerData]);
		const second = harness(first.database, first.catalog);
		await second.service.restoreSessionIdentity(session);
		const restored = await second.service.getState(session, leadChat);
		assert.deepStrictEqual({
			roster: restored, created: second.created, sends: second.sends,
			backings: [...second.catalog].map(([chat, saved]) => [chat, saved.providerData]),
			history: second.stateManager.getChatState(worker.chat)?.turns.map(turn => turn.message.text),
		}, { roster, created: [], sends: [], backings, history: ['previous work'] });
	});

	test('Off/On and Scout removal retain ordinary chats without inference', async () => {
		const h = harness();
		const original = (await h.service.getState(session, leadChat))!;
		h.configure({});
		const off = await h.service.getState(session, leadChat);
		h.configure({ worker: team.worker });
		const noScout = await h.service.getState(session, leadChat);
		h.configure(team);
		const on = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			off: off?.members.map(member => member.enabled),
			noScout: noScout?.members.map(member => member.enabled),
			on, created: h.created.length, catalog: [...h.catalog.keys()], sends: h.sends,
		}, { off: [false, false], noScout: [true, false], on: original, created: 2, catalog: original.members.map(member => member.chat), sends: [] });
	});

	test('role models are ordinary drafts and apply on the next addressed turn', async () => {
		const h = harness();
		const original = (await h.service.getState(session, leadChat))!;
		const worker = original.members[0];
		const model = { id: 'replacement', config: { thinkingLevel: 'high' } };
		h.configure({ ...team, worker: model });
		h.stateManager.dispatchClientAction(worker.chat, {
			type: ActionType.ChatDraftChanged, draft: { text: '', origin: { kind: MessageKind.User }, model },
		}, { clientId: 'user', clientSeq: 1 });
		const changed = await h.service.getState(session, leadChat);
		h.stateManager.dispatchServerAction(worker.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'delegated', startedAt: new Date(0).toISOString(),
			message: { text: 'work', origin: { kind: MessageKind.Agent } },
		});
		await h.service.prepareTurn(session.toString(), worker.chat);
		assert.deepStrictEqual({
			chats: changed?.members.map(member => member.chat),
			model: changed?.members[0].model,
			draft: h.stateManager.getChatState(worker.chat)?.draft?.model,
			changes: h.changedModels, created: h.created.length, sends: h.sends,
		}, { chats: original.members.map(member => member.chat), model, draft: model, changes: [{ chat: worker.chat, model }], created: 2, sends: [] });
	});

	test('direct user messages and composer model changes keep normal origin and selection', async () => {
		const h = harness();
		const roster = (await h.service.getState(session, leadChat))!;
		const scout = roster.members[1];
		const model = { id: 'replacement', config: { thinkingLevel: 'low' } };
		h.stateManager.dispatchClientAction(scout.chat, {
			type: ActionType.ChatDraftChanged, draft: { text: 'direct question', origin: { kind: MessageKind.User }, model },
		}, { clientId: 'user', clientSeq: 1 });
		const immediateModel = readAgentHostPersistentTeamState(h.stateManager.getSessionState(session.toString()))?.members[1].model;
		h.stateManager.dispatchServerAction(scout.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'direct', startedAt: new Date(0).toISOString(),
			message: { text: 'direct question', origin: { kind: MessageKind.User }, model },
		});
		await h.service.prepareTurn(session.toString(), scout.chat);
		await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			origin: h.stateManager.getChatState(scout.chat)?.activeTurn?.message.origin,
			selected: h.stateManager.getSessionState(session.toString())?.config?.values[CopilotModelTeamConfigKey],
			remembered: h.stateManager.getSessionState(session.toString())?.config?.values[CopilotModelTeamRememberedConfigKey],
			model: readAgentHostPersistentTeamState(h.stateManager.getSessionState(session.toString()))?.members[1].model,
			immediateModel,
			sends: h.sends,
		}, { origin: { kind: MessageKind.User }, selected: { ...team, scout: model }, remembered: { ...team, scout: model }, model, immediateModel: model, sends: [] });
	});

	test('Lead preparation never reapplies stale initial models over ordinary teammate drafts', async () => {
		const h = harness();
		const roster = (await h.service.getState(session, leadChat))!;
		const worker = roster.members[0];
		const model = { id: 'replacement', config: { thinkingLevel: 'low' } };
		h.stateManager.dispatchClientAction(worker.chat, {
			type: ActionType.ChatDraftChanged, draft: { text: 'next question', origin: { kind: MessageKind.User }, model },
		}, { clientId: 'user', clientSeq: 1 });
		h.configure(team);
		await h.service.prepareTurn(session.toString(), leadChat.toString());
		assert.deepStrictEqual({
			model: readAgentHostPersistentTeamState(h.stateManager.getSessionState(session.toString()))?.members[0].model,
			draft: h.stateManager.getChatState(worker.chat)?.draft,
			preferences: h.stateManager.getSessionState(session.toString())?.config?.values[CopilotModelTeamConfigKey],
			created: h.created.length, sdkChanges: h.changedModels,
		}, {
			model, draft: { text: 'next question', origin: { kind: MessageKind.User }, model },
			preferences: { ...team, worker: model }, created: 2, sdkChanges: [],
		});
	});

	test('restored ordinary provider models supersede unavailable initial Team preferences', async () => {
		const first = harness();
		const roster = (await first.service.getState(session, leadChat))!;
		const worker = roster.members[0];
		const model = { id: 'replacement' };
		first.catalog.get(worker.chat)!.model = model;
		const h = harness(first.database, first.catalog, true, models.filter(model => model.id !== 'worker-model'));
		await h.service.restoreSessionIdentity(session);
		const restored = await h.service.getState(session, leadChat);
		assert.deepStrictEqual({
			model: restored?.members[0].model,
			chat: restored?.members[0].chat,
			preferences: h.stateManager.getSessionState(session.toString())?.config?.values[CopilotModelTeamConfigKey],
			created: h.created,
		}, { model, chat: worker.chat, preferences: { ...team, worker: model }, created: [] });
	});

	test('a direct teammate message is not gated by another role configuration failure', async () => {
		const h = harness();
		const roster = (await h.service.getState(session, leadChat))!;
		const scout = roster.members[1];
		h.configure({ worker: { id: 'missing-model' }, scout: team.scout });
		h.stateManager.dispatchServerAction(scout.chat, {
			type: ActionType.ChatTurnStarted, turnId: 'direct', startedAt: new Date(0).toISOString(),
			message: { text: 'a direct question', origin: { kind: MessageKind.User }, model: team.scout },
		});
		await h.service.prepareTurn(session.toString(), scout.chat);
		assert.deepStrictEqual({
			message: h.stateManager.getChatState(scout.chat)?.activeTurn?.message.text,
			created: h.created.length, sends: h.sends,
		}, { message: 'a direct question', created: 2, sends: [] });
	});

	test('missing saved chats fail visibly and never silently allocate replacements', async () => {
		const first = harness();
		const original = (await first.service.getState(session, leadChat))!;
		const second = harness(first.database);
		const unavailable = await second.service.getState(session, leadChat);
		await assert.rejects(second.service.prepareTurn(session.toString(), leadChat.toString()), /saved worker chat is unavailable/);
		assert.deepStrictEqual({
			state: unavailable?.state, chats: unavailable?.members.map(member => member.chat),
			errors: unavailable?.members.map(member => member.error?.code), created: second.created,
		}, { state: 'unavailable', chats: original.members.map(member => member.chat), errors: ['chatUnavailable', 'chatUnavailable'], created: [] });
	});

	test('only saved roster chats require a validated materialization result', async () => {
		const h = harness();
		const ordinary = URI.parse(buildChatUri(session, 'ordinary-without-backing'));
		await h.service.validateRestoredChat(session, ordinary, undefined);
		const roster = (await h.service.getState(session, leadChat))!;
		for (const chat of [leadChat, ...roster.members.map(member => URI.parse(member.chat))]) {
			await assert.rejects(h.service.validateRestoredChat(session, chat, undefined), /saved Team chat.*no valid backing/);
			await h.service.validateRestoredChat(session, chat, { providerData: 'validated-opaque-backing' });
		}
		await h.service.validateRestoredChat(session, ordinary, undefined);
		assert.deepStrictEqual({
			chats: [...h.catalog.keys()], roster: readAgentHostPersistentTeamState(h.stateManager.getSessionState(session.toString())),
			created: h.created.length, sends: h.sends,
		}, { chats: roster.members.map(member => member.chat), roster, created: 2, sends: [] });
	});

	test('ordinary resume errors retain saved history and confirmed reset changes only the current role', async () => {
		const first = harness();
		const original = (await first.service.getState(session, leadChat))!;
		const worker = original.members[0];
		first.catalog.get(worker.chat)!.error = new Error('saved history cannot resume');
		const h = harness(first.database, first.catalog);
		const unavailable = await h.service.getState(session, leadChat);
		const request = { session: session.toString(), leadChat: leadChat.toString(), role: worker.role, expectedMemberChat: worker.chat };
		const reset = await h.service.resetMember(request);
		await assert.rejects(h.service.resetMember(request), /changed while reset/);
		assert.deepStrictEqual({
			error: unavailable?.members[0].error?.message, ready: reset.state,
			replaced: reset.members[0].chat !== worker.chat,
			scout: reset.members[1].chat,
			retained: h.catalog.has(worker.chat), oldError: h.catalog.get(worker.chat)?.error?.message,
			created: h.created.length, sends: h.sends,
		}, { error: 'saved history cannot resume', ready: 'ready', replaced: true, scout: original.members[1].chat, retained: true, oldError: 'saved history cannot resume', created: 1, sends: [] });
	});

	test('malformed saved membership is not interpreted as a new team', async () => {
		const h = harness();
		await h.database.setMetadata(AgentHostPersistentTeamMetaKey, '{"version":2,"members":false}');
		await assert.rejects(h.service.getState(session, leadChat), /identity is invalid/);
		assert.deepStrictEqual(h.created, []);
	});
});
