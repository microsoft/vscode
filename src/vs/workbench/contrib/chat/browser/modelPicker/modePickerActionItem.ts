/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatAgentLocation, ChatMode, modeToString } from '../../common/constants.js';
import { getOpenChatActionIdForMode } from '../actions/chatActions.js';
import { IToggleChatModeArgs } from '../actions/chatExecuteActions.js';

export interface IModePickerDelegate {
	onDidChangeMode: Event<void>;
	getMode(): ChatMode;
}

export class ModePickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IModePickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		const makeAction = (mode: ChatMode): IAction => ({
			...action,
			id: getOpenChatActionIdForMode(mode),
			label: modeToString(mode),
			class: undefined,
			enabled: true,
			checked: delegate.getMode() === mode,
			tooltip: chatAgentService.getDefaultAgent(ChatAgentLocation.Panel, mode)?.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ mode } satisfies IToggleChatModeArgs);
				this.renderLabel(this.element!);
				return result;
			}
		});

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const agentStateActions = [
					makeAction(ChatMode.Edit),
				];
				if (chatAgentService.hasToolsAgent) {
					agentStateActions.push(makeAction(ChatMode.Agent));
				}

				agentStateActions.unshift(makeAction(ChatMode.Ask));
				return agentStateActions;
			}
		};

		const modelPickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			showItemKeybindings: true
		};

		super(action, modelPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService);

		this._register(delegate.onDidChangeMode(() => this.renderLabel(this.element!)));
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		if (!this.element) {
			return null;
		}
		this.setAriaLabelAttributes(element);
		const state = modeToString(this.delegate.getMode());
		dom.reset(element, dom.$('span.chat-model-label', undefined, state), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
