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
 *
 * Catalogue entries on `summary.changesets` may also advertise the
 * URI-template form `<sessionUri>/changeset/turn/{turnId}`; clients
 * expand the template before subscribing.
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

/** Localized human-readable label for the session-wide changeset entry. */
export const sessionChangesetLabel = (): string => localize('sessionChangeset.label', "Session Changes");

/** Localized human-readable label for the uncommitted-changes changeset entry. */
export const uncommittedChangesetLabel = (): string => localize('uncommittedChangeset.label', "Uncommitted Changes");

/** Localized human-readable label for the per-turn changeset template entry. */
export const thisTurnChangesetLabel = (): string => localize('thisTurnChangeset.label', "This Turn");

/** Marker injected into a changeset URI's path. */
const CHANGESET_PATH_SEGMENT = '/changeset/';

/** Discriminates the well-known changeset URI shapes. */
export const enum ChangesetKind {
	Session = 'session',
	Uncommitted = 'uncommitted',
	Turn = 'turn',
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
export function parseChangesetUri(uri: URI): { sessionUri: URI; changesetId: string; kind: ChangesetKind; turnId?: string } | undefined {
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

/**
 * Builds the default ordered `summary.changesets` catalogue for a
 * session (`Uncommitted Changes`, `Session Changes`, `This Turn`) with
 * label + uriTemplate only. Aggregate counts are filled in later by the
 * diff producer as compute passes complete; clients MUST treat
 * `summary.changesets[0]` as the default rather than singling out an id.
 *
 * Catalogue shape is immutable for the session's lifetime — only the
 * per-entry stats update over time.
 */
export function buildDefaultChangesetCatalogue(sessionUri: URI): ChangesetSummary[] {
	return [
		{ label: uncommittedChangesetLabel(), uriTemplate: buildUncommittedChangesetUri(sessionUri) },
		{ label: sessionChangesetLabel(), uriTemplate: buildSessionChangesetUri(sessionUri) },
		{ label: thisTurnChangesetLabel(), uriTemplate: buildTurnChangesetUriTemplate(sessionUri) },
	];
}
