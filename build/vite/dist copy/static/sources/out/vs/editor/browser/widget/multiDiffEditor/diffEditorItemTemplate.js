var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, globalTransaction, observableValue } from '../../../../base/common/observable.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { observableCodeEditor } from '../../observableCodeEditor.js';
import { DiffEditorWidget } from '../diffEditor/diffEditorWidget.js';
import { ActionRunnerWithContext } from './utils.js';
export class TemplateData {
    constructor(viewModel, deltaScrollVertical) {
        this.viewModel = viewModel;
        this.deltaScrollVertical = deltaScrollVertical;
    }
    getId() {
        return this.viewModel;
    }
}
let DiffEditorItemTemplate = class DiffEditorItemTemplate extends Disposable {
    constructor(_container, _overflowWidgetsDomNode, _workbenchUIElementFactory, _instantiationService, _parentContextKeyService) {
        super();
        this._container = _container;
        this._overflowWidgetsDomNode = _overflowWidgetsDomNode;
        this._workbenchUIElementFactory = _workbenchUIElementFactory;
        this._instantiationService = _instantiationService;
        this._viewModel = observableValue(this, undefined);
        this._collapsed = derived(this, reader => this._viewModel.read(reader)?.collapsed.read(reader));
        this._editorContentHeight = observableValue(this, 500);
        this.contentHeight = derived(this, reader => {
            const h = this._collapsed.read(reader) ? 0 : this._editorContentHeight.read(reader);
            return h + this._outerEditorHeight;
        });
        this._modifiedContentWidth = observableValue(this, 0);
        this._modifiedWidth = observableValue(this, 0);
        this._originalContentWidth = observableValue(this, 0);
        this._originalWidth = observableValue(this, 0);
        this.maxScroll = derived(this, reader => {
            const scroll1 = this._modifiedContentWidth.read(reader) - this._modifiedWidth.read(reader);
            const scroll2 = this._originalContentWidth.read(reader) - this._originalWidth.read(reader);
            if (scroll1 > scroll2) {
                return { maxScroll: scroll1, width: this._modifiedWidth.read(reader) };
            }
            else {
                return { maxScroll: scroll2, width: this._originalWidth.read(reader) };
            }
        });
        this._elements = h('div.multiDiffEntry', [
            h('div.header@header', [
                h('div.header-content', [
                    h('div.collapse-button@collapseButton'),
                    h('div.file-path', [
                        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                        h('div.title.modified.show-file-icons@primaryPath', []),
                        h('div.status.deleted@status', ['R']),
                        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                        h('div.title.original.show-file-icons@secondaryPath', []),
                    ]),
                    h('div.actions@actions'),
                ]),
            ]),
            h('div.editorParent', [
                h('div.editorContainer@editor'),
            ])
        ]);
        this.editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
            overflowWidgetsDomNode: this._overflowWidgetsDomNode,
            fixedOverflowWidgets: true
        }, {}));
        this.isModifedFocused = observableCodeEditor(this.editor.getModifiedEditor()).isFocused;
        this.isOriginalFocused = observableCodeEditor(this.editor.getOriginalEditor()).isFocused;
        this.isFocused = derived(this, reader => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));
        this._resourceLabel = this._workbenchUIElementFactory.createResourceLabel
            ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.primaryPath))
            : undefined;
        this._resourceLabel2 = this._workbenchUIElementFactory.createResourceLabel
            ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.secondaryPath))
            : undefined;
        this._dataStore = this._register(new DisposableStore());
        this._headerHeight = 40;
        this._lastScrollTop = -1;
        this._isSettingScrollTop = false;
        const btn = new Button(this._elements.collapseButton, {});
        this._register(autorun(reader => {
            btn.element.className = '';
            btn.icon = this._collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
        }));
        this._register(btn.onDidClick(() => {
            this._viewModel.get()?.collapsed.set(!this._collapsed.get(), undefined);
        }));
        this._register(autorun(reader => {
            this._elements.editor.style.display = this._collapsed.read(reader) ? 'none' : 'block';
        }));
        this._register(this.editor.getModifiedEditor().onDidLayoutChange(e => {
            const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
            this._modifiedWidth.set(width, undefined);
        }));
        this._register(this.editor.getOriginalEditor().onDidLayoutChange(e => {
            const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
            this._originalWidth.set(width, undefined);
        }));
        this._register(this.editor.onDidContentSizeChange(e => {
            globalTransaction(tx => {
                this._editorContentHeight.set(e.contentHeight, tx);
                this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
                this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
            });
        }));
        this._register(this.editor.getOriginalEditor().onDidScrollChange(e => {
            if (this._isSettingScrollTop) {
                return;
            }
            if (!e.scrollTopChanged || !this._data) {
                return;
            }
            const delta = e.scrollTop - this._lastScrollTop;
            this._data.deltaScrollVertical(delta);
        }));
        this._register(autorun(reader => {
            const isActive = this._viewModel.read(reader)?.isActive.read(reader);
            this._elements.root.classList.toggle('active', isActive);
        }));
        this._container.appendChild(this._elements.root);
        this._outerEditorHeight = this._headerHeight;
        this._contextKeyService = this._register(_parentContextKeyService.createScoped(this._elements.actions));
        const instantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
        this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
            actionRunner: this._register(new ActionRunnerWithContext(() => (this._viewModel.get()?.modifiedUri ?? this._viewModel.get()?.originalUri))),
            menuOptions: {
                shouldForwardArgs: true,
            },
            toolbarOptions: { primaryGroup: g => g.startsWith('navigation') },
            actionViewItemProvider: (action, options) => createActionViewItem(instantiationService, action, options),
        }));
    }
    setScrollLeft(left) {
        if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
            this.editor.getModifiedEditor().setScrollLeft(left);
        }
        else {
            this.editor.getOriginalEditor().setScrollLeft(left);
        }
    }
    setData(data) {
        this._data = data;
        function updateOptions(options) {
            return {
                ...options,
                scrollBeyondLastLine: false,
                hideUnchangedRegions: {
                    enabled: true,
                },
                scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'hidden',
                    handleMouseWheel: false,
                    useShadows: false,
                },
                renderOverviewRuler: false,
                fixedOverflowWidgets: true,
                overviewRulerBorder: false,
            };
        }
        if (!data) {
            globalTransaction(tx => {
                this._viewModel.set(undefined, tx);
                this.editor.setDiffModel(null, tx);
                this._dataStore.clear();
            });
            return;
        }
        const value = data.viewModel.documentDiffItem;
        globalTransaction(tx => {
            this._resourceLabel?.setUri(data.viewModel.modifiedUri ?? data.viewModel.originalUri, { strikethrough: data.viewModel.modifiedUri === undefined });
            let isRenamed = false;
            let isDeleted = false;
            let isAdded = false;
            let flag = '';
            if (data.viewModel.modifiedUri && data.viewModel.originalUri && data.viewModel.modifiedUri.path !== data.viewModel.originalUri.path) {
                flag = 'R';
                isRenamed = true;
            }
            else if (!data.viewModel.modifiedUri) {
                flag = 'D';
                isDeleted = true;
            }
            else if (!data.viewModel.originalUri) {
                flag = 'A';
                isAdded = true;
            }
            this._elements.status.classList.toggle('renamed', isRenamed);
            this._elements.status.classList.toggle('deleted', isDeleted);
            this._elements.status.classList.toggle('added', isAdded);
            this._elements.status.innerText = flag;
            this._resourceLabel2?.setUri(isRenamed ? data.viewModel.originalUri : undefined, { strikethrough: true });
            this._dataStore.clear();
            this._viewModel.set(data.viewModel, tx);
            this.editor.setDiffModel(data.viewModel.diffEditorViewModelRef, tx);
            this.editor.updateOptions(updateOptions(value.options ?? {}));
        });
        if (value.onOptionsDidChange) {
            this._dataStore.add(value.onOptionsDidChange(() => {
                this.editor.updateOptions(updateOptions(value.options ?? {}));
            }));
        }
        data.viewModel.isAlive.recomputeInitiallyAndOnChange(this._dataStore, value => {
            if (!value) {
                this.setData(undefined);
            }
        });
        if (data.viewModel.documentDiffItem.contextKeys) {
            for (const [key, value] of Object.entries(data.viewModel.documentDiffItem.contextKeys)) {
                this._contextKeyService.createKey(key, value);
            }
        }
    }
    render(verticalRange, width, editorScroll, viewPort) {
        this._elements.root.style.visibility = 'visible';
        this._elements.root.style.top = `${verticalRange.start}px`;
        this._elements.root.style.height = `${verticalRange.length}px`;
        this._elements.root.style.width = `${width}px`;
        this._elements.root.style.position = 'absolute';
        // For sticky scroll
        const maxDelta = verticalRange.length - this._headerHeight;
        const delta = Math.max(0, Math.min(viewPort.start - verticalRange.start, maxDelta));
        this._elements.header.style.transform = `translateY(${delta}px)`;
        globalTransaction(tx => {
            this.editor.layout({
                width: width - 2 * 8 - 2 * 1,
                height: verticalRange.length - this._outerEditorHeight,
            });
        });
        try {
            this._isSettingScrollTop = true;
            this._lastScrollTop = editorScroll;
            this.editor.getOriginalEditor().setScrollTop(editorScroll);
        }
        finally {
            this._isSettingScrollTop = false;
        }
        this._elements.header.classList.toggle('shadow', delta > 0 || editorScroll > 0);
        this._elements.header.classList.toggle('collapsed', delta === maxDelta);
    }
    hide() {
        this._elements.root.style.top = `-100000px`;
        this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
    }
};
DiffEditorItemTemplate = __decorate([
    __param(3, IInstantiationService),
    __param(4, IContextKeyService)
], DiffEditorItemTemplate);
export { DiffEditorItemTemplate };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvckl0ZW1UZW1wbGF0ZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvZGlmZkVkaXRvckl0ZW1UZW1wbGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQWlDLE1BQU0sc0RBQXNELENBQUM7QUFDekgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFHbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHckUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBR3JELE1BQU0s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