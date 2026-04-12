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
var QuickInputTreeRenderer_1;
import * as cssJs from '../../../../base/browser/cssValue.js';
import * as dom from '../../../../base/browser/dom.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { createToggleActionViewItemProvider, TriStateCheckbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { defaultCheckboxStyles } from '../../../theme/browser/defaultStyles.js';
import { isDark } from '../../../theme/common/theme.js';
import { escape } from '../../../../base/common/strings.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { quickInputButtonsToActionArrays } from '../quickInputUtils.js';
const $ = dom.$;
export class QuickInputCheckboxStateHandler extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    }
    setCheckboxState(node, checked) {
        this._onDidChangeCheckboxState.fire({ item: node, checked });
    }
}
let QuickInputTreeRenderer = class QuickInputTreeRenderer extends Disposable {
    static { QuickInputTreeRenderer_1 = this; }
    static { this.ID = 'quickInputTreeElement'; }
    constructor(_hoverDelegate, _buttonTriggeredEmitter, onCheckedEvent, _checkboxStateHandler, _toggleStyles, _contextMenuService, _themeService) {
        super();
        this._hoverDelegate = _hoverDelegate;
        this._buttonTriggeredEmitter = _buttonTriggeredEmitter;
        this.onCheckedEvent = onCheckedEvent;
        this._checkboxStateHandler = _checkboxStateHandler;
        this._toggleStyles = _toggleStyles;
        this._contextMenuService = _contextMenuService;
        this._themeService = _themeService;
        this.templateId = QuickInputTreeRenderer_1.ID;
        this._onDidDisposeFocusedElement = this._register(new Emitter());
        /**
         * This event is emitted when the renderer disposes an element that has focus.
         * This allows the list to re-focus itself and prevent focus from being lost
         * (potentially causing quickinput to dismiss itself) when an element is
         * removed while focused.
         */
        this.onDidDisposeFocusedElement = this._onDidDisposeFocusedElement.event;
    }
    renderTemplate(container) {
        const store = new DisposableStore();
        // Main entry container
        const entry = dom.append(container, $('.quick-input-tree-entry'));
        const checkbox = store.add(new TriStateCheckbox('', false, { ...defaultCheckboxStyles, size: 15 }));
        entry.appendChild(checkbox.domNode);
        const checkboxLabel = dom.append(entry, $('label.quick-input-tree-label'));
        const rows = dom.append(checkboxLabel, $('.quick-input-tree-rows'));
        const row1 = dom.append(rows, $('.quick-input-tree-row'));
        const icon = dom.prepend(row1, $('.quick-input-tree-icon'));
        const label = store.add(new IconLabel(row1, {
            supportHighlights: true,
            supportDescriptionHighlights: true,
            supportIcons: true,
            hoverDelegate: this._hoverDelegate
        }));
        const actionBar = store.add(new ToolBar(entry, this._contextMenuService, {
            actionViewItemProvider: createToggleActionViewItemProvider(this._toggleStyles),
            hoverDelegate: this._hoverDelegate,
            icon: true,
            label: false
        }));
        actionBar.getElement().classList.add('quick-input-tree-entry-action-bar');
        return {
            toDisposeTemplate: store,
            entry,
            checkbox,
            icon,
            label,
            actionBar,
            toDisposeElement: new DisposableStore(),
        };
    }
    renderElement(node, _index, templateData, _details) {
        const store = templateData.toDisposeElement;
        const quickTreeItem = node.element;
        // Checkbox
        if (quickTreeItem.pickable === false) {
            // Hide checkbox for non-pickable items
            templateData.checkbox.domNode.style.display = 'none';
        }
        else {
            const checkbox = templateData.checkbox;
            checkbox.domNode.style.display = '';
            checkbox.checked = quickTreeItem.checked ?? false;
            store.add(Event.filter(this.onCheckedEvent, e => e.item === quickTreeItem)(e => checkbox.checked = e.checked));
            if (quickTreeItem.disabled) {
                checkbox.disable();
            }
            store.add(checkbox.onChange((e) => this._checkboxStateHandler.setCheckboxState(quickTreeItem, checkbox.checked)));
        }
        // Icon
        if (quickTreeItem.iconPath) {
            const icon = isDark(this._themeService.getColorTheme().type) ? quickTreeItem.iconPath.dark : (quickTreeItem.iconPath.light ?? quickTreeItem.iconPath.dark);
            const iconUrl = URI.revive(icon);
            templateData.icon.className = 'quick-input-tree-icon';
            templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
        }
        else {
            templateData.icon.style.backgroundImage = '';
            templateData.icon.className = quickTreeItem.iconClass ? `quick-input-tree-icon ${quickTreeItem.iconClass}` : '';
        }
        const { labelHighlights: matches, descriptionHighlights: descriptionMatches } = node.filterData || {};
        // Label and Description
        let descriptionTitle;
        // NOTE: If we bring back quick tool tips, we need to check that here like we do in the QuickInputListRenderer
        if (quickTreeItem.description) {
            descriptionTitle = {
                markdown: {
                    value: escape(quickTreeItem.description),
                    supportThemeIcons: true
                },
                markdownNotSupportedFallback: quickTreeItem.description
            };
        }
        templateData.label.setLabel(quickTreeItem.label, quickTreeItem.description, {
            matches,
            descriptionMatches,
            extraClasses: quickTreeItem.iconClasses,
            italic: quickTreeItem.italic,
            strikethrough: quickTreeItem.strikethrough,
            labelEscapeNewLines: true,
            descriptionTitle
        });
        // Action Bar
        const buttons = quickTreeItem.buttons;
        if (buttons && buttons.length) {
            const { primary, secondary } = quickInputButtonsToActionArrays(buttons, 'quick-input-tree', (button) => this._buttonTriggeredEmitter.fire({ item: quickTreeItem, button }));
            templateData.actionBar.setActions(primary, secondary);
            templateData.entry.classList.add('has-actions');
        }
        else {
            templateData.actionBar.setActions([]);
            templateData.entry.classList.remove('has-actions');
        }
    }
    disposeElement(_element, _index, templateData, _details) {
        if (dom.isAncestorOfActiveElement(templateData.entry)) {
            this._onDidDisposeFocusedElement.fire();
        }
        templateData.toDisposeElement.clear();
        templateData.actionBar.setActions([]);
    }
    disposeTemplate(templateData) {
        templateData.toDisposeElement.dispose();
        templateData.toDisposeTemplate.dispose();
    }
};
QuickInputTreeRenderer = QuickInputTreeRenderer_1 = __decorate([
    __param(5, IContextMenuService),
    __param(6, IThemeService)
], QuickInputTreeRenderer);
export { QuickInputTreeRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFRyZWVSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci90cmVlL3F1aWNrSW5wdXRUcmVlUmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxLQUFLLE1BQU0sc0NBQXNDLENBQUM7QUFDOUQsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHekUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxrQ0FBa0MsRUFBaUIsZ0JBQWdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVuSSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBR3hFLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7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