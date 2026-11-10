/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { IReader } from '../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { CustomEditorInput } from '../../../../../workbench/contrib/customEditor/browser/customEditorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { CanvasInput } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { ISessionChangesService } from '../../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../../../workbench/contrib/sessions/browser/emptyFileEditorInput.js';
import { ISessionWorkspace, isWorkspacelessQuickChat } from '../../../../../workbench/services/sessions/common/session.js';
import { IShownChat } from '../../../../../workbench/services/sessions/common/sessionPane.js';
import { WindowCanvasInput } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';

const PULL_REQUEST_OVERVIEW_VIEW_TYPE = 'PullRequestOverview';
const ISSUE_OVERVIEW_VIEW_TYPE = 'IssueOverview';

/** Whether every group in the main editor part is empty (used by both the detail-panel and side-pane-visibility logic to detect an empty side pane). */
export function isMainPartEmpty(editorGroupsService: IEditorGroupsService): boolean {
	for (const group of editorGroupsService.mainPart.groups) {
		if (!group.isEmpty) {
			return false;
		}
	}
	return true;
}

/** Whether the main window lays `shown` out as a Quick Chat: a workspace-less chat of a quick chat. */
export function isQuickChatShown(shown: IShownChat | undefined, reader?: IReader): boolean {
	return !!shown && isWorkspacelessQuickChat(shown.session, shown.chat, reader);
}

/**
 * The workspace the main window lays `shown` out for: its session's, or, for a chat of a quick chat, which works in a
 * folder of its own rather than in its session's, the chat's.
 */
export function getLayoutWorkspace(shown: IShownChat, reader?: IReader): ISessionWorkspace | undefined {
	const isQuickChat = shown.session.isQuickChat ? (reader ? shown.session.isQuickChat.read(reader) : shown.session.isQuickChat.get()) : false;
	const workspace = isQuickChat ? shown.chat.workspace : shown.session.workspace;
	return reader ? workspace.read(reader) : workspace.get();
}

/** Whether `editor` is (or shows) a managed Changes multi-diff for some session. Shared by the New/Existing detail-panel mapping. */
export function isChangesEditorInput(editor: EditorInput, sessionChangesService: ISessionChangesService): boolean {
	const resource = editor.resource;
	return !!resource && sessionChangesService.getSessionResource(resource) !== undefined;
}

/** How Files details apply to an editor in the active session workspace. */
export const enum FilesDetailsState {
	Unavailable,
	Available,
	Active,
}

/** Classifies whether Files details apply to `editor` for the active session workspace. */
export function getFilesDetailsState(editor: EditorInput, workspace: ISessionWorkspace): FilesDetailsState {
	if (editor instanceof EmptyFileEditorInput) {
		return FilesDetailsState.Active;
	}
	const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
	if (!resource) {
		return FilesDetailsState.Unavailable;
	}
	const matchingSchemeFolders = workspace.folders.filter(folder => folder.workingDirectory.scheme === resource.scheme);
	if (matchingSchemeFolders.length === 0) {
		return FilesDetailsState.Unavailable;
	}
	return matchingSchemeFolders.some(folder => isEqualOrParent(resource, folder.workingDirectory))
		? FilesDetailsState.Active
		: FilesDetailsState.Available;
}

/** Whether `editor` owns its full presentation and must hide the docked Details panel. */
export function isEditorWithoutDockedDetails(editor: EditorInput): boolean {
	return editor instanceof BrowserEditorInput
		|| editor instanceof CanvasInput
		|| editor instanceof WindowCanvasInput
		|| (editor instanceof CustomEditorInput && editor.resource?.scheme !== Schemas.untitled)
		|| (editor instanceof WebviewInput
			&& (editor.viewType === PULL_REQUEST_OVERVIEW_VIEW_TYPE
				|| editor.providerId === PULL_REQUEST_OVERVIEW_VIEW_TYPE
				|| editor.viewType === ISSUE_OVERVIEW_VIEW_TYPE
				|| editor.providerId === ISSUE_OVERVIEW_VIEW_TYPE));
}
