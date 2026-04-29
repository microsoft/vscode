/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
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
import { AgentSessionProviders, AgentSessionTarget, getAgentSessionProvider, getAgentSessionProviderDescription, getAgentSessionProviderIcon, getAgentSessionProviderName, isFirstPartyAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ISessionTypePickerDelegate } from '../../chat.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';


export interface ISessionTypeItem {
	type: AgentSessionTarget;
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
						icon: this._getSessionIcon(sessionTypeItem),
						enabled: this._isSessionTypeEnabled(sessionTypeItem.type),
						category: this._getSessionCategory(sessionTypeItem),
						description: this._getSessionDescription(sessionTypeItem),
						tooltip: '',
						hover: { content: sessionTypeItem.hoverDescription },
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

		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this._updateAgentSessionItems();
		}));

		this._updateAgentSessionItems();
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

	protected _getSelectedSessionType(): AgentSessionTarget | undefined {
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
			type: AgentSessionProviders.Local,
			label: getAgentSessionProviderName(AgentSessionProviders.Local),
			hoverDescription: getAgentSessionProviderDescription(AgentSessionProviders.Local),
			commandId: `workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.Local}`,
		};

		const agentSessionItems: ISessionTypeItem[] = [localSessionItem];

		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		for (const contribution of contributions) {
			// TODO: Remove hardcoded providers from core
			const agentSessionType = getAgentSessionProvider(contribution.type);
			if (agentSessionType) {
				// Well-known session type — use hardcoded metadata
				agentSessionItems.push({
					type: agentSessionType,
					label: getAgentSessionProviderName(agentSessionType),
					hoverDescription: getAgentSessionProviderDescription(agentSessionType),
					commandId: contribution.canDelegate ?
						`workbench.action.chat.openNewChatSessionInPlace.${contribution.type}` :
						`workbench.action.chat.openNewChatSessionExternal.${contribution.type}`,
				});
			} else {
				// Extension-contributed session type — always use in-place
				// (openNewChatSessionExternal requires a menu action registered
				// by _registerMenuItems, which may not exist for extensions)
				agentSessionItems.push({
					type: contribution.type,
					label: contribution.displayName ?? contribution.name ?? contribution.type,
					hoverDescription: contribution.description ?? '',
					commandId: `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}`,
				});
			}
		}
		this._sessionTypeItems = agentSessionItems;
	}

	protected _isVisible(_type: AgentSessionTarget): boolean {
		return true;
	}

	protected _isSessionTypeEnabled(type: AgentSessionTarget): boolean {
		if (type === AgentSessionProviders.Local) {
			return true; // Local is always available
		}
		// Disable non-local session types when their provider is not registered yet
		return !!this.chatSessionsService.getChatSessionContribution(type);
	}

	protected _getSessionCategory(sessionTypeItem: ISessionTypeItem) {
		// TODO: Remove hardcoded providers from core
		const knownType = getAgentSessionProvider(sessionTypeItem.type);
		return knownType && isFirstPartyAgentSessionProvider(knownType) ? firstPartyCategory : otherCategory;
	}

	protected _getSessionDescription(sessionTypeItem: ISessionTypeItem): string | undefined {
		return undefined;
	}

	private _getSessionIcon(sessionTypeItem: ISessionTypeItem): ThemeIcon {
		// TODO: Remove hardcoded providers from core
		const knownType = getAgentSessionProvider(sessionTypeItem.type);
		if (knownType) {
			return getAgentSessionProviderIcon(knownType);
		}
		// Extension-contributed: look up icon from the contribution
		const contribution = this.chatSessionsService.getChatSessionContribution(sessionTypeItem.type);
		if (contribution && ThemeIcon.isThemeIcon(contribution.icon)) {
			return contribution.icon;
		}
		return Codicon.extensions;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-session-target-picker-item');
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const currentType = this._getSelectedSessionType() ?? AgentSessionProviders.Local;

		// TODO: Remove hardcoded providers from core
		const knownType = getAgentSessionProvider(currentType);
		const label = knownType
			? getAgentSessionProviderName(knownType)
			: (this.chatSessionsService.getChatSessionContribution(currentType)?.displayName ?? currentType);
		const icon = this._getSessionIcon({ type: currentType, label, hoverDescription: '', commandId: '' });

		const labelElements = [];
		labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);

		return null;
	}
}
