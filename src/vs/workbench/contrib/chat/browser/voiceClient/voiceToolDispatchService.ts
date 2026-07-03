/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary } from '../agentSessions/agentSessionsModel.js';
import { IChatService, IChatSendRequestOptions, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IVoiceToolCall } from '../../common/voiceClient/voiceClientService.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';

/**
 * Callbacks that require access to the chat widget or view state.
 * Implemented by the ChatViewPane to bridge UI concerns.
 */
export interface IVoiceToolDispatchDelegate {
	/** Accept input text in the current chat widget. Returns false if no widget available. */
	acceptInput(text: string): boolean;
	/** Get the resource URI of the currently active session. */
	getCurrentSessionResource(): Promise<URI | undefined>;
	/** Switch the view to a different session by resource URI. */
	switchToSession(resource: URI): void;
	/** Get the set of auto-approved session resource strings. */
	getAutoApprovedSessions(): Set<string>;
	/** Mark all current sessions as auto-approved. */
	addAllAutoApprovedSessions(): void;
	/** Remove a session from auto-approved set. */
	removeAutoApprovedSession(resource: string): void;
	/** Trigger an auto-approve check cycle. */
	triggerAutoApproveCheck(): void;
}

export interface IVoiceToolDispatchService {
	readonly _serviceBrand: undefined;

	/**
	 * Set the delegate that bridges widget/UI concerns.
	 * Must be called before dispatching tool calls.
	 */
	setDelegate(delegate: IVoiceToolDispatchDelegate): void;

	/**
	 * Dispatch a tool call and return the result string.
	 */
	dispatchToolCall(toolCall: IVoiceToolCall): Promise<string>;
}

export const IVoiceToolDispatchService = createDecorator<IVoiceToolDispatchService>('voiceToolDispatchService');

/** Action labels displayed in the status bar during tool execution. */
const ACTION_LABELS: Record<string, string> = {
	send_to_chat: localize('agentsVoice.action.sendToChat', "Sending to chat..."),
	new_sessions: localize('agentsVoice.action.newSessions', "Starting new sessions..."),
	get_session_info: localize('agentsVoice.action.getSessionInfo', "Checking sessions..."),
	get_session_changes: localize('agentsVoice.action.getSessionChanges', "Checking changes..."),
	get_session_thread: localize('agentsVoice.action.getSessionThread', "Checking conversation..."),
	approve_confirmation: localize('agentsVoice.action.approve', "Approving..."),
	reject_confirmation: localize('agentsVoice.action.reject', "Rejecting..."),
	focus_session: localize('agentsVoice.action.focusSession', "Focusing session..."),
	auto_approve_session: localize('agentsVoice.action.autoApprove', "Auto-approving session..."),
	revoke_auto_approve: localize('agentsVoice.action.revokeAutoApprove', "Revoking auto-approve..."),
};

export class VoiceToolDispatchService implements IVoiceToolDispatchService {

	declare readonly _serviceBrand: undefined;

