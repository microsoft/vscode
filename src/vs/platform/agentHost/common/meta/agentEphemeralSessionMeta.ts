/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** VS Code-owned request metadata indicating a throwaway chat surface. */
export const VSCODE_EPHEMERAL_SESSION_META_KEY = 'vscode.chat.ephemeralSession';

/**
 * Host-owned metadata marking an ephemeral session as a hidden draft that is
 * promoted into a durable session on first send. Drafts stay out of the
 * session catalog like other ephemeral sessions, but keep full session
 * capabilities because the promoted session reuses their runtime.
 */
export const VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY = 'vscode.chat.promotableDraftSession';

interface IHasEphemeralSessionMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Typed view over VS Code's ephemeral-session request metadata. */
export interface IEphemeralSessionMeta {
	readonly isEphemeral?: boolean;
	/** Whether an ephemeral session is a promotable draft. See {@link VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY}. */
	readonly isPromotableDraft?: boolean;
}

/** Reads recognized ephemeral-session metadata, dropping wrong-typed values. */
export function readEphemeralSessionMeta(source: IHasEphemeralSessionMeta): IEphemeralSessionMeta {
	const value = source._meta?.[VSCODE_EPHEMERAL_SESSION_META_KEY];
	if (typeof value !== 'boolean') {
		return {};
	}
	return value && source._meta?.[VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY] === true
		? { isEphemeral: value, isPromotableDraft: true }
		: { isEphemeral: value };
}

/** Marks an ephemeral metadata bag as a promotable draft. */
export function withPromotableDraftSessionMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...(meta ?? {}), [VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY]: true };
}

/** Adds VS Code's ephemeral-session metadata to an open request metadata bag. */
export function withEphemeralSessionMeta(meta: Record<string, unknown> | undefined, isEphemeral: boolean | undefined): Record<string, unknown> | undefined {
	if (isEphemeral === undefined) {
		return meta;
	}
	return { ...(meta ?? {}), [VSCODE_EPHEMERAL_SESSION_META_KEY]: isEphemeral };
}

/** Removes VS Code's ephemeral-session and promotable-draft markers from a metadata bag. */
export function withoutEphemeralSessionMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!meta || (meta[VSCODE_EPHEMERAL_SESSION_META_KEY] === undefined && meta[VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY] === undefined)) {
		return meta;
	}
	const result = { ...meta };
	delete result[VSCODE_EPHEMERAL_SESSION_META_KEY];
	delete result[VSCODE_PROMOTABLE_DRAFT_SESSION_META_KEY];
	return Object.keys(result).length > 0 ? result : undefined;
}
