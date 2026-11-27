/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { GroupIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';

export const IHistoryService = createDecorator<IHistoryService>('historyService');

export const MOUSE_BACK_FORWARD_NAVIGATION_SETTING = 'workbench.editor.mouseBackForwardToNavigate';

/**
 * Limit editor navigation to certain kinds.
 */
export const enum GoFilter {

	/**
	 * Navigate between editor navigation history
	 * entries from any kind of navigation source.
	 */
	NONE,

	/**
	 * Only navigate between editor navigation history
	 * entries that were resulting from edits.
	 */
	EDITS,

	/**
	 * Only navigate between editor navigation history
	 * entries that were resulting from navigations, such
	 * as "Go to definition".
	 */
	NAVIGATION
}

/**
 * Limit editor navigation to certain scopes.
 */
export const enum GoScope {

	/**
	 * Navigate across all editors and editor groups.
	 */
	DEFAULT,

	/**
	 * Navigate only in editors of the active editor group.
	 */
	EDITOR_GROUP,

	/**
	 * Navigate only in the active editor.
	 */
	EDITOR
}

export interface IHistoryService {

	readonly _serviceBrand: undefined;

	/**
	 * Navigate forwards in editor navigation history.
	 */
	goForward(filter?: GoFilter): Promise<void>;

	/**
	 * Navigate backwards in editor navigation history.
	 */
	goBack(filter?: GoFilter): Promise<void>;

	/**
	 * Navigate between the current editor navigtion history entry
	 * and the previous one that was navigated to. This commands is
	 * like a toggle for `forward` and `back` to jump between 2 points
	 * in editor navigation history.
	 */
	goPrevious(filter?: GoFilter): Promise<void>;

	/**
	 * Navigate to the last entry in editor navigation history.
	 */
	goLast(filter?: GoFilter): Promise<void>;

	/**
	 * Re-opens the last closed editor if any.
	 */
	reopenLastClosedEditor(): Promise<void>;

	/**
	 * Get the entire history of editors that were opened.
	 */
	getHistory(): readonly (EditorInput | IResourceEditorInput)[];

	/**
	 * Removes an entry from history.
	 */
	removeFromHistory(input: EditorInput | IResourceEditorInput): void;

	/**
	 * Looking at the editor history, returns the workspace root of the last file that was
	 * inside the workspace and part of the editor history.
	 *
	 * @param schemeFilter filter to restrict roots by scheme.
	 */
	getLastActiveWorkspaceRoot(schemeFilter?: string, authorityFilter?: string): URI | undefined;

	/**
	 * Looking at the editor history, returns the resource of the last file that was opened.
	 *
	 * @param schemeFilter filter to restrict roots by scheme.
	 */
	getLastActiveFile(schemeFilter: string, authorityFilter?: string): URI | undefined;

	/**
	 * Opens the next used editor if any.
	 *
	 * @param group optional indicator to scope to a specific group.
	 */
	openNextRecentlyUsedEditor(group?: GroupIdentifier): Promise<void>;

	/**
	 * Opens the previously used editor if any.
	 *
	 * @param group optional indicator to scope to a specific group.
	 */
	openPreviouslyUsedEditor(group?: GroupIdentifier): Promise<void>;

	/**
	 * Clears all history.
	 */
	clear(): void;

	/**
	 * Clear list of recently opened editors. Also forgets the list that {@link saveRecentlyOpened} saved,
	 * unless `keepSaved` is set, so that {@link restoreRecentlyOpened} can bring it back.
	 */
	clearRecentlyOpened(options?: { readonly keepSaved?: boolean }): void;

	/**
	 * Saves the list of recently opened editors, so that {@link restoreRecentlyOpened} brings it back if
	 * {@link clearRecentlyOpened} clears it with `keepSaved` in the meantime. The saved list survives a restart of the window.
	 * Saving again replaces it.
	 */
	saveRecentlyOpened(): void;

	/**
	 * Brings back the list of recently opened editors that {@link saveRecentlyOpened} saved, if the list was
	 * cleared since, and forgets the saved list. Keeps the current list when it wasn't cleared or nothing was saved.
	 * The list is saved in the storage of the current workspace only: restore it before the window switches to
	 * another workspace's storage.
	 */
	restoreRecentlyOpened(): void;
}
