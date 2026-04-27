/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { basename } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IChatFolderMruService } from '../common/folderRepositoryManager';
import { folderMRUToChatProviderOptions, getSelectedOption, toWorkspaceFolderOptionItem } from './sessionOptionGroupBuilder';

const permissionModes: ReadonlySet<PermissionMode> = new Set<PermissionMode>(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']);

export function isPermissionMode(value: string): value is PermissionMode {
	return permissionModes.has(value as PermissionMode);
}

export const PERMISSION_MODE_OPTION_ID = 'permissionMode';
export const FOLDER_OPTION_ID = 'folder';
const MAX_MRU_ENTRIES = 10;

/**
 * Builds and reads chat session option groups (permission mode, folder picker).
 * Pure construction logic with no metadata or session-state dependencies — the
 * controller resolves session-specific values and delegates here.
 */
export class ClaudeSessionOptionBuilder {
	private _lastUsedPermissionMode: PermissionMode = 'acceptEdits';

	get lastUsedPermissionMode(): PermissionMode {
		return this._lastUsedPermissionMode;
	}

	constructor(
		private readonly _configurationService: IConfigurationService,
		private readonly _folderMruService: IChatFolderMruService,
		private readonly _workspaceService: IWorkspaceService,
	) { }

	async buildNewSessionGroups(): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const groups: vscode.ChatSessionProviderOptionGroup[] = [];

		const folderGroup = await this.buildNewFolderGroup();
		if (folderGroup) {
			groups.push(folderGroup);
		}

		const permissionGroup = this.buildPermissionModeGroup();
		const selectedPermission = permissionGroup.items.find(i => i.id === this._lastUsedPermissionMode);
		groups.push({
			...permissionGroup,
			selected: selectedPermission ?? permissionGroup.items[0],
		});

		return groups;
	}

	async buildExistingSessionGroups(permissionMode: PermissionMode, folderUri: URI | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const groups: vscode.ChatSessionProviderOptionGroup[] = [];

		if (folderUri) {
			groups.push(this.buildExistingFolderGroup(folderUri));
		}

		const permissionGroup = this.buildPermissionModeGroup();
		const selectedItem = permissionGroup.items.find(i => i.id === permissionMode) ?? permissionGroup.items[0];
		groups.push({
			...permissionGroup,
			selected: selectedItem,
		});

		return groups;
	}

	buildPermissionModeGroup(): vscode.ChatSessionProviderOptionGroup {
		const bypassEnabled = this._configurationService.getConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions);
		return buildPermissionModeItems(bypassEnabled);
	}

	async buildNewFolderGroup(): Promise<vscode.ChatSessionProviderOptionGroup | undefined> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			return undefined;
		}

		const folderItems = await this.getFolderOptionItems();
		return {
			id: FOLDER_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: folderItems,
			selected: folderItems[0],
		};
	}

	buildExistingFolderGroup(folderUri: URI): vscode.ChatSessionProviderOptionGroup {
		const folderItem: vscode.ChatSessionProviderOptionItem = {
			...toWorkspaceFolderOptionItem(folderUri, this._workspaceService.getWorkspaceFolderName(folderUri) || basename(folderUri)),
			locked: true,
		};
		return {
			id: FOLDER_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: [folderItem],
			selected: folderItem,
		};
	}

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

	/**
	 * Reads the current selections from option groups and updates
	 * {@link lastUsedPermissionMode} as a side-effect.
	 */
	getSelections(groups: readonly vscode.ChatSessionProviderOptionGroup[]): { permissionMode?: PermissionMode; folderUri?: URI } {
		const selectedPermission = getSelectedOption(groups, PERMISSION_MODE_OPTION_ID);
		let permissionMode: PermissionMode | undefined;
		if (selectedPermission && isPermissionMode(selectedPermission.id)) {
			this._lastUsedPermissionMode = selectedPermission.id;
			permissionMode = selectedPermission.id;
		}

		const selectedFolder = getSelectedOption(groups, FOLDER_OPTION_ID);
		const folderUri = selectedFolder ? URI.file(selectedFolder.id) : undefined;

		return { permissionMode, folderUri };
	}
}

// #region Pure group-building functions (observable-friendly)

/**
 * Build the permission mode option group from explicit inputs.
 * Pure and synchronous — suitable for use in `derived` computations.
 */
export function buildPermissionModeItems(bypassEnabled: boolean): vscode.ChatSessionProviderOptionGroup {
	const items: vscode.ChatSessionProviderOptionItem[] = [
		{ id: 'default', name: l10n.t('Ask before edits'), slashCommand: 'ask' },
		{ id: 'acceptEdits', name: l10n.t('Edit automatically'), slashCommand: 'edit' },
		{ id: 'plan', name: l10n.t('Plan mode'), slashCommand: 'plan' },
	];

	if (bypassEnabled) {
		items.push({ id: 'bypassPermissions', name: l10n.t('Bypass all permissions'), slashCommand: 'yolo' });
	}

	return {
		id: PERMISSION_MODE_OPTION_ID,
		name: l10n.t('Permission Mode'),
		description: l10n.t('Pick Permission Mode'),
		items,
		kind: 'permissions',
	};
}

// #endregion
