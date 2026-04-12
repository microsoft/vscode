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
import './outlinePane.css';
import * as dom from '../../../../base/browser/dom.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { TimeoutTimer, timeout } from '../../../../base/common/async.js';
import { toDisposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchDataTree } from '../../../../platform/list/browser/listService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { basename } from '../../../../base/common/resources.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { OutlineViewState } from './outlineViewState.js';
import { IOutlineService } from '../../../services/outline/browser/outline.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { AbstractTreeViewState, TreeFindMode } from '../../../../base/browser/ui/tree/abstractTree.js';
import { ctxAllCollapsed, ctxFilterOnType, ctxFocused, ctxFollowsCursor, ctxSortMode } from './outline.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
class OutlineTreeSorter {
    constructor(_comparator, order) {
        this._comparator = _comparator;
        this.order = order;
    }
    compare(a, b) {
        if (this.order === 2 /* OutlineSortOrder.ByKind */) {
            return this._comparator.compareByType(a, b);
        }
        else if (this.order === 1 /* OutlineSortOrder.ByName */) {
            return this._comparator.compareByName(a, b);
        }
        else {
            return this._comparator.compareByPosition(a, b);
        }
    }
}
let OutlinePane = class OutlinePane extends ViewPane {
    static { this.Id = 'outline'; }
    constructor(options, _outlineService, _instantiationService, viewDescriptorService, _storageService, _editorService, configurationService, keybindingService, contextKeyService, contextMenuService, openerService, themeService, hoverService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
        this._outlineService = _outlineService;
        this._instantiationService = _instantiationService;
        this._storageService = _storageService;
        this._editorService = _editorService;
        this._disposables = new DisposableStore();
        this._editorControlDisposables = new DisposableStore();
        this._editorPaneDisposables = new DisposableStore();
        this._outlineViewState = new OutlineViewState();
        this._editorListener = new MutableDisposable();
        this._treeStates = new LRUCache(10);
        this._editorControlChangePromise = Promise.resolve();
        this._outlineViewState.restore(this._storageService);
        this._disposables.add(this._outlineViewState);
        contextKeyService.bufferChangeEvents(() => {
            this._ctxFollowsCursor = ctxFollowsCursor.bindTo(contextKeyService);
            this._ctxFilterOnType = ctxFilterOnType.bindTo(contextKeyService);
            this._ctxSortMode = ctxSortMode.bindTo(contextKeyService);
            this._ctxAllCollapsed = ctxAllCollapsed.bindTo(contextKeyService);
        });
        const updateContext = () => {
            this._ctxFollowsCursor.set(this._outlineViewState.followCursor);
            this._ctxFilterOnType.set(this._outlineViewState.filterOnType);
            this._ctxSortMode.set(this._outlineViewState.sortBy);
        };
        updateContext();
        this._disposables.add(this._outlineViewState.onDidChange(updateContext));
    }
    dispose() {
        this._disposables.dispose();
        this._editorPaneDisposables.dispose();
        this._editorControlDisposables.dispose();
        this._editorListener.dispose();
        super.dispose();
    }
    focus() {
        this._editorControlChangePromise.then(() => {
            super.focus();
            this._tree?.domFocus();
        });
    }
    renderBody(container) {
        super.renderBody(container);
        this._domNode = container;
        container.classList.add('outline-pane');
        const progressContainer = dom.$('.outline-progress');
        this._message = dom.$('.outline-message');
        this._progressBar = new ProgressBar(progressContainer, defaultProgressBarStyles);
        this._treeContainer = dom.$('.outline-tree');
        dom.append(container, progressContainer, this._message, this._treeContainer);
        this._disposables.add(this.onDidChangeBodyVisibility(visible => {
            if (!visible) {
                // stop everything when not visible
                this._editorListener.clear();
                this._editorPaneDisposables.clear();
                this._editorControlDisposables.clear();
            }
            else if (!this._editorListener.value) {
                const event = Event.any(this._editorService.onDidActiveEditorChange, this._outlineService.onDidChange);
                this._editorListener.value = event(() => this._handleEditorChanged(this._editorService.activeEditorPane));
                this._handleEditorChanged(this._editorService.activeEditorPane);
            }
        }));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this._tree?.layout(height, width);
        this._treeDimensions = new dom.Dimension(width, height);
    }
    collapseAll() {
        this._tree?.collapseAll();
    }
    expandAll() {
        this._tree?.expandAll();
    }
    get outlineViewState() {
        return this._outlineViewState;
    }
    _showMessage(message) {
        this._domNode.classList.add('message');
        this._progressBar.stop().hide();
        this._message.textContent = message;
    }
    _captureViewState(uri) {
        if (this._tree) {
            const oldOutline = this._tree.getInput();
            if (!uri) {
                uri = oldOutline?.uri;
            }
            if (oldOutline && uri) {
                this._treeStates.set(`${oldOutline.outlineKind}/${uri}`, this._tree.getViewState());
                return true;
            }
        }
        return false;
    }
    _handleEditorChanged(pane) {
        this._editorPaneDisposables.clear();
        if (pane) {
            // react to control changes from within pane (https://github.com/microsoft/vscode/issues/134008)
            this._editorPaneDisposables.add(pane.onDidChangeControl(() => {
                this._editorControlChangePromise = this._handleEditorControlChanged(pane);
            }));
        }
        this._editorControlChangePromise = this._handleEditorControlChanged(pane);
    }
    async _handleEditorControlChanged(pane) {
        // persist state
        const resource = EditorResourceAccessor.getOriginalUri(pane?.input);
        const didCapture = this._captureViewState();
        this._editorControlDisposables.clear();
        if (!pane || !this._outlineService.canCreateOutline(pane) || !resource) {
            return this._showMessage(localize('no-editor', "The active editor cannot provide outline information."));
        }
        let loadingMessage;
        if (!didCapture) {
            loadingMessage = new TimeoutTimer(() => {
                this._showMessage(localize('loading', "Loading document symbols for '{0}'...", basename(resource)));
            }, 100);
        }
        this._progressBar.infinite().show(500);
        const cts = new CancellationTokenSource();
        this._editorControlDisposables.add(toDisposable(() => cts.dispose(true)));
        const newOutline = await this._outlineService.createOutline(pane, 1 /* OutlineTarget.OutlinePane */, cts.token);
        loadingMessage?.dispose();
        if (!newOutline) {
            return;
        }
        if (cts.token.isCancellationRequested) {
            newOutline?.dispose();
            return;
        }
        this._editorControlDisposables.add(newOutline);
        this._progressBar.stop().hide();
        const sorter = new OutlineTreeSorter(newOutline.config.comparator, this._outlineViewState.sortBy);
        const tree = this._instantiationService.createInstance((WorkbenchDataTree), 'OutlinePane', this._treeContainer, newOutline.config.delegate, newOutline.config.renderers, newOutline.config.treeDataSource, {
            ...newOutline.config.options,
            sorter,
            expandOnDoubleClick: false,
            expandOnlyOnTwistieClick: true,
            multipleSelectionSupport: false,
            hideTwistiesOfChildlessElements: true,
            defaultFindMode: this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight,
            overrideStyles: this.getLocationBasedColors().listOverrideStyles
        });
        ctxFocused.bindTo(tree.contextKeyService);
        // update tree, listen to changes
        const updateTree = () => {
            if (newOutline.isEmpty) {
                // no more elements
                this._showMessage(localize('no-symbols', "No symbols found in document '{0}'", basename(resource)));
                this._captureViewState(resource);
                tree.setInput(undefined);
            }
            else if (!tree.getInput()) {
                // first: init tree
                this._domNode.classList.remove('message');
                const state = this._treeStates.get(`${newOutline.outlineKind}/${newOutline.uri}`);
                tree.setInput(newOutline, state && AbstractTreeViewState.lift(state));
            }
            else {
                // update: refresh tree
                this._domNode.classList.remove('message');
                tree.updateChildren();
            }
        };
        updateTree();
        this._editorControlDisposables.add(newOutline.onDidChange(updateTree));
        // feature: apply panel background to tree
        this._editorControlDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
            if (views.some(v => v.id === this.id)) {
                tree.updateOptions({ overrideStyles: this.getLocationBasedColors().listOverrideStyles });
            }
        }));
        // feature: filter on type - keep tree and menu in sync
        this._editorControlDisposables.add(tree.onDidChangeFindMode(mode => this._outlineViewState.filterOnType = mode === TreeFindMode.Filter));
        // feature: reveal outline selection in editor
        // on change -> reveal/select defining range
        let idPool = 0;
        this._editorControlDisposables.add(tree.onDidOpen(async (e) => {
            const myId = ++idPool;
            const isDoubleClick = e.browserEvent?.type === 'dblclick';
            if (!isDoubleClick) {
                // workaround for https://github.com/microsoft/vscode/issues/206424
                await timeout(150);
                if (myId !== idPool) {
                    return;
                }
            }
            await newOutline.reveal(e.element, e.editorOptions, e.sideBySide, isDoubleClick);
        }));
        // feature: reveal editor selection in outline
        const revealActiveElement = () => {
            if (!this._outlineViewState.followCursor || !newOutline.activeElement) {
                return;
            }
            let item = newOutline.activeElement;
            while (item) {
                const top = tree.getRelativeTop(item);
                if (top === null) {
                    // not visible -> reveal
                    tree.reveal(item, 0.5);
                }
                if (tree.getRelativeTop(item) !== null) {
                    tree.setFocus([item]);
                    tree.setSelection([item]);
                    break;
                }
                // STILL not visible -> try parent
                item = tree.getParentElement(item);
            }
        };
        revealActiveElement();
        this._editorControlDisposables.add(newOutline.onDidChange(revealActiveElement));
        // feature: update view when user state changes
        this._editorControlDisposables.add(this._outlineViewState.onDidChange((e) => {
            this._outlineViewState.persist(this._storageService);
            if (e.filterOnType) {
                tree.findMode = this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight;
            }
            if (e.followCursor) {
                revealActiveElement();
            }
            if (e.sortBy) {
                sorter.order = this._outlineViewState.sortBy;
                tree.resort();
            }
        }));
        // feature: expand all nodes when filtering (not when finding)
        let viewState;
        this._editorControlDisposables.add(tree.onDidChangeFindPattern(pattern => {
            if (tree.findMode === TreeFindMode.Highlight) {
                return;
            }
            if (!viewState && pattern) {
                viewState = tree.getViewState();
                tree.expandAll();
            }
            else if (!pattern && viewState) {
                tree.setInput(tree.getInput(), viewState);
                viewState = undefined;
            }
        }));
        // feature: update all-collapsed context key
        const updateAllCollapsedCtx = () => {
            this._ctxAllCollapsed.set(tree.getNode(null).children.every(node => !node.collapsible || node.collapsed));
        };
        this._editorControlDisposables.add(tree.onDidChangeCollapseState(updateAllCollapsedCtx));
        this._editorControlDisposables.add(tree.onDidChangeModel(updateAllCollapsedCtx));
        updateAllCollapsedCtx();
        // last: set tree property and wire it up to one of our context keys
        tree.layout(this._treeDimensions?.height, this._treeDimensions?.width);
        this._tree = tree;
        this._editorControlDisposables.add(toDisposable(() => {
            tree.dispose();
            this._tree = undefined;
        }));
    }
};
OutlinePane = __decorate([
    __param(1, IOutlineService),
    __param(2, IInstantiationService),
    __param(3, IViewDescriptorService),
    __param(4, IStorageService),
    __param(5, IEditorService),
    __param(6, IConfigurationService),
    __param(7, IKeybindingService),
    __param(8, IContextKeyService),
    __param(9, IContextMenuService),
    __param(10, IOpenerService),
    __param(11, IThemeService),
    __param(12, IHoverService)
], OutlinePane);
export { OutlinePane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZVBhbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZVBhbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxtQkFBbUIsQ0FBQztBQUMzQixPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pFLE9BQU8sRUFBZSxZQUFZLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDckgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQWdDLGVBQWUsRUFBaUIsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1SCxPQUFPLEVBQUUsc0JBQXNCLEVBQWUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLHFCQUFxQixFQUEwQixZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUUvSCxPQUFPLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFrQyxNQUFNLGNBQWMsQ0FBQztBQUMzSSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFNUUsTUFBTSxpQkFBaUI7SUFFdEIsWUFDUyxXQUFrQyxFQUNuQyxLQUF1QjtRQUR0QixnQkFBVyxHQUFYLFdBQVcsQ0FBdUI7UUFDbkMsVUFBSyxHQUFMLEtBQUssQ0FBa0I7SUFDM0IsQ0FBQztJQUVMLE9BQU8sQ0FBQyxDQUFJLEVBQUUsQ0FBSTtRQUNqQixJQUFJLElBQUksQ0FBQyxLQUFLLG9DQUE0QixFQUFFLENBQUM7WUFDNUMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLEtBQUssb0NBQTRCLEVBQUUsQ0FBQztZQUNuRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVNLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVksU0FBUSxRQUFRO2FBRXhCLE9BQUUsR0FBRyxTQUFTLEFBQVosQ0FBYTtJQXVCL0IsWUFDQyxPQUE0QixFQUNYLGVBQWlELEVBQzNDLHFCQUE2RCxFQUM1RCxxQkFBNkMsRUFDcEQsZUFBaUQsRUFDbEQsY0FBK0MsRUFDeEMsb0JBQTJDLEVBQzlDLGlCQUFxQyxFQUNyQyxpQkFBcUMsRUFDcEMsa0JBQXVDLEVBQzVDLGFBQTZCLEVBQzlCLFlBQTJCLEVBQzNCLFlBQTJCO1FBRTFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztRQWJ0SixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDMUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUVsRCxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDakMsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBM0IvQyxpQkFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFckMsOEJBQXlCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNsRCwyQkFBc0IsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQy9DLHNCQUFpQixHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUUzQyxvQkFBZSxHQUFHLElBQUksaUJBQWlCLEVBQUUsQ0FBQztRQVFuRCxnQkFBVyxHQUFHLElBQUksUUFBUSxDQUFpQyxFQUFFLENBQUMsQ0FBQztRQTRIL0QsZ0NBQTJCLEdBQWtCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQXJHdEUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFOUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO1lBQ3pDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxZQUFZLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbkUsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxHQUFHLEVBQUU7WUFDMUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDL0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQztRQUNGLGFBQWEsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRVEsT0FBTztRQUNmLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6QyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQy9CLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBRVEsS0FBSztRQUNiLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQzFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRWtCLFVBQVUsQ0FBQyxTQUFzQjtRQUNuRCxLQUFLLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTVCLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO1FBQzFCLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXhDLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxRQUFRLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUVqRixJQUFJLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDN0MsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFN0UsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQzlELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZCxtQ0FBbUM7Z0JBQ25DLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXhDLENBQUM7aUJBQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN2RyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUMxRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ2pFLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVrQixVQUFVLENBQUMsTUFBYyxFQUFFLEtBQWE7UUFDMUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQsV0FBVztRQUNWLElBQUksQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVELFNBQVM7UUFDUixJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNuQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUMvQixDQUFDO0lBRU8sWUFBWSxDQUFDLE9BQWU7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDO0lBQ3JDLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxHQUFTO1FBQ2xDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDekMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNWLEdBQUcsR0FBRyxVQUFVLEVBQUUsR0FBRyxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxJQUFJLFVBQVUsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsV0FBVyxJQUFJLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztnQkFDcEYsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUdPLG9CQUFvQixDQUFDLElBQTZCO1FBQ3pELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsZ0dBQWdHO1lBQ2hHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtnQkFDNUQsSUFBSSxDQUFDLDJCQUEyQixHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksQ0FBQywyQkFBMkIsR0FBRyxJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVPLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxJQUE2QjtRQUV0RSxnQkFBZ0I7UUFDaEIsTUFBTSxRQUFRLEdBQUcsc0JBQXNCLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRSxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUU1QyxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFdkMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN4RSxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSx1REFBdUQsQ0FBQyxDQUFDLENBQUM7UUFDMUcsQ0FBQztRQUVELElBQUksY0FBdUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsY0FBYyxHQUFHLElBQUksWUFBWSxDQUFDLEdBQUcsRUFBRTtnQkFDdEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLHVDQUF1QyxFQUFFLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ1QsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXZDLE1BQU0sR0FBRyxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUMxQyxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUxRSxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLElBQUkscUNBQTZCLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4RyxjQUFjLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFFMUIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDdkMsVUFBVSxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWhDLE1BQU0sTUFBTSxHQUFHLElBQUksaUJBQWlCLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWxHLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQ3JELENBQUEsaUJBQXFFLENBQUEsRUFDckUsYUFBYSxFQUNiLElBQUksQ0FBQyxjQUFjLEVBQ25CLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUMxQixVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFDM0IsVUFBVSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQ2hDO1lBQ0MsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLE9BQU87WUFDNUIsTUFBTTtZQUNOLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsd0JBQXdCLEVBQUUsSUFBSTtZQUM5Qix3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLCtCQUErQixFQUFFLElBQUk7WUFDckMsZUFBZSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ25HLGNBQWMsRUFBRSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxrQkFBa0I7U0FDaEUsQ0FDRCxDQUFDO1FBRUYsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUUxQyxpQ0FBaUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsR0FBRyxFQUFFO1lBQ3ZCLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN4QixtQkFBbUI7Z0JBQ25CLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxvQ0FBb0MsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFMUIsQ0FBQztpQkFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQzdCLG1CQUFtQjtnQkFDbkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxXQUFXLElBQUksVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ2xGLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLEtBQUssSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUV2RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsdUJBQXVCO2dCQUN2QixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN2QixDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBQ0YsVUFBVSxFQUFFLENBQUM7UUFDYixJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUV2RSwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDL0YsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFDMUYsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSix1REFBdUQ7UUFDdkQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsWUFBWSxHQUFHLElBQUksS0FBSyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUV6SSw4Q0FBOEM7UUFDOUMsNENBQTRDO1FBQzVDLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7WUFDM0QsTUFBTSxJQUFJLEdBQUcsRUFBRSxNQUFNLENBQUM7WUFDdEIsTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxJQUFJLEtBQUssVUFBVSxDQUFDO1lBQzFELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDcEIsbUVBQW1FO2dCQUNuRSxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkIsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7b0JBQ3JCLE9BQU87Z0JBQ1IsQ0FBQztZQUNGLENBQUM7WUFDRCxNQUFNLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEYsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLDhDQUE4QztRQUM5QyxNQUFNLG1CQUFtQixHQUFHLEdBQUcsRUFBRTtZQUNoQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDdkUsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLElBQUksR0FBRyxVQUFVLENBQUMsYUFBYSxDQUFDO1lBQ3BDLE9BQU8sSUFBSSxFQUFFLENBQUM7Z0JBQ2IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdEMsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ2xCLHdCQUF3QjtvQkFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7Z0JBQ0QsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO29CQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDdEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzFCLE1BQU07Z0JBQ1AsQ0FBQztnQkFDRCxrQ0FBa0M7Z0JBQ2xDLElBQUksR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEMsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUNGLG1CQUFtQixFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUVoRiwrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBdUUsRUFBRSxFQUFFO1lBQ2pKLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNwQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7WUFDcEcsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNwQixtQkFBbUIsRUFBRSxDQUFDO1lBQ3ZCLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDZCxNQUFNLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUM7Z0JBQzdDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNmLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosOERBQThEO1FBQzlELElBQUksU0FBNEMsQ0FBQztRQUNqRCxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN4RSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssWUFBWSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUM5QyxPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxTQUFTLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzNCLFNBQVMsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNsQixDQUFDO2lCQUFNLElBQUksQ0FBQyxPQUFPLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUMzQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosNENBQTRDO1FBQzVDLE1BQU0scUJBQXFCLEdBQUcsR0FBRyxFQUFFO1lBQ2xDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzNHLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUN6RixJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDakYscUJBQXFCLEVBQUUsQ0FBQztRQUV4QixvRUFBb0U7UUFDcEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUNwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUEvVVcsV0FBVztJQTJCckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSxjQUFjLENBQUE7SUFDZCxZQUFBLGFBQWEsQ0FBQTtJQUNiLFlBQUEsYUFBYSxDQUFBO0dBdENILFdBQVcsQ0FnVnZCIn0=