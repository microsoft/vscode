/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { IChatMode, IChatModeService } from '../../common/chatModes.js';
import { ChatAgentLocation, ChatMode, modeToString } from '../../common/constants.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { getOpenChatActionIdForMode } from '../actions/chatActions.js';
import { IToggleChatModeArgs } from '../actions/chatExecuteActions.js';

export interface IModePickerDelegate {
	onDidChangeMode: Event<void>;
	getMode(): IChatMode;
}

export class ModePickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IModePickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPromptsService promptsService: IPromptsService,
		@IChatModeService chatModeService: IChatModeService,
		@IMenuService private readonly menuService: IMenuService
	) {
		const makeAction = (mode: ChatMode, includeCategory: boolean): IActionWidgetDropdownAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode),
			label: modeToString(mode),
			class: undefined,
			enabled: true,
			checked: delegate.getMode().id === mode,
			tooltip: chatAgentService.getDefaultAgent(ChatAgentLocation.Panel, mode)?.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ mode } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			},
			category: includeCategory ? { label: localize('built-in', "Built-In"), order: 0 } : undefined
		});

		const makeActionFromCustomMode = (mode: IChatMode): IActionWidgetDropdownAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode.name as ChatMode),
			label: mode.name,
			class: undefined,
			enabled: true,
			checked: delegate.getMode().id === mode.id,
			tooltip: mode.description ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Panel, mode.kind)?.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ mode } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			},
			category: { label: localize('custom', "Custom"), order: 1 }
		});

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const modes = chatModeService.getModes();
				const hasCustomModes = modes.custom && modes.custom.length > 0;
				const agentStateActions: IActionWidgetDropdownAction[] = modes.builtin.map(mode => makeAction(mode.kind, !!hasCustomModes));
				if (modes.custom) {
					agentStateActions.push(...modes.custom.map(mode => makeActionFromCustomMode(mode)));
				}

				return agentStateActions;
			}
		};

		const modePickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider: {
				getActions: () => this.getModePickerActionBarActions()
			},
			showItemKeybindings: true
		};

		super(action, modePickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService);

		this._register(delegate.onDidChangeMode(() => this.renderLabel(this.element!)));
	}

	private getModePickerActionBarActions(): IAction[] {
		const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
		const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
		menuActions.dispose();

		return menuContributions;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		if (!this.element) {
			return null;
		}
		this.setAriaLabelAttributes(element);
		const state = this.delegate.getMode().name;
		dom.reset(element, dom.$('span.chat-model-label', undefined, state), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
