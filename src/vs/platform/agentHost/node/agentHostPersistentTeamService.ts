/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { hasKey } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgentCreateChatRequestOptions, IAgentCreateChatResult } from '../common/agent.js';
import type { AgentHostTeamLeadPhase, AgentHostTeamWorkRequest, IAgentHostPersistentTeamMember, IAgentHostPersistentTeamReset, IAgentHostPersistentTeamState, IAgentHostTeamAssignment, IAgentHostTeamTask } from '../common/agentHostPersistentTeam.js';
import type { IDispatchedAction, ITurnEnd } from '../common/agentHostChatContributionsService.js';
import { CopilotModelTeamConfigKey, CopilotModelTeamRememberedConfigKey, parseCopilotModelTeam, validateCopilotModelTeam, type ICopilotModelTeam } from '../common/copilotModelTeam.js';
import { AgentHostPersistentTeamMetaKey, readAgentHostPersistentTeamState, toAgentHostPersistentTeamMeta } from '../common/meta/agentHostPersistentTeamMeta.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../common/meta/agentMessageDelegationMeta.js';
import { buildOpenSessionLinkForChatResource } from '../common/openSessionLink.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType } from '../common/state/sessionActions.js';
import { buildChatUri, chatStorageUri, MessageKind, parseChatUri, PendingMessageKind, ResponsePartKind, SessionLifecycle, SessionStatus, ToolCallCancellationReason, ToolCallStatus, type ModelSelection } from '../common/state/sessionState.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostPersistentTeamService = createDecorator<IAgentHostPersistentTeamService>('agentHostPersistentTeamService');

interface IPersistentTeamHost {
	createChat(session: URI, chat: URI, options: IAgentCreateChatRequestOptions): Promise<void>;
}

export interface IAgentHostPersistentTeamService {
	readonly _serviceBrand: undefined;
	readonly onDidBlockTask: Event<{ readonly chat: string; readonly turnId: string; readonly error: string }>;
	registerHost(host: IPersistentTeamHost): IDisposable;
	getState(session: URI, leadChat: URI): Promise<IAgentHostPersistentTeamState | undefined>;
	resetMember(request: IAgentHostPersistentTeamReset): Promise<IAgentHostPersistentTeamState>;
	prepareTurn(session: string, chat: string): Promise<void>;
	restoreSessionIdentity(session: URI): Promise<void>;
	readStoredState(session: URI): Promise<IAgentHostPersistentTeamState | undefined>;
	validateRestoredChat(session: URI, chat: URI, result: IAgentCreateChatResult | void): Promise<void>;
	observeAction(action: IDispatchedAction): void;
	observeTurnEnd(turn: ITurnEnd): void;
	beforeStop(session: string, chat: string, turnId: string, token: CancellationToken): Promise<string | undefined>;
	completionError(session: string, chat: string, turnId: string): string | undefined;
	retryTurn(session: string, chat: string, turnId: string): Promise<void>;
	getLeadPhase(session: string, chat: string): AgentHostTeamLeadPhase | undefined;
	manageWork(session: string, chat: string, turnId: string, request: AgentHostTeamWorkRequest): Promise<string>;
}

/** Persists role-to-peer-chat references; ordinary chat lifecycle and messaging own execution. */
export class AgentHostPersistentTeamService extends Disposable implements IAgentHostPersistentTeamService {
	declare readonly _serviceBrand: undefined;