	private _delegate: IVoiceToolDispatchDelegate | undefined;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) { }

	setDelegate(delegate: IVoiceToolDispatchDelegate): void {
		this._delegate = delegate;
	}

	/** Get the action label for a tool call name. */
	static getActionLabel(name: string): string {
		return ACTION_LABELS[name] ?? localize('agentsVoice.action.working', "Working...");
	}

	private get _agentModeOptions(): IChatSendRequestOptions {
		const allTools: Record<string, boolean> = {};
		for (const tool of this.toolsService.getTools(undefined)) {
			allTools[tool.id] = true;
		}
		return {
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
			},
			instructionContext: {
				modeKind: ChatModeKind.Agent,
				enabledTools: allTools,
			},
			userSelectedTools: constObservable(allTools),
		};
	}

	async dispatchToolCall(toolCall: IVoiceToolCall): Promise<string> {
		const delegate = this._delegate;
		if (!delegate) {
			return 'error: no delegate set';
		}

		const args = toolCall.args;
		const argString = (k: string): string => {
			const v = args[k];
			return typeof v === 'string' ? v : '';
		};

		switch (toolCall.name) {
			case 'send_to_chat': {
				const text = argString('text');
				if (text) {
					if (!delegate.acceptInput(text)) {
						const resource = await delegate.getCurrentSessionResource();
						if (resource) {
							await this.chatService.sendRequest(resource, text, this._agentModeOptions);
						} else {
							const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
							await this.chatService.sendRequest(ref.object.sessionResource, text, this._agentModeOptions);
							ref.dispose();
						}
					}
				}
				break;
			}
			case 'new_sessions': {
				const sessions = args['sessions'];
				const items: { text?: string }[] = Array.isArray(sessions) ? sessions : [{ text: argString('text') }];
				let firstResource: URI | undefined;
				for (const item of items) {
					const text = item.text;
					if (text) {
						const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
						const resource = ref.object.sessionResource;
						if (!firstResource) {
							firstResource = resource;
						}
						await this.chatService.sendRequest(resource, text, this._agentModeOptions);
						ref.dispose();
					}
				}
				if (firstResource) {
					delegate.switchToSession(firstResource);
				}
				break;
			}
			case 'focus_session': {
				const targetSessionId = argString('coding_session_id');
				let targetResource: URI | undefined;
				if (targetSessionId) {
					// Try agent sessions first
					const agentSession = this.agentSessionsService.model.sessions
						.find(s => !s.isArchived() && s.resource.toString() === targetSessionId);
					targetResource = agentSession?.resource;
					// Fall back to regular chat sessions
					if (!targetResource) {
						for (const chatModel of this.chatService.chatModels.get()) {
							if (chatModel.sessionResource.toString() === targetSessionId) {
								targetResource = chatModel.sessionResource;
								break;
							}
						}
					}
				}
				if (targetResource) {
					const currentResource = await delegate.getCurrentSessionResource();
					if (targetResource.toString() !== currentResource?.toString()) {
						delegate.switchToSession(targetResource);
					}
				}
				break;
			}
			case 'approve_confirmation':
			case 'reject_confirmation': {
				const targetSessionId = argString('coding_session_id');
				// Look up the model from agent sessions first, then regular chat sessions
				let model: IChatModel | undefined;
				if (targetSessionId) {
					const agentSession = this.agentSessionsService.model.sessions
						.find(s => !s.isArchived() && s.resource.toString() === targetSessionId);
					model = agentSession
						? this.chatService.getSession(agentSession.resource)
						: undefined;
					// Fall back to regular chat sessions
					if (!model) {
						for (const chatModel of this.chatService.chatModels.get()) {
							if (chatModel.sessionResource.toString() === targetSessionId) {
								model = chatModel;
								break;
							}
						}
					}
					// Session not loaded — acquire it so we can confirm the tool invocation
					if (!model && agentSession) {
						const cts = new CancellationTokenSource();
						const ref = await this.chatService.acquireOrLoadSession(agentSession.resource, ChatAgentLocation.Chat, cts.token, 'voice-confirm').catch(() => undefined);
						cts.dispose();
						if (ref) {
							model = this.chatService.getSession(agentSession.resource);
							ref.dispose();
						}
					}
				}
				if (!model) {
					// Last resort: use the currently focused session
					const res = await delegate.getCurrentSessionResource();
					model = res ? this.chatService.getSession(res) : undefined;
				}
				if (model) {
					const lastReq = model.getRequests().at(-1);
					if (lastReq?.response) {
						for (const part of lastReq.response.response.value) {
							if (part.kind === 'toolInvocation') {
								const confirmed = toolCall.name === 'approve_confirmation'
									? IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction })
									: IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.Denied });
								if (confirmed) {
									break;
								}
							}
						}
					}
				}
				break;
			}
			case 'auto_approve_session': {
				delegate.addAllAutoApprovedSessions();
				break;
			}
			case 'revoke_auto_approve': {
				const sessionResource = await delegate.getCurrentSessionResource();
				if (sessionResource) {
					delegate.removeAutoApprovedSession(sessionResource.toString());
				}
				break;
			}
			case 'get_session_info': {
				return await this._gatherSessionInfo();
			}
			case 'get_session_changes': {
				const sessionId = typeof toolCall.args?.coding_session_id === 'string'
					? toolCall.args.coding_session_id
					: undefined;
				return await this._gatherSessionChanges(sessionId);
			}
			case 'get_session_thread': {
				const sessionId = typeof toolCall.args?.coding_session_id === 'string'
					? toolCall.args.coding_session_id
					: undefined;
				const rawN = toolCall.args?.last_n_turns;
				const lastN = typeof rawN === 'number' && rawN > 0 ? Math.min(10, Math.floor(rawN)) : 3;
				return await this._gatherSessionThread(sessionId, lastN);
			}
		}
		return 'ok';
	}

	private async _gatherSessionInfo(): Promise<string> {
		const allSessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		const delegate = this._delegate;
		const currentResource = await delegate?.getCurrentSessionResource();

		// Per-session lastActivity (ms epoch). 0 means "no timing info" — treat as oldest.
		const lastActivityOf = (s: typeof allSessions[number]): number =>
			s.timing.lastRequestEnded ?? s.timing.lastRequestStarted ?? s.timing.created ?? 0;

		// Calendar-day key (local time) for an epoch ms timestamp.
		const dayKey = (ms: number): string => {
			const d = new Date(ms);
			return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
		};

		// Filter to "active today, or if none today, the most-recent active day".
		const todayKey = dayKey(Date.now());
		const withTiming = allSessions
			.map(s => ({ s, t: lastActivityOf(s) }))
			.filter(x => x.t > 0); // drop sessions with no activity timestamp at all

		let filtered: typeof allSessions;
		const todays = withTiming.filter(x => dayKey(x.t) === todayKey);
		if (todays.length > 0) {
			filtered = todays.map(x => x.s);
		} else if (withTiming.length > 0) {
			// Fall back to the most recent active day.
			const mostRecent = withTiming.reduce((a, b) => (a.t >= b.t ? a : b));
			const mostRecentKey = dayKey(mostRecent.t);
			filtered = withTiming.filter(x => dayKey(x.t) === mostRecentKey).map(x => x.s);
		} else {
			filtered = [];
		}

		const sessionData = filtered.map(session => {
			const model = this.chatService.getSession(session.resource);
			const changes = getAgentChangesSummary(session.changes);
			const lastReq = model?.getRequests().at(-1);
			const lastResponseSummary = lastReq?.response?.response.value
				.filter(p => p.kind === 'markdownContent')
				.map(p => (p as { content: { value: string } }).content.value)
				.join(' ')
				.slice(0, 500) || '';

			const statusLabel =
				session.status === AgentSessionStatus.InProgress ? 'working'
					: session.status === AgentSessionStatus.NeedsInput ? 'waiting_for_input'
						: session.status === AgentSessionStatus.Completed ? 'idle'
							: 'unknown';

			const isActive = currentResource?.toString() === session.resource.toString();
			const lastActivity = lastActivityOf(session);
			const minutesAgo = lastActivity ? Math.round((Date.now() - lastActivity) / 60000) : undefined;

			return {
				id: session.resource.toString(),
				state: statusLabel,
				is_active: isActive,
				insertions: changes?.insertions ?? 0,
				deletions: changes?.deletions ?? 0,
				last_activity_minutes_ago: minutesAgo,
				last_response_summary: lastResponseSummary,
			};
		});

		return JSON.stringify({ sessions: sessionData });
	}

	/**
	 * Resolve a coding_session_id (resource URI string) to an IAgentSession.
	 * Falls back to the currently active session when id is missing/unknown.
	 */
	private async _resolveSession(coding_session_id: string | undefined) {
		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		if (coding_session_id) {
			const match = sessions.find(s => s.resource.toString() === coding_session_id);
			if (match) {
				return match;
			}
		}
		const currentResource = await this._delegate?.getCurrentSessionResource();
		if (currentResource) {
			const active = sessions.find(s => s.resource.toString() === currentResource.toString());
			if (active) {
				return active;
			}
		}
		return sessions[0];
	}

	/**
	 * Gather files touched + per-file insertions/deletions for a session.
	 * Returns a JSON string keyed for the LLM follow-up to summarize.
	 */
	private async _gatherSessionChanges(coding_session_id: string | undefined): Promise<string> {
		const session = await this._resolveSession(coding_session_id);
		if (!session) {
			return JSON.stringify({ session_id: coding_session_id ?? null, files: [], note: 'session_not_found' });
		}

		const changes = session.changes;
		const files: { path: string; insertions: number; deletions: number }[] = [];
		let totalInsertions = 0;
		let totalDeletions = 0;
		let totalFiles = 0;

		if (Array.isArray(changes)) {
			for (const c of changes) {
				// Both IChatSessionFileChange and IChatSessionFileChange2 carry a URI;
				// prefer modifiedUri (most accurate post-edit), fall back to uri.
				const uri = (c as { modifiedUri?: URI }).modifiedUri ?? (c as { uri?: URI }).uri;
				const path = uri ? this._formatPath(uri) : '(unknown)';
				files.push({ path, insertions: c.insertions, deletions: c.deletions });
				totalInsertions += c.insertions;
				totalDeletions += c.deletions;
			}
			totalFiles = files.length;
		} else if (changes && !Array.isArray(changes)) {
			// Already in summary form — we don't have per-file data.
			const summary = changes as { files: number; insertions: number; deletions: number };
			totalInsertions = summary.insertions;
			totalDeletions = summary.deletions;
			totalFiles = summary.files;
		}

		return JSON.stringify({
			session_id: session.resource.toString(),
			total_files: totalFiles,
			total_insertions: totalInsertions,
			total_deletions: totalDeletions,
			files: files.slice(0, 20), // cap so LLM context stays bounded
			truncated: files.length > 20,
		});
	}

	/**
	 * Gather the last N user/assistant turns of a coding session — actual
	 * conversation content, trimmed for spoken summarization.
	 */
	private async _gatherSessionThread(coding_session_id: string | undefined, lastN: number): Promise<string> {
		const session = await this._resolveSession(coding_session_id);
		if (!session) {
			return JSON.stringify({ session_id: coding_session_id ?? null, turns: [], note: 'session_not_found' });
		}

		const model = this.chatService.getSession(session.resource);
		if (!model) {
			return JSON.stringify({
				session_id: session.resource.toString(),
				turns: [],
				note: 'chat_model_not_loaded',
			});
		}

		const reqs = model.getRequests().slice(-lastN);
		const turns = reqs.map(req => {
			const userText = req.message.text || '';
			const assistantText = req.response?.response.value
				.filter(p => p.kind === 'markdownContent')
				.map(p => (p as { content: { value: string } }).content.value)
				.join(' ')
				.slice(0, 600) || '';
			return {
				user: userText.slice(0, 400),
				assistant: assistantText,
			};
		});

		return JSON.stringify({
			session_id: session.resource.toString(),
			turn_count: turns.length,
			turns,
		});
	}

	/** Render a URI as a short relative-ish path for spoken summaries. */
	private _formatPath(uri: URI): string {
		// Take last 2 segments — enough for the model to identify the file
		// without dumping full workspace paths into the prompt.
		const parts = uri.path.split('/').filter(Boolean);
		if (parts.length <= 2) {
			return uri.path.replace(/^\//, '');
		}
		return parts.slice(-2).join('/');
	}
}

registerSingleton(IVoiceToolDispatchService, VoiceToolDispatchService, InstantiationType.Delayed);
