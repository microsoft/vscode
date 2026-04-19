/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IChatFolderMruService } from '../common/folderRepositoryManager';
import { folderMRUToChatProviderOptions, getSelectedOption, toWorkspaceFolderOptionItem } from './sessionOptionGroupBuilder';

export const FOLDER_OPTION_ID = 'folder';
const MAX_MRU_ENTRIES = 10;

/**
 * Builds and manages folder option groups for Claude chat sessions.
 *
 * Shaped to match the pattern of {@link ISessionOptionGroupBuilder}:
 * the builder fully owns `state.groups` in its mutation methods
 * (`rebuildInputState`, `lockInputStateGroups`). Callers that need to
 * combine these groups with other option groups (e.g. permission mode)
 * should use a proxy state — see {@link ClaudeSessionOptionBuilder}.
 */
export class ClaudeFolderOptionBuilder {
	constructor(
		private readonly _folderMruService: IChatFolderMruService,
		private readonly _workspaceService: IWorkspaceService,
	) { }

	// #region ISessionOptionGroupBuilder-shaped methods

	/**
	 * Build initial folder option groups for a new session.
	 * Returns an empty array when no folder picker is needed (single-root workspace).
	 */
	async provideChatSessionProviderOptionGroups(
		previousInputState: vscode.ChatSessionInputState | undefined,
	): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			return [];
		}

		const folderItems = await this.getFolderOptionItems();
		const previousFolder = previousInputState
			? getSelectedOption(previousInputState.groups, FOLDER_OPTION_ID)
			: undefined;
		const defaultFolderId = previousFolder?.id ?? folderItems[0]?.id;
		const selectedItem = defaultFolderId
			? folderItems.find(i => i.id === defaultFolderId)
			: undefined;

		return [{
			id: FOLDER_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: folderItems,
			selected: selectedItem ?? folderItems[0],
		}];
	}

	/**
	 * Full rebuild of folder groups on the given state.
	 * Freely replaces `state.groups` — callers should use a proxy state
	 * if other groups need to be preserved.
	 */
	async rebuildInputState(state: vscode.ChatSessionInputState): Promise<void> {
		state.groups = await this.provideChatSessionProviderOptionGroups(state);
	}

	/**
	 * Lock all groups on the given state (make them readonly).
	 * Freely mutates `state.groups`.
	 */
	lockInputStateGroups(state: vscode.ChatSessionInputState): void {
		state.groups = state.groups.map(group => ({
			...group,
			items: group.items.map(item => ({ ...item, locked: true })),
			selected: group.selected ? { ...group.selected, locked: true } : undefined,
		}));
	}

	/**
	 * Build locked folder groups for an existing session.
	 */
	buildExistingSessionGroups(folderUri: URI): vscode.ChatSessionProviderOptionGroup[] {
		const folderItem: vscode.ChatSessionProviderOptionItem = {
			...toWorkspaceFolderOptionItem(
				folderUri,
				this._workspaceService.getWorkspaceFolderName(folderUri) || basename(folderUri),
			),
			locked: true,
		};
		return [{
			id: FOLDER_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: [folderItem],
			selected: folderItem,
		}];
	}

	// #endregion

	// #region Folder Resolution

	async getFolderOptionItems(): Promise<vscode.ChatSessionProviderOptionItem[]> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 0) {
			const mruEntries = await this._folderMruService.getRecentlyUsedFolders(CancellationToken.None);
			return folderMRUToChatProviderOptions(mruEntries).slice(0, MAX_MRU_ENTRIES);
		}
		return workspaceFolders.map(folder =>
			toWorkspaceFolderOptionItem(folder, this._workspaceService.getWorkspaceFolderName(folder))
		);
	}

	async getDefaultFolder(): Promise<URI | undefined> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length > 0) {
			return workspaceFolders[0];
		}
		const mru = await this._folderMruService.getRecentlyUsedFolders(CancellationToken.None);
		if (mru.length > 0) {
			return mru[0].folder;
		}
		return undefined;
	}

	// #endregion
}
