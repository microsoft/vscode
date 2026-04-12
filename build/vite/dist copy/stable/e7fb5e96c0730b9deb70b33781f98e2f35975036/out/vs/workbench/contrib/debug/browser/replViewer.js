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
var ReplGroupRenderer_1, ReplOutputElementRenderer_1, ReplVariablesRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CachedListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { createMatches } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import severity from '../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IDebugService } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { RawObjectReplElement, ReplEvaluationInput, ReplEvaluationResult, ReplGroup, ReplOutputElement, ReplVariableElement } from '../common/replModel.js';
import { AbstractExpressionsRenderer } from './baseDebugView.js';
import { debugConsoleEvaluationInput } from './debugIcons.js';
const $ = dom.$;
export class ReplEvaluationInputsRenderer {
    static { this.ID = 'replEvaluationInput'; }
    get templateId() {
        return ReplEvaluationInputsRenderer.ID;
    }
    renderTemplate(container) {
        dom.append(container, $('span.arrow' + ThemeIcon.asCSSSelector(debugConsoleEvaluationInput)));
        const input = dom.append(container, $('.expression'));
        const label = new HighlightedLabel(input);
        return { label };
    }
    renderElement(element, index, templateData) {
        const evaluation = element.element;
        templateData.label.set(evaluation.value, createMatches(element.filterData));
    }
    disposeTemplate(templateData) {
        templateData.label.dispose();
    }
}
let ReplGroupRenderer = class ReplGroupRenderer {
    static { ReplGroupRenderer_1 = this; }
    static { this.ID = 'replGroup'; }
    constructor(expressionRenderer, instaService) {
        this.expressionRenderer = expressionRenderer;
        this.instaService = instaService;
    }
    get templateId() {
        return ReplGroupRenderer_1.ID;
    }
    renderTemplate(container) {
        container.classList.add('group');
        const expression = dom.append(container, $('.output.expression.value-and-source'));
        const label = dom.append(expression, $('span.label'));
        const source = this.instaService.createInstance(SourceWidget, expression);
        return { label, source };
    }
    renderElement(element, _index, templateData) {
        templateData.elementDisposable?.dispose();
        const replGroup = element.element;
        dom.clearNode(templateData.label);
        templateData.elementDisposable = this.expressionRenderer.renderValue(templateData.label, replGroup.name, { wasANSI: true, session: element.element.session });
        templateData.source.setSource(replGroup.sourceData);
    }
    disposeTemplate(templateData) {
        templateData.elementDisposable?.dispose();
        templateData.source.dispose();
    }
};
ReplGroupRenderer = ReplGroupRenderer_1 = __decorate([
    __param(1, IInstantiationService)
], ReplGroupRenderer);
export { ReplGroupRenderer };
export class ReplEvaluationResultsRenderer {
    static { this.ID = 'replEvaluationResult'; }
    get templateId() {
        return ReplEvaluationResultsRenderer.ID;
    }
    constructor(expressionRenderer) {
        this.expressionRenderer = expressionRenderer;
    }
    renderTemplate(container) {
        const output = dom.append(container, $('.evaluation-result.expression'));
        const value = dom.append(output, $('span.value'));
        return { value, elementStore: new DisposableStore() };
    }
    renderElement(element, index, templateData) {
        templateData.elementStore.clear();
        const expression = element.element;
        templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, expression, {
            colorize: true,
            hover: false,
            session: element.element.getSession(),
        }));
    }
    disposeTemplate(templateData) {
        templateData.elementStore.dispose();
    }
}
let ReplOutputElementRenderer = class ReplOutputElementRenderer {
    static { ReplOutputElementRenderer_1 = this; }
    static { this.ID = 'outputReplElement'; }
    constructor(expressionRenderer, instaService) {
        this.expressionRenderer = expressionRenderer;
        this.instaService = instaService;
    }
    get templateId() {
        return ReplOutputElementRenderer_1.ID;
    }
    renderTemplate(container) {
        const data = Object.create(null);
        container.classList.add('output');
        const expression = dom.append(container, $('.output.expression.value-and-source'));
        data.container = container;
        data.countContainer = dom.append(expression, $('.count-badge-wrapper'));
        data.count = new CountBadge(data.countContainer, {}, defaultCountBadgeStyles);
        data.value = dom.append(expression, $('span.value.label'));
        data.source = this.instaService.createInstance(SourceWidget, expression);
        data.elementDisposable = new DisposableStore();
        return data;
    }
    renderElement({ element }, index, templateData) {
        templateData.elementDisposable.clear();
        this.setElementCount(element, templateData);
        templateData.elementDisposable.add(element.onDidChangeCount(() => this.setElementCount(element, templateData)));
        // value
        dom.clearNode(templateData.value);
        // Reset classes to clear ansi decorations since templates are reused
        templateData.value.className = 'value';
        const locationReference = element.expression?.valueLocationReference;
        templateData.elementDisposable.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
            wasANSI: true,
            session: element.session,
            locationReference,
            hover: false,
        }));
        templateData.value.classList.add((element.severity === severity.Warning) ? 'warn' : (element.severity === severity.Error) ? 'error' : (element.severity === severity.Ignore) ? 'ignore' : 'info');
        templateData.source.setSource(element.sourceData);
        templateData.getReplElementSource = () => element.sourceData;
    }
    setElementCount(element, templateData) {
        if (element.count >= 2) {
            templateData.count.setCount(element.count);
            templateData.countContainer.hidden = false;
        }
        else {
            templateData.countContainer.hidden = true;
        }
    }
    disposeTemplate(templateData) {
        templateData.source.dispose();
        templateData.elementDisposable.dispose();
        templateData.count.dispose();
    }
    disposeElement(_element, _index, templateData) {
        templateData.elementDisposable.clear();
    }
};
ReplOutputElementRenderer = ReplOutputElementRenderer_1 = __decorate([
    __param(1, IInstantiationService)
], ReplOutputElementRenderer);
export { ReplOutputElementRenderer };
let ReplVariablesRenderer = class ReplVariablesRenderer extends AbstractExpressionsRenderer {
    static { ReplVariablesRenderer_1 = this; }
    static { this.ID = 'replVariable'; }
    get templateId() {
        return ReplVariablesRenderer_1.ID;
    }
    constructor(expressionRenderer, debugService, contextViewService, hoverService) {
        super(debugService, contextViewService, hoverService);
        this.expressionRenderer = expressionRenderer;
    }
    renderElement(node, _index, data) {
        const element = node.element;
        data.elementDisposable.clear();
        super.renderExpressionElement(element instanceof ReplVariableElement ? element.expression : element, node, data);
    }
    renderExpression(expression, data, highlights) {
        const isReplVariable = expression instanceof ReplVariableElement;
        if (isReplVariable || !expression.name) {
            data.label.set('');
            const value = isReplVariable ? expression.expression : expression;
            data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, value, { colorize: true, hover: false, session: expression.getSession() }));
            data.expression.classList.remove('nested-variable');
        }
        else {
            data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, { showChanged: true, highlights }));
            data.expression.classList.toggle('nested-variable', isNestedVariable(expression));
        }
    }
    getInputBoxOptions(expression) {
        return undefined;
    }
};
ReplVariablesRenderer = ReplVariablesRenderer_1 = __decorate([
    __param(1, IDebugService),
    __param(2, IContextViewService),
    __param(3, IHoverService)
], ReplVariablesRenderer);
export { ReplVariablesRenderer };
export class ReplRawObjectsRenderer {
    static { this.ID = 'rawObject'; }
    constructor(expressionRenderer) {
        this.expressionRenderer = expressionRenderer;
    }
    get templateId() {
        return ReplRawObjectsRenderer.ID;
    }
    renderTemplate(container) {
        container.classList.add('output');
        const expression = dom.append(container, $('.output.expression'));
        const name = dom.append(expression, $('span.name'));
        const label = new HighlightedLabel(name);
        const value = dom.append(expression, $('span.value'));
        return { container, expression, name, label, value, elementStore: new DisposableStore() };
    }
    renderElement(node, index, templateData) {
        templateData.elementStore.clear();
        // key
        const element = node.element;
        templateData.label.set(element.name ? `${element.name}:` : '', createMatches(node.filterData));
        if (element.name) {
            templateData.name.textContent = `${element.name}:`;
        }
        else {
            templateData.name.textContent = '';
        }
        // value
        templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
            hover: false,
            session: node.element.getSession(),
        }));
    }
    disposeTemplate(templateData) {
        templateData.elementStore.dispose();
        templateData.label.dispose();
    }
}
function isNestedVariable(element) {
    return element instanceof Variable && (element.parent instanceof ReplEvaluationResult || element.parent instanceof Variable);
}
export class ReplDelegate extends CachedListVirtualDelegate {
    constructor(configurationService, replOptions) {
        super();
        this.configurationService = configurationService;
        this.replOptions = replOptions;
    }
    getHeight(element) {
        const config = this.configurationService.getValue('debug');
        if (!config.console.wordWrap) {
            return this.estimateHeight(element, true);
        }
        return super.getHeight(element);
    }
    /**
     * With wordWrap enabled, this is an estimate. With wordWrap disabled, this is the real height that the list will use.
     */
    estimateHeight(element, ignoreValueLength = false) {
        const lineHeight = this.replOptions.replConfiguration.lineHeight;
        const countNumberOfLines = (str) => str.match(/\n/g)?.length ?? 0;
        const hasValue = (e) => typeof e.value === 'string';
        if (hasValue(element) && !isNestedVariable(element)) {
            const value = element.value;
            const valueRows = countNumberOfLines(value)
                + (ignoreValueLength ? 0 : Math.floor(value.length / 70)) // Make an estimate for wrapping
                + (element instanceof ReplOutputElement ? 0 : 1); // A SimpleReplElement ends in \n if it's a complete line
            return Math.max(valueRows, 1) * lineHeight;
        }
        return lineHeight;
    }
    getTemplateId(element) {
        if (element instanceof Variable || element instanceof ReplVariableElement) {
            return ReplVariablesRenderer.ID;
        }
        if (element instanceof ReplEvaluationResult) {
            return ReplEvaluationResultsRenderer.ID;
        }
        if (element instanceof ReplEvaluationInput) {
            return ReplEvaluationInputsRenderer.ID;
        }
        if (element instanceof ReplOutputElement) {
            return ReplOutputElementRenderer.ID;
        }
        if (element instanceof ReplGroup) {
            return ReplGroupRenderer.ID;
        }
        return ReplRawObjectsRenderer.ID;
    }
    hasDynamicHeight(element) {
        if (isNestedVariable(element)) {
            // Nested variables should always be in one line #111843
            return false;
        }
        // Empty elements should not have dynamic height since they will be invisible
        return element.toString().length > 0;
    }
}
function isDebugSession(obj) {
    return typeof obj.getReplElements === 'function';
}
export class ReplDataSource {
    hasChildren(element) {
        if (isDebugSession(element)) {
            return true;
        }
        return !!element.hasChildren;
    }
    getChildren(element) {
        if (isDebugSession(element)) {
            return Promise.resolve(element.getReplElements());
        }
        return Promise.resolve(element.getChildren());
    }
}
export class ReplAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('debugConsole', "Debug Console");
    }
    getAriaLabel(element) {
        if (element instanceof Variable) {
            return localize('replVariableAriaLabel', "Variable {0}, value {1}", element.name, element.value);
        }
        if (element instanceof ReplOutputElement || element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult) {
            return element.value + (element instanceof ReplOutputElement && element.count > 1 ? localize({ key: 'occurred', comment: ['Front will the value of the debug console element. Placeholder will be replaced by a number which represents occurrance count.'] }, ", occurred {0} times", element.count) : '');
        }
        if (element instanceof RawObjectReplElement) {
            return localize('replRawObjectAriaLabel', "Debug console variable {0}, value {1}", element.name, element.value);
        }
        if (element instanceof ReplGroup) {
            return localize('replGroup', "Debug console group {0}", element.name);
        }
        return '';
    }
}
let SourceWidget = class SourceWidget extends Disposable {
    constructor(container, editorService, hoverService, labelService) {
        super();
        this.hoverService = hoverService;
        this.labelService = labelService;
        this.el = dom.append(container, $('.source'));
        this._register(dom.addDisposableListener(this.el, 'click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (this.source) {
                this.source.source.openInEditor(editorService, {
                    startLineNumber: this.source.lineNumber,
                    startColumn: this.source.column,
                    endLineNumber: this.source.lineNumber,
                    endColumn: this.source.column
                });
            }
        }));
    }
    setSource(source) {
        this.source = source;
        this.el.textContent = source ? `${basename(source.source.name)}:${source.lineNumber}` : '';
        this.hover ??= this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.el, ''));
        this.hover.update(source ? `${this.labelService.getUriLabel(source.source.uri)}:${source.lineNumber}` : '');
    }
};
SourceWidget = __decorate([
    __param(1, IEditorService),
    __param(2, IHoverService),
    __param(3, ILabelService)
], SourceWidget);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbFZpZXdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbFZpZXdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDbEYsT0FBTyxFQUFFLGdCQUFnQixFQUFjLE1BQU0sa0VBQWtFLENBQUM7QUFFaEgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHckYsT0FBTyxFQUFFLGFBQWEsRUFBYyxNQUFNLG9DQUFvQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM5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