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
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
let UnfocusedViewDimmingContribution = class UnfocusedViewDimmingContribution extends Disposable {
    constructor(configurationService) {
        super();
        this._styleElementDisposables = undefined;
        this._register(toDisposable(() => this._removeStyleElement()));
        this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
            if (e && !e.affectsConfiguration("accessibility.dimUnfocused.enabled" /* AccessibilityWorkbenchSettingId.DimUnfocusedEnabled */) && !e.affectsConfiguration("accessibility.dimUnfocused.opacity" /* AccessibilityWorkbenchSettingId.DimUnfocusedOpacity */)) {
                return;
            }
            let cssTextContent = '';
            const enabled = ensureBoolean(configurationService.getValue("accessibility.dimUnfocused.enabled" /* AccessibilityWorkbenchSettingId.DimUnfocusedEnabled */), false);
            if (enabled) {
                const opacity = clamp(ensureNumber(configurationService.getValue("accessibility.dimUnfocused.opacity" /* AccessibilityWorkbenchSettingId.DimUnfocusedOpacity */), 0.75 /* ViewDimUnfocusedOpacityProperties.Default */), 0.2 /* ViewDimUnfocusedOpacityProperties.Minimum */, 1 /* ViewDimUnfocusedOpacityProperties.Maximum */);
                if (opacity !== 1) {
                    // These filter rules are more specific than may be expected as the `filter`
                    // rule can cause problems if it's used inside the element like on editor hovers
                    const rules = new Set();
                    const filterRule = `filter: opacity(${opacity});`;
                    // Terminal tabs
                    rules.add(`.monaco-workbench .pane-body.integrated-terminal:not(:focus-within) .tabs-container { ${filterRule} }`);
                    // Terminals
                    rules.add(`.monaco-workbench .pane-body.integrated-terminal .terminal-wrapper:not(:focus-within) { ${filterRule} }`);
                    // Text editors
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor { ${filterRule} }`);
                    // Breadcrumbs
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .breadcrumbs-below-tabs { ${filterRule} }`);
                    // Terminal editors
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .terminal-wrapper { ${filterRule} }`);
                    // Settings editor
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .settings-editor { ${filterRule} }`);
                    // Keybindings editor
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .keybindings-editor { ${filterRule} }`);
                    // Editor placeholder (error case)
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor-pane-placeholder { ${filterRule} }`);
                    // Welcome editor
                    rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .gettingStartedContainer { ${filterRule} }`);
                    cssTextContent = [...rules].join('\n');
                }
            }
            if (cssTextContent.length === 0) {
                this._removeStyleElement();
            }
            else {
                this._getStyleElement().textContent = cssTextContent;
            }
        }));
    }
    _getStyleElement() {
        if (!this._styleElement) {
            this._styleElementDisposables = new DisposableStore();
            this._styleElement = createStyleSheet(undefined, undefined, this._styleElementDisposables);
            this._styleElement.className = 'accessibilityUnfocusedViewOpacity';
        }
        return this._styleElement;
    }
    _removeStyleElement() {
        this._styleElementDisposables?.dispose();
        this._styleElementDisposables = undefined;
        this._styleElement = undefined;
    }
};
UnfocusedViewDimmingContribution = __decorate([
    __param(0, IConfigurationService)
], UnfocusedViewDimmingContribution);
export { UnfocusedViewDimmingContribution };
function ensureBoolean(value, defaultValue) {
    return typeof value === 'boolean' ? value : defaultValue;
}
function ensureNumber(value, defaultValue) {
    return typeof value === 'number' ? value : defaultValue;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5mb2N1c2VkVmlld0RpbW1pbmdDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvdW5mb2N1c2VkVmlld0RpbW1pbmdDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUk1RixJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFpQyxTQUFRLFVBQVU7SUFJL0QsWUFDd0Isb0JBQTJDO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBTEQsNkJBQXdCLEdBQWdDLFNBQVMsQ0FBQztRQU96RSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFL0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixnR0FBcUQsSUFBSSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsZ0dBQXFELEVBQUUsQ0FBQztnQkFDdkssT0FBTztZQUNSLENBQUM7WUFFRCxJ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