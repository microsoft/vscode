/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, IReader, ITransaction } from '../../../../base/common/observable.js';
import { ContributionEnablementState, IEnablementModel, isContributionEnabled } from '../../chat/common/enablement.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpCollectionDefinition } from './mcpTypes.js';

/**
 * Key under which the workspace-level decision for the class of
 * workspace-configured MCP servers is stored in the MCP enablement model.
 * Server definition ids always contain a `.` or `/` separator, so a bare word
 * cannot collide with one.
 */
export const WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY = 'workspaceServers';

/**
 * Gates MCP servers discovered from workspace configuration behind the
 * `chat.mcp.workspaceServersEnabled` setting.
 *
 * The setting is the Global decision for the whole class of workspace servers;
 * a workspace can override it with {@link setWorkspaceServersEnabled}, which is
 * stored in workspace-scoped storage under {@link WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY},
 * never in a file the repository controls.
 *
 * While the class is disabled, a workspace server is disabled unless it has an
 * explicit workspace-scoped decision of its own. A per-server Profile decision
 * cannot re-enable it: the server's definition id is derived from its position
 * and name, so a Profile decision would apply to same-named definitions in
 * every workspace. Servers from user, extension, plugin and built-in sources
 * are passed through unchanged.
 */
export class WorkspaceMcpServersEnablementModel implements IEnablementModel {

	private readonly _workspaceServerIds: IObservable<ReadonlySet<string>>;

	constructor(
		private readonly _base: IEnablementModel,
		registry: IMcpRegistry,
		private readonly _workspaceServersEnabledSetting: IObservable<boolean>,
	) {
		this._workspaceServerIds = derived(this, reader => {
			const ids = new Set<string>();
			for (const collection of registry.collections.read(reader)) {
				if (!McpCollectionDefinition.isWorkspaceDiscovered(collection)) {
					continue;
				}
				for (const server of collection.serverDefinitions.read(reader)) {
					ids.add(server.id);
				}
			}
			return ids;
		});
	}

	/** Whether `key` identifies a server discovered from workspace configuration. */
	isWorkspaceServer(key: string, reader?: IReader): boolean {
		return this._workspaceServerIds.read(reader).has(key);
	}

	/**
	 * The effective decision for the class of workspace servers: an explicit
	 * workspace decision wins, otherwise the setting decides.
	 */
	readWorkspaceServersEnabled(reader?: IReader): ContributionEnablementState {
		const state = this._base.readEnabled(WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY, reader);
		if (state === ContributionEnablementState.EnabledWorkspace || state === ContributionEnablementState.DisabledWorkspace) {
			return state;
		}
		return this._workspaceServersEnabledSetting.read(reader)
			? ContributionEnablementState.EnabledProfile
			: ContributionEnablementState.DisabledProfile;
	}

	/**
	 * Overrides the setting for the current workspace. A decision that matches
	 * the setting, or `undefined`, clears the override so the setting applies
	 * again; like the agent host, the toggle never leaves a redundant override
	 * behind that would outlive a later change of the setting.
	 */
	setWorkspaceServersEnabled(enabled: boolean | undefined, tx?: ITransaction): void {
		if (enabled === undefined || enabled === this._workspaceServersEnabledSetting.get()) {
			this._base.remove(WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY);
			return;
		}
		this._base.setEnabled(WORKSPACE_MCP_SERVERS_ENABLEMENT_KEY, enabled ? ContributionEnablementState.EnabledWorkspace : ContributionEnablementState.DisabledWorkspace, tx);
	}

	readEnabled(key: string, reader?: IReader): ContributionEnablementState {
		const state = this._base.readEnabled(key, reader);
		if (!this.isWorkspaceServer(key, reader)) {
			return state;
		}
		if (state === ContributionEnablementState.EnabledWorkspace || state === ContributionEnablementState.DisabledWorkspace) {
			return state;
		}
		const classState = this.readWorkspaceServersEnabled(reader);
		return isContributionEnabled(classState) ? state : classState;
	}

	readProfileEnabled(key: string, reader?: IReader): boolean {
		return this._base.readProfileEnabled(key, reader);
	}

	canSetEnabled(key: string, state: ContributionEnablementState): boolean {
		if (this._base.canSetEnabled?.(key, state) === false) {
			return false;
		}
		if (state !== ContributionEnablementState.EnabledProfile || !this.isWorkspaceServer(key)) {
			return true;
		}
		// A Profile decision cannot override the class gate, so offering it would be a no-op.
		return isContributionEnabled(this.readWorkspaceServersEnabled());
	}

	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void {
		this._base.setEnabled(key, state, tx);
	}

	setDefaultEnabled(key: string, enabled: boolean, tx?: ITransaction): void {
		this._base.setDefaultEnabled?.(key, enabled, tx);
	}

	remove(key: string): void {
		this._base.remove(key);
	}
}
