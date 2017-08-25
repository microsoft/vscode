/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { FileStat, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';

/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
const explorerViewletVisibleId = 'explorerViewletVisible';
const filesExplorerFocusId = 'filesExplorerFocus';
const openEditorsVisibleId = 'openEditorsVisible';
const openEditorsFocusId = 'openEditorsFocus';
const explorerViewletFocusId = 'explorerViewletFocus';
const explorerResourceIsFolderId = 'explorerResourceIsFolder';

export const ExplorerViewletVisibleContext = new RawContextKey<boolean>(explorerViewletVisibleId, true);
export const ExplorerFolderContext = new RawContextKey<boolean>(explorerResourceIsFolderId, false);
export const FilesExplorerFocusedContext = new RawContextKey<boolean>(filesExplorerFocusId, false);
export const OpenEditorsVisibleContext = new RawContextKey<boolean>(openEditorsVisibleId, false);
export const OpenEditorsFocusedContext = new RawContextKey<boolean>(openEditorsFocusId, false);
export const ExplorerFocusedContext = new RawContextKey<boolean>(explorerViewletFocusId, false);

export const OpenEditorsVisibleCondition = ContextKeyExpr.has(openEditorsVisibleId);
export const FilesExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(filesExplorerFocusId));
export const ExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(explorerViewletFocusId));

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';

export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
			dynamicHeight: boolean;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
		sortOrder: SortOrder;
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory?: boolean;
}

/**
 * Helper to get an explorer item from an object.
 */
export function explorerItemToFileResource(obj: FileStat | OpenEditor): IFileResource {
	if (obj instanceof FileStat) {
		const stat = obj as FileStat;

		return {
			resource: stat.resource,
			isDirectory: stat.isDirectory
		};
	}

	if (obj instanceof OpenEditor) {
		const editor = obj as OpenEditor;
		const resource = editor.getResource();
		if (resource && resource.scheme === 'file') {
			return {
				resource: editor.getResource()
			};
		}
	}

	return null;
}

export const SortOrderConfiguration = {
	DEFAULT: 'default',
	MIXED: 'mixed',
	FILES_FIRST: 'filesFirst',
	TYPE: 'type',
	MODIFIED: 'modified'
};

export type SortOrder = 'default' | 'mixed' | 'filesFirst' | 'type' | 'modified';