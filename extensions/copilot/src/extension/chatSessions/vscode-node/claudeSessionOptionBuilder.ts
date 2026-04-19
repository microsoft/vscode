/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { URI } from '../../../util/vs/base/common/uri';
import { IChatFolderMruService } from '../common/folderRepositoryManager';
import { ClaudeFolderOptionBuilder } from './claudeFolderOptionBuilder';

const permissionModes: ReadonlySet<PermissionMode> = new Set<PermissionMode>(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']);

export function isPermissionMode(value: string): value is PermissionMode {
	return permissionModes.has(value as PermissionMode);
}

export const PERMISSION_MODE_OPTION_ID = 'permissionMode';

/**
 * Orchestrates chat session option groups by combining permission mode
 * (managed directly) with folder groups (delegated to
 * {@link ClaudeFolderOptionBuilder} via a proxy state pattern).
 *
 * The folder builder freely owns `state.groups` in its mutation methods,
 * so this class creates a proxy state that filters out the permission
 * mode group before delegating, then reassembles the full set of groups
 * from both sources.
 *
 * ## Migration plan
 *
 * The {@link ClaudeFolderOptionBuilder} is shaped to match
 * {@link ISessionOptionGroupBuilder} (used by the Copilot CLI provider).
 * The next step is to replace it with the CLI's
 * {@link SessionOptionGroupBuilder}, which manages three groups
 * (isolation, repository, branch) instead of one. The proxy pattern
 * here ensures that builder can freely own `state.groups` without
 * conflicting with the permission mode group that this orchestrator
 * manages separately.
 */
export class ClaudeSessionOptionBuilder {
	private readonly _folderOptionBuilder: ClaudeFolderOptionBuilder;

	constructor(
		private readonly _configurationService: IConfigurationService,
		folderMruService: IChatFolderMruService,
		workspaceService: IWorkspaceService,
	) {
		this._folderOptionBuilder = new ClaudeFolderOptionBuilder(folderMruService, workspaceService);
	}

	async buildNewSessionGroups(previousInputState?: vscode.ChatSessionInputState): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		// Build folder groups via proxy — the folder builder sees only its own groups
		const folderProxyState = previousInputState
			? this._createFolderProxy(previousInputState)
			: undefined;
		const folderGroups = await this._folderOptionBuilder.provideChatSessionProviderOptionGroups(folderProxyState);

		// Build permission mode group with selection
		const permissionGroup = this.buildPermissionModeGroup();
		const previousPermissionId = previousInputState?.groups
			.find(g => g.id === PERMISSION_MODE_OPTION_ID)?.selected?.id;
		const selectedPermissionId = previousPermissionId ?? 'acceptEdits';
		const selectedPermission = permissionGroup.items.find(i => i.id === selectedPermissionId);

		return [
			...folderGroups,
			{ ...permissionGroup, selected: selectedPermission ?? permissionGroup.items[0] },
		];
	}

	async buildExistingSessionGroups(permissionMode: PermissionMode, folderUri: URI | undefined): Promise<vscode.ChatSessionProviderOptionGroup[]> {
		// Build folder groups (no proxy needed — no previous state to filter)
		const folderGroups = folderUri
			? this._folderOptionBuilder.buildExistingSessionGroups(folderUri)
			: [];

		// Build permission mode group with selection
		const permissionGroup = this.buildPermissionModeGroup();
		const selectedItem = permissionGroup.items.find(i => i.id === permissionMode) ?? permissionGroup.items[0];

		return [
			...folderGroups,
			{ ...permissionGroup, selected: selectedItem },
		];
	}

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

	async getDefaultFolder(): Promise<URI | undefined> {
		return this._folderOptionBuilder.getDefaultFolder();
	}

	// #region Proxy

	/**
	 * Creates a proxy input state that only contains the groups managed by
	 * the folder option builder (i.e. everything except the permission mode
	 * group). The folder builder can freely operate on `state.groups` in
	 * this proxy without affecting the permission mode group.
	 */
	private _createFolderProxy(
		realState: vscode.ChatSessionInputState,
	): vscode.ChatSessionInputState {
		return {
			...realState,
			groups: realState.groups.filter(g => g.id !== PERMISSION_MODE_OPTION_ID),
		};
	}

	// #endregion
}
