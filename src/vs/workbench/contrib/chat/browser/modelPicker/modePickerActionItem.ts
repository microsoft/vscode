/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { groupBy } from '../../../../../base/common/collections.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatMode, IChatMode, IChatModeService } from '../../common/chatModes.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { getOpenChatActionIdForMode } from '../actions/chatActions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../actions/chatExecuteActions.js';

export interface IModePickerDelegate {
	readonly currentMode: IObservable<IChatMode>;
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
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService commandService: ICommandService,
		@IProductService productService: IProductService
	) {
		const builtInCategory = { label: localize('built-in', "Built-In"), order: 0 };
		const customCategory = { label: localize('custom', "Custom"), order: 1 };
		const makeAction = (mode: IChatMode, currentMode: IChatMode): IActionWidgetDropdownAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode),
			label: mode.label.get(),
			class: undefined,
			enabled: true,
			checked: currentMode.id === mode.id,
			tooltip: chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip,
			run: async () => {
				const result = await commandService.executeCommand(ToggleAgentModeActionId, { modeId: mode.id } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			},
			category: builtInCategory
		});

		const makeActionFromCustomMode = (mode: IChatMode, currentMode: IChatMode): IActionWidgetDropdownAction => ({
			...makeAction(mode, currentMode),
			tooltip: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip,
			category: customCategory
		});

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const modes = chatModeService.getModes();
				const currentMode = delegate.currentMode.get();
				const agentMode = modes.builtin.find(mode => mode.id === ChatMode.Agent.id);
				const otherBuiltinModes = modes.builtin.filter(mode => mode.id !== ChatMode.Agent.id);
				const customModes = groupBy(
					modes.custom,
					mode => mode.source?.storage === PromptsStorage.extension && mode.source.extensionId.value === productService.defaultChatAgent?.chatExtensionId ?
						'builtin' : 'custom');

				const customBuiltinModeActions = customModes.builtin?.map(mode => {
					const action = makeActionFromCustomMode(mode, currentMode);
					action.category = builtInCategory;
					return action;
				}) ?? [];

				const orderedModes = coalesce([
					agentMode && makeAction(agentMode, currentMode),
					...customBuiltinModeActions,
					...otherBuiltinModes.map(mode => mode && makeAction(mode, currentMode)),
					...customModes.custom?.map(mode => makeActionFromCustomMode(mode, currentMode)) ?? []
				]);

				return orderedModes;
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
			this.delegate.currentMode.read(reader).label.read(reader); // use the reader so autorun tracks it
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	private getModePickerActionBarActions(): IAction[] {
		const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
		const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
		menuActions.dispose();

		return menuContributions;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);
		const state = this.delegate.currentMode.get().label.get();
		dom.reset(element, dom.$('span.chat-model-label', undefined, state), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
