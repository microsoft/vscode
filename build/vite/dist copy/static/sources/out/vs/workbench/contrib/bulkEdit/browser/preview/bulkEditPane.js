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
var BulkEditPane_1;
import { ButtonBar } from '../../../../../base/browser/ui/button/button.js';
import { CachedFunction, LRUCachedFunction } from '../../../../../base/common/cache.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import './bulkEdit.css';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { BulkEditPreviewProvider, BulkFileOperations } from './bulkEditPreview.js';
import { BulkEditAccessibilityProvider, BulkEditDataSource, BulkEditDelegate, BulkEditIdentityProvider, BulkEditNaviLabelProvider, BulkEditSorter, CategoryElement, CategoryElementRenderer, compareBulkFileOperations, FileElement, FileElementRenderer, TextEditElement, TextEditElementRenderer } from './bulkEditTree.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
var State;
(function (State) {
    State["Data"] = "data";
    State["Message"] = "message";
})(State || (State = {}));
let BulkEditPane = class BulkEditPane extends ViewPane {
    static { BulkEditPane_1 = this; }
    static { this.ID = 'refactorPreview'; }
    static { this.Schema = 'vscode-bulkeditpreview-multieditor'; }
    static { this.ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false); }
    static { this.ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true); }
    static { this.ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true); }
    static { this._memGroupByFile = `${this.ID}.groupByFile`; }
    constructor(options, _instaService, _editorService, _labelService, _textModelService, _dialogService, _contextMenuService, _storageService, contextKeyService, viewDescriptorService, keybindingService, contextMenuService, configurationService, openerService, themeService, hoverService) {
        super({ ...options, titleMenuId: MenuId.BulkEditTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instaService, openerService, themeService, hoverService);
        this._instaService = _instaService;
        this._editorService = _editorService;
        this._labelService = _labelService;
        this._textModelService = _textModelService;
        this._dialogService = _dialogService;
        this._contextMenuService = _contextMenuService;
        this._storageService = _storageService;
        this._treeViewStates = new Map();
        this._disposables = new DisposableStore();
        this._sessionDisposables = new DisposableStore();
        this._computeResourceDiffEditorInputs = new LRUCachedFunction(async (fileOperations) => {
            const computeDiffEditorInput = new CachedFunction(async (fileOperation) => {
                const fileOperationUri = fileOperation.uri;
                const previewUri = this._currentProvider.asPreviewUri(fileOperationUri);
                // delete
                if (fileOperation.type & 4 /* BulkFileOperationType.Delete */) {
                    return {
                        original: { resource: URI.revive(previewUri) },
                        modified: { resource: undefined },
                        goToFileResource: fileOperation.uri,
                    };
                }
                // rename, create, edits
                else {
                    let leftResource;
                    try {
                        (await this._textModelService.createModelReference(fileOperationUri)).dispose();
                        leftResource = fileOperationUri;
                    }
                    catch {
                        leftResource = BulkEditPreviewProvider.emptyPreview;
                    }
                    return {
                        original: { resource: URI.revive(leftResource) },
                        modified: { resource: URI.revive(previewUri) },
                        goToFileResource: leftResource,
                    };
                }
            });
            const sortedFileOperations = fileOperations.slice().sort(compareBulkFileOperations);
            const resources = [];
            for (const operation of sortedFileOperations) {
                resources.push(await computeDiffEditorInput.get(operation));
            }
            const getResourceDiffEditorInputIdOfOperation = async (operation) => {
                const resource = await computeDiffEditorInput.get(operation);
                return { original: resource.original.resource, modified: resource.modified.resource };
            };
            return {
                resources,
                getResourceDiffEditorInputIdOfOperation
            };
        });
        this.element.classList.add('bulk-edit-panel', 'show-file-icons');
        this._ctxHasCategories = BulkEditPane_1.ctxHasCategories.bindTo(contextKeyService);
        this._ctxGroupByFile = BulkEditPane_1.ctxGroupByFile.bindTo(contextKeyService);
        this._ctxHasCheckedChanges = BulkEditPane_1.ctxHasCheckedChanges.bindTo(contextKeyService);
    }
    dispose() {
        this._tree.dispose();
        this._disposables.dispose();
        this._sessionDisposables.dispose();
        super.dispose();
    }
    renderBody(parent) {
        super.renderBody(parent);
        const resourceLabels = this._instaService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
        this._disposables.add(resourceLabels);
        const contentContainer = document.createElement('div');
        contentContainer.className = 'content';
        parent.appendChild(contentContainer);
        // tree
        const treeContainer = document.createElement('div');
        contentContainer.appendChild(treeContainer);
        this._treeDataSource = this._instaService.createInstance(BulkEditDataSource);
        this._treeDataSource.groupByFile = this._storageService.getBoolean(BulkEditPane_1._memGroupByFile, 0 /* StorageScope.PROFILE */, true);
        this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
        this._tree = this._instaService.createInstance((WorkbenchAsyncDataTree), this.id, treeContainer, new BulkEditDelegate(), [this._instaService.createInstance(TextEditElementRenderer), this._instaService.createInstance(FileElementRenderer, resourceLabels), this._instaService.createInstance(CategoryElementRenderer)], this._treeDataSource, {
            accessibilityProvider: this._instaService.createInstance(BulkEditAccessibilityProvider),
            identityProvider: new BulkEditIdentityProvider(),
            expandOnlyOnTwistieClick: true,
            multipleSelectionSupport: false,
            keyboardNavigationLabelProvider: new BulkEditNaviLabelProvider(),
            sorter: new BulkEditSorter(),
            selectionNavigation: true
        });
        this._disposables.add(this._tree.onContextMenu(this._onContextMenu, this));
        this._disposables.add(this._tree.onDidOpen(e => this._openElementInMultiDiffEditor(e)));
        // buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'buttons';
        contentContainer.appendChild(buttonsContainer);
        const buttonBar = new ButtonBar(buttonsContainer);
        this._disposables.add(buttonBar);
        const btnConfirm = buttonBar.addButton({ supportIcons: true, ...defaultButtonStyles });
        btnConfirm.label = localize('ok', 'Apply');
        btnConfirm.onDidClick(() => this.accept(), this, this._disposables);
        const btnCancel = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
        btnCancel.label = localize('cancel', 'Discard');
        btnCancel.onDidClick(() => this.discard(), this, this._disposables);
        // message
        this._message = document.createElement('span');
        this._message.className = 'message';
        this._message.innerText = localize('empty.msg', "Invoke a code action, like rename, to see a preview of its changes here.");
        parent.appendChild(this._message);
        //
        this._setState("message" /* State.Message */);
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        const treeHeight = height - 50;
        this._tree.getHTMLElement().parentElement.style.height = `${treeHeight}px`;
        this._tree.layout(treeHeight, width);
    }
    _setState(state) {
        this.element.dataset['state'] = state;
    }
    async setInput(edit, token) {
        this._setState("data" /* State.Data */);
        this._sessionDisposables.clear();
        this._treeViewStates.clear();
        if (this._currentResolve) {
            this._currentResolve(undefined);
            this._currentResolve = undefined;
        }
        const input = await this._instaService.invokeFunction(BulkFileOperations.create, edit);
        this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, input);
        this._sessionDisposables.add(this._currentProvider);
        this._sessionDisposables.add(input);
        //
        const hasCategories = input.categories.length > 1;
        this._ctxHasCategories.set(hasCategories);
        this._treeDataSource.groupByFile = !hasCategories || this._treeDataSource.groupByFile;
        this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
        this._currentInput = input;
        return new Promise(resolve => {
            token.onCancellationRequested(() => resolve(undefined));
            this._currentResolve = resolve;
            this._setTreeInput(input);
            // refresh when check state changes
            this._sessionDisposables.add(input.checked.onDidChange(() => {
                this._tree.updateChildren();
                this._ctxHasCheckedChanges.set(input.checked.checkedCount > 0);
            }));
        });
    }
    hasInput() {
        return Boolean(this._currentInput);
    }
    async _setTreeInput(input) {
        const viewState = this._treeViewStates.get(this._treeDataSource.groupByFile);
        await this._tree.setInput(input, viewState);
        this._tree.domFocus();
        if (viewState) {
            return;
        }
        // async expandAll (max=10) is the default when no view state is given
        const expand = [...this._tree.getNode(input).children].slice(0, 10);
        while (expand.length > 0) {
            const { element } = expand.shift();
            if (element instanceof FileElement) {
                await this._tree.expand(element, true);
            }
            if (element instanceof CategoryElement) {
                await this._tree.expand(element, true);
                expand.push(...this._tree.getNode(element).children);
            }
        }
    }
    accept() {
        const conflicts = this._currentInput?.conflicts.list();
        if (!conflicts || conflicts.length === 0) {
            this._done(true);
            return;
        }
        let message;
        if (conflicts.length === 1) {
            message = localize('conflict.1', "Cannot apply refactoring because '{0}' has changed in the meantime.", this._labelService.getUriLabel(conflicts[0], { relative: true }));
        }
        else {
            message = localize('conflict.N', "Cannot apply refactoring because {0} other files have changed in the meantime.", conflicts.length);
        }
        this._dialogService.warn(message).finally(() => this._done(false));
    }
    discard() {
        this._done(false);
    }
    _done(accept) {
        this._currentResolve?.(accept ? this._currentInput?.getWorkspaceEdit() : undefined);
        this._currentInput = undefined;
        this._setState("message" /* State.Message */);
        this._sessionDisposables.clear();
    }
    toggleChecked() {
        const [first] = this._tree.getFocus();
        if ((first instanceof FileElement || first instanceof TextEditElement) && !first.isDisabled()) {
            first.setChecked(!first.isChecked());
        }
        else if (first instanceof CategoryElement) {
            first.setChecked(!first.isChecked());
        }
    }
    groupByFile() {
        if (!this._treeDataSource.groupByFile) {
            this.toggleGrouping();
        }
    }
    groupByType() {
        if (this._treeDataSource.groupByFile) {
            this.toggleGrouping();
        }
    }
    toggleGrouping() {
        const input = this._tree.getInput();
        if (input) {
            // (1) capture view state
            const oldViewState = this._tree.getViewState();
            this._treeViewStates.set(this._treeDataSource.groupByFile, oldViewState);
            // (2) toggle and update
            this._treeDataSource.groupByFile = !this._treeDataSource.groupByFile;
            this._setTreeInput(input);
            // (3) remember preference
            this._storageService.store(BulkEditPane_1._memGroupByFile, this._treeDataSource.groupByFile, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            this._ctxGroupByFile.set(this._treeDataSource.groupByFile);
        }
    }
    async _openElementInMultiDiffEditor(e) {
        const fileOperations = this._currentInput?.fileOperations;
        if (!fileOperations) {
            return;
        }
        let selection = undefined;
        let fileElement;
        if (e.element instanceof TextEditElement) {
            fileElement = e.element.parent;
            selection = e.element.edit.textEdit.textEdit.range;
        }
        else if (e.element instanceof FileElement) {
            fileElement = e.element;
            selection = e.element.edit.textEdits[0]?.textEdit.textEdit.range;
        }
        else {
            // invalid event
            return;
        }
        const result = await this._computeResourceDiffEditorInputs.get(fileOperations);
        const resourceId = await result.getResourceDiffEditorInputIdOfOperation(fileElement.edit);
        const options = {
            ...e.editorOptions,
            viewState: {
                revealData: {
                    resource: resourceId,
                    range: selection,
                }
            }
        };
        const multiDiffSource = URI.from({ scheme: BulkEditPane_1.Schema });
        const label = 'Refactor Preview';
        this._editorService.openEditor({
            multiDiffSource,
            label,
            options,
            isTransient: true,
            description: label,
            resources: result.resources
        }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }
    _onContextMenu(e) {
        this._contextMenuService.showContextMenu({
            menuId: MenuId.BulkEditContext,
            contextKeyService: this.contextKeyService,
            getAnchor: () => e.anchor
        });
    }
};
BulkEditPane = BulkEditPane_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IEditorService),
    __param(3, ILabelService),
    __param(4, ITextModelService),
    __param(5, IDialogService),
    __param(6, IContextMenuService),
    __param(7, IStorageService),
    __param(8, IContextKeyService),
    __param(9, IViewDescriptorService),
    __param(10, IKeybindingService),
    __param(11, IContextMenuService),
    __param(12, IConfigurationService),
    __param(13, IOpenerService),
    __param(14, IThemeService),
    __param(15, IHoverService)
], BulkEditPane);
export { BulkEditPane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRQYW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9wcmV2aWV3L2J1bGtFZGl0UGFuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUd4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sZ0JBQWdCLENBQUM7QUFJeEIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsYUFBYSxFQUFF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