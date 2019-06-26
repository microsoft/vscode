/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';

export const IHistoryService = createDecorator<IHistoryService>('historyService');

export interface IHistoryService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Re-opens the last closed editor if any.
	 */
	reopenLastClosedEditor(): void;

	/**
	 * Navigates to the last location where an edit happened.
	 */
	openLastEditLocation(): void;

	/**
	 * Navigate forwards in history.
	 *
	 * @param acrossEditors instructs the history to skip navigation entries that
	 * are only within the same document.
	 */
	forward(acrossEditors?: boolean): void;

	/**
	 * Navigate backwards in history.
	 *
	 * @param acrossEditors instructs the history to skip navigation entries that
	 * are only within the same document.
	 */
	back(acrossEditors?: boolean): void;

	/**
	 * Navigate forward or backwards to previous entry in history.
	 */
	last(): void;

	/**
	 * Removes an entry from history.
	 */
	remove(input: IEditorInput | IResourceInput): void;

	/**
	 * Clears all history.
	 */
	clear(): void;

	/**
	 * Clear list of recently opened editors.
	 */
	clearRecentlyOpened(): void;

	/**
	 * Get the entire history of opened editors.
	 */
	getHistory(): Array<IEditorInput | IResourceInput>;

	/**
	 * Looking at the editor history, returns the workspace root of the last file that was
	 * inside the workspace and part of the editor history.
	 *
	 * @param schemeFilter filter to restrict roots by scheme.
	 */
	getLastActiveWorkspaceRoot(schemeFilter?: string): URI | undefined;

	/**
	 * Looking at the editor history, returns the resource of the last file that was opened.
	 *
	 * @param schemeFilter filter to restrict roots by scheme.
	 */
	getLastActiveFile(schemeFilter: string): URI | undefined;
}
