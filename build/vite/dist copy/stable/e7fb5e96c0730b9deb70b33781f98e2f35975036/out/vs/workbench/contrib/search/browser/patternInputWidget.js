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
import * as dom from '../../../../base/browser/dom.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import * as nls from '../../../../nls.js';
import { ContextScopedHistoryInputBox } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { showHistoryKeybindingHint } from '../../../../platform/history/browser/historyWidgetKeybindingHint.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
let PatternInputWidget = class PatternInputWidget extends Widget {
    static { this.OPTION_CHANGE = 'optionChange'; }
    constructor(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService) {
        super();
        this.contextViewProvider = contextViewProvider;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this._onSubmit = this._register(new Emitter());
        this.onSubmit = this._onSubmit.event;
        this._onCancel = this._register(new Emitter());
        this.onCancel = this._onCancel.event;
        options = {
            ...{
                ariaLabel: nls.localize('defaultLabel', "input")
            },
            ...options,
        };
        this.width = options.width ?? 100;
        this.render(options);
        parent.appendChild(this.domNode);
    }
    dispose() {
        super.dispose();
        this.inputFocusTracker?.dispose();
    }
    setWidth(newWidth) {
        this.width = newWidth;
        this.contextViewProvider.layout();
        this.setInputWidth();
    }
    getValue() {
        return this.inputBox.value;
    }
    setValue(value) {
        if (this.inputBox.value !== value) {
            this.inputBox.value = value;
        }
    }
    select() {
        this.inputBox.select();
    }
    focus() {
        this.inputBox.focus();
    }
    inputHasFocus() {
        return this.inputBox.hasFocus();
    }
    setInputWidth() {
        this.inputBox.width = this.width - this.getSubcontrolsWidth() - 2; // 2 for input box border
    }
    getSubcontrolsWidth() {
        return 0;
    }
    getHistory() {
        return this.inputBox.getHistory();
    }
    clearHistory() {
        this.inputBox.clearHistory();
    }
    prependHistory(history) {
        this.inputBox.prependHistory(history);
    }
    clear() {
        this.setValue('');
    }
    onSearchSubmit() {
        this.inputBox.addToHistory();
    }
    showNextTerm() {
        this.inputBox.showNextValue();
    }
    showPreviousTerm() {
        this.inputBox.showPreviousValue();
    }
    render(options) {
        this.domNode = document.createElement('div');
        this.domNode.classList.add('monaco-findInput');
        const history = options.history || [];
        this.inputBox = this._register(new ContextScopedHistoryInputBox(this.domNode, this.contextViewProvider, {
            placeholder: options.placeholder,
            showPlaceholderOnFocus: options.showPlaceholderOnFocus,
            tooltip: options.tooltip,
            ariaLabel: options.ariaLabel,
            validationOptions: {
                validation: undefined
            },
            history: new Set(history),
            showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
            inputBoxStyles: options.inputBoxStyles
        }, this.contextKeyService));
        this._register(this.inputBox.onDidChange(() => this._onSubmit.fire(true)));
        this.inputFocusTracker = dom.trackFocus(this.inputBox.inputElement);
        this.onkeyup(this.inputBox.inputElement, (keyboardEvent) => this.onInputKeyUp(keyboardEvent));
        const controls = document.createElement('div');
        controls.className = 'controls';
        this.renderSubcontrols(controls);
        this.domNode.appendChild(controls);
        this.setInputWidth();
    }
    renderSubcontrols(_controlsDiv) {
    }
    onInputKeyUp(keyboardEvent) {
        switch (keyboardEvent.keyCode) {
            case 3 /* KeyCode.Enter */:
                this.onSearchSubmit();
                this._onSubmit.fire(false);
                return;
            case 9 /* KeyCode.Escape */:
                this._onCancel.fire();
                return;
        }
    }
};
PatternInputWidget = __decorate([
    __param(3, IContextKeyService),
    __param(4, IConfigurationService),
    __param(5, IKeybindingService)
], PatternInputWidget);
export { PatternInputWidget };
let IncludePatternInputWidget = class IncludePatternInputWidget extends PatternInputWidget {
    constructor(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService) {
        super(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService);
        this._onChangeSearchInEditorsBoxEmitter = this._register(new Emitter());
        this.onChangeSearchInEditorsBox = this._onChangeSearchInEditorsBoxEmitter.event;
    }
    dispose() {
        super.dispose();
        this.useSearchInEditorsBox.dispose();
    }
    onlySearchInOpenEditors() {
        return this.useSearchInEditorsBox.checked;
    }
    setOnlySearchInOpenEditors(value) {
        this.useSearchInEditorsBox.checked = value;
        this._onChangeSearchInEditorsBoxEmitter.fire();
    }
    getSubcontrolsWidth() {
        return super.getSubcontrolsWidth() + this.useSearchInEditorsBox.width();
    }
    renderSubcontrols(controlsDiv) {
        this.useSearchInEditorsBox = this._register(new Toggle({
            icon: Codicon.book,
            title: nls.localize('onlySearchInOpenEditors', "Search only in Open Editors"),
            isChecked: false,
            ...defaultToggleStyles
        }));
        this._register(this.useSearchInEditorsBox.onChange(viaKeyboard => {
            this._onChangeSearchInEditorsBoxEmitter.fire();
            if (!viaKeyboard) {
                this.inputBox.focus();
            }
        }));
        controlsDiv.appendChild(this.useSearchInEditorsBox.domNode);
        super.renderSubcontrols(controlsDiv);
    }
};
IncludePatternInputWidget = __decorate([
    __param(3, IContextKeyService),
    __param(4, IConfigurationService),
    __param(5, IKeybindingService)
], IncludePatternInputWidget);
export { IncludePatternInputWidget };
let ExcludePatternInputWidget = class ExcludePatternInputWidget extends PatternInputWidget {
    constructor(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService) {
        super(parent, contextViewProvider, options, contextKeyService, configurationService, keybindingService);
        this._onChangeIgnoreBoxEmitter = this._register(new Emitter());
        this.onChangeIgnoreBox = this._onChangeIgnoreBoxEmitter.event;
    }
    dispose() {
        super.dispose();
        this.useExcludesAndIgnoreFilesBox.dispose();
    }
    useExcludesAndIgnoreFiles() {
        return this.useExcludesAndIgnoreFilesBox.checked;
    }
    setUseExcludesAndIgnoreFiles(value) {
        this.useExcludesAndIgnoreFilesBox.checked = value;
        this._onChangeIgnoreBoxEmitter.fire();
    }
    getSubcontrolsWidth() {
        return super.getSubcontrolsWidth() + this.useExcludesAndIgnoreFilesBox.width();
    }
    renderSubcontrols(controlsDiv) {
        this.useExcludesAndIgnoreFilesBox = this._register(new Toggle({
            icon: Codicon.exclude,
            actionClassName: 'useExcludesAndIgnoreFiles',
            title: nls.localize('useExcludesAndIgnoreFilesDescription', "Use Exclude Settings and Ignore Files"),
            isChecked: true,
            ...defaultToggleStyles
        }));
        this._register(this.useExcludesAndIgnoreFilesBox.onChange(viaKeyboard => {
            this._onChangeIgnoreBoxEmitter.fire();
            if (!viaKeyboard) {
                this.inputBox.focus();
            }
        }));
        controlsDiv.appendChild(this.useExcludesAndIgnoreFilesBox.domNode);
        super.renderSubcontrols(controlsDiv);
    }
};
ExcludePatternInputWidget = __decorate([
    __param(3, IContextKeyService),
    __param(4, IConfigurationService),
    __param(5, IKeybindingService)
], ExcludePatternInputWidget);
export { ExcludePatternInputWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0dGVybklucHV0V2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvcGF0dGVybklucHV0V2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFFdkQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBR3RFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBd0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUVqRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ2xILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBWW5GLElBQU0sa0JBQWtCLEdBQXhCLE1BQU0sa0JBQW1CLFNBQVEsTUFBTTthQUV0QyxrQkFBYSxHQUFXLGNBQWMsQUFBekIsQ0FBMEI7SUFlOUMsWUFBWSxNQUFtQixFQUFVLG1CQUF5QyxFQUFFLE9BQWlCLEVBQ2hGLGlCQUFzRCxFQUNuRCxvQkFBOEQsRUFDakUsaUJBQXNEO1FBRTFF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