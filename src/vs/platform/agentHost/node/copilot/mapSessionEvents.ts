/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AssistantMessageToolRequest, Attachment, SessionEvent, ToolExecutionCompleteContent, ToolExecutionCompleteData } from '@github/copilot-sdk';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { basename } from '../../../../base/common/path.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { AgentSession } from '../../common/agentService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { toToolCallMeta, type IToolCallUiMeta } from '../../common/meta/agentToolCallMeta.js';
import { IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, type AgentSelection, type Message, type ModelSelection, type ResponsePart, type StringOrMarkdown, type ToolCallCompletedState, type ToolResultContent, type Turn, type UsageInfo } from '../../common/state/sessionState.js';
import { getInvocationMessage, getPastTenseMessage, getShellIntention, getShellLanguage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isTaskCompleteTool, synthesizeSkillToolCall } from './copilotToolDisplay.js';
import { buildSessionDbUri } from '../shared/fileEditTracker.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { buildCopilotSystemNotification } from './copilotSystemNotification.js';
import { buildMcpChannel, buildMcpTopLevelCustomizationId } from '../shared/mcpCustomizationController.js';

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

/**
 * Returns true if the event is a SDK-injected `user.message` that should not
 * be shown to the user (e.g. skill-content injection).
 *
 * The SDK marks these via a non-`'user'` `source` field. Older sessions
 * persisted before `source` existed will not be filtered; that is accepted
 * leakage rather than guessed-at content sniffing.
 */
function isSyntheticUserMessage(event: SessionEvent): boolean {
	if (event.type !== 'user.message') {
		return false;
	}
	const source = event.data.source;
	return !!source && source.toLowerCase() !== 'user';
}

export function appendSdkToolResultContent(content: ToolResultContent[], sdkContents: readonly ToolExecutionCompleteContent[] | undefined): void {
	for (const sdkContent of sdkContents ?? []) {
		switch (sdkContent.type) {
			case 'shell_exit':
				content.push({
					type: ToolResultContentType.TerminalComplete,
					exitCode: sdkContent.exitCode,
					...(sdkContent.cwd !== undefined ? { cwd: URI.file(sdkContent.cwd).toString() } : {}),
					...(sdkContent.outputPreview !== undefined ? { preview: sdkContent.outputPreview } : {}),
					...(sdkContent.outputTruncated !== undefined ? { truncated: sdkContent.outputTruncated } : {}),
				});
				break;
		}
	}
}

// =============================================================================
// Single-pass turn builder
// =============================================================================

/** Per-tool-call info captured from `tool.execution_start` and reused at `tool.execution_complete`. */
interface IToolStartInfo {
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: StringOrMarkdown;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal' | 'subagent' | 'search';
	readonly language?: string;
	/** Intention (why the command runs) for shell tools, from their `description` argument. */
	readonly intention?: string;
	readonly subagentAgentName?: string;
	readonly subagentDescription?: string;
	readonly parameters: Record<string, unknown> | undefined;
	readonly parentToolCallId?: string;
	readonly mcpServerName?: string;
	readonly mcpToolName?: string;
	readonly mcpUiResourceUri?: string;
}

/** Subagent metadata seen via `subagent.started`, applied to the parent tool call's content at `tool.execution_complete`. */
interface ISubagentInfo {
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
}

/**
 * Mutable per-turn state used while iterating events. The parent session
 * has one builder; each subagent turn (one per `parentToolCallId`) has its
 * own builder so inner events route there directly.
 */
interface ITurnBuilder {
	id: string;
	message: Message;
	readonly responseParts: ResponsePart[];
	usage: UsageInfo | undefined;
	/** Tool starts seen but not yet completed in this turn, keyed by toolCallId. */
	readonly pendingTools: Map<string, IToolStartInfo>;
}

export interface IMapSessionEventsOptions {
	readonly workingDirectory?: URI;
	readonly model?: ModelSelection;
	readonly agent?: AgentSelection;
}

function newTurnBuilder(id: string, text: string, options?: { attachments?: MessageAttachment[]; model?: ModelSelection; agent?: AgentSelection; origin?: MessageKind }): ITurnBuilder {
	const message: Message = {
		text,
		origin: { kind: options?.origin ?? MessageKind.User },
		...(options?.attachments?.length ? { attachments: options.attachments } : {}),
		...(options?.model ? { model: options.model } : {}),
		...(options?.agent ? { agent: options.agent } : {}),
	};
	return { id, message, responseParts: [], usage: undefined, pendingTools: new Map() };
}

function readStringProperty(source: unknown, key: string): string | undefined {
	if (!source || typeof source !== 'object' || Array.isArray(source)) {
		return undefined;
	}
	const value = (source as Record<string, unknown>)[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readMcpUiResourceUri(source: unknown): string | undefined {
	if (!source || typeof source !== 'object' || Array.isArray(source)) {
		return undefined;
	}
	const toolDescription = (source as Record<string, unknown>)['toolDescription'];
	if (!toolDescription || typeof toolDescription !== 'object' || Array.isArray(toolDescription)) {
		return undefined;
	}
	const meta = (toolDescription as Record<string, unknown>)['_meta'];
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	const ui = (meta as Record<string, unknown>)['ui'];
	if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
		return undefined;
	}
	return readStringProperty(ui, 'resourceUri');
}

function makeToolStartInfo(toolName: string, rawArguments: unknown, parentToolCallId: string | undefined, workingDirectory: URI | undefined, source: unknown): IToolStartInfo | undefined {
	if (isHiddenTool(toolName)) {
		return undefined;
	}
	const rawArgs = rawArguments !== undefined ? tryStringify(rawArguments) : undefined;
	let parameters: Record<string, unknown> | undefined;
	if (rawArgs) {
		try { parameters = JSON.parse(rawArgs) as Record<string, unknown>; } catch { /* ignore */ }
	}
	// stripRedundantCdPrefix mutates `parameters` and signals via its
	// return value. We re-stringify only when it changed something so
	// `getToolInputString` sees the cleaned command line.
	const cleaned = stripRedundantCdPrefix(toolName, parameters, workingDirectory) ? tryStringify(parameters) : undefined;
	const toolArgs = cleaned ?? rawArgs;
	const toolKind = getToolKind(toolName);
	const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;
	const displayName = getToolDisplayName(toolName);
	return {
		toolName,
		displayName,
		invocationMessage: getInvocationMessage(toolName, displayName, parameters),
		toolInput: getToolInputString(toolName, parameters, toolArgs),
		toolKind,
		language: toolKind === 'terminal' ? getShellLanguage(toolName) : undefined,
		intention: getShellIntention(toolName, parameters),
		subagentAgentName: subagentMeta?.agentName,
		subagentDescription: subagentMeta?.description,
		parameters,
		parentToolCallId,
		mcpServerName: readStringProperty(source, 'mcpServerName'),
		mcpToolName: readStringProperty(source, 'mcpToolName'),
		mcpUiResourceUri: readMcpUiResourceUri(source),
	};
}

function finalizeTurn(builder: ITurnBuilder, state: TurnState): Turn {
	return {
		id: builder.id,
		message: builder.message,
		responseParts: builder.responseParts,
		usage: builder.usage,
		state,
	};
}

/**
 * Maps raw SDK session events directly into agent-protocol {@link Turn}s
 * for the parent session and any subagent child sessions, restoring stored
 * file-edit metadata from the session database when available.
 *
 * Subagent inner events are routed to per-`parentToolCallId` turn builders
 * so they appear under their own session view rather than polluting the
 * parent transcript. Each subagent's tool calls are returned via
 * {@link mapSessionEventsToTurns.subagentTurnsByToolCallId} so callers can
 * expose `getSubagentMessages` cheaply.
 *
 * If `workingDirectory` is provided, redundant `cd <workingDirectory> &&`
 * (or PowerShell equivalent) prefixes are stripped from shell tool
 * commands so clients see the simplified form.
 */
export async function mapSessionEvents(
	session: URI,
	db: ISessionDatabase | undefined,
	events: readonly SessionEvent[],
	options: URI | IMapSessionEventsOptions | undefined = undefined,
): Promise<{ turns: Turn[]; subagentTurnsByToolCallId: ReadonlyMap<string, Turn[]> }> {
	const workingDirectory = options instanceof URI ? options : options?.workingDirectory;
	let currentModel = options instanceof URI ? undefined : options?.model;
	let currentAgent = options instanceof URI ? undefined : options?.agent;
	// First pass: collect tool-arg info and identify edit tool calls so we
	// can batch-load their stored file edits before the second pass needs
	// them at `tool.execution_complete` time. We also build the
	// `agentId` -> parent tool call id map here so the second pass can route
	// sub-agent events without depending on event ordering.
	const toolInfoByCallId = new Map<string, IToolStartInfo>();
	const editToolCallIds: string[] = [];
	const completionsByCallId = new Map<string, ToolExecutionCompleteData>();

	// The SDK tags events that originate from a sub-agent with an
	// envelope-level `agentId` (the deprecated `data.parentToolCallId` is no
	// longer populated). `subagent.started` carries both the sub-agent's
	// `agentId` and the parent tool call id it was spawned from, so we map
	// one to the other and resolve every later sub-agent event through it.
	const parentToolCallIdByAgentId = new Map<string, string>();
	const resolveParentToolCallId = (agentId: string | undefined, deprecatedParentToolCallId: string | undefined): string | undefined => {
		const mapped = agentId ? parentToolCallIdByAgentId.get(agentId) : undefined;
		return mapped ?? deprecatedParentToolCallId;
	};

	for (const e of events) {
		if (e.type === 'subagent.started') {
			if (e.agentId) {
				parentToolCallIdByAgentId.set(e.agentId, e.data.toolCallId);
			}
		}
		if (e.type === 'tool.execution_complete') {
			completionsByCallId.set(e.data.toolCallId, e.data);
		}
		if (e.type === 'tool.execution_start') {
			const d = e.data;
			const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
			const info = makeToolStartInfo(d.toolName, d.arguments, parentToolCallId, workingDirectory, d);
			if (!info) {
				continue;
			}
			toolInfoByCallId.set(d.toolCallId, info);
			const command = isString(info.parameters?.command) ? info.parameters.command : undefined;
			if (isEditTool(d.toolName, command)) {
				editToolCallIds.push(d.toolCallId);
			}
		}
	}

	// Pre-load stored file-edit metadata for all edit tool calls.
	let storedEdits: Map<string, IFileEditRecord[]> | undefined;
	if (db && editToolCallIds.length > 0) {
		try {
			const records = await db.getFileEdits(editToolCallIds);
			if (records.length > 0) {
				storedEdits = new Map();
				for (const r of records) {
					let list = storedEdits.get(r.toolCallId);
					if (!list) {
						list = [];
						storedEdits.set(r.toolCallId, list);
					}
					list.push(r);
				}
			}
		} catch {
			// Database may not exist yet for new sessions — that's fine.
		}
	}

	const sessionUriStr = session.toString();
	const providerId = session.scheme;
	const rawSessionId = AgentSession.id(session);
	const turns: Turn[] = [];

	// Subagent state. Each subagent has its own active turn builder; only
	// the most recent turn per subagent is built (subagents currently emit
	// at most one turn per invocation).
	const subagentBuilders = new Map<string, ITurnBuilder>();
	const subagentTurnStates = new Map<string, TurnState>();
	const subagentTurns = new Map<string, Turn[]>();
	const subagentInfoByToolCallId = new Map<string, ISubagentInfo>();

	let parentBuilder: ITurnBuilder | undefined;
	let parentTurnState = TurnState.Cancelled;
	let parentTurnAborted = false;
	let rootAssistantTurnActive = false;
	let pendingAutoModeResolved: Extract<SessionEvent, { type: 'session.auto_mode_resolved' }>['data'] | undefined;

	const flushParent = (): void => {
		if (!parentBuilder) {
			return;
		}
		turns.push(finalizeTurn(parentBuilder, parentTurnState));
		parentBuilder = undefined;
		parentTurnState = TurnState.Cancelled;
		parentTurnAborted = false;
	};

	const flushSubagent = (parentToolCallId: string): void => {
		const builder = subagentBuilders.get(parentToolCallId);
		if (!builder) {
			subagentTurnStates.delete(parentToolCallId);
			return;
		}
		subagentBuilders.delete(parentToolCallId);
		const state = subagentTurnStates.get(parentToolCallId) ?? TurnState.Complete;
		subagentTurnStates.delete(parentToolCallId);
		if (builder.responseParts.length === 0) {
			return;
		}
		const list = subagentTurns.get(parentToolCallId) ?? [];
		list.push(finalizeTurn(builder, state));
		subagentTurns.set(parentToolCallId, list);
	};

	const ensureSubagentBuilder = (parentToolCallId: string): ITurnBuilder => {
		let builder = subagentBuilders.get(parentToolCallId);
		if (!builder) {
			builder = newTurnBuilder(generateUuid(), '');
			subagentBuilders.set(parentToolCallId, builder);
			if (!subagentTurnStates.has(parentToolCallId)) {
				subagentTurnStates.set(parentToolCallId, TurnState.Complete);
			}
		}
		return builder;
	};

	const targetBuilderFor = (parentToolCallId: string | undefined): ITurnBuilder | undefined => {
		if (parentToolCallId) {
			return ensureSubagentBuilder(parentToolCallId);
		}
		return parentBuilder;
	};

	for (const e of events) {
		switch (e.type) {
			case 'assistant.turn_start':
				if (!e.agentId) {
					rootAssistantTurnActive = true;
				}
				break;
			case 'assistant.turn_end':
				if (!e.agentId) {
					rootAssistantTurnActive = false;
				}
				break;
			case 'session.model_change': {
				currentModel = { id: e.data.newModel };
				break;
			}
			case 'session.auto_mode_resolved': {
				if (!e.agentId) {
					pendingAutoModeResolved = e.data;
				}
				break;
			}
			case 'subagent.deselected': {
				if (!e.agentId) {
					currentAgent = undefined;
				}
				break;
			}
			case 'user.message': {
				if (isSyntheticUserMessage(e)) {
					continue;
				}
				const d = e.data;
				const messageId = d.interactionId ?? '';
				const content = d.content ?? '';
				const attachments = sdkAttachmentsToProtocol(d.attachments);
				// User messages carry no deprecated `parentToolCallId`; route
				// sub-agent user messages by the envelope `agentId` only.
				const parentToolCallId = resolveParentToolCallId(e.agentId, undefined);
				if (parentToolCallId) {
					// User messages from a sub-agent route into the subagent's
					// transcript. They never start a new parent turn; subagents
					// currently only see assistant messages in practice, but
					// route conservatively.
					const builder = ensureSubagentBuilder(parentToolCallId);
					if (content) {
						builder.responseParts.push({
							kind: ResponsePartKind.Markdown,
							id: generateUuid(),
							content,
						});
					}
					if (attachments?.length) {
						builder.message = { ...builder.message, attachments };
					}
				} else {
					// A new top-level user message starts a new parent turn.
					// Use the SDK envelope id (the same value
					// `setTurnEventId` records as `event_id`) so the restored
					// turn id round-trips back to the SDK boundary id that
					// fork / truncate RPCs operate on.
					flushParent();
					const turnId = e.id ?? messageId;
					parentBuilder = newTurnBuilder(turnId, content, { attachments, model: currentModel, agent: currentAgent });
					if (pendingAutoModeResolved) {
						parentBuilder.usage = {
							model: pendingAutoModeResolved.chosenModel,
							_meta: { autoModeResolved: pendingAutoModeResolved },
						};
						pendingAutoModeResolved = undefined;
					}
				}
				break;
			}
			case 'assistant.message': {
				const d = e.data;
				const messageId = d.messageId ?? d.interactionId ?? '';
				const content = d.content ?? '';
				const reasoningText = d.reasoningText;
				const hasToolRequests = !!d.toolRequests && d.toolRequests.length > 0;
				const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
				if (!content && !reasoningText && !hasToolRequests) {
					if (!parentToolCallId && parentBuilder && !parentTurnAborted) {
						parentTurnState = TurnState.Complete;
					}
					break;
				}
				// When this is the first event in a turn (no parent builder
				// yet), seed the builder with the SDK envelope id so the
				// turn id matches `turns.event_id` for fork/truncate
				// lookups. See the matching note in the `user.message`
				// branch above.
				const fallbackTurnId = e.id ?? messageId;
				const builder = targetBuilderFor(parentToolCallId)
					?? (parentBuilder = newTurnBuilder(fallbackTurnId, ''));
				if (reasoningText) {
					builder.responseParts.push({
						kind: ResponsePartKind.Reasoning,
						id: generateUuid(),
						content: reasoningText,
					});
				}
				if (content) {
					builder.responseParts.push({
						kind: ResponsePartKind.Markdown,
						id: generateUuid(),
						content,
					});
				}
				if (!parentToolCallId && builder === parentBuilder && !parentTurnAborted) {
					parentTurnState = hasToolRequests ? TurnState.Cancelled : TurnState.Complete;
				}
				if (d.toolRequests?.length) {
					appendFallbackToolRequests(builder, d.toolRequests, parentToolCallId);
				}
				break;
			}
			case 'system.notification': {
				const notification = buildCopilotSystemNotification(e);
				if (!notification) {
					break;
				}
				if (rootAssistantTurnActive && parentBuilder) {
					parentBuilder.responseParts.push({
						kind: ResponsePartKind.SystemNotification,
						content: notification.messageText,
					});
				} else if (notification.startsTurn) {
					flushParent();
					parentBuilder = newTurnBuilder(e.id, notification.messageText, { origin: MessageKind.SystemNotification });
				}
				break;
			}
			case 'subagent.started': {
				const d = e.data;
				subagentInfoByToolCallId.set(d.toolCallId, {
					agentName: d.agentName,
					agentDisplayName: d.agentDisplayName,
					agentDescription: d.agentDescription,
				});
				break;
			}
			case 'tool.execution_start': {
				const parentToolCallId = resolveParentToolCallId(e.agentId, e.data.parentToolCallId);
				if (!parentToolCallId && parentBuilder) {
					parentTurnState = TurnState.Cancelled;
				}
				break;
			}
			case 'tool.execution_complete': {
				const d = e.data;
				const info = toolInfoByCallId.get(d.toolCallId);
				if (!info) {
					// Orphan complete (no matching start), or hidden tool.
					continue;
				}
				toolInfoByCallId.delete(d.toolCallId);
				const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
				if (isTaskCompleteTool(info.toolName)) {
					const builder = targetBuilderFor(parentToolCallId);
					if (!builder) {
						continue;
					}
					const summary = getTaskCompleteMarkdown(info.parameters, d.error?.message ?? d.result?.content);
					if (summary) {
						builder.responseParts.push({
							kind: ResponsePartKind.Markdown,
							id: generateUuid(),
							content: summary,
						});
					}
					if (!parentToolCallId && d.success && builder === parentBuilder && !parentTurnAborted) {
						parentTurnState = TurnState.Complete;
					}
					continue;
				}
				const builder = targetBuilderFor(parentToolCallId);
				if (!builder) {
					// No active turn to attach this completion to.
					continue;
				}
				const completedPart = makeCompletedToolCallPart(d, info, sessionUriStr, providerId, rawSessionId, storedEdits, subagentInfoByToolCallId.get(d.toolCallId));
				builder.responseParts.push(completedPart);
				// When a parent tool call that spawned a subagent completes,
				// flush the subagent's accumulated turn.
				if (!parentToolCallId && subagentInfoByToolCallId.has(d.toolCallId)) {
					flushSubagent(d.toolCallId);
				}
				break;
			}
			case 'skill.invoked': {
				const synth = synthesizeSkillToolCall(e.data, e.id);
				const parentToolCallId = resolveParentToolCallId(e.agentId, undefined);
				const builder = targetBuilderFor(parentToolCallId)
					?? (parentBuilder = newTurnBuilder(generateUuid(), ''));
				if (!parentToolCallId && builder === parentBuilder) {
					parentTurnState = TurnState.Cancelled;
				}
				builder.responseParts.push({
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: synth.toolCallId,
						toolName: synth.toolName,
						displayName: synth.displayName,
						invocationMessage: synth.invocationMessage,
						success: true,
						pastTenseMessage: synth.pastTenseMessage,
						confirmed: ToolCallConfirmationReason.NotNeeded,
					} satisfies ToolCallCompletedState,
				});
				break;
			}
			case 'abort': {
				const parentToolCallId = resolveParentToolCallId(e.agentId, undefined);
				if (parentToolCallId) {
					subagentTurnStates.set(parentToolCallId, TurnState.Cancelled);
				} else {
					rootAssistantTurnActive = false;
					if (parentBuilder) {
						parentTurnState = TurnState.Cancelled;
						parentTurnAborted = true;
					}
				}
				break;
			}
			default:
				break;
		}
	}

	flushParent();
	for (const parentToolCallId of [...subagentBuilders.keys()]) {
		flushSubagent(parentToolCallId);
	}

	return { turns, subagentTurnsByToolCallId: subagentTurns };

	function appendFallbackToolRequests(builder: ITurnBuilder, toolRequests: readonly AssistantMessageToolRequest[], parentToolCallId: string | undefined): void {
		for (const request of toolRequests) {
			const completion = completionsByCallId.get(request.toolCallId);
			if (completion && toolInfoByCallId.has(request.toolCallId)) {
				continue;
			}
			const info = toolInfoByCallId.get(request.toolCallId)
				?? makeToolStartInfo(request.name, request.arguments, parentToolCallId, workingDirectory, request);
			if (!info) {
				continue;
			}
			if (isTaskCompleteTool(info.toolName)) {
				const summary = getTaskCompleteMarkdown(info.parameters, completion?.error?.message ?? completion?.result?.content);
				if (summary) {
					builder.responseParts.push({
						kind: ResponsePartKind.Markdown,
						id: generateUuid(),
						content: summary,
					});
				}
				if (!parentToolCallId && completion?.success && builder === parentBuilder && !parentTurnAborted) {
					parentTurnState = TurnState.Complete;
				}
				continue;
			}
			builder.responseParts.push(makeCompletedToolCallPart(
				completion ?? { toolCallId: request.toolCallId, success: true },
				info,
				sessionUriStr,
				providerId,
				rawSessionId,
				storedEdits,
				subagentInfoByToolCallId.get(request.toolCallId),
			));
		}
	}
}

