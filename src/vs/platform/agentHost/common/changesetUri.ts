/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import type { ChangesetSummary, URI } from './state/sessionState.js';

/**
 * Helpers for building / parsing the URI clients subscribe to in order to
 * receive a {@link import('./state/protocol/state.js').ChangesetState}.
 *
 * Shapes recognised by this module:
 *
 *     <sessionUri>/changeset/uncommitted
 *     <sessionUri>/changeset/session
 *     <sessionUri>/changeset/turn/<turnId>
 *     <sessionUri>/changeset/compare/<originalTurnId>/<modifiedTurnId>
 *
 * Catalogue entries on `summary.changesets` may also advertise the
 * URI-template forms `<sessionUri>/changeset/turn/{turnId}` and
 * `<sessionUri>/changeset/compare/{originalTurnId}/{modifiedTurnId}`;
 * clients expand the template before subscribing.
 *
 * Keeping changeset URIs nested under the session URI namespace lets the
 * server cleanly tear down every changeset for a session when that session
 * is disposed (the reverse-lookup is just a string-prefix scan).
 */

/** Stable id of the catalogue entry for the session-wide changeset. */
const SESSION_CHANGESET_ID = 'session';

/** Stable id of the catalogue entry for the uncommitted-changes changeset. */
const UNCOMMITTED_CHANGESET_ID = 'uncommitted';

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

/** Localized human-readable label for the session-wide changeset entry. */
export const sessionChangesetLabel = (): string => localize('branchChangeset.label', "Branch Changes");

/** Localized human-readable label for the uncommitted-changes changeset entry. */
export const uncommittedChangesetLabel = (): string => localize('uncommittedChangeset.label', "Uncommitted Changes");

/** Localized human-readable description for the uncommitted-changes changeset entry. */
export const uncommittedChangesetDescription = (): string => localize('uncommittedChangeset.description', "Show uncommitted changes in this session");

/**
 * Returns the description shown next to the `Branch Changes` catalogue
 * entry. When both `branchName` and `baseBranchName` are known
 * (typical worktree-isolation case), formats as `${branchName} → ${baseBranchName}`.
 * Falls back to `branchName` alone when the base branch is unknown
 * (non-worktree session, or a session whose working copy has no
 * `refs/remotes/origin/HEAD`). Returns `undefined` only when no branch
 * name is known at all, so callers can omit the description entirely.
 */
export function formatSessionChangesetDescription(branchName: string | undefined, baseBranchName: string | undefined): string | undefined {
	if (!branchName || !baseBranchName) {
		return branchName;
	}
	if (branchName === baseBranchName) {
		return branchName;
	}
	return `${branchName} → ${baseBranchName}`;
}

/** Marker injected into a changeset URI's path. */
const CHANGESET_PATH_SEGMENT = '/changeset/';

/** Discriminates the well-known changeset URI shapes. */
export const enum ChangesetKind {
	Session = 'session',
	Uncommitted = 'uncommitted',
	Turn = 'turn',
	Compare = 'compare',
	/** Producer-defined id we don't recognise (single-segment only). */
	Unknown = 'unknown',
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
 * Parses a changeset URI back into `(sessionUri, changesetId, kind)`,
 * or returns `undefined` if `uri` is not a changeset URI we recognise.
 */
export function parseChangesetUri(uri: URI): { sessionUri: URI; changesetId: string; kind: ChangesetKind; turnId?: string; originalTurnId?: string; modifiedTurnId?: string } | undefined {
	const idx = uri.lastIndexOf(CHANGESET_PATH_SEGMENT);
	if (idx < 0) {
		return undefined;
	}
	const changesetId = uri.slice(idx + CHANGESET_PATH_SEGMENT.length);
	if (!changesetId) {
		return undefined;
	}
	const sessionUri = uri.slice(0, idx);
	if (changesetId === SESSION_CHANGESET_ID) {
		return { sessionUri, changesetId, kind: ChangesetKind.Session };
	}
	if (changesetId === UNCOMMITTED_CHANGESET_ID) {
		return { sessionUri, changesetId, kind: ChangesetKind.Uncommitted };
	}
	if (changesetId.startsWith(TURN_CHANGESET_PREFIX)) {
		const turnId = changesetId.slice(TURN_CHANGESET_PREFIX.length);
		// Reject the unexpanded template and any tail with extra segments.
		if (!turnId || turnId.includes('/') || turnId === TURN_TEMPLATE_VARIABLE) {
			return undefined;
		}
		return { sessionUri, changesetId, kind: ChangesetKind.Turn, turnId };
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
		return { sessionUri, changesetId, kind: ChangesetKind.Compare, originalTurnId, modifiedTurnId };
	}
	if (changesetId.includes('/')) {
		return undefined;
	}
	return { sessionUri, changesetId, kind: ChangesetKind.Unknown };
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
 * Builds the default ordered `summary.changesets` catalogue for a
 * session (`Branch Changes`, `Uncommitted Changes`, `This Turn`) with
 * label + uriTemplate only. Aggregate counts are filled in later by the
 * diff producer as compute passes complete.
 *
 * The first two entries (`Branch Changes`, `Uncommitted Changes`) are
 * git-only; `AgentService._attachGitState` strips them asynchronously
 * for sessions whose working directory is not a git repo. The backing
 * per-changeset states are still registered for every session — only
 * the catalogue advertisements are stripped.
 *
 * The compare-turns changeset (built by
 * {@link buildCompareTurnsChangesetUri}) is intentionally NOT included
 * in the default catalogue: it is subscribe-only. Clients that want
 * compare-turns diffs construct the URI themselves from two known
 * turn ids and subscribe directly.
 */
export function buildDefaultChangesetCatalogue(sessionUri: URI): ChangesetSummary[] {
	return [
		{ label: sessionChangesetLabel(), uriTemplate: buildSessionChangesetUri(sessionUri) },
		{ label: uncommittedChangesetLabel(), uriTemplate: buildUncommittedChangesetUri(sessionUri), description: uncommittedChangesetDescription() }
	];
}
