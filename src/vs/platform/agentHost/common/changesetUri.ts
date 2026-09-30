/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI as ResourceURI } from '../../../base/common/uri.js';
import { readAgentMergeFolderState } from './agentMerge.js';
import { getWorkingDirectoryKey } from './agentHostWorkingDirectories.js';
import { isAgentMergeMessage } from './meta/agentMergeMessageMeta.js';
import { AgentSystemNotificationKind, readAgentSystemNotificationMeta } from './meta/agentSystemNotificationMeta.js';
import { buildDefaultChatUri, isDefaultChatUri, MessageKind, parseChatUri, readSessionGitState, readSessionWorkspaceless, ResponsePartKind, SessionLifecycle, type Changeset, type ISessionGitState, type ISessionWithDefaultChat, type URI } from './state/sessionState.js';

/**
 * Helpers for building / parsing the URI clients subscribe to in order to
 * receive a {@link import('./state/protocol/state.js').ChangesetState}.
 *
 * Shapes recognised by this module:
 *
 *     <ownerUri>/changeset/uncommitted
 *     <ownerUri>/changeset/session
 *     <ownerUri>/changeset/turn/<turnId>
 *     <ownerUri>/changeset/compare/<originalTurnId>/<modifiedTurnId>
 *
 * Catalogue entries may also advertise the
 * URI-template forms `<ownerUri>/changeset/turn/{turnId}` and
 * `<ownerUri>/changeset/compare/{originalTurnId}/{modifiedTurnId}`;
 * clients expand the template before subscribing.
 *
 * Keeping changeset URIs nested under the owner URI namespace lets the server
 * cleanly tear down every changeset for a session or chat when that owner
 * is disposed (the reverse-lookup is just a string-prefix scan).
 */

/** /** Stable id of the catalogue entry for the branch changeset. */
const BRANCH_CHANGESET_ID = 'branch';

/** Stable id of the catalogue entry for the uncommitted-changes changeset. */
const UNCOMMITTED_CHANGESET_ID = 'uncommitted';

/** Stable id of the catalogue entry for the session-wide changeset. */
const SESSION_CHANGESET_ID = 'session';

/** Stable id and change kind of the Agent Merge changeset. */
export const AGENT_MERGE_CHANGESET_ID = 'agent-merge';

/** Path prefix used by per-turn changeset URIs (`turn/<turnId>`). */
const TURN_CHANGESET_PREFIX = 'turn/';

/** Template variable name used inside the per-turn URI template. */
const TURN_TEMPLATE_VARIABLE = '{turnId}';

/** Path prefix used by compare-turns changeset URIs (`compare/<originalTurnId>/<modifiedTurnId>`). */
const COMPARE_CHANGESET_PREFIX = 'compare/';

/** Template variable name for the original turn in the compare-turns URI template. */
const COMPARE_ORIGINAL_TEMPLATE_VARIABLE = '{originalTurnId}';

/** Template variable name for the modified turn in the compare-turns URI template. */
const COMPARE_MODIFIED_TEMPLATE_VARIABLE = '{modifiedTurnId}';

/** Localized human-readable label for the branch changeset entry. */
export const branchChangesetLabel = (): string => localize('branchChangeset.label', "Branch Changes");

/** Localized human-readable label for the session-wide changeset entry. */
export const sessionChangesetLabel = (): string => localize('sessionChangeset.label', "Session Changes");

/** Localized human-readable description for the session-wide changeset entry. */
export const sessionChangesetDescription = (): string => localize('sessionChangeset.description', "Show all changes made in this session");

/** Localized human-readable label for the uncommitted-changes changeset entry. */
export const uncommittedChangesetLabel = (): string => localize('uncommittedChangeset.label', "Uncommitted Changes");

/** Localized human-readable description for the uncommitted-changes changeset entry. */
export const uncommittedChangesetDescription = (): string => localize('uncommittedChangeset.description', "Show uncommitted changes in this session");

/** Localized human-readable label for the per-turn changeset template entry. */
export const thisTurnChangesetLabel = (): string => localize('thisTurnChangeset.label', "This Turn");

/** Localized human-readable description for the per-turn changeset template entry. */
export const thisTurnChangesetDescription = (): string => localize('thisTurnChangeset.description', "Show changes made in this turn");

/** Localized human-readable label for the compare-turns changeset template entry. */
export const compareTurnsChangesetLabel = (): string => localize('compareTurnsChangeset.label', "Compare Turns");

/** Localized human-readable description for the compare-turns changeset template entry. */
export const compareTurnsChangesetDescription = (): string => localize('compareTurnsChangeset.description', "Show changes made between different turns");

/** Localized human-readable label for the Agent Merge changeset entry. */
const agentMergeChangesetLabel = (): string => localize('agentMergeChangeset.label', "Agent Merge Changes");

/** Localized human-readable description for the Agent Merge changeset entry. */
const agentMergeChangesetDescription = (): string => localize('agentMergeChangeset.description', "Show changes made by Agent Merge since the last user message");

/**
 * Returns the description shown next to the `Branch Changes` catalogue
 * entry. Prefers `${branchName} → ${baseBranchName}` when both values
 * are known (typical worktree-isolation case). If `baseBranchName` is
 * unknown, falls back to `${branchName} → ${upstreamBranchName}` when an
 * upstream is available. Finally falls back to `branchName` alone.
 * Returns `undefined` only when no branch name is known at all, so
 * callers can omit the description entirely.
 */
export function formatBranchChangesetDescription(gitState: ISessionGitState): string | undefined {
	const { baseBranchName, branchName, upstreamBranchName } = gitState;

	// Use branch name
	if (baseBranchName && branchName) {
		return `${branchName} → ${baseBranchName}`;
	}

	// Use upstream branch name
	if (upstreamBranchName && branchName) {
		return `${branchName} → ${upstreamBranchName}`;
	}

	return branchName;
}

/** Marker injected into a changeset URI's path. */
const CHANGESET_PATH_SEGMENT = '/changeset/';

/** Discriminates the well-known changeset URI shapes. */
export const enum ChangesetKind {
	Branch = 'branch',
	Uncommitted = 'uncommitted',
	Session = 'session',
	Turn = 'turn',
	Compare = 'compare-turns',
	/** Producer-defined id we don't recognise (single-segment only). */
	Unknown = 'unknown',
}

/** Resolves the selectable catalogue for a chat and the owner of each entry. */
export function resolveChatChangesetCatalogue(chatUri: URI, chatChangesets: readonly Changeset[] | undefined, sessionChangesets: readonly Changeset[] | undefined, defaultChatUri?: URI): readonly { readonly changeset: Changeset; readonly owner: 'chat' | 'session' }[] | undefined {
	if (sessionChangesets === undefined) {
		return chatChangesets
			?.filter(changeset => changeset.changeKind !== ChangesetKind.Session)
			.map(changeset => ({ changeset, owner: 'chat' as const }));
	}

	const sessionChangeset = sessionChangesets.find(changeset => changeset.changeKind === ChangesetKind.Session);
	if (chatChangesets === undefined) {
		const legacyChangesets = sessionChangesets.filter(changeset => changeset.changeKind !== ChangesetKind.Session);
		if (legacyChangesets.length === 0) {
			return undefined;
		}
		// Older hosts compute per-turn changes from session-keyed checkpoints, so
		// peer chats share the session's Turn and Compare entries; its Branch and
		// Uncommitted entries describe the session folder only.
		const isDefaultChat = defaultChatUri === undefined ? isDefaultChatUri(chatUri) : chatUri === defaultChatUri;
		const changesets = isDefaultChat
			? sessionChangesets
			: sessionChangesets.filter(changeset => changeset.changeKind === ChangesetKind.Session || changeset.changeKind === ChangesetKind.Turn || changeset.changeKind === ChangesetKind.Compare);
		return changesets.map(changeset => ({ changeset, owner: 'session' as const }));
	}

	const resolved: { changeset: Changeset; owner: 'chat' | 'session' }[] = chatChangesets
		.filter(changeset => changeset.changeKind !== ChangesetKind.Session)
		.map(changeset => ({ changeset, owner: 'chat' as const }));
	if (sessionChangeset) {
		const turnIndex = resolved.findIndex(({ changeset }) => changeset.changeKind === ChangesetKind.Turn);
		resolved.splice(turnIndex < 0 ? resolved.length : turnIndex, 0, { changeset: sessionChangeset, owner: 'session' });
	}
	return resolved;
}

/** Changeset kinds that can represent a session's default changes view. */
export type DefaultChangesetKind = ChangesetKind.Branch | ChangesetKind.Uncommitted | ChangesetKind.Session;

/** Selects the configured default changeset, falling back to the first catalogue entry. */
export function selectDefaultChangeset<T extends Pick<Changeset, 'changeKind'>>(
	changesets: readonly T[] | undefined,
	defaultKind: DefaultChangesetKind = ChangesetKind.Branch,
): T | undefined {
	return changesets?.find(changeset => changeset.changeKind === defaultKind) ?? changesets?.[0];
}

/** RFC 3986 scheme prefix, e.g. the `ahp-session:` in `ahp-session:/abc`. */
const URI_SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/;

const AHP_FOLDER_CHANGESET_SCHEME = 'ahp-folder-changeset';
const AHP_FOLDER_CHANGESET_AUTHORITY = 'scope';

/**
 * Resolve a {@link Changeset.uriTemplate} from a session's catalogue into a
 * subscribable URI template.
 *
 * A host may publish the template relative to the session channel
 * (`changeset/branch`); used verbatim that addresses the client's own
 * filesystem. Templates that already carry a scheme are returned unchanged.
 */
export function resolveChangesetUriTemplate(sessionUri: URI, uriTemplate: string): string {
	if (URI_SCHEME_PREFIX.test(uriTemplate)) {
		return uriTemplate;
	}
	return `${sessionUri.replace(/\/+$/, '')}/${uriTemplate.replace(/^\/+/, '')}`;
}

export function buildBranchChangesetUri(sessionUri: URI): URI {
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${BRANCH_CHANGESET_ID}`;
}

/** Builds the session-scoped owner URI for one effective folder/worktree scope. */
export function buildFolderChangesetOwnerUri(sessionUri: URI, scopeId: string): URI {
	if (!scopeId || scopeId.includes('/')) {
		throw new Error(`buildFolderChangesetOwnerUri: scopeId must be non-empty and not contain '/' (got ${JSON.stringify(scopeId)})`);
	}
	const encodedSession = encodeBase64(VSBuffer.fromString(sessionUri), false, true);
	return `${AHP_FOLDER_CHANGESET_SCHEME}://${AHP_FOLDER_CHANGESET_AUTHORITY}/${encodedSession}/${scopeId}`;
}

/** Parses a folder changeset owner URI into its containing session and opaque scope id. */
export function parseFolderChangesetOwnerUri(ownerUri: URI): { sessionUri: URI; scopeId: string } | undefined {
	let parsed: ResourceURI;
	try {
		parsed = ResourceURI.parse(ownerUri);
	} catch {
		return undefined;
	}
	if (parsed.scheme !== AHP_FOLDER_CHANGESET_SCHEME || parsed.authority !== AHP_FOLDER_CHANGESET_AUTHORITY) {
		return undefined;
	}
	const [encodedSession, scopeId, ...extra] = parsed.path.replace(/^\//, '').split('/');
	if (!encodedSession || !scopeId || extra.length > 0) {
		return undefined;
	}
	try {
		return { sessionUri: decodeBase64(encodedSession).toString(), scopeId };
	} catch {
		return undefined;
	}
}

/** Returns the subscribable URI for the session-wide changeset. */
export function buildSessionChangesetUri(sessionUri: URI): URI {
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${SESSION_CHANGESET_ID}`;
}

/** Returns the subscribable URI for the uncommitted-changes changeset. */
export function buildUncommittedChangesetUri(sessionUri: URI): URI {
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${UNCOMMITTED_CHANGESET_ID}`;
}

/**
 * Returns the URI _template_ that catalogue entries advertise for the
 * per-turn changeset; clients expand `{turnId}` to build the
 * subscribable URI via {@link buildTurnChangesetUri}.
 */
export function buildTurnChangesetUriTemplate(sessionUri: URI): URI {
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${TURN_CHANGESET_PREFIX}${TURN_TEMPLATE_VARIABLE}`;
}

/** Returns the subscribable URI for the per-turn changeset of `turnId`. */
export function buildTurnChangesetUri(sessionUri: URI, turnId: string): URI {
	if (!turnId || turnId.includes('/')) {
		throw new Error(`buildTurnChangesetUri: turnId must be non-empty and not contain '/' (got ${JSON.stringify(turnId)})`);
	}
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${TURN_CHANGESET_PREFIX}${turnId}`;
}

/**
 * Returns the URI _template_ that catalogue entries advertise for the
 * compare-turns changeset; clients expand both `{originalTurnId}` and
 * `{modifiedTurnId}` to build the subscribable URI via
 * {@link buildCompareTurnsChangesetUri}.
 */
export function buildCompareTurnsChangesetUriTemplate(sessionUri: URI): URI {
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${COMPARE_CHANGESET_PREFIX}${COMPARE_ORIGINAL_TEMPLATE_VARIABLE}/${COMPARE_MODIFIED_TEMPLATE_VARIABLE}`;
}

/**
 * Returns the subscribable URI for the compare-turns changeset between
 * `originalTurnId` (the "from" endpoint) and `modifiedTurnId` (the "to"
 * endpoint). Diff direction is `originalTurnId → modifiedTurnId`.
 */
export function buildCompareTurnsChangesetUri(sessionUri: URI, originalTurnId: string, modifiedTurnId: string): URI {
	if (!originalTurnId || originalTurnId.includes('/')) {
		throw new Error(`buildCompareTurnsChangesetUri: originalTurnId must be non-empty and not contain '/' (got ${JSON.stringify(originalTurnId)})`);
	}
	if (!modifiedTurnId || modifiedTurnId.includes('/')) {
		throw new Error(`buildCompareTurnsChangesetUri: modifiedTurnId must be non-empty and not contain '/' (got ${JSON.stringify(modifiedTurnId)})`);
	}
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${COMPARE_CHANGESET_PREFIX}${originalTurnId}/${modifiedTurnId}`;
}

/**
 * Returns the subscribable URI for an opaque, producer-defined
 * `changesetId`. The id must not contain `/` — well-known multi-segment
 * shapes have dedicated builders (e.g. {@link buildTurnChangesetUri}).
 */
export function buildChangesetUri(sessionUri: URI, changesetId: string): URI {
	if (!changesetId) {
		throw new Error('buildChangesetUri: changesetId must be non-empty');
	}
	if (changesetId.includes('/')) {
		throw new Error(`buildChangesetUri: changesetId must not contain '/' (got ${JSON.stringify(changesetId)})`);
	}
	return `${sessionUri}${CHANGESET_PATH_SEGMENT}${changesetId}`;
}

/**
 * Parses a changeset URI back into its owner, containing session, id, and kind,
 * or returns `undefined` if `uri` is not a changeset URI we recognise.
 */
export function parseChangesetUri(uri: URI): { ownerUri: URI; sessionUri: URI; changesetId: string; kind: ChangesetKind; turnId?: string; originalTurnId?: string; modifiedTurnId?: string } | undefined {
	const idx = uri.lastIndexOf(CHANGESET_PATH_SEGMENT);
	if (idx < 0) {
		return undefined;
	}
	const changesetId = uri.slice(idx + CHANGESET_PATH_SEGMENT.length);
	if (!changesetId) {
		return undefined;
	}
	const ownerUri = uri.slice(0, idx);
	const sessionUri = parseFolderChangesetOwnerUri(ownerUri)?.sessionUri ?? parseChatUri(ownerUri)?.session ?? ownerUri;
	if (changesetId === BRANCH_CHANGESET_ID) {
		return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Branch };
	}
	if (changesetId === UNCOMMITTED_CHANGESET_ID) {
		return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Uncommitted };
	}
	if (changesetId === SESSION_CHANGESET_ID) {
		return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Session };
	}
	if (changesetId.startsWith(TURN_CHANGESET_PREFIX)) {
		const turnId = changesetId.slice(TURN_CHANGESET_PREFIX.length);
		// Reject the unexpanded template and any tail with extra segments.
		if (!turnId || turnId.includes('/') || turnId === TURN_TEMPLATE_VARIABLE) {
			return undefined;
		}
		return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Turn, turnId };
	}
	if (changesetId.startsWith(COMPARE_CHANGESET_PREFIX)) {
		const tail = changesetId.slice(COMPARE_CHANGESET_PREFIX.length);
		const parts = tail.split('/');
		// Reject anything that isn't exactly `<originalTurnId>/<modifiedTurnId>`,
		// and reject unexpanded template variables on either side.
		if (parts.length !== 2) {
			return undefined;
		}
		const [originalTurnId, modifiedTurnId] = parts;
		if (!originalTurnId || !modifiedTurnId
			|| originalTurnId === COMPARE_ORIGINAL_TEMPLATE_VARIABLE
			|| modifiedTurnId === COMPARE_MODIFIED_TEMPLATE_VARIABLE) {
			return undefined;
		}
		return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Compare, originalTurnId, modifiedTurnId };
	}
	if (changesetId.includes('/')) {
		return undefined;
	}
	return { ownerUri, sessionUri, changesetId, kind: ChangesetKind.Unknown };
}

/** Returns `true` iff `uri` looks like a changeset URI we recognise. */
export function isChangesetUri(uri: URI): boolean {
	return parseChangesetUri(uri) !== undefined;
}

/** Returns `true` iff `uri` is the session-wide changeset URI. */
export function isSessionChangesetUri(uri: URI): boolean {
	return parseChangesetUri(uri)?.kind === ChangesetKind.Session;
}

/** Returns `true` iff `uri` is the uncommitted-changes changeset URI. */
export function isUncommittedChangesetUri(uri: URI): boolean {
	return parseChangesetUri(uri)?.kind === ChangesetKind.Uncommitted;
}

/** Returns the parsed turn id when `uri` is a per-turn changeset URI. */
export function parseTurnChangesetUri(uri: URI): { sessionUri: URI; turnId: string } | undefined {
	const parsed = parseChangesetUri(uri);
	if (parsed?.kind !== ChangesetKind.Turn || parsed.turnId === undefined) {
		return undefined;
	}
	return { sessionUri: parsed.sessionUri, turnId: parsed.turnId };
}

/** Returns the parsed turn ids when `uri` is a compare-turns changeset URI. */
export function parseCompareTurnsChangesetUri(uri: URI): { sessionUri: URI; originalTurnId: string; modifiedTurnId: string } | undefined {
	const parsed = parseChangesetUri(uri);
	if (parsed?.kind !== ChangesetKind.Compare || parsed.originalTurnId === undefined || parsed.modifiedTurnId === undefined) {
		return undefined;
	}
	return { sessionUri: parsed.sessionUri, originalTurnId: parsed.originalTurnId, modifiedTurnId: parsed.modifiedTurnId };
}

/**
 * Builds the ordered changeset catalogue for a session or chat channel.
 * Aggregate counts are filled in later by the diff producer as compute passes
 * complete.
 *
 * Ready session channels advertise the cumulative Session Changes entry. The
 * default chat is created together with the session and owns the temporary
 * uncommitted entry while the session is being created, as well as its
 * repository and turn catalogue after materialization.
 *
 * The first two chat entries (`Branch Changes`, `Uncommitted Changes`) are
 * included only when Git state is available. The backing per-changeset states
 * are still registered for every owner; only the catalogue advertisement is
 * conditional.
 *
 * The Agent Merge entry is advertised by the chat that owns the enabled folder.
 * It uses the chat-owned compare-turns URI template because the repair range
 * belongs to that chat, and remains available after Agent Merge is disabled.
 * When chats share the folder, `resolveAgentMergeOwner` picks the one chat
 * whose transcript the repairs run in.
 * `branchChangesetOwnerUri` lets matching chat catalogues share one repository-level Branch Changes resource.
 */
export function buildDefaultChangesetCatalog(ownerUri: URI, state?: ISessionWithDefaultChat, branchChangesetOwnerUri: URI = ownerUri, resolveAgentMergeOwner?: (folderKey: string, recordedChat: URI | undefined) => URI | undefined): Changeset[] {
	// Session that failed to create
	if (!state || state.lifecycle === SessionLifecycle.Failed) {
		return [];
	}

	const chat = parseChatUri(ownerUri);
	if (!chat) {
		if (state.lifecycle === SessionLifecycle.Creating || readSessionWorkspaceless(state._meta)) {
			return [];
		}
		return [{
			label: sessionChangesetLabel(),
			description: sessionChangesetDescription(),
			uriTemplate: buildSessionChangesetUri(ownerUri),
			changeKind: ChangesetKind.Session,
		}];
	}

	// New Session
	if (state.lifecycle === SessionLifecycle.Creating) {
		if (readSessionWorkspaceless(state._meta)) {
			// Quick chat
			return [];
		}

		// Uncommitted changes
		return [{
			label: uncommittedChangesetLabel(),
			description: uncommittedChangesetDescription(),
			uriTemplate: buildUncommittedChangesetUri(ownerUri),
			changeKind: ChangesetKind.Uncommitted
		}];
	}

	const sessionUri = chat.session;
	const isDefaultChat = buildDefaultChatUri(sessionUri) === ownerUri;
	const gitState = readSessionGitState(state._meta);
	const agentMergeChangeset = shouldAdvertiseAgentMergeChangeset(ownerUri, state, isDefaultChat, resolveAgentMergeOwner)
		? [{
			label: agentMergeChangesetLabel(),
			description: agentMergeChangesetDescription(),
			uriTemplate: buildCompareTurnsChangesetUriTemplate(ownerUri),
			changeKind: AGENT_MERGE_CHANGESET_ID,
		}] satisfies Changeset[]
		: [];

	if (!gitState) {
		// No git repository
		return [{
			label: thisTurnChangesetLabel(),
			description: thisTurnChangesetDescription(),
			uriTemplate: buildTurnChangesetUriTemplate(ownerUri),
			changeKind: ChangesetKind.Turn
		},
		...agentMergeChangeset] satisfies Changeset[];
	}

	return [
		{
			label: branchChangesetLabel(),
			description: gitState
				? formatBranchChangesetDescription(gitState)
				: undefined,
			uriTemplate: buildBranchChangesetUri(branchChangesetOwnerUri),
			changeKind: ChangesetKind.Branch,
			capabilities: { review: {} }
		},
		{
			label: uncommittedChangesetLabel(),
			description: uncommittedChangesetDescription(),
			uriTemplate: buildUncommittedChangesetUri(ownerUri),
			changeKind: ChangesetKind.Uncommitted
		},
		{
			label: thisTurnChangesetLabel(),
			description: thisTurnChangesetDescription(),
			uriTemplate: buildTurnChangesetUriTemplate(ownerUri),
			changeKind: ChangesetKind.Turn
		},
		{
			label: compareTurnsChangesetLabel(),
			description: compareTurnsChangesetDescription(),
			uriTemplate: buildCompareTurnsChangesetUriTemplate(ownerUri),
			changeKind: ChangesetKind.Compare
		},
		...agentMergeChangeset
	] satisfies Changeset[];
}

function shouldAdvertiseAgentMergeChangeset(ownerUri: URI, state: ISessionWithDefaultChat, isDefaultChat: boolean, resolveAgentMergeOwner: ((folderKey: string, recordedChat: URI | undefined) => URI | undefined) | undefined): boolean {
	const folderKey = state.workingDirectories?.[0] ? getWorkingDirectoryKey(state.workingDirectories[0]) : undefined;
	if (!isDefaultChat && folderKey === undefined) {
		return false;
	}
	const sessionFolderKey = isDefaultChat ? folderKey : undefined;
	const folderState = readAgentMergeFolderState(state.config?.values, folderKey, sessionFolderKey);
	const ownsEnabledFolder = folderState?.enabled === true
		&& (folderKey === undefined || !resolveAgentMergeOwner || resolveAgentMergeOwner(folderKey, folderState.chat) === ownerUri);
	if (ownsEnabledFolder || state.changesets?.some(changeset => changeset.changeKind === AGENT_MERGE_CHANGESET_ID)) {
		return true;
	}

	return state.turns.some(turn =>
		(turn.message.origin.kind === MessageKind.SystemNotification && isAgentMergeMessage(turn.message))
		|| turn.responseParts.some(part =>
			part.kind === ResponsePartKind.SystemNotification
			&& readAgentSystemNotificationMeta(part).kind === AgentSystemNotificationKind.AgentMergeEnabled));
}
