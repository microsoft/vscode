/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IHasWorkingSetFileMeta {
	readonly _meta?: Record<string, unknown>;
}

/**
 * Names a version of a file's changes in a Working Set changeset. The VS Code
 * agent host publishes it on each file of a Working Set, and a client sends
 * the version it showed with an operation on the file, so the host refuses
 * to accept or discard changes the client didn't show.
 */
const WORKING_SET_VERSION_META_KEY = 'vscode.workingSetVersion';

/**
 * Marks a file of a Working Set changeset that an agent's edit tool call is
 * writing. Clients disable keeping and undoing its changes meanwhile, as
 * local chat edits do while they stream into a file.
 */
const WORKING_SET_EDITING_META_KEY = 'vscode.workingSetEditing';

/** Returns `meta` with `version` as the Working Set file version, keeping its other entries. */
export function withWorkingSetVersion(meta: Record<string, unknown> | undefined, version: string): Record<string, unknown> {
	return { ...meta, [WORKING_SET_VERSION_META_KEY]: version };
}

/** Reads and validates the Working Set file version of a changeset file or an operation request. */
export function readWorkingSetVersion(source: IHasWorkingSetFileMeta): string | undefined {
	const version = source._meta?.[WORKING_SET_VERSION_META_KEY];
	return typeof version === 'string' && version.length > 0 ? version : undefined;
}

/** Returns `meta` marking whether an agent is editing the file, keeping its other entries. */
export function withWorkingSetFileEditing(meta: Record<string, unknown> | undefined, editing: boolean): Record<string, unknown> {
	if (editing) {
		return { ...meta, [WORKING_SET_EDITING_META_KEY]: true };
	}
	const { [WORKING_SET_EDITING_META_KEY]: _editing, ...rest } = meta ?? {};
	return rest;
}

/** Whether a Working Set file is marked as being edited by an agent; absent metadata means it isn't. */
export function isWorkingSetFileEditing(source: IHasWorkingSetFileMeta): boolean {
	return source._meta?.[WORKING_SET_EDITING_META_KEY] === true;
}
