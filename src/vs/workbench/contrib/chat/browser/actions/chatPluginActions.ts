/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { InstalledAgentPluginsViewId } from '../agentPluginsView.js';

export class ManagePluginsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.managePlugins';

	constructor() {
		super({
			id: ManagePluginsAction.ID,
			title: localize2('plugins', 'Plugins'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: CHAT_CONFIG_MENU_ID,
				group: '2_plugins',
			}],
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IExtensionsWorkbenchService).openSearch('@agentPlugins ');
	}
}

class InstallFromSourceAction extends Action2 {
	static readonly ID = 'workbench.action.chat.installPluginFromSource';

	constructor() {
		super({
			id: InstallFromSourceAction.ID,
			title: localize2('installPluginFromSource', 'Install Plugin from Source'),
			category: CHAT_CATEGORY,
			icon: Codicon.add,
			precondition: ChatContextKeys.enabled,
			f1: true,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', InstalledAgentPluginsViewId),
					ChatContextKeys.Setup.hidden.negate(),
				),
				group: 'navigation',
				order: 1,
			}],
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const pluginInstallService = accessor.get(IPluginInstallService);

		const source = await quickInputService.input({
			placeHolder: localize('pluginSourcePlaceholder', "owner/repo or git clone URL"),
			prompt: localize('pluginSourcePrompt', "Enter a GitHub repository or git URL to install a plugin from"),
		});

		if (!source) {
			return;
		}

		await pluginInstallService.installPluginFromSource(source.trim());
	}
}

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
	registerAction2(InstallFromSourceAction);
}
