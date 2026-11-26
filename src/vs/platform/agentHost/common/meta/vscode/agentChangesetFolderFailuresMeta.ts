/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code-owned session metadata listing, per changeset, the working directories of a changeset of several folders whose
 * changes the host could not compute. The changeset publishes the changes of the other folders; a listed folder's
 * changes are absent from it. Keyed by changeset URI. A changeset whose folders all loaded, or whose owner has one folder,
 * is not listed; absent metadata, from another or an older host, means no folder failed that the host reports.
 */
export const VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY = 'vscode.changesetFolderFailures';

/** A working directory whose changes a changeset could not compute. */
export interface IChangesetFolderFailure {
	/** The host working-directory URI. */
	readonly folder: string;
	/** A localized reason for the user. */
	readonly message: string;
	/** The underlying error, when known. */
	readonly detail?: string;
}

const MAX_CHANGESETS = 64;
const MAX_FOLDERS = 64;
/** The metadata is sent with every session state change, so reasons stay short. */
const MAX_TEXT_LENGTH = 1024;

function toBoundedFailure({ folder, message, detail }: IChangesetFolderFailure): IChangesetFolderFailure {
	return {
		folder,
		message: message.slice(0, MAX_TEXT_LENGTH),
		...(detail ? { detail: detail.slice(0, MAX_TEXT_LENGTH) } : {}),
	};
}

function isFolderFailure(value: unknown): value is IChangesetFolderFailure {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const { folder, message, detail } = value as Record<string, unknown>;
	return typeof folder === 'string' && folder.length > 0 && typeof message === 'string' && (detail === undefined || typeof detail === 'string');
}

/** Reads the failed folders of every changeset, dropping malformed entries. */
export function readChangesetFolderFailures(meta: Record<string, unknown> | undefined): Readonly<Record<string, readonly IChangesetFolderFailure[]>> {
	const value = meta?.[VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const result: Record<string, readonly IChangesetFolderFailure[]> = {};
	for (const [changeset, failures] of Object.entries(value).slice(0, MAX_CHANGESETS)) {
		if (Array.isArray(failures)) {
			const valid = failures.slice(0, MAX_FOLDERS).filter(isFolderFailure).map(toBoundedFailure);
			if (valid.length) {
				result[changeset] = valid;
			}
		}
	}
	return result;
}

/**
 * Returns `meta` with `failures` as the failed folders of `changeset`, removing its entry when there are none, and the
 * entries of the changesets `replaces` matches, such as the earlier turns of a chat.
 */
export function withChangesetFolderFailures(meta: Record<string, unknown> | undefined, changeset: string, failures: readonly IChangesetFolderFailure[], replaces?: (changeset: string) => boolean): Record<string, unknown> | undefined {
	const others = Object.fromEntries(Object.entries(readChangesetFolderFailures(meta)).filter(([key]) => key !== changeset && !replaces?.(key)));
	const next = failures.length ? { ...others, [changeset]: failures.slice(0, MAX_FOLDERS).map(toBoundedFailure) } : others;
	if (!Object.keys(next).length) {
		if (meta?.[VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY] === undefined) {
			return meta;
		}
		const { [VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY]: _removed, ...rest } = meta;
		return rest;
	}
	return { ...meta, [VSCODE_CHANGESET_FOLDER_FAILURES_META_KEY]: next };
}
