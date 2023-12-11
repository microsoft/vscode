/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { URI } from 'vs/base/common/uri';

export const IHistoryService = createDecorator<IHistoryService>('historyService');

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
	 * Clear list of recently opened editors.
	 */
	clearRecentlyOpened(): void;
}
