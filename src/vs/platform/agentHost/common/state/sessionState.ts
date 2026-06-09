/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Immutable state types for the sessions process protocol.
// See protocol.md for the full design rationale.
//
// Most types are imported from the auto-generated protocol layer
// (synced from the agent-host-protocol repo). This file adds VS Code-specific
// helpers and re-exports.

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI as ResourceURI } from '../../../../base/common/uri.js';
import type { IProductService } from '../../../product/common/productService.js';
import {
	SessionLifecycle,
	TerminalState,
	ToolResultContentType,
	ToolResultFileEditContent,
	type ActiveTurn,
	type ChangesetState,
	type URI as ProtocolURI,
	type RootState,
	type SessionState,
	type SessionSummary,
	type TextRange,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResult,
	type ToolCallState,
	type ToolResultContent,
	type ToolResultSubagentContent,
	type ToolResultTextContent,
	type Message,
} from './protocol/state.js';

// Re-export everything from the protocol state module
export {
	ChangesetOperationScope, ChangesetOperationStatus, ChangesetStatus, CustomizationLoadStatus,
	CustomizationType, MessageAttachmentKind, MessageKind,
	PendingMessageKind,
	PolicyState,
	ResponsePartKind,
	SessionInputAnswerState,
	SessionInputAnswerValueKind,
	SessionInputQuestionKind,
	SessionInputResponseKind,
	SessionLifecycle,
	SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus,
	ToolResultContentType,
	TurnState, type ActiveTurn, type AgentCustomization, type AgentInfo, type AgentSelection, type Changeset, type ChangesetFile,
	type ChangesetOperation, type ChangesetState, type ChildCustomization, type ClientPluginCustomization, type ConfigPropertySchema,
	type ConfigSchema,
	type ContentRef, type Customization, type CustomizationDegradedState,
	type CustomizationErrorState, type CustomizationLoadedState, type CustomizationLoadingState, type CustomizationLoadState, type DirectoryCustomization, type ErrorInfo, type HookCustomization, type FileEdit as ISessionFileDiff, type ToolResultEmbeddedResourceContent as IToolResultBinaryContent, type MarkdownResponsePart, type McpServerCustomization, type MessageAttachment,
	type MessageResourceAttachment, type ModelSelection, type PendingMessage, type PluginCustomization, type ProjectInfo, type PromptCustomization, type ReasoningResponsePart,
	type ResponsePart,
	type RootState, type RuleCustomization, type SessionActiveClient,
	type SessionConfigState, type SessionInputAnswer,
	type SessionInputOption, type SessionInputQuestion, type SessionInputRequest, type SessionModelInfo,
	type SessionState,
	type SessionSummary, type SkillCustomization, type Snapshot, type StringOrMarkdown, type TerminalState,
	type ToolAnnotations,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallPendingConfirmationState,
	type ToolCallPendingResultConfirmationState,
	type ToolCallResponsePart,
	type ToolCallResult,
	type ToolCallRunningState,
	type ToolCallState,
	type ToolCallStreamingState,
	type ToolCallContributor,
	type ToolDefinition, type ToolResultContent,
	type ToolResultFileEditContent,
	type ToolResultSubagentContent,
	type ToolResultTextContent,
	type Turn, type URI, type UsageInfo,
	type Message
} from './protocol/state.js';

export {
	ChangesetOperationTargetKind, type ChangesetOperationFollowUp, type ChangesetOperationTarget
} from './protocol/commands.js';

// ---- File edit kind ---------------------------------------------------------

/**
 * The kind of file edit operation. Derived from the presence/absence of
 * `before`/`after` in {@link ToolResultFileEditContent}.
 */
export const enum FileEditKind {
	/** Content edit (same file URI, different content). */
	Edit = 'edit',
	/** File creation (no before state). */
	Create = 'create',
	/** File deletion (no after state). */
	Delete = 'delete',
	/** File rename/move (different before and after URIs). */
	Rename = 'rename',
}

// ---- Well-known URIs --------------------------------------------------------

/** URI for the root state subscription. */
export const ROOT_STATE_URI = 'ahp-root://';

/** Scheme used by {@link ROOT_STATE_URI}. */
export const AHP_ROOT_SCHEME = 'ahp-root';

/** Scheme used by resource-watch channel URIs (`ahp-resource-watch:/<encoded>`). */
export const AHP_RESOURCE_WATCH_SCHEME = 'ahp-resource-watch';

/**
 * Encode a resource-watch descriptor into its canonical channel URI. The
 * descriptor is serialised into the URI path so the receiver can recover
 * the watch parameters without any server-side bookkeeping — subscribe is
 * the only point where state is materialised (an `IFileService` watcher
 * is attached on the first subscriber and held through a grace window
 * after the last drops).
 */
export function buildResourceWatchChannelUri(descriptor: {
	readonly root: string;
	readonly recursive?: boolean;
	readonly excludes?: { items: readonly string[] };
	readonly includes?: { items: readonly string[] };
}): string {
	const payload: Record<string, unknown> = { root: descriptor.root };
	if (descriptor.recursive) { payload.recursive = true; }
	if (descriptor.excludes && descriptor.excludes.items.length > 0) {
		payload.excludes = [...descriptor.excludes.items];
	}
	if (descriptor.includes && descriptor.includes.items.length > 0) {
		payload.includes = [...descriptor.includes.items];
	}

	const json = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)), false, true);
	return `${AHP_RESOURCE_WATCH_SCHEME}://r/${json}`;
}

/**
 * Inverse of {@link buildResourceWatchChannelUri}. Returns `undefined` if
 * `uri` is not a well-formed `ahp-resource-watch:` URI — callers should
 * surface that as a not-found error to the client.
 */
export function parseResourceWatchChannelUri(uri: string): {
	root: string;
	recursive: boolean;
	excludes?: { items: string[] };
	includes?: { items: string[] };
} | undefined {
	let parsed: ResourceURI;
	try {
		parsed = ResourceURI.parse(uri);
	} catch {
		return undefined;
	}
	if (parsed.scheme !== AHP_RESOURCE_WATCH_SCHEME) {
		return undefined;
	}
	const encoded = parsed.path.replace(/^\//, '');
	if (!encoded) {
		return undefined;
	}
	try {
		const payload = JSON.parse(decodeBase64(encoded).toString()) as { root?: unknown; recursive?: unknown; excludes?: unknown; includes?: unknown };
		if (typeof payload.root !== 'string') {
			return undefined;
		}

		return {
			root: payload.root,
			recursive: payload.recursive === true,
			...(Array.isArray(payload.excludes) ? { excludes: { items: payload.excludes.filter((x): x is string => typeof x === 'string') } } : {}),
			...(Array.isArray(payload.includes) ? { includes: { items: payload.includes.filter((x): x is string => typeof x === 'string') } } : {}),
		};
	} catch {
		return undefined;
	}
}

/** Returns `true` when `uri` identifies a resource-watch channel. */
export function isAhpResourceWatchChannel(uri: string): boolean {
	try {
		return ResourceURI.parse(uri).scheme === AHP_RESOURCE_WATCH_SCHEME;
	} catch {
		return false;
	}
}

/**
 * Returns `true` when `uri` identifies the root channel, regardless of
 * whether the caller passes the canonical wire form (`'ahp-root://'`) or a
 * variant that has been round-tripped through the workbench {@link URI} class
 * (which normalizes the authority-less form to `'ahp-root:'`). Always prefer
 * this helper over a direct `=== ROOT_STATE_URI` comparison so the two
 * spellings stay interchangeable.
 */
export function isAhpRootChannel(uri: string): boolean {
	if (uri === ROOT_STATE_URI) {
		return true;
	}
	try {
		return ResourceURI.parse(uri).scheme === AHP_ROOT_SCHEME;
	} catch {
		return false;
	}
}

/**
 * Mints a session-unique opaque id for a customization, derived from its
 * source URI and (when present) its `range` within the source. Plugins MAY
 * declare multiple children (e.g. MCP servers, hooks) inside the same
 * manifest file; including the range disambiguates them without an extra
 * mapping table.
 *
 * The range is appended as a reserved `#range=` query-style suffix; any
 * existing `#` in the URI is percent-encoded first so a source URI that
 * already contains a fragment cannot collide with a ranged id.
 */
export function customizationId(uri: string, range?: TextRange): string {
	if (!range) {
		return uri;
	}
	const safeUri = uri.replace(/#/g, '%23');
	return `${safeUri}#range=${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

// ---- VS Code-specific derived types -----------------------------------------

/**
 * A tool call in a terminal state, stored in completed turns.
 */
export type ICompletedToolCall = ToolCallCompletedState | ToolCallCancelledState;

/**
 * Derived status type for the tool call lifecycle.
 */
export type ToolCallStatusString = ToolCallState['status'];

// ---- Tool output helper -----------------------------------------------------

/**
 * Extracts a plain-text tool output string from a tool call result's `content`
 * array. Joins all text-type content parts into a single string.
 *
 * Returns `undefined` if there are no text content parts.
 */
export function getToolOutputText(result: ToolCallResult): string | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	const textParts: ToolResultTextContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Text) {
			textParts.push(c);
		}
	}
	if (textParts.length === 0) {
		return undefined;
	}
	return textParts.map(p => p.text).join('\n');
}

/**
 * Extracts file edit content entries from a tool call result's `content` array.
 * Returns an empty array if there are no file edit content parts.
 */
export function getToolFileEdits(result: ToolCallResult): ToolResultFileEditContent[] {
	if (!result.content || result.content.length === 0) {
		return [];
	}
	const edits: ToolResultFileEditContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.FileEdit) {
			edits.push(c);
		}
	}
	return edits;
}

/**
 * Extracts the first subagent content entry from a tool call's `content` array.
 * Works with both completed tool call results and running tool call states.
 * Returns `undefined` if there are no subagent content parts.
 */
export function getToolSubagentContent(result: { content?: readonly ToolResultContent[] }): ToolResultSubagentContent | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
			return c as ToolResultSubagentContent;
		}
	}
	return undefined;
}

// ---- Subagent URI helpers ---------------------------------------------------

const SUBAGENT_URI_SEGMENT = 'subagent';
const SUBAGENT_URI_MARKER = `/${SUBAGENT_URI_SEGMENT}/`;
const SUBAGENT_URI_PATH_REGEX = /^(?<parentPath>.+)\/subagent\/(?<toolCallId>.+)$/;

function asResourceUri(uri: ProtocolURI | ResourceURI): ResourceURI {
	return typeof uri === 'string' ? ResourceURI.parse(uri) : uri;
}

function getSubagentBasePath(parentSession: ProtocolURI | ResourceURI): { parent: ResourceURI; path: string } {
	const parent = asResourceUri(parentSession);
	const parentPath = parent.path.endsWith('/') ? parent.path.slice(0, -1) : parent.path;
	return { parent, path: `${parentPath}${SUBAGENT_URI_MARKER}` };
}

/**
 * Builds a subagent session URI from a parent session URI and tool call ID.
 * Convention: `{parentSessionUri}/subagent/{toolCallId}`
 */
export function buildSubagentSessionUri(parentSession: ProtocolURI | ResourceURI, toolCallId: string): string {
	const { parent, path } = getSubagentBasePath(parentSession);
	return parent.with({ path: `${path}${toolCallId}` }).toString();
}

/**
 * Parses a subagent session URI into its parent session URI and tool call ID.
 * Returns `undefined` if the URI does not follow the subagent convention.
 */
export function parseSubagentSessionUri(uri: ProtocolURI | ResourceURI): { parentSession: ResourceURI; toolCallId: string } | undefined {
	const resource = asResourceUri(uri);
	const match = SUBAGENT_URI_PATH_REGEX.exec(resource.path);
	if (!match?.groups) {
		return undefined;
	}
	return {
		parentSession: resource.with({ path: match.groups.parentPath }),
		toolCallId: match.groups.toolCallId,
	};
}

/**
 * Returns whether a session URI represents a subagent session.
 */
export function isSubagentSession(uri: ProtocolURI | ResourceURI): boolean {
	return parseSubagentSessionUri(uri) !== undefined;
}

/**
 * Builds the string prefix used by the state manager for cached subagent sessions.
 */
export function buildSubagentSessionUriPrefix(parentSession: ProtocolURI | ResourceURI): string {
	const { parent, path } = getSubagentBasePath(parentSession);
	return parent.with({ path }).toString();
}

// ---- Factory helpers --------------------------------------------------------

export function createRootState(): RootState {
	return {
		agents: [],
		activeSessions: 0,
	};
}

export function createSessionState(summary: SessionSummary): SessionState {
	return {
		summary,
		lifecycle: SessionLifecycle.Creating,
		turns: [],
		activeTurn: undefined,
	};
}

export function createActiveTurn(id: string, message: Message): ActiveTurn {
	return {
		id,
		message,
		responseParts: [],
		usage: undefined,
	};
}

export const enum StateComponents {
	Root,
	Session,
	Terminal,
	Changeset,
}

export type ComponentToState = {
	[StateComponents.Root]: RootState;
	[StateComponents.Session]: SessionState;
	[StateComponents.Terminal]: TerminalState;
	[StateComponents.Changeset]: ChangesetState;
};

// ---- SessionMeta accessors -------------------------------------------------

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionState}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionMeta = Record<string, unknown>;

/**
 * Reserved key under {@link SessionMeta} for the well-known git-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about git state.
 */
export const SESSION_META_GIT_KEY = 'git';

/**
 * Git state of a session's working directory, carried under
 * {@link SessionMeta} at {@link SESSION_META_GIT_KEY}. Used by clients to
 * drive source-control affordances (e.g. PR/merge buttons in the Agents
 * app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitState {
	/** Whether the working directory has a `github.com` git remote. */
	readonly hasGitHubRemote?: boolean;
	/** Current branch name. */
	readonly branchName?: string;
	/** Base branch the work targets (e.g. `main`). */
	readonly baseBranchName?: string;
	/** Upstream tracking branch (e.g. `origin/feature`). */
	readonly upstreamBranchName?: string;
	/** Number of commits the upstream branch has ahead of the local branch. */
	readonly incomingChanges?: number;
	/** Number of commits the local branch has ahead of the upstream branch. */
	readonly outgoingChanges?: number;
	/** Number of files with uncommitted changes. */
	readonly uncommittedChanges?: number;
	/** GitHub repository owner parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubOwner?: string;
	/** GitHub repository name parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubRepo?: string;
}

/**
 * Reads the well-known git-state payload from {@link SessionMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at
 * the git key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 */
export function readSessionGitState(meta: SessionMeta | undefined): ISessionGitState | undefined {
	const value = meta?.[SESSION_META_GIT_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		hasGitHubRemote?: boolean;
		branchName?: string;
		baseBranchName?: string;
		upstreamBranchName?: string;
		incomingChanges?: number;
		outgoingChanges?: number;
		uncommittedChanges?: number;
		githubOwner?: string;
		githubRepo?: string;
	} = {};
	if (typeof raw['hasGitHubRemote'] === 'boolean') { result.hasGitHubRemote = raw['hasGitHubRemote']; }
	if (typeof raw['branchName'] === 'string') { result.branchName = raw['branchName']; }
	if (typeof raw['baseBranchName'] === 'string') { result.baseBranchName = raw['baseBranchName']; }
	if (typeof raw['upstreamBranchName'] === 'string') { result.upstreamBranchName = raw['upstreamBranchName']; }
	if (typeof raw['incomingChanges'] === 'number') { result.incomingChanges = raw['incomingChanges']; }
	if (typeof raw['outgoingChanges'] === 'number') { result.outgoingChanges = raw['outgoingChanges']; }
	if (typeof raw['uncommittedChanges'] === 'number') { result.uncommittedChanges = raw['uncommittedChanges']; }
	if (typeof raw['githubOwner'] === 'string') { result.githubOwner = raw['githubOwner']; }
	if (typeof raw['githubRepo'] === 'string') { result.githubRepo = raw['githubRepo']; }
	return result;
}

/**
 * Returns a new {@link SessionMeta} with the git-state payload set to
 * `gitState`, or with the git slot removed if `gitState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitState(meta: SessionMeta | undefined, gitState: ISessionGitState | undefined): SessionMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitState !== undefined) {
		next[SESSION_META_GIT_KEY] = gitState;
	} else {
		delete next[SESSION_META_GIT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

// ---- RootState _meta accessors ---------------------------------------------

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link RootState}. Keys SHOULD be namespaced to avoid collisions; values MUST
 * be JSON-serializable.
 */
export type RootMeta = Record<string, unknown>;

/**
 * Reserved key under {@link RootMeta} for the well-known host-build payload.
 * Value at this key, when present, MUST be shaped like {@link IHostBuildInfo}.
 * This is a VS Code-specific convention layered on top of the protocol's
 * generic `_meta` bag — the protocol itself does not know about build info.
 */
export const ROOT_META_HOST_BUILD_KEY = 'hostBuild';

/**
 * Build information about the program hosting the agent host (the VS Code CLI),
 * carried under {@link RootMeta} at {@link ROOT_META_HOST_BUILD_KEY}. Lets a
 * client see which build is hosting it — useful when inspecting the output of a
 * remote agent host.
 *
 * All fields except {@link version} are optional — a build that does not track
 * a particular field should omit it.
 */
export interface IHostBuildInfo {
	/** Product version (e.g. `1.96.0`). */
	readonly version: string;
	/** Commit SHA of the build, if known. */
	readonly commit?: string;
	/** Build date (ISO 8601), if known. */
	readonly date?: string;
	/** Release quality (e.g. `stable`, `insider`), if known. */
	readonly quality?: string;
}

/**
 * Derives {@link IHostBuildInfo} from the host's {@link IProductService}.
 */
export function hostBuildInfoFromProduct(productService: IProductService): IHostBuildInfo {
	return {
		version: productService.version,
		commit: productService.commit,
		date: productService.date,
		quality: productService.quality,
	};
}

/**
 * Reads the well-known host-build payload from {@link RootMeta}, if present.
 * Returns `undefined` when the meta bag is absent or the value at the host-build
 * key is not a plain object with a string `version`. Optional fields with wrong
 * types are silently dropped.
 */
export function readHostBuildInfo(meta: RootMeta | undefined): IHostBuildInfo | undefined {
	const value = meta?.[ROOT_META_HOST_BUILD_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['version'] !== 'string') {
		return undefined;
	}
	const result: { version: string; commit?: string; date?: string; quality?: string } = {
		version: raw['version'],
	};
	if (typeof raw['commit'] === 'string') { result.commit = raw['commit']; }
	if (typeof raw['date'] === 'string') { result.date = raw['date']; }
	if (typeof raw['quality'] === 'string') { result.quality = raw['quality']; }
	return result;
}

/**
 * Returns a new {@link RootMeta} with the host-build payload set to
 * `buildInfo`, or with the slot removed if `buildInfo` is `undefined`. Returns
 * `undefined` if the result would be empty.
 */
export function withHostBuildInfo(meta: RootMeta | undefined, buildInfo: IHostBuildInfo | undefined): RootMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (buildInfo !== undefined) {
		next[ROOT_META_HOST_BUILD_KEY] = buildInfo;
	} else {
		delete next[ROOT_META_HOST_BUILD_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Formats {@link IHostBuildInfo} as a short single-line human-readable string,
 * e.g. `1.96.0 (commit abc1234, 2024-01-02T03:04:05Z, insider)`.
 */
export function formatHostBuildInfo(info: IHostBuildInfo): string {
	const details: string[] = [];
	if (info.commit) { details.push(`commit ${info.commit}`); }
	if (info.date) { details.push(info.date); }
	if (info.quality) { details.push(info.quality); }
	return details.length > 0 ? `${info.version} (${details.join(', ')})` : info.version;
}
