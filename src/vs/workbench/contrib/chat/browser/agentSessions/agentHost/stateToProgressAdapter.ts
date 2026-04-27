/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownLinkLabel, IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { marked, type Token, type Tokens, type TokensList } from '../../../../../../base/common/marked/marked.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, getToolSubagentContent, type ActiveTurn, type ICompletedToolCall, type ToolCallState, type Turn, FileEditKind, ToolResultContentType, type ToolResultContent } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { StringOrMarkdown, type FileEdit } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IChatModifiedFilesConfirmationData, type IChatProgress, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IToolConfirmationMessages, type IToolData, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';

/**
 * Constructs a terminal tool session ID from a terminal URI and backend session.
 * The ID is a JSON string containing both so consumers can parse out either.
 */
export function makeAhpTerminalToolSessionId(terminalUri: string, session: URI): string {
	return JSON.stringify({ terminal: terminalUri, session: session.toString() });
}

/**
 * Parses a terminal tool session ID back into its terminal and session URIs.
 */
export function parseAhpTerminalToolSessionId(id: string): { terminal: string; session: string } | undefined {
	try {
		const parsed = JSON.parse(id);
		if (typeof parsed?.terminal === 'string' && typeof parsed?.session === 'string') {
			return parsed;
		}
	} catch { /* not an AHP terminal session ID */ }
	return undefined;
}

/**
 * Extracts the task description from `_meta.subagentDescription`, which is
 * populated from the tool's arguments at `tool_start` time by the event
 * mapper. This is the short task description (e.g., "Find related files"),
 * NOT the agent's own description.
 */
function getSubagentTaskDescription(tc: { _meta?: Record<string, unknown> }): string | undefined {
	const v = tc._meta?.subagentDescription;
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Extracts the agent name from `_meta.subagentAgentName`.
 */
function getSubagentAgentName(tc: { _meta?: Record<string, unknown> }): string | undefined {
	const v = tc._meta?.subagentAgentName;
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Known tool names that spawn subagent sessions. Used as a client-side
 * fallback when the server hasn't set `_meta.toolKind` (e.g. sessions
 * restored by an older server version that didn't carry `_meta`).
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['task']);

export function isSubagentToolName(toolName: string): boolean {
	return SUBAGENT_TOOL_NAMES.has(toolName);
}

/**
 * Returns true if this tool call spawns a subagent session, either because
 * the server reported `_meta.toolKind === 'subagent'` or because the tool
 * name is in the known fallback set (older snapshots without `_meta`).
 */
export function isSubagentTool(tc: ToolCallState): boolean {
	return getToolKind(tc) === 'subagent' || isSubagentToolName(tc.toolName);
}

/**
 * Finds a terminal content block in a tool call's content array.
 * Returns the terminal URI if found.
 */
export function getTerminalContentUri(content: ToolResultContent[] | undefined): string | undefined {
	if (!content) {
		return undefined;
	}
	for (const block of content) {
		if (block.type === ToolResultContentType.Terminal) {
			return block.resource;
		}
	}
	return undefined;
}

/**
 * Converts completed turns from the protocol state into session history items.
 */
export function turnsToHistory(backendSession: URI, turns: readonly Turn[], participantId: string, connectionAuthority: string | undefined, modelId?: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		// Request
		history.push({ id: turn.id, type: 'request', prompt: turn.userMessage.text, participant: participantId, modelId });

		// Response parts — iterate the unified responseParts array
		const parts: IChatProgress[] = [];

		for (const rp of turn.responseParts) {
			switch (rp.kind) {
				case ResponsePartKind.Markdown:
					if (rp.content) {
						parts.push({ kind: 'markdownContent', content: rawMarkdownToString(rp.content, connectionAuthority, { supportHtml: true }) });
					}
					break;
				case ResponsePartKind.ToolCall: {
					const tc = rp.toolCall as ICompletedToolCall;
					const fileEditParts = completedToolCallToEditParts(tc);
					const serialized = completedToolCallToSerialized(tc, undefined, backendSession, connectionAuthority);
					if (fileEditParts.length > 0) {
						serialized.presentation = ToolInvocationPresentation.Hidden;
					}
					parts.push(serialized);
					parts.push(...fileEditParts);
					break;
				}
				case ResponsePartKind.Reasoning:
					if (rp.content) {
						parts.push({ kind: 'thinking', value: rp.content });
					}
					break;
				case ResponsePartKind.ContentRef:
					// Content references are not restored into history;
					// they are handled separately by the content provider.
					break;
			}
		}

		// Error message for failed turns
		if (turn.state === TurnState.Error && turn.error) {
			parts.push({ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${turn.error.errorType}) ${turn.error.message}`) });
		}

		history.push({ type: 'response', parts, participant: participantId });
	}
	return history;
}

/**
 * Converts an active (in-progress) turn's accumulated state into progress
 * items suitable for replaying into the chat UI when reconnecting to a
 * session that is mid-turn.
 *
 * Returns serialized progress items for content already received (text,
 * reasoning, completed tool calls) and live {@link ChatToolInvocation}
 * objects for running tool calls and pending confirmations.
 */
export function activeTurnToProgress(sessionResource: URI, activeTurn: ActiveTurn, connectionAuthority: string | undefined): IChatProgress[] {
	const parts: IChatProgress[] = [];

	for (const rp of activeTurn.responseParts) {
		switch (rp.kind) {
			case ResponsePartKind.Markdown:
				if (rp.content) {
					parts.push({ kind: 'markdownContent', content: rawMarkdownToString(rp.content, connectionAuthority) });
				}
				break;
			case ResponsePartKind.Reasoning:
				if (rp.content) {
					parts.push({ kind: 'thinking', value: rp.content });
				}
				break;
			case ResponsePartKind.ToolCall: {
				const tc = rp.toolCall;
				if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
					parts.push(completedToolCallToSerialized(tc as ICompletedToolCall, undefined, sessionResource, connectionAuthority));
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
					parts.push(toolCallStateToInvocation(tc, undefined, sessionResource, connectionAuthority));
				}
				break;
			}
			case ResponsePartKind.ContentRef:
				break;
		}
	}

	return parts;
}

function getTerminalInput(tc: ToolCallState): string | undefined {
	if (tc.status !== ToolCallStatus.Streaming && tc.toolInput) {
		try {
			return JSON.parse(tc.toolInput).command || tc.toolInput;
		} catch {
			return tc.toolInput;
		}
	}

	return undefined;
}
function getTerminalOutput(tc: ToolCallState) {
	const text = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running ? tc.content?.find(c => c.type === 'text')?.text : undefined;
	return text ? { text } : undefined;
}

function getTerminalLanguage(tc: ToolCallState) {
	return tc.toolName === 'powershell' ? 'powershell' : 'shellscript';
}

/**
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
export function completedToolCallToSerialized(tc: ICompletedToolCall, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string | undefined): IChatToolInvocationSerialized {
	const terminalContentUri = tc.status === ToolCallStatus.Completed ? getTerminalContentUri(tc.content) : undefined;
	const isTerminal = !!terminalContentUri;
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	const invocationMsg = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? localize('ahp.running', "Running {0}...", tc.displayName);

	// Check for subagent content
	const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : undefined;
	const isSubagent = subagentContent || isSubagentTool(tc);
	if (isSubagent && tc.status === ToolCallStatus.Completed) {
		const resultText = getToolOutputText(tc);
		const pastTenseMsg = isSuccess
			? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
			: invocationMsg;
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: tc.toolCallId,
			toolId: tc.toolName,
			source: ToolDataSource.Internal,
			invocationMessage: invocationMsg,
			originMessage: undefined,
			pastTenseMessage: pastTenseMsg,
			isConfirmed: isSuccess
				? { type: ToolConfirmKind.ConfirmationNotNeeded }
				: { type: ToolConfirmKind.Denied },
			isComplete: true,
			presentation: undefined,
			subAgentInvocationId: subAgentInvocationId,
			toolSpecificData: {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc) ?? tc.displayName,
				agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
				result: resultText,
			},
		};
	}

	let toolSpecificData: IChatTerminalToolInvocationData | undefined;
	if (isTerminal || getToolKind(tc) === 'terminal') {
		toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: getTerminalInput(tc) ?? '' },
			language: getTerminalLanguage(tc),
			terminalToolSessionId: terminalContentUri ? makeAhpTerminalToolSessionId(terminalContentUri, sessionResource) : undefined,
			terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : undefined,
			terminalCommandOutput: getTerminalOutput(tc),
			terminalCommandState: { exitCode: isSuccess ? 0 : 1 },
		};
	}

	const pastTenseMsg = isSuccess
		? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
		: invocationMsg;

	return {
		kind: 'toolInvocationSerialized',
		toolCallId: tc.toolCallId,
		toolId: tc.toolName,
		source: ToolDataSource.Internal,
		invocationMessage: invocationMsg,
		originMessage: undefined,
		pastTenseMessage: isTerminal ? undefined : pastTenseMsg,
		isConfirmed: isSuccess
			? { type: ToolConfirmKind.ConfirmationNotNeeded }
			: { type: ToolConfirmKind.Denied },
		isComplete: true,
		presentation: undefined,
		subAgentInvocationId: subAgentInvocationId,
		toolSpecificData,
	};
}

/**
 * Builds edit-structure progress parts for a completed tool call that
 * produced file edits. Returns an empty array if the tool call has no edits.
 * These parts replay the undo stops and code-block UI when restoring history.
 */
export function completedToolCallToEditParts(tc: ICompletedToolCall): IChatProgress[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const fileEdits = getToolFileEdits(tc);
	if (fileEdits.length === 0) {
		return [];
	}
	const parts: IChatProgress[] = [];
	for (const edit of fileEdits) {
		const fileUri = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
		if (!fileUri) {
			continue;
		}
		// Emit workspace file edit progress for creates, deletes, and renames
		const isCreate = !edit.before && !!edit.after;
		const isDelete = !!edit.before && !edit.after;
		const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));
		if (isCreate || isDelete || isRename) {
			parts.push({
				kind: 'workspaceEdit',
				edits: [{
					oldResource: edit.before?.uri ? URI.parse(edit.before.uri) : undefined,
					newResource: edit.after?.uri ? URI.parse(edit.after.uri) : undefined,
				}],
			});
		}
		// Emit code-block UI for content edits (and renames with content changes)
		if (edit.after?.content) {
			parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
			parts.push({ kind: 'codeblockUri', uri: fileUri, isEdit: true, undoStopId: tc.toolCallId });
			parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: false, isExternalEdit: true });
			parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: true, isExternalEdit: true });
			parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
		}
	}
	return parts;
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
/**
 * URI schemes that should NOT be rewritten when they appear inside markdown
 * links received from a remote agent host. These are links that are
 * meaningful outside the agent host's workspace (e.g. web links, VS Code
 * commands) or are already wrapped in the agent-host scheme.
 */
const EXTERNAL_LINK_SCHEMES: ReadonlySet<string> = new Set([
	'http',
	'https',
	'mailto',
	'ws',
	'wss',
	'ftp',
	'ftps',
	'data',
	'blob',
	'javascript',
	'command',
	'vscode',
	'vscode-insiders',
	AGENT_HOST_SCHEME,
]);

/**
 * Rewrites inline markdown link URIs so that non-external schemes are wrapped
 * in the `vscode-agent-host://` scheme, mirroring {@link toAgentHostUri}.
 * This allows links in markdown content streamed from a remote agent host
 * (e.g. `file:///...` or `agenthost-content:///...`) to resolve correctly on
 * the client through the agent host filesystem provider.
 *
 * Links with external schemes (http, https, mailto, command, etc.) and
 * relative/anchor-only links without a scheme are preserved as-is. The
 * markdown is parsed with marked and each `link` / `image` token is
 * rewritten individually, so link-looking text inside code spans or fenced
 * code blocks is untouched (marked emits those as `code`/`codespan` tokens
 * with no nested link tokens).
 */
export function rewriteMarkdownLinks(markdown: string, connectionAuthority: string): string {
	let tokens: TokensList;
	try {
		tokens = marked.lexer(markdown);
	} catch {
		return markdown;
	}

	const edits: { raw: string; replacement: string }[] = [];
	marked.walkTokens(tokens, token => {
		if (token.type !== 'link' && token.type !== 'image') {
			return;
		}
		const replacement = rewriteLinkTokenRaw(token as Tokens.Link | Tokens.Image, connectionAuthority);
		if (replacement !== undefined) {
			edits.push({ raw: (token as Token & { raw: string }).raw, replacement });
		}
	});

	if (edits.length === 0) {
		return markdown;
	}

	// Apply edits sequentially against the original markdown. walkTokens
	// visits tokens in document order so a forward scan is sufficient.
	let out = '';
	let pos = 0;
	for (const { raw, replacement } of edits) {
		const idx = markdown.indexOf(raw, pos);
		if (idx < 0) {
			continue;
		}
		out += markdown.substring(pos, idx) + replacement;
		pos = idx + raw.length;
	}
	return out + markdown.substring(pos);
}

/**
 * Computes the rewritten `raw` string for a single link or image token,
 * or returns `undefined` if the token should be left alone (external
 * scheme or unparseable URI).
 *
 * The output collapses to the canonical inline form `[](newHref)` (or
 * `![](newHref)` for images) — the chat renderer has richer handling for
 * empty-text agent-host links (rendering them as a file widget), so
 * preserving the original label isn't useful for most links. The one
 * exception is skill links (URIs whose basename is `SKILL.md`), where the
 * skill name is preserved as the label so the skill pill renderer can
 * display it instead of the always-identical `SKILL.md` basename. This
 * also means autolinks (`<url>`) and reference-style links
 * (`[text][ref]`) are normalized into the inline form.
 */
function rewriteLinkTokenRaw(token: Tokens.Link | Tokens.Image, connectionAuthority: string): string | undefined {
	let parsed: URI;
	try {
		parsed = URI.parse(token.href, true);
	} catch {
		return undefined;
	}
	const scheme = parsed.scheme.toLowerCase();
	if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
		return undefined;
	}
	let agentHostUri = toAgentHostUri(parsed, connectionAuthority);
	const isSkill = isSkillFileUri(parsed);
	// VS-Code-specific: links pointing at a `SKILL.md` file are rendered as a
	// rich skill pill rather than a plain markdown link. The chat renderer's
	// inline anchor widget keys off the `vscodeLinkType` query parameter (see
	// `chatInlineAnchorWidget.ts`), so we tag the URI here on the client side
	// rather than at the agent host. We do this whether or not the link came
	// in pre-tagged so older sessions and other agent providers also benefit.
	if (isSkill && !agentHostUri.query.includes('vscodeLinkType=')) {
		const existing = agentHostUri.query;
		agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : 'vscodeLinkType=skill' });
	}
	const prefix = token.type === 'image' ? '![' : '[';
	// Preserve the label for skill links (so the skill pill renderer can show
	// the skill name) and for image alt text (accessibility — the inline
	// anchor widget only applies to links, not images). For all other
	// agent-host links, leave the text empty so the chat renderer's inline
	// anchor widget takes over with its rich file-widget rendering.
	// Escape only the characters that would break out of markdown link text
	// syntax (`\` and `]`); a full markdown escape would leave visible
	// backslashes in the skill pill which extracts text without re-parsing.
	const text = isSkill || token.type === 'image' ? escapeMarkdownLinkLabel(token.text ?? '') : '';
	return `${prefix}${text}](${agentHostUri.toString()})`;
}

/**
 * Returns true when the URI's basename is `SKILL.md` (case-insensitive).
 * Used to tag skill links so the chat renderer shows the rich skill pill
 * instead of a plain markdown anchor.
 */
function isSkillFileUri(uri: URI): boolean {
	const name = basename(uri);
	return name.toLowerCase() === 'skill.md';
}

/**
 * Wraps a raw markdown string into an {@link IMarkdownString}, rewriting
 * link URIs through {@link rewriteMarkdownLinks} when a connection authority
 * is provided.
 */
export function rawMarkdownToString(content: string, connectionAuthority: string | undefined, options?: { supportHtml?: boolean }): MarkdownString {
	const rewritten = connectionAuthority ? rewriteMarkdownLinks(content, connectionAuthority) : content;
	return new MarkdownString(rewritten, options);
}

/**
 * Converts a protocol `StringOrMarkdown` value to a chat-layer `IMarkdownString`.
 *
 * When `connectionAuthority` is provided, markdown link URIs are rewritten
 * through {@link rewriteMarkdownLinks} so that remote resources resolve
 * through the agent host filesystem provider.
 */
export function stringOrMarkdownToString(value: StringOrMarkdown, connectionAuthority: string | undefined): string | IMarkdownString;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string | undefined): string | IMarkdownString | undefined;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string | undefined): string | IMarkdownString | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'string') {
		return value;
	}
	return rawMarkdownToString(value.markdown, connectionAuthority);
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 *
 * @param connectionAuthority Sanitized connection identifier used when
 *   wrapping remote file URIs into `vscode-agent-host:` URIs. Omit to skip
 *   URI wrapping (e.g. in tests that don't exercise the confirmation UI).
 */
export function toolCallStateToInvocation(tc: ToolCallState, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string | undefined): ChatToolInvocation {
	const toolData: IToolData = {
		id: tc.toolName,
		source: ToolDataSource.Internal,
		displayName: tc.displayName,
		modelDescription: tc.toolName,
	};

	if (tc.status === ToolCallStatus.PendingConfirmation) {
		// Tool needs confirmation — create with confirmation messages.
		// (Subagent-spawning tools never reach this state in production: the
		// Copilot SDK's `task` tool doesn't request permission, and the event
		// mapper auto-emits `tool_ready` with `confirmed: NotNeeded` paired
		// with `tool_start`. So no special-case for subagents is needed here.)
		const confirmationMessages: IToolConfirmationMessages = {
			title: stringOrMarkdownToString(tc.confirmationTitle, connectionAuthority) ?? tc.displayName,
			message: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
		};
		if (tc.options) {
			confirmationMessages.customOptions = tc.options;
		}

		let toolSpecificData: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatModifiedFilesConfirmationData | undefined;
		const pendingEdits = tc.edits?.items;
		if (pendingEdits && pendingEdits.length > 0) {
			const wrap = (uri: URI) => connectionAuthority ? toAgentHostUri(uri, connectionAuthority) : uri;
			const mapped = mapFileEdits(pendingEdits, tc.toolCallId);
			toolSpecificData = {
				kind: 'modifiedFilesConfirmation',
				options: ['Allow'],
				modifiedFiles: mapped.map(edit => {
					const resource = wrap(edit.resource);
					const originalResource = edit.originalResource ? wrap(edit.originalResource) : undefined;
					const modifiedContent = edit.afterContentUri ? wrap(edit.afterContentUri) : undefined;
					const originalContent = edit.beforeContentUri ? wrap(edit.beforeContentUri) : undefined;
					return {
						uri: resource,
						originalUri: originalResource,
						modifiedContentUri: modifiedContent,
						originalContentUri: originalContent,
						insertions: edit.diff?.added,
						deletions: edit.diff?.removed,
						title: basename(edit.resource),
						description: edit.resource.path,
					};
				}),
			};
		} else if (getToolKind(tc) === 'terminal' && tc.toolInput) {
			toolSpecificData = {
				kind: 'terminal',
				commandLine: { original: getTerminalInput(tc) || '' },
				language: getTerminalLanguage(tc),
			};
		} else if (tc.toolInput) {
			let rawInput: unknown;
			try { rawInput = JSON.parse(tc.toolInput); } catch { rawInput = { input: tc.toolInput }; }
			toolSpecificData = { kind: 'input', rawInput };
		}

		return new ChatToolInvocation(
			{
				invocationMessage: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
				confirmationMessages,
				presentation: ToolInvocationPresentation.HiddenAfterComplete,
				toolSpecificData,
			},
			toolData,
			tc.toolCallId,
			subAgentInvocationId,
			undefined,
		);
	}

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, subAgentInvocationId, undefined);
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? localize('ahp.running', "Running {0}...", tc.displayName);

	const terminalContentUri = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
		? getTerminalContentUri(tc.content)
		: undefined;
	if (terminalContentUri) {
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: getTerminalInput(tc) || '' },
			language: getTerminalLanguage(tc),
			terminalToolSessionId: makeAhpTerminalToolSessionId(terminalContentUri, sessionResource),
			terminalCommandUri: URI.parse(terminalContentUri),
			terminalCommandOutput: getTerminalOutput(tc),
		} satisfies IChatTerminalToolInvocationData;
	} else if (isSubagentTool(tc)) {
		// Subagent-spawning tool: set subagent toolSpecificData eagerly so the
		// renderer groups it correctly from the start (before child content
		// arrives). Agent metadata comes from `_meta` (set by the event
		// mapper from the tool's arguments) and is later refined by the
		// Subagent content block via `updateRunningToolSpecificData`.
		const subagentContent = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
			? getToolSubagentContent(tc)
			: undefined;
		invocation.toolSpecificData = {
			kind: 'subagent',
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
		};
	}

	return invocation;
}

/**
 * Updates a running tool invocation's `toolSpecificData` based on the
 * protocol tool call state. Handles terminal and subagent content detection.
 *
 * Called from the session handler when a tool transitions to Running state
 * to set the initial `toolSpecificData`, or when content changes arrive.
 */
export function updateRunningToolSpecificData(existing: ChatToolInvocation, tc: ToolCallState, connectionAuthority: string | undefined): void {
	if (tc.status !== ToolCallStatus.Running) {
		return;
	}
	existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? existing.invocationMessage;


	const subagentContent = getToolSubagentContent(tc);
	if (subagentContent) {
		existing.toolSpecificData = {
			kind: 'subagent',
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent.agentName,
		};
		// toolSpecificData is a plain property — notify state observers
		// so ChatSubagentContentPart re-reads the updated metadata.
		existing.notifyToolSpecificDataChanged();
		return;
	}

	// Refresh subagent metadata from `_meta` (set by the event mapper from
	// the tool's arguments) in case it arrived after invocation creation.
	if (existing.toolSpecificData?.kind === 'subagent') {
		const description = getSubagentTaskDescription(tc) ?? existing.toolSpecificData.description;
		const agentName = getSubagentAgentName(tc) ?? existing.toolSpecificData.agentName;
		if (description !== existing.toolSpecificData.description || agentName !== existing.toolSpecificData.agentName) {
			existing.toolSpecificData = { kind: 'subagent', description, agentName };
			existing.notifyToolSpecificDataChanged();
		}
	}
}

