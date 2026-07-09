/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { Mutable } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import type { IAgentCreateSessionConfig, IAgentModelInfo, IAgentSessionMetadata } from '../../common/agentService.js';
import { SessionStatus } from '../../common/state/protocol/channels-session/state.js';
import { buildChatUri, buildDefaultChatUri, parseChatUri, readSessionGitState, readSessionGitHubState, type ToolDefinition, type StringOrMarkdown, type URI as ProtocolURI } from '../../common/state/sessionState.js';
import { buildOpenSessionLinkUri, CREATE_CHAT_TOOL_NAME, CREATE_SESSION_TOOL_NAME, parseOpenSessionLinkUri } from '../../common/openSessionLink.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolDisplay, IServerToolDisplayResult, IServerToolGroup } from './agentServerToolHost.js';

export const listSessionsToolName = 'list_sessions';
export const getCurrentSessionToolName = 'get_current_session';
export const createSessionToolName = CREATE_SESSION_TOOL_NAME;
export const createChatToolName = CREATE_CHAT_TOOL_NAME;
export const deleteSessionToolName = 'delete_session';

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

const sessionConfirmationToolNames: ReadonlySet<string> = new Set([createSessionToolName, createChatToolName, deleteSessionToolName]);

/** Whether the given session server tool requires user confirmation before it runs. */
export function sessionToolRequiresConfirmation(toolName: string): boolean {
	return sessionConfirmationToolNames.has(toolName);
}

const listSessionsStatusValues = ['idle', 'inProgress', 'inputNeeded', 'error', 'archived'] as const;

const listSessionsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		status: {
			type: 'array',
			items: { type: 'string', enum: [...listSessionsStatusValues] },
			description: 'Only return sessions whose status matches one of these (e.g. `inputNeeded` for sessions awaiting a reply, `inProgress` for running ones). Omit to return every status.',
		},
		workspace: { type: 'string', description: 'Only return sessions whose working directory is this folder — an absolute path or a workspace URI.' },
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
		workspace: { type: 'string', description: 'Absolute folder path, workspace URI, or a working directory from an existing session.' },
		prompt: { type: 'string', description: 'Initial prompt to send to the new session.' },
		model: { type: 'string', description: 'Optional model ID or display name.' },
	},
	required: ['workspace', 'prompt'],
};

const getCurrentSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

const createChatInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'Optional session to add the chat to: a session URI from `list_sessions` or an `agent-host-session://` link. Defaults to the current session when omitted.' },
		prompt: { type: 'string', description: 'Initial prompt to send to the new chat.' },
		title: { type: 'string', description: 'Optional title for the new chat.' },
		model: { type: 'string', description: 'Optional model ID or display name. Defaults to the session\'s model.' },
	},
	required: ['prompt'],
};

const deleteSessionInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		session: { type: 'string', description: 'The session to delete: a session URI from `list_sessions` or an `agent-host-session://` link (e.g. from `create_session`).' },
	},
	required: ['session'],
};

/** Protocol tool definitions for the session-management server tools. */
export const sessionServerToolDefinitions: ToolDefinition[] = [
	{
		name: listSessionsToolName,
		title: 'List Sessions',
		description: 'List sessions and their compact metadata (status, activity, working directory, project, worktree changes, git/GitHub info, timestamps). By default archived sessions are omitted. Optionally filter by `status`, `workspace`, `withChanges`, `unread`, `withPullRequest`, `includeArchived`, `createdAfter`, or `createdBefore`.',
		inputSchema: listSessionsInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: getCurrentSessionToolName,
		title: 'Get Current Session',
		description: 'Get metadata and the open link for the session this conversation is running in. Use this to reference the current session (for example before adding a chat to it).',
		inputSchema: getCurrentSessionInputSchema,
		annotations: { readOnlyHint: true },
	},
	{
		name: createSessionToolName,
		title: 'Create Session',
		description: 'Create a session in a workspace and start it with an initial prompt. The UI shows a "Session Created" confirmation with a button to open it, so reply with a single short sentence confirming the session was created and do NOT print the session URL or tell the user to click a button.',
		inputSchema: createSessionInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: createChatToolName,
		title: 'Create Chat',
		description: 'Add a new chat to an existing session and start it with an initial prompt. Omit `session` to add the chat to the current session; otherwise pass a session URI from `list_sessions`. Optionally pass a `model` to use for the chat (defaults to the session\'s model). The UI shows a "Chat Created" confirmation with a button to open the session, so reply with a single short sentence and do NOT print the session URL or tell the user to click a button.',
		inputSchema: createChatInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: deleteSessionToolName,
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
	readonly workspace?: unknown;
	readonly prompt?: unknown;
	readonly model?: unknown;
}

export interface IResolvedCreateSessionArgs {
	readonly workspace: URI;
	readonly prompt: string;
	readonly model?: IAgentModelInfo;
}

/** Minimal dependency surface needed by the session server-tool group. */
export interface ISessionServerToolAccessor {
	readonly listSessions: () => Promise<readonly IAgentSessionMetadata[]>;
	readonly createSession: (config: IAgentCreateSessionConfig) => Promise<URI>;
	readonly getModels: () => readonly IAgentModelInfo[];
	readonly startPrompt: (session: URI, chat: URI, prompt: string) => Promise<void>;
	readonly createChat: (session: URI, chat: URI, options?: { title?: string; model?: IAgentModelInfo }) => Promise<void>;
	readonly deleteSession: (session: URI) => Promise<void>;
	/** The spawn depth of a session (0 for a user/top-level session, N for one created N levels deep by `create_session`). */
	readonly getSessionSpawnDepth: (session: URI) => number;
	/** Records the spawn depth of a freshly-created session so its own `create_session` calls can enforce the recursion limit. */
	readonly setSessionSpawnDepth: (session: URI, depth: number) => void;
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
	readonly pullRequestUrl?: string;
}

interface ISerializedSession {
	readonly session: string;
	readonly title?: string;
	readonly status?: string;
	/** Human-readable description of what the session is currently doing. */
	readonly activity?: string;
	readonly workingDirectory?: string;
	/** Display name of the session's project/workspace. */
	readonly project?: string;
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
	const matchingSession = sessions.find(session =>
		session.workingDirectory?.toString() === workspace || session.workingDirectory?.fsPath === workspace);
	if (matchingSession?.workingDirectory) {
		return matchingSession.workingDirectory;
	}
	const parsed = parseWorkspaceUri(workspace);
	if (!parsed) {
		throw new Error(`Invalid ${createSessionToolName} input: workspace must match a known session workingDirectory, an absolute path, or a valid URI string.`);
	}
	return parsed;
}

function resolveModel(modelName: string | undefined, models: readonly IAgentModelInfo[]): IAgentModelInfo | undefined {
	if (modelName === undefined) {
		return undefined;
	}
	const model = models.find(candidate => candidate.id === modelName || candidate.name === modelName);
	if (!model) {
		throw new Error(`Invalid ${createSessionToolName} input: model must match an available model id or name.`);
	}
	return model;
}

/** Validates and resolves create-session arguments against current sessions and models. */
export function getCreateSessionArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], models: readonly IAgentModelInfo[]): IResolvedCreateSessionArgs {
	const args = (rawArgs ?? {}) as ICreateSessionArgs;
	const workspace = getRequiredString(args.workspace, 'workspace', createSessionToolName);
	const prompt = getRequiredString(args.prompt, 'prompt', createSessionToolName);
	const modelName = getOptionalString(args.model, 'model', createSessionToolName);
	return {
		workspace: resolveWorkspace(workspace, sessions),
		prompt,
		model: resolveModel(modelName, models),
	};
}

/** Decodes the {@link SessionStatus} bit-flags into readable names for the agent. */
function describeSessionStatus(status: SessionStatus): string {
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
	return names.join(',') || 'unknown';
}

/** Filters accepted by `list_sessions` to narrow the returned set. */
export interface IListSessionsArgs {
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
	const args = (rawArgs ?? {}) as { status?: unknown; workspace?: unknown; withChanges?: unknown; unread?: unknown; withPullRequest?: unknown; includeArchived?: unknown; createdAfter?: unknown; createdBefore?: unknown };

	let status: Set<string> | undefined;
	if (args.status !== undefined) {
		if (!Array.isArray(args.status) || args.status.some(value => typeof value !== 'string')) {
			throw new Error(`Invalid ${listSessionsToolName} input: status must be an array of status names.`);
		}
		const invalid = (args.status as string[]).filter(value => !(listSessionsStatusValues as readonly string[]).includes(value));
		if (invalid.length > 0) {
			throw new Error(`Invalid ${listSessionsToolName} input: unknown status value(s) ${invalid.join(', ')}. Valid values: ${listSessionsStatusValues.join(', ')}.`);
		}
		status = new Set(args.status as string[]);
	}

	return {
		status,
		workspace: getOptionalString(args.workspace, 'workspace', listSessionsToolName),
		withChanges: getOptionalBoolean(args.withChanges, 'withChanges', listSessionsToolName),
		unread: getOptionalBoolean(args.unread, 'unread', listSessionsToolName),
		withPullRequest: getOptionalBoolean(args.withPullRequest, 'withPullRequest', listSessionsToolName),
		includeArchived: getOptionalBoolean(args.includeArchived, 'includeArchived', listSessionsToolName),
		createdAfter: getOptionalTimestamp(args.createdAfter, 'createdAfter', listSessionsToolName),
		createdBefore: getOptionalTimestamp(args.createdBefore, 'createdBefore', listSessionsToolName),
	};
}

/** Whether a session has any pending worktree changes (insertions, deletions, or changed files). */
function sessionHasChanges(session: IAgentSessionMetadata): boolean {
	const changes = session.changes;
	return !!changes && ((changes.files ?? 0) > 0 || (changes.additions ?? 0) > 0 || (changes.deletions ?? 0) > 0);
}

/** Whether a session is archived (either the metadata flag or the status bit). */
function sessionIsArchived(session: IAgentSessionMetadata): boolean {
	return session.isArchived === true || (session.status !== undefined && (session.status & SessionStatus.IsArchived) !== 0);
}

/** Whether a session's working directory matches the given folder (absolute path or URI). */
function sessionMatchesWorkspace(session: IAgentSessionMetadata, workspace: string): boolean {
	const dir = session.workingDirectory;
	if (!dir) {
		return false;
	}
	if (dir.toString() === workspace || dir.fsPath === workspace) {
		return true;
	}
	const parsed = parseWorkspaceUri(workspace);
	return !!parsed && parsed.toString() === dir.toString();
}

/** Applies the {@link IListSessionsArgs} filters to a set of sessions. */
export function filterSessions(sessions: readonly IAgentSessionMetadata[], args: IListSessionsArgs): readonly IAgentSessionMetadata[] {
	return sessions.filter(session => {
		if (args.status) {
			const names = session.status !== undefined ? describeSessionStatus(session.status).split(',') : [];
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
		if (args.unread && session.isRead !== false) {
			return false;
		}
		if (args.withPullRequest && !readSessionGitHubState(session._meta)?.pullRequestUrl) {
			return false;
		}
		// Archived sessions are hidden unless explicitly requested.
		if (args.includeArchived !== true && sessionIsArchived(session)) {
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
	if (github.pullRequestUrl !== undefined) { result.pullRequestUrl = github.pullRequestUrl; }
	return Object.keys(result).length > 0 ? result : undefined;
}

function serializeSession(session: IAgentSessionMetadata): ISerializedSession {
	const git = serializeGitState(session);
	const github = serializeGitHubState(session);
	return {
		session: session.session.toString(),
		...(session.summary !== undefined ? { title: session.summary } : {}),
		...(session.status !== undefined ? { status: describeSessionStatus(session.status) } : {}),
		...(session.activity !== undefined ? { activity: session.activity } : {}),
		...(session.workingDirectory !== undefined ? { workingDirectory: session.workingDirectory.toString() } : {}),
		...(session.project !== undefined ? { project: session.project.displayName } : {}),
		...(session.isRead === false ? { unread: true } : {}),
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
	readonly session: string;
	readonly chat: string;
	/** Clickable {@link AGENT_HOST_SESSION_LINK_SCHEME} URI that opens the session in the Agents window. */
	readonly openLink: string;
}

/**
 * Creates a session, sends its initial prompt, and returns the created channels.
 * Enforces the {@link maxSessionSpawnDepth recursion limit} against
 * {@link currentSession} (the session the tool runs in) and stamps the new
 * session one level deeper so its own `create_session` calls are bounded too.
 */
export async function applyCreateSessionTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, currentSession?: URI): Promise<ICreateSessionResult> {
	const parentDepth = currentSession ? accessor.getSessionSpawnDepth(currentSession) : 0;
	if (parentDepth >= maxSessionSpawnDepth) {
		throw new Error(`Refusing to create a session: recursion limit reached (max spawn depth ${maxSessionSpawnDepth}). This session was itself created ${parentDepth} level(s) deep.`);
	}
	const sessions = await accessor.listSessions();
	const args = getCreateSessionArgs(rawArgs, sessions, accessor.getModels());
	const config: IAgentCreateSessionConfig = {
		workingDirectory: args.workspace,
		...(args.model !== undefined ? { provider: args.model.provider, model: { id: args.model.id } } : {}),
	};
	const session = await accessor.createSession(config);
	accessor.setSessionSpawnDepth(session, parentDepth + 1);
	const chat = URI.parse(buildDefaultChatUri(session));
	await accessor.startPrompt(session, chat, args.prompt);
	return { session: session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(session) };
}

/**
 * Builds the model-facing `create_session` result. Keeps the machine-readable
 * `agent-host-session://` link (parsed client-side to render the deterministic
 * "Session Created" confirmation + button) but omits the raw backend session
 * URI so the model has nothing ugly to echo, and tells it to reply briefly.
 */
export function formatCreateSessionResult(result: ICreateSessionResult): string {
	return `Session created (${result.openLink}). Reply with one short sentence confirming the session was created; do not print the URL or mention a button.`;
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
		throw new Error(`Invalid ${createChatToolName} input: session must match the URI of a known session (see list_sessions).`);
	}
	return session;
}

/** Validates and resolves create-chat arguments; defaults the session to {@link currentSession} when omitted. */
export function getCreateChatArgs(rawArgs: unknown, sessions: readonly IAgentSessionMetadata[], models: readonly IAgentModelInfo[], currentSession?: URI): { session: URI; prompt: string; title?: string; model?: IAgentModelInfo } {
	const args = (rawArgs ?? {}) as ICreateChatArgs;
	const prompt = getRequiredString(args.prompt, 'prompt', createChatToolName);
	const title = getOptionalString(args.title, 'title', createChatToolName);
	const modelName = getOptionalString(args.model, 'model', createChatToolName);
	const model = resolveModel(modelName, models);
	const sessionInput = getOptionalString(args.session, 'session', createChatToolName);
	let session: URI;
	if (sessionInput !== undefined) {
		session = resolveChatSession(sessionInput, sessions);
	} else if (currentSession) {
		session = currentSession;
	} else {
		throw new Error(`Invalid ${createChatToolName} input: no session provided and the current session could not be determined.`);
	}
	return { session, prompt, ...(title !== undefined ? { title } : {}), ...(model !== undefined ? { model } : {}) };
}

/** Adds a chat to a session, sends its initial prompt, and returns the created channels. */
export async function applyCreateChatTool(accessor: ISessionServerToolAccessor, rawArgs: unknown, currentSession?: URI): Promise<ICreateChatResult> {
	const sessions = await accessor.listSessions();
	const args = getCreateChatArgs(rawArgs, sessions, accessor.getModels(), currentSession);
	const chatId = generateUuid();
	const chat = URI.parse(buildChatUri(args.session.toString(), chatId));
	await accessor.createChat(args.session, chat, { title: args.title, model: args.model });
	await accessor.startPrompt(args.session, chat, args.prompt);
	return { session: args.session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(args.session, chatId) };
}

/** Builds the model-facing `create_chat` result. */
export function formatCreateChatResult(result: ICreateChatResult): string {
	return `Chat created (${result.openLink}). Reply with one short sentence confirming the chat was created; do not print the URL or mention a button.`;
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

function parseListedSessionCount(resultText: string | undefined): number | undefined {
	if (!resultText) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(resultText) as { sessions?: unknown };
		return Array.isArray(parsed.sessions) ? parsed.sessions.length : undefined;
	} catch {
		return undefined;
	}
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
	const sessionInput = getRequiredString(args.session, 'session', deleteSessionToolName);
	const session = resolveKnownSession(sessionInput, sessions);
	if (!session) {
		throw new Error(`Invalid ${deleteSessionToolName} input: session must match the URI of a known session (see list_sessions).`);
	}
	if (currentSession && session.toString() === currentSession.toString()) {
		throw new Error(`Invalid ${deleteSessionToolName} input: refusing to delete the current session.`);
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

function getSessionToolDisplay(toolName: string, _args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
	switch (toolName) {
		case listSessionsToolName: {
			let pastTenseMessage: StringOrMarkdown;
			const count = result ? parseListedSessionCount(result.text) : undefined;
			if (count === undefined) {
				pastTenseMessage = localize('toolComplete.listSessions', "Checked sessions");
			} else if (count === 1) {
				pastTenseMessage = localize('toolComplete.listSessions.one', "Checked 1 session");
			} else {
				pastTenseMessage = localize('toolComplete.listSessions.many', "Checked {0} sessions", count);
			}
			return {
				displayName: localize('toolName.listSessions', "List Sessions"),
				invocationMessage: localize('toolInvoke.listSessions', "Checking sessions"),
				pastTenseMessage,
			};
		}
		case createSessionToolName:
			return {
				displayName: localize('toolName.createSession', "Create Session"),
				invocationMessage: localize('toolInvoke.createSession', "Creating session"),
				pastTenseMessage: localize('toolComplete.createSession', "Created session"),
			};
		case createChatToolName:
			return {
				displayName: localize('toolName.createChat', "Create Chat"),
				invocationMessage: localize('toolInvoke.createChat', "Creating chat"),
				pastTenseMessage: localize('toolComplete.createChat', "Created chat"),
			};
		case getCurrentSessionToolName:
			return {
				displayName: localize('toolName.getCurrentSession', "Get Current Session"),
				invocationMessage: localize('toolInvoke.getCurrentSession', "Checking current session"),
				pastTenseMessage: localize('toolComplete.getCurrentSession', "Checked current session"),
			};
		case deleteSessionToolName:
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
 * {@link IServerToolGroup.getDisplay} and {@link IServerToolGroup.requiresConfirmation}
 * and never invokes {@link IServerToolGroup.execute}. `execute` throws when no
 * accessor was provided.
 */
export function createSessionServerToolGroup(accessor?: ISessionServerToolAccessor): IServerToolGroup {
	let createdSessionCount = 0;
	let createdChatCount = 0;
	const group: IServerToolGroup = {
		definitions: sessionServerToolDefinitions,
		requiresConfirmation(toolName: string): boolean {
			return sessionToolRequiresConfirmation(toolName);
		},
		getDisplay(toolName: string, args: unknown, result?: IServerToolDisplayResult): IServerToolDisplay | undefined {
			return getSessionToolDisplay(toolName, args, result);
		},
		async execute(_stateManager: AgentHostStateManager, sessionUri: ProtocolURI, toolName: string, rawArgs: unknown): Promise<string> {
			if (!accessor) {
				throw new Error(`Session server tool "${toolName}" cannot run: the group was built without a session accessor.`);
			}
			switch (toolName) {
				case listSessionsToolName:
					return serializeSessions(filterSessions(await accessor.listSessions(), getListSessionsArgs(rawArgs)));
				case getCurrentSessionToolName:
					return serializeCurrentSession(currentSessionUri(sessionUri), await accessor.listSessions());
				case createSessionToolName: {
					if (createdSessionCount >= maxCreatedSessions) {
						throw new Error(`Refusing to create more than ${maxCreatedSessions} sessions from server tools in this process.`);
					}
					const result = await applyCreateSessionTool(accessor, rawArgs, currentSessionUri(sessionUri));
					createdSessionCount++;
					return formatCreateSessionResult(result);
				}
				case createChatToolName: {
					if (createdChatCount >= maxCreatedChats) {
						throw new Error(`Refusing to create more than ${maxCreatedChats} chats from server tools in this process.`);
					}
					const result = await applyCreateChatTool(accessor, rawArgs, currentSessionUri(sessionUri));
					createdChatCount++;
					return formatCreateChatResult(result);
				}
				case deleteSessionToolName:
					return applyDeleteSessionTool(accessor, rawArgs, currentSessionUri(sessionUri));
				default:
					throw new Error(`Unknown session server tool: ${toolName}`);
			}
		},
	};
	return group;
}
