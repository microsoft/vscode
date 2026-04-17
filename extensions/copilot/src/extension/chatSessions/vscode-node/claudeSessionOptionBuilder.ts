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
import { Emitter } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
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

// #region Permission Mode Builder

/**
 * Builds permission mode option groups for Claude sessions.
 * Stateless except for tracking the last-used permission mode.
 */
export class ClaudePermissionModeBuilder {
	private _lastUsedPermissionMode: PermissionMode = 'acceptEdits';

	get lastUsedPermissionMode(): PermissionMode {
		return this._lastUsedPermissionMode;
	}

	constructor(
		private readonly _configurationService: IConfigurationService,
	) { }

	buildPermissionModeGroup(): vscode.ChatSessionProviderOptionGroup {
		const items: vscode.ChatSessionProviderOptionItem[] = [
			{ id: 'default', name: l10n.t('Ask before edits') },
			{ id: 'acceptEdits', name: l10n.t('Edit automatically') },
			{ id: 'plan', name: l10n.t('Plan mode') },
		];

		if (this._configurationService.getConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions)) {
			items.push({ id: 'bypassPermissions', name: l10n.t('Bypass all permissions') });
		}

		return {
			id: PERMISSION_MODE_OPTION_ID,
			name: l10n.t('Permission Mode'),
			description: l10n.t('Pick Permission Mode'),
			items,
		};
	}

	buildNewSessionGroup(previousInputState: vscode.ChatSessionInputState | undefined): vscode.ChatSessionProviderOptionGroup {
		const permissionGroup = this.buildPermissionModeGroup();
		const previousPermission = previousInputState ? getSelectedOption(previousInputState.groups, PERMISSION_MODE_OPTION_ID) : undefined;
		const selectedPermissionId = previousPermission?.id ?? this._lastUsedPermissionMode;
		const selectedPermission = permissionGroup.items.find(i => i.id === selectedPermissionId);
		return {
			...permissionGroup,
			selected: selectedPermission ?? permissionGroup.items[0],
		};
	}

	buildExistingSessionGroup(permissionMode: PermissionMode): vscode.ChatSessionProviderOptionGroup {
		const permissionGroup = this.buildPermissionModeGroup();
		// `dontAsk` is an SDK-level mode that maps to `acceptEdits` in the UI
		const normalizedMode = permissionMode === 'dontAsk' ? 'acceptEdits' : permissionMode;
		const selectedItem = permissionGroup.items.find(i => i.id === normalizedMode) ?? permissionGroup.items[0];
		return {
			...permissionGroup,
			selected: selectedItem,
		};
	}

	/**
	 * Reads the selected permission mode from groups and updates
	 * {@link lastUsedPermissionMode} as a side-effect.
	 */
	getSelectedPermissionMode(groups: readonly vscode.ChatSessionProviderOptionGroup[]): PermissionMode | undefined {
		const selectedPermission = getSelectedOption(groups, PERMISSION_MODE_OPTION_ID);
		if (selectedPermission && isPermissionMode(selectedPermission.id)) {
			this._lastUsedPermissionMode = selectedPermission.id;
			return selectedPermission.id;
		}
		return undefined;
	}
}

// #endregion

// #region Folder Option Builder

/**
 * Builds folder-picking option groups for Claude sessions.
 * Shaped similarly to the Copilot CLI's {@link ISessionOptionGroupBuilder}:
 * methods that take/return option group arrays and can operate on
 * `state.groups` via {@link handleInputStateChange} and {@link rebuildInputState}.
 *
 * Designed to be used behind a proxy so it can freely own the groups it
 * operates on without conflicting with other builders (e.g. permission mode).
 */
export class ClaudeFolderOptionBuilder {

	constructor(
		private readonly _folderMruService: IChatFolderMruService,
		private readonly _workspaceService: IWorkspaceService,
	) { }

	/**
	 * Build folder groups for a new session.
	 * Returns the full groups array (containing zero or one folder group).
	 */
	async provideFolderOptionGroups(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const folderGroup = await this._buildNewFolderGroup(previousInputState);
		return folderGroup ? [folderGroup] : [];
	}

	/**
	 * Build folder groups for an existing session (locked).
	 */
	buildExistingFolderGroups(folderUri: URI | undefined): vscode.ChatSessionProviderOptionGroup[] {
		if (!folderUri) {
			return [];
		}
		return [this._buildExistingFolderGroup(folderUri)];
	}

	/**
	 * Handle an input state change for the folder groups.
	 * Mirrors the shape of {@link ISessionOptionGroupBuilder.handleInputStateChange}
	 * so that the folder builder can be swapped with the CLI's builder in the future.
	 * Currently a no-op because the Claude folder picker has no dependent dropdowns
	 * to cascade (unlike the CLI builder which updates branch/isolation).
	 */
	async handleInputStateChange(_state: vscode.ChatSessionInputState): Promise<void> {
	}

	/**
	 * Full rebuild of folder groups.
	 * Mirrors the shape of {@link ISessionOptionGroupBuilder.rebuildInputState}.
	 * Completely replaces `state.groups` with freshly built folder groups.
	 */
	async rebuildInputState(state: vscode.ChatSessionInputState): Promise<void> {
		state.groups = await this.provideFolderOptionGroups(state);
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
	 * Read the selected folder from groups.
	 */
	getSelectedFolder(groups: readonly vscode.ChatSessionProviderOptionGroup[]): URI | undefined {
		const selectedFolder = getSelectedOption(groups, FOLDER_OPTION_ID);
		return selectedFolder ? URI.file(selectedFolder.id) : undefined;
	}

	private async _buildNewFolderGroup(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup | undefined> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			return undefined;
		}

		const folderItems = await this.getFolderOptionItems();
		const previousFolder = previousInputState ? getSelectedOption(previousInputState.groups, FOLDER_OPTION_ID) : undefined;
		const defaultFolderId = previousFolder?.id ?? folderItems[0]?.id;
		const selectedItem = defaultFolderId ? folderItems.find(i => i.id === defaultFolderId) : undefined;
		return {
			id: FOLDER_OPTION_ID,
			name: l10n.t('Folder'),
			description: l10n.t('Pick Folder'),
			items: folderItems,
			selected: selectedItem ?? folderItems[0],
		};
	}

	private _buildExistingFolderGroup(folderUri: URI): vscode.ChatSessionProviderOptionGroup {
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
}

// #endregion

// #region Proxy Input State

/**
 * Creates a proxy {@link vscode.ChatSessionInputState} that presents an
 * isolated view of `groups` to the folder builder.
 *
 * The folder builder can freely read/write `proxyState.groups` — it only
 * sees (and mutates) the folder-related groups. When it writes, the
 * orchestrator is notified via {@link onDidProxyGroupsChange} so it can
 * re-assemble the full groups array on the real state.
 */
export function createFolderBuilderProxy(
	realState: vscode.ChatSessionInputState,
	folderGroups: vscode.ChatSessionProviderOptionGroup[],
): { proxyState: vscode.ChatSessionInputState; onDidProxyGroupsChange: vscode.Event<void>; dispose: () => void } {
	const onDidProxyGroupsChangeEmitter = new Emitter<void>();
	let currentFolderGroups = folderGroups;

	const proxyState: vscode.ChatSessionInputState = {
		get groups(): readonly vscode.ChatSessionProviderOptionGroup[] {
			return currentFolderGroups;
		},
		set groups(value: readonly vscode.ChatSessionProviderOptionGroup[]) {
			currentFolderGroups = [...value];
			onDidProxyGroupsChangeEmitter.fire();
		},
		get sessionResource() {
			return realState.sessionResource;
		},
		onDidChange: realState.onDidChange,
	};

	return {
		proxyState,
		onDidProxyGroupsChange: onDidProxyGroupsChangeEmitter.event,
		dispose: () => onDidProxyGroupsChangeEmitter.dispose(),
	};
}

/**
 * Extract folder groups from a full groups array.
 */
export function extractFolderGroups(groups: readonly vscode.ChatSessionProviderOptionGroup[]): vscode.ChatSessionProviderOptionGroup[] {
	return groups.filter(g => g.id === FOLDER_OPTION_ID);
}

/**
 * Extract non-folder groups (e.g., permission mode) from a full groups array.
 */
export function extractNonFolderGroups(groups: readonly vscode.ChatSessionProviderOptionGroup[]): vscode.ChatSessionProviderOptionGroup[] {
	return groups.filter(g => g.id !== FOLDER_OPTION_ID);
}

// #endregion

// #region Orchestrating Option Builder

/**
 * Orchestrator that combines {@link ClaudePermissionModeBuilder} and
 * {@link ClaudeFolderOptionBuilder} into a single interface.
 *
 * The folder builder operates on a proxy state so it can freely own its
 * groups without conflicting with the permission mode builder. The
 * orchestrator assembles the final result from both builders.
 *
 * This class maintains the same public API as the original
 * `ClaudeSessionOptionBuilder` for backward compatibility.
 */
export class ClaudeSessionOptionBuilder {
	private readonly _permissionBuilder: ClaudePermissionModeBuilder;
	private readonly _folderBuilder: ClaudeFolderOptionBuilder;

	get lastUsedPermissionMode(): PermissionMode {
		return this._permissionBuilder.lastUsedPermissionMode;
	}

	get permissionBuilder(): ClaudePermissionModeBuilder {
		return this._permissionBuilder;
	}

	get folderBuilder(): ClaudeFolderOptionBuilder {
		return this._folderBuilder;
	}

	constructor(
		configurationService: IConfigurationService,
		folderMruService: IChatFolderMruService,
		workspaceService: IWorkspaceService,
	) {
		this._permissionBuilder = new ClaudePermissionModeBuilder(configurationService);
		this._folderBuilder = new ClaudeFolderOptionBuilder(folderMruService, workspaceService);
	}

	async buildNewSessionGroups(previousInputState: vscode.ChatSessionInputState | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const folderGroups = await this._folderBuilder.provideFolderOptionGroups(previousInputState);
		const permissionGroup = this._permissionBuilder.buildNewSessionGroup(previousInputState);
		return [...folderGroups, permissionGroup];
	}

	async buildExistingSessionGroups(permissionMode: PermissionMode, folderUri: URI | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		const folderGroups = this._folderBuilder.buildExistingFolderGroups(folderUri);
		const permissionGroup = this._permissionBuilder.buildExistingSessionGroup(permissionMode);
		return [...folderGroups, permissionGroup];
	}

	buildPermissionModeGroup(): vscode.ChatSessionProviderOptionGroup {
		return this._permissionBuilder.buildPermissionModeGroup();
	}

	async getDefaultFolder(): Promise<URI | undefined> {
		return this._folderBuilder.getDefaultFolder();
	}

	/**
	 * Reads the current selections from option groups and updates
	 * {@link lastUsedPermissionMode} as a side-effect.
	 */
	getSelections(groups: readonly vscode.ChatSessionProviderOptionGroup[]): { permissionMode?: PermissionMode; folderUri?: URI } {
		const permissionMode = this._permissionBuilder.getSelectedPermissionMode(groups);
		const folderUri = this._folderBuilder.getSelectedFolder(groups);
		return { permissionMode, folderUri };
	}

	/**
	 * Create a proxy state for the folder builder that isolates its groups
	 * from the rest. When the folder builder writes to the proxy's groups,
	 * the callback re-assembles the full groups array on the real state.
	 *
	 * @param realState The real input state whose groups contain all option groups.
	 * @returns A proxy state to pass to the folder builder's mutation methods,
	 *   and a disposable to clean up the proxy's internal emitter.
	 */
	createFolderProxy(realState: vscode.ChatSessionInputState): { proxyState: vscode.ChatSessionInputState; dispose: IDisposable } {
		const folderGroups = extractFolderGroups(realState.groups);
		const { proxyState, onDidProxyGroupsChange, dispose } = createFolderBuilderProxy(realState, folderGroups);

		const subscription = onDidProxyGroupsChange(() => {
			const nonFolderGroups = extractNonFolderGroups(realState.groups);
			const newFolderGroups = [...proxyState.groups];
			// Assemble: place folder groups first, followed by the remaining non-folder groups.
			realState.groups = [...newFolderGroups, ...nonFolderGroups];
		});

		return {
			proxyState,
			dispose: { dispose: () => { subscription.dispose(); dispose(); } },
		};
	}
}

// #endregion
