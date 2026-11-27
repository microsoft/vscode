/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, ParseError } from '../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname, IExtUri } from '../../../../base/common/resources.js';
import { hasKey, isObject } from '../../../../base/common/types.js';
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
	/** Whether invalid folder entries, or folder paths that are ambiguous in a remote workspace, were skipped. */
	readonly hasErrors: boolean;
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
const REMOTE_AUTHORITY_PROPERTY = 'remoteAuthority';
const SHOWN_PROPERTIES = new Set([NAME_PROPERTY, ICON_PROPERTY, COLOR_PROPERTY, FOLDERS_PROPERTY, REMOTE_AUTHORITY_PROPERTY]);

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

/**
 * Parses a `.code-workspace` file, throwing when it is not a valid workspace file. Invalid folder entries are skipped, and
 * so are folder paths in a local file of a remote workspace, which are paths on the remote and not on this computer.
 */
export function parseSessionWorkspaceFile(content: string, uri: URI, extUri: IExtUri, options?: { readonly remoteAuthority?: string }): ISessionWorkspaceFileContent {
	const { stored, folders, skipped } = readWorkspaceFile(content, uri, options?.remoteAuthority);
	return { ...readWorkspaceFileMetadata(stored, uri), folders: toWorkspaceFolders(folders, uri, extUri).map(folder => folder.uri), hasErrors: skipped.length > 0 };
}

/**
 * Whether a local `.code-workspace` file has folder paths without saying which computer they are on: they are paths on a
 * remote when VS Code opened the file in one, so only VS Code's recently opened list tells.
 */
export function hasAmbiguousFolderPaths(content: string, uri: URI): boolean {
	const { folders, remotePaths } = readWorkspaceFile(content, uri, undefined);
	return uri.scheme === Schemas.file && !remotePaths && folders.some(folder => hasKey(folder, { path: true }));
}

/**
 * Whether a `.code-workspace` file has properties that the Agents window does not show, such as settings, launch
 * configurations or tasks, which deleting the file would lose. Throws when it is not a valid workspace file.
 */
export function hasOtherWorkspaceFileProperties(content: string, uri: URI): boolean {
	return Object.keys(readWorkspaceFile(content, uri, undefined).stored).some(key => !SHOWN_PROPERTIES.has(key));
}

/**
 * Whether a `.code-workspace` file gives `folder` a name of its own, which `${workspaceFolder:name}` variables refer to
 * and which a standalone folder cannot keep. Throws when it is not a valid workspace file.
 */
export function hasWorkspaceFolderName(content: string, uri: URI, folder: URI, extUri: IExtUri): boolean {
	return toWorkspaceFolders(readWorkspaceFile(content, uri, undefined).folders, uri, extUri).some(candidate => !!candidate.raw?.name && extUri.isEqual(candidate.uri, folder));
}

interface IParsedWorkspaceFile {
	readonly stored: { readonly name?: unknown; readonly icon?: unknown; readonly color?: unknown };
	readonly folders: IStoredWorkspaceFolder[];
	/** The folder entries that are not read: invalid ones, and paths in a local file of a remote workspace. */
	readonly skipped: unknown[];
	/** Whether folder paths in the file are paths on a remote and not on this computer. */
	readonly remotePaths: boolean;
}

function readWorkspaceFile(content: string, uri: URI, remoteAuthorityOverride: string | undefined): IParsedWorkspaceFile {
	const invalid = () => new Error(localize('invalidWorkspaceFile', "'{0}' is not a valid workspace file.", basename(uri)));
	const errors: ParseError[] = [];
	const stored: { folders?: unknown; remoteAuthority?: unknown; name?: unknown; icon?: unknown; color?: unknown } | undefined = parse(content, errors);
	if (errors.length || !isObject(stored) || !Array.isArray(stored.folders)) {
		throw invalid();
	}
	const remoteAuthority = remoteAuthorityOverride || (typeof stored.remoteAuthority === 'string' ? stored.remoteAuthority : undefined);
	const remotePaths = uri.scheme === Schemas.file && !!remoteAuthority;
	const folders: IStoredWorkspaceFolder[] = [];
	const skipped: unknown[] = [];
	for (const folder of stored.folders) {
		if (!isStoredWorkspaceFolder(folder) || (remotePaths && hasKey(folder, { path: true }))) {
			skipped.push(folder);
			continue;
		}
		if (hasKey(folder, { uri: true })) {
			try {
				URI.parse(folder.uri, true);
			} catch {
				throw invalid();
			}
		}
		folders.push(folder);
	}
	return { stored, folders, skipped, remotePaths };
}

/**
 * Applies `edit` to the content of a `.code-workspace` file, keeping its comments, settings and other properties. Folders
 * are written relative to the file unless `forceAbsolute` is set, and the folder entries that are not read are kept after
 * them. In a local file of a remote workspace, where a folder path is a path on the remote, folders are written as URIs.
 * Throws when the existing content or the result is not a valid workspace file, so that an invalid file is never written.
 * `remoteAuthority` is the remote that VS Code opened the file in, when it is not in the file itself.
 */
export function stringifySessionWorkspaceFile(uri: URI, edit: ISessionWorkspaceFileEdit, extUri: IExtUri, options?: { readonly existing?: string; readonly forceAbsolute?: boolean; readonly remoteAuthority?: string }): string {
	const existing = options?.existing !== undefined ? readWorkspaceFile(options.existing, uri, options.remoteAuthority) : undefined;
	let content = options?.existing ?? '{}';
	if (edit.folders) {
		const configFolder = dirname(uri);
		// Folders keep the names given to them in the file, which `${workspaceFolder:name}` variables refer to
		const names = new Map<string, string>();
		for (const folder of existing ? toWorkspaceFolders(existing.folders, uri, extUri) : []) {
			if (folder.raw?.name) {
				names.set(extUri.getComparisonKey(folder.uri), folder.raw.name);
			}
		}
		const folders: unknown[] = [
			...edit.folders.map(folder => {
				const name = names.get(extUri.getComparisonKey(folder));
				return existing?.remotePaths || (!existing && uri.scheme === Schemas.file && options?.remoteAuthority)
					? { ...(name ? { name } : {}), uri: folder.toString(true) }
					: getStoredWorkspaceFolder(folder, !!options?.forceAbsolute, name, configFolder, extUri);
			}),
			...existing?.skipped ?? [],
		];
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
	content = content.endsWith('\n') ? content : `${content}\n`;
	parseSessionWorkspaceFile(content, uri, extUri);
	return content;
}
