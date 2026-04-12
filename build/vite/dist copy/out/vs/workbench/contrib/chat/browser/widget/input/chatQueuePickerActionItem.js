/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { $, addDisposableListener, append, EventType, ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
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
let ChatQueuePickerActionItem = class ChatQueuePickerActionItem extends BaseActionViewItem {
    constructor(action, _options, commandService, configurationService, actionWidgetService, keybindingService, contextKeyService, telemetryService) {
        super(undefined, action);
        this.commandService = commandService;
        this.configurationService = configurationService;
        this._altKeyPressed = false;
        const isSteerDefault = this._isSteerDefault();
        // Primary action - runs the current default (queue or steer)
        this._primaryActionAction = this._register(new Action('chat.queuePickerPrimary', isSteerDefault ? localize('chat.steerWithMessage', "Steer with Message") : localize('chat.queueMessage', "Add to Queue"), ThemeIcon.asClassName(isSteerDefault ? Codicon.arrowUp : Codicon.add), !!contextKeyService.getContextKeyValue(ChatContextKeys.inputHasText.key), () => this._runDefaultAction()));
        this._primaryAction = this._register(new ActionViewItem(undefined, this._primaryActionAction, { icon: true, label: false }));
        this._register(contextKeyService.onDidChangeContext(e => {
            this._primaryActionAction.enabled = !!contextKeyService.getContextKeyValue(ChatContextKeys.inputHasText.key);
        }));
        // Dropdown - action widget with hover descriptions and chevron-down icon
        const dropdownAction = this._register(new Action('chat.queuePickerDropdown', localize('chat.queuePicker.moreActions', "More Actions...")));
        this._dropdown = this._register(new ChevronActionWidgetDropdown(dropdownAction, {
            actionProvider: { getActions: () => this._getDropdownActions() },
            showItemKeybindings: true,
        }, actionWidgetService, keybindingService, contextKeyService, telemetryService));
        // React to config changes
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.RequestQueueingDefaultAction)) {
                this._updatePrimaryAction();
            }
        }));
        // Toggle icon when Alt key is pressed/released
        this._register(ModifierKeyEmitter.getInstance().event(status => {
            if (this._altKeyPressed !== status.altKey) {
                this._altKeyPressed = status.altKey;
                this._updatePrimaryAction();
            }
        }));
    }
    _isSteerDefault() {
        return this.configurationService.getValue(ChatConfiguration.RequestQueueingDefaultAction) === 'steer';
    }
    _isEffectiveSteer() {
        const isSteerDefault = this._isSteerDefault();
        return this._altKeyPressed ? !isSteerDefault : isSteerDefault;
    }
    _updatePrimaryAction() {
        const isSteer = this._isEffectiveSteer();
        this._primaryActionAction.label = isSteer
            ? localize('chat.steerWithMessage', "Steer with Message")
            : localize('chat.queueMessage', "Add to Queue");
        this._primaryActionAction.class = ThemeIcon.asClassName(isSteer ? Codicon.arrowUp : Codicon.add);
    }
    _runDefaultAction() {
        const actionId = this._isEffectiveSteer()
            ? ChatSteerWithMessageAction.ID
            : ChatQueueMessageAction.ID;
        this.commandService.executeCommand(actionId);
    }
    render(container) {
        super.render(container);
        container.classList.add('monaco-dropdown-with-default');
        // Primary action button
        const primaryContainer = $('.action-container');
        this._primaryAction.render(append(container, primaryContainer));
        this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(17 /* KeyCode.RightArrow */)) {
                this._primaryAction.blur();
                this._dropdown.focus();
                event.stopPropagation();
            }
        }));
        // Dropdown arrow button
        const dropdownContainer = $('.dropdown-action-container');
        this._dropdown.render(append(container, dropdownContainer));
        this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(15 /* KeyCode.LeftArrow */)) {
                this._dropdown.setFocusable(false);
                this._primaryAction.focus();
                event.stopPropagation();
            }
        }));
    }
    focus(fromRight) {
        if (fromRight) {
            this._dropdown.focus();
        }
        else {
            this._primaryAction.focus();
        }
    }
    blur() {
        this._primaryAction.blur();
        this._dropdown.blur();
    }
    setFocusable(focusable) {
        this._primaryAction.setFocusable(focusable);
        this._dropdown.setFocusable(focusable);
    }
    _getDropdownActions() {
        const isSteerDefault = this._isSteerDefault();
        const queueAction = {
            id: ChatQueueMessageAction.ID,
            label: localize('chat.queueMessage', "Add to Queue"),
            tooltip: '',
            enabled: true,
            checked: !isSteerDefault,
            icon: Codicon.add,
            class: undefined,
            hover: {
                content: localize('chat.queueMessage.hover', "Queue this message to send after the current request completes. The current response will finish uninterrupted before the queued message is sent."),
            },
            run: () => {
                this.commandService.executeCommand(ChatQueueMessageAction.ID);
            }
        };
        const steerAction = {
            id: ChatSteerWithMessageAction.ID,
            label: localize('chat.steerWithMessage', "Steer with Message"),
            tooltip: '',
            enabled: true,
            checked: isSteerDefault,
            icon: Codicon.arrowUp,
            class: undefined,
            hover: {
                content: localize('chat.steerWithMessage.hover', "Send this message at the next opportunity, signaling the current request to yield. The current response will stop and the new message will be sent immediately."),
            },
            run: () => {
                this.commandService.executeCommand(ChatSteerWithMessageAction.ID);
            }
        };
        const sendAction = {
            id: '_' + ChatSubmitAction.ID, // _ to avoid showing a keybinding which is not valid in this context
            label: localize('chat.sendImmediately', "Stop and Send"),
            tooltip: '',
            enabled: true,
            icon: Codicon.arrowRight,
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
};
ChatQueuePickerActionItem = __decorate([
    __param(2, ICommandService),
    __param(3, IConfigurationService),
    __param(4, IActionWidgetService),
    __param(5, IKeybindingService),
    __param(6, IContextKeyService),
    __param(7, ITelemetryService)
], ChatQueuePickerActionItem);
export { ChatQueuePickerActionItem };
/**
 * {@link ActionWidgetDropdownActionViewItem} that renders a chevron-down icon
 * as its label, used as the dropdown arrow in the split button.
 */
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
    renderLabel(element) {
        element.classList.add('codicon', 'codicon-chevron-down');
        return null;
    }
}
/**
 * Workbench contribution that registers a custom action view item for the
 * queue/steer picker in the execute toolbar. This replaces the default split
 * button with a custom dropdown similar to the model switcher.
 */
let ChatQueuePickerRendering = class ChatQueuePickerRendering extends Disposable {
    static { this.ID = 'chat.queuePickerRendering'; }
    constructor(actionViewItemService) {
        super();
        this._register(actionViewItemService.register(MenuId.ChatExecute, MenuId.ChatExecuteQueue, (action, options, instantiationService) => {
            if (!(action instanceof SubmenuItemAction)) {
                return undefined;
            }
            return instantiationService.createInstance(ChatQueuePickerActionItem, action, options);
        }));
    }
};
ChatQueuePickerRendering = __decorate([
    __param(0, IActionViewItemService)
], ChatQueuePickerRendering);
export { ChatQueuePickerRendering };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXVlUGlja2VyQWN0aW9uSXRlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdFF1ZXVlUGlja2VyQWN0aW9uSXRlbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUEwQixNQUFNLGdFQUFnRSxDQUFDO0FBQzVJLE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFcEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDN0csT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDdEksT0FBTyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRXZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFC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