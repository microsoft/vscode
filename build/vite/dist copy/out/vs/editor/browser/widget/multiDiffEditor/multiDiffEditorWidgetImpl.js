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
import { getWindow, h, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { findFirstMax } from '../../../../base/common/arraysFind.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, disposableObservableValue, globalTransaction, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { Scrollable } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { Selection } from '../../../common/core/selection.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ObservableElementSizeObserver } from '../diffEditor/utils.js';
import { DiffEditorItemTemplate, TemplateData } from './diffEditorItemTemplate.js';
import { ObjectPool } from './objectPool.js';
import './style.css';
let MultiDiffEditorWidgetImpl = class MultiDiffEditorWidgetImpl extends Disposable {
    constructor(_element, _dimension, _viewModel, _workbenchUIElementFactory, _parentContextKeyService, _parentInstantiationService) {
        super();
        this._element = _element;
        this._dimension = _dimension;
        this._viewModel = _viewModel;
        this._workbenchUIElementFactory = _workbenchUIElementFactory;
        this._parentContextKeyService = _parentContextKeyService;
        this._parentInstantiationService = _parentInstantiationService;
        this._scrollableElements = h('div.scrollContent', [
            h('div@content', {
                style: {
                    overflow: 'hidden',
                }
            }),
            h('div.monaco-editor@overflowWidgetsDomNode', {}),
        ]);
        this._scrollable = this._register(new Scrollable({
            forceIntegerValues: false,
            scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
            smoothScrollDuration: 100,
        }));
        this._scrollableElement = this._register(new SmoothScrollableElement(this._scrollableElements.root, {
            vertical: 1 /* ScrollbarVisibility.Auto */,
            horizontal: 1 /* ScrollbarVisibility.Auto */,
            useShadows: false,
        }, this._scrollable));
        this._elements = h('div.monaco-component.multiDiffEditor', {}, [
            h('div', {}, [this._scrollableElement.getDomNode()]),
            h('div.placeholder@placeholder', {}, [h('div')]),
        ]);
        this._sizeObserver = this._register(new ObservableElementSizeObserver(this._element, undefined));
        this._objectPool = this._register(new ObjectPool((data) => {
            const template = this._instantiationService.createInstance(DiffEditorItemTemplate, this._scrollableElements.content, this._scrollableElements.overflowWidgetsDomNode, this._workbenchUIElementFactory);
            template.setData(data);
            return template;
        }));
        this.scrollTop = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollTop */ this._scrollableElement.getScrollPosition().scrollTop);
        this.scrollLeft = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollLeft */ this._scrollableElement.getScrollPosition().scrollLeft);
        this._viewItemsInfo = derived(this, (reader) => {
            const vm = this._viewModel.read(reader);
            if (!vm) {
                return { items: [], getItem: _d => { throw new BugIndicatingError(); } };
            }
            const viewModels = vm.items.read(reader);
            const map = new Map();
            const items = viewModels.map(d => {
                const item = reader.store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft, delta => {
                    this._scrollableElement.setScrollPosition({ scrollTop: this._scrollableElement.getScrollPosition().scrollTop + delta });
                }));
                const data = this._lastDocStates?.[item.getKey()];
                if (data) {
                    transaction(tx => {
                        item.setViewState(data, tx);
                    });
                }
                map.set(d, item);
                return item;
            });
            return { items, getItem: d => map.get(d) };
        });
        this._viewItems = this._viewItemsInfo.map(this, items => items.items);
        this._spaceBetweenPx = 0;
        this._totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader) + this._spaceBetweenPx, 0));
        this.activeControl = derived(this, reader => {
            const activeDiffItem = this._viewModel.read(reader)?.activeDiffItem.read(reader);
            if (!activeDiffItem) {
                return undefined;
            }
            const viewItem = this._viewItemsInfo.read(reader).getItem(activeDiffItem);
            return viewItem.template.read(reader)?.editor;
        });
        this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
        this._instantiationService = this._register(this._parentInstantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
        this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);
        this._lastDocStates = {};
        this._register(autorunWithStore((reader, store) => {
            const viewModel = this._viewModel.read(reader);
            if (viewModel && viewModel.contextKeys) {
                for (const [key, value] of Object.entries(viewModel.contextKeys)) {
                    const contextKey = this._contextKeyService.createKey(key, undefined);
                    contextKey.set(value);
                    store.add(toDisposable(() => contextKey.reset()));
                }
            }
        }));
        const ctxAllCollapsed = this._parentContextKeyService.createKey(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
        this._register(autorun((reader) => {
            const viewModel = this._viewModel.read(reader);
            if (viewModel) {
                const allCollapsed = viewModel.items.read(reader).every(item => item.collapsed.read(reader));
                ctxAllCollapsed.set(allCollapsed);
            }
        }));
        this._register(autorun((reader) => {
            /** @description Update widget dimension */
            const dimension = this._dimension.read(reader);
            this._sizeObserver.observe(dimension);
        }));
        const placeholderMessage = derived(reader => {
            const items = this._viewItems.read(reader);
            if (items.length > 0) {
                return undefined;
            }
            const vm = this._viewModel.read(reader);
            return (!vm || vm.isLoading.read(reader))
                ? localize('loading', 'Loading...')
                : localize('noChangedFiles', 'No Changed Files');
        });
        this._register(autorun((reader) => {
            const message = placeholderMessage.read(reader);
            this._elements.placeholder.innerText = message ?? '';
            this._elements.placeholder.classList.toggle('visible', !!message);
        }));
        this._scrollableElements.content.style.position = 'relative';
        this._register(autorun((reader) => {
            /** @description Update scroll dimensions */
            const height = this._sizeObserver.height.read(reader);
            this._scrollableElements.root.style.height = `${height}px`;
            const totalHeight = this._totalHeight.read(reader);
            this._scrollableElements.content.style.height = `${totalHeight}px`;
            const width = this._sizeObserver.width.read(reader);
            let scrollWidth = width;
            const viewItems = this._viewItems.read(reader);
            const max = findFirstMax(viewItems, compareBy(i => i.maxScroll.read(reader).maxScroll, numberComparator));
            if (max) {
                const maxScroll = max.maxScroll.read(reader);
                scrollWidth = width + maxScroll.maxScroll;
            }
            this._scrollableElement.setScrollDimensions({
                width: width,
                height: height,
                scrollHeight: totalHeight,
                scrollWidth,
            });
        }));
        _element.replaceChildren(this._elements.root);
        this._register(toDisposable(() => {
            _element.replaceChildren();
        }));
        // Automatically select the first change in the first file when items are loaded
        this._register(autorun(reader => {
            /** @description Initialize first change */
            const viewModel = this._viewModel.read(reader);
            if (!viewModel) {
                return;
            }
            // Only initialize when loading is complete
            if (!viewModel.isLoading.read(reader)) {
                const items = viewModel.items.read(reader);
                if (items.length === 0) {
                    return;
                }
                // Only initialize if there's no active item yet
                const activeDiffItem = viewModel.activeDiffItem.read(reader);
                if (activeDiffItem) {
                    return;
                }
                // Navigate to the first change using the existing navigation logic
                this.goToNextChange();
            }
        }));
        this._register(this._register(autorun(reader => {
            /** @description Render all */
            globalTransaction(tx => {
                this.render(reader);
            });
        })));
    }
    setScrollState(scrollState) {
        this._scrollableElement.setScrollPosition({ scrollLeft: scrollState.left, scrollTop: scrollState.top });
    }
    getRootElement() {
        return this._elements.root;
    }
    getContextKeyService() {
        return this._contextKeyService;
    }
    getScopedInstantiationService() {
        return this._instantiationService;
    }
    reveal(resource, options) {
        const viewItems = this._viewItems.get();
        const index = viewItems.findIndex((item) => item.viewModel.originalUri?.toString() === resource.original?.toString()
            && item.viewModel.modifiedUri?.toString() === resource.modified?.toString());
        if (index === -1) {
            throw new BugIndicatingError('Resource not found in diff editor');
        }
        const viewItem = viewItems[index];
        this._viewModel.get().activeDiffItem.setCache(viewItem.viewModel, undefined);
        let scrollTop = 0;
        for (let i = 0; i < index; i++) {
            scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx;
        }
        this._scrollableElement.setScrollPosition({ scrollTop });
        const diffEditor = viewItem.template.get()?.editor;
        const editor = 'original' in resource ? diffEditor?.getOriginalEditor() : diffEditor?.getModifiedEditor();
        if (editor && options?.range) {
            editor.revealRangeInCenter(options.range);
            highlightRange(editor, options.range);
        }
    }
    getViewState() {
        return {
            scrollState: {
                top: this.scrollTop.get(),
                left: this.scrollLeft.get(),
            },
            docStates: Object.fromEntries(this._viewItems.get().map(i => [i.getKey(), i.getViewState()])),
        };
    }
    setViewState(viewState) {
        this.setScrollState(viewState.scrollState);
        this._lastDocStates = viewState.docStates;
        transaction(tx => {
            /** setViewState */
            if (viewState.docStates) {
                for (const i of this._viewItems.get()) {
                    const state = viewState.docStates[i.getKey()];
                    if (state) {
                        i.setViewState(state, tx);
                    }
                }
            }
        });
    }
    findDocumentDiffItem(resource) {
        const item = this._viewItems.get().find(v => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
            || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString());
        return item?.viewModel.documentDiffItem;
    }
    tryGetCodeEditor(resource) {
        const item = this._viewItems.get().find(v => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
            || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString());
        const editor = item?.template.get()?.editor;
        if (!editor) {
            return undefined;
        }
        if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
            return { diffEditor: editor, editor: editor.getModifiedEditor() };
        }
        else {
            return { diffEditor: editor, editor: editor.getOriginalEditor() };
        }
    }
    goToNextChange() {
        this._navigateToChange('next');
    }
    goToPreviousChange() {
        this._navigateToChange('previous');
    }
    _navigateToChange(direction) {
        const viewItems = this._viewItems.get();
        if (viewItems.length === 0) {
            return;
        }
        const activeViewModel = this._viewModel.get()?.activeDiffItem.get();
        const currentIndex = activeViewModel ? viewItems.findIndex(v => v.viewModel === activeViewModel) : -1;
        // Start with first file if no active item
        if (currentIndex === -1) {
            this._goToFile(0, 'first');
            return;
        }
        // Try current file first - expand if collapsed
        const currentItem = viewItems[currentIndex];
        if (currentItem.viewModel.collapsed.get()) {
            currentItem.viewModel.collapsed.set(false, undefined);
        }
        const editor = currentItem.template.get()?.editor;
        if (editor?.getDiffComputationResult()?.changes2?.length) {
            const pos = editor.getModifiedEditor().getPosition()?.lineNumber || 1;
            const changes = editor.getDiffComputationResult().changes2;
            const hasNext = direction === 'next' ? changes.some(c => c.modified.startLineNumber > pos) : changes.some(c => c.modified.endLineNumberExclusive <= pos);
            if (hasNext) {
                editor.goToDiff(direction);
                return;
            }
        }
        // Move to next/previous file
        const nextIndex = (currentIndex + (direction === 'next' ? 1 : -1) + viewItems.length) % viewItems.length;
        this._goToFile(nextIndex, direction === 'next' ? 'first' : 'last');
    }
    _goToFile(index, position) {
        const item = this._viewItems.get()[index];
        if (item.viewModel.collapsed.get()) {
            item.viewModel.collapsed.set(false, undefined);
        }
        this.reveal({ original: item.viewModel.originalUri, modified: item.viewModel.modifiedUri });
        const editor = item.template.get()?.editor;
        if (editor?.getDiffComputationResult()?.changes2?.length) {
            if (position === 'first') {
                editor.revealFirstDiff();
            }
            else {
                const lastChange = editor.getDiffComputationResult().changes2.at(-1);
                const modifiedEditor = editor.getModifiedEditor();
                modifiedEditor.setPosition({ lineNumber: lastChange.modified.startLineNumber, column: 1 });
                modifiedEditor.revealLineInCenter(lastChange.modified.startLineNumber);
            }
        }
        editor?.focus();
    }
    render(reader) {
        const scrollTop = this.scrollTop.read(reader);
        let contentScrollOffsetToScrollOffset = 0;
        let itemHeightSumBefore = 0;
        let itemContentHeightSumBefore = 0;
        const viewPortHeight = this._sizeObserver.height.read(reader);
        const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);
        const width = this._sizeObserver.width.read(reader);
        for (const v of this._viewItems.read(reader)) {
            const itemContentHeight = v.contentHeight.read(reader);
            const itemHeight = Math.min(itemContentHeight, viewPortHeight);
            const itemRange = OffsetRange.ofStartAndLength(itemHeightSumBefore, itemHeight);
            const itemContentRange = OffsetRange.ofStartAndLength(itemContentHeightSumBefore, itemContentHeight);
            if (itemContentRange.isBefore(contentViewPort)) {
                contentScrollOffsetToScrollOffset -= itemContentHeight - itemHeight;
                v.hide();
            }
            else if (itemContentRange.isAfter(contentViewPort)) {
                v.hide();
            }
            else {
                const scroll = Math.max(0, Math.min(contentViewPort.start - itemContentRange.start, itemContentHeight - itemHeight));
                contentScrollOffsetToScrollOffset -= scroll;
                const viewPort = OffsetRange.ofStartAndLength(scrollTop + contentScrollOffsetToScrollOffset, viewPortHeight);
                v.render(itemRange, scroll, width, viewPort);
            }
            itemHeightSumBefore += itemHeight + this._spaceBetweenPx;
            itemContentHeightSumBefore += itemContentHeight + this._spaceBetweenPx;
        }
        this._scrollableElements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
    }
};
MultiDiffEditorWidgetImpl = __decorate([
    __param(4, IContextKeyService),
    __param(5, IInstantiationService)
], MultiDiffEditorWidgetImpl);
export { MultiDiffEditorWidgetImpl };
function highlightRange(targetEditor, range) {
    const modelNow = targetEditor.getModel();
    const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: 'symbol-navigate-action-highlight', className: 'symbolHighlight' } }]);
    setTimeout(() => {
        if (targetEditor.getModel() === modelNow) {
            decorations.clear();
        }
    }, 350);
}
class VirtualizedViewItem extends Disposable {
    constructor(viewModel, _objectPool, _scrollLeft, _deltaScrollVertical) {
        super();
        this.viewModel = viewModel;
        this._objectPool = _objectPool;
        this._scrollLeft = _scrollLeft;
        this._deltaScrollVertical = _deltaScrollVertical;
        this._templateRef = this._register(disposableObservableValue(this, undefined));
        this.contentHeight = derived(this, reader => this._templateRef.read(reader)?.object.contentHeight?.read(reader) ?? this.viewModel.lastTemplateData.read(reader).contentHeight);
        this.maxScroll = derived(this, reader => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? { maxScroll: 0, scrollWidth: 0 });
        this.template = derived(this, reader => this._templateRef.read(reader)?.object);
        this._isHidden = observableValue(this, false);
        this._isFocused = derived(this, reader => this.template.read(reader)?.isFocused.read(reader) ?? false);
        this.viewModel.setIsFocused(this._isFocused, undefined);
        this._register(autorun((reader) => {
            const scrollLeft = this._scrollLeft.read(reader);
            this._templateRef.read(reader)?.object.setScrollLeft(scrollLeft);
        }));
        this._register(autorun(reader => {
            const ref = this._templateRef.read(reader);
            if (!ref) {
                return;
            }
            const isHidden = this._isHidden.read(reader);
            if (!isHidden) {
                return;
            }
            const isFocused = ref.object.isFocused.read(reader);
            if (isFocused) {
                return;
            }
            this._clear();
        }));
    }
    dispose() {
        this._clear();
        super.dispose();
    }
    toString() {
        return `VirtualViewItem(${this.viewModel.documentDiffItem.modified?.uri.toString()})`;
    }
    getKey() {
        return this.viewModel.getKey();
    }
    getViewState() {
        transaction(tx => {
            this._updateTemplateData(tx);
        });
        return {
            collapsed: this.viewModel.collapsed.get(),
            selections: this.viewModel.lastTemplateData.get().selections,
        };
    }
    setViewState(viewState, tx) {
        this.viewModel.collapsed.set(viewState.collapsed, tx);
        this._updateTemplateData(tx);
        const data = this.viewModel.lastTemplateData.get();
        const selections = viewState.selections?.map(Selection.liftSelection);
        this.viewModel.lastTemplateData.set({
            ...data,
            selections,
        }, tx);
        const ref = this._templateRef.get();
        if (ref) {
            if (selections) {
                ref.object.editor.setSelections(selections);
            }
        }
    }
    _updateTemplateData(tx) {
        const ref = this._templateRef.get();
        if (!ref) {
            return;
        }
        this.viewModel.lastTemplateData.set({
            contentHeight: ref.object.contentHeight.get(),
            selections: ref.object.editor.getSelections() ?? undefined,
        }, tx);
    }
    _clear() {
        const ref = this._templateRef.get();
        if (!ref) {
            return;
        }
        transaction(tx => {
            this._updateTemplateData(tx);
            ref.object.hide();
            this._templateRef.set(undefined, tx);
        });
    }
    hide() {
        this._isHidden.set(true, undefined);
    }
    render(verticalSpace, offset, width, viewPort) {
        this._isHidden.set(false, undefined);
        let ref = this._templateRef.get();
        if (!ref) {
            ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel, this._deltaScrollVertical));
            this._templateRef.set(ref, undefined);
            const selections = this.viewModel.lastTemplateData.get().selections;
            if (selections) {
                ref.object.editor.setSelections(selections);
            }
        }
        ref.object.render(verticalSpace, width, offset, viewPort);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQWEsU0FBUyxFQUFFLENBQUMsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFVBQVUsRUFBYyxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RixPQUFPLEVBQXNDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hPLE9BQU8sRUFBRSxVQUFVLEVBQXVCLE1BQU0sdUNBQXVDLENBQUM7QUFFeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBbUIsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUzRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVB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