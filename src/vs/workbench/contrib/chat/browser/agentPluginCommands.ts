/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { ForceUpdateAgentPluginsCommandId, InstalledAgentPluginsViewId, UpdateAgentPluginsCommandId, UpdatingAgentPluginsContext } from './chat.js';

let updatingPluginsContextKey: IContextKey<boolean> | undefined;
let updatePluginsPromise: Promise<void> | undefined;

function updatePlugins(accessor: ServicesAccessor, force: boolean): Promise<void> {
	if (updatePluginsPromise) {
		return updatePluginsPromise;
	}

	const pluginInstallService = accessor.get(IPluginInstallService);
	const notificationService = accessor.get(INotificationService);

	updatingPluginsContextKey?.set(true);
	updatePluginsPromise = (async () => {
		try {
			const result = await pluginInstallService.updateAllPlugins({ force }, CancellationToken.None);
			if (result.updatedNames.length === 0 && result.failedNames.length === 0) {
				notificationService.info(localize('agentPlugins.upToDate', "Plugins are up to date."));
			}
		} catch (error) {
			notificationService.error(localize('agentPlugins.updateFailed', "Failed to update plugins: {0}", getErrorMessage(error)));
			throw error;
		} finally {
			updatePluginsPromise = undefined;
			updatingPluginsContextKey?.set(false);
		}
	})();

	return updatePluginsPromise;
}

class CheckForPluginUpdatesCommand extends Action2 {
	constructor() {
		super({
			id: UpdateAgentPluginsCommandId,
			title: localize2('agentPlugins.checkForUpdates', "Update Plugins"),
			category: localize2('chat.category', "Chat"),
			icon: Codicon.refresh,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, UpdatingAgentPluginsContext.negate()),
			f1: true,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', InstalledAgentPluginsViewId),
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabledInWorkspace.negate(),
				),
				group: 'navigation',
				order: 1,
				alt: {
					id: ForceUpdateAgentPluginsCommandId,
					title: localize2('agentPlugins.forceUpdate', "Update Plugins (Force)"),
					icon: Codicon.refresh,
				},
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await updatePlugins(accessor, false);
	}
}

class ForceUpdatePluginsCommand extends Action2 {
	constructor() {
		super({
			id: ForceUpdateAgentPluginsCommandId,
			title: localize2('agentPlugins.forceUpdate', "Update Plugins (Force)"),
			category: localize2('chat.category', "Chat"),
			icon: Codicon.refresh,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, UpdatingAgentPluginsContext.negate()),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await updatePlugins(accessor, true);
	}
}

export class AgentPluginCommandsContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.chat.agentPluginCommands';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		updatingPluginsContextKey = UpdatingAgentPluginsContext.bindTo(contextKeyService);

		registerAction2(CheckForPluginUpdatesCommand);
		registerAction2(ForceUpdatePluginsCommand);
	}
}
