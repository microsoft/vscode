/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, ParseError } from '../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { basename, dirname, IExtUri } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WORKSPACE_SUFFIX } from '../../../../platform/workspace/common/workspace.js';
import { getStoredWorkspaceFolder, IStoredWorkspaceFolder, isStoredWorkspaceFolder, toWorkspaceFolders } from '../../../../platform/workspaces/common/workspaces.js';

/** The name, icon and color stored in a `.code-workspace` file. */
export interface ISessionWorkspaceFileMetadata {
	/** The `name` property, or else the file name without its suffix, as VS Code names the workspace. */
	readonly name: string;
	readonly icon?: string;
	readonly color?: string;
}

/** The content of a `.code-workspace` file that the Agents window reads. */
export interface ISessionWorkspaceFileContent extends ISessionWorkspaceFileMetadata {
	readonly folders: URI[];
}

/** Edits to a `.code-workspace` file; omitted fields are unchanged and `null` removes the property. */
export interface ISessionWorkspaceFileEdit {
	readonly name?: string;
	readonly folders?: readonly URI[];
	readonly icon?: string | null;
	readonly color?: string | null;
}

const NAME_PROPERTY = 'name';
const ICON_PROPERTY = 'icon';
const COLOR_PROPERTY = 'color';
const FOLDERS_PROPERTY = 'folders';

const formattingOptions: FormattingOptions = { insertSpaces: false, tabSize: 4, eol: '\n' };

function readStringProperty(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** The file name of a `.code-workspace` file without its suffix. */
export function getWorkspaceFileBasename(uri: URI): string {
	const name = basename(uri);
	return name.endsWith(WORKSPACE_SUFFIX) ? name.slice(0, -WORKSPACE_SUFFIX.length) : name;
}

/** Reads the name, icon and color of a parsed `.code-workspace` file. */
export function readWorkspaceFileMetadata(stored: { readonly name?: unknown; readonly icon?: unknown; readonly color?: unknown }, uri: URI): ISessionWorkspaceFileMetadata {
	const icon = readStringProperty(stored.icon);
	const color = readStringProperty(stored.color);
	return { name: readStringProperty(stored.name) ?? getWorkspaceFileBasename(uri), ...(icon ? { icon } : {}), ...(color ? { color } : {}) };
}

/** Parses a `.code-workspace` file, throwing when it is not a valid workspace file. Invalid folder entries are skipped. */
export function parseSessionWorkspaceFile(content: string, uri: URI, extUri: IExtUri): ISessionWorkspaceFileContent {
	const errors: ParseError[] = [];
	const stored: { folders?: unknown; name?: unknown; icon?: unknown; color?: unknown } | undefined = parse(content, errors);
	if (errors.length || !isObject(stored) || !Array.isArray(stored.folders)) {
		throw new Error(localize('invalidWorkspaceFile', "'{0}' is not a valid workspace file.", basename(uri)));
	}
	const folders = toWorkspaceFolders(stored.folders.filter(isStoredWorkspaceFolder), uri, extUri).map(folder => folder.uri);
	return { ...readWorkspaceFileMetadata(stored, uri), folders };
}

/**
 * Applies `edit` to the content of a `.code-workspace` file, keeping its comments, settings and other properties. Folders
 * are written relative to the file unless `forceAbsolute` is set.
 */
export function stringifySessionWorkspaceFile(uri: URI, edit: ISessionWorkspaceFileEdit, extUri: IExtUri, options?: { readonly existing?: string; readonly forceAbsolute?: boolean }): string {
	let content = options?.existing?.trim() ? options.existing : '{}';
	if (edit.folders) {
		const configFolder = dirname(uri);
		const folders: IStoredWorkspaceFolder[] = edit.folders.map(folder => getStoredWorkspaceFolder(folder, !!options?.forceAbsolute, undefined, configFolder, extUri));
		content = applyEdits(content, setProperty(content, [FOLDERS_PROPERTY], folders, formattingOptions));
	}
	if (edit.name !== undefined) {
		content = applyEdits(content, setProperty(content, [NAME_PROPERTY], edit.name, formattingOptions));
	}
	if (edit.icon !== undefined) {
		content = applyEdits(content, setProperty(content, [ICON_PROPERTY], edit.icon ?? undefined, formattingOptions));
	}
	if (edit.color !== undefined) {
		content = applyEdits(content, setProperty(content, [COLOR_PROPERTY], edit.color ?? undefined, formattingOptions));
	}
	return content.endsWith('\n') ? content : `${content}\n`;
}