/**
 * Translates the SDK's `UserMessageAttachment[]` payload back into the
 * agent-protocol {@link MessageAttachment} shape. Text blob attachments
 * surface as {@link MessageAttachmentKind.Simple}; other blobs surface as
 * inline {@link MessageAttachmentKind.EmbeddedResource} payloads.
 * File/directory/selection variants reconstruct local `Resource`
 * attachments. We don't try to re-link these to the on-disk snapshots
 * produced by the agent host's attachment rewriter — the SDK keeps a
 * copy of the bytes / paths it actually saw on send, which is the
 * authoritative record for replay.
 */
function sdkAttachmentsToProtocol(
	attachments: readonly Attachment[] | undefined,
): MessageAttachment[] | undefined {
	if (!attachments?.length) {
		return undefined;
	}
	const out: MessageAttachment[] = [];
	for (const a of attachments) {
		const converted = sdkAttachmentToProtocol(a);
		if (converted) {
			out.push(converted);
		}
	}
	return out.length > 0 ? out : undefined;
}

function sdkAttachmentToProtocol(
	attachment: Attachment,
): MessageAttachment | undefined {
	switch (attachment.type) {
		case 'file': {
			return {
				type: MessageAttachmentKind.Resource,
				uri: URI.file(attachment.path).toString(),
				label: attachment.displayName || basename(attachment.path),
				displayKind: getMediaMime(attachment.path)?.startsWith('image/') ? 'image' : 'document',
			};
		}
		case 'directory': {
			return {
				type: MessageAttachmentKind.Resource,
				uri: URI.file(attachment.path).toString(),
				label: attachment.displayName || basename(attachment.path),
				displayKind: 'directory',
			};
		}
		case 'selection': {
			return {
				type: MessageAttachmentKind.Resource,
				uri: URI.file(attachment.filePath).toString(),
				label: attachment.displayName,
				displayKind: 'selection',
				selection: { range: attachment.selection! },
			};
		}
		case 'blob': {
			if (typeof attachment.data !== 'string') {
				return undefined;
			}
			if (attachment.mimeType.startsWith('text/plain')) {
				return {
					type: MessageAttachmentKind.Simple,
					label: attachment.displayName ?? 'attachment',
					modelRepresentation: decodeBase64(attachment.data ?? '').toString(),
				};
			}
			const displayKind = attachment.mimeType.startsWith('image/') ? 'image' : undefined;
			return {
				type: MessageAttachmentKind.EmbeddedResource,
				label: attachment.displayName ?? 'attachment',
				data: attachment.data ?? '',
				contentType: attachment.mimeType,
				displayKind,
			};
		}
		default:
			return undefined;
	}
}

/**
 * Builds a {@link ToolCallCompletedState}-shaped response part from an
 * SDK `tool.execution_complete` event. Restores file-edit content
 * references from `storedEdits` and merges subagent metadata when the
 * tool call spawned a child session.
 */
function makeCompletedToolCallPart(
	d: ToolExecutionCompleteData,
	info: IToolStartInfo,
	sessionUriStr: string,
	providerId: string,
	rawSessionId: string,
	storedEdits: Map<string, IFileEditRecord[]> | undefined,
	subagent: ISubagentInfo | undefined,
): ResponsePart {
	const toolOutput = d.error?.message ?? d.result?.content;
	const content: ToolResultContent[] = [];
	if (toolOutput !== undefined) {
		content.push({ type: ToolResultContentType.Text, text: toolOutput });
	}
	appendSdkToolResultContent(content, d.result?.contents);

	// Restore file edit content references from the database.
	const edits = storedEdits?.get(d.toolCallId);
	if (edits) {
		for (const edit of edits) {
			const beforeUri = edit.kind === 'rename' && edit.originalPath
				? URI.file(edit.originalPath).toString()
				: URI.file(edit.filePath).toString();
			const afterUri = URI.file(edit.filePath).toString();
			const hasBefore = edit.kind !== 'create';
			const hasAfter = edit.kind !== 'delete';
			content.push({
				type: ToolResultContentType.FileEdit,
				before: hasBefore ? {
					uri: beforeUri,
					content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'before') },
				} : undefined,
				after: hasAfter ? {
					uri: afterUri,
					content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'after') },
				} : undefined,
				diff: (edit.addedLines !== undefined || edit.removedLines !== undefined)
					? { added: edit.addedLines, removed: edit.removedLines }
					: undefined,
			});
		}
	}

	if (subagent) {
		content.push({
			type: ToolResultContentType.Subagent,
			resource: buildSubagentSessionUri(sessionUriStr, d.toolCallId),
			title: subagent.agentDisplayName,
			agentName: subagent.agentName,
			description: subagent.agentDescription,
		});
	}

	const mcpServerName = info.mcpServerName ?? readStringProperty(d, 'mcpServerName');
	const mcpToolName = info.mcpToolName ?? readStringProperty(d, 'mcpToolName');
	const mcpUiResourceUri = info.mcpUiResourceUri ?? readMcpUiResourceUri(d);
	const mcpUi: IToolCallUiMeta | undefined = mcpUiResourceUri
		? {
			resourceUri: mcpUiResourceUri,
			...(mcpServerName ? { channel: buildMcpChannel(providerId, rawSessionId, mcpServerName) } : {}),
		}
		: undefined;

	const tc: ToolCallCompletedState = {
		status: ToolCallStatus.Completed,
		toolCallId: d.toolCallId,
		toolName: info.toolName,
		displayName: info.displayName,
		intention: info.intention,
		...(mcpServerName ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId: buildMcpTopLevelCustomizationId(providerId, rawSessionId, mcpServerName) } } : {}),
		invocationMessage: info.invocationMessage,
		toolInput: info.toolInput,
		success: d.success,
		pastTenseMessage: getPastTenseMessage(info.toolName, info.displayName, info.parameters, d.success, d.success ? toolOutput : undefined),
		content: content.length > 0 ? content : undefined,
		error: d.error,
		confirmed: ToolCallConfirmationReason.NotNeeded,
		_meta: toToolCallMeta({
			toolKind: info.toolKind,
			language: info.language,
			subagentDescription: info.subagentDescription,
			subagentAgentName: info.subagentAgentName,
			mcpServerName,
			mcpToolName,
			ui: mcpUi,
		}),
	};
	return { kind: ResponsePartKind.ToolCall, toolCall: tc };
}
