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
var DocumentSymbolFilter_1;
import * as dom from '../../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { createMatches } from '../../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { getAriaLabelForSymbol, symbolKindNames, SymbolKinds } from '../../../../../editor/common/languages.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { OutlineElement, OutlineGroup, OutlineModel } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { fillInSymbolsDragData } from '../../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { withSelection } from '../../../../../platform/opener/common/opener.js';
import { listErrorForeground, listWarningForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import './documentSymbolsTree.css';
export class DocumentSymbolNavigationLabelProvider {
    getKeyboardNavigationLabel(element) {
        if (element instanceof OutlineGroup) {
            return element.label;
        }
        else {
            return element.symbol.name;
        }
    }
}
export class DocumentSymbolAccessibilityProvider {
    constructor(_ariaLabel) {
        this._ariaLabel = _ariaLabel;
    }
    getWidgetAriaLabel() {
        return this._ariaLabel;
    }
    getAriaLabel(element) {
        if (element instanceof OutlineGroup) {
            return element.label;
        }
        else {
            return getAriaLabelForSymbol(element.symbol.name, element.symbol.kind);
        }
    }
}
export class DocumentSymbolIdentityProvider {
    getId(element) {
        return element.id;
    }
}
let DocumentSymbolDragAndDrop = class DocumentSymbolDragAndDrop {
    constructor(_instantiationService) {
        this._instantiationService = _instantiationService;
    }
    getDragURI(element) {
        const resource = OutlineModel.get(element)?.uri;
        if (!resource) {
            return null;
        }
        if (element instanceof OutlineElement) {
            const symbolUri = symbolRangeUri(resource, element.symbol);
            return symbolUri.fsPath + (symbolUri.fragment ? '#' + symbolUri.fragment : '');
        }
        else {
            return resource.fsPath;
        }
    }
    getDragLabel(elements, originalEvent) {
        // Multi select not supported
        if (elements.length !== 1) {
            return undefined;
        }
        const element = elements[0];
        return element instanceof OutlineElement ? element.symbol.name : element.label;
    }
    onDragStart(data, originalEvent) {
        const elements = data.elements;
        const item = elements[0];
        if (!item || !originalEvent.dataTransfer) {
            return;
        }
        const resource = OutlineModel.get(item)?.uri;
        if (!resource) {
            return;
        }
        const outlineElements = item instanceof OutlineElement ? [item] : Array.from(item.children.values());
        fillInSymbolsDragData(outlineElements.map(oe => ({
            name: oe.symbol.name,
            fsPath: resource.fsPath,
            range: oe.symbol.range,
            kind: oe.symbol.kind
        })), originalEvent);
        this._instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, outlineElements.map((oe) => ({
            resource,
            selection: oe.symbol.range,
        })), originalEvent));
    }
    onDragOver() { return false; }
    drop() { }
    dispose() { }
};
DocumentSymbolDragAndDrop = __decorate([
    __param(0, IInstantiationService)
], DocumentSymbolDragAndDrop);
export { DocumentSymbolDragAndDrop };
function symbolRangeUri(resource, symbol) {
    return withSelection(resource, symbol.range);
}
class DocumentSymbolGroupTemplate {
    static { this.id = 'DocumentSymbolGroupTemplate'; }
    constructor(labelContainer, label) {
        this.labelContainer = labelContainer;
        this.label = label;
    }
    dispose() {
        this.label.dispose();
    }
}
class DocumentSymbolTemplate {
    static { this.id = 'DocumentSymbolTemplate'; }
    constructor(container, iconLabel, iconClass, decoration) {
        this.container = container;
        this.iconLabel = iconLabel;
        this.iconClass = iconClass;
        this.decoration = decoration;
    }
}
export class DocumentSymbolVirtualDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(element) {
        return element instanceof OutlineGroup
            ? DocumentSymbolGroupTemplate.id
            : DocumentSymbolTemplate.id;
    }
}
export class DocumentSymbolGroupRenderer {
    constructor() {
        this.templateId = DocumentSymbolGroupTemplate.id;
    }
    renderTemplate(container) {
        const labelContainer = dom.$('.outline-element-label');
        container.classList.add('outline-element');
        dom.append(container, labelContainer);
        return new DocumentSymbolGroupTemplate(labelContainer, new HighlightedLabel(labelContainer));
    }
    renderElement(node, _index, template) {
        template.label.set(node.element.label, createMatches(node.filterData));
    }
    disposeTemplate(_template) {
        _template.dispose();
    }
}
let DocumentSymbolRenderer = class DocumentSymbolRenderer {
    constructor(_renderMarker, target, _configurationService, _themeService) {
        this._renderMarker = _renderMarker;
        this._configurationService = _configurationService;
        this._themeService = _themeService;
        this.templateId = DocumentSymbolTemplate.id;
    }
    renderTemplate(container) {
        container.classList.add('outline-element');
        const iconLabel = new IconLabel(container, { supportHighlights: true });
        const iconClass = dom.$('.outline-element-icon');
        const decoration = dom.$('.outline-element-decoration');
        container.prepend(iconClass);
        container.appendChild(decoration);
        return new DocumentSymbolTemplate(container, iconLabel, iconClass, decoration);
    }
    renderElement(node, _index, template) {
        const { element } = node;
        const extraClasses = ['nowrap'];
        const options = {
            matches: createMatches(node.filterData),
            labelEscapeNewLines: true,
            extraClasses,
            title: localize('title.template', "{0} ({1})", element.symbol.name, symbolKindNames[element.symbol.kind])
        };
        if (this._configurationService.getValue("outline.icons" /* OutlineConfigKeys.icons */)) {
            // add styles for the icons
            template.iconClass.className = '';
            template.iconClass.classList.add('outline-element-icon', 'inline', 'codicon-colored', ...ThemeIcon.asClassNameArray(SymbolKinds.toIcon(element.symbol.kind)));
        }
        if (element.symbol.tags.indexOf(1 /* SymbolTag.Deprecated */) >= 0) {
            extraClasses.push(`deprecated`);
            options.matches = [];
        }
        template.iconLabel.setLabel(element.symbol.name, element.symbol.detail, options);
        if (this._renderMarker) {
            this._renderMarkerInfo(element, template);
        }
    }
    _renderMarkerInfo(element, template) {
        if (!element.marker) {
            dom.hide(template.decoration);
            template.container.style.removeProperty('--outline-element-color');
            return;
        }
        const { count, topSev } = element.marker;
        const color = this._themeService.getColorTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
        const cssColor = color ? color.toString() : 'inherit';
        // color of the label
        const problem = this._configurationService.getValue('problems.visibility');
        const configProblems = this._configurationService.getValue("outline.problems.colors" /* OutlineConfigKeys.problemsColors */);
        if (!problem || !configProblems) {
            template.container.style.removeProperty('--outline-element-color');
        }
        else {
            template.container.style.setProperty('--outline-element-color', cssColor);
        }
        // badge with color/rollup
        if (problem === undefined) {
            return;
        }
        const configBadges = this._configurationService.getValue("outline.problems.badges" /* OutlineConfigKeys.problemsBadges */);
        if (!configBadges || !problem) {
            dom.hide(template.decoration);
        }
        else if (count > 0) {
            dom.show(template.decoration);
            template.decoration.classList.remove('bubble');
            template.decoration.textContent = count < 10 ? count.toString() : '+9';
            template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
            template.decoration.style.setProperty('--outline-element-color', cssColor);
        }
        else {
            dom.show(template.decoration);
            template.decoration.classList.add('bubble');
            template.decoration.textContent = '\uea71';
            template.decoration.title = localize('deep.problem', "Contains elements with problems");
            template.decoration.style.setProperty('--outline-element-color', cssColor);
        }
    }
    disposeTemplate(_template) {
        _template.iconLabel.dispose();
    }
};
DocumentSymbolRenderer = __decorate([
    __param(2, IConfigurationService),
    __param(3, IThemeService)
], DocumentSymbolRenderer);
export { DocumentSymbolRenderer };
let DocumentSymbolFilter = class DocumentSymbolFilter {
    static { DocumentSymbolFilter_1 = this; }
    static { this.kindToConfigName = Object.freeze({
        [0 /* SymbolKind.File */]: 'showFiles',
        [1 /* SymbolKind.Module */]: 'showModules',
        [2 /* SymbolKind.Namespace */]: 'showNamespaces',
        [3 /* SymbolKind.Package */]: 'showPackages',
        [4 /* SymbolKind.Class */]: 'showClasses',
        [5 /* SymbolKind.Method */]: 'showMethods',
        [6 /* SymbolKind.Property */]: 'showProperties',
        [7 /* SymbolKind.Field */]: 'showFields',
        [8 /* SymbolKind.Constructor */]: 'showConstructors',
        [9 /* SymbolKind.Enum */]: 'showEnums',
        [10 /* SymbolKind.Interface */]: 'showInterfaces',
        [11 /* SymbolKind.Function */]: 'showFunctions',
        [12 /* SymbolKind.Variable */]: 'showVariables',
        [13 /* SymbolKind.Constant */]: 'showConstants',
        [14 /* SymbolKind.String */]: 'showStrings',
        [15 /* SymbolKind.Number */]: 'showNumbers',
        [16 /* SymbolKind.Boolean */]: 'showBooleans',
        [17 /* SymbolKind.Array */]: 'showArrays',
        [18 /* SymbolKind.Object */]: 'showObjects',
        [19 /* SymbolKind.Key */]: 'showKeys',
        [20 /* SymbolKind.Null */]: 'showNull',
        [21 /* SymbolKind.EnumMember */]: 'showEnumMembers',
        [22 /* SymbolKind.Struct */]: 'showStructs',
        [23 /* SymbolKind.Event */]: 'showEvents',
        [24 /* SymbolKind.Operator */]: 'showOperators',
        [25 /* SymbolKind.TypeParameter */]: 'showTypeParameters',
    }); }
    constructor(_prefix, _textResourceConfigService) {
        this._prefix = _prefix;
        this._textResourceConfigService = _textResourceConfigService;
    }
    filter(element) {
        const outline = OutlineModel.get(element);
        if (!(element instanceof OutlineElement)) {
            return true;
        }
        const configName = DocumentSymbolFilter_1.kindToConfigName[element.symbol.kind];
        const configKey = `${this._prefix}.${configName}`;
        return this._textResourceConfigService.getValue(outline?.uri, configKey);
    }
};
DocumentSymbolFilter = DocumentSymbolFilter_1 = __decorate([
    __param(1, ITextResourceConfigurationService)
], DocumentSymbolFilter);
export { DocumentSymbolFilter };
export class DocumentSymbolComparator {
    constructor() {
        this._collator = safeIntl.Collator(undefined, { numeric: true });
    }
    compareByPosition(a, b) {
        if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
            return a.order - b.order;
        }
        else if (a instanceof OutlineElement && b instanceof OutlineElement) {
            return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range) || this._collator.value.compare(a.symbol.name, b.symbol.name);
        }
        return 0;
    }
    compareByType(a, b) {
        if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
            return a.order - b.order;
        }
        else if (a instanceof OutlineElement && b instanceof OutlineElement) {
            return a.symbol.kind - b.symbol.kind || this._collator.value.compare(a.symbol.name, b.symbol.name);
        }
        return 0;
    }
    compareByName(a, b) {
        if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
            return a.order - b.order;
        }
        else if (a instanceof OutlineElement && b instanceof OutlineElement) {
            return this._collator.value.compare(a.symbol.name, b.symbol.name) || Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
        }
        return 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9jdW1lbnRTeW1ib2xzVHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9vdXRsaW5lL2RvY3VtZW50U3ltYm9sc1RyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDdkcsT0FBTyxFQUFFLFNBQVMsRUFBMEIsTUFBTSx1REFBdUQsQ0FBQztBQUsxRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBYyxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFrQixxQkFBcUIsRUFBYyxlQUFlLEVBQUUsV0FBVyxFQUFhLE1BQU0sMkNBQTJDLENBQUM7QUFDdkosT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDdkgsT0FBTyxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDbkksT0FBTyxrRUFBa0UsQ0FBQyxDQUFDLDhFQUE4RTtBQUN6SixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFpQixNQUFNLDRDQUE0QyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxxQkFBcUIsRUFB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