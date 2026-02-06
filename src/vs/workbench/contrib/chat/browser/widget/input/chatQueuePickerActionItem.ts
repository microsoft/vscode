/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatSubmitAction } from '../../actions/chatExecuteActions.js';
import { ChatQueueMessageAction, ChatSteerWithMessageAction } from '../../actions/chatQueueActions.js';

/**
 * Split-button action view item for the queue/steer picker in the chat execute toolbar.
 * The primary button runs the current default action (queue or steer).
 * The dropdown arrow opens a custom action widget with hover descriptions.
 *
 * Follows the same split-button pattern as {@link DropdownWithDefaultActionViewItem},
 * but uses {@link ActionWidgetDropdownActionViewItem} for the dropdown to show
 * an action widget with hover descriptions instead of a standard context menu.
 */
export class ChatQueuePickerActionItem extends BaseActionViewItem {

	private readonly _primaryActionAction: Action;
	private readonly _primaryAction: ActionViewItem;
	private readonly _dropdown: ActionWidgetDropdownActionViewItem;

	constructor(
		action: IAction,
		_options: IActionViewItemOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(undefined, action);

		const isSteerDefault = this._isSteerDefault();

		// Primary action - runs the current default (queue or steer)
		this._primaryActionAction = this._register(new Action(
			'chat.queuePickerPrimary',
			isSteerDefault ? localize('chat.steerWithMessage', "Steer with Message") : localize('chat.queueMessage', "Add to Queue"),
			ThemeIcon.asClassName(isSteerDefault ? Codicon.arrowRight : Codicon.add),
			true,
			() => this._runDefaultAction()
		));
		this._primaryAction = this._register(new ActionViewItem(undefined, this._primaryActionAction, { icon: true, label: false }));

		// Dropdown - action widget with hover descriptions and chevron-down icon
		const dropdownAction = this._register(new Action('chat.queuePickerDropdown', localize('chat.queuePicker.moreActions', "More Actions...")));
		this._dropdown = this._register(new ChevronActionWidgetDropdown(
			dropdownAction,
			{
				actionProvider: { getActions: () => this._getDropdownActions() },
				showItemKeybindings: true,
			},
			actionWidgetService,
			keybindingService,
			contextKeyService,
			telemetryService,
		));

		// React to config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.RequestQueueingDefaultAction)) {
				this._updatePrimaryAction();
			}
		}));
	}

	private _isSteerDefault(): boolean {
		return this.configurationService.getValue<string>(ChatConfiguration.RequestQueueingDefaultAction) === 'steer';
	}

	private _updatePrimaryAction(): void {
		const isSteerDefault = this._isSteerDefault();
		this._primaryActionAction.label = isSteerDefault
			? localize('chat.steerWithMessage', "Steer with Message")
			: localize('chat.queueMessage', "Add to Queue");
		this._primaryActionAction.class = ThemeIcon.asClassName(isSteerDefault ? Codicon.arrowRight : Codicon.add);
	}

	private _runDefaultAction(): void {
		const actionId = this._isSteerDefault()
			? ChatSteerWithMessageAction.ID
			: ChatQueueMessageAction.ID;
		this.commandService.executeCommand(actionId);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('monaco-dropdown-with-default');

		// Primary action button
		const primaryContainer = $('.action-container');
		this._primaryAction.render(append(container, primaryContainer));
		this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this._primaryAction.blur();
				this._dropdown.focus();
				event.stopPropagation();
			}
		}));

		// Dropdown arrow button
		const dropdownContainer = $('.dropdown-action-container');
		this._dropdown.render(append(container, dropdownContainer));
		this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this._dropdown.setFocusable(false);
				this._primaryAction.focus();
				event.stopPropagation();
			}
		}));
	}

	override focus(fromRight?: boolean): void {
		if (fromRight) {
			this._dropdown.focus();
		} else {
			this._primaryAction.focus();
		}
	}

	override blur(): void {
		this._primaryAction.blur();
		this._dropdown.blur();
	}

	override setFocusable(focusable: boolean): void {
		this._primaryAction.setFocusable(focusable);
		this._dropdown.setFocusable(focusable);
	}

	private _getDropdownActions(): IActionWidgetDropdownAction[] {
		const queueAction: IActionWidgetDropdownAction = {
			id: ChatQueueMessageAction.ID,
			label: localize('chat.queueMessage', "Add to Queue"),
			tooltip: '',
			enabled: true,
			icon: Codicon.add,
			class: undefined,
			hover: {
				content: localize('chat.queueMessage.hover', "Queue this message to send after the current request completes. The current response will finish uninterrupted before the queued message is sent."),
			},
			run: () => {
				this.commandService.executeCommand(ChatQueueMessageAction.ID);
			}
		};

		const steerAction: IActionWidgetDropdownAction = {
			id: ChatSteerWithMessageAction.ID,
			label: localize('chat.steerWithMessage', "Steer with Message"),
			tooltip: '',
			enabled: true,
			icon: Codicon.arrowRight,
			class: undefined,
			hover: {
				content: localize('chat.steerWithMessage.hover', "Send this message at the next opportunity, signaling the current request to yield. The current response will stop and the new message will be sent immediately."),
			},
			run: () => {
				this.commandService.executeCommand(ChatSteerWithMessageAction.ID);
			}
		};

		const sendAction: IActionWidgetDropdownAction = {
			id: '_' + ChatSubmitAction.ID, // _ to avoid showing a keybinding which is not valid in this context
			label: localize('chat.sendImmediately', "Send Immediately"),
			tooltip: '',
			enabled: true,
			icon: Codicon.send,
			class: undefined,
			hover: {
				content: localize('chat.sendImmediately.hover', "Cancel the current request and send this message immediately."),
			},
			run: () => {
				this.commandService.executeCommand(ChatSubmitAction.ID);
			}
		};

		return [sendAction, queueAction, steerAction];
	}
}

/**
 * {@link ActionWidgetDropdownActionViewItem} that renders a chevron-down icon
 * as its label, used as the dropdown arrow in the split button.
 */
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
	protected override renderLabel(element: HTMLElement): IDisposable | null {
		element.classList.add('codicon', 'codicon-chevron-down');
		return null;
	}
}


/**
 * Workbench contribution that registers a custom action view item for the
 * queue/steer picker in the execute toolbar. This replaces the default split
 * button with a custom dropdown similar to the model switcher.
 */
export class ChatQueuePickerRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.queuePickerRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.ChatExecute, MenuId.ChatExecuteQueue, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChatQueuePickerActionItem, action, options);
		}));
	}
}
