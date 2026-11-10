/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AICustomizationManagementCommands, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { ChatCustomizationsLocation, ChatCustomizationsLocationContext, resolveChatCustomizationsLocation } from '../../common/customizationsLocation.js';
import { ChatCustomizationsTelemetry } from './chatCustomizationsTelemetry.js';

const command = {
	id: AICustomizationManagementCommands.OpenEditor,
	title: localize('openChatCustomizations', "Open Customizations"),
	icon: Codicon.extensions,
};

MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
	command,
	group: 'navigation',
	order: -12,
	when: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		IsSessionsWindowContext.negate(),
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
		ChatContextKeys.inQuickChat.negate(),
		ChatContextKeys.currentlyEditing.negate(),
		ChatCustomizationsLocationContext.isEqualTo('chatInput'),
	),
});

class ChatCustomizationsEntryPointContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatCustomizationsEntryPoint';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(instantiationService.createInstance(ChatCustomizationsTelemetry).observeLocationChanges());
		if (workspaceService.isSessionsWindow) {
			return;
		}
		const location = ChatCustomizationsLocationContext.bindTo(contextKeyService);
		const update = () => location.set(resolveChatCustomizationsLocation(
			configurationService.getValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation),
			false,
			false,
		));
		update();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsLocation)) {
				update();
			}
		}));
	}
}

registerWorkbenchContribution2(ChatCustomizationsEntryPointContribution.ID, ChatCustomizationsEntryPointContribution, WorkbenchPhase.AfterRestored);
