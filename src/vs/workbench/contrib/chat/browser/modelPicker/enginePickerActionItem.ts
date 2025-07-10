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
import { IChatAgentData, IChatAgentService } from '../../common/chatAgents.js';

export interface IEnginePickerDelegate {
	readonly currentEngineId: IObservable<string>;
}

export class EnginePickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IEnginePickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService
	) {
		const makeAction = (engine: IChatAgentData, currentEngineId: string): IActionWidgetDropdownAction => ({
			...action,
			id: `workbench.action.chat.openEngine${engine.name}`,
			label: engine.isDefault ? 'Default' : (engine.fullName ?? engine.name),
			class: undefined,
			enabled: true,
			checked: currentEngineId === engine.id,
			tooltip: engine.description ?? action.tooltip,
			run: async () => {
				const result = await action.run({ engineId: engine.id });
				this.renderLabel(this.element!);
				return result;
			},
			category: { label: localize('built-in', "Built-In"), order: 0 }
		});

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const engines = chatAgentService.getEngines();
				const currentEngineId = delegate.currentEngineId.get();
				const agentStateActions: IActionWidgetDropdownAction[] = engines.map(engine => makeAction(engine, currentEngineId));

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
			this.delegate.currentEngineId.read(reader);
			this.renderLabel(this.element!);
		}));
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
		const engine = this.chatAgentService.getAgent(this.delegate.currentEngineId.get());
		const state = engine ? this.getEngineLabel(engine) : '';
		dom.reset(element, dom.$('span.chat-model-label', undefined, state), ...renderLabelWithIcons(`$(chevron-down)`));
		return null;
	}

	private getEngineLabel(engine: IChatAgentData): string {
		return engine.isDefault ? 'Default' : (engine.fullName ?? engine.name);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
