/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CreateRemoteAgentJobAction } from './chatExecuteActions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { localize } from '../../../../../nls.js';

export class ChatContinueInSessionActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ICommandService commandService: ICommandService
	) {
		super(action, {
			actionProvider: ChatContinueInSessionActionItem.actionProvider(chatSessionsService, commandService)
		}, actionWidgetService, keybindingService, contextKeyService);
	}

	private static actionProvider(chatSessionsService: IChatSessionsService, commandService: ICommandService): IActionWidgetDropdownActionProvider {
		return {
			getActions: () => {
				const actions: IActionWidgetDropdownAction[] = [];
				const contributions = chatSessionsService.getAllChatSessionContributions();

				// Continue in Background
				const backgroundContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Background);
				if (backgroundContrib && backgroundContrib.canDelegate !== false) {
					actions.push(this.toAction(backgroundContrib, commandService));
				}

				// Continue in Cloud
				const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
				if (cloudContrib && cloudContrib.canDelegate !== false) {
					actions.push(this.toAction(cloudContrib, commandService));
				}

				return actions;
			}
		};
	}

	private static toAction(contrib: IChatSessionsExtensionPoint, commandService: ICommandService): IActionWidgetDropdownAction {
		return {
			id: contrib.type,
			enabled: true,
			icon: contrib.type === AgentSessionProviders.Cloud ? Codicon.cloud : Codicon.collection,
			class: undefined,
			tooltip: contrib.displayName,
			label: contrib.type === AgentSessionProviders.Cloud ?
				localize('continueInCloud', "Continue in Cloud") :
				localize('continueInBackground', "Continue in Background"),
			run: () => {
				commandService.executeCommand(CreateRemoteAgentJobAction.ID, { continuationTarget: contrib });
			}
		};
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const domChildren = [];
		domChildren.push(...renderLabelWithIcons(`$(export)`));

		dom.reset(element, ...domChildren);
		this.setAriaLabelAttributes(element);

		return null;
	}
}
