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
import * as DOM from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { DefaultStyleController } from '../../../../base/browser/ui/list/listWidget.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { settingsHeaderForeground, settingsHeaderHoverForeground } from '../common/settingsEditorColorRegistry.js';
import { SettingsTreeFilter } from './settingsTree.js';
import { SettingsTreeGroupElement, SettingsTreeSettingElement } from './settingsTreeModels.js';
const $ = DOM.$;
let TOCTreeModel = class TOCTreeModel {
    constructor(_viewState, environmentService) {
        this._viewState = _viewState;
        this.environmentService = environmentService;
        this._currentSearchModel = null;
    }
    get settingsTreeRoot() {
        return this._settingsTreeRoot;
    }
    set settingsTreeRoot(value) {
        this._settingsTreeRoot = value;
        this.update();
    }
    get currentSearchModel() {
        return this._currentSearchModel;
    }
    set currentSearchModel(model) {
        this._currentSearchModel = model;
        this.update();
    }
    get children() {
        return this._settingsTreeRoot.children;
    }
    update() {
        if (this._settingsTreeRoot) {
            this.updateGroupCount(this._settingsTreeRoot);
        }
    }
    updateGroupCount(group) {
        group.children.forEach(child => {
            if (child instanceof SettingsTreeGroupElement) {
                this.updateGroupCount(child);
            }
        });
        const childCount = group.children
            .filter(child => child instanceof SettingsTreeGroupElement)
            .reduce((acc, cur) => acc + cur.count, 0);
        group.count = childCount + this.getGroupCount(group);
    }
    getGroupCount(group) {
        return group.children.filter(child => {
            if (!(child instanceof SettingsTreeSettingElement)) {
                return false;
            }
            if (this._currentSearchModel && !this._currentSearchModel.root.containsSetting(child.setting.key)) {
                return false;
            }
            // Check everything that the SettingsFilter checks except whether it's filtered by a category
            const isRemote = !!this.environmentService.remoteAuthority;
            return child.matchesScope(this._viewState.settingsTarget, isRemote) &&
                child.matchesAllTags(this._viewState.tagFilters) &&
                child.matchesAnyFeature(this._viewState.featureFilters) &&
                child.matchesAnyExtension(this._viewState.extensionFilters) &&
                child.matchesAnyId(this._viewState.idFilters);
        }).length;
    }
};
TOCTreeModel = __decorate([
    __param(1, IWorkbenchEnvironmentService)
], TOCTreeModel);
export { TOCTreeModel };
const TOC_ENTRY_TEMPLATE_ID = 'settings.toc.entry';
export class TOCRenderer {
    constructor(_hoverService) {
        this._hoverService = _hoverService;
        this.templateId = TOC_ENTRY_TEMPLATE_ID;
    }
    renderTemplate(container) {
        return {
            labelElement: DOM.append(container, $('.settings-toc-entry')),
            countElement: DOM.append(container, $('.settings-toc-count')),
            elementDisposables: new DisposableStore()
        };
    }
    renderElement(node, index, template) {
        template.elementDisposables.clear();
        const element = node.element;
        const count = element.count;
        const label = element.label;
        template.labelElement.textContent = label;
        template.elementDisposables.add(this._hoverService.setupDelayedHover(template.labelElement, { content: label }));
        if (count) {
            template.countElement.textContent = ` (${count})`;
        }
        else {
            template.countElement.textContent = '';
        }
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
    }
}
class TOCTreeDelegate {
    getTemplateId(element) {
        return TOC_ENTRY_TEMPLATE_ID;
    }
    getHeight(element) {
        return 22;
    }
}
export function createTOCIterator(model, tree) {
    const groupChildren = model.children.filter(c => c instanceof SettingsTreeGroupElement);
    return Iterable.map(groupChildren, g => {
        const hasGroupChildren = g.children.some(c => c instanceof SettingsTreeGroupElement);
        return {
            element: g,
            collapsed: undefined,
            collapsible: hasGroupChildren,
            children: g instanceof SettingsTreeGroupElement ?
                createTOCIterator(g, tree) :
                undefined
        };
    });
}
class SettingsAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize({
            key: 'settingsTOC',
            comment: ['A label for the table of contents for the full settings list']
        }, "Settings Table of Contents");
    }
    getAriaLabel(element) {
        if (!element) {
            return '';
        }
        if (element instanceof SettingsTreeGroupElement) {
            return localize('groupRowAriaLabel', "{0}, group", element.label);
        }
        return '';
    }
    getAriaLevel(element) {
        let i = 1;
        while (element instanceof SettingsTreeGroupElement && element.parent) {
            i++;
            element = element.parent;
        }
        return i;
    }
}
let TOCTree = class TOCTree extends WorkbenchObjectTree {
    constructor(container, viewState, contextKeyService, listService, configurationService, hoverService, instantiationService) {
        // test open mode
        const filter = instantiationService.createInstance(SettingsTreeFilter, viewState, false);
        const options = {
            filter,
            multipleSelectionSupport: false,
            identityProvider: {
                getId(e) {
                    return e.id;
                }
            },
            styleController: id => new DefaultStyleController(domStylesheetsJs.createStyleSheet(container), id),
            accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),
            collapseByDefault: true,
            horizontalScrolling: false,
            hideTwistiesOfChildlessElements: true,
            renderIndentGuides: RenderIndentGuides.None
        };
        super('SettingsTOC', container, new TOCTreeDelegate(), [new TOCRenderer(hoverService)], options, instantiationService, contextKeyService, listService, configurationService);
        this.style(getListStyles({
            listBackground: editorBackground,
            listFocusOutline: focusBorder,
            listActiveSelectionBackground: editorBackground,
            listActiveSelectionForeground: settingsHeaderForeground,
            listFocusAndSelectionBackground: editorBackground,
            listFocusAndSelectionForeground: settingsHeaderForeground,
            listFocusBackground: editorBackground,
            listFocusForeground: settingsHeaderHoverForeground,
            listHoverForeground: settingsHeaderHoverForeground,
            listHoverBackground: editorBackground,
            listInactiveSelectionBackground: editorBackground,
            listInactiveSelectionForeground: settingsHeaderForeground,
            listInactiveFocusBackground: editorBackground,
            listInactiveFocusOutline: editorBackground,
            treeIndentGuidesStroke: undefined,
            treeInactiveIndentGuidesStroke: undefined
        }));
    }
};
TOCTree = __decorate([
    __param(2, IContextKeyService),
    __param(3, IListService),
    __param(4, IConfigurationService),
    __param(5, IHoverService),
    __param(6, IInstantiationService)
], TOCTree);
export { TOCTree };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9jVHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvdG9jVHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxnQkFBZ0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsc0JBQXNCLEVBQThCLE1BQU0sZ0RBQWdELENBQUM7QUFDcEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxZQUFZLEVBQStCLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsd0JBQXdCLEVB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