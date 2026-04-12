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
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { createCancelablePromise, disposableTimeout } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { Range } from '../../../common/core/range.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IMarkerDecorationsService } from '../../../common/services/markerDecorations.js';
import { ApplyCodeActionReason, getCodeActions, quickFixCommandId } from '../../codeAction/browser/codeAction.js';
import { CodeActionController } from '../../codeAction/browser/codeActionController.js';
import { CodeActionKind, CodeActionTriggerSource } from '../../codeAction/common/types.js';
import { MarkerController, NextMarkerAction } from '../../gotoError/browser/gotoError.js';
import { RenderedHoverParts } from './hoverTypes.js';
import * as nls from '../../../../nls.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IMarkerData, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
const $ = dom.$;
export class MarkerHover {
    constructor(owner, range, marker) {
        this.owner = owner;
        this.range = range;
        this.marker = marker;
    }
    isValidForHoverAnchor(anchor) {
        return (anchor.type === 1 /* HoverAnchorType.Range */
            && this.range.startColumn <= anchor.range.startColumn
            && this.range.endColumn >= anchor.range.endColumn);
    }
}
const markerCodeActionTrigger = {
    type: 1 /* CodeActionTriggerType.Invoke */,
    filter: { include: CodeActionKind.QuickFix },
    triggerAction: CodeActionTriggerSource.QuickFixHover
};
let MarkerHoverParticipant = class MarkerHoverParticipant {
    constructor(_editor, _markerDecorationsService, _openerService, _languageFeaturesService, _menuService, _contextKeyService) {
        this._editor = _editor;
        this._markerDecorationsService = _markerDecorationsService;
        this._openerService = _openerService;
        this._languageFeaturesService = _languageFeaturesService;
        this._menuService = _menuService;
        this._contextKeyService = _contextKeyService;
        this.hoverOrdinal = 1;
        this.recentMarkerCodeActionsInfo = undefined;
    }
    computeSync(anchor, lineDecorations) {
        if (!this._editor.hasModel() || anchor.type !== 1 /* HoverAnchorType.Range */ && !anchor.supportsMarkerHover) {
            return [];
        }
        const model = this._editor.getModel();
        const anchorRange = anchor.range;
        if (!model.isValidRange(anchor.range)) {
            return [];
        }
        const lineNumber = anchorRange.startLineNumber;
        const maxColumn = model.getLineMaxColumn(lineNumber);
        const result = [];
        for (const d of lineDecorations) {
            const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
            const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
            const marker = this._markerDecorationsService.getMarker(model.uri, d);
            if (!marker) {
                continue;
            }
            const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
            result.push(new MarkerHover(this, range, marker));
        }
        return result;
    }
    renderHoverParts(context, hoverParts) {
        if (!hoverParts.length) {
            return new RenderedHoverParts([]);
        }
        const renderedHoverParts = [];
        hoverParts.forEach(hoverPart => {
            const renderedMarkerHover = this._renderMarkerHover(hoverPart);
            context.fragment.appendChild(renderedMarkerHover.hoverElement);
            renderedHoverParts.push(renderedMarkerHover);
        });
        const markerHoverForStatusbar = hoverParts.length === 1 ? hoverParts[0] : hoverParts.sort((a, b) => MarkerSeverity.compare(a.marker.severity, b.marker.severity))[0];
        const disposables = this._renderMarkerStatusbar(context, markerHoverForStatusbar);
        return new RenderedHoverParts(renderedHoverParts, disposables);
    }
    getAccessibleContent(hoverPart) {
        return hoverPart.marker.message;
    }
    _renderMarkerHover(markerHover) {
        const disposables = new DisposableStore();
        const hoverElement = $('div.hover-row');
        const markerElement = dom.append(hoverElement, $('div.marker.hover-contents'));
        const { source, message, code, relatedInformation } = markerHover.marker;
        this._editor.applyFontInfo(markerElement);
        const messageElement = dom.append(markerElement, $('span'));
        messageElement.style.whiteSpace = 'pre-wrap';
        messageElement.innerText = message;
        if (source || code) {
            // Code has link
            if (code && typeof code !== 'string') {
                const sourceAndCodeElement = $('span');
                if (source) {
                    const sourceElement = dom.append(sourceAndCodeElement, $('span'));
                    sourceElement.innerText = source;
                }
                const codeLink = dom.append(sourceAndCodeElement, $('a.code-link'));
                codeLink.setAttribute('href', code.target.toString(true));
                disposables.add(dom.addDisposableListener(codeLink, 'click', (e) => {
                    this._openerService.open(code.target, { allowCommands: true });
                    e.preventDefault();
                    e.stopPropagation();
                }));
                const codeElement = dom.append(codeLink, $('span'));
                codeElement.innerText = code.value;
                const detailsElement = dom.append(markerElement, sourceAndCodeElement);
                detailsElement.style.opacity = '0.6';
                detailsElement.style.paddingLeft = '6px';
            }
            else {
                const detailsElement = dom.append(markerElement, $('span'));
                detailsElement.style.opacity = '0.6';
                detailsElement.style.paddingLeft = '6px';
                detailsElement.innerText = source && code ? `${source}(${code})` : source ? source : `(${code})`;
            }
        }
        if (isNonEmptyArray(relatedInformation)) {
            for (const { message, resource, startLineNumber, startColumn } of relatedInformation) {
                const relatedInfoContainer = dom.append(markerElement, $('div'));
                relatedInfoContainer.style.marginTop = '8px';
                const a = dom.append(relatedInfoContainer, $('a'));
                a.innerText = `${basename(resource)}(${startLineNumber}, ${startColumn}): `;
                a.style.cursor = 'pointer';
                disposables.add(dom.addDisposableListener(a, 'click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (this._openerService) {
                        const editorOptions = { selection: { startLineNumber, startColumn } };
                        this._openerService.open(resource, {
                            fromUserGesture: true,
                            editorOptions
                        }).catch(onUnexpectedError);
                    }
                }));
                const messageElement = dom.append(relatedInfoContainer, $('span'));
                messageElement.innerText = message;
                this._editor.applyFontInfo(messageElement);
            }
        }
        const renderedHoverPart = {
            hoverPart: markerHover,
            hoverElement,
            dispose: () => disposables.dispose()
        };
        return renderedHoverPart;
    }
    _renderMarkerStatusbar(context, markerHover) {
        const disposables = new DisposableStore();
        if (markerHover.marker.severity === MarkerSeverity.Error || markerHover.marker.severity === MarkerSeverity.Warning || markerHover.marker.severity === MarkerSeverity.Info) {
            const markerController = MarkerController.get(this._editor);
            if (markerController) {
                context.statusBar.addAction({
                    label: nls.localize('view problem', "View Problem"),
                    commandId: NextMarkerAction.ID,
                    run: () => {
                        context.hide();
                        markerController.showAtMarker(markerHover.marker);
                        this._editor.focus();
                    }
                });
            }
        }
        // Menu-contributed actions (e.g. fix with inline chat)
        const menuActions = [];
        for (const [, actions] of this._menuService.getMenuActions(MenuId.MarkerHoverStatusBar, this._contextKeyService)) {
            for (const action of actions) {
                if (action instanceof MenuItemAction && action.enabled) {
                    menuActions.push(action);
                }
            }
        }
        const renderMenuActions = () => {
            for (const action of menuActions) {
                context.statusBar.addAction({
                    label: action.label,
                    commandId: action.id,
                    iconClass: action.class,
                    run: () => {
                        context.hide();
                        this._editor.setSelection(Range.lift(markerHover.range));
                        action.run();
                    }
                });
            }
        };
        if (!this._editor.getOption(104 /* EditorOption.readOnly */)) {
            const quickfixPlaceholderElement = context.statusBar.append($('div'));
            if (this.recentMarkerCodeActionsInfo) {
                if (IMarkerData.makeKey(this.recentMarkerCodeActionsInfo.marker) === IMarkerData.makeKey(markerHover.marker)) {
                    if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
                        if (menuActions.length === 0) {
                            quickfixPlaceholderElement.textContent = nls.localize('noQuickFixes', "No quick fixes available");
                        }
                    }
                }
                else {
                    this.recentMarkerCodeActionsInfo = undefined;
                }
            }
            const updatePlaceholderDisposable = this.recentMarkerCodeActionsInfo && !this.recentMarkerCodeActionsInfo.hasCodeActions ? Disposable.None : disposableTimeout(() => quickfixPlaceholderElement.textContent = nls.localize('checkingForQuickFixes', "Checking for quick fixes..."), 200, disposables);
            if (!quickfixPlaceholderElement.textContent) {
                // Have some content in here to avoid flickering
                quickfixPlaceholderElement.textContent = String.fromCharCode(0xA0); // &nbsp;
            }
            const codeActionsPromise = this.getCodeActions(markerHover.marker);
            disposables.add(toDisposable(() => codeActionsPromise.cancel()));
            codeActionsPromise.then(actions => {
                updatePlaceholderDisposable.dispose();
                this.recentMarkerCodeActionsInfo = { marker: markerHover.marker, hasCodeActions: actions.validActions.length > 0 };
                if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
                    actions.dispose();
                    if (menuActions.length === 0) {
                        quickfixPlaceholderElement.textContent = nls.localize('noQuickFixes', "No quick fixes available");
                    }
                    else {
                        quickfixPlaceholderElement.style.display = 'none';
                    }
                    renderMenuActions();
                    return;
                }
                quickfixPlaceholderElement.style.display = 'none';
                let showing = false;
                disposables.add(toDisposable(() => {
                    if (!showing) {
                        actions.dispose();
                    }
                }));
                context.statusBar.addAction({
                    label: nls.localize('quick fixes', "Quick Fix..."),
                    commandId: quickFixCommandId,
                    run: (target) => {
                        showing = true;
                        const controller = CodeActionController.get(this._editor);
                        const elementPosition = dom.getDomNodePagePosition(target);
                        // Hide the hover pre-emptively, otherwise the editor can close the code actions
                        // context menu as well when using keyboard navigation
                        context.hide();
                        controller?.showCodeActions(markerCodeActionTrigger, actions, {
                            x: elementPosition.left,
                            y: elementPosition.top,
                            width: elementPosition.width,
                            height: elementPosition.height
                        });
                    }
                });
                const aiCodeAction = actions.validActions.find(action => action.action.isAI);
                if (aiCodeAction) {
                    context.statusBar.addAction({
                        label: aiCodeAction.action.title,
                        commandId: aiCodeAction.action.command?.id ?? '',
                        iconClass: ThemeIcon.asClassName(Codicon.sparkle),
                        run: () => {
                            const controller = CodeActionController.get(this._editor);
                            controller?.applyCodeAction(aiCodeAction, false, false, ApplyCodeActionReason.FromProblemsHover);
                        }
                    });
                }
                renderMenuActions();
                // Notify that the contents have changed given we added
                // actions to the hover
                // https://github.com/microsoft/vscode/issues/250424
                context.onContentsChanged();
            }, onUnexpectedError);
        }
        else {
            renderMenuActions();
        }
        return disposables;
    }
    getCodeActions(marker) {
        return createCancelablePromise(cancellationToken => {
            return getCodeActions(this._languageFeaturesService.codeActionProvider, this._editor.getModel(), new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn), markerCodeActionTrigger, Progress.None, cancellationToken);
        });
    }
};
MarkerHoverParticipant = __decorate([
    __param(1, IMarkerDecorationsService),
    __param(2, IOpenerService),
    __param(3, ILanguageFeaturesService),
    __param(4, IMenuService),
    __param(5, IContextKeyService)
], MarkerHoverParticipant);
export { MarkerHoverParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2VySG92ZXJQYXJ0aWNpcGFudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvbWFya2VySG92ZXJQYXJ0aWNpcGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUd0RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDeEYsT0FBTyxFQUFFLGNBQWMsRUFBb0MsdUJBQXVCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRixPQUFPLEVBQXlJLGtCQUFrQixFQUFFLE1B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