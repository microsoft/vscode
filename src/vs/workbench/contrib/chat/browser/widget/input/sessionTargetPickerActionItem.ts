/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../agentSessions/agentSessions.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ISessionTypePickerDelegate } from '../../chat.js';

interface ISessionTypeItem {
	type: AgentSessionProviders;
	label: string;
	description: string;
	commandId: string;
}

/**
 * Action view item for selecting a session target in the chat interface.
 * This picker allows switching between different chat session types contributed via extensions.
 */
export class SessionTypePickerActionItem extends ChatInputPickerActionViewItem {
	private _sessionTypeItems: ISessionTypeItem[] = [];

	constructor(
		action: MenuItemAction,
		private readonly chatSessionPosition: 'sidebar' | 'editor',
		private readonly delegate: ISessionTypePickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const currentType = this.delegate.getActiveSessionProvider();

				const actions: IActionWidgetDropdownAction[] = [];
				for (const sessionTypeItem of this._sessionTypeItems) {
					actions.push({
						...action,
						id: sessionTypeItem.commandId,
						label: sessionTypeItem.label,
						tooltip: sessionTypeItem.description,
						checked: currentType === sessionTypeItem.type,
						icon: getAgentSessionProviderIcon(sessionTypeItem.type),
						enabled: true,
						run: async () => {
							if (this.delegate.setActiveSessionProvider) {
								this.delegate.setActiveSessionProvider(sessionTypeItem.type);
							} else {
								this.commandService.executeCommand(sessionTypeItem.commandId, this.chatSessionPosition);
							}
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					});
				}

				return actions;
			}
		};

		const actionBarActions: IAction[] = [];

		const learnMoreUrl = 'https://code.visualstudio.com/docs/copilot/agents/overview';
		actionBarActions.push({
			id: 'workbench.action.chat.agentOverview.learnMore',
			label: localize('chat.learnMore', "Learn about agent types..."),
			tooltip: learnMoreUrl,
			class: undefined,
			enabled: true,
			run: async () => {
				await openerService.open(URI.parse(learnMoreUrl));
			}
		});

		const sessionTargetPickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActions,
			actionBarActionProvider: undefined,
			showItemKeybindings: true,
		};

		super(action, sessionTargetPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService);

		this._updateAgentSessionItems();
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this._updateAgentSessionItems();
		}));
	}

	private _updateAgentSessionItems(): void {
		const localSessionItem = {
			type: AgentSessionProviders.Local,
			label: getAgentSessionProviderName(AgentSessionProviders.Local),
			description: localize('chat.sessionTarget.local.description', "Local chat session"),
			commandId: `workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.Local}`,
		};

		const agentSessionItems = [localSessionItem];

		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		for (const contribution of contributions) {
			const agentSessionType = getAgentSessionProvider(contribution.type);
			if (!agentSessionType) {
				continue;
			}

			agentSessionItems.push({
				type: agentSessionType,
				label: getAgentSessionProviderName(agentSessionType),
				description: contribution.description,
				commandId: `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}`,
			});
		}
		this._sessionTypeItems = agentSessionItems;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const currentType = this.delegate.getActiveSessionProvider();

		const label = getAgentSessionProviderName(currentType ?? AgentSessionProviders.Local);
		const icon = getAgentSessionProviderIcon(currentType ?? AgentSessionProviders.Local);

		const labelElements = [];
		labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		if (currentType !== AgentSessionProviders.Local) {
			labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
		}
		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);

		return null;
	}
}
