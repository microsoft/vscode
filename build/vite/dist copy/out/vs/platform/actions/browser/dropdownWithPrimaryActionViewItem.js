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
import * as DOM from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem } from '../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { MenuEntryActionViewItem } from './menuEntryActionViewItem.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { INotificationService } from '../../notification/common/notification.js';
import { IThemeService } from '../../theme/common/themeService.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
let DropdownWithPrimaryActionViewItem = class DropdownWithPrimaryActionViewItem extends BaseActionViewItem {
    get onDidChangeDropdownVisibility() {
        return this._dropdown.onDidChangeVisibility;
    }
    constructor(primaryAction, dropdownAction, dropdownMenuActions, className, _options, _contextMenuProvider, _keybindingService, _notificationService, _contextKeyService, _themeService, _accessibilityService) {
        super(null, primaryAction, { hoverDelegate: _options?.hoverDelegate });
        this._options = _options;
        this._contextMenuProvider = _contextMenuProvider;
        this._container = null;
        this._dropdownContainer = null;
        this._primaryAction = new MenuEntryActionViewItem(primaryAction, { hoverDelegate: _options?.hoverDelegate }, _keybindingService, _notificationService, _contextKeyService, _themeService, _contextMenuProvider, _accessibilityService);
        if (_options?.actionRunner) {
            this._primaryAction.actionRunner = _options.actionRunner;
        }
        this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
            menuAsChild: _options?.menuAsChild ?? true,
            classNames: className ? ['codicon', 'codicon-chevron-down', className] : ['codicon', 'codicon-chevron-down'],
            actionRunner: this._options?.actionRunner,
            keybindingProvider: this._options?.getKeyBinding ?? (action => _keybindingService.lookupKeybinding(action.id)),
            hoverDelegate: _options?.hoverDelegate,
            skipTelemetry: _options?.skipTelemetry,
        });
    }
    set actionRunner(actionRunner) {
        super.actionRunner = actionRunner;
        this._primaryAction.actionRunner = actionRunner;
        this._dropdown.actionRunner = actionRunner;
    }
    get actionRunner() {
        return super.actionRunner;
    }
    setActionContext(newContext) {
        super.setActionContext(newContext);
        this._primaryAction.setActionContext(newContext);
        this._dropdown.setActionContext(newContext);
    }
    render(container) {
        this._container = container;
        super.render(this._container);
        this._container.classList.add('monaco-dropdown-with-primary');
        const primaryContainer = DOM.$('.action-container');
        primaryContainer.role = 'button';
        primaryContainer.ariaDisabled = String(!this.action.enabled);
        this._primaryAction.render(DOM.append(this._container, primaryContainer));
        this._dropdownContainer = DOM.$('.dropdown-action-container');
        this._dropdown.render(DOM.append(this._container, this._dropdownContainer));
        this._register(DOM.addDisposableListener(primaryContainer, DOM.EventType.KEY_DOWN, (e) => {
            if (!this.action.enabled) {
                return;
            }
            const event = new StandardKeyboardEvent(e);
            if (event.equals(17 /* KeyCode.RightArrow */)) {
                this._primaryAction.element.tabIndex = -1;
                this._dropdown.focus();
                event.stopPropagation();
            }
        }));
        this._register(DOM.addDisposableListener(this._dropdownContainer, DOM.EventType.KEY_DOWN, (e) => {
            if (!this.action.enabled) {
                return;
            }
            const event = new StandardKeyboardEvent(e);
            if (event.equals(15 /* KeyCode.LeftArrow */)) {
                this._primaryAction.element.tabIndex = 0;
                this._dropdown.setFocusable(false);
                this._primaryAction.element?.focus();
                event.stopPropagation();
            }
        }));
        this.updateEnabled();
    }
    focus(fromRight) {
        if (fromRight) {
            this._dropdown.focus();
        }
        else {
            this._primaryAction.element.tabIndex = 0;
            this._primaryAction.element.focus();
        }
    }
    blur() {
        this._primaryAction.element.tabIndex = -1;
        this._dropdown.blur();
        this._container.blur();
    }
    setFocusable(focusable) {
        if (focusable) {
            this._primaryAction.element.tabIndex = 0;
        }
        else {
            this._primaryAction.element.tabIndex = -1;
            this._dropdown.setFocusable(false);
        }
    }
    updateEnabled() {
        const disabled = !this.action.enabled;
        this.element?.classList.toggle('disabled', disabled);
    }
    update(dropdownAction, dropdownMenuActions, dropdownIcon) {
        this._dropdown.dispose();
        this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
            menuAsChild: this._options?.menuAsChild ?? true,
            classNames: ['codicon', dropdownIcon || 'codicon-chevron-down'],
            actionRunner: this._options?.actionRunner,
            hoverDelegate: this._options?.hoverDelegate,
            keybindingProvider: this._options?.getKeyBinding
        });
        if (this._dropdownContainer) {
            this._dropdown.render(this._dropdownContainer);
        }
    }
    showDropdown() {
        this._dropdown.show();
    }
    dispose() {
        this._primaryAction.dispose();
        this._dropdown.dispose();
        super.dispose();
    }
};
DropdownWithPrimaryActionViewItem = __decorate([
    __param(5, IContextMenuService),
    __param(6, IKeybindingService),
    __param(7, INotificationService),
    __param(8, IContextKeyService),
    __param(9, IThemeService),
    __param(10, IAccessibilityService)
], DropdownWithPrimaryActionViewItem);
export { DropdownWithPrimaryActionViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2Ryb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9FLE9BQU8sRUFBa0Isa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUt6RyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFXN0UsSUFBTSxpQ0FBaUMsR0FBdkMsTUFBTSxpQ0FBa0MsU0FBUSxrQkFBa0I7SUFNeEUsSUFBSSw2QkFBNkI7UUFDaEMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDO0lBQzdDLENBQUM7SUFFRCxZQUNDLGFBQTZCLEVBQzdCLGNBQXVCLEVBQ3ZCLG1CQUF1QyxFQUN2QyxTQUFpQixF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