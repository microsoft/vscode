/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { IChatMode2, IChatModeService } from '../../common/chatModes.js';
import { ChatAgentLocation, ChatMode, modeToString } from '../../common/constants.js';
import { getOpenChatActionIdForMode } from '../actions/chatActions.js';
import { IToggleChatModeArgs } from '../actions/chatExecuteActions.js';

export interface IModePickerDelegate {
	readonly currentMode: IObservable<IChatMode2>;
}

export class ModePickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IModePickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatModeService chatModeService: IChatModeService,
		@IMenuService private readonly menuService: IMenuService
	) {
		const makeAction = (mode: ChatMode, includeCategory: boolean, currentMode: IChatMode2): IActionWidgetDropdownAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode),
			label: modeToString(mode),
			class: undefined,
			enabled: true,
			checked: currentMode.id === mode,
			tooltip: chatAgentService.getDefaultAgent(ChatAgentLocation.Panel, mode)?.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ modeId: mode } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			},
			category: includeCategory ? { label: localize('built-in', "Built-In"), order: 0 } : undefined
		});

		const makeActionFromCustomMode = (mode: IChatMode2, currentMode: IChatMode2): IActionWidgetDropdownAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode.name),
			label: mode.name,
			class: undefined,
			enabled: true,
			checked: currentMode.id === mode.id,
			tooltip: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Panel, mode.kind)?.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ modeId: mode.id } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			},
			category: { label: localize('custom', "Custom"), order: 1 }
		});

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const modes = chatModeService.getModes();
				const hasCustomModes = modes.custom && modes.custom.length > 0;
				const currentMode = delegate.currentMode.get();
				const agentStateActions: IActionWidgetDropdownAction[] = modes.builtin.map(mode => makeAction(mode.kind, !!hasCustomModes, currentMode));
				if (modes.custom) {
					agentStateActions.push(...modes.custom.map(mode => makeActionFromCustomMode(mode, currentMode)));
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

		// Listen to changes in the current mode and its properties
		this._register(autorun(reader => {
			this.renderLabel(this.element!, this.delegate.currentMode.read(reader));
		}));
	}

	private getModePickerActionBarActions(): IAction[] {
		const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
		const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
		menuActions.dispose();

		return menuContributions;
	}

	protected override renderLabel(element: HTMLElement, mode: IChatMode2 = this.delegate.currentMode.get()): IDisposable | null {
		if (!this.element) {
			return null;
		}
		this.setAriaLabelAttributes(element);
		const state = this.delegate.currentMode.get().name;
		dom.reset(element, dom.$('span.chat-model-label', undefined, state), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
