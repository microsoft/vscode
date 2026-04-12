/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { NotImplementedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../../../platform/undoRedo/common/undoRedoService.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { CellFocusMode } from '../../browser/notebookBrowser.js';
import { NotebookCellStatusBarService } from '../../browser/services/notebookCellStatusBarServiceImpl.js';
import { ListViewInfoAccessor, NotebookCellList } from '../../browser/view/notebookCellList.js';
import { NotebookEventDispatcher } from '../../browser/viewModel/eventDispatcher.js';
import { NotebookViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';
import { ViewContext } from '../../browser/viewModel/viewContext.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookCellStatusBarService } from '../../common/notebookCellStatusBarService.js';
import { CellUri, NotebookCellExecutionState, SelectionStateType } from '../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { NotebookOptions } from '../../browser/notebookOptions.js';
import { TextModelResolverService } from '../../../../services/textmodelResolver/common/textModelResolverService.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService, TestTextResourcePropertiesService, TestWorkspaceTrustRequestService } from '../../../../test/common/workbenchTestServices.js';
import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { EditorFontLigatures, EditorFontVariations } from '../../../../../editor/common/config/editorOptions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { TestCodeEditorService } from '../../../../../editor/test/browser/editorTestServices.js';
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from '../../browser/viewModel/notebookOutlineDataSourceFactory.js';
import { ILanguageDetectionService } from '../../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from '../../browser/viewModel/notebookOutlineEntryFactory.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { ITextResourcePropertiesService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
class NullNotebookLoggingService {
    info(category, output) { }
    warn(category, output) { }
    error(category, output) { }
    debug(category, output) { }
    trace(category, message) { }
}
export class TestCell extends NotebookCellTextModel {
    constructor(viewType, handle, source, language, cellKind, outputs, languageService) {
        super(CellUri.generate(URI.parse('test:///fake/notebook'), handle), handle, {
            source,
            language,
            mime: Mimes.text,
            cellKind,
            outputs,
            metadata: undefined,
            internalMetadata: undefined,
            collapseState: undefined
        }, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} }, languageService, 1 /* DefaultEndOfLine.LF */, undefined, // defaultCollapseConfig
        undefined, // languageDetectionService
        new NullNotebookLoggingService());
        this.viewType = viewType;
        this.source = source;
    }
}
export class NotebookEditorTestModel extends EditorModel {
    get viewType() {
        return this._notebook.viewType;
    }
    get resource() {
        return this._notebook.uri;
    }
    get notebook() {
        return this._notebook;
    }
    constructor(_notebook) {
        super();
        this._notebook = _notebook;
        this._dirty = false;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this.onDidChangeOrphaned = Event.None;
        this.onDidChangeReadonly = Event.None;
        this.onDidRevertUntitled = Event.None;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        if (_notebook && _notebook.onDidChangeContent) {
            this._register(_notebook.onDidChangeContent(() => {
                this._dirty = true;
                this._onDidChangeDirty.fire();
                this._onDidChangeContent.fire();
            }));
        }
    }
    isReadonly() {
        return false;
    }
    isOrphaned() {
        return false;
    }
    hasAssociatedFilePath() {
        return false;
    }
    isDirty() {
        return this._dirty;
    }
    get hasErrorState() {
        return false;
    }
    isModified() {
        return this._dirty;
    }
    getNotebook() {
        return this._notebook;
    }
    async load() {
        return this;
    }
    async save() {
        if (this._notebook) {
            this._dirty = false;
            this._onDidChangeDirty.fire();
            this._onDidSave.fire({});
            // todo, flush all states
            return true;
        }
        return false;
    }
    saveAs() {
        throw new NotImplementedError();
    }
    revert() {
        throw new NotImplementedError();
    }
}
export function setupInstantiationService(disposables) {
    const instantiationService = disposables.add(new TestInstantiationService());
    const testThemeService = new TestThemeService();
    instantiationService.stub(ILanguageService, disposables.add(new LanguageService()));
    instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IThemeService, testThemeService);
    instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
    instantiationService.stub(ITextResourcePropertiesService, instantiationService.createInstance(TestTextResourcePropertiesService));
    instantiationService.stub(IModelService, disposables.add(instantiationService.createInstance(ModelService)));
    instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
    instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
    instantiationService.stub(IListService, disposables.add(instantiationService.createInstance(ListService)));
    instantiationService.stub(ILayoutService, new TestLayoutService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IClipboardService, TestClipboardService);
    instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
    instantiationService.stub(IWorkspaceTrustRequestService, disposables.add(new TestWorkspaceTrustRequestService(true)));
    instantiationService.stub(INotebookExecutionStateService, new TestNotebookExecutionStateService());
    instantiationService.stub(IKeybindingService, new MockKeybindingService());
    instantiationService.stub(INotebookCellStatusBarService, disposables.add(new NotebookCellStatusBarService()));
    instantiationService.stub(ICodeEditorService, disposables.add(new TestCodeEditorService(testThemeService)));
    instantiationService.stub(IOutlineService, new class extends mock() {
        registerOutlineCreator() { return { dispose() { } }; }
    });
    instantiationService.stub(INotebookCellOutlineDataSourceFactory, instantiationService.createInstance(NotebookCellOutlineDataSourceFactory));
    instantiationService.stub(INotebookOutlineEntryFactory, instantiationService.createInstance(NotebookOutlineEntryFactory));
    instantiationService.stub(INotebookLoggingService, new NullNotebookLoggingService());
    instantiationService.stub(ILanguageDetectionService, new class MockLanguageDetectionService {
        isEnabledForLanguage(languageId) {
            return false;
        }
        async detectLanguage(resource, supportedLangs) {
            return undefined;
        }
    });
    return instantiationService;
}
function _createTestNotebookEditor(instantiationService, disposables, cells) {
    const viewType = 'notebook';
    const notebook = disposables.add(instantiationService.createInstance(NotebookTextModel, viewType, URI.parse('test://test'), cells.map((cell) => {
        return {
            source: cell[0],
            mime: undefined,
            language: cell[1],
            cellKind: cell[2],
            outputs: cell[3] ?? [],
            metadata: cell[4]
        };
    }), {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }));
    const model = disposables.add(new NotebookEditorTestModel(notebook));
    const notebookOptions = disposables.add(new NotebookOptions(mainWindow, false, undefined, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService)));
    const baseCellEditorOptions = new class extends mock() {
    };
    const viewContext = new ViewContext(notebookOptions, disposables.add(new NotebookEventDispatcher()), () => baseCellEditorOptions);
    const viewModel = disposables.add(instantiationService.createInstance(NotebookViewModel, viewType, model.notebook, viewContext, null, { isReadOnly: false }));
    const cellList = disposables.add(createNotebookCellList(instantiationService, disposables, viewContext));
    cellList.attachViewModel(viewModel);
    const listViewInfoAccessor = disposables.add(new ListViewInfoAccessor(cellList));
    let visibleRanges = [{ start: 0, end: 100 }];
    const id = Date.now().toString();
    const notebookEditor = new class extends mock() {
        constructor() {
            super(...arguments);
            this.notebookOptions = notebookOptions;
            this.onDidChangeModel = new Emitter().event;
            this.onDidChangeCellState = new Emitter().event;
            this.textModel = viewModel.notebookDocument;
            this.onDidChangeVisibleRanges = Event.None;
        }
        // eslint-disable-next-line local/code-must-use-super-dispose
        dispose() {
            viewModel.dispose();
        }
        getViewModel() {
            return viewModel;
        }
        hasModel() {
            return !!viewModel;
        }
        getLength() { return viewModel.length; }
        getFocus() { return viewModel.getFocus(); }
        getSelections() { return viewModel.getSelections(); }
        setFocus(focus) {
            viewModel.updateSelectionsState({
                kind: SelectionStateType.Index,
                focus: focus,
                selections: viewModel.getSelections()
            });
        }
        setSelections(selections) {
            viewModel.updateSelectionsState({
                kind: SelectionStateType.Index,
                focus: viewModel.getFocus(),
                selections: selections
            });
        }
        getViewIndexByModelIndex(index) { return listViewInfoAccessor.getViewIndex(viewModel.viewCells[index]); }
        getCellRangeFromViewRange(startIndex, endIndex) { return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex); }
        revealCellRangeInView() { }
        async revealInView() { }
        setHiddenAreas(_ranges) {
            return cellList.setHiddenAreas(_ranges, true);
        }
        getActiveCell() {
            const elements = cellList.getFocusedElements();
            if (elements && elements.length) {
                return elements[0];
            }
            return undefined;
        }
        hasOutputTextSelection() {
            return false;
        }
        changeModelDecorations() { return null; }
        focusElement() { }
        setCellEditorSelection() { }
        async revealRangeInCenterIfOutsideViewportAsync() { }
        async layoutNotebookCell() { }
        async createOutput() { }
        async removeInset() { }
        async focusNotebookCell(cell, focusItem) {
            cell.focusMode = focusItem === 'editor' ? CellFocusMode.Editor
                : focusItem === 'output' ? CellFocusMode.Output
                    : CellFocusMode.Container;
        }
        cellAt(index) { return viewModel.cellAt(index); }
        getCellIndex(cell) { return viewModel.getCellIndex(cell); }
        getCellsInRange(range) { return viewModel.getCellsInRange(range); }
        getCellByHandle(handle) { return viewModel.getCellByHandle(handle); }
        getNextVisibleCellIndex(index) { return viewModel.getNextVisibleCellIndex(index); }
        getControl() { return this; }
        get onDidChangeSelection() { return viewModel.onDidChangeSelection; }
        get onDidChangeOptions() { return viewModel.onDidChangeOptions; }
        get onDidChangeViewCells() { return viewModel.onDidChangeViewCells; }
        async find(query, options) {
            const findMatches = viewModel.find(query, options).filter(match => match.length > 0);
            return findMatches;
        }
        deltaCellDecorations() { return []; }
        get visibleRanges() {
            return visibleRanges;
        }
        set visibleRanges(_ranges) {
            visibleRanges = _ranges;
        }
        getId() { return id; }
        setScrollTop(scrollTop) {
            cellList.scrollTop = scrollTop;
        }
        get scrollTop() {
            return cellList.scrollTop;
        }
        getLayoutInfo() {
            return {
                width: 0,
                height: 0,
                scrollHeight: cellList.getScrollHeight(),
                fontInfo: new FontInfo({
                    pixelRatio: 1,
                    fontFamily: 'mockFont',
                    fontWeight: 'normal',
                    fontSize: 14,
                    fontFeatureSettings: EditorFontLigatures.OFF,
                    fontVariationSettings: EditorFontVariations.OFF,
                    lineHeight: 19,
                    letterSpacing: 1.5,
                    isMonospace: true,
                    typicalHalfwidthCharacterWidth: 10,
                    typicalFullwidthCharacterWidth: 20,
                    canUseHalfwidthRightwardsArrow: true,
                    spaceWidth: 10,
                    middotWidth: 10,
                    wsmiddotWidth: 10,
                    maxDigitWidth: 10,
                }, true),
                stickyHeight: 0,
                listViewOffsetTop: 0,
            };
        }
    };
    return { editor: notebookEditor, viewModel };
}
export function createTestNotebookEditor(instantiationService, disposables, cells) {
    return _createTestNotebookEditor(instantiationService, disposables, cells);
}
export async function withTestNotebookDiffModel(originalCells, modifiedCells, callback) {
    const disposables = new DisposableStore();
    const instantiationService = setupInstantiationService(disposables);
    const originalNotebook = createTestNotebookEditor(instantiationService, disposables, originalCells);
    const modifiedNotebook = createTestNotebookEditor(instantiationService, disposables, modifiedCells);
    const originalResource = new class extends mock() {
        get notebook() {
            return originalNotebook.viewModel.notebookDocument;
        }
        get resource() {
            return originalNotebook.viewModel.notebookDocument.uri;
        }
    };
    const modifiedResource = new class extends mock() {
        get notebook() {
            return modifiedNotebook.viewModel.notebookDocument;
        }
        get resource() {
            return modifiedNotebook.viewModel.notebookDocument.uri;
        }
    };
    const model = new class extends mock() {
        get original() {
            return originalResource;
        }
        get modified() {
            return modifiedResource;
        }
    };
    const res = await callback(model, disposables, instantiationService);
    if (res instanceof Promise) {
        res.finally(() => {
            originalNotebook.editor.dispose();
            originalNotebook.viewModel.notebookDocument.dispose();
            originalNotebook.viewModel.dispose();
            modifiedNotebook.editor.dispose();
            modifiedNotebook.viewModel.notebookDocument.dispose();
            modifiedNotebook.viewModel.dispose();
            disposables.dispose();
        });
    }
    else {
        originalNotebook.editor.dispose();
        originalNotebook.viewModel.notebookDocument.dispose();
        originalNotebook.viewModel.dispose();
        modifiedNotebook.editor.dispose();
        modifiedNotebook.viewModel.notebookDocument.dispose();
        modifiedNotebook.viewModel.dispose();
        disposables.dispose();
    }
    return res;
}
export async function withTestNotebook(cells, callback, accessor) {
    const disposables = new DisposableStore();
    const instantiationService = accessor ?? setupInstantiationService(disposables);
    const notebookEditor = _createTestNotebookEditor(instantiationService, disposables, cells);
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
        const res = await callback(notebookEditor.editor, notebookEditor.viewModel, disposables, instantiationService);
        if (res instanceof Promise) {
            res.finally(() => {
                notebookEditor.editor.dispose();
                notebookEditor.viewModel.dispose();
                notebookEditor.editor.textModel.dispose();
                disposables.dispose();
            });
        }
        else {
            notebookEditor.editor.dispose();
            notebookEditor.viewModel.dispose();
            notebookEditor.editor.textModel.dispose();
            disposables.dispose();
        }
        return res;
    });
}
export function createNotebookCellList(instantiationService, disposables, viewContext) {
    const delegate = {
        getHeight(element) { return element.getHeight(17); },
        getTemplateId() { return 'template'; }
    };
    const baseCellRenderTemplate = new class extends mock() {
    };
    const renderer = {
        templateId: 'template',
        renderTemplate() { return baseCellRenderTemplate; },
        renderElement() { },
        disposeTemplate() { }
    };
    const notebookOptions = !!viewContext ? viewContext.notebookOptions
        : disposables.add(new NotebookOptions(mainWindow, false, undefined, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService)));
    const cellList = disposables.add(instantiationService.createInstance(NotebookCellList, 'NotebookCellList', DOM.$('container'), notebookOptions, delegate, [renderer], instantiationService.get(IContextKeyService), {
        supportDynamicHeights: true,
        multipleSelectionSupport: true,
    }));
    return cellList;
}
export function valueBytesFromString(value) {
    return VSBuffer.fromString(value);
}
class TestCellExecution {
    constructor(notebook, cellHandle, onComplete) {
        this.notebook = notebook;
        this.cellHandle = cellHandle;
        this.onComplete = onComplete;
        this.state = NotebookCellExecutionState.Unconfirmed;
        this.didPause = false;
        this.isPaused = false;
    }
    confirm() {
    }
    update(updates) {
    }
    complete(complete) {
        this.onComplete();
    }
}
export class TestNotebookExecutionStateService {
    constructor() {
        this._executions = new ResourceMap();
        this.onDidChangeExecution = new Emitter().event;
        this.onDidChangeLastRunFailState = new Emitter().event;
    }
    forceCancelNotebookExecutions(notebookUri) {
    }
    getCellExecutionsForNotebook(notebook) {
        return [];
    }
    getCellExecution(cellUri) {
        return this._executions.get(cellUri);
    }
    createCellExecution(notebook, cellHandle) {
        const onComplete = () => this._executions.delete(CellUri.generate(notebook, cellHandle));
        const exe = new TestCellExecution(notebook, cellHandle, onComplete);
        this._executions.set(CellUri.generate(notebook, cellHandle), exe);
        return exe;
    }
    getCellExecutionsByHandleForNotebook(notebook) {
        return;
    }
    getLastFailedCellForNotebook(notebook) {
        return;
    }
    getLastCompletedCellForNotebook(notebook) {
        return;
    }
    getExecution(notebook) {
        return;
    }
    createExecution(notebook) {
        throw new Error('Method not implemented.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdE5vdGVib29rRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL3Rlc3ROb3RlYm9va0VkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDNUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdEYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDeEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckYsT0FBTyxFQUFFLGlCQUFpQixFQUFF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