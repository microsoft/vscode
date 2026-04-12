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
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createMatches } from '../../../../base/common/filters.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IDebugService } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { IDebugVisualizerService } from '../common/debugVisualizers.js';
const $ = dom.$;
export function renderViewTree(container) {
    const treeContainer = $('.');
    treeContainer.classList.add('debug-view-content', 'file-icon-themable-tree');
    container.appendChild(treeContainer);
    return treeContainer;
}
/** Splits highlights based on matching of the {@link expressionAndScopeLabelProvider} */
export const splitExpressionOrScopeHighlights = (e, highlights) => {
    const nameEndsAt = e.name.length;
    const labelBeginsAt = e.name.length + 2;
    const name = [];
    const value = [];
    for (const hl of highlights) {
        if (hl.start < nameEndsAt) {
            name.push({ start: hl.start, end: Math.min(hl.end, nameEndsAt) });
        }
        if (hl.end > labelBeginsAt) {
            value.push({ start: Math.max(hl.start - labelBeginsAt, 0), end: hl.end - labelBeginsAt });
        }
    }
    return { name, value };
};
/** Keyboard label provider for expression and scope tree elements. */
export const expressionAndScopeLabelProvider = {
    getKeyboardNavigationLabel(e) {
        const stripAnsi = e.getSession()?.rememberedCapabilities?.supportsANSIStyling;
        return `${e.name}: ${stripAnsi ? removeAnsiEscapeCodes(e.value) : e.value}`;
    },
};
let AbstractExpressionDataSource = class AbstractExpressionDataSource {
    constructor(debugService, debugVisualizer) {
        this.debugService = debugService;
        this.debugVisualizer = debugVisualizer;
    }
    async getChildren(element) {
        const vm = this.debugService.getViewModel();
        const children = await this.doGetChildren(element);
        return Promise.all(children.map(async (r) => {
            const vizOrTree = vm.getVisualizedExpression(r);
            if (typeof vizOrTree === 'string') {
                const viz = await this.debugVisualizer.getVisualizedNodeFor(vizOrTree, r);
                if (viz) {
                    vm.setVisualizedExpression(r, viz);
                    return viz;
                }
            }
            else if (vizOrTree) {
                return vizOrTree;
            }
            return r;
        }));
    }
};
AbstractExpressionDataSource = __decorate([
    __param(0, IDebugService),
    __param(1, IDebugVisualizerService)
], AbstractExpressionDataSource);
export { AbstractExpressionDataSource };
let AbstractExpressionsRenderer = class AbstractExpressionsRenderer {
    constructor(debugService, contextViewService, hoverService) {
        this.debugService = debugService;
        this.contextViewService = contextViewService;
        this.hoverService = hoverService;
    }
    renderTemplate(container) {
        const templateDisposable = new DisposableStore();
        const expression = dom.append(container, $('.expression'));
        const name = dom.append(expression, $('span.name'));
        const lazyButton = dom.append(expression, $('span.lazy-button'));
        lazyButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.eye));
        templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), lazyButton, localize('debug.lazyButton.tooltip', "Click to expand")));
        const type = dom.append(expression, $('span.type'));
        const value = dom.append(expression, $('span.value'));
        const label = templateDisposable.add(new HighlightedLabel(name));
        const inputBoxContainer = dom.append(expression, $('.inputBoxContainer'));
        let actionBar;
        if (this.renderActionBar) {
            dom.append(expression, $('.span.actionbar-spacer'));
            actionBar = templateDisposable.add(new ActionBar(expression));
        }
        const template = { expression, name, type, value, label, inputBoxContainer, actionBar, elementDisposable: new DisposableStore(), templateDisposable, lazyButton, currentElement: undefined };
        templateDisposable.add(dom.addDisposableListener(lazyButton, dom.EventType.CLICK, () => {
            if (template.currentElement) {
                this.debugService.getViewModel().evaluateLazyExpression(template.currentElement);
            }
        }));
        return template;
    }
    renderExpressionElement(element, node, data) {
        data.currentElement = element;
        this.renderExpression(node.element, data, createMatches(node.filterData));
        if (data.actionBar) {
            this.renderActionBar(data.actionBar, element, data);
        }
        const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
        if (element === selectedExpression?.expression || (element instanceof Variable && element.errorMessage)) {
            const options = this.getInputBoxOptions(element, !!selectedExpression?.settingWatch);
            if (options) {
                data.elementDisposable.add(this.renderInputBox(data.name, data.value, data.inputBoxContainer, options));
            }
        }
    }
    renderInputBox(nameElement, valueElement, inputBoxContainer, options) {
        nameElement.style.display = 'none';
        valueElement.style.display = 'none';
        inputBoxContainer.style.display = 'initial';
        dom.clearNode(inputBoxContainer);
        const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { ...options, inputBoxStyles: defaultInputBoxStyles });
        inputBox.value = options.initialValue;
        inputBox.focus();
        inputBox.select();
        const done = createSingleCallFunction((success, finishEditing) => {
            nameElement.style.display = '';
            valueElement.style.display = '';
            inputBoxContainer.style.display = 'none';
            const value = inputBox.value;
            dispose(toDispose);
            if (finishEditing) {
                this.debugService.getViewModel().setSelectedExpression(undefined, false);
                options.onFinish(value, success);
            }
        });
        const toDispose = [
            inputBox,
            dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, (e) => {
                const isEscape = e.equals(9 /* KeyCode.Escape */);
                const isEnter = e.equals(3 /* KeyCode.Enter */);
                if (isEscape || isEnter) {
                    e.preventDefault();
                    e.stopPropagation();
                    done(isEnter, true);
                }
            }),
            dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
                done(true, true);
            }),
            dom.addDisposableListener(inputBox.inputElement, dom.EventType.CLICK, e => {
                // Do not expand / collapse selected elements
                e.preventDefault();
                e.stopPropagation();
            })
        ];
        return toDisposable(() => {
            done(false, false);
        });
    }
    disposeElement(node, index, templateData) {
        templateData.elementDisposable.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposable.dispose();
        templateData.templateDisposable.dispose();
    }
};
AbstractExpressionsRenderer = __decorate([
    __param(0, IDebugService),
    __param(1, IContextViewService),
    __param(2, IHoverService)
], AbstractExpressionsRenderer);
export { AbstractExpressionsRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZURlYnVnVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvYmFzZURlYnVnVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQWMsTUFBTSxrRUFBa0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQTJCLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBR3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQWMsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFakYsT0FBTyxFQUFFLGVBQWUsRUFBZSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDNUYsT0FBTyxFQUFFLGFBQWEs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