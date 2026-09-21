/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext, IOutgoingTurn, ISendContribution, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostPersistentTeamContinuationPrefix, readAgentHostPersistentTeamState } from '../../../common/meta/agentHostPersistentTeamMeta.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../../../common/meta/agentMessageDelegationMeta.js';
import { buildOpenSessionLinkForChatResource } from '../../../common/openSessionLink.js';
import { buildDefaultChatUri, chatStorageUri, createErrorResponsePart, MessageKind, TurnState, type Turn } from '../../../common/state/sessionState.js';
import { localize } from '../../../../../nls.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostPersistentTeamService } from '../../agentHostPersistentTeamService.js';

/** Supplies role guidance and observes the ordinary Team chat lifecycle. */
export class PersistentTeamContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'persistentTeam';
	readonly order = 350;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostPersistentTeamService private readonly _teams: IAgentHostPersistentTeamService,
		@ISessionDataService private readonly _sessionData: ISessionDataService,
	) {
		super();
	}

	onDidDispatchAction(action: IDispatchedAction): void {
		this._teams.observeAction(action);
	}

	onTurnEnd(turn: ITurnEnd): void {
		this._teams.observeTurnEnd(turn);
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (!turns.length) {
			return turns;
		}
		const current = this._stateManager.getSessionState(context.session);
		const state = readAgentHostPersistentTeamState(current) ?? await this._teams.readStoredState(URI.parse(context.session));
		if (!state || (context.chat !== state.leadChat && !state.members.some(member => member.chat === context.chat))) {
			return turns;
		}
		const mapped = await Promise.all(turns.map(async turn => {
			const source = readAgentMessageDelegationMeta(turn.message);
			if (!source || !hasKey(source, { sourceSession: true }) || source.sourceSession !== context.session || !source.sourceTurnId) {
				return turn;
			}
			const storage = chatStorageUri(source.sourceChat ?? buildDefaultChatUri(source.sourceSession));
			const ref = storage && await this._sessionData.tryOpenDatabase(storage);
			if (!ref) {
				return turn;
			}
			try {
				const eventId = await ref.object.getTurnEventId(source.sourceTurnId);
				return eventId ? {
					...turn, message: {
						...turn.message,
						_meta: { ...turn.message._meta, ...toAgentMessageDelegationMeta({ ...source, sourceTurnId: eventId }) },
					},
				} : turn;
			} finally {
				ref.dispose();
			}
		}));
		const result: Turn[] = [];
		const storage = chatStorageUri(context.chat);
		const ref = context.chat === state.leadChat && storage ? await this._sessionData.tryOpenDatabase(storage) : undefined;
		try {
			for (const turn of mapped) {
				const parentId = await ref?.object.getMetadata(`${AgentHostPersistentTeamContinuationPrefix}${turn.id}`);
				const parentEventId = parentId ? await ref?.object.getTurnEventId(parentId) ?? parentId : undefined;
				const parentIndex = parentEventId ? result.findIndex(parent => parent.id === parentEventId) : -1;
				if (parentIndex < 0) {
					result.push(turn);
					continue;
				}
				const parent = result[parentIndex];
				result[parentIndex] = { ...parent, state: turn.state, responseParts: [...parent.responseParts, ...turn.responseParts] };
			}
		} finally {
			ref?.dispose();
		}
		if (!state.enabled || context.chat !== state.leadChat || !state.task || (state.task.state !== 'blocked' && (current || state.task.state === 'completed'))) {
			return result;
		}
		return result.map(turn => (turn.id === state.task?.leadTurnId || turn.id === state.task?.leadEventId) && turn.state !== TurnState.Error ? {
			...turn,
			state: TurnState.Error,
			responseParts: [...turn.responseParts, createErrorResponsePart({
				errorType: 'teamTaskBlocked',
				message: state.task.error ?? localize('persistentTeam.retryRestoredTask', "The Team task has not completed. Retry explicitly after checking the teammates."),
			}, true)],
		} : turn);
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const state = readAgentHostPersistentTeamState(this._stateManager.getSessionState(turn.session));
		if (!state?.enabled) {
			return undefined;
		}
		const member = state.members.find(member => member.chat === turn.chat && member.enabled);
		if (turn.chat !== state.leadChat && !member) {
			return undefined;
		}
		const role = member?.role ?? 'lead';
		const guidance = role === 'lead'
			? 'You are the engineering manager: break down work, assign owners, review deliverables, return corrections to their owners, and report the outcome.'
			: role === 'worker'
				? 'You are the Worker: focus on implementation and verification.'
				: 'You are the Scout: an engineer who can investigate, implement, test, and review according to the assigned deliverable.';
		const roster = [
			`Lead: ${buildOpenSessionLinkForChatResource(state.leadChat)}`,
			...state.members.filter(member => member.enabled).map(member => `${member.role === 'worker' ? 'Worker' : 'Scout'}: ${buildOpenSessionLinkForChatResource(member.chat)}`),
		];
		const delegation = readAgentMessageDelegationMeta(turn.message);
		const source = turn.message.origin.kind === MessageKind.Agent && delegation && hasKey(delegation, { sourceSession: true })
			? buildOpenSessionLinkForChatResource(delegation.sourceChat ?? delegation.sourceSession)
			: undefined;
		const workflow = role === 'lead' ? [
			'The user enabled Team mode to use engineers, not to have you implement everything. Use manage_team (action assign) to record a useful objective and deliverable for every enabled engineer, then dispatch through send_message. Reuse the exact chats below, never replacement agents.',
			'Give each engineer the context, acceptance criteria and non-overlapping ownership boundaries. Worker and Scout both have normal engineering capabilities. Sequence overlapping changes. Inspect and coordinate; engineering edits, builds and tests belong to the engineers.',
			'Separate independent deliverables from dependent follow-ups: an engineer can write tests now, then verify the integrated result after implementation finishes. Do not repeatedly send an unchanged waiting instruction or reject interim status as defective work; keep dependent follow-ups unsent until their prerequisite is ready.',
			'Yield when waiting; the host delivers reports without polling or keepalive calls. Receiving a report is not accepting it. Use manage_team (action review) with the exact reportId and concrete feedback. Reject incomplete work and send corrections back to its original engineer instead of repairing it yourself.',
			'After all deliverables are accepted and engineers are idle, synthesize the answer. Only if small joining or compatibility edits are still necessary, use manage_team (action phase, phase integration) and yield for the host to enable integration. Return to phase manager and yield before requesting any further engineering.',
			'Questions and permissions remain decisions for the user, presented in the Lead chat. Never approve them for another engineer. Failure requires explicit user retry or removal; do not silently finish alone.',
		] : [];
		return {
			text: `${turn.message.text}\n\n<model_team>\n${[
				guidance,
				role === 'lead'
					? 'The host restricts your tools to management until the engineers hand back accepted work. Integration still obeys normal approvals, sandbox and policy.'
					: 'You retain normal tools, approvals, sandbox and policy. Own the engineering work assigned to you; report your result and evidence to the Lead.',
				...roster,
				...workflow,
				'Use send_message for tasks and replies, get_session_context for relevant history, and list_sessions for status. All teammates share the workspace; coordinate edits rather than overwriting each other.',
				'Messages are asynchronous. A busy chat queues them; replies may arrive in a later turn. No polling or keep-alive work is needed.',
				source
					? `This message came from ${source}. Only an explicit request for work is a new assignment. A report, review result, or acknowledgement is information for the existing task: do not restart completed work or run extra probes just to acknowledge it, and do not echo them back. For assigned work, give a clear final report with findings or changes, verification, and blockers. The host forwards the final report for tracked Team assignments, including when you do not use send_message.`
					: 'For a direct user message, answer here. Do not automatically forward your response to the Lead.',
			].join('\n')}\n</model_team>`
		};
	}
}
