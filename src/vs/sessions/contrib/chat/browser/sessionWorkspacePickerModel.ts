/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ITabDescriptor } from '../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { IRecentWorkspace, isWorktreeWorkspaceUri } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';

export interface ISessionWorkspacePickerCatalog {
	readonly tabs: readonly ITabDescriptor[];
	readonly workspaces: readonly IRecentWorkspace[];
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly defaultWorkspace: IRecentWorkspace | undefined;
}

export interface ISessionWorkspacePickerCatalogOptions {
	readonly providers: readonly ISessionsProvider[];
	readonly recentWorkspaces?: readonly IRecentWorkspace[];
	readonly ownRecentWorkspaces?: readonly IRecentWorkspace[];
	readonly localBrowseAction?: ISessionWorkspaceBrowseAction;
	readonly remoteAgentHostsEnabled: boolean;
	readonly activeGroup?: string;
	readonly canUseProvider?: (providerId: string) => boolean;
	readonly isProviderUnavailable?: (providerId: string) => boolean;
}

/**
 * Builds the provider/recent-workspace portion of the Sessions workspace picker.
 * Presentation-specific commands and remote-host management rows remain owned by
 * the picker, while other Sessions surfaces can reuse the canonical tabs,
 * recency, browse-action, and restored-selection rules.
 */
export function buildSessionWorkspacePickerCatalog(options: ISessionWorkspacePickerCatalogOptions): ISessionWorkspacePickerCatalog {
	const providerIds = new Set(options.providers.map(provider => provider.id));
	const tabs = getAvailableTabs(options.providers, options.remoteAgentHostsEnabled);
	const filterByActiveGroup = !!options.activeGroup && tabs.length > 1;
	const workspaces = (options.recentWorkspaces ?? [])
		.filter(recent => providerIds.has(recent.providerId))
		.filter(recent => !filterByActiveGroup || recent.workspace.group === options.activeGroup);
	const browseActions = [
		...(options.localBrowseAction ? [options.localBrowseAction] : []),
		...options.providers.flatMap(provider => provider.browseActions),
	].filter(action => !filterByActiveGroup || action.group === options.activeGroup);

	return {
		tabs,
		workspaces,
		browseActions,
		defaultWorkspace: getDefaultWorkspace(options),
	};
}

function getAvailableTabs(providers: readonly ISessionsProvider[], remoteAgentHostsEnabled: boolean): ITabDescriptor[] {
	const byLabel = new Map<string, ITabDescriptor>();
	if (remoteAgentHostsEnabled) {
		byLabel.set(SESSION_WORKSPACE_GROUP_REMOTE, {
			id: SESSION_WORKSPACE_GROUP_REMOTE,
			icon: Codicon.beaker,
			tooltip: `${SESSION_WORKSPACE_GROUP_REMOTE} (${localize('workspacePicker.experimental', "Experimental")})`,
		});
	}
	for (const provider of providers) {
		if (provider.supportsLocalWorkspaces && !byLabel.has(SESSION_WORKSPACE_GROUP_LOCAL)) {
			byLabel.set(SESSION_WORKSPACE_GROUP_LOCAL, { id: SESSION_WORKSPACE_GROUP_LOCAL });
		}
		for (const action of provider.browseActions) {
			if (action.group === SESSION_WORKSPACE_GROUP_REMOTE && !remoteAgentHostsEnabled) {
				continue;
			}
			if (action.group && !byLabel.has(action.group)) {
				byLabel.set(action.group, { id: action.group });
			}
		}
	}
	return [...byLabel.values()].sort((a, b) =>
		a.id === SESSION_WORKSPACE_GROUP_LOCAL ? -1
			: b.id === SESSION_WORKSPACE_GROUP_LOCAL ? 1
				: a.id.localeCompare(b.id));
}

function getDefaultWorkspace(options: ISessionWorkspacePickerCatalogOptions): IRecentWorkspace | undefined {
	const canUseProvider = options.canUseProvider ?? (() => true);
	const checked = options.ownRecentWorkspaces?.find(recent => {
		const folderUri = recent.workspace.folders[0]?.root;
		return recent.checked && !!folderUri && !isWorktreeWorkspaceUri(folderUri);
	});
	if (checked && canUseProvider(checked.providerId)) {
		return checked;
	}

	return options.recentWorkspaces?.find(recent => {
		const folderUri = recent.workspace.folders[0]?.root;
		return !!folderUri
			&& canUseProvider(recent.providerId)
			&& !isWorktreeWorkspaceUri(folderUri)
			&& !options.isProviderUnavailable?.(recent.providerId);
	});
}