/**
 * Data returned by {@link finalizeToolInvocation} describing file edits
 * that should be routed through the editing session's external edits pipeline.
 */
export interface IToolCallFileEdit {
	/** The kind of file operation. */
	readonly kind: FileEditKind;
	/** The primary file URI (after-URI for edits/creates/renames, before-URI for deletes). */
	readonly resource: URI;
	/** For renames, the original file URI before the move. */
	readonly originalResource?: URI;
	/** URI to read the before-snapshot content from. Absent for creates. */
	readonly beforeContentUri?: URI;
	/** URI to read the after-content from. Absent for deletes. */
	readonly afterContentUri?: URI;
	/** Undo stop ID for grouping edits. */
	readonly undoStopId: string;
	/** Optional diff display metadata. */
	readonly diff?: { added?: number; removed?: number };
}

/**
 * Updates a live {@link ChatToolInvocation} with completion data from the
 * protocol's tool-call state, transitioning it to the completed state.
 *
 * Returns file edits that the caller should route through the editing
 * session's external edits pipeline.
 */
export function finalizeToolInvocation(invocation: ChatToolInvocation, tc: ToolCallState, backendSession: URI, connectionAuthority: string | undefined): IToolCallFileEdit[] {
	const isCompleted = tc.status === ToolCallStatus.Completed;
	const isCancelled = tc.status === ToolCallStatus.Cancelled;
	const terminalContentUri = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed
		? getTerminalContentUri(tc.content)
		: undefined;
	const isTerminal = invocation.toolSpecificData?.kind === 'terminal' || !!terminalContentUri;

	if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
		invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? invocation.invocationMessage;
	}

	// Check for subagent content — set toolSpecificData so the UI renders a subagent widget
	if (isCompleted) {
		const subagentContent = getToolSubagentContent(tc);
		if (subagentContent) {
			const resultText = getToolOutputText(tc);
			invocation.toolSpecificData = {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc),
				agentName: subagentContent.agentName,
				result: resultText,
			};
		} else if (invocation.toolSpecificData?.kind === 'subagent') {
			// Subagent-spawning tool that completed without a Subagent content
			// block. Refresh metadata + carry the tool's output as the result.
			invocation.toolSpecificData = {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc) ?? invocation.toolSpecificData.description,
				agentName: getSubagentAgentName(tc) ?? invocation.toolSpecificData.agentName,
				result: getToolOutputText(tc),
			};
		}
	}

	if (isTerminal && (isCompleted || isCancelled)) {
		const existing = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		invocation.presentation = undefined;
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: existing?.commandLine || { original: getTerminalInput(tc) || '' },
			language: getTerminalLanguage(tc),
			terminalToolSessionId: terminalContentUri ? makeAhpTerminalToolSessionId(terminalContentUri, backendSession) : existing?.terminalToolSessionId,
			terminalCommandOutput: getTerminalOutput(tc),
			terminalCommandState: { exitCode: isCompleted && tc.success ? 0 : 1 },
			terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
		};
	} else if (isCompleted && tc.pastTenseMessage) {
		invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority);
	}

	const isFailure = (isCompleted && !tc.success) || isCancelled;
	const errorMessage = isCompleted ? tc.error?.message : (isCancelled ? tc.reasonMessage : undefined);
	const errorString = typeof errorMessage === 'string' ? errorMessage : errorMessage?.markdown;
	const fileEdits = isCompleted ? fileEditsToExternalEdits(tc) : [];

	// Hide the tool widget when file edits are shown separately via onFileEdits
	if (fileEdits.length > 0 && !isFailure) {
		invocation.presentation = ToolInvocationPresentation.Hidden;
	}

	invocation.didExecuteTool(isFailure ? { content: [], toolResultError: errorString } : undefined);

	return fileEdits;
}

/**
 * Extracts file edit content entries from a completed tool call and
 * converts them to {@link IToolCallFileEdit} data for routing through
 * the editing session's external edits pipeline.
 */
export function fileEditsToExternalEdits(tc: ToolCallState): IToolCallFileEdit[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const edits = getToolFileEdits(tc);
	if (edits.length === 0) {
		return [];
	}
	return mapFileEdits(edits, tc.toolCallId);
}

/**
 * Translates a list of {@link FileEdit} records into {@link IToolCallFileEdit}
 * entries suitable for the external edits pipeline or the chat modified-files
 * confirmation UI. Shared between completed tool edits and pending write
 * confirmations.
 */
function mapFileEdits(items: readonly FileEdit[], undoStopId: string): IToolCallFileEdit[] {
	const result: IToolCallFileEdit[] = [];
	for (const edit of items) {
		const isCreate = !edit.before && !!edit.after;
		const isDelete = !!edit.before && !edit.after;
		const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));

		let kind: FileEditKind;
		if (isCreate) {
			kind = FileEditKind.Create;
		} else if (isDelete) {
			kind = FileEditKind.Delete;
		} else if (isRename) {
			kind = FileEditKind.Rename;
		} else {
			kind = FileEditKind.Edit;
		}

		const resource = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
		if (!resource) {
			continue;
		}

		result.push({
			kind,
			resource,
			originalResource: isRename ? URI.parse(edit.before!.uri) : undefined,
			beforeContentUri: edit.before?.content.uri ? URI.parse(edit.before.content.uri) : undefined,
			afterContentUri: edit.after?.content.uri ? URI.parse(edit.after.content.uri) : undefined,
			undoStopId,
			diff: edit.diff,
		});
	}
	return result;
}
