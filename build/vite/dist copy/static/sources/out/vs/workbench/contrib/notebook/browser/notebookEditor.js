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
var NotebookEditor_1;
import * as DOM from '../../../../base/browser/dom.js';
import { toAction } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ByteSize, IFileService, TooLargeFileOperationError } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, createEditorOpenError, createTooLargeFileError, isEditorOpenError } from '../../../common/editor.js';
import { SELECT_KERNEL_ID } from './controller/coreActions.js';
import { INotebookEditorService } from './services/notebookEditorService.js';
import { NotebooKernelActionViewItem } from './viewParts/notebookKernelView.js';
import { CellKind, NOTEBOOK_EDITOR_ID, NotebookWorkingCopyTypeIdentifier } from '../common/notebookCommon.js';
import { NotebookEditorInput } from '../common/notebookEditorInput.js';
import { NotebookPerfMarks } from '../common/notebookPerformance.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { InstallRecommendedExtensionAction } from '../../extensions/browser/extensionsActions.js';
import { INotebookService } from '../common/notebookService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'NotebookEditorViewState';
let NotebookEditor = class NotebookEditor extends EditorPane {
    static { NotebookEditor_1 = this; }
    static { this.ID = NOTEBOOK_EDITOR_ID; }
    get onDidFocus() { return this._onDidFocusWidget.event; }
    get onDidBlur() { return this._onDidBlurWidget.event; }
    constructor(group, telemetryService, themeService, _instantiationService, storageService, _editorService, _editorGroupService, _notebookWidgetService, _contextKeyService, _fileService, configurationService, _editorProgressService, _notebookService, _extensionsWorkbenchService, _workingCopyBackupService, logService, _preferencesService) {
        super(NotebookEditor_1.ID, group, telemetryService, themeService, storageService);
        this._instantiationService = _instantiationService;
        this._editorService = _editorService;
        this._editorGroupService = _editorGroupService;
        this._notebookWidgetService = _notebookWidgetService;
        this._contextKeyService = _contextKeyService;
        this._fileService = _fileService;
        this._editorProgressService = _editorProgressService;
        this._notebookService = _notebookService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._workingCopyBackupService = _workingCopyBackupService;
        this.logService = logService;
        this._preferencesService = _preferencesService;
        this._groupListener = this._register(new DisposableStore());
        this._widgetDisposableStore = this._register(new DisposableStore());
        this._widget = { value: undefined };
        this._inputListener = this._register(new MutableDisposable());
        // override onDidFocus and onDidBlur to be based on the NotebookEditorWidget element
        this._onDidFocusWidget = this._register(new Emitter());
        this._onDidBlurWidget = this._register(new Emitter());
        this._onDidChangeModel = this._register(new Emitter());
        this.onDidChangeModel = this._onDidChangeModel.event;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._onDidChangeScroll = this._register(new Emitter());
        this.onDidChangeScroll = this._onDidChangeScroll.event;
        this._editorMemento = this.getEditorMemento(_editorGroupService, configurationService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
        this._register(this._fileService.onDidChangeFileSystemProviderCapabilities(e => this._onDidChangeFileSystemProvider(e.scheme)));
        this._register(this._fileService.onDidChangeFileSystemProviderRegistrations(e => this._onDidChangeFileSystemProvider(e.scheme)));
    }
    _onDidChangeFileSystemProvider(scheme) {
        if (this.input instanceof NotebookEditorInput && this.input.resource?.scheme === scheme) {
            this._updateReadonly(this.input);
        }
    }
    _onDidChangeInputCapabilities(input) {
        if (this.input === input) {
            this._updateReadonly(input);
        }
    }
    _updateReadonly(input) {
        this._widget.value?.setOptions({ isReadOnly: !!input.isReadonly() });
    }
    get textModel() {
        return this._widget.value?.textModel;
    }
    get minimumWidth() { return 220; }
    get maximumWidth() { return Number.POSITIVE_INFINITY; }
    // these setters need to exist because this extends from EditorPane
    set minimumWidth(value) { }
    set maximumWidth(value) { }
    //#region Editor Core
    get scopedContextKeyService() {
        return this._widget.value?.scopedContextKeyService;
    }
    createEditor(parent) {
        this._rootElement = DOM.append(parent, DOM.$('.notebook-editor'));
        this._rootElement.id = `notebook-editor-element-${generateUuid()}`;
    }
    getActionViewItem(action, options) {
        if (action.id === SELECT_KERNEL_ID) {
            // this is being disposed by the consumer
            return this._register(this._instantiationService.createInstance(NotebooKernelActionViewItem, action, this, options));
        }
        return undefined;
    }
    getControl() {
        return this._widget.value;
    }
    setVisible(visible) {
        super.setVisible(visible);
        if (!visible) {
            this._widget.value?.onWillHide();
        }
    }
    setEditorVisible(visible) {
        super.setEditorVisible(visible);
        this._groupListener.clear();
        this._groupListener.add(this.group.onWillCloseEditor(e => this._saveEditorViewState(e.editor)));
        this._groupListener.add(this.group.onDidModelChange(() => {
            if (this._editorGroupService.activeGroup !== this.group) {
                this._widget?.value?.updateEditorFocus();
            }
        }));
        if (!visible) {
            this._saveEditorViewState(this.input);
            if (this.input && this._widget.value) {
                // the widget is not transfered to other editor inputs
                this._widget.value.onWillHide();
            }
        }
    }
    focus() {
        super.focus();
        this._widget.value?.focus();
    }
    hasFocus() {
        const value = this._widget.value;
        if (!value) {
            return false;
        }
        return !!value && (DOM.isAncestorOfActiveElement(value.getDomNode() || DOM.isAncestorOfActiveElement(value.getOverflowContainerDomNode())));
    }
    async setInput(input, options, context, token, noRetry) {
        try {
            let perfMarksCaptured = false;
            const fileOpenMonitor = timeout(10000);
            fileOpenMonitor.then(() => {
                perfMarksCaptured = true;
                this._handlePerfMark(perf, input);
            });
            const perf = new NotebookPerfMarks();
            perf.mark('startTime');
            this._inputListener.value = input.onDidChangeCapabilities(() => this._onDidChangeInputCapabilities(input));
            this._widgetDisposableStore.clear();
            // there currently is a widget which we still own so
            // we need to hide it before getting a new widget
            this._widget.value?.onWillHide();
            this._widget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, input, undefined, this._pagePosition?.dimension, this.window);
            if (this._rootElement && this._widget.value.getDomNode()) {
                this._rootElement.setAttribute('aria-flowto', this._widget.value.getDomNode().id || '');
                DOM.setParentFlowTo(this._widget.value.getDomNode(), this._rootElement);
            }
            this._widgetDisposableStore.add(this._widget.value.onDidChangeModel(() => this._onDidChangeModel.fire()));
            this._widgetDisposableStore.add(this._widget.value.onDidChangeActiveCell(() => this._onDidChangeSelection.fire({ reason: 2 /* EditorPaneSelectionChangeReason.USER */ })));
            if (this._pagePosition) {
                this._widget.value.layout(this._pagePosition.dimension, this._rootElement, this._pagePosition.position);
            }
            // only now `setInput` and yield/await. this is AFTER the actual widget is ready. This is very important
            // so that others synchronously receive a notebook editor with the correct widget being set
            await super.setInput(input, options, context, token);
            const model = await input.resolve(options, perf);
            perf.mark('inputLoaded');
            // Check for cancellation
            if (token.isCancellationRequested) {
                return undefined;
            }
            // The widget has been taken away again. This can happen when the tab has been closed while
            // loading was in progress, in particular when open the same resource as different view type.
            // When this happen, retry once
            if (!this._widget.value) {
                if (noRetry) {
                    return undefined;
                }
                return this.setInput(input, options, context, token, true);
            }
            if (model === null) {
                const knownProvider = this._notebookService.getViewTypeProvider(input.viewType);
                if (!knownProvider) {
                    throw new Error(localize('fail.noEditor', "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType));
                }
                await this._extensionsWorkbenchService.whenInitialized;
                const extensionInfo = this._extensionsWorkbenchService.local.find(e => e.identifier.id === knownProvider);
                throw createEditorOpenError(new Error(localize('fail.noEditor.extensionMissing', "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType)), [
                    toAction({
                        id: 'workbench.notebook.action.installOrEnableMissing', label: extensionInfo
                            ? localize('notebookOpenEnableMissingViewType', "Enable extension for '{0}'", input.viewType)
                            : localize('notebookOpenInstallMissingViewType', "Install extension for '{0}'", input.viewType),
                        run: async () => {
                            const d = this._notebookService.onAddViewType(viewType => {
                                if (viewType === input.viewType) {
                                    // serializer is registered, try to open again
                                    this._editorService.openEditor({ resource: input.resource });
                                    d.dispose();
                                }
                            });
                            const extensionInfo = this._extensionsWorkbenchService.local.find(e => e.identifier.id === knownProvider);
                            try {
                                if (extensionInfo) {
                                    await this._extensionsWorkbenchService.setEnablement(extensionInfo, extensionInfo.enablementState === 11 /* EnablementState.DisabledWorkspace */ ? 13 /* EnablementState.EnabledWorkspace */ : 12 /* EnablementState.EnabledGlobally */);
                                }
                                else {
                                    await this._instantiationService.createInstance(InstallRecommendedExtensionAction, knownProvider).run();
                                }
                            }
                            catch (ex) {
                                this.logService.error(`Failed to install or enable extension ${knownProvider}`, ex);
                                d.dispose();
                            }
                        }
                    }),
                    toAction({
                        id: 'workbench.notebook.action.openAsText', label: localize('notebookOpenAsText', "Open As Text"), run: async () => {
                            const backup = await this._workingCopyBackupService.resolve({ resource: input.resource, typeId: NotebookWorkingCopyTypeIdentifier.create(input.viewType) });
                            if (backup) {
                                // with a backup present, we must resort to opening the backup contents
                                // as untitled text file to not show the wrong data to the user
                                const contents = await streamToBuffer(backup.value);
                                this._editorService.openEditor({ resource: undefined, contents: contents.toString() });
                            }
                            else {
                                // without a backup present, we can open the original resource
                                this._editorService.openEditor({ resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } });
                            }
                        }
                    })
                ], { allowDialog: true });
            }
            this._widgetDisposableStore.add(model.notebook.onDidChangeContent(() => this._onDidChangeSelection.fire({ reason: 3 /* EditorPaneSelectionChangeReason.EDIT */ })));
            const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
            // We might be moving the notebook widget between groups, and these services are tied to the group
            this._widget.value.setParentContextKeyService(this._contextKeyService);
            this._widget.value.setEditorProgressService(this._editorProgressService);
            await this._widget.value.setModel(model.notebook, viewState, perf);
            const isReadOnly = !!input.isReadonly();
            await this._widget.value.setOptions({ ...options, isReadOnly });
            this._widgetDisposableStore.add(this._widget.value.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
            this._widgetDisposableStore.add(this._widget.value.onDidBlurWidget(() => this._onDidBlurWidget.fire()));
            this._widgetDisposableStore.add(this._editorGroupService.createEditorDropTarget(this._widget.value.getDomNode(), {
                containsGroup: (group) => this.group.id === group.id
            }));
            this._widgetDisposableStore.add(this._widget.value.onDidScroll(() => { this._onDidChangeScroll.fire(); }));
            perf.mark('editorLoaded');
            fileOpenMonitor.cancel();
            if (perfMarksCaptured) {
                return;
            }
            this._handlePerfMark(perf, input, model.notebook);
            this._onDidChangeControl.fire();
        }
        catch (e) {
            this.logService.warn('NotebookEditorWidget#setInput failed', e);
            if (isEditorOpenError(e)) {
                throw e;
            }
            // Handle case where a file is too large to open without confirmation
            if (e.fileOperationResult === 7 /* FileOperationResult.FILE_TOO_LARGE */) {
                let message;
                if (e instanceof TooLargeFileOperationError) {
                    message = localize('notebookTooLargeForHeapErrorWithSize', "The notebook is not displayed in the notebook editor because it is very large ({0}).", ByteSize.formatSize(e.size));
                }
                else {
                    message = localize('notebookTooLargeForHeapErrorWithoutSize', "The notebook is not displayed in the notebook editor because it is very large.");
                }
                throw createTooLargeFileError(this.group, input, options, message, this._preferencesService);
            }
            const error = createEditorOpenError(e instanceof Error ? e : new Error((e ? e.message : '')), [
                toAction({
                    id: 'workbench.notebook.action.openInTextEditor', label: localize('notebookOpenInTextEditor', "Open in Text Editor"), run: async () => {
                        const activeEditorPane = this._editorService.activeEditorPane;
                        if (!activeEditorPane) {
                            return;
                        }
                        const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
                        if (!activeEditorResource) {
                            return;
                        }
                        if (activeEditorResource.toString() === input.resource?.toString()) {
                            // Replace the current editor with the text editor
                            return this._editorService.openEditor({
                                resource: activeEditorResource,
                                options: {
                                    override: DEFAULT_EDITOR_ASSOCIATION.id,
                                    pinned: true // new file gets pinned by default
                                }
                            });
                        }
                        return;
                    }
                })
            ], { allowDialog: true });
            throw error;
        }
    }
    _handlePerfMark(perf, input, notebook) {
        const perfMarks = perf.value;
        const startTime = perfMarks['startTime'];
        const extensionActivated = perfMarks['extensionActivated'];
        const inputLoaded = perfMarks['inputLoaded'];
        const webviewCommLoaded = perfMarks['webviewCommLoaded'];
        const customMarkdownLoaded = perfMarks['customMarkdownLoaded'];
        const editorLoaded = perfMarks['editorLoaded'];
        let extensionActivationTimespan = -1;
        let inputLoadingTimespan = -1;
        let webviewCommLoadingTimespan = -1;
        let customMarkdownLoadingTimespan = -1;
        let editorLoadingTimespan = -1;
        if (startTime !== undefined && extensionActivated !== undefined) {
            extensionActivationTimespan = extensionActivated - startTime;
            if (inputLoaded !== undefined) {
                inputLoadingTimespan = inputLoaded - extensionActivated;
            }
            if (webviewCommLoaded !== undefined) {
                webviewCommLoadingTimespan = webviewCommLoaded - extensionActivated;
            }
            if (customMarkdownLoaded !== undefined) {
                customMarkdownLoadingTimespan = customMarkdownLoaded - startTime;
            }
            if (editorLoaded !== undefined) {
                editorLoadingTimespan = editorLoaded - startTime;
            }
        }
        // Notebook information
        let codeCellCount = undefined;
        let mdCellCount = undefined;
        let outputCount = undefined;
        let outputBytes = undefined;
        let codeLength = undefined;
        let markdownLength = undefined;
        let notebookStatsLoaded = undefined;
        if (notebook) {
            const stopWatch = new StopWatch();
            for (const cell of notebook.cells) {
                if (cell.cellKind === CellKind.Code) {
                    codeCellCount = (codeCellCount || 0) + 1;
                    codeLength = (codeLength || 0) + cell.getTextLength();
                    outputCount = (outputCount || 0) + cell.outputs.length;
                    outputBytes = (outputBytes || 0) + cell.outputs.reduce((prev, cur) => prev + cur.outputs.reduce((size, item) => size + item.data.byteLength, 0), 0);
                }
                else {
                    mdCellCount = (mdCellCount || 0) + 1;
                    markdownLength = (codeLength || 0) + cell.getTextLength();
                }
            }
            notebookStatsLoaded = stopWatch.elapsed();
        }
        this.logService.trace(`[NotebookEditor] open notebook perf ${notebook?.uri.toString() ?? ''} - extensionActivation: ${extensionActivationTimespan}, inputLoad: ${inputLoadingTimespan}, webviewComm: ${webviewCommLoadingTimespan}, customMarkdown: ${customMarkdownLoadingTimespan}, editorLoad: ${editorLoadingTimespan}`);
        this.telemetryService.publicLog2('notebook/editorOpenPerf', {
            scheme: input.resource.scheme,
            ext: extname(input.resource),
            viewType: input.viewType,
            extensionActivated: extensionActivationTimespan,
            inputLoaded: inputLoadingTimespan,
            webviewCommLoaded: webviewCommLoadingTimespan,
            customMarkdownLoaded: customMarkdownLoadingTimespan,
            editorLoaded: editorLoadingTimespan,
            codeCellCount,
            mdCellCount,
            outputCount,
            outputBytes,
            codeLength,
            markdownLength,
            notebookStatsLoaded
        });
    }
    clearInput() {
        this._inputListener.clear();
        if (this._widget.value) {
            this._saveEditorViewState(this.input);
            this._widget.value.onWillHide();
        }
        super.clearInput();
    }
    setOptions(options) {
        this._widget.value?.setOptions(options);
        super.setOptions(options);
    }
    saveState() {
        this._saveEditorViewState(this.input);
        super.saveState();
    }
    getViewState() {
        const input = this.input;
        if (!(input instanceof NotebookEditorInput)) {
            return undefined;
        }
        this._saveEditorViewState(input);
        return this._loadNotebookEditorViewState(input);
    }
    getSelection() {
        if (this._widget.value) {
            const activeCell = this._widget.value.getActiveCell();
            if (activeCell) {
                const cellUri = activeCell.uri;
                return new NotebookEditorSelection(cellUri, activeCell.getSelections());
            }
        }
        return undefined;
    }
    getScrollPosition() {
        const widget = this.getControl();
        if (!widget) {
            throw new Error('Notebook widget has not yet been initialized');
        }
        return {
            scrollTop: widget.scrollTop,
            scrollLeft: 0,
        };
    }
    setScrollPosition(scrollPosition) {
        const editor = this.getControl();
        if (!editor) {
            throw new Error('Control has not yet been initialized');
        }
        editor.setScrollTop(scrollPosition.scrollTop);
    }
    _saveEditorViewState(input) {
        if (this._widget.value && input instanceof NotebookEditorInput) {
            if (this._widget.value.isDisposed) {
                return;
            }
            const state = this._widget.value.getEditorViewState();
            this._editorMemento.saveEditorState(this.group, input.resource, state);
        }
    }
    _loadNotebookEditorViewState(input) {
        const result = this._editorMemento.loadEditorState(this.group, input.resource);
        if (result) {
            return result;
        }
        // when we don't have a view state for the group/input-tuple then we try to use an existing
        // editor for the same resource.
        for (const group of this._editorGroupService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
            if (group.activeEditorPane !== this && group.activeEditorPane instanceof NotebookEditor_1 && group.activeEditor?.matches(input)) {
                return group.activeEditorPane._widget.value?.getEditorViewState();
            }
        }
        return;
    }
    layout(dimension, position) {
        this._rootElement.classList.toggle('mid-width', dimension.width < 1000 && dimension.width >= 600);
        this._rootElement.classList.toggle('narrow-width', dimension.width < 600);
        this._pagePosition = { dimension, position };
        if (!this._widget.value || !(this.input instanceof NotebookEditorInput)) {
            return;
        }
        if (this.input.resource.toString() !== this.textModel?.uri.toString() && this._widget.value?.hasModel()) {
            // input and widget mismatch
            // this happens when
            // 1. open document A, pin the document
            // 2. open document B
            // 3. close document B
            // 4. a layout is triggered
            return;
        }
        if (this.isVisible()) {
            this._widget.value.layout(dimension, this._rootElement, position);
        }
    }
};
NotebookEditor = NotebookEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IInstantiationService),
    __param(4, IStorageService),
    __param(5, IEditorService),
    __param(6, IEditorGroupsService),
    __param(7, INotebookEditorService),
    __param(8, IContextKeyService),
    __param(9, IFileService),
    __param(10, ITextResourceConfigurationService),
    __param(11, IEditorProgressService),
    __param(12, INotebookService),
    __param(13, IExtensionsWorkbenchService),
    __param(14, IWorkingCopyBackupService),
    __param(15, ILogService),
    __param(16, IPreferencesService)
], NotebookEditor);
export { NotebookEditor };
class NotebookEditorSelection {
    constructor(cellUri, selections) {
        this.cellUri = cellUri;
        this.selections = selections;
    }
    compare(other) {
        if (!(other instanceof NotebookEditorSelection)) {
            return 3 /* EditorPaneSelectionCompareResult.DIFFERENT */;
        }
        if (isEqual(this.cellUri, other.cellUri)) {
            return 1 /* EditorPaneSelectionCompareResult.IDENTICAL */;
        }
        return 3 /* EditorPaneSelectionCompareResult.DIFFERENT */;
    }
    restore(options) {
        const notebookOptions = {
            cellOptions: {
                resource: this.cellUri,
                options: {
                    selection: this.selections[0]
                }
            }
        };
        Object.assign(notebookOptions, options);
        return notebookOptions;
    }
    log() {
        return this.cellUri.fragment;
    }
}
export function isNotebookContainingCellEditor(editor, codeEditor) {
    if (editor?.getId() === NotebookEditor.ID) {
        const notebookWidget = editor.getControl();
        if (notebookWidget) {
            for (const [_, editor] of notebookWidget.codeEditors) {
                if (editor === codeEditor) {
                    return true;
                }
            }
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBVyxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFMUYsT0FBTyxFQUFFLFFBQVEsRUFBMkMsWUFBWSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekosT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekUsT0FBTyxFQUFFLDBCQUEwQixFQUFxRSxzQkFBc0IsRUFBK0oscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVsWSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUUvRCxPQUFPLEVBQWdCLHNCQUFzQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0YsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFaEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxrQkFBa0IsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBNkIsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDMUYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDaEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFcEYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUUxRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHakUsTUFBTSx5Q0FBeUMsR0FBRyx5QkFBeUIsQ0FBQztBQUVyRSxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFlLFNBQVEsVUFBVTs7YUFDN0IsT0FBRSxHQUFXLGtCQUFrQixBQUE3QixDQUE4QjtJQWFoRCxJQUFhLFVBQVUsS0FBa0IsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUUvRSxJQUFhLFNBQVMsS0FBa0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQVc3RSxZQUNDLEtBQW1CLEVBQ0EsZ0JBQW1DLEVBQ3ZDLFlBQTJCLEVBQ25CLHFCQUE2RCxFQUNuRSxjQUErQixFQUNoQyxjQUErQyxFQUN6QyxtQkFBMEQsRUFDeEQsc0JBQStELEVBQ25FLGtCQUF1RCxFQUM3RCxZQUEyQyxFQUN0QixvQkFBdUQsRUFDbEUsc0JBQStELEVBQ3JFLGdCQUFtRCxFQUN4QywyQkFBeUUsRUFDM0UseUJBQXFFLEVBQ25GLFVBQXdDLEVBQ2hDLG1CQUF5RDtRQUU5RSxLQUFLLENBQUMsZ0JBQWMsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQWZ4QywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBRW5ELG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQUN4Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQ3ZDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFDbEQsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUM1QyxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUVoQiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQ3BELHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFDdkIsZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUE2QjtRQUMxRCw4QkFBeUIsR0FBekIseUJBQXlCLENBQTJCO1FBQ2xFLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDZix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBeEM5RCxtQkFBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELDJCQUFzQixHQUFvQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUN6RixZQUFPLEdBQXVDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBSTFELG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUUxRSxvRkFBb0Y7UUFDbkUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFFeEQscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFHdkQsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDaEUscUJBQWdCLEdBQWdCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFFckQsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBbUMsQ0FBQyxDQUFDO1FBQy9GLHlCQUFvQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUM7UUFFOUMsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDbkUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQXNCMUQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQTJCLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLHlDQUF5QyxDQUFDLENBQUM7UUFFNUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLHlDQUF5QyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLDBDQUEwQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEksQ0FBQztJQUVPLDhCQUE4QixDQUFDLE1BQWM7UUFDcEQsSUFBSSxJQUFJLENBQUMsS0FBSyxZQUFZLG1CQUFtQixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLE1BQU0sS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN6RixJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQyxDQUFDO0lBQ0YsQ0FBQztJQUVPLDZCQUE2QixDQUFDLEtBQTBCO1FBQy9ELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRU8sZUFBZSxDQUFDLEtBQTBCO1FBQ2pELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQsSUFBSSxTQUFTO1FBQ1osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUM7SUFDdEMsQ0FBQztJQUVELElBQWEsWUFBWSxLQUFhLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNuRCxJQUFhLFlBQVksS0FBYSxPQUFPLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFFeEUsbUVBQW1FO0lBQ25FLElBQWEsWUFBWSxDQUFDLEtBQWEsSUFBYSxDQUFDO0lBQ3JELElBQWEsWUFBWSxDQUFDLEtBQWEsSUFBYSxDQUFDO0lBRXJELHFCQUFxQjtJQUNyQixJQUFhLHVCQUF1QjtRQUNuQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLHVCQUF1QixDQUFDO0lBQ3BELENBQUM7SUFFUyxZQUFZLENBQUMsTUFBbUI7UUFDekMsSUFBSSxDQUFDLFlBQVksR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsR0FBRywyQkFBMkIsWUFBWSxFQUFFLEVBQUUsQ0FBQztJQUNwRSxDQUFDO0lBRVEsaUJBQWlCLENBQUMsTUFBZSxFQUFFLE9BQStCO1FBQzFFLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3BDLHlDQUF5QztZQUN6QyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDdEgsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFUSxVQUFVO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFDM0IsQ0FBQztJQUVRLFVBQVUsQ0FBQyxPQUFnQjtRQUNuQyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzFCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRWtCLGdCQUFnQixDQUFDLE9BQWdCO1FBQ25ELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUN4RCxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN6RCxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQzFDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QyxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDdEMsc0RBQXNEO2dCQUN0RCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFUSxLQUFLO1FBQ2IsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVRLFFBQVE7UUFDaEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7UUFDakMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxHQUFHLENBQUMseUJBQXlCLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0ksQ0FBQztJQUVRLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBMEIsRUFBRSxPQUEyQyxFQUFFLE9BQTJCLEVBQUUsS0FBd0IsRUFBRSxPQUFpQjtRQUN4SyxJQUFJLENBQUM7WUFDSixJQUFJLGlCQUFpQixHQUFHLEtBQUssQ0FBQztZQUM5QixNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsZUFBZSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3pCLGlCQUFpQixHQUFHLElBQUksQ0FBQztnQkFDekIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLElBQUksR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV2QixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsdUJBQXVCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFM0csSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXBDLG9EQUFvRDtZQUNwRCxpREFBaUQ7WUFDakQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFakMsSUFBSSxDQUFDLE9BQU8sR0FBdUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXROLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQU0sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO2dCQUMzRCxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RixHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBTSxDQUFDLFVBQVUsRUFBRSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMxRSxDQUFDO1lBRUQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFNLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sOENBQXNDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVwSyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMxRyxDQUFDO1lBRUQsd0dBQXdHO1lBQ3hHLDJGQUEyRjtZQUMzRixNQUFNLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckQsTUFBTSxLQUFLLEdBQUcsTUFBTSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRXpCLHlCQUF5QjtZQUN6QixJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNuQyxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBRUQsMkZBQTJGO1lBQzNGLDZGQUE2RjtZQUM3RiwrQkFBK0I7WUFDL0IsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksT0FBTyxFQUFFLENBQUM7b0JBQ2IsT0FBTyxTQUFTLENBQUM7Z0JBQ2xCLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM1RCxDQUFDO1lBRUQsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRWhGLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLDJIQUEySCxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUN6TCxDQUFDO2dCQUVELE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLGVBQWUsQ0FBQztnQkFDdkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxhQUFhLENBQUMsQ0FBQztnQkFFMUcsTUFBTSxxQkFBcUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsMkhBQTJILEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUU7b0JBQy9OLFFBQVEsQ0FBQzt3QkFDUixFQUFFLEVBQUUsa0RBQWtELEVBQUUsS0FBSyxFQUM1RCxhQUFhOzRCQUNaLENBQUMsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQzs0QkFDN0YsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSw2QkFBNkIsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDO3dCQUMvRixHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7NEJBQ2pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0NBQ3hELElBQUksUUFBUSxLQUFLLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQ0FDakMsOENBQThDO29DQUM5QyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztvQ0FDN0QsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dDQUNiLENBQUM7NEJBQ0YsQ0FBQyxDQUFDLENBQUM7NEJBQ0gsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxhQUFhLENBQUMsQ0FBQzs0QkFFMUcsSUFBSSxDQUFDO2dDQUNKLElBQUksYUFBYSxFQUFFLENBQUM7b0NBQ25CLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLGVBQWUsK0NBQXNDLENBQUMsQ0FBQywyQ0FBa0MsQ0FBQyx5Q0FBZ0MsQ0FBQyxDQUFDO2dDQUMvTSxDQUFDO3FDQUFNLENBQUM7b0NBQ1AsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLGlDQUFpQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dDQUN6RyxDQUFDOzRCQUNGLENBQUM7NEJBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztnQ0FDYixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0NBQ3BGLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQzs0QkFDYixDQUFDO3dCQUNGLENBQUM7cUJBQ0QsQ0FBQztvQkFDRixRQUFRLENBQUM7d0JBQ1IsRUFBRSxFQUFFLHNDQUFzQyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsY0FBYyxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssSUFBSSxFQUFFOzRCQUNsSCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsaUNBQWlDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7NEJBQzVKLElBQUksTUFBTSxFQUFFLENBQUM7Z0NBQ1osdUVBQXVFO2dDQUN2RSwrREFBK0Q7Z0NBQy9ELE1BQU0sUUFBUSxHQUFHLE1BQU0sY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQ0FDcEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDOzRCQUN4RixDQUFDO2lDQUFNLENBQUM7Z0NBQ1AsOERBQThEO2dDQUM5RCxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSwwQkFBMEIsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQzs0QkFDbEksQ0FBQzt3QkFDRixDQUFDO3FCQUNELENBQUM7aUJBQ0YsRUFBRSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRTNCLENBQUM7WUFFRCxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sOENBQXNDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUU1SixNQUFNLFNBQVMsR0FBRyxPQUFPLEVBQUUsU0FBUyxJQUFJLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUVqRixrR0FBa0c7WUFDbEcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDdkUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFFekUsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDbkUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFeEcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEVBQUU7Z0JBQ2hILGFBQWEsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLEVBQUU7YUFDcEQsQ0FBQyxDQUFDLENBQUM7WUFFSixJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTNHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFFMUIsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkIsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNqQyxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLENBQUM7WUFDVCxDQUFDO1lBRUQscUVBQXFFO1lBQ3JFLElBQXlCLENBQUUsQ0FBQyxtQkFBbUIsK0NBQXVDLEVBQUUsQ0FBQztnQkFDeEYsSUFBSSxPQUFlLENBQUM7Z0JBQ3BCLElBQUksQ0FBQyxZQUFZLDBCQUEwQixFQUFFLENBQUM7b0JBQzdDLE9BQU8sR0FBRyxRQUFRLENBQUMsc0NBQXNDLEVBQUUsc0ZBQXNGLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDakwsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sR0FBRyxRQUFRLENBQUMseUNBQXlDLEVBQUUsZ0ZBQWdGLENBQUMsQ0FBQztnQkFDakosQ0FBQztnQkFFRCxNQUFNLHVCQUF1QixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDOUYsQ0FBQztZQUVELE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDLENBQUMsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7Z0JBQzdGLFFBQVEsQ0FBQztvQkFDUixFQUFFLEVBQUUsNENBQTRDLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTt3QkFDckksTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDO3dCQUM5RCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzs0QkFDdkIsT0FBTzt3QkFDUixDQUFDO3dCQUVELE1BQU0sb0JBQW9CLEdBQUcsc0JBQXNCLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUM1RixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQzs0QkFDM0IsT0FBTzt3QkFDUixDQUFDO3dCQUVELElBQUksb0JBQW9CLENBQUMsUUFBUSxFQUFFLEtBQUssS0FBSyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDOzRCQUNwRSxrREFBa0Q7NEJBQ2xELE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7Z0NBQ3JDLFFBQVEsRUFBRSxvQkFBb0I7Z0NBQzlCLE9BQU8sRUFBRTtvQ0FDUixRQUFRLEVBQUUsMEJBQTBCLENBQUMsRUFBRTtvQ0FDdkMsTUFBTSxFQUFFLElBQUksQ0FBQyxrQ0FBa0M7aUNBQy9DOzZCQUNELENBQUMsQ0FBQzt3QkFDSixDQUFDO3dCQUVELE9BQU87b0JBQ1IsQ0FBQztpQkFDRCxDQUFDO2FBQ0YsRUFBRSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRTFCLE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFFTyxlQUFlLENBQUMsSUFBdUIsRUFBRSxLQUEwQixFQUFFLFFBQTRCO1FBQ3hHLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUF3QzdCLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN6QyxNQUFNLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM3QyxNQUFNLGlCQUFpQixHQUFHLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sb0JBQW9CLEdBQUcsU0FBUyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDL0QsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRS9DLElBQUksMkJBQTJCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDckMsSUFBSSxvQkFBb0IsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5QixJQUFJLDBCQUEwQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLElBQUksNkJBQTZCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDdkMsSUFBSSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUUvQixJQUFJLFNBQVMsS0FBSyxTQUFTLElBQUksa0JBQWtCLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDakUsMkJBQTJCLEdBQUcsa0JBQWtCLEdBQUcsU0FBUyxDQUFDO1lBRTdELElBQUksV0FBVyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMvQixvQkFBb0IsR0FBRyxXQUFXLEdBQUcsa0JBQWtCLENBQUM7WUFDekQsQ0FBQztZQUVELElBQUksaUJBQWlCLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3JDLDBCQUEwQixHQUFHLGlCQUFpQixHQUFHLGtCQUFrQixDQUFDO1lBRXJFLENBQUM7WUFFRCxJQUFJLG9CQUFvQixLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUN4Qyw2QkFBNkIsR0FBRyxvQkFBb0IsR0FBRyxTQUFTLENBQUM7WUFDbEUsQ0FBQztZQUVELElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNoQyxxQkFBcUIsR0FBRyxZQUFZLEdBQUcsU0FBUyxDQUFDO1lBQ2xELENBQUM7UUFDRixDQUFDO1FBRUQsdUJBQXVCO1FBQ3ZCLElBQUksYUFBYSxHQUF1QixTQUFTLENBQUM7UUFDbEQsSUFBSSxXQUFXLEdBQXVCLFNBQVMsQ0FBQztRQUNoRCxJQUFJLFdBQVcsR0FBdUIsU0FBUyxDQUFDO1FBQ2hELElBQUksV0FBVyxHQUF1QixTQUFTLENBQUM7UUFDaEQsSUFBSSxVQUFVLEdBQXVCLFNBQVMsQ0FBQztRQUMvQyxJQUFJLGNBQWMsR0FBdUIsU0FBUyxDQUFDO1FBQ25ELElBQUksbUJBQW1CLEdBQXVCLFNBQVMsQ0FBQztRQUN4RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxTQUFTLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNsQyxLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDckMsYUFBYSxHQUFHLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDekMsVUFBVSxHQUFHLENBQUMsVUFBVSxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDdEQsV0FBVyxHQUFHLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO29CQUN2RCxXQUFXLEdBQUcsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JKLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxXQUFXLEdBQUcsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNyQyxjQUFjLEdBQUcsQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUMzRCxDQUFDO1lBQ0YsQ0FBQztZQUNELG1CQUFtQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQyxDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsdUNBQXVDLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSwyQkFBMkIsMkJBQTJCLGdCQUFnQixvQkFBb0Isa0JBQWtCLDBCQUEwQixxQkFBcUIsNkJBQTZCLGlCQUFpQixxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFFN1QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBa0UseUJBQXlCLEVBQUU7WUFDNUgsTUFBTSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTTtZQUM3QixHQUFHLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDNUIsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO1lBQ3hCLGtCQUFrQixFQUFFLDJCQUEyQjtZQUMvQyxXQUFXLEVBQUUsb0JBQW9CO1lBQ2pDLGlCQUFpQixFQUFFLDBCQUEwQjtZQUM3QyxvQkFBb0IsRUFBRSw2QkFBNkI7WUFDbkQsWUFBWSxFQUFFLHFCQUFxQjtZQUNuQyxhQUFhO1lBQ2IsV0FBVztZQUNYLFdBQVc7WUFDWCxXQUFXO1lBQ1gsVUFBVTtZQUNWLGNBQWM7WUFDZCxtQkFBbUI7U0FDbkIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLFVBQVU7UUFDbEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUU1QixJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxDQUFDO1FBQ0QsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFUSxVQUFVLENBQUMsT0FBMkM7UUFDOUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hDLEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVrQixTQUFTO1FBQzNCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFUSxZQUFZO1FBQ3BCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsSUFBSSxDQUFDLENBQUMsS0FBSyxZQUFZLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRCxZQUFZO1FBQ1gsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3hCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3RELElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUM7Z0JBQy9CLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDekUsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsaUJBQWlCO1FBQ2hCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDhDQUE4QyxDQUFDLENBQUM7UUFDakUsQ0FBQztRQUVELE9BQU87WUFDTixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7WUFDM0IsVUFBVSxFQUFFLENBQUM7U0FDYixDQUFDO0lBQ0gsQ0FBQztJQUVELGlCQUFpQixDQUFDLGNBQXlDO1FBQzFELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDekQsQ0FBQztRQUVELE1BQU0sQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxLQUE4QjtRQUMxRCxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEtBQUssWUFBWSxtQkFBbUIsRUFBRSxDQUFDO1lBQ2hFLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ25DLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUN0RCxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEUsQ0FBQztJQUNGLENBQUM7SUFFTyw0QkFBNEIsQ0FBQyxLQUEwQjtRQUM5RCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvRSxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO1FBQ0QsMkZBQTJGO1FBQzNGLGdDQUFnQztRQUNoQyxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLDBDQUFrQyxFQUFFLENBQUM7WUFDMUYsSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsWUFBWSxnQkFBYyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQy9ILE9BQU8sS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztZQUNuRSxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxDQUFDLFNBQXdCLEVBQUUsUUFBMEI7UUFDMUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksSUFBSSxTQUFTLENBQUMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ2xHLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDO1FBRTdDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssWUFBWSxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7WUFDekUsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDekcsNEJBQTRCO1lBQzVCLG9CQUFvQjtZQUNwQix1Q0FBdUM7WUFDdkMscUJBQXFCO1lBQ3JCLHNCQUFzQjtZQUN0QiwyQkFBMkI7WUFDM0IsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0YsQ0FBQzs7QUFwakJXLGNBQWM7SUE2QnhCLFdBQUEsaUJBQWlCLENBQUE7SUFDakIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEsaUNBQWlDLENBQUE7SUFDakMsWUFBQSxzQkFBc0IsQ0FBQTtJQUN0QixZQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFlBQUEsMkJBQTJCLENBQUE7SUFDM0IsWUFBQSx5QkFBeUIsQ0FBQTtJQUN6QixZQUFBLFdBQVcsQ0FBQTtJQUNYLFlBQUEsbUJBQW1CLENBQUE7R0E1Q1QsY0FBYyxDQXVqQjFCOztBQUVELE1BQU0sdUJBQXVCO0lBRTVCLFlBQ2tCLE9BQVksRUFDWixVQUF1QjtRQUR2QixZQUFPLEdBQVAsT0FBTyxDQUFLO1FBQ1osZUFBVSxHQUFWLFVBQVUsQ0FBYTtJQUNyQyxDQUFDO0lBRUwsT0FBTyxDQUFDLEtBQTJCO1FBQ2xDLElBQUksQ0FBQyxDQUFDLEtBQUssWUFBWSx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7WUFDakQsMERBQWtEO1FBQ25ELENBQUM7UUFFRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzFDLDBEQUFrRDtRQUNuRCxDQUFDO1FBRUQsMERBQWtEO0lBQ25ELENBQUM7SUFFRCxPQUFPLENBQUMsT0FBdUI7UUFDOUIsTUFBTSxlQUFlLEdBQTJCO1lBQy9DLFdBQVcsRUFBRTtnQkFDWixRQUFRLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3RCLE9BQU8sRUFBRTtvQkFDUixTQUFTLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7aUJBQzdCO2FBQ0Q7U0FDRCxDQUFDO1FBRUYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFeEMsT0FBTyxlQUFlLENBQUM7SUFDeEIsQ0FBQztJQUVELEdBQUc7UUFDRixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO0lBQzlCLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxNQUErQixFQUFFLFVBQXVCO0lBQ3RHLElBQUksTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLGNBQWMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMzQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsVUFBVSxFQUEwQixDQUFDO1FBQ25FLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLGNBQWMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDdEQsSUFBSSxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQzNCLE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUMifQ==