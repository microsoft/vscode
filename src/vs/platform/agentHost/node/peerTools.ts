/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool } from '@github/copilot-sdk';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, type IAgentSessionMetadata } from '../common/agentService.js';
import { ActionType, type ISessionAction, type ISessionPendingMessageSetAction } from '../common/state/sessionActions.js';
import { PendingMessageKind, SessionLifecycle } from '../common/state/sessionState.js';
import type { SessionStateManager } from './sessionStateManager.js';

// #region Types

/**
 * Dependencies for peer tools. Uses individual functions/objects rather than
 * `AgentService` directly, since the standalone server (`agentHostServerMain.ts`)
 * doesn't use `AgentService` -- it has individual components instead.
 */
export interface IPeerToolsDependencies {
	/** Lists all sessions across all agents. */
	listSessions(): Promise<IAgentSessionMetadata[]>;
	/** Dispatches a client action to the state manager and triggers side effects. */
	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void;
	/** State manager for querying session existence and active turns. */
	readonly stateManager: SessionStateManager;
	/** Provider ID for constructing session URIs from raw SDK session IDs. */
	readonly providerId: string;
	readonly logService: ILogService;
}

/**
 * Mutable state shared across all sessions in this process.
 * Ephemeral: lost on process restart.
 */
export interface IPeerToolsState {
	/** Session URI (string) → user-set summary */
	readonly summaries: Map<string, string>;
}

interface IListPeersResult {
	sessionUri: string;
	title: string;
	workingDirectory?: string;
	status: 'idle' | 'busy';
	summary?: string;
}

// #endregion

// #region Tool Definitions

/**
 * Creates SDK `Tool` definitions for inter-session peer communication.
 * These tools let sessions within the same agent host process discover
 * each other and exchange messages via the existing steering infrastructure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK Tool<T> is invariant on T; any is required for the array return type
export function createPeerTools(deps: IPeerToolsDependencies, state: IPeerToolsState): Tool<any>[] {
	return [
		createListPeersTool(deps, state),
		createSendMessageTool(deps, state),
		createSetSummaryTool(deps, state),
	];
}

function createListPeersTool(deps: IPeerToolsDependencies, state: IPeerToolsState): Tool<Record<string, never>> {
	return {
		name: 'list_peers',
		description: 'List all other chat sessions running in this agent host. Returns each session\'s URI, title, working directory, status (idle/busy), and user-set summary.',
		parameters: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		handler: async (_args, invocation) => {
			try {
				const callerUri = AgentSession.uri(deps.providerId, invocation.sessionId).toString();
				const sessions = await deps.listSessions();
				const results: IListPeersResult[] = [];

				for (const s of sessions) {
					const sessionUri = s.session.toString();
					if (sessionUri === callerUri) {
						continue;
					}
					// Only include sessions that are alive in the state manager
					// (listSessions may return persisted sessions from previous lifetimes)
					const sessionState = deps.stateManager.getSessionState(sessionUri);
					if (!sessionState || sessionState.lifecycle !== SessionLifecycle.Ready) {
						continue;
					}
					const isActive = deps.stateManager.getActiveTurnId(sessionUri) !== undefined;
					results.push({
						sessionUri,
						title: s.summary ?? 'Session',
						workingDirectory: s.workingDirectory,
						status: isActive ? 'busy' : 'idle',
						summary: state.summaries.get(sessionUri),
					});
				}

				return results;
			} catch (err) {
				deps.logService.error('[PeerTools] list_peers error', err);
				return { error: String(err) };
			}
		},
	};
}

interface ISendMessageArgs {
	sessionUri: string;
	message: string;
	kind?: 'steering' | 'queued';
}

function createSendMessageTool(deps: IPeerToolsDependencies, state: IPeerToolsState): Tool<ISendMessageArgs> {
	return {
		name: 'send_message',
		description: 'Send a message to another chat session. By default sends as a steering message (injected into the current turn). Use kind "queued" to send as a new turn that starts after the current turn finishes.',
		parameters: {
			type: 'object',
			properties: {
				sessionUri: {
					type: 'string',
					description: 'The URI of the target session (from list_peers)',
				},
				message: {
					type: 'string',
					description: 'The message to send to the target session',
				},
				kind: {
					type: 'string',
					enum: ['steering', 'queued'],
					description: 'How to deliver the message. "steering" (default) injects into the current turn. "queued" starts a new turn after the current one finishes.',
				},
			},
			required: ['sessionUri', 'message'],
			additionalProperties: false,
		},
		handler: (args, invocation) => {
			try {
				if (!args.sessionUri || !args.message) {
					return { error: 'sessionUri and message are required' };
				}

				const sessionState = deps.stateManager.getSessionState(args.sessionUri);
				if (!sessionState) {
					return { error: `Session not found: ${args.sessionUri}` };
				}

				// Default to queued when the target session is idle, since steering
				// messages are only meaningful during an active turn.
				const isTargetActive = deps.stateManager.getActiveTurnId(args.sessionUri) !== undefined;
				const requestedKind = args.kind === 'queued' ? PendingMessageKind.Queued : PendingMessageKind.Steering;
				const effectiveKind = requestedKind === PendingMessageKind.Steering && !isTargetActive
					? PendingMessageKind.Queued
					: requestedKind;

				const senderUri = AgentSession.uri(deps.providerId, invocation.sessionId).toString();
				const senderSummary = state.summaries.get(senderUri);

				const action: ISessionPendingMessageSetAction = {
					type: ActionType.SessionPendingMessageSet,
					session: args.sessionUri,
					kind: effectiveKind,
					id: generateUuid(),
					userMessage: { text: formatPeerMessage(senderUri, senderSummary, args.message) },
				};

				const kindLabel = effectiveKind === PendingMessageKind.Steering ? 'steering' : 'queued';
				deps.logService.info(`[PeerTools] send_message from ${senderUri} to ${args.sessionUri} (kind=${kindLabel}${effectiveKind !== requestedKind ? ', auto-upgraded from steering' : ''})`);
				deps.dispatchAction(action, 'peer-tool', 0);
				return { success: true, deliveredAs: kindLabel };
			} catch (err) {
				deps.logService.error('[PeerTools] send_message error', err);
				return { error: String(err) };
			}
		},
	};
}

interface ISetSummaryArgs {
	summary: string;
}

function createSetSummaryTool(deps: IPeerToolsDependencies, state: IPeerToolsState): Tool<ISetSummaryArgs> {
	return {
		name: 'set_summary',
		description: 'Set a human-readable summary of what this session is currently working on. Other sessions can see this when they call list_peers.',
		parameters: {
			type: 'object',
			properties: {
				summary: {
					type: 'string',
					description: 'A brief description of what this session is working on',
				},
			},
			required: ['summary'],
			additionalProperties: false,
		},
		handler: (args, invocation) => {
			const sessionUri = AgentSession.uri(deps.providerId, invocation.sessionId).toString();
			if (!args.summary) {
				state.summaries.delete(sessionUri);
			} else {
				state.summaries.set(sessionUri, args.summary);
			}
			return { success: true };
		},
	};
}

// #endregion

// #region Helpers

/**
 * Wraps a peer message with sender context so the receiving session can
 * distinguish it from a user message and decide how to respond.
 */
function formatPeerMessage(senderUri: string, senderSummary: string | undefined, message: string): string {
	const summaryLine = senderSummary ? `\nSender summary: ${senderSummary}` : '';
	return `[Peer session message — this was NOT sent by the user, it was sent by another AI session]\nFrom: ${senderUri}${summaryLine}\n\n${message}\n\n[To reply, use the send_message tool with sessionUri "${senderUri}". Only reply if it is useful to do so.]`;
}

// #endregion