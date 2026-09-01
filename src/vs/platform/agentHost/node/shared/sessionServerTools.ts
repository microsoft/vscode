/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import type { IAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { localize } from '../../../../nls.js';
import { AgentSession, type AgentProvider, type IAgentCreateSessionConfig, type IAgentModelInfo, type IAgentSessionMetadata } from '../../common/agent.js';
import { SessionStatus } from '../../common/state/protocol/channels-session/state.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import { buildChatUri, buildDefaultChatUri, getInlineToolInput, getSessionRelatedPullRequestUrls, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionGitState, readSessionGitHubState, ResponsePartKind, ToolCallStatus, TurnState, withSessionCreationReference, type Message, type ModelSelection, type ResponsePart, type ToolCallState, type ToolDefinition, type Turn, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { buildOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../common/openSessionLink.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

/**
 * Maximum `create_session` recursion depth. A user/top-level session is depth 0;
 * a session created by `create_session` from within a depth-N session is depth
 * N+1. Once a session reaches this depth, its agent may not create further
 * sessions — this bounds recursive spawn *chains* (A→B→C→…). Breadth is bounded
 * separately by {@link maxCreatedSessions} plus the per-call user confirmation.
 */
const maxSessionSpawnDepth = 3;

/** Process-wide backstop against runaway spawning (breadth), independent of depth. */
const maxCreatedSessions = 25;
const maxCreatedChats = 25;

/** Process-wide backstop against runaway `send_message` fan-out. */
const maxSentMessages = 50;

const sessionConfirmationToolNames: ReadonlySet<string> = new Set([SessionServerToolName.CreateSession, SessionServerToolName.CreateChat, SessionServerToolName.SendMessage, SessionServerToolName.DeleteSession]);
const createSessionRelationshipValues = ['currentSession', 'independent'] as const;
export type CreateSessionRelationship = typeof createSessionRelationshipValues[number];

/** Whether the given session server tool requires user confirmation before it runs. */
export function sessionToolRequiresConfirmation(toolName: string): boolean {
	return sessionConfirmationToolNames.has(toolName);
}

const listSessionsStatusValues = ['idle', 'inProgress', 'inputNeeded', 'error', 'archived'] as const;

const listSessionsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'Return only the session with this URI or `agent-host-session://` link (a direct lookup that ignores the other filters). Use this to fetch one known session\'s metadata.' },
		status: {
			type: 'array',
			items: { type: 'string', enum: [...listSessionsStatusValues] },
			description: 'Only return sessions whose status matches one of these (e.g. `inputNeeded` for sessions awaiting a reply, `inProgress` for running ones, `archived` for sessions marked Done/completed — implies `includeArchived`). Omit to return every status.',
		},
		workspace: { type: 'string', description: 'Only return sessions for this project name, project URI, or working directory path/URI.' },
		withChanges: { type: 'boolean', description: 'When true, only return sessions that have pending worktree changes.' },
		unread: { type: 'boolean', description: 'When true, only return sessions with updates the user has not seen yet.' },
		withPullRequest: { type: 'boolean', description: 'When true, only return sessions that have a linked GitHub pull request.' },
		includeArchived: { type: 'boolean', description: 'Whether to include archived sessions. Defaults to false; set true to also return archived sessions.' },
		createdAfter: { type: 'string', description: 'Only return sessions created at or after this time (ISO-8601 timestamp, e.g. `2025-01-31T00:00:00Z`).' },
		createdBefore: { type: 'string', description: 'Only return sessions created at or before this time (ISO-8601 timestamp).' },
	},
};

const createSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		relationship: {
			type: 'string',
			enum: [...createSessionRelationshipValues],
			description: 'Whether this work belongs to the current session or is independently managed. Use `currentSession` for tasks from the current plan or deliverable, including parallel or delegated tasks. Use `independent` only for a separate deliverable that needs its own workspace and top-level lifecycle.',
		},
		prompt: { type: 'string', description: 'Initial prompt to send to the new session.' },
		workspace: { type: 'string', description: 'For `independent` work: unique project name, project/workspace URI, absolute folder path, or working directory from an existing session. Required for `independent` and invalid for `currentSession`.' },
		title: { type: 'string', maxLength: 200, description: 'Short title for the new chat or independent session.' },
		model: { type: 'string', description: 'Optional model ID or display name. Defaults to the current chat\'s model. For `currentSession`, the model must belong to the current session\'s provider; for `independent`, the model selects the new session\'s provider.' },
	},
	required: ['relationship', 'prompt', 'title'],
};

const getCurrentSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

const renameChatInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'Optional owning session: a session URI from `list_sessions` or an `agent-host-session://` link. When provided with `chat`, it must match that chat\'s session.' },
		chat: { type: 'string', description: 'The chat to rename: pass an `agent-host-session://` session or chat link. Omit when renaming the chat in which this tool is running.' },
		title: { type: 'string', maxLength: 200, description: 'Short, descriptive chat title, ideally 1-4 words.' },
		automatic: { type: 'boolean', description: 'Set to true only when this call is fulfilling the host\'s automatic title reminder. Omit for user-requested renames.' },
	},
	required: ['title'],
};

const deleteSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'The session to delete: a session URI from `list_sessions` or an `agent-host-session://` link (e.g. from `create_session`).' },
	},
	required: ['session'],
};

const sendMessageInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'The session or chat to message: a session URI from `list_sessions`, or an `agent-host-session://` link. A link carrying a chat id targets that specific chat.' },
		message: { type: 'string', description: 'The message to send.' },
	},
	required: ['session', 'message'],
};

const sessionContextDetailValues = ['summary', 'digest', 'full'] as const;

const getSessionContextInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'The session or chat to read: a session URI from `list_sessions`, or an `agent-host-session://` link. A link carrying a chat id targets that specific chat.' },
		detail: {
			type: 'string',
			enum: [...sessionContextDetailValues],
			description: 'How much conversation detail to return. `summary` (default): status and a short per-turn gist (the message plus a compact snippet of the reply). `digest`: adds the full assistant reply text and tool-call names. `full`: adds tool-call inputs. Higher levels return more tokens.',
		},
		transcriptLimit: { type: 'number', description: 'Maximum number of most-recent turns to include. Defaults to 10; capped at 50.' },
	},
	required: ['session'],
};

/** Server tool definitions for session management. */
export const sessionServerToolDefinitions: IAgentServerToolDefinition[] = [
	{
		name: SessionServerToolName.ListSessions,
		title: 'List Sessions',
		description: 'List sessions and their compact metadata (status, activity, working directory, project, worktree changes, git/GitHub info, timestamps). Each result includes `session` for identity and tool inputs and `openLink` for clickable Markdown links; do not use `session` as a link target. Pass `session` to fetch a single known session by URI. By default archived sessions are omitted. Optionally filter by `status`, `workspace`, `withChanges`, `unread`, `withPullRequest`, `includeArchived`, `createdAfter`, or `createdBefore`.',
		inputSchema: listSessionsInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: SessionServerToolName.GetCurrentSession,
		title: 'Get Current Session',
		description: 'Get metadata and the open link for the session this conversation is running in. Use this to reference the current session (for example before adding a chat to it).',
		inputSchema: getCurrentSessionInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: SessionServerToolName.CreateSession,
		title: 'Create Session',
		description: 'Create delegated work and start it with an initial prompt. Set `relationship` to `currentSession` when the task belongs to the current plan or deliverable; this creates a new chat that shares the current session\'s workspace, lifecycle, and aggregate diff. Set it to `independent` only for a separate deliverable that needs its own workspace, provider, or top-level lifecycle.',
		inputSchema: createSessionInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: SessionServerToolName.RenameChat,
		title: 'Rename Chat',
		description: 'Rename one specific chat so it is easy to find later. Renaming the default chat also names its owning session, while peer-chat titles remain independent. Use a short, human-friendly chat name in sentence case (1-4 words). Pass an `agent-host-session://` session or chat link to target another chat, or omit `chat` to rename the chat in which this tool is running. Name a fresh chat once its scope is clear. Call this tool again whenever the user explicitly asks to rename the chat; every invocation replaces the current title.',
		inputSchema: renameChatInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: SessionServerToolName.SendMessage,
		title: 'Send Message',
		description: 'Send a message to an existing session or chat, starting a new turn there. Provide a session URI from `list_sessions` or an `agent-host-session://` link; a link carrying a chat id targets that specific chat. The message is delivered asynchronously — this tool does not wait for or return the reply.',
		inputSchema: sendMessageInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: SessionServerToolName.GetSessionContext,
		title: 'Get Session Context',
		description: 'Read the recent conversation of an existing session or chat: a compacted transcript of its turns (messages, replies, and tool calls). Use this to see what a session you created is doing, or to gather context before sending it a message. Returns a compacted summary by default (`detail: "summary"`); request `digest` or `full` for more detail. For session metadata (status, working directory, changes, …) use `list_sessions` with the `session` argument.',
		inputSchema: getSessionContextInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: SessionServerToolName.DeleteSession,
		title: 'Delete Session',
		description: 'Permanently delete a session (identified by a session URI from `list_sessions`), including its stored data. This cannot be undone. Refuses to delete the current session.',
		inputSchema: deleteSessionInputSchema,
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
];

/** Resolves the owning backend session URI for the channel a tool call runs on. */
export function currentSessionUri(toolCallChannel: ProtocolURI): URI {
	const owning = parseChatUri(toolCallChannel) ?? undefined;
	return URI.parse(owning?.session ?? toolCallChannel);
}

interface ICreateSessionArgs {
	readonly relationship?: unknown;
	readonly workspace?: unknown;
	readonly prompt?: unknown;
	readonly title?: unknown;
	readonly model?: unknown;
}

export type IResolvedCreateSessionArgs = {
	readonly relationship: 'currentSession';
	readonly prompt: string;
	readonly title: string;
	readonly model?: IAgentModelInfo;
} | {
	readonly relationship: 'independent';
	readonly workspace: URI;
	readonly prompt: string;
	readonly title: string;
	readonly model?: IAgentModelInfo;
};

/** Minimal dependency surface needed by the session server-tool group. */
export interface ISessionServerToolAccessor {
	readonly isActiveAgentTitleGenerationEnabled: () => boolean;
	readonly listSessions: () => Promise<readonly IAgentSessionMetadata[]>;
	readonly getSession: (session: URI) => Promise<IAgentSessionMetadata | undefined>;
	readonly createSession: (config: IAgentCreateSessionConfig) => Promise<URI>;
	readonly getModels: () => readonly IAgentModelInfo[];
	readonly getCreationDefaults: (source: URI) => ISessionCreationDefaults | undefined;
	readonly startPrompt: (session: URI, chat: URI, prompt: string, delegation?: IAgentMessageDelegationMeta) => Promise<void>;
	readonly createChat: (session: URI, chat: URI, options?: { title?: string; model?: ModelSelection }) => Promise<void>;
	readonly renameChat: (session: URI, chat: URI, title: string) => Promise<IRenameTitleResult>;
	readonly reportToolError: (toolName: SessionServerToolName, error: unknown) => void;
	readonly deleteSession: (session: URI) => Promise<void>;
	/** Reads a point-in-time snapshot of a session's chat conversation (default chat, or a specific chat by id). */
	readonly getChatContext: (session: URI, chatId?: string) => Promise<IChatContextSnapshot | undefined>;
	/** The spawn depth of a session (0 for a user/top-level session, N for one created N levels deep by `create_session`). */
	readonly getSessionSpawnDepth: (session: URI) => number;
	/** Records the spawn depth of a freshly-created session so its own `create_session` calls can enforce the recursion limit. */
	readonly setSessionSpawnDepth: (session: URI, depth: number) => void;
}

export interface IRenameTitleResult {
	readonly title: string;
}

export interface ISessionCreationDefaults {
	readonly provider?: AgentProvider;
	readonly model?: ModelSelection;
	readonly config?: Record<string, unknown>;
	readonly isolation?: 'folder' | 'worktree';
	readonly project?: URI;
}

/** Point-in-time snapshot of a chat's conversation, read from the host state. */
export interface IChatContextSnapshot {
	/** Completed turns, oldest first. */
	readonly turns: readonly Turn[];
	/** The in-progress turn, if the chat is mid-response. */
	readonly activeTurn?: Pick<Turn, 'message' | 'responseParts'>;
	/** `true` when older completed turns exist beyond the in-memory window. */
	readonly hasMoreHistory: boolean;
}

interface ISerializedGitState {
	readonly branch?: string;
	readonly baseBranch?: string;
	readonly upstreamBranch?: string;
	readonly ahead?: number;
	readonly behind?: number;
	readonly uncommittedChanges?: number;
}

interface ISerializedGitHubState {
	readonly owner?: string;
	readonly repo?: string;
	/** Most recent pull request in this compact tool-facing session summary. */
	readonly pullRequestUrl?: string;
}

interface ISerializedSession {
	readonly session: string;
	/** Clickable URI that opens the session in the Agents window. */
	readonly openLink: string;
	readonly title?: string;
	readonly status?: string;
	/** Human-readable description of what the session is currently doing. */
	readonly activity?: string;
	readonly workingDirectory?: string;
	/** Every working-directory URI when the session has more than one. */
	readonly workingDirectories?: readonly string[];
	/** Display name of the session's project/workspace. */
	readonly project?: string;
	/** Configured project root URI, which may differ from a transient working directory. */
	readonly projectUri?: string;
	/** `true` when the session has updates the user has not yet seen. */
	readonly unread?: boolean;
	/** ISO-8601 timestamp of when the session was created. */
	readonly createdAt?: string;
	/** ISO-8601 timestamp of the session's last activity. */
	readonly modifiedAt?: string;
	readonly changes?: IAgentSessionMetadata['changes'];
	readonly changesets?: readonly {
		readonly label: string;
		readonly changeKind: string;
		readonly uriTemplate: string;
		readonly description?: string;
	}[];
	readonly git?: ISerializedGitState;
	readonly github?: ISerializedGitHubState;
}

function getRequiredString(value: unknown, field: string, toolName: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function getOptionalString(value: unknown, field: string, toolName: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function decodeHtmlEntities(value: string): string {
	const namedEntities: Record<string, string> = {
		amp: '&',
		apos: '\'',
		gt: '>',
		lt: '<',
		nbsp: '\u00a0',
		quot: '"',
	};
	return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
		const numeric = decimal ?? hexadecimal;
		if (numeric !== undefined) {
			const codePoint = Number.parseInt(numeric, decimal !== undefined ? 10 : 16);
			return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
				? String.fromCodePoint(codePoint)
				: match;
		}
		return named ? namedEntities[named.toLowerCase()] ?? match : match;
	});
}

function normalizeGeneralChatTitle(title: string): string {
	return decodeHtmlEntities(title).trim().replace(/\s+/g, ' ');
}

function normalizeProjectSessionTitle(title: string): string {
	const trimmed = decodeHtmlEntities(title)
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.trim()
		.replace(/^[.,;:!?\-\u2014]+|[.,;:!?\-\u2014]+$/g, '')
		.trim();
	const humanized = !/\s/.test(trimmed) && /[/_-]/.test(trimmed)
		? trimmed.replace(/[/_\-\s]+/g, ' ')
		: trimmed;
	return humanized.replace(/\s+/g, ' ').trim();
}

export function validateRenameTitle(title: string, toolName: SessionServerToolName.CreateSession | SessionServerToolName.CreateChat | SessionServerToolName.RenameChat): void {
	if (!title.trim()) {
		throw new Error(`Invalid ${toolName} input: title must contain non-whitespace characters.`);
	}
	if (Array.from(title).length > 200) {
		throw new Error(`Invalid ${toolName} input: title must not exceed 200 characters.`);
	}
}

function parseWorkspaceUri(workspace: string): URI | undefined {
	// Absolute filesystem path (POSIX `/…` or Windows `C:\…` / `\\share`).
	if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(workspace)) {
		return URI.file(workspace);
	}
	try {
		const parsed = URI.parse(workspace, true);
		return parsed.scheme ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function resolveWorkspace(workspace: string, sessions: readonly IAgentSessionMetadata[]): URI {
	const parsed = parseWorkspaceUri(workspace);
	for (const session of sessions) {
		for (const candidate of [session.project?.uri, ...(session.workingDirectories ?? [])]) {
			if (candidate && parsed && isEqual(candidate, parsed)) {
				return candidate;
			}
		}
	}

	const projects: { readonly uri: URI; readonly displayName: string }[] = [];
	for (const session of sessions) {
		const project = session.project;
		if (project?.displayName.toLowerCase() === workspace.toLowerCase() && !projects.some(candidate => isEqual(candidate.uri, project.uri))) {
			projects.push(project);
		}
	}
	if (projects.length === 1) {
		return projects[0].uri;
	}
	if (projects.length > 1) {
		throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: workspace "${workspace}" is ambiguous; use one of these project URIs: ${projects.map(project => project.uri.toString()).join(', ')}.`);
	}
	if (!parsed) {
		throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: workspace must match a unique known project name, project URI, working directory, absolute path, or valid URI string.`);
	}
	return parsed;
}

function resolveModel(modelName: string | undefined, models: readonly IAgentModelInfo[], provider?: AgentProvider): IAgentModelInfo | undefined {
	if (modelName === undefined) {
		return undefined;
	}
	const availableModels = provider === undefined ? models : models.filter(candidate => candidate.provider === provider);
	const idMatches = availableModels.filter(candidate => candidate.id === modelName);
	const matches = idMatches.length > 0 ? idMatches : availableModels.filter(candidate => candidate.name === modelName);
	if (matches.length === 0) {
		const providerSuffix = provider === undefined ? '' : ` for provider "${provider}"`;
		throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: model must match an available model id or name${providerSuffix}.`);
	}
	if (matches.length > 1) {
		throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: model "${modelName}" is ambiguous; use one of these model ids: ${matches.map(model => model.id).join(', ')}.`);
	}
	return matches[0];
}

function getCreateSessionRelationship(rawArgs: unknown): CreateSessionRelationship {
	const args = (rawArgs ?? {}) as ICreateSessionArgs;
	const relationship = getRequiredString(args.relationship, 'relationship', SessionServerToolName.CreateSession);
	if (!createSessionRelationshipValues.includes(relationship as CreateSessionRelationship)) {
		throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: relationship must be "currentSession" or "independent".`);
	}
	return relationship as CreateSessionRelationship;
}

/** Validates and resolves create-session arguments against current sessions and models. */
export function getCreateSessionArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], models: readonly IAgentModelInfo[], currentProvider?: AgentProvider): IResolvedCreateSessionArgs {
	const args = (rawArgs ?? {}) as ICreateSessionArgs;
	const relationship = getCreateSessionRelationship(args);
	const prompt = getRequiredString(args.prompt, 'prompt', SessionServerToolName.CreateSession);
	const title = getRequiredString(args.title, 'title', SessionServerToolName.CreateSession);
	validateRenameTitle(title, SessionServerToolName.CreateSession);
	const workspace = getOptionalString(args.workspace, 'workspace', SessionServerToolName.CreateSession);
	const modelName = getOptionalString(args.model, 'model', SessionServerToolName.CreateSession);
	const model = resolveModel(modelName, models, relationship === 'currentSession' ? currentProvider : undefined);
	if (relationship === 'currentSession') {
		if (workspace !== undefined) {
			throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: workspace is only valid when relationship is "independent".`);
		}
		return {
			relationship,
			prompt,
			title,
			...(model !== undefined ? { model } : {}),
		};
	}
	return {
		relationship,
		workspace: resolveWorkspace(getRequiredString(workspace, 'workspace', SessionServerToolName.CreateSession), sessions),
		prompt,
		title,
		...(model !== undefined ? { model } : {}),
	};
}

/** Decodes the {@link SessionStatus} bit-flags into readable names for the agent. */
function describeSessionStatusBits(status: SessionStatus): string[] {
	const names: string[] = [];
	// `InputNeeded` is a superset of the `InProgress` bit, so it must be matched
	// with an exact-bits check before falling back to plain `InProgress`.
	if ((status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded) {
		names.push('inputNeeded');
	} else if (status & SessionStatus.InProgress) {
		names.push('inProgress');
	} else if (status & SessionStatus.Idle) {
		names.push('idle');
	}
	if (status & SessionStatus.Error) {
		names.push('error');
	}
	if (status & SessionStatus.IsArchived) {
		names.push('archived');
	}
	return names;
}

/**
 * Decodes a session's status into readable names, used by both filtering and
 * serialization so they agree on which sessions are considered `archived`.
 */
function describeSessionStatusNames(session: IAgentSessionMetadata): string[] {
	return session.status !== undefined ? describeSessionStatusBits(session.status) : [];
}

/** Renders a session's status names as the compact string used in tool results. */
function describeSessionStatus(session: IAgentSessionMetadata): string | undefined {
	const names = describeSessionStatusNames(session);
	if (names.length > 0) {
		return names.join(',');
	}
	return session.status !== undefined ? 'unknown' : undefined;
}


/** Filters accepted by `list_sessions` to narrow the returned set. */
export interface IListSessionsArgs {
	/** Direct lookup: return only the session with this URI / open link, ignoring all other filters. */
	readonly session?: string;
	readonly status?: ReadonlySet<string>;
	readonly workspace?: string;
	readonly withChanges?: boolean;
	readonly unread?: boolean;
	readonly withPullRequest?: boolean;
	readonly includeArchived?: boolean;
	/** Lower bound on session creation time, in epoch milliseconds. */
	readonly createdAfter?: number;
	/** Upper bound on session creation time, in epoch milliseconds. */
	readonly createdBefore?: number;
}

function getOptionalBoolean(value: unknown, field: string, toolName: string): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'boolean') {
		throw new Error(`Invalid ${toolName} input: ${field} must be a boolean.`);
	}
	return value;
}

function getOptionalTimestamp(value: unknown, field: string, toolName: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`Invalid ${toolName} input: ${field} must be an ISO-8601 timestamp string.`);
	}
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a valid ISO-8601 timestamp (e.g. 2025-01-31T00:00:00Z).`);
	}
	return parsed;
}

/** Validates and normalizes the optional `list_sessions` filter arguments. */
export function getListSessionsArgs(rawArgs: unknown): IListSessionsArgs {
	const args = (rawArgs ?? {}) as { session?: unknown; status?: unknown; workspace?: unknown; withChanges?: unknown; unread?: unknown; withPullRequest?: unknown; includeArchived?: unknown; createdAfter?: unknown; createdBefore?: unknown };

	let status: Set<string> | undefined;
	if (args.status !== undefined) {
		if (!Array.isArray(args.status) || args.status.some(value => typeof value !== 'string')) {
			throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: status must be an array of status names.`);
		}
		const invalid = (args.status as string[]).filter(value => !(listSessionsStatusValues as readonly string[]).includes(value));
		if (invalid.length > 0) {
			throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: unknown status value(s) ${invalid.join(', ')}. Valid values: ${listSessionsStatusValues.join(', ')}.`);
		}
		status = new Set(args.status as string[]);
	}

	return {
		session: getOptionalString(args.session, 'session', SessionServerToolName.ListSessions),
		status,
		workspace: getOptionalString(args.workspace, 'workspace', SessionServerToolName.ListSessions),
		withChanges: getOptionalBoolean(args.withChanges, 'withChanges', SessionServerToolName.ListSessions),
		unread: getOptionalBoolean(args.unread, 'unread', SessionServerToolName.ListSessions),
		withPullRequest: getOptionalBoolean(args.withPullRequest, 'withPullRequest', SessionServerToolName.ListSessions),
		includeArchived: getOptionalBoolean(args.includeArchived, 'includeArchived', SessionServerToolName.ListSessions),
		createdAfter: getOptionalTimestamp(args.createdAfter, 'createdAfter', SessionServerToolName.ListSessions),
		createdBefore: getOptionalTimestamp(args.createdBefore, 'createdBefore', SessionServerToolName.ListSessions),
	};
}

/** Whether a session has any pending worktree changes (insertions, deletions, or changed files). */
function sessionHasChanges(session: IAgentSessionMetadata): boolean {
	const changes = session.changes;
	return !!changes && ((changes.files ?? 0) > 0 || (changes.additions ?? 0) > 0 || (changes.deletions ?? 0) > 0);
}

function sessionIsArchived(session: IAgentSessionMetadata): boolean {
	return isSessionStatusArchived(session.status);
}

/**
 * Whether a session is *known* to be unread. A session with no status has no
 * recorded read state — cold sessions from agents that don't project one, such
 * as Claude — and must not be reported as unread.
 */
function sessionIsUnread(session: IAgentSessionMetadata): boolean {
	return session.status !== undefined && !isSessionStatusRead(session.status);
}

/** Whether a session's project or any working directory matches the given workspace selector. */
function sessionMatchesWorkspace(session: IAgentSessionMetadata, workspace: string): boolean {
	if (session.project?.displayName.toLowerCase() === workspace.toLowerCase()) {
		return true;
	}
	const parsed = parseWorkspaceUri(workspace);
	return parsed !== undefined
		&& [session.project?.uri, ...(session.workingDirectories ?? [])].some(candidate => candidate !== undefined && isEqual(candidate, parsed));
}

/** Applies the {@link IListSessionsArgs} filters to a set of sessions. */
export function filterSessions(sessions: readonly IAgentSessionMetadata[], args: IListSessionsArgs): readonly IAgentSessionMetadata[] {
	// A direct `session` lookup returns just that session, bypassing the other
	// filters (including the default archived exclusion).
	if (args.session !== undefined) {
		const target = parseOpenSessionLinkUri(args.session)?.toString() ?? args.session;
		return sessions.filter(session => session.session.toString() === target);
	}
	return sessions.filter(session => {
		if (args.status) {
			const names = describeSessionStatusNames(session);
			if (!names.some(name => args.status!.has(name))) {
				return false;
			}
		}
		if (args.workspace !== undefined && !sessionMatchesWorkspace(session, args.workspace)) {
			return false;
		}
		if (args.withChanges && !sessionHasChanges(session)) {
			return false;
		}
		if (args.unread && !sessionIsUnread(session)) {
			return false;
		}
		if (args.withPullRequest && getSessionRelatedPullRequestUrls(readSessionGitHubState(session._meta)).length === 0) {
			return false;
		}
		// Archived sessions are hidden unless explicitly requested, either via
		// `includeArchived` or by asking for the `archived` status directly.
		if (args.includeArchived !== true && !args.status?.has('archived') && sessionIsArchived(session)) {
			return false;
		}
		if (args.createdAfter !== undefined && session.startTime < args.createdAfter) {
			return false;
		}
		if (args.createdBefore !== undefined && session.startTime > args.createdBefore) {
			return false;
		}
		return true;
	});
}

function serializeGitState(session: IAgentSessionMetadata): ISerializedGitState | undefined {
	const git = readSessionGitState(session._meta);
	if (!git) {
		return undefined;
	}
	const result: Mutable<ISerializedGitState> = {};
	if (git.branchName !== undefined) { result.branch = git.branchName; }
	if (git.baseBranchName !== undefined) { result.baseBranch = git.baseBranchName; }
	if (git.upstreamBranchName !== undefined) { result.upstreamBranch = git.upstreamBranchName; }
	if (git.outgoingChanges !== undefined) { result.ahead = git.outgoingChanges; }
	if (git.incomingChanges !== undefined) { result.behind = git.incomingChanges; }
	if (git.uncommittedChanges !== undefined) { result.uncommittedChanges = git.uncommittedChanges; }
	return Object.keys(result).length > 0 ? result : undefined;
}

function serializeGitHubState(session: IAgentSessionMetadata): ISerializedGitHubState | undefined {
	const github = readSessionGitHubState(session._meta);
	if (!github) {
		return undefined;
	}
	const result: Mutable<ISerializedGitHubState> = {};
	if (github.owner !== undefined) { result.owner = github.owner; }
	if (github.repo !== undefined) { result.repo = github.repo; }
	const pullRequestUrl = getSessionRelatedPullRequestUrls(github)[0];
	if (pullRequestUrl !== undefined) { result.pullRequestUrl = pullRequestUrl; }
	return Object.keys(result).length > 0 ? result : undefined;
}

function serializeSession(session: IAgentSessionMetadata): ISerializedSession {
	const git = serializeGitState(session);
	const github = serializeGitHubState(session);
	const status = describeSessionStatus(session);
	return {
		session: session.session.toString(),
		openLink: buildOpenSessionLinkUri(session.session),
		...(session.summary !== undefined ? { title: session.summary } : {}),
		...(status !== undefined ? { status } : {}),
		...(session.activity !== undefined ? { activity: session.activity } : {}),
		...(session.workingDirectories?.[0] !== undefined ? { workingDirectory: session.workingDirectories[0].toString() } : {}),
		...(session.workingDirectories !== undefined && session.workingDirectories.length > 1
			? { workingDirectories: session.workingDirectories.map(directory => directory.toString()) }
			: {}),
		...(session.project !== undefined ? { project: session.project.displayName } : {}),
		...(session.project !== undefined ? { projectUri: session.project.uri.toString() } : {}),
		...(sessionIsUnread(session) ? { unread: true } : {}),
		...(session.startTime > 0 ? { createdAt: new Date(session.startTime).toISOString() } : {}),
		...(session.modifiedTime > 0 ? { modifiedAt: new Date(session.modifiedTime).toISOString() } : {}),
		...(session.changes !== undefined ? { changes: session.changes } : {}),
		...(session.changesets !== undefined ? {
			changesets: session.changesets.map(changeset => ({
				label: changeset.label,
				changeKind: changeset.changeKind,
				uriTemplate: changeset.uriTemplate,
				...(changeset.description !== undefined ? { description: changeset.description } : {}),
			})),
		} : {}),
		...(git !== undefined ? { git } : {}),
		...(github !== undefined ? { github } : {}),
	};
}

/** Serializes session metadata into the compact tool-result JSON payload. */
export function serializeSessions(sessions: readonly IAgentSessionMetadata[]): string {
	return JSON.stringify({ sessions: sessions.map(serializeSession) });
}

export interface ICreateSessionResult {
	readonly relationship: CreateSessionRelationship;
	readonly session: string;
	readonly chat: string;
	/** Clickable {@link AGENT_HOST_SESSION_LINK_SCHEME} URI that opens the session in the Agents window. */
	readonly openLink: string;
}

/**
 * Creates work with the requested relationship and sends its initial prompt.
 */
export async function applyCreateSessionTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, source?: URI, sourceTurnId?: string): Promise<ICreateSessionResult> {
	const sessions = await accessor.listSessions();
	const currentSession = source ? currentSessionUri(source.toString()) : undefined;
	const currentProvider = currentSession ? AgentSession.provider(currentSession) : undefined;
	const args = getCreateSessionArgs(rawArgs, sessions, accessor.getModels(), currentProvider);
	if (args.relationship === 'currentSession') {
		if (!currentSession) {
			throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: relationship "currentSession" requires an invoking session.`);
		}
		if (args.model !== undefined && args.model.provider !== currentProvider) {
			throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: model "${args.model.id}" belongs to provider "${args.model.provider}", but relationship "currentSession" targets provider "${currentProvider}".`);
		}
		const result = await createChat(accessor, {
			session: currentSession,
			prompt: args.prompt,
			title: args.title,
			model: args.model,
		}, source, sourceTurnId);
		return { relationship: args.relationship, ...result };
	}

	const parentDepth = currentSession ? accessor.getSessionSpawnDepth(currentSession) : 0;
	if (parentDepth >= maxSessionSpawnDepth) {
		throw new Error(`Refusing to create a session: recursion limit reached (max spawn depth ${maxSessionSpawnDepth}). This session was itself created ${parentDepth} level(s) deep.`);
	}
	const defaults = source ? accessor.getCreationDefaults(source) : undefined;
	const provider = args.model?.provider ?? defaults?.provider;
	const inheritsSourceProvider = provider !== undefined && provider === defaults?.provider;
	const inheritedProviderConfig = inheritsSourceProvider ? defaults?.config : undefined;
	const isolation = defaults?.project !== undefined && isEqual(defaults.project, args.workspace)
		? defaults.isolation
		: 'worktree';
	const configValues = inheritedProviderConfig === undefined && isolation === undefined
		? undefined
		: {
			...inheritedProviderConfig,
			...(isolation !== undefined ? { [SessionConfigKey.Isolation]: isolation } : {}),
		};
	const config: IAgentCreateSessionConfig = {
		workingDirectories: args.workspace ? [args.workspace] : undefined,
		...(provider !== undefined ? { provider } : {}),
		...(args.model !== undefined ? { model: { id: args.model.id } } : defaults?.model !== undefined ? { model: defaults.model } : {}),
		...(configValues !== undefined ? { config: configValues } : {}),
		...(currentSession !== undefined && source !== undefined ? {
			_meta: withSessionCreationReference(undefined, {
				session: currentSession.toString(),
				chat: source.toString(),
				...(sourceTurnId !== undefined ? { turnId: sourceTurnId } : {}),
			})
		} : {}),
	};
	const session = await accessor.createSession(config);
	accessor.setSessionSpawnDepth(session, parentDepth + 1);
	const chat = URI.parse(buildDefaultChatUri(session));
	await accessor.renameChat(session, chat, args.title);
	await accessor.startPrompt(session, chat, args.prompt, currentSession ? {
		sourceSession: currentSession.toString(),
		sourceChat: source?.toString(),
		...(sourceTurnId !== undefined ? { sourceTurnId } : {}),
	} : undefined);
	return { relationship: args.relationship, session: session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(session) };
}

/** Builds the model-facing `create_session` result. */
export function formatCreateSessionResult(result: ICreateSessionResult): string {
	if (result.relationship === 'currentSession') {
		return `Chat created in the current session (${result.openLink}).`;
	}
	return `New session created (${result.openLink}).`;
}

interface ICreateChatArgs {
	readonly session?: unknown;
	readonly prompt?: unknown;
	readonly title?: unknown;
	readonly model?: unknown;
}

export interface ICreateChatResult {
	readonly session: string;
	readonly chat: string;
	/** Clickable {@link AGENT_HOST_SESSION_LINK_SCHEME} URI that opens the created chat. */
	readonly openLink: string;
}

interface IResolvedCreateChatArgs {
	readonly session: URI;
	readonly prompt: string;
	readonly title?: string;
	readonly model?: IAgentModelInfo;
}

/**
 * Resolves a session identifier — accepting either a backend session URI
 * (`copilotcli:/…` from `list_sessions`) or an `agent-host-session://…` open
 * link (as returned by `create_session`/`get_current_session`) — against the
 * set of known sessions. Returns `undefined` when it matches no known session.
 */
function resolveKnownSession(sessionInput: string, sessions: readonly IAgentSessionMetadata[]): URI | undefined {
	// Normalize an open-session link back to its backend session URI.
	const fromLink = parseOpenSessionLinkUri(sessionInput);
	const candidate = fromLink?.toString() ?? sessionInput;
	const match = sessions.find(s => s.session.toString() === candidate);
	return match?.session;
}

/** Resolves the target session URI for `create_chat` against the known sessions. */
function resolveChatSession(sessionInput: string, sessions: readonly IAgentSessionMetadata[]): URI {
	const session = resolveKnownSession(sessionInput, sessions);
	if (!session) {
		throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: session must match the URI of a known session (see list_sessions).`);
	}
	return session;
}

/** Validates and resolves create-chat arguments; defaults the session to {@link currentSession} when omitted. */
export function getCreateChatArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], models: readonly IAgentModelInfo[], currentSession?: URI): IResolvedCreateChatArgs {
	const args = (rawArgs ?? {}) as ICreateChatArgs;
	const prompt = getRequiredString(args.prompt, 'prompt', SessionServerToolName.CreateChat);
	const title = getOptionalString(args.title, 'title', SessionServerToolName.CreateChat);
	if (title !== undefined) {
		validateRenameTitle(title, SessionServerToolName.CreateChat);
	}
	const modelName = getOptionalString(args.model, 'model', SessionServerToolName.CreateChat);
	const sessionInput = getOptionalString(args.session, 'session', SessionServerToolName.CreateChat);
	let session: URI;
	if (sessionInput !== undefined) {
		session = resolveChatSession(sessionInput, sessions);
	} else if (currentSession) {
		session = currentSession;
	} else {
		throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: no session provided and the current session could not be determined.`);
	}
	const model = resolveModel(modelName, models, AgentSession.provider(session));
	return { session, prompt, ...(title !== undefined ? { title } : {}), ...(model !== undefined ? { model } : {}) };
}

async function createChat(accessor: ISessionServerToolAccessor, args: IResolvedCreateChatArgs, source?: URI, sourceTurnId?: string): Promise<ICreateChatResult> {
	const currentSession = source ? currentSessionUri(source.toString()) : undefined;
	const defaults = source ? accessor.getCreationDefaults(source) : undefined;
	const targetProvider = AgentSession.provider(args.session);
	const model = args.model !== undefined ? { id: args.model.id } : targetProvider === defaults?.provider ? defaults?.model : undefined;
	const chatId = generateUuid();
	const chat = URI.parse(buildChatUri(args.session.toString(), chatId));
	await accessor.createChat(args.session, chat, { title: args.title, model });
	if (args.title !== undefined) {
		await accessor.renameChat(args.session, chat, args.title);
	}
	await accessor.startPrompt(args.session, chat, args.prompt, currentSession ? {
		sourceSession: currentSession.toString(),
		sourceChat: source?.toString(),
		...(sourceTurnId !== undefined ? { sourceTurnId } : {}),
	} : undefined);
	return { session: args.session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(args.session, chatId) };
}

/** Executes the retired `create_chat` contract for sessions that advertised it previously. */
export async function applyCreateChatTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, source?: URI, sourceTurnId?: string): Promise<ICreateChatResult> {
	const sessions = await accessor.listSessions();
	const currentSession = source ? currentSessionUri(source.toString()) : undefined;
	return createChat(accessor, getCreateChatArgs(rawArgs, sessions, accessor.getModels(), currentSession), source, sourceTurnId);
}

/** Builds the model-facing `create_chat` result. */
export function formatCreateChatResult(result: ICreateChatResult): string {
	return `Chat created (${result.openLink}).`;
}

interface IRenameChatArgs {
	readonly session?: unknown;
	readonly chat?: unknown;
	readonly title?: unknown;
	readonly automatic?: unknown;
}

export interface IResolvedRenameChatArgs {
	readonly session: URI;
	readonly chat: URI;
	readonly title: string;
	readonly chatId: string;
}

function currentChatUri(toolCallChannel?: ProtocolURI): URI | undefined {
	if (!toolCallChannel) {
		return undefined;
	}
	const parsed = parseChatUri(toolCallChannel);
	if (!parsed) {
		return undefined;
	}
	return URI.parse(toolCallChannel);
}

function normalizeRenameChatTitle(requestedTitle: string, sessions: readonly IAgentSessionMetadata[], session: URI, chat: URI): string {
	const metadata = sessions.find(candidate => candidate.session.toString() === session.toString());
	const title = isDefaultChatUri(chat) && metadata?.workingDirectories?.length
		? normalizeProjectSessionTitle(requestedTitle)
		: normalizeGeneralChatTitle(requestedTitle);
	if (!title) {
		throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: title must contain non-whitespace characters.`);
	}
	validateRenameTitle(title, SessionServerToolName.RenameChat);
	return title;
}

export function getRenameChatArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], currentChannel?: ProtocolURI): IResolvedRenameChatArgs {
	const args = (rawArgs ?? {}) as IRenameChatArgs;
	const requestedTitle = getRequiredString(args.title, 'title', SessionServerToolName.RenameChat);
	const sessionInput = getOptionalString(args.session, 'session', SessionServerToolName.RenameChat);
	const chatInput = getOptionalString(args.chat, 'chat', SessionServerToolName.RenameChat);

	if (chatInput !== undefined) {
		const session = resolveKnownSession(chatInput, sessions);
		const chatId = parseOpenSessionLinkChatId(chatInput);
		if (!session) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must be an agent-host-session:// link targeting a known chat.`);
		}
		if (sessionInput !== undefined) {
			const explicitSession = resolveKnownSession(sessionInput, sessions);
			if (!explicitSession) {
				throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the URI of a known session (see list_sessions).`);
			}
			if (explicitSession.toString() !== session.toString()) {
				throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the owning session of chat.`);
			}
		}
		const chat = URI.parse(chatId ? buildChatUri(session.toString(), chatId) : buildDefaultChatUri(session.toString()));
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat.`);
		}
		const title = normalizeRenameChatTitle(requestedTitle, sessions, session, chat);
		return { session, chat, title, chatId: parsed.chatId };
	}

	const currentChat = currentChatUri(currentChannel);
	if (!currentChat || !currentChannel) {
		throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat, or the tool must run inside that chat.`);
	}
	const session = currentSessionUri(currentChannel);
	if (sessionInput !== undefined) {
		const explicitSession = resolveKnownSession(sessionInput, sessions);
		if (!explicitSession) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the URI of a known session (see list_sessions).`);
		}
		if (explicitSession.toString() !== session.toString()) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: session must match the current chat's owning session.`);
		}
	}
	const parsed = parseChatUri(currentChat.toString());
	if (!parsed) {
		throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: current channel is not a chat.`);
	}
	const title = normalizeRenameChatTitle(requestedTitle, sessions, session, currentChat);
	return { session, chat: currentChat, title, chatId: parsed.chatId };
}

function getRenameChatSession(rawArgs: unknown, currentChannel?: ProtocolURI): URI {
	const args = (rawArgs ?? {}) as IRenameChatArgs;
	const chatInput = getOptionalString(args.chat, 'chat', SessionServerToolName.RenameChat);
	if (chatInput !== undefined) {
		const session = parseOpenSessionLinkUri(chatInput);
		if (!session) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must be an agent-host-session:// link targeting a known chat.`);
		}
		return session;
	}
	if (!currentChannel || !currentChatUri(currentChannel)) {
		throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must target a known chat, or the tool must run inside that chat.`);
	}
	return currentSessionUri(currentChannel);
}

export async function applyRenameChatTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, currentChannel?: ProtocolURI): Promise<string> {
	const args = (rawArgs ?? {}) as IRenameChatArgs;
	const isAutomaticTitleRename = getOptionalBoolean(args.automatic, 'automatic', SessionServerToolName.RenameChat) === true;
	const rename = async (): Promise<IRenameTitleResult> => {
		const targetSession = getRenameChatSession(rawArgs, currentChannel);
		const metadata = await accessor.getSession(targetSession);
		const { session, chat, title } = getRenameChatArgs(rawArgs, metadata ? [metadata] : [], currentChannel);
		return accessor.renameChat(session, chat, title);
	};
	if (isAutomaticTitleRename) {
		void rename().catch(error => accessor.reportToolError(SessionServerToolName.RenameChat, error));
		return 'Renaming chat.';
	}
	const result = await rename();
	return `Renamed chat to "${result.title}".`;
}

interface ISendMessageArgs {
	readonly session?: unknown;
	readonly message?: unknown;
}

export interface IResolvedSendMessageArgs {
	/** The owning backend session URI of the target chat. */
	readonly session: URI;
	/** The chat channel to deliver the message on (default chat, or a specific chat when the link carried one). */
	readonly chat: URI;
	/** The chat id when a specific chat was targeted (from a `create_chat` link). */
	readonly chatId?: string;
	readonly message: string;
}

/**
 * Validates and resolves send-message arguments. When the `session` input is a
 * `create_chat` open link (carrying a chat id), the message is targeted at that
 * specific chat rather than the session's default chat.
 */
export function getSendMessageArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[]): IResolvedSendMessageArgs {
	const args = (rawArgs ?? {}) as ISendMessageArgs;
	const message = getRequiredString(args.message, 'message', SessionServerToolName.SendMessage);
	const sessionInput = getRequiredString(args.session, 'session', SessionServerToolName.SendMessage);
	const session = resolveKnownSession(sessionInput, sessions);
	if (!session) {
		throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: session must match the URI of a known session (see list_sessions).`);
	}
	const chatId = parseOpenSessionLinkChatId(sessionInput);
	const chat = URI.parse(chatId ? buildChatUri(session.toString(), chatId) : buildDefaultChatUri(session.toString()));
	return { session, chat, message, ...(chatId !== undefined ? { chatId } : {}) };
}

/**
 * Sends a message to an existing session/chat, starting a new turn there.
 * Refuses to target {@link currentChannel} (the chat channel the tool runs on)
 * to avoid a session trivially messaging itself in a loop.
 */
export async function applySendMessageTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, currentChannel?: ProtocolURI, sourceTurnId?: string): Promise<string> {
	const sessions = await accessor.listSessions();
	const { session, chat, chatId, message } = getSendMessageArgs(rawArgs, sessions);
	if (currentChannel && chat.toString() === URI.parse(currentChannel).toString()) {
		throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: refusing to send a message to the current chat.`);
	}
	const sourceChat = currentChannel ? URI.parse(currentChannel) : undefined;
	const sourceSession = sourceChat ? currentSessionUri(sourceChat.toString()) : undefined;
	await accessor.startPrompt(session, chat, message, sourceSession ? {
		sourceSession: sourceSession.toString(),
		sourceChat: sourceChat?.toString(),
		...(sourceTurnId !== undefined ? { sourceTurnId } : {}),
	} : undefined);
	return formatSendMessageResult(buildOpenSessionLinkUri(session, chatId));
}

/** Builds the model-facing `send_message` result. */
export function formatSendMessageResult(openLink: string): string {
	return `Message sent (${openLink}).`;
}

// --- get_session_context -----------------------------------------------------

type SessionContextDetail = (typeof sessionContextDetailValues)[number];

const defaultTranscriptLimit = 10;
const maxTranscriptLimit = 50;

/** Per-detail truncation caps (characters); a value of 0 omits the field. */
const contextCaps: Record<SessionContextDetail, { user: number; assistant: number; toolInput: number }> = {
	// `summary` still carries a short assistant gist per turn so the reader sees
	// what each turn actually did, not just what was asked.
	summary: { user: 160, assistant: 140, toolInput: 0 },
	digest: { user: 300, assistant: 800, toolInput: 0 },
	full: { user: 1000, assistant: 2000, toolInput: 200 },
};

interface ISessionContextArgs {
	readonly session?: unknown;
	readonly detail?: unknown;
	readonly transcriptLimit?: unknown;
}

export interface IResolvedSessionContextArgs {
	readonly session: URI;
	readonly chatId?: string;
	readonly detail: SessionContextDetail;
	readonly transcriptLimit: number;
}

/** Validates and resolves get-session-context arguments against the known sessions. */
export function getSessionContextArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[]): IResolvedSessionContextArgs {
	const args = (rawArgs ?? {}) as ISessionContextArgs;
	const sessionInput = getRequiredString(args.session, 'session', SessionServerToolName.GetSessionContext);
	const session = resolveKnownSession(sessionInput, sessions);
	if (!session) {
		throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: session must match the URI of a known session (see list_sessions).`);
	}
	let detail: SessionContextDetail = 'summary';
	if (args.detail !== undefined) {
		if (typeof args.detail !== 'string' || !(sessionContextDetailValues as readonly string[]).includes(args.detail)) {
			throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: detail must be one of ${sessionContextDetailValues.join(', ')}.`);
		}
		detail = args.detail as SessionContextDetail;
	}
	let transcriptLimit = defaultTranscriptLimit;
	if (args.transcriptLimit !== undefined) {
		if (typeof args.transcriptLimit !== 'number' || !Number.isFinite(args.transcriptLimit) || args.transcriptLimit < 1) {
			throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: transcriptLimit must be a positive number.`);
		}
		transcriptLimit = Math.min(Math.floor(args.transcriptLimit), maxTranscriptLimit);
	}
	const chatId = parseOpenSessionLinkChatId(sessionInput);
	return { session, detail, transcriptLimit, ...(chatId !== undefined ? { chatId } : {}) };
}

/** Truncates {@link text} to {@link max} characters, appending an ellipsis when cut. */
function truncateText(text: string, max: number): { text: string; truncated: boolean } {
	const trimmed = text.trim();
	if (trimmed.length <= max) {
		return { text: trimmed, truncated: false };
	}
	return { text: `${trimmed.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

/** Reads the tool-call parts of a turn, newest-emitted last. */
function toolCallsOf(parts: readonly ResponsePart[]): ToolCallState[] {
	return parts.filter((p): p is Extract<ResponsePart, { kind: ResponsePartKind.ToolCall }> => p.kind === ResponsePartKind.ToolCall).map(p => p.toolCall);
}

/** Concatenated markdown text of a turn's response, in stream order. */
function assistantTextOf(parts: readonly ResponsePart[]): string {
	return parts.filter((p): p is Extract<ResponsePart, { kind: ResponsePartKind.Markdown }> => p.kind === ResponsePartKind.Markdown).map(p => p.content).join('').trim();
}

interface ISerializedContextTurn {
	readonly turn: number;
	readonly state: string;
	readonly user?: string;
	readonly assistant?: string;
	readonly toolCalls?: readonly (string | { readonly name: string; readonly input?: string })[];
}

/** Maps a {@link TurnState} (or the in-progress active turn) to a display string. */
function describeTurnState(state: TurnState | 'inProgress'): string {
	switch (state) {
		case TurnState.Complete: return 'complete';
		case TurnState.Cancelled: return 'cancelled';
		case TurnState.Error: return 'error';
		default: return 'inProgress';
	}
}

interface ISerializedSessionContext {
	readonly session: string;
	readonly openLink: string;
	readonly detail: SessionContextDetail;
	readonly transcript: readonly ISerializedContextTurn[];
	readonly hasMoreHistory: boolean;
	/** `true` when turns were dropped from the window or any field was shortened. */
	readonly truncated: boolean;
}

/** Builds the compacted, model-facing session-context payload from a snapshot. */
export function serializeSessionContext(session: URI, chatId: string | undefined, snapshot: IChatContextSnapshot, detail: SessionContextDetail, transcriptLimit: number): string {
	const caps = contextCaps[detail];
	let truncated = false;
	const trunc = (text: string, max: number): string | undefined => {
		if (max <= 0 || !text) {
			return undefined;
		}
		const result = truncateText(text, max);
		truncated = truncated || result.truncated;
		return result.text || undefined;
	};

	const entries: { message: Message; parts: readonly ResponsePart[]; state: TurnState | 'inProgress' }[] =
		snapshot.turns.map(t => ({ message: t.message, parts: t.responseParts, state: t.state }));
	if (snapshot.activeTurn) {
		entries.push({ message: snapshot.activeTurn.message, parts: snapshot.activeTurn.responseParts, state: 'inProgress' });
	}
	if (entries.length > transcriptLimit) {
		truncated = true;
	}
	const windowStart = Math.max(0, entries.length - transcriptLimit);
	const windowed = entries.slice(windowStart);

	const transcript: ISerializedContextTurn[] = windowed.map((entry, index): ISerializedContextTurn => {
		const user = trunc(entry.message.text, caps.user);
		const assistant = trunc(assistantTextOf(entry.parts), caps.assistant);
		const toolCalls = toolCallsOf(entry.parts);
		let serializedToolCalls: (string | { name: string; input?: string })[] | undefined;
		if (detail !== 'summary' && toolCalls.length > 0) {
			serializedToolCalls = toolCalls.map(tc => {
				if (caps.toolInput > 0) {
					const input = trunc(tc.status === ToolCallStatus.Streaming ? '' : getInlineToolInput(tc.toolInput) ?? '', caps.toolInput);
					return input !== undefined ? { name: tc.toolName, input } : { name: tc.toolName };
				}
				return tc.toolName;
			});
		}
		return {
			turn: windowStart + index + 1,
			state: describeTurnState(entry.state),
			...(user !== undefined ? { user } : {}),
			...(assistant !== undefined ? { assistant } : {}),
			...(serializedToolCalls ? { toolCalls: serializedToolCalls } : {}),
		};
	});

	const payload: ISerializedSessionContext = {
		session: session.toString(),
		openLink: buildOpenSessionLinkUri(session, chatId),
		detail,
		transcript,
		hasMoreHistory: snapshot.hasMoreHistory,
		truncated,
	};
	return JSON.stringify(payload);
}

/** Reads and serializes the context of an existing session/chat. */
export async function applyGetSessionContextTool(accessor: ISessionServerToolAccessor, rawArgs: unknown): Promise<string> {
	const sessions = await accessor.listSessions();
	const { session, chatId, detail, transcriptLimit } = getSessionContextArgs(rawArgs, sessions);
	const snapshot = await accessor.getChatContext(session, chatId);
	if (!snapshot) {
		// No live conversation state (e.g. a cold/unsubscribed session): return the
		// identity + an empty transcript. Metadata is available via list_sessions.
		return JSON.stringify({
			session: session.toString(),
			openLink: buildOpenSessionLinkUri(session, chatId),
			detail,
			transcript: [],
			hasMoreHistory: false,
			truncated: false,
		} satisfies ISerializedSessionContext);
	}
	return serializeSessionContext(session, chatId, snapshot, detail, transcriptLimit);
}


/** Serializes the current session's metadata + open link as the `get_current_session` result. */
export function serializeCurrentSession(currentSession: URI, sessions: readonly IAgentSessionMetadata[]): string {
	const meta = sessions.find(s => s.session.toString() === currentSession.toString());
	return JSON.stringify({
		session: currentSession.toString(),
		openLink: buildOpenSessionLinkUri(currentSession),
		...(meta ? serializeSession(meta) : {}),
	});
}

interface IDeleteSessionArgs {
	readonly session?: unknown;
}

/**
 * Validates delete-session arguments against current sessions and refuses to
 * delete {@link currentSession} (deleting the session the tool runs in would
 * tear down its own conversation).
 */
export function getDeleteSessionArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], currentSession?: URI): URI {
	const args = (rawArgs ?? {}) as IDeleteSessionArgs;
	const sessionInput = getRequiredString(args.session, 'session', SessionServerToolName.DeleteSession);
	const session = resolveKnownSession(sessionInput, sessions);
	if (!session) {
		throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: session must match the URI of a known session (see list_sessions).`);
	}
	if (currentSession && session.toString() === currentSession.toString()) {
		throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: refusing to delete the current session.`);
	}
	return session;
}

/** Deletes a session and returns the model-facing confirmation. */
export async function applyDeleteSessionTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, currentSession?: URI): Promise<string> {
	const sessions = await accessor.listSessions();
	const session = getDeleteSessionArgs(rawArgs, sessions, currentSession);
	await accessor.deleteSession(session);
	return `Deleted session ${session.toString()}. Reply with one short sentence confirming the session was deleted.`;
}

function getSessionToolDisplay(toolName: string, args: unknown, _result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	switch (toolName) {
		case SessionServerToolName.ListSessions:
			return {
				displayName: localize('toolName.listSessions', "List Sessions"),
				invocationMessage: localize('toolInvoke.listSessions', "List sessions"),
			};
		case SessionServerToolName.CreateSession:
			if ((args as ICreateSessionArgs | undefined)?.relationship === 'currentSession') {
				return {
					displayName: localize('toolName.createChatInCurrentSession', "Create Chat in Current Session"),
					invocationMessage: localize('toolInvoke.createChatInCurrentSession', "Creating chat in the current session"),
					pastTenseMessage: localize('toolComplete.createChatInCurrentSession', "Created chat in the current session"),
				};
			}
			if ((args as ICreateSessionArgs | undefined)?.relationship === 'independent') {
				return {
					displayName: localize('toolName.createNewSession', "Create New Session"),
					invocationMessage: localize('toolInvoke.createNewSession', "Creating new session"),
					pastTenseMessage: localize('toolComplete.createNewSession', "Created new session"),
				};
			}
			return {
				displayName: localize('toolName.createSession', "Create Session"),
				invocationMessage: localize('toolInvoke.createSession', "Creating session"),
				pastTenseMessage: localize('toolComplete.createSession', "Created session"),
			};
		case SessionServerToolName.CreateChat:
			return {
				displayName: localize('toolName.createChat', "Create Chat"),
				invocationMessage: localize('toolInvoke.createChat', "Create chat"),
			};
		case SessionServerToolName.RenameChat:
			return {
				displayName: localize('toolName.renameChat', "Rename Chat"),
				invocationMessage: localize('toolInvoke.renameChat', "Renaming chat"),
				pastTenseMessage: localize('toolComplete.renameChat', "Requested chat rename"),
			};
		case SessionServerToolName.SendMessage:
			return {
				displayName: localize('toolName.sendMessage', "Send Message"),
				invocationMessage: localize('toolInvoke.sendMessage', "Send message"),
			};
		case SessionServerToolName.GetSessionContext:
			return {
				displayName: localize('toolName.getSessionContext', "Get Session Context"),
				invocationMessage: localize('toolInvoke.getSessionContext', "Read session context"),
			};
		case SessionServerToolName.GetCurrentSession:
			return {
				displayName: localize('toolName.getCurrentSession', "Get Current Session"),
				invocationMessage: localize('toolInvoke.getCurrentSession', "Get current session"),
			};
		case SessionServerToolName.DeleteSession:
			return {
				displayName: localize('toolName.deleteSession', "Delete Session"),
				invocationMessage: localize('toolInvoke.deleteSession', "Deleting session"),
				pastTenseMessage: localize('toolComplete.deleteSession', "Deleted session"),
			};
		default:
			return undefined;
	}
}

/**
 * Creates the session server-tool group with process-local recursion protection.
 *
 * The {@link accessor} is optional so the group can also back the pure display
 * path (`getServerToolDisplay`), which only needs {@link IServerToolGroup.definitions},
 * {@link IServerToolGroup.getDisplay} and {@link IServerToolGroup.canRequireConfirmation}
 * and never invokes {@link IServerToolGroup.execute}. `execute` throws when no
 * accessor was provided.
 */
export function createSessionServerToolGroup(accessor?: ISessionServerToolAccessor): IServerToolGroup {
	let createdSessionCount = 0;
	let createdChatCount = 0;
	let sentMessageCount = 0;
	const group: IServerToolGroup = {
		definitions: sessionServerToolDefinitions,
		// Remove after 2026-10-26; self-mapped because its arguments differ from create_session.
		legacyToolNames: new Map([[SessionServerToolName.CreateChat, SessionServerToolName.CreateChat]]),
		materializeDefinitions: true,
		isEnabled(toolName: string): boolean {
			return toolName !== SessionServerToolName.RenameChat || accessor?.isActiveAgentTitleGenerationEnabled() !== false;
		},
		canRequireConfirmation(toolName: string): boolean {
			return sessionToolRequiresConfirmation(toolName);
		},
		getDisplay(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
			return getSessionToolDisplay(toolName, args, result);
		},
		async execute(_stateManager: AgentHostStateManager, context, toolName: string, rawArgs: unknown): Promise<string> {
			if (!accessor) {
				throw new Error(`Session server tool "${toolName}" cannot run: the group was built without a session accessor.`);
			}
			const currentChannel = context.chatUri;
			switch (toolName) {
				case SessionServerToolName.ListSessions:
					{
						return serializeSessions(filterSessions(await accessor.listSessions(), getListSessionsArgs(rawArgs)));
					}
				case SessionServerToolName.GetCurrentSession:
					return serializeCurrentSession(currentSessionUri(currentChannel), await accessor.listSessions());
				case SessionServerToolName.CreateSession: {
					const relationship = getCreateSessionRelationship(rawArgs);
					if (relationship === 'currentSession' && createdChatCount >= maxCreatedChats) {
						throw new Error(`Refusing to create more than ${maxCreatedChats} chats from server tools in this process.`);
					}
					if (relationship === 'independent' && createdSessionCount >= maxCreatedSessions) {
						throw new Error(`Refusing to create more than ${maxCreatedSessions} sessions from server tools in this process.`);
					}
					const result = await applyCreateSessionTool(accessor, rawArgs, URI.parse(currentChannel), context.turnId);
					if (relationship === 'currentSession') {
						createdChatCount++;
					} else {
						createdSessionCount++;
					}
					return formatCreateSessionResult(result);
				}
				case SessionServerToolName.CreateChat: {
					if (createdChatCount >= maxCreatedChats) {
						throw new Error(`Refusing to create more than ${maxCreatedChats} chats from server tools in this process.`);
					}
					const result = await applyCreateChatTool(accessor, rawArgs, URI.parse(currentChannel), context.turnId);
					createdChatCount++;
					return formatCreateChatResult(result);
				}
				case SessionServerToolName.RenameChat:
					return applyRenameChatTool(accessor, rawArgs, currentChannel);
				case SessionServerToolName.SendMessage: {
					if (sentMessageCount >= maxSentMessages) {
						throw new Error(`Refusing to send more than ${maxSentMessages} messages from server tools in this process.`);
					}
					const result = await applySendMessageTool(accessor, rawArgs, currentChannel, context.turnId);
					sentMessageCount++;
					return result;
				}
				case SessionServerToolName.GetSessionContext:
					return applyGetSessionContextTool(accessor, rawArgs);
				case SessionServerToolName.DeleteSession:
					return applyDeleteSessionTool(accessor, rawArgs, currentSessionUri(currentChannel));
				default:
					throw new Error(`Unknown session server tool: ${toolName}`);
			}
		},
	};
	return group;
}
