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
import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ModelPickerWidget } from './chatModelPicker.js';
/**
 * Enhanced action view item for selecting a language model in the chat interface.
 *
 * Wraps a {@link ModelPickerWidget} and adapts it for use in an action bar,
 * providing curated model suggestions, upgrade prompts, and grouped layout.
 */
let EnhancedModelPickerActionItem = class EnhancedModelPickerActionItem extends BaseActionViewItem {
    constructor(action, delegate, pickerOptions, instantiationService, _contextKeyService, keybindingService) {
        super(undefined, action);
        this.pickerOptions = pickerOptions;
        this._contextKeyService = _contextKeyService;
        this.keybindingService = keybindingService;
        this._managedHover = this._register(new MutableDisposable());
        this._pickerWidget = this._register(instantiationService.createInstance(ModelPickerWidget, delegate, pickerOptions.hoverPosition));
        this._pickerWidget.setSelectedModel(delegate.currentModel.get());
        this._pickerWidget.setHideChevrons(pickerOptions.hideChevrons);
        // Sync delegate → widget when model list or selection changes externally
        this._register(autorun(t => {
            const model = delegate.currentModel.read(t);
            this._pickerWidget.setSelectedModel(model);
            this._updateTooltip();
        }));
        // Sync widget → delegate when user picks a model
        this._register(this._pickerWidget.onDidChangeSelection(model => delegate.setModel(model)));
    }
    render(container) {
        this._pickerWidget.render(container);
        this.element = this._pickerWidget.domNode;
        this._updateTooltip();
        container.classList.add('chat-input-picker-item');
    }
    _getAnchorElement() {
        if (this.element && getActiveWindow().document.contains(this.element)) {
            return this.element;
        }
        return this.pickerOptions.getOverflowAnchor?.() ?? this.element;
    }
    openModelPicker() {
        this._showPicker();
    }
    show() {
        this._showPicker();
    }
    setEnabled(enabled) {
        this._pickerWidget.setEnabled(enabled);
    }
    _showPicker() {
        this._pickerWidget.show(this._getAnchorElement());
    }
    _updateTooltip() {
        if (!this.element) {
            return;
        }
        const hoverContent = this._getHoverContents();
        if (typeof hoverContent === 'string' && hoverContent) {
            this._managedHover.value = getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, hoverContent);
        }
        else {
            this._managedHover.clear();
        }
    }
    _getHoverContents() {
        let label = localize('chat.modelPicker.label', "Pick Model");
        const keybindingLabel = this.keybindingService.lookupKeybinding(this._action.id, this._contextKeyService)?.getLabel();
        if (keybindingLabel) {
            label += ` (${keybindingLabel})`;
        }
        const { statusIcon, tooltip } = this._pickerWidget.selectedModel?.metadata || {};
        return statusIcon && tooltip ? `${label} • ${tooltip}` : label;
    }
};
EnhancedModelPickerActionItem = __decorate([
    __param(3, IInstantiationService),
    __param(4, IContextKeyService),
    __param(5, IKeybindingService)
], EnhancedModelPickerActionItem);
export { EnhancedModelPickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxQaWNrZXJBY3Rpb25JdGVtMi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXJBY3Rpb25JdGVtMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFeEUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDdEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFFcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUd6RDs7Ozs7R0FLRztBQUNJLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQThCLFNBQVEsa0JBQWtCO0lBSXBFLFlBQ0MsTUFBZSxFQUNmLFFBQThCLEVBQ2IsYUFBc0MsRUFDaEMsb0JBQTJDLEVBQzlDLGtCQUF1RCxFQUN2RCxpQkFBc0Q7UUFFMUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMs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