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
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { AgentSessionProviderType, getAgentSessionProviderDescription, getAgentSessionProviderIcon, getAgentSessionProviderName, isFirstPartyAgentSessionProvider, isLocalSessionProvider, localSessionProvider } from '../../agentSessions/agentSessions.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ISessionTypePickerDelegate } from '../../chat.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';

export interface ISessionTypeItem {
	type: AgentSessionProviderType;
	label: string;
	hoverDescription: string;
	commandId: string;
}

const firstPartyCategory = { label: localize('chat.sessionTarget.category.agent', "Agent Types"), order: 1 };
const otherCategory = { label: localize('chat.sessionTarget.category.other', "Other"), order: 2 };

/**
 * Action view item for selecting a session target in the chat interface.
 * This picker allows switching between different chat session types for new/empty sessions.
 */
export class SessionTypePickerActionItem extends ChatInputPickerActionViewItem {
	private _sessionTypeItems: ISessionTypeItem[] = [];

	constructor(
		action: MenuItemAction,
		protected readonly chatSessionPosition: 'sidebar' | 'editor',
		protected readonly delegate: ISessionTypePickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatSessionsService protected readonly chatSessionsService: IChatSessionsService,
		@ICommandService protected readonly commandService: ICommandService,
		@IOpenerService protected readonly openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const currentType = this._getSelectedSessionType();

				const actions: IActionWidgetDropdownAction[] = [...this._getAdditionalActions().map(a => ({ ...action, ...a }))];
				for (const sessionTypeItem of this._sessionTypeItems) {
					if (!this._isVisible(sessionTypeItem.type)) {
						continue;
					}

					actions.push({
						...action,
						id: sessionTypeItem.commandId,
						label: sessionTypeItem.label,
						checked: currentType === sessionTypeItem.type,
						icon: getAgentSessionProviderIcon(sessionTypeItem.type, this.chatSessionsService),
						enabled: this._isSessionTypeEnabled(sessionTypeItem.type),
						category: this._getSessionCategory(sessionTypeItem),
						description: this._getSessionDescription(sessionTypeItem),
						tooltip: '',
						hover: { content: sessionTypeItem.hoverDescription, position: this.pickerOptions.hoverPosition },
						run: async () => {
							this._run(sessionTypeItem);
						},
					});
				}

				return actions;
			}
		};

		const actionBarActionProvider: IActionProvider = {
			getActions: () => {
				return [this._getLearnMore()];
			}
		};

		const sessionTargetPickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider,
			showItemKeybindings: true,
			reporter: { id: 'ChatSessionTypePicker', name: `ChatSessionTypePicker`, includeOptions: true },
		};

		super(action, sessionTargetPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._updateAgentSessionItems();
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this._updateAgentSessionItems();
		}));
	}

	protected _run(sessionTypeItem: ISessionTypeItem): void {
		if (this.delegate.setActiveSessionProvider) {
			// Use provided setter (for welcome view)
			this.delegate.setActiveSessionProvider(sessionTypeItem.type);
		} else {
			// Execute command to create new session
			this.commandService.executeCommand(sessionTypeItem.commandId, this.chatSessionPosition);
		}
		if (this.element) {
			this.renderLabel(this.element);
		}
	}

	protected _getSelectedSessionType(): AgentSessionProviderType | undefined {
		return this.delegate.getActiveSessionProvider();
	}

	protected _getAdditionalActions(): IActionWidgetDropdownAction[] {
		return [];
	}

	protected _getLearnMore(): IAction {
		const learnMoreUrl = 'https://code.visualstudio.com/docs/copilot/agents/overview';
		return {
			id: 'workbench.action.chat.agentOverview.learnMore',
			label: localize('chat.learnMoreAgentTypes', "Learn about agent types..."),
			tooltip: learnMoreUrl,
			class: undefined,
			enabled: true,
			run: async () => {
				await this.openerService.open(URI.parse(learnMoreUrl));
			}
		};
	}

	private _updateAgentSessionItems(): void {
		const localSessionItem: ISessionTypeItem = {
			type: localSessionProvider.type,
			label: getAgentSessionProviderName(localSessionProvider.type, this.chatSessionsService),
			hoverDescription: getAgentSessionProviderDescription(localSessionProvider.type, this.chatSessionsService),
			commandId: `workbench.action.chat.openNewChatSessionInPlace.${localSessionProvider.type}`,
		};

		const agentSessionItems: ISessionTypeItem[] = [localSessionItem];

		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		for (const contribution of contributions) {
			agentSessionItems.push({
				type: contribution.type,
				label: getAgentSessionProviderName(contribution),
				hoverDescription: getAgentSessionProviderDescription(contribution),
				commandId: contribution.canDelegate ?
					`workbench.action.chat.openNewChatSessionInPlace.${contribution.type}` :
					`workbench.action.chat.openNewChatSessionExternal.${contribution.type}`,
			});
		}
		this._sessionTypeItems = agentSessionItems;
	}

	protected _isVisible(type: AgentSessionProviderType): boolean {
		return true;
	}

	protected _isSessionTypeEnabled(type: AgentSessionProviderType): boolean {
		return true;
	}

	protected _getSessionCategory(sessionTypeItem: ISessionTypeItem) {
		return isFirstPartyAgentSessionProvider(sessionTypeItem.type, this.chatSessionsService) ? firstPartyCategory : otherCategory;
	}

	protected _getSessionDescription(sessionTypeItem: ISessionTypeItem): string | undefined {
		return undefined;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const currentType = this._getSelectedSessionType();

		const label = getAgentSessionProviderName(currentType ?? localSessionProvider.type, this.chatSessionsService);
		const icon = getAgentSessionProviderIcon(currentType ?? localSessionProvider.type, this.chatSessionsService);

		const labelElements = [];
		labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		if ((currentType && !isLocalSessionProvider(currentType)) || !this.pickerOptions.onlyShowIconsForDefaultActions.get()) {
			labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
		}
		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);

		return null;
	}
}
