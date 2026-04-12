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
import { asArray, compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isEmptyMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID } from './hoverActionIds.js';
import { Range } from '../../../common/core/range.js';
import { RenderedHoverParts } from './hoverTypes.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ClickAction, KeyDownAction } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';
import { getHoverProviderResultsAsAsyncIterable } from './getHover.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon('hover-increase-verbosity', Codicon.addSmall, nls.localize('increaseHoverVerbosity', 'Icon for increaseing hover verbosity.'));
const decreaseHoverVerbosityIcon = registerIcon('hover-decrease-verbosity', Codicon.removeSmall, nls.localize('decreaseHoverVerbosity', 'Icon for decreasing hover verbosity.'));
export class MarkdownHover {
    constructor(owner, range, contents, isBeforeContent, ordinal, source = undefined) {
        this.owner = owner;
        this.range = range;
        this.contents = contents;
        this.isBeforeContent = isBeforeContent;
        this.ordinal = ordinal;
        this.source = source;
    }
    isValidForHoverAnchor(anchor) {
        return (anchor.type === 1 /* HoverAnchorType.Range */
            && this.range.startColumn <= anchor.range.startColumn
            && this.range.endColumn >= anchor.range.endColumn);
    }
}
class HoverSource {
    constructor(hover, hoverProvider, hoverPosition) {
        this.hover = hover;
        this.hoverProvider = hoverProvider;
        this.hoverPosition = hoverPosition;
    }
    supportsVerbosityAction(hoverVerbosityAction) {
        switch (hoverVerbosityAction) {
            case HoverVerbosityAction.Increase:
                return this.hover.canIncreaseVerbosity ?? false;
            case HoverVerbosityAction.Decrease:
                return this.hover.canDecreaseVerbosity ?? false;
        }
    }
}
let MarkdownHoverParticipant = class MarkdownHoverParticipant {
    constructor(_editor, _markdownRendererService, _configurationService, _languageFeaturesService, _keybindingService, _hoverService, _commandService) {
        this._editor = _editor;
        this._markdownRendererService = _markdownRendererService;
        this._configurationService = _configurationService;
        this._languageFeaturesService = _languageFeaturesService;
        this._keybindingService = _keybindingService;
        this._hoverService = _hoverService;
        this._commandService = _commandService;
        this.hoverOrdinal = 3;
    }
    createLoadingMessage(anchor) {
        return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))], false, 2000);
    }
    computeSync(anchor, lineDecorations) {
        if (!this._editor.hasModel() || anchor.type !== 1 /* HoverAnchorType.Range */) {
            return [];
        }
        const model = this._editor.getModel();
        const lineNumber = anchor.range.startLineNumber;
        const maxColumn = model.getLineMaxColumn(lineNumber);
        const result = [];
        let index = 1000;
        const lineLength = model.getLineLength(lineNumber);
        const languageId = model.getLanguageIdAtPosition(anchor.range.startLineNumber, anchor.range.startColumn);
        const stopRenderingLineAfter = this._editor.getOption(133 /* EditorOption.stopRenderingLineAfter */);
        const maxTokenizationLineLength = this._configurationService.getValue('editor.maxTokenizationLineLength', {
            overrideIdentifier: languageId
        });
        const showLongLineWarning = this._editor.getOption(69 /* EditorOption.hover */).showLongLineWarning;
        let stopRenderingMessage = false;
        if (stopRenderingLineAfter >= 0 && lineLength > stopRenderingLineAfter && anchor.range.startColumn >= stopRenderingLineAfter) {
            stopRenderingMessage = true;
            if (showLongLineWarning) {
                result.push(new MarkdownHover(this, anchor.range, [{
                        value: nls.localize({ key: 'stopped rendering', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`. [Don't Show Again](command:{0})", HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID),
                        isTrusted: true
                    }], false, index++));
            }
        }
        if (!stopRenderingMessage && typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
            if (showLongLineWarning) {
                result.push(new MarkdownHover(this, anchor.range, [{
                        value: nls.localize({ key: 'too many characters', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`. [Don't Show Again](command:{0})", HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID),
                        isTrusted: true
                    }], false, index++));
            }
        }
        let isBeforeContent = false;
        for (const d of lineDecorations) {
            const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
            const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
            const hoverMessage = d.options.hoverMessage;
            if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
                continue;
            }
            if (d.options.beforeContentClassName) {
                isBeforeContent = true;
            }
            const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
            result.push(new MarkdownHover(this, range, asArray(hoverMessage), isBeforeContent, index++));
        }
        return result;
    }
    computeAsync(anchor, lineDecorations, source, token) {
        if (!this._editor.hasModel() || anchor.type !== 1 /* HoverAnchorType.Range */) {
            return AsyncIterableProducer.EMPTY;
        }
        const model = this._editor.getModel();
        const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
        if (!hoverProviderRegistry.has(model)) {
            return AsyncIterableProducer.EMPTY;
        }
        return this._getMarkdownHovers(hoverProviderRegistry, model, anchor, token);
    }
    async *_getMarkdownHovers(hoverProviderRegistry, model, anchor, token) {
        const position = anchor.range.getStartPosition();
        const hoverProviderResults = getHoverProviderResultsAsAsyncIterable(hoverProviderRegistry, model, position, token);
        for await (const item of hoverProviderResults) {
            if (!isEmptyMarkdownString(item.hover.contents)) {
                const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
                const hoverSource = new HoverSource(item.hover, item.provider, position);
                yield new MarkdownHover(this, range, item.hover.contents, false, item.ordinal, hoverSource);
            }
        }
    }
    renderHoverParts(context, hoverParts) {
        this._renderedHoverParts = new MarkdownRenderedHoverParts(hoverParts, context.fragment, this, this._editor, this._commandService, this._keybindingService, this._hoverService, this._configurationService, this._markdownRendererService, context.onContentsChanged);
        return this._renderedHoverParts;
    }
    handleScroll(e) {
        this._renderedHoverParts?.handleScroll(e);
    }
    getAccessibleContent(hoverPart) {
        return this._renderedHoverParts?.getAccessibleContent(hoverPart) ?? '';
    }
    doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
        return this._renderedHoverParts?.doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) ?? false;
    }
    updateMarkdownHoverVerbosityLevel(action, index) {
        return Promise.resolve(this._renderedHoverParts?.updateMarkdownHoverPartVerbosityLevel(action, index));
    }
};
MarkdownHoverParticipant = __decorate([
    __param(1, IMarkdownRendererService),
    __param(2, IConfigurationService),
    __param(3, ILanguageFeaturesService),
    __param(4, IKeybindingService),
    __param(5, IHoverService),
    __param(6, ICommandService)
], MarkdownHoverParticipant);
export { MarkdownHoverParticipant };
class RenderedMarkdownHoverPart {
    constructor(hoverPart, hoverElement, disposables, actionsContainer) {
        this.hoverPart = hoverPart;
        this.hoverElement = hoverElement;
        this.disposables = disposables;
        this.actionsContainer = actionsContainer;
    }
    get hoverAccessibleContent() {
        return this.hoverElement.innerText.trim();
    }
    dispose() {
        this.disposables.dispose();
    }
}
class MarkdownRenderedHoverParts {
    constructor(hoverParts, hoverPartsContainer, _hoverParticipant, _editor, _commandService, _keybindingService, _hoverService, _configurationService, _markdownRendererService, _onFinishedRendering) {
        this._hoverParticipant = _hoverParticipant;
        this._editor = _editor;
        this._commandService = _commandService;
        this._keybindingService = _keybindingService;
        this._hoverService = _hoverService;
        this._configurationService = _configurationService;
        this._markdownRendererService = _markdownRendererService;
        this._onFinishedRendering = _onFinishedRendering;
        this._ongoingHoverOperations = new Map();
        this._disposables = new DisposableStore();
        this.renderedHoverParts = this._renderHoverParts(hoverParts, hoverPartsContainer, this._onFinishedRendering);
        this._disposables.add(toDisposable(() => {
            this.renderedHoverParts.forEach(renderedHoverPart => {
                renderedHoverPart.dispose();
            });
            this._ongoingHoverOperations.forEach(operation => {
                operation.tokenSource.dispose(true);
            });
        }));
    }
    _renderHoverParts(hoverParts, hoverPartsContainer, onFinishedRendering) {
        hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));
        return hoverParts.map(hoverPart => {
            const renderedHoverPart = this._renderHoverPart(hoverPart, onFinishedRendering);
            hoverPartsContainer.appendChild(renderedHoverPart.hoverElement);
            return renderedHoverPart;
        });
    }
    _renderHoverPart(hoverPart, onFinishedRendering) {
        const renderedMarkdownPart = this._renderMarkdownHover(hoverPart, onFinishedRendering);
        const renderedMarkdownElement = renderedMarkdownPart.hoverElement;
        const hoverSource = hoverPart.source;
        const disposables = new DisposableStore();
        disposables.add(renderedMarkdownPart);
        if (!hoverSource) {
            return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
        }
        const canIncreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Increase);
        const canDecreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Decrease);
        if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
            return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
        }
        const actionsContainer = $('div.verbosity-actions');
        renderedMarkdownElement.prepend(actionsContainer);
        const actionsContainerInner = $('div.verbosity-actions-inner');
        actionsContainer.append(actionsContainerInner);
        disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Increase, canIncreaseVerbosity));
        disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Decrease, canDecreaseVerbosity));
        return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables, actionsContainerInner);
    }
    _renderMarkdownHover(markdownHover, onFinishedRendering) {
        const renderedMarkdownHover = renderMarkdown(this._editor, markdownHover, this._markdownRendererService, onFinishedRendering);
        return renderedMarkdownHover;
    }
    _renderHoverExpansionAction(container, action, actionEnabled) {
        const store = new DisposableStore();
        const isActionIncrease = action === HoverVerbosityAction.Increase;
        const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
        actionElement.tabIndex = 0;
        const hoverDelegate = store.add(new WorkbenchHoverDelegate('mouse', undefined, { target: container, position: { hoverPosition: 0 /* HoverPosition.LEFT */ } }, this._configurationService, this._hoverService));
        store.add(this._hoverService.setupManagedHover(hoverDelegate, actionElement, labelForHoverVerbosityAction(this._keybindingService, action)));
        if (!actionEnabled) {
            actionElement.classList.add('disabled');
            return store;
        }
        actionElement.classList.add('enabled');
        const actionFunction = () => this._commandService.executeCommand(action === HoverVerbosityAction.Increase ? INCREASE_HOVER_VERBOSITY_ACTION_ID : DECREASE_HOVER_VERBOSITY_ACTION_ID, { focus: true });
        store.add(new ClickAction(actionElement, actionFunction));
        store.add(new KeyDownAction(actionElement, actionFunction, [3 /* KeyCode.Enter */, 10 /* KeyCode.Space */]));
        return store;
    }
    handleScroll(e) {
        this.renderedHoverParts.forEach(renderedHoverPart => {
            const actionsContainerInner = renderedHoverPart.actionsContainer;
            if (!actionsContainerInner) {
                return;
            }
            const hoverElement = renderedHoverPart.hoverElement;
            const topOfHoverScrollPosition = e.scrollTop;
            const bottomOfHoverScrollPosition = topOfHoverScrollPosition + e.height;
            const topOfRenderedPart = hoverElement.offsetTop;
            const hoverElementHeight = hoverElement.clientHeight;
            const bottomOfRenderedPart = topOfRenderedPart + hoverElementHeight;
            const iconsHeight = 22;
            let top;
            if (bottomOfRenderedPart <= bottomOfHoverScrollPosition || topOfRenderedPart >= bottomOfHoverScrollPosition) {
                top = hoverElementHeight - iconsHeight;
            }
            else {
                top = bottomOfHoverScrollPosition - topOfRenderedPart - iconsHeight;
            }
            actionsContainerInner.style.top = `${top}px`;
        });
    }
    async updateMarkdownHoverPartVerbosityLevel(action, index) {
        const model = this._editor.getModel();
        if (!model) {
            return undefined;
        }
        const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
        const hoverSource = hoverRenderedPart?.hoverPart.source;
        if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
            return undefined;
        }
        const newHover = await this._fetchHover(hoverSource, model, action);
        if (!newHover) {
            return undefined;
        }
        const newHoverSource = new HoverSource(newHover, hoverSource.hoverProvider, hoverSource.hoverPosition);
        const initialHoverPart = hoverRenderedPart.hoverPart;
        const newHoverPart = new MarkdownHover(this._hoverParticipant, initialHoverPart.range, newHover.contents, initialHoverPart.isBeforeContent, initialHoverPart.ordinal, newHoverSource);
        const newHoverRenderedPart = this._updateRenderedHoverPart(index, newHoverPart);
        if (!newHoverRenderedPart) {
            return undefined;
        }
        return {
            hoverPart: newHoverPart,
            hoverElement: newHoverRenderedPart.hoverElement
        };
    }
    getAccessibleContent(hoverPart) {
        const renderedHoverPartIndex = this.renderedHoverParts.findIndex(renderedHoverPart => renderedHoverPart.hoverPart === hoverPart);
        if (renderedHoverPartIndex === -1) {
            return undefined;
        }
        const renderedHoverPart = this._getRenderedHoverPartAtIndex(renderedHoverPartIndex);
        if (!renderedHoverPart) {
            return undefined;
        }
        const hoverElementInnerText = renderedHoverPart.hoverElement.innerText;
        const accessibleContent = hoverElementInnerText.replace(/[^\S\n\r]+/gu, ' ');
        return accessibleContent;
    }
    doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
        const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
        const hoverSource = hoverRenderedPart?.hoverPart.source;
        if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
            return false;
        }
        return true;
    }
    async _fetchHover(hoverSource, model, action) {
        let verbosityDelta = action === HoverVerbosityAction.Increase ? 1 : -1;
        const provider = hoverSource.hoverProvider;
        const ongoingHoverOperation = this._ongoingHoverOperations.get(provider);
        if (ongoingHoverOperation) {
            ongoingHoverOperation.tokenSource.cancel();
            verbosityDelta += ongoingHoverOperation.verbosityDelta;
        }
        const tokenSource = new CancellationTokenSource();
        this._ongoingHoverOperations.set(provider, { verbosityDelta, tokenSource });
        const context = { verbosityRequest: { verbosityDelta, previousHover: hoverSource.hover } };
        let hover;
        try {
            hover = await Promise.resolve(provider.provideHover(model, hoverSource.hoverPosition, tokenSource.token, context));
        }
        catch (e) {
            onUnexpectedExternalError(e);
        }
        tokenSource.dispose();
        this._ongoingHoverOperations.delete(provider);
        return hover;
    }
    _updateRenderedHoverPart(index, hoverPart) {
        if (index >= this.renderedHoverParts.length || index < 0) {
            return undefined;
        }
        const renderedHoverPart = this._renderHoverPart(hoverPart, this._onFinishedRendering);
        const currentRenderedHoverPart = this.renderedHoverParts[index];
        const currentRenderedMarkdown = currentRenderedHoverPart.hoverElement;
        const renderedMarkdown = renderedHoverPart.hoverElement;
        const renderedChildrenElements = Array.from(renderedMarkdown.children);
        currentRenderedMarkdown.replaceChildren(...renderedChildrenElements);
        const newRenderedHoverPart = new RenderedMarkdownHoverPart(hoverPart, currentRenderedMarkdown, renderedHoverPart.disposables, renderedHoverPart.actionsContainer);
        currentRenderedHoverPart.dispose();
        this.renderedHoverParts[index] = newRenderedHoverPart;
        return newRenderedHoverPart;
    }
    _getRenderedHoverPartAtIndex(index) {
        return this.renderedHoverParts[index];
    }
    dispose() {
        this._disposables.dispose();
    }
}
export function renderMarkdownHovers(context, markdownHovers, editor, markdownRendererService) {
    // Sort hover parts to keep them stable since they might come in async, out-of-order
    markdownHovers.sort(compareBy(hover => hover.ordinal, numberComparator));
    const renderedHoverParts = [];
    for (const markdownHover of markdownHovers) {
        const renderedHoverPart = renderMarkdown(editor, markdownHover, markdownRendererService, context.onContentsChanged);
        context.fragment.appendChild(renderedHoverPart.hoverElement);
        renderedHoverParts.push(renderedHoverPart);
    }
    return new RenderedHoverParts(renderedHoverParts);
}
function renderMarkdown(editor, markdownHover, markdownRendererService, onFinishedRendering) {
    const disposables = new DisposableStore();
    const renderedMarkdown = $('div.hover-row');
    const renderedMarkdownContents = $('div.hover-row-contents');
    renderedMarkdown.appendChild(renderedMarkdownContents);
    const markdownStrings = markdownHover.contents;
    for (const markdownString of markdownStrings) {
        if (isEmptyMarkdownString(markdownString)) {
            continue;
        }
        const markdownHoverElement = $('div.markdown-hover');
        const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
        const renderedContents = disposables.add(markdownRendererService.render(markdownString, {
            context: editor,
            asyncRenderCallback: () => {
                hoverContentsElement.className = 'hover-contents code-hover-contents';
                onFinishedRendering();
            }
        }));
        hoverContentsElement.appendChild(renderedContents.element);
        renderedMarkdownContents.appendChild(markdownHoverElement);
    }
    const renderedHoverPart = {
        hoverPart: markdownHover,
        hoverElement: renderedMarkdown,
        dispose() { disposables.dispose(); }
    };
    return renderedHoverPart;
}
export function labelForHoverVerbosityAction(keybindingService, action) {
    switch (action) {
        case HoverVerbosityAction.Increase:
            return keybindingService.appendKeybinding(nls.localize('increaseVerbosity', "Increase Hover Verbosity"), INCREASE_HOVER_VERBOSITY_ACTION_ID);
        case HoverVerbosityAction.Decrease:
            return keybindingService.appendKeybinding(nls.localize('decreaseVerbosity', "Decrease Hover Verbosity"), DECREASE_HOVER_VERBOSITY_ACTION_ID);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pGLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQW1CLHFCQUFxQixFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDckcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLGtDQUFrQyxFQUFFLHNDQUFzQyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFHckosT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBMkosa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUM5TSxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXhGLE9BQU8sRUFBc0Msb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENB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