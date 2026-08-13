/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { DiffEditorInput } from '../../../../../workbench/common/editor/diffEditorInput.js';
import { FileEditorInput } from '../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';

const MARKDOWN_EDITOR_VIEW_TYPES = new Set([
	'markdown.preview',
	'vscode.markdown.editor',
	'vscode.markdown.preview.editor',
]);

/** Whether every group in the main editor part is empty (used by both the detail-panel and side-pane-visibility logic to detect an empty side pane). */
export function isMainPartEmpty(editorGroupsService: IEditorGroupsService): boolean {
	for (const group of editorGroupsService.mainPart.groups) {
		if (!group.isEmpty) {
			return false;
		}
	}
	return true;
}

/** Whether `editor` is (or shows) a managed Changes multi-diff for some session. Shared by the New/Existing detail-panel mapping. */
export function isChangesEditorInput(editor: EditorInput, sessionChangesService: ISessionChangesService): boolean {
	if (editor instanceof DiffEditorInput || editor instanceof MultiDiffEditorInput) {
		return true;
	}
	const resource = editor.resource;
	return !!resource && sessionChangesService.getSessionResource(resource) !== undefined;
}

/** Whether `editor` is a file-like editor (the empty Files placeholder, a real file, or a markdown preview). Shared by the New/Existing detail-panel mapping. */
export function isFileEditorInput(editor: EditorInput): boolean {
	if (editor instanceof WebviewInput) {
		return MARKDOWN_EDITOR_VIEW_TYPES.has(editor.viewType) || MARKDOWN_EDITOR_VIEW_TYPES.has(editor.providerId ?? '');
	}
	return editor instanceof EmptyFileEditorInput || editor instanceof FileEditorInput;
}