	private readonly _operations = new SequencerByKey<string>();
	private readonly _taskChanged = this._register(new Emitter<string>());
	private readonly _onDidBlockTask = this._register(new Emitter<{ readonly chat: string; readonly turnId: string; readonly error: string }>());
	readonly onDidBlockTask = this._onDidBlockTask.event;
	private _host: IPersistentTeamHost | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@ISessionDataService private readonly _sessionData: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (!envelope.rejectionReason && envelope.origin && envelope.action.type === ActionType.ChatDraftChanged && envelope.action.draft?.model) {
				this._rememberSelection(envelope.channel, envelope.action.draft.model);
			}
		}));
	}

	registerHost(host: IPersistentTeamHost): IDisposable {
		if (this._host) {
			throw new Error('Persistent team host already registered');
		}
		this._host = host;
		return toDisposable(() => { this._host = undefined; });
	}

	getState(session: URI, leadChat: URI): Promise<IAgentHostPersistentTeamState | undefined> {
		return this._operations.queue(session.toString(), () => this._prepare(session, leadChat));
	}

	getLeadPhase(session: string, chat: string): AgentHostTeamLeadPhase | undefined {
		const current = this._stateManager.getSessionState(session);
		if (current?.provider !== 'copilotcli' || current.defaultChat !== chat || !parseCopilotModelTeam(current.config?.values[CopilotModelTeamConfigKey])) {
			return undefined;
		}
		return readAgentHostPersistentTeamState(current)?.task?.leadPhase ?? 'manager';
	}

	manageWork(session: string, chat: string, turnId: string, request: AgentHostTeamWorkRequest): Promise<string> {
		return this._operations.queue(session, async () => {
			const state = this._currentTask(session, turnId);
			const task = state?.task;
			if (!state?.enabled || state.leadChat !== chat || !task || ['completed', 'blocked', 'cancelled'].includes(task.state)) {
				throw new Error('Only the Lead of an active Team task can manage its work.');
			}
			if (request.action === 'phase') {
				if (request.phase === 'integration' && !this._canIntegrate(task)) {
					throw new Error('Accept every current engineer report and wait for all engineer work to finish before requesting integration.');
				}
				if ((task.leadPhase ?? 'manager') === request.phase) {
					return `The Lead is already in the ${request.phase} phase.`;
				}
				await this._storeState(URI.parse(session), { ...state, task: { ...task, requestedLeadPhase: request.phase } });
				return `The ${request.phase} phase is requested. Yield now; the host will change the available tools before continuing this same task.`;
			}
			if (task.leadPhase === 'integration' || task.requestedLeadPhase) {
				throw new Error('Return to the manager phase and yield before assigning or reviewing engineering work.');
			}
			const assignment = task.assignments.find(member => member.role === request.role && member.state !== 'removed');
			if (!assignment) {
				throw new Error(`The ${request.role} is not a required member of this task.`);
			}
			let updated: IAgentHostTeamAssignment;
			if (request.action === 'assign') {
				if (assignment.objective === request.objective && assignment.deliverable === request.deliverable && assignment.state !== 'blocked') {
					return `The ${request.role} already owns that deliverable. Use send_message if its assignment has not been sent.`;
				}
				if (assignment.state !== 'unassigned' && !(assignment.state === 'reported' && assignment.reviewed)) {
					throw new Error('Review or finish the current assignment before replacing it.');
				}
				updated = {
					role: assignment.role, chat: assignment.chat, state: 'unassigned',
					objective: request.objective, deliverable: request.deliverable, revision: (assignment.revision ?? 0) + 1,
				};
			} else {
				if (assignment.state !== 'reported' || assignment.reportMessageId !== request.reportId || !assignment.delivered) {
					throw new Error('Review the exact current report delivered by the host, not an older or unfinished assignment.');
				}
				updated = request.accept
					? { ...assignment, reviewed: true, reviewFeedback: request.feedback }
					: {
						role: assignment.role, chat: assignment.chat, state: 'unassigned',
						objective: assignment.objective, deliverable: assignment.deliverable,
						revision: (assignment.revision ?? 0) + 1, reviewFeedback: request.feedback,
					};
			}
			await this._storeState(URI.parse(session), {
				...state, task: {
					...task, state: 'working', assignmentReminderSent: false, reviewReminderSent: false,
					assignments: task.assignments.map(member => member === assignment ? updated : member),
				},
			});
			return updated.reviewed
				? `Accepted the ${request.role} report.`
				: `The ${request.role} owns revision ${updated.revision}: ${updated.objective}\nDeliverable: ${updated.deliverable}\nUse send_message to ${buildOpenSessionLinkForChatResource(updated.chat)} to ${request.action === 'review' ? `request these corrections: ${request.feedback}` : 'dispatch this assignment'}.`;
		});
	}

	private _canIntegrate(task: IAgentHostTeamTask): boolean {
		return task.assignments.every(assignment => assignment.state === 'removed'
			|| (assignment.state === 'reported' && assignment.reviewed === true
				&& !this._stateManager.getChatState(assignment.chat)?.activeTurn
				&& !this._stateManager.getChatState(assignment.chat)?.queuedMessages?.length));
	}

	async prepareTurn(session: string, chat: string): Promise<void> {
		const chatState = this._stateManager.getChatState(chat);
		const current = this._stateManager.getSessionState(session);
		if (!current?.defaultChat || current.provider !== 'copilotcli') {
			return;
		}
		const roster = readAgentHostPersistentTeamState(current);
		const messageModel = chatState?.activeTurn?.message.model;
		if (messageModel && roster?.members.some(member => member.chat === chat)) {
			this._stateManager.dispatchServerAction(chat, {
				type: ActionType.ChatDraftChanged,
				draft: { text: '', origin: { kind: MessageKind.User }, ...chatState?.draft, model: messageModel },
			});
		}
		this._rememberSelection(chat, messageModel ?? chatState?.draft?.model);
		if (!roster && !Object.hasOwn(current.config?.values ?? {}, CopilotModelTeamConfigKey)) {
			return;
		}
		if (chat === current.defaultChat) {
			const state = await this.getState(URI.parse(session), URI.parse(current.defaultChat));
			if (state?.enabled && state.state === 'unavailable') {
				throw new Error(state.error?.message ?? localize('persistentTeam.unavailable', "A teammate could not be restored. Open its chat for details, or explicitly reset it."));
			}
			const turn = chatState?.activeTurn;
			if (state?.enabled && turn?.message.origin.kind === MessageKind.User && !this._isLeadTurn(state.task, turn.id)) {
				await this._operations.queue(session, () => this._beginTask(session, state, turn.id));
			} else if ((state?.task?.state === 'blocked' || state?.task?.state === 'cancelled') && turn?.message.origin.kind === MessageKind.Agent) {
				throw new Error(state.task.error ?? localize('persistentTeam.taskBlocked', "The Team task is blocked. Retry the affected teammate, then retry the Lead."));
			}
			return;
		}
		const member = roster?.members.find(member => member.chat === chat);
		if (member && !chatState?.activeTurn?.message.model) {
			const provider = this._providers.getProviderForSession(session);
			const context = createAgentChatContext(this._stateManager, session, chat);
			const chatUri = URI.parse(chat);
			const model = chatState?.draft?.model ?? provider?.chats.getModel?.(chatUri, context) ?? member.model;
			await provider?.chats.changeModel(chatUri, model, context);
		}
	}

	resetMember(request: IAgentHostPersistentTeamReset): Promise<IAgentHostPersistentTeamState> {
		return this._operations.queue(request.session, async () => {
			const session = URI.parse(request.session);
			const leadChat = URI.parse(request.leadChat);
			this._assertAddress(session, leadChat);
			const previous = await this._readState(session);
			const member = previous?.members.find(member => member.role === request.role);
			if (!previous || !member || previous.leadChat !== request.leadChat || member.chat !== request.expectedMemberChat) {
				throw new Error(localize('persistentTeam.staleReset', "The teammate changed while reset was being confirmed. Reopen its reset action."));
			}
			const oldChat = this._stateManager.getChatState(member.chat);
			if (oldChat?.activeTurn || oldChat?.queuedMessages?.length || (previous.task?.state !== 'completed' && this._stateManager.getChatState(previous.leadChat)?.activeTurn)) {
				throw new Error(localize('persistentTeam.resetBusy', "Stop the Lead and teammate, and clear the teammate's queued messages before resetting it."));
			}
			const selected = parseCopilotModelTeam(this._stateManager.getSessionState(request.session)?.config?.values[CopilotModelTeamConfigKey]);
			const replacement = await this._createMember(session, member.role, selected?.[member.role] ?? member.model, !!selected?.[member.role]);
			const state: IAgentHostPersistentTeamState = {
				...previous,
				enabled: selected !== undefined,
				state: 'ready',
				error: undefined,
				members: previous.members.map(current => current.role === member.role ? replacement : { ...current, enabled: !!selected?.[current.role] }),
				...(previous.task && previous.task.state !== 'completed' ? {
					task: {
						...previous.task, state: 'working', error: undefined, assignmentReminderSent: false,
						assignments: previous.task.assignments.map(assignment => assignment.role === member.role
							? { role: assignment.role, chat: replacement.chat, state: 'unassigned' } : assignment),
					}
				} : {}),
			};
			await this._storeState(session, state);
			return (await this._prepare(session, leadChat))!;
		});
	}

	async readStoredState(session: URI): Promise<IAgentHostPersistentTeamState | undefined> {
		const state = await this._readState(session);
		if (!state?.task) {
			return state;
		}
		return {
			...state, task: {
				...state.task,
				leadEventId: await this._turnEventId(state.leadChat, state.task.leadTurnId) ?? state.task.leadEventId,
				assignments: await Promise.all(state.task.assignments.map(async assignment => ({
					...assignment,
					...(assignment.turnId ? { eventId: await this._turnEventId(assignment.chat, assignment.turnId) ?? assignment.eventId } : {}),
				}))),
			},
		};
	}

	async restoreSessionIdentity(session: URI): Promise<void> {
		const state = await this.readStoredState(session);
		if (state) {
			await this._storeState(session, state.task && state.task.state !== 'completed' ? {
				...state, task: {
					...state.task, state: 'blocked',
					error: localize('persistentTeam.interrupted', "The Team task was interrupted. Retry explicitly after checking the teammates; no work has been restarted."),
					assignments: state.task.assignments.map(assignment => assignment.state === 'reported' || assignment.state === 'removed' || assignment.state === 'unassigned'
						? { ...assignment, delivered: false, reviewed: assignment.revision !== undefined && assignment.reviewed === true }
						: { ...assignment, state: 'blocked', error: localize('persistentTeam.assignmentInterrupted', "The assignment was interrupted. Retry it explicitly.") }),
				},
			} : state);
		}
	}

	async validateRestoredChat(session: URI, chat: URI, result: IAgentCreateChatResult | void): Promise<void> {
		if (result?.providerData !== undefined) {
			return;
		}
		const state = await this._readState(session);
		if (state && (state.leadChat === chat.toString() || state.members.some(member => member.chat === chat.toString()))) {
			throw new Error(localize('persistentTeam.invalidSavedBacking', "The saved Team chat '{0}' has no valid backing. Its history has not been replaced.", chat.toString()));
		}
	}

	observeAction(observed: IDispatchedAction): void {
		if (observed.rejectionReason) {
			return;
		}
		const action = observed.action;
		if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
			return;
		}
		const message = action.message;
		const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(observed.session));
		if (action.type === ActionType.ChatTurnStarted && message?.origin.kind === MessageKind.User && state?.enabled && state.leadChat === observed.channel) {
			this._runTaskOperation(observed.session, async () => {
				const current = readAgentHostPersistentTeamState(this._stateManager.getSessionState(observed.session));
				if (current?.enabled && !this._isLeadTurn(current.task, action.turnId)) {
					await this._beginTask(observed.session, current, action.turnId);
				}
			});
			return;
		}
		if (!message || message.origin.kind !== MessageKind.Agent) {
			return;
		}
		const source = readAgentMessageDelegationMeta(message);
		if (!source || !hasKey(source, { sourceSession: true })) {
			return;
		}
		const task = state?.task;
		const fromLead = source.sourceChat === state?.leadChat && source.sourceTurnId !== undefined && this._isLeadTurn(task, source.sourceTurnId);
		const fromAssignment = state && source.sourceChat !== undefined && source.sourceTurnId !== undefined
			&& this._taskTurnIds(state).get(source.sourceChat)?.has(source.sourceTurnId);
		if (!state?.enabled || !task || task.state === 'cancelled' || task.state === 'completed' || (task.state === 'blocked' && fromLead)
			|| source.sourceSession !== observed.session || (!fromLead && !fromAssignment)
			|| !task.assignments.some(assignment => assignment.chat === observed.channel && assignment.state !== 'removed' && assignment.objective && assignment.deliverable)) {
			return;
		}
		this._runTaskOperation(observed.session, async () => {
			const current = this._currentTask(observed.session, task.leadTurnId);
			if (!current?.task || current.task.state === 'cancelled' || current.task.state === 'completed' || (current.task.state === 'blocked' && fromLead)) {
				return;
			}
			const assignment: Partial<IAgentHostTeamAssignment> = action.type === ActionType.ChatTurnStarted
				? { state: 'working', turnId: action.turnId, messageId: undefined }
				: { state: 'queued', messageId: action.id, turnId: undefined };
			await this._storeState(URI.parse(observed.session), {
				...current,
				task: {
					...current.task, state: current.task.state === 'blocked' ? 'blocked' : 'working', error: current.task.state === 'blocked' ? current.task.error : undefined,
					assignments: current.task.assignments.map(member => member.chat === observed.channel
						? { ...member, ...assignment, eventId: undefined, reportMessageId: undefined, delivered: false, reviewed: false, error: undefined } : member),
				},
			});
		});
	}

	observeTurnEnd(turn: ITurnEnd): void {
		const current = readAgentHostPersistentTeamState(this._stateManager.getSessionState(turn.session));
		if (!current?.task || current.task.state === 'completed' || !turn.turnId) {
			return;
		}
		const leadTurnId = current.task.leadTurnId;
		this._runTaskOperation(turn.session, async () => {
			const state = this._currentTask(turn.session, leadTurnId);
			if (!state?.enabled || !state.task) {
				return;
			}
			if (turn.channel === state.leadChat && this._isLeadTurn(state.task, turn.turnId!)) {
				if (turn.reason.kind === 'cancelled' || turn.reason.kind === 'error') {
					await this._storeState(URI.parse(turn.session), {
						...state, task: {
							...state.task,
							state: turn.reason.kind === 'cancelled' ? 'cancelled' : 'blocked',
							error: turn.reason.kind === 'error' ? turn.reason.error.message : localize('persistentTeam.taskCancelled', "The Lead was stopped. Retry explicitly to continue this Team task."),
						},
					});
				}
				return;
			}
			const assignment = state.task.assignments.find(member => member.chat === turn.channel && (member.turnId === turn.turnId || member.eventId === turn.turnId));
			if (!assignment || assignment.state === 'reported' || assignment.state === 'removed') {
				return;
			}
			if (turn.reason.kind !== 'success') {
				const detail = turn.reason.kind === 'error' || turn.reason.kind === 'rejected' ? turn.reason.error.message : localize('persistentTeam.assignmentStopped', "The assignment was stopped.");
				await this._blockAssignment(turn.session, state, assignment, detail);
				return;
			}
			const completed = this._stateManager.getChatState(turn.channel)?.turns.find(completed => completed.id === turn.turnId);
			if (completed?.responseParts.some(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Cancelled
				&& (part.toolCall.reason === ToolCallCancellationReason.Denied || part.toolCall.reason === ToolCallCancellationReason.ResultDenied))) {
				await this._blockAssignment(turn.session, state, assignment, localize('persistentTeam.approvalDenied', "A required approval was denied."));
				return;
			}
			const explicitReports = this._reportsFor(state, assignment);
			const finalText = completed?.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : []).join('').trim();
			const explicitFinal = explicitReports.some(report => {
				const source = readAgentMessageDelegationMeta(report.message);
				return source && hasKey(source, { sourceSession: true }) && source.sourceTurnId === turn.turnId;
			});
			if (!finalText && !explicitFinal) {
				await this._blockAssignment(turn.session, state, assignment, localize('persistentTeam.noReport', "The teammate finished without a report. Retry its assignment."));
				return;
			}
			const taskTurnIds = this._taskTurnIds(state).get(assignment.chat);
			const completedText = this._stateManager.getChatState(assignment.chat)?.turns
				.filter(completed => taskTurnIds?.has(completed.id))
				.flatMap(completed => completed.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : []))
				.join('\n\n').trim() ?? '';
			const text = [...new Set([...explicitReports.map(report => report.message.text).filter(report => !completedText.includes(report)), completedText].filter(Boolean))].join('\n\n');
			const reportId = explicitReports[0]?.id ?? generateUuid();
			this._stateManager.dispatchServerAction(state.leadChat, {
				type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: reportId,
				message: {
					text, origin: { kind: MessageKind.Agent },
					_meta: toAgentMessageDelegationMeta({ sourceSession: turn.session, sourceChat: turn.channel, sourceTurnId: turn.turnId }),
				},
			});
			for (const duplicate of explicitReports.slice(1)) {
				this._stateManager.dispatchServerAction(state.leadChat, { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: duplicate.id });
			}
			const assignments = state.task.assignments.map(member => member === assignment ? {
				...member, state: 'reported' as const, reportMessageId: reportId, error: undefined,
			} : member);
			const error = assignments.find(member => member.state === 'blocked')?.error;
			const needsLeadRetry = state.task.state === 'blocked' && this._stateManager.getActiveTurnId(state.leadChat) !== leadTurnId;
			await this._storeState(URI.parse(turn.session), {
				...state,
				task: {
					...state.task, assignments, state: error || needsLeadRetry ? 'blocked' : state.task.state === 'cancelled' ? 'cancelled' : 'working',
					error: error ?? (needsLeadRetry ? state.task.error : undefined),
				},
			});
		});
	}

	async beforeStop(session: string, chat: string, turnId: string, token: CancellationToken): Promise<string | undefined> {
		const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(session));
		if (!state?.enabled || state.leadChat !== chat) {
			return undefined;
		}
		while (!token.isCancellationRequested) {
			const changed = new DeferredPromise<void>();
			const store = new DisposableStore();
			store.add(Event.once(Event.filter(this._taskChanged.event, changedSession => changedSession === session))(() => changed.complete()));
			store.add(token.onCancellationRequested(() => changed.complete()));
			try {
				const result = await this._operations.queue(session, () => this._checkStop(session, chat, turnId));
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (result !== null) {
					return result;
				}
				await changed.p;
			} finally {
				store.dispose();
			}
		}
		throw new CancellationError();
	}

	completionError(session: string, chat: string, turnId: string): string | undefined {
		const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(session));
		if (!state?.enabled || state.leadChat !== chat) {
			return undefined;
		}
		if (this._isLeadTurn(state.task, turnId) && state.task?.state !== 'completed') {
			return state.task?.error ?? localize('persistentTeam.taskIncomplete', "The Team task is incomplete. Every enabled teammate must report and the Lead must explicitly accept its deliverable before finishing.");
		}
		const active = this._stateManager.getChatState(chat)?.activeTurn;
		if (active?.id === turnId && active.message.origin.kind === MessageKind.User && !this._isLeadTurn(state.task, turnId)) {
			return localize('persistentTeam.taskNotTracked', "The Team task could not be tracked. Retry explicitly; it has not been treated as complete.");
		}
		return undefined;
	}

	private async _beginTask(session: string, state: IAgentHostPersistentTeamState, turnId: string): Promise<void> {
		for (const assignment of state.task?.assignments ?? []) {
			for (const pending of this._reportsFor(state, assignment)) {
				this._stateManager.dispatchServerAction(state.leadChat, { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: pending.id });
			}
		}
		await this._storeState(URI.parse(session), {
			...state,
			task: {
				leadTurnId: turnId, state: 'working', leadPhase: 'manager',
				assignments: state.members.filter(member => member.enabled).map(member => ({ role: member.role, chat: member.chat, state: 'unassigned' })),
			},
		});
	}

	async retryTurn(session: string, chat: string, turnId: string): Promise<void> {
		await this._operations.queue(session, async () => {
			const sessionState = this._stateManager.getSessionState(session);
			const state = sessionState?.provider === 'copilotcli' && sessionState.defaultChat === chat
				? await this._prepare(URI.parse(session), URI.parse(chat))
				: readAgentHostPersistentTeamState(sessionState);
			if (!state?.enabled) {
				return;
			}
			if (chat === state.leadChat && !this._isLeadTurn(state.task, turnId)) {
				await this._beginTask(session, state, turnId);
				return;
			}
			if (!state.task) {
				return;
			}
			if (chat === state.leadChat && this._isLeadTurn(state.task, turnId)) {
				if (state.task.assignments.some(assignment => assignment.state === 'blocked')) {
					throw new Error(state.task.error ?? localize('persistentTeam.retryMemberFirst', "Retry the blocked teammate or remove it from Team before retrying the Lead."));
				}
				await this._storeState(URI.parse(session), {
					...state, task: {
						...state.task, state: 'working', leadPhase: 'manager', requestedLeadPhase: undefined, error: undefined, assignmentReminderSent: false, reviewReminderSent: false,
						assignments: state.task.assignments.map(assignment => ({ ...assignment, delivered: false, reviewed: assignment.revision !== undefined && assignment.reviewed === true })),
					},
				});
			} else if (state.task.assignments.some(assignment => assignment.chat === chat && (assignment.turnId === turnId || assignment.eventId === turnId))) {
				await this._storeState(URI.parse(session), {
					...state, task: {
						...state.task,
						assignments: state.task.assignments.map(assignment => assignment.chat === chat
							? { ...assignment, state: 'working', error: undefined, delivered: false, reviewed: false, reportMessageId: undefined } : assignment),
					},
				});
			}
		});
	}

	private async _checkStop(session: string, chat: string, turnId: string): Promise<string | undefined | null> {
		const state = this._currentTask(session, turnId);
		const task = state?.task;
		if (!task) {
			const error = this.completionError(session, chat, turnId);
			if (error) {
				throw new Error(error);
			}
		}
		if (!state?.enabled || state.leadChat !== chat || !task || task.state === 'completed') {
			return undefined;
		}
		if (task.state === 'blocked' || task.state === 'cancelled') {
			throw new Error(task.error ?? localize('persistentTeam.taskBlocked', "The Team task is blocked. Retry the affected teammate, then retry the Lead."));
		}
		const failed = task.assignments.find(assignment => assignment.state === 'blocked');
		if (failed) {
			throw new Error(failed.error ?? localize('persistentTeam.taskBlocked', "The Team task is blocked. Retry the affected teammate, then retry the Lead."));
		}
		if (task.requestedLeadPhase) {
			const phase = task.requestedLeadPhase;
			if (phase === 'integration' && !this._canIntegrate(task)) {
				throw new Error(localize('persistentTeam.integrationBlocked', "Engineer work is still outstanding. Return to management before integrating."));
			}
			await this._storeState(URI.parse(session), {
				...state, task: { ...task, leadPhase: phase, requestedLeadPhase: undefined, state: phase === 'integration' ? 'integrating' : 'working' },
			});
			return phase === 'integration'
				? 'Engineer deliverables have been accepted and handed back. Make only the small joining or compatibility edits needed to integrate them. Do not implement missing engineering work yourself. To request more engineering, use manage_team with action phase and phase manager, then yield.'
				: 'You are back in the manager phase. Assign any additional engineering or corrections to their owners with manage_team, then send_message. Review their new reports before completing.';
		}
		const missing = task.assignments.filter(assignment => assignment.state === 'unassigned');
		if (missing.length) {
			if (task.assignmentReminderSent) {
				const error = localize('persistentTeam.missingAssignments', "The Lead did not assign work to {0}. Retry the task or explicitly remove the unused teammate.", missing.map(member => member.role).join(', '));
				await this._storeState(URI.parse(session), { ...state, task: { ...task, state: 'blocked', error } });
				throw new Error(error);
			}
			await this._storeState(URI.parse(session), { ...state, task: { ...task, assignmentReminderSent: true } });
			return `Team mode requires engineering ownership, not token participation. Use manage_team (action assign) to record each objective and deliverable, then send_message to dispatch useful work or requested corrections:\n${missing.map(member => `${member.role}: ${buildOpenSessionLinkForChatResource(member.chat)}${member.reviewFeedback ? `\nCorrections: ${member.reviewFeedback}` : ''}`).join('\n')}\nDo not replace these chats or do their engineering work yourself.`;
		}
		const unread = task.assignments.filter(assignment => assignment.state === 'reported' && !assignment.delivered && !assignment.reviewed);
		if (!unread.length) {
			if (task.assignments.some(assignment => assignment.state === 'queued' || assignment.state === 'working')) {
				if (task.state !== 'waiting') {
					await this._storeState(URI.parse(session), { ...state, task: { ...task, state: 'waiting', error: undefined } });
				}
				return null;
			}
			const unreviewed = task.assignments.filter(assignment => assignment.state === 'reported' && !assignment.reviewed);
			if (unreviewed.length) {
				if (task.reviewReminderSent) {
					const error = localize('persistentTeam.unreviewedReports', "The Lead did not review the engineer deliverables. Retry explicitly; the Team task is not complete.");
					await this._storeState(URI.parse(session), { ...state, task: { ...task, state: 'blocked', error } });
					throw new Error(error);
				}
				await this._storeState(URI.parse(session), { ...state, task: { ...task, reviewReminderSent: true } });
				return `Explicitly review each current report with manage_team (action review, reportId, accept, feedback). Request corrections from the same engineer when needed; do not repair it yourself.\n${unreviewed.map(member => `${member.role}: reportId=${member.reportMessageId}`).join('\n')}`;
			}
			await this._storeState(URI.parse(session), { ...state, task: { ...task, state: 'completed', error: undefined } });
			return undefined;
		}
		const reports = await Promise.all(unread.map(async assignment => {
			let pending = this._reportsFor(state, assignment);
			if (!pending.length) {
				const chat = await this._stateManager.resolveChatState(assignment.chat);
				const completed = chat?.turns.find(turn => turn.id === assignment.turnId || turn.id === assignment.eventId);
				const text = completed?.responseParts.flatMap(part => part.kind === ResponsePartKind.Markdown ? [part.content] : []).join('').trim();
				if (text && assignment.reportMessageId) {
					this._stateManager.dispatchServerAction(state.leadChat, {
						type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: assignment.reportMessageId,
						message: {
							text, origin: { kind: MessageKind.Agent },
							_meta: toAgentMessageDelegationMeta({ sourceSession: session, sourceChat: assignment.chat, sourceTurnId: assignment.turnId }),
						},
					});
					pending = this._reportsFor(state, assignment);
				}
			}
			if (!pending.length) {
				throw new Error(localize('persistentTeam.missingReport', "The saved {0} report is unavailable. Retry the assignment; it has not been treated as complete.", assignment.role));
			}
			return { assignment, pending, text: pending.map(report => report.message.text).join('\n\n') };
		}));
		await this._storeState(URI.parse(session), {
			...state, task: {
				...task, state: 'reviewing', error: undefined,
				assignments: task.assignments.map(assignment => unread.includes(assignment) ? { ...assignment, delivered: true } : assignment),
			},
		});
		for (const report of reports) {
			for (const message of report.pending) {
				this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: message.id });
			}
		}
		return `Review the engineer reports below against their deliverables. Receiving a report is not accepting it. For each report, use manage_team (action review) with its exact reportId, your accept decision and concrete feedback. Send necessary corrections back to that engineer with send_message; do not implement them yourself. Other engineers may still be working. Once all reports are accepted, answer the original task or explicitly request the integration phase for small joining edits.\n\n${reports.map(report => `## ${report.assignment.role}\nreportId: ${report.assignment.reportMessageId}\nDeliverable: ${report.assignment.deliverable ?? 'Review the saved assignment'}\n${report.text}`).join('\n\n')}`;
	}

	private _reportsFor(state: IAgentHostPersistentTeamState, assignment: IAgentHostTeamAssignment) {
		return this._stateManager.getChatState(state.leadChat)?.queuedMessages?.filter(pending => {
			const source = readAgentMessageDelegationMeta(pending.message);
			return pending.message.origin.kind === MessageKind.Agent && source && hasKey(source, { sourceSession: true })
				&& source.sourceSession === parseChatUri(state.leadChat)?.session
				&& source.sourceChat === assignment.chat && source.sourceTurnId !== undefined
				&& (source.sourceTurnId === assignment.turnId || source.sourceTurnId === assignment.eventId);
		}) ?? [];
	}

	private _taskTurnIds(state: IAgentHostPersistentTeamState): ReadonlyMap<string, ReadonlySet<string>> {
		const ids = new Map<string, Set<string>>();
		const task = state.task;
		if (!task) {
			return ids;
		}
		ids.set(state.leadChat, new Set([task.leadTurnId, ...(task.leadEventId ? [task.leadEventId] : [])]));
		const session = parseChatUri(state.leadChat)?.session;
		const chats = task.assignments.map(assignment => {
			ids.set(assignment.chat, new Set([...(assignment.turnId ? [assignment.turnId] : []), ...(assignment.eventId ? [assignment.eventId] : [])]));
			return { chat: assignment.chat, state: this._stateManager.getChatState(assignment.chat) };
		});
		let added: boolean;
		do {
			added = false;
			for (const chat of chats) {
				const owned = ids.get(chat.chat)!;
				for (const turn of [...(chat.state?.turns ?? []), ...(chat.state?.activeTurn ? [chat.state.activeTurn] : [])]) {
					const source = readAgentMessageDelegationMeta(turn.message);
					if (!owned.has(turn.id) && turn.message.origin.kind === MessageKind.Agent && source && hasKey(source, { sourceSession: true })
						&& source.sourceSession === session
						&& source.sourceChat !== undefined && source.sourceTurnId !== undefined && ids.get(source.sourceChat)?.has(source.sourceTurnId)) {
						owned.add(turn.id);
						added = true;
					}
				}
			}
		} while (added);
		return ids;
	}

	private _currentTask(session: string, leadTurnId: string): IAgentHostPersistentTeamState | undefined {
		const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(session));
		return this._isLeadTurn(state?.task, leadTurnId) ? state : undefined;
	}

	private _isLeadTurn(task: IAgentHostTeamTask | undefined, turnId: string): boolean {
		return task?.leadTurnId === turnId || task?.leadEventId === turnId;
	}

	private async _turnEventId(chat: string, turnId: string): Promise<string | undefined> {
		const resource = chatStorageUri(chat);
		const ref = resource && await this._sessionData.tryOpenDatabase(resource);
		if (!ref) {
			return undefined;
		}
		try {
			return await ref.object.getTurnEventId(turnId);
		} finally {
			ref.dispose();
		}
	}

	private async _blockAssignment(session: string, state: IAgentHostPersistentTeamState, assignment: IAgentHostTeamAssignment, detail: string): Promise<void> {
		if (!state.task) {
			return;
		}
		const error = localize('persistentTeam.assignmentFailed', "{0} could not finish: {1} Retry that teammate, then retry the Lead, or explicitly remove it from Team.", assignment.role, detail);
		await this._storeState(URI.parse(session), {
			...state, task: {
				...state.task, state: 'blocked', error,
				assignments: state.task.assignments.map(member => member === assignment ? { ...member, state: 'blocked', error } : member),
			},
		});
	}

	private _runTaskOperation(session: string, operation: () => Promise<void>): void {
		void this._operations.queue(session, operation).catch(error => {
			this._logService.error('[PersistentTeam] Task tracking failed', error);
			const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(session));
			if (state?.task) {
				this._publish(URI.parse(session), { ...state, task: { ...state.task, state: 'blocked', error: toErrorMessage(error) } });
			}
		});
	}

	private async _prepare(session: URI, leadChat: URI): Promise<IAgentHostPersistentTeamState | undefined> {
		const current = this._assertAddress(session, leadChat);
		const selected = parseCopilotModelTeam(current.config?.values[CopilotModelTeamConfigKey]);
		const remembered = parseCopilotModelTeam(current.config?.values[CopilotModelTeamRememberedConfigKey]);
		const previous = await this._readState(session);
		if (!selected && !previous) {
			return undefined;
		}
		if (!previous && current.lifecycle === SessionLifecycle.Creating && !this._stateManager.getChatState(leadChat.toString())?.activeTurn) {
			return undefined;
		}
		if (previous && previous.leadChat !== leadChat.toString()) {
			throw new Error('The saved team belongs to a different Lead chat');
		}
		const models = this._providers.getProviderForSession(session)?.models.get() ?? [];
		let state: IAgentHostPersistentTeamState = {
			version: 2, leadChat: leadChat.toString(), enabled: selected !== undefined, state: 'ready',
			...(previous?.task ? {
				task: previous.task.state === 'completed' ? previous.task : {
					...previous.task,
					...(previous.task.assignments.some(assignment => !selected?.[assignment.role] && assignment.state !== 'removed')
						? { state: 'working' as const, error: undefined } : {}),
					assignments: previous.task.assignments.map(assignment => selected?.[assignment.role] ? assignment : { ...assignment, state: 'removed' as const, error: undefined }),
				}
			} : {}),
			members: previous?.members.map(member => ({
				...member,
				enabled: !!selected?.[member.role],
				model: selected?.[member.role] ?? this._stateManager.getChatState(member.chat)?.draft?.model ?? remembered?.[member.role] ?? member.model,
			})) ?? [],
		};
		for (const role of ['worker', 'scout'] as const) {
			const model = selected?.[role];
			let member = state.members.find(member => member.role === role);
			if (!member && model) {
				validateCopilotModelTeam({
					worker: role === 'worker' ? model : state.members.find(member => member.role === 'worker')!.model,
					...(role === 'scout' ? { scout: model } : {}),
				}, models);
				member = await this._createMember(session, role, model, true);
				state = { ...state, members: [...state.members, member] };
				await this._storeState(session, state);
			}
			if (member && model) {
				try {
					const chat = await this._stateManager.resolveChatState(member.chat);
					if (!chat) {
						throw new Error(localize('persistentTeam.missingChat', "The saved {0} chat is unavailable. Its identity has been retained; explicitly reset it to start a new conversation.", role));
					}
					const provider = this._providers.getProviderForSession(session);
					const preferredModel = chat.draft?.model
						?? provider?.chats.getModel?.(URI.parse(member.chat), createAgentChatContext(this._stateManager, session, member.chat))
						?? member.model;
					this._rememberSelection(member.chat, preferredModel);
					member = { role, chat: member.chat, enabled: true, model: preferredModel };
				} catch (error) {
					this._logService.error(`[PersistentTeam] Could not restore ${member.chat}`, error);
					member = { ...member, error: { code: 'chatUnavailable', message: toErrorMessage(error) } };
				}
				const updated = member;
				state = { ...state, members: state.members.map(current => current.role === role ? updated : current) };
			}
		}
		if (selected) {
			const worker = state.members.find(member => member.role === 'worker')!;
			const scout = state.members.find(member => member.role === 'scout' && member.enabled);
			validateCopilotModelTeam({ worker: worker.model, ...(scout ? { scout: scout.model } : {}) }, models);
		}
		const error = state.members.find(member => member.enabled && member.error)?.error;
		state = { ...state, state: error ? 'unavailable' : 'ready', ...(error ? { error } : {}) };
		return this._storeState(session, state);
	}

	private async _createMember(session: URI, role: IAgentHostPersistentTeamMember['role'], model: ModelSelection, enabled: boolean): Promise<IAgentHostPersistentTeamMember> {
		if (!this._host) {
			throw new Error('Persistent team host is unavailable');
		}
		const chat = URI.parse(buildChatUri(session, generateUuid()));
		await this._host.createChat(session, chat, { model, title: role === 'worker' ? localize('persistentTeam.worker', "Worker") : localize('persistentTeam.scout', "Scout") });
		const draft = this._stateManager.getChatState(chat.toString())?.draft;
		if (!draft?.model) {
			this._stateManager.dispatchServerAction(chat.toString(), {
				type: ActionType.ChatDraftChanged,
				draft: { text: '', origin: { kind: MessageKind.User }, ...draft, model },
			});
		}
		return { role, chat: chat.toString(), enabled, model };
	}

	private _rememberSelection(chat: string, model: ModelSelection | undefined): void {
		const session = parseChatUri(chat)?.session;
		const current = session ? this._stateManager.getSessionState(session) : undefined;
		const state = readAgentHostPersistentTeamState(current);
		const member = state?.members.find(member => member.chat === chat);
		if (!session || !state || !member || !model) {
			return;
		}
		if (!equals(member.model, model)) {
			this._publish(URI.parse(session), { ...state, members: state.members.map(current => current.chat === chat ? { ...current, model } : current) });
		}
		let selected: ICopilotModelTeam | undefined;
		let remembered: ICopilotModelTeam | undefined;
		try {
			selected = parseCopilotModelTeam(current?.config?.values[CopilotModelTeamConfigKey]);
			remembered = parseCopilotModelTeam(current?.config?.values[CopilotModelTeamRememberedConfigKey]) ?? selected;
		} catch (error) {
			this._logService.warn('[PersistentTeam] Could not update saved model preferences', error);
			return;
		}
		const config: Record<string, object> = {};
		if (selected?.[member.role] && !equals(selected[member.role], model)) {
			config[CopilotModelTeamConfigKey] = { ...selected, [member.role]: model };
		}
		if (remembered?.[member.role] && !equals(remembered[member.role], model)) {
			config[CopilotModelTeamRememberedConfigKey] = { ...remembered, [member.role]: model };
		}
		if (Object.keys(config).length) {
			this._stateManager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config });
		}
	}

	private _assertAddress(session: URI, leadChat: URI) {
		const state = this._stateManager.getSessionState(session.toString());
		if (!state || state.provider !== 'copilotcli' || state.defaultChat !== leadChat.toString() || parseChatUri(leadChat)?.session !== session.toString()) {
			throw new Error('Persistent teams require a Copilot session and its exact Lead chat');
		}
		if ((state.status & SessionStatus.IsArchived) !== 0) {
			throw new Error(localize('persistentTeam.archived', "Restore the archived session before configuring its team."));
		}
		return state;
	}

	private async _readState(session: URI): Promise<IAgentHostPersistentTeamState | undefined> {
		const current = readAgentHostPersistentTeamState(this._stateManager.getSessionState(session.toString()));
		if (current) {
			return current;
		}
		const ref = await this._sessionData.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const raw = await ref.object.getMetadata(AgentHostPersistentTeamMetaKey);
			if (raw === undefined) {
				return undefined;
			}
			const state = readAgentHostPersistentTeamState({ _meta: { [AgentHostPersistentTeamMetaKey]: JSON.parse(raw) } });
			if (!state) {
				throw new Error('Stored persistent team identity is invalid');
			}
			return state;
		} finally {
			ref.dispose();
		}
	}

	private async _storeState(session: URI, state: IAgentHostPersistentTeamState): Promise<IAgentHostPersistentTeamState> {
		const ref = this._sessionData.openDatabase(session);
		try {
			await ref.object.setMetadata(AgentHostPersistentTeamMetaKey, JSON.stringify(state));
		} finally {
			ref.dispose();
		}
		return this._publish(session, state);
	}

	private _publish(session: URI, state: IAgentHostPersistentTeamState): IAgentHostPersistentTeamState {
		const projected = {
			...state, members: state.members.map(member => ({
				...member,
				model: this._stateManager.getChatState(member.chat)?.draft?.model ?? member.model,
			}))
		};
		const current = this._stateManager.getSessionState(session.toString());
		this._stateManager.setSessionMeta(session.toString(), { ...current?._meta, ...toAgentHostPersistentTeamMeta(projected) });
		if (!equals(readAgentHostPersistentTeamState(current)?.task, projected.task)) {
			this._taskChanged.fire(session.toString());
			if (projected.enabled && projected.task?.state === 'blocked') {
				const activeTurnId = this._stateManager.getActiveTurnId(projected.leadChat);
				this._onDidBlockTask.fire({
					chat: projected.leadChat, turnId: activeTurnId && this._isLeadTurn(projected.task, activeTurnId) ? activeTurnId : projected.task.leadTurnId,
					error: projected.task.error ?? localize('persistentTeam.taskBlocked', "The Team task is blocked. Retry the affected teammate, then retry the Lead."),
				});
			}
		}
		return projected;
	}
}
