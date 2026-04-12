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
var MergeEditor_1, MergeEditorLayoutStore_1;
import { reset } from '../../../../../base/browser/dom.js';
import { SerializableGrid } from '../../../../../base/browser/ui/grid/grid.js';
import { Color } from '../../../../../base/common/color.js';
import { BugIndicatingError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, thenIfNotDisposed, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, observableValue, transaction } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import './media/mergeEditor.css';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { AbstractTextEditor } from '../../../../browser/parts/editor/textEditor.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';
import { applyTextEditorOptions } from '../../../../common/editor/editorOptions.js';
import { readTransientState, writeTransientState } from '../../../codeEditor/browser/toggleWordWrap.js';
import { MergeEditorInput } from '../mergeEditorInput.js';
import { deepMerge, PersistentStore } from '../utils.js';
import { BaseCodeEditorView } from './editors/baseCodeEditorView.js';
import { ScrollSynchronizer } from './scrollSynchronizer.js';
import { MergeEditorViewModel } from './viewModel.js';
import { ViewZoneComputer } from './viewZones.js';
import { ctxIsMergeEditor, ctxMergeBaseUri, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, ctxMergeResultUri } from '../../common/mergeEditor.js';
import { settingsSashBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import './colors.js';
import { InputCodeEditorView } from './editors/inputCodeEditorView.js';
import { ResultCodeEditorView } from './editors/resultCodeEditorView.js';
let MergeEditor = class MergeEditor extends AbstractTextEditor {
    static { MergeEditor_1 = this; }
    static { this.ID = 'mergeEditor'; }
    get viewModel() {
        return this._viewModel;
    }
    get inputModel() {
        return this._inputModel;
    }
    get model() {
        return this.inputModel.get()?.model;
    }
    constructor(group, instantiation, contextKeyService, telemetryService, storageService, themeService, textResourceConfigurationService, editorService, editorGroupService, fileService, _codeEditorService) {
        super(MergeEditor_1.ID, group, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
        this.contextKeyService = contextKeyService;
        this._codeEditorService = _codeEditorService;
        this._sessionDisposables = new DisposableStore();
        this._viewModel = observableValue(this, undefined);
        this._grid = this._register(new MutableDisposable());
        this.input1View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 1, this._viewModel));
        this.baseView = observableValue(this, undefined);
        this.baseViewOptions = observableValue(this, undefined);
        this.input2View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 2, this._viewModel));
        this.inputResultView = this._register(this.instantiationService.createInstance(ResultCodeEditorView, this._viewModel));
        this._layoutMode = this.instantiationService.createInstance(MergeEditorLayoutStore);
        this._layoutModeObs = observableValue(this, this._layoutMode.value);
        this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(this.contextKeyService);
        this._ctxUsesColumnLayout = ctxMergeEditorLayout.bindTo(this.contextKeyService);
        this._ctxShowBase = ctxMergeEditorShowBase.bindTo(this.contextKeyService);
        this._ctxShowBaseAtTop = ctxMergeEditorShowBaseAtTop.bindTo(this.contextKeyService);
        this._ctxResultUri = ctxMergeResultUri.bindTo(this.contextKeyService);
        this._ctxBaseUri = ctxMergeBaseUri.bindTo(this.contextKeyService);
        this._ctxShowNonConflictingChanges = ctxMergeEditorShowNonConflictingChanges.bindTo(this.contextKeyService);
        this._inputModel = observableValue(this, undefined);
        this.viewZoneComputer = new ViewZoneComputer(this.input1View.editor, this.input2View.editor, this.inputResultView.editor);
        this.scrollSynchronizer = this._register(new ScrollSynchronizer(this._viewModel, this.input1View, this.input2View, this.baseView, this.inputResultView, this._layoutModeObs));
        this._onDidChangeSizeConstraints = this._register(new Emitter());
        this.onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;
        this.baseViewDisposables = this._register(new DisposableStore());
        this.showNonConflictingChangesStore = this.instantiationService.createInstance((PersistentStore), 'mergeEditor/showNonConflictingChanges');
        this.showNonConflictingChanges = observableValue(this, this.showNonConflictingChangesStore.get() ?? false);
    }
    dispose() {
        this._sessionDisposables.dispose();
        this._ctxIsMergeEditor.reset();
        this._ctxUsesColumnLayout.reset();
        this._ctxShowNonConflictingChanges.reset();
        super.dispose();
    }
    get minimumWidth() {
        return this._layoutMode.value.kind === 'mixed'
            ? this.input1View.view.minimumWidth + this.input2View.view.minimumWidth
            : this.input1View.view.minimumWidth + this.input2View.view.minimumWidth + this.inputResultView.view.minimumWidth;
    }
    // #endregion
    getTitle() {
        if (this.input) {
            return this.input.getName();
        }
        return localize('mergeEditor', "Text Merge Editor");
    }
    createEditorControl(parent, initialOptions) {
        this.rootHtmlElement = parent;
        parent.classList.add('merge-editor');
        this.applyLayout(this._layoutMode.value);
        this.applyOptions(initialOptions);
    }
    updateEditorControlOptions(options) {
        this.applyOptions(options);
    }
    applyOptions(options) {
        const inputOptions = deepMerge(options, {
            minimap: { enabled: false },
            glyphMargin: false,
            lineNumbersMinChars: 2
        });
        const readOnlyInputOptions = deepMerge(inputOptions, {
            readOnly: true,
            readOnlyMessage: undefined
        });
        this.input1View.updateOptions(readOnlyInputOptions);
        this.input2View.updateOptions(readOnlyInputOptions);
        this.baseViewOptions.set({ ...this.input2View.editor.getRawOptions() }, undefined);
        this.inputResultView.updateOptions(inputOptions);
    }
    getMainControl() {
        return this.inputResultView.editor;
    }
    layout(dimension) {
        this._grid.value?.layout(dimension.width, dimension.height);
    }
    async setInput(input, options, context, token) {
        if (!(input instanceof MergeEditorInput)) {
            throw new BugIndicatingError('ONLY MergeEditorInput is supported');
        }
        await super.setInput(input, options, context, token);
        this._sessionDisposables.clear();
        transaction(tx => {
            this._viewModel.set(undefined, tx);
            this._inputModel.set(undefined, tx);
        });
        const inputModel = await input.resolve();
        const model = inputModel.model;
        const viewModel = this.instantiationService.createInstance(MergeEditorViewModel, model, this.input1View, this.input2View, this.inputResultView, this.baseView, this.showNonConflictingChanges);
        model.telemetry.reportMergeEditorOpened({
            combinableConflictCount: model.combinableConflictCount,
            conflictCount: model.conflictCount,
            baseTop: this._layoutModeObs.get().showBaseAtTop,
            baseVisible: this._layoutModeObs.get().showBase,
            isColumnView: this._layoutModeObs.get().kind === 'columns',
        });
        transaction(tx => {
            this._viewModel.set(viewModel, tx);
            this._inputModel.set(inputModel, tx);
        });
        this._sessionDisposables.add(viewModel);
        // Track focus changes to update the editor name
        this._sessionDisposables.add(autorun(reader => {
            /** @description Update focused editor name based on focus */
            const focusedType = viewModel.focusedEditorType.read(reader);
            if (!(input instanceof MergeEditorInput)) {
                return;
            }
            input.updateFocusedEditor(focusedType || 'result');
        }));
        // Set/unset context keys based on input
        this._ctxResultUri.set(inputModel.resultUri.toString());
        this._ctxBaseUri.set(model.base.uri.toString());
        this._sessionDisposables.add(toDisposable(() => {
            this._ctxBaseUri.reset();
            this._ctxResultUri.reset();
        }));
        const viewZoneRegistrationStore = new DisposableStore();
        this._sessionDisposables.add(viewZoneRegistrationStore);
        // Set the view zones before restoring view state!
        // Otherwise scrolling will be off
        this._sessionDisposables.add(autorunWithStore((reader) => {
            /** @description update alignment view zones */
            const baseView = this.baseView.read(reader);
            const resultScrollTop = this.inputResultView.editor.getScrollTop();
            this.scrollSynchronizer.stopSync();
            viewZoneRegistrationStore.clear();
            this.inputResultView.editor.changeViewZones(resultViewZoneAccessor => {
                const layout = this._layoutModeObs.read(reader);
                const shouldAlignResult = layout.kind === 'columns';
                const shouldAlignBase = layout.kind === 'mixed' && !layout.showBaseAtTop;
                this.input1View.editor.changeViewZones(input1ViewZoneAccessor => {
                    this.input2View.editor.changeViewZones(input2ViewZoneAccessor => {
                        if (baseView) {
                            baseView.editor.changeViewZones(baseViewZoneAccessor => {
                                viewZoneRegistrationStore.add(this.setViewZones(reader, viewModel, this.input1View.editor, input1ViewZoneAccessor, this.input2View.editor, input2ViewZoneAccessor, baseView.editor, baseViewZoneAccessor, shouldAlignBase, this.inputResultView.editor, resultViewZoneAccessor, shouldAlignResult));
                            });
                        }
                        else {
                            viewZoneRegistrationStore.add(this.setViewZones(reader, viewModel, this.input1View.editor, input1ViewZoneAccessor, this.input2View.editor, input2ViewZoneAccessor, undefined, undefined, false, this.inputResultView.editor, resultViewZoneAccessor, shouldAlignResult));
                        }
                    });
                });
            });
            this.inputResultView.editor.setScrollTop(resultScrollTop, 0 /* ScrollType.Smooth */);
            this.scrollSynchronizer.startSync();
            this.scrollSynchronizer.updateScrolling();
        }));
        const viewState = this.loadEditorViewState(input, context);
        if (viewState) {
            this._applyViewState(viewState);
        }
        else {
            this._sessionDisposables.add(thenIfNotDisposed(model.onInitialized, () => {
                const firstConflict = model.modifiedBaseRanges.get().find(r => r.isConflicting);
                if (!firstConflict) {
                    return;
                }
                this.input1View.editor.revealLineInCenter(firstConflict.input1Range.startLineNumber);
                transaction(tx => {
                    /** @description setActiveModifiedBaseRange */
                    viewModel.setActiveModifiedBaseRange(firstConflict, tx);
                });
            }));
        }
        // word wrap special case - sync transient state from result model to input[1|2] models
        const mirrorWordWrapTransientState = (candidate) => {
            const candidateState = readTransientState(candidate, this._codeEditorService);
            writeTransientState(model.input2.textModel, candidateState, this._codeEditorService);
            writeTransientState(model.input1.textModel, candidateState, this._codeEditorService);
            writeTransientState(model.resultTextModel, candidateState, this._codeEditorService);
            const baseTextModel = this.baseView.get()?.editor.getModel();
            if (baseTextModel) {
                writeTransientState(baseTextModel, candidateState, this._codeEditorService);
            }
        };
        this._sessionDisposables.add(this._codeEditorService.onDidChangeTransientModelProperty(candidate => {
            mirrorWordWrapTransientState(candidate);
        }));
        mirrorWordWrapTransientState(this.inputResultView.editor.getModel());
        // detect when base, input1, and input2 become empty and replace THIS editor with its result editor
        // TODO@jrieken@hediet this needs a better/cleaner solution
        // https://github.com/microsoft/vscode/issues/155940
        const that = this;
        this._sessionDisposables.add(new class {
            constructor() {
                this._disposable = new DisposableStore();
                for (const model of this.baseInput1Input2()) {
                    this._disposable.add(model.onDidChangeContent(() => this._checkBaseInput1Input2AllEmpty()));
                }
            }
            dispose() {
                this._disposable.dispose();
            }
            *baseInput1Input2() {
                yield model.base;
                yield model.input1.textModel;
                yield model.input2.textModel;
            }
            _checkBaseInput1Input2AllEmpty() {
                for (const model of this.baseInput1Input2()) {
                    if (model.getValueLength() > 0) {
                        return;
                    }
                }
                // all empty -> replace this editor with a normal editor for result
                that.editorService.replaceEditors([{ editor: input, replacement: { resource: input.result, options: { preserveFocus: true } }, forceReplaceDirty: true }], that.group);
            }
        });
    }
    setViewZones(reader, viewModel, input1Editor, input1ViewZoneAccessor, input2Editor, input2ViewZoneAccessor, baseEditor, baseViewZoneAccessor, shouldAlignBase, resultEditor, resultViewZoneAccessor, shouldAlignResult) {
        const input1ViewZoneIds = [];
        const input2ViewZoneIds = [];
        const baseViewZoneIds = [];
        const resultViewZoneIds = [];
        const viewZones = this.viewZoneComputer.computeViewZones(reader, viewModel, {
            codeLensesVisible: true,
            showNonConflictingChanges: this.showNonConflictingChanges.read(reader),
            shouldAlignBase,
            shouldAlignResult,
        });
        const disposableStore = new DisposableStore();
        if (baseViewZoneAccessor) {
            for (const v of viewZones.baseViewZones) {
                v.create(baseViewZoneAccessor, baseViewZoneIds, disposableStore);
            }
        }
        for (const v of viewZones.resultViewZones) {
            v.create(resultViewZoneAccessor, resultViewZoneIds, disposableStore);
        }
        for (const v of viewZones.input1ViewZones) {
            v.create(input1ViewZoneAccessor, input1ViewZoneIds, disposableStore);
        }
        for (const v of viewZones.input2ViewZones) {
            v.create(input2ViewZoneAccessor, input2ViewZoneIds, disposableStore);
        }
        disposableStore.add({
            dispose: () => {
                input1Editor.changeViewZones(a => {
                    for (const zone of input1ViewZoneIds) {
                        a.removeZone(zone);
                    }
                });
                input2Editor.changeViewZones(a => {
                    for (const zone of input2ViewZoneIds) {
                        a.removeZone(zone);
                    }
                });
                baseEditor?.changeViewZones(a => {
                    for (const zone of baseViewZoneIds) {
                        a.removeZone(zone);
                    }
                });
                resultEditor.changeViewZones(a => {
                    for (const zone of resultViewZoneIds) {
                        a.removeZone(zone);
                    }
                });
            }
        });
        return disposableStore;
    }
    setOptions(options) {
        super.setOptions(options);
        if (options) {
            applyTextEditorOptions(options, this.inputResultView.editor, 0 /* ScrollType.Smooth */);
        }
    }
    clearInput() {
        super.clearInput();
        this._sessionDisposables.clear();
        for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
            editor.setModel(null);
        }
    }
    focus() {
        super.focus();
        (this.getControl() ?? this.inputResultView.editor).focus();
    }
    hasFocus() {
        for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
            if (editor.hasTextFocus()) {
                return true;
            }
        }
        return super.hasFocus();
    }
    setEditorVisible(visible) {
        super.setEditorVisible(visible);
        for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
            if (visible) {
                editor.onVisible();
            }
            else {
                editor.onHide();
            }
        }
        this._ctxIsMergeEditor.set(visible);
    }
    // ---- interact with "outside world" via`getControl`, `scopedContextKeyService`: we only expose the result-editor keep the others internal
    getControl() {
        return this.inputResultView.editor;
    }
    get scopedContextKeyService() {
        const control = this.getControl();
        return control?.invokeWithinContext(accessor => accessor.get(IContextKeyService));
    }
    // --- layout
    toggleBase() {
        this.setLayout({
            ...this._layoutMode.value,
            showBase: !this._layoutMode.value.showBase
        });
    }
    toggleShowBaseTop() {
        const showBaseTop = this._layoutMode.value.showBase && this._layoutMode.value.showBaseAtTop;
        this.setLayout({
            ...this._layoutMode.value,
            showBaseAtTop: true,
            showBase: !showBaseTop,
        });
    }
    toggleShowBaseCenter() {
        const showBaseCenter = this._layoutMode.value.showBase && !this._layoutMode.value.showBaseAtTop;
        this.setLayout({
            ...this._layoutMode.value,
            showBaseAtTop: false,
            showBase: !showBaseCenter,
        });
    }
    setLayoutKind(kind) {
        this.setLayout({
            ...this._layoutMode.value,
            kind
        });
    }
    setLayout(newLayout) {
        const value = this._layoutMode.value;
        if (JSON.stringify(value) === JSON.stringify(newLayout)) {
            return;
        }
        this.model?.telemetry.reportLayoutChange({
            baseTop: newLayout.showBaseAtTop,
            baseVisible: newLayout.showBase,
            isColumnView: newLayout.kind === 'columns',
        });
        this.applyLayout(newLayout);
    }
    applyLayout(layout) {
        transaction(tx => {
            /** @description applyLayout */
            if (layout.showBase && !this.baseView.get()) {
                this.baseViewDisposables.clear();
                const baseView = this.baseViewDisposables.add(this.instantiationService.createInstance(BaseCodeEditorView, this.viewModel));
                this.baseViewDisposables.add(autorun(reader => {
                    /** @description Update base view options */
                    const options = this.baseViewOptions.read(reader);
                    if (options) {
                        baseView.updateOptions(options);
                    }
                }));
                this.baseView.set(baseView, tx);
            }
            else if (!layout.showBase && this.baseView.get()) {
                this.baseView.set(undefined, tx);
                this.baseViewDisposables.clear();
            }
            if (layout.kind === 'mixed') {
                this.setGrid([
                    layout.showBaseAtTop && layout.showBase ? {
                        size: 38,
                        data: this.baseView.get().view
                    } : undefined,
                    {
                        size: 38,
                        groups: [
                            { data: this.input1View.view },
                            !layout.showBaseAtTop && layout.showBase ? { data: this.baseView.get().view } : undefined,
                            { data: this.input2View.view }
                        ].filter(isDefined)
                    },
                    {
                        size: 62,
                        data: this.inputResultView.view
                    },
                ].filter(isDefined));
            }
            else if (layout.kind === 'columns') {
                this.setGrid([
                    layout.showBase ? {
                        size: 40,
                        data: this.baseView.get().view
                    } : undefined,
                    {
                        size: 60,
                        groups: [{ data: this.input1View.view }, { data: this.inputResultView.view }, { data: this.input2View.view }]
                    },
                ].filter(isDefined));
            }
            this._layoutMode.value = layout;
            this._ctxUsesColumnLayout.set(layout.kind);
            this._ctxShowBase.set(layout.showBase);
            this._ctxShowBaseAtTop.set(layout.showBaseAtTop);
            this._onDidChangeSizeConstraints.fire();
            this._layoutModeObs.set(layout, tx);
        });
    }
    setGrid(descriptor) {
        let width = -1;
        let height = -1;
        if (this._grid.value) {
            width = this._grid.value.width;
            height = this._grid.value.height;
        }
        this._grid.value = SerializableGrid.from({
            orientation: 0 /* Orientation.VERTICAL */,
            size: 100,
            groups: descriptor,
        }, {
            styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
            proportionalLayout: true
        });
        reset(this.rootHtmlElement, this._grid.value.element);
        // Only call layout after the elements have been added to the DOM,
        // so that they have a defined size.
        if (width !== -1) {
            this._grid.value.layout(width, height);
        }
    }
    _applyViewState(state) {
        if (!state) {
            return;
        }
        this.inputResultView.editor.restoreViewState(state);
        if (state.input1State) {
            this.input1View.editor.restoreViewState(state.input1State);
        }
        if (state.input2State) {
            this.input2View.editor.restoreViewState(state.input2State);
        }
        if (state.focusIndex >= 0) {
            [this.input1View.editor, this.input2View.editor, this.inputResultView.editor][state.focusIndex].focus();
        }
    }
    computeEditorViewState(resource) {
        if (!isEqual(this.inputModel.get()?.resultUri, resource)) {
            return undefined;
        }
        const result = this.inputResultView.editor.saveViewState();
        if (!result) {
            return undefined;
        }
        const input1State = this.input1View.editor.saveViewState() ?? undefined;
        const input2State = this.input2View.editor.saveViewState() ?? undefined;
        const focusIndex = [this.input1View.editor, this.input2View.editor, this.inputResultView.editor].findIndex(editor => editor.hasWidgetFocus());
        return { ...result, input1State, input2State, focusIndex };
    }
    tracksEditorViewState(input) {
        return input instanceof MergeEditorInput;
    }
    toggleShowNonConflictingChanges() {
        this.showNonConflictingChanges.set(!this.showNonConflictingChanges.get(), undefined);
        this.showNonConflictingChangesStore.set(this.showNonConflictingChanges.get());
        this._ctxShowNonConflictingChanges.set(this.showNonConflictingChanges.get());
    }
};
MergeEditor = MergeEditor_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextKeyService),
    __param(3, ITelemetryService),
    __param(4, IStorageService),
    __param(5, IThemeService),
    __param(6, ITextResourceConfigurationService),
    __param(7, IEditorService),
    __param(8, IEditorGroupsService),
    __param(9, IFileService),
    __param(10, ICodeEditorService)
], MergeEditor);
export { MergeEditor };
// TODO use PersistentStore
let MergeEditorLayoutStore = class MergeEditorLayoutStore {
    static { MergeEditorLayoutStore_1 = this; }
    static { this._key = 'mergeEditor/layout'; }
    constructor(_storageService) {
        this._storageService = _storageService;
        this._value = { kind: 'mixed', showBase: false, showBaseAtTop: true };
        const value = _storageService.get(MergeEditorLayoutStore_1._key, 0 /* StorageScope.PROFILE */, 'mixed');
        if (value === 'mixed' || value === 'columns') {
            this._value = { kind: value, showBase: false, showBaseAtTop: true };
        }
        else if (value) {
            try {
                this._value = JSON.parse(value);
            }
            catch (e) {
                onUnexpectedError(e);
            }
        }
    }
    get value() {
        return this._value;
    }
    set value(value) {
        if (this._value !== value) {
            this._value = value;
            this._storageService.store(MergeEditorLayoutStore_1._key, JSON.stringify(this._value), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
    }
};
MergeEditorLayoutStore = MergeEditorLayoutStore_1 = __decorate([
    __param(0, IStorageService)
], MergeEditorLayoutStore);
let MergeEditorOpenHandlerContribution = class MergeEditorOpenHandlerContribution extends Disposable {
    constructor(_editorService, codeEditorService) {
        super();
        this._editorService = _editorService;
        this._store.add(codeEditorService.registerCodeEditorOpenHandler(this.openCodeEditorFromMergeEditor.bind(this)));
    }
    async openCodeEditorFromMergeEditor(input, _source, sideBySide) {
        const activePane = this._editorService.activeEditorPane;
        if (!sideBySide
            && input.options
            && activePane instanceof MergeEditor
            && activePane.getControl()
            && activePane.input instanceof MergeEditorInput
            && isEqual(input.resource, activePane.input.result)) {
            // Special: stay inside the merge editor when it is active and when the input
            // targets the result editor of the merge editor.
            const targetEditor = activePane.getControl();
            applyTextEditorOptions(input.options, targetEditor, 0 /* ScrollType.Smooth */);
            return targetEditor;
        }
        // cannot handle this
        return null;
    }
};
MergeEditorOpenHandlerContribution = __decorate([
    __param(0, IEditorService),
    __param(1, ICodeEditorService)
], MergeEditorOpenHandlerContribution);
export { MergeEditorOpenHandlerContribution };
let MergeEditorResolverContribution = class MergeEditorResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.mergeEditorResolver'; }
    constructor(editorResolverService, instantiationService) {
        super();
        const mergeEditorInputFactory = (mergeEditor) => {
            return {
                editor: instantiationService.createInstance(MergeEditorInput, mergeEditor.base.resource, {
                    uri: mergeEditor.input1.resource,
                    title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
                    description: mergeEditor.input1.description ?? '',
                    detail: mergeEditor.input1.detail
                }, {
                    uri: mergeEditor.input2.resource,
                    title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
                    description: mergeEditor.input2.description ?? '',
                    detail: mergeEditor.input2.detail
                }, mergeEditor.result.resource)
            };
        };
        this._register(editorResolverService.registerEditor(`*`, {
            id: DEFAULT_EDITOR_ASSOCIATION.id,
            label: DEFAULT_EDITOR_ASSOCIATION.displayName,
            detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
            priority: RegisteredEditorPriority.builtin
        }, {}, {
            createMergeEditorInput: mergeEditorInputFactory
        }));
    }
};
MergeEditorResolverContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService)
], MergeEditorResolverContribution);
export { MergeEditorResolverContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL3ZpZXcvbWVyZ2VFZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBYSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEVBQW1DLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHaEgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2SixPQUFPLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUF3QixlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDekksT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFaEUsT0FBTyx5QkFBeUIsQ0FBQztBQUVqQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUlqRyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUN2SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFMUcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSwwQkFBMEIsRUFBeUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVqSixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUcxRCxPQUFPLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN6RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNsRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLHNCQUFzQixFQUFFLDJCQUEyQixFQUFFLHVDQUF1QyxFQUFFLGlCQUFpQixFQUF5QixNQUFNLDZCQUE2QixDQUFDO0FBQzlPLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBZ0Isb0JBQW9CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsc0JBQXNCLEVBQW1DLHdCQUF3QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEssT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWxFLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVksU0FBUSxrQkFBeUM7O2FBRXpELE9BQUUsR0FBRyxhQUFhLEFBQWhCLENBQWlCO0lBS25DLElBQVcsU0FBUztRQUNuQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDeEIsQ0FBQztJQW9CRCxJQUFXLFVBQVU7UUFDcEIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFDRCxJQUFXLEtBQUs7UUFDZixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFNRCxZQUNDLEtBQW1CLEVBQ0ksYUFBb0MsRUFDdEIsaUJBQXFDLEVBQ3ZELGdCQUFtQyxFQUNyQyxjQUErQixFQUNqQyxZQUEyQixFQUNQLGdDQUFtRSxFQUN0RixhQUE2QixFQUN2QixrQkFBd0MsRUFDaEQsV0FBeUIsRUFDRixrQkFBc0M7UUFFM0UsS0FBSyxDQUFDLGFBQVcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsZ0NBQWdDLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxXQUFXLENBQUMsQ0FBQztRQVZ6SSxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBUXJDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFHM0UsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDakQsSUFBSSxDQUFDLFVBQVUsR0FBRyxlQUFlLENBQW1DLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBZSxDQUFDLENBQUM7UUFDbEUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3BILElBQUksQ0FBQyxRQUFRLEdBQUcsZUFBZSxDQUFpQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQTJDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNsRyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDcEgsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdkgsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLGNBQWMsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxZQUFZLEdBQUcsc0JBQXNCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxpQkFBaUIsR0FBRywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLFdBQVcsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyw2QkFBNkIsR0FBRyx1Q0FBdUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDNUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxlQUFlLENBQXFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxnQkFBZ0IsQ0FDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUN0QixJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FDM0IsQ0FBQztRQUNGLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQzlLLElBQUksQ0FBQywyQkFBMkIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQztRQUN6RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLDhCQUE4QixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsQ0FBQSxlQUF3QixDQUFBLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUNsSixJQUFJLENBQUMseUJBQXlCLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVRLE9BQU87UUFDZixJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDM0MsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFPRCxJQUFhLFlBQVk7UUFDeEIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTztZQUM3QyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVk7WUFDdkUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQ25ILENBQUM7SUFFRCxhQUFhO0lBRUosUUFBUTtRQUNoQixJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNoQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDN0IsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFUyxtQkFBbUIsQ0FBQyxNQUFtQixFQUFFLGNBQWtDO1FBQ3BGLElBQUksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFUywwQkFBMEIsQ0FBQyxPQUEyQjtRQUMvRCxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVCLENBQUM7SUFFTyxZQUFZLENBQUMsT0FBMkI7UUFDL0MsTUFBTSxZQUFZLEdBQXVCLFNBQVMsQ0FBcUIsT0FBTyxFQUFFO1lBQy9FLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUU7WUFDM0IsV0FBVyxFQUFFLEtBQUs7WUFDbEIsbUJBQW1CLEVBQUUsQ0FBQztTQUN0QixDQUFDLENBQUM7UUFFSCxNQUFNLG9CQUFvQixHQUF1QixTQUFTLENBQXFCLFlBQVksRUFBRTtZQUM1RixRQUFRLEVBQUUsSUFBSTtZQUNkLGVBQWUsRUFBRSxTQUFTO1NBQzFCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRVMsY0FBYztRQUN2QixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDO0lBQ3BDLENBQUM7SUFFRCxNQUFNLENBQUMsU0FBb0I7UUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFUSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQWtCLEVBQUUsT0FBbUMsRUFBRSxPQUEyQixFQUFFLEtBQXdCO1FBQ3JJLElBQUksQ0FBQyxDQUFDLEtBQUssWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLENBQUM7WUFDMUMsTUFBTSxJQUFJLGtCQUFrQixDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUNELE1BQU0sS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDakMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRyxNQUFNLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6QyxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRS9CLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQ3pELG9CQUFvQixFQUNwQixLQUFLLEVBQ0wsSUFBSSxDQUFDLFVBQVUsRUFDZixJQUFJLENBQUMsVUFBVSxFQUNmLElBQUksQ0FBQyxlQUFlLEVBQ3BCLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLHlCQUF5QixDQUM5QixDQUFDO1FBRUYsS0FBSyxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQztZQUN2Qyx1QkFBdUIsRUFBRSxLQUFLLENBQUMsdUJBQXVCO1lBQ3RELGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtZQUVsQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxhQUFhO1lBQ2hELFdBQVcsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVE7WUFDL0MsWUFBWSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxLQUFLLFNBQVM7U0FDMUQsQ0FBQyxDQUFDO1FBRUgsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEMsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXhDLGdEQUFnRDtRQUNoRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUM3Qyw2REFBNkQ7WUFDN0QsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU3RCxJQUFJLENBQUMsQ0FBQyxLQUFLLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxDQUFDO2dCQUMxQyxPQUFPO1lBQ1IsQ0FBQztZQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLElBQUksUUFBUSxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHdDQUF3QztRQUN4QyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDOUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzVCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLHlCQUF5QixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3hELGtEQUFrRDtRQUNsRCxrQ0FBa0M7UUFDbEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hELCtDQUErQztZQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1QyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNuRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUM7WUFFbkMseUJBQXlCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFFbEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLHNCQUFzQixDQUFDLEVBQUU7Z0JBQ3BFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNoRCxNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDO2dCQUNwRCxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUM7Z0JBRXpFLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO29CQUMvRCxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsc0JBQXNCLENBQUMsRUFBRTt3QkFDL0QsSUFBSSxRQUFRLEVBQUUsQ0FBQzs0QkFDZCxRQUFRLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFO2dDQUN0RCx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQ3JELFNBQVMsRUFDVCxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFDdEIsc0JBQXNCLEVBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUN0QixzQkFBc0IsRUFDdEIsUUFBUSxDQUFDLE1BQU0sRUFDZixvQkFBb0IsRUFDcEIsZUFBZSxFQUNmLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUMzQixzQkFBc0IsRUFDdEIsaUJBQWlCLENBQ2pCLENBQUMsQ0FBQzs0QkFDSixDQUFDLENBQUMsQ0FBQzt3QkFDSixDQUFDOzZCQUFNLENBQUM7NEJBQ1AseUJBQXlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUNyRCxTQUFTLEVBQ1QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQ3RCLHNCQUFzQixFQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFDdEIsc0JBQXNCLEVBQ3RCLFNBQVMsRUFDVCxTQUFTLEVBQ1QsS0FBSyxFQUNMLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUMzQixzQkFBc0IsRUFDdEIsaUJBQWlCLENBQ2pCLENBQUMsQ0FBQzt3QkFDSixDQUFDO29CQUNGLENBQUMsQ0FBQyxDQUFDO2dCQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsZUFBZSw0QkFBb0IsQ0FBQztZQUU3RSxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNELElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtnQkFDeEUsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDaEYsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUNwQixPQUFPO2dCQUNSLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDckYsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUNoQiw4Q0FBOEM7b0JBQzlDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3pELENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCx1RkFBdUY7UUFDdkYsTUFBTSw0QkFBNEIsR0FBRyxDQUFDLFNBQXFCLEVBQUUsRUFBRTtZQUM5RCxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFOUUsbUJBQW1CLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3JGLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNyRixtQkFBbUIsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLGNBQWMsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUVwRixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM3RCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzdFLENBQUM7UUFDRixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxpQ0FBaUMsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUNsRyw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osNEJBQTRCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFHLENBQUMsQ0FBQztRQUV0RSxtR0FBbUc7UUFDbkcsMkRBQTJEO1FBQzNELG9EQUFvRDtRQUNwRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJO1lBSWhDO2dCQUZpQixnQkFBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBR3BELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsQ0FBQztvQkFDN0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDN0YsQ0FBQztZQUNGLENBQUM7WUFFRCxPQUFPO2dCQUNOLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDNUIsQ0FBQztZQUVPLENBQUMsZ0JBQWdCO2dCQUN4QixNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7Z0JBQzdCLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7WUFDOUIsQ0FBQztZQUVPLDhCQUE4QjtnQkFDckMsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDO29CQUM3QyxJQUFJLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDaEMsT0FBTztvQkFDUixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsbUVBQW1FO2dCQUNuRSxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FDaEMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFDdkgsSUFBSSxDQUFDLEtBQUssQ0FDVixDQUFDO1lBQ0gsQ0FBQztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxZQUFZLENBQ25CLE1BQWUsRUFDZixTQUErQixFQUMvQixZQUF5QixFQUN6QixzQkFBK0MsRUFDL0MsWUFBeUIsRUFDekIsc0JBQStDLEVBQy9DLFVBQW1DLEVBQ25DLG9CQUF5RCxFQUN6RCxlQUF3QixFQUN4QixZQUF5QixFQUN6QixzQkFBK0MsRUFDL0MsaUJBQTBCO1FBRTFCLE1BQU0saUJBQWlCLEdBQWEsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0saUJBQWlCLEdBQWEsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sZUFBZSxHQUFhLEVBQUUsQ0FBQztRQUNyQyxNQUFNLGlCQUFpQixHQUFhLEVBQUUsQ0FBQztRQUV2QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRTtZQUMzRSxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLHlCQUF5QixFQUFFLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQ3RFLGVBQWU7WUFDZixpQkFBaUI7U0FDakIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUU5QyxJQUFJLG9CQUFvQixFQUFFLENBQUM7WUFDMUIsS0FBSyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ2xFLENBQUM7UUFDRixDQUFDO1FBRUQsS0FBSyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RSxDQUFDO1FBRUQsS0FBSyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RSxDQUFDO1FBRUQsS0FBSyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDM0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RSxDQUFDO1FBRUQsZUFBZSxDQUFDLEdBQUcsQ0FBQztZQUNuQixPQUFPLEVBQUUsR0FBRyxFQUFFO2dCQUNiLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQ2hDLEtBQUssTUFBTSxJQUFJLElBQUksaUJBQWlCLEVBQUUsQ0FBQzt3QkFDdEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDcEIsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSCxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUNoQyxLQUFLLE1BQU0sSUFBSSxJQUFJLGlCQUFpQixFQUFFLENBQUM7d0JBQ3RDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3BCLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBQ0gsVUFBVSxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDL0IsS0FBSyxNQUFNLElBQUksSUFBSSxlQUFlLEVBQUUsQ0FBQzt3QkFDcEMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDcEIsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFDSCxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUNoQyxLQUFLLE1BQU0sSUFBSSxJQUFJLGlCQUFpQixFQUFFLENBQUM7d0JBQ3RDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3BCLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsT0FBTyxlQUFlLENBQUM7SUFDeEIsQ0FBQztJQUVRLFVBQVUsQ0FBQyxPQUF1QztRQUMxRCxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTFCLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLDRCQUFvQixDQUFDO1FBQ2pGLENBQUM7SUFDRixDQUFDO0lBRVEsVUFBVTtRQUNsQixLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFbkIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWpDLEtBQUssTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ25GLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsQ0FBQztJQUNGLENBQUM7SUFFUSxLQUFLO1FBQ2IsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWQsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUM1RCxDQUFDO0lBRVEsUUFBUTtRQUNoQixLQUFLLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUNuRixJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO2dCQUMzQixPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUVrQixnQkFBZ0IsQ0FBQyxPQUFnQjtRQUNuRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFaEMsS0FBSyxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDbkYsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELDJJQUEySTtJQUVsSSxVQUFVO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQWEsdUJBQXVCO1FBQ25DLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNsQyxPQUFPLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0lBQ25GLENBQUM7SUFFRCxhQUFhO0lBRU4sVUFBVTtRQUNoQixJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ2QsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUs7WUFDekIsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUTtTQUMxQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU0saUJBQWlCO1FBQ3ZCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFDNUYsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNkLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLO1lBQ3pCLGFBQWEsRUFBRSxJQUFJO1lBQ25CLFFBQVEsRUFBRSxDQUFDLFdBQVc7U0FDdEIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVNLG9CQUFvQjtRQUMxQixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFDaEcsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNkLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLO1lBQ3pCLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLFFBQVEsRUFBRSxDQUFDLGNBQWM7U0FDekIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVNLGFBQWEsQ0FBQyxJQUEyQjtRQUMvQyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ2QsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUs7WUFDekIsSUFBSTtTQUNKLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTSxTQUFTLENBQUMsU0FBNkI7UUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDckMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN6RCxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLGtCQUFrQixDQUFDO1lBQ3hDLE9BQU8sRUFBRSxTQUFTLENBQUMsYUFBYTtZQUNoQyxXQUFXLEVBQUUsU0FBUyxDQUFDLFFBQVE7WUFDL0IsWUFBWSxFQUFFLFNBQVMsQ0FBQyxJQUFJLEtBQUssU0FBUztTQUMxQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFJTyxXQUFXLENBQUMsTUFBMEI7UUFDN0MsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2hCLCtCQUErQjtZQUUvQixJQUFJLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQzdDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FDNUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDdkMsa0JBQWtCLEVBQ2xCLElBQUksQ0FBQyxTQUFTLENBQ2QsQ0FDRCxDQUFDO2dCQUNGLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUM3Qyw0Q0FBNEM7b0JBQzVDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNsRCxJQUFJLE9BQU8sRUFBRSxDQUFDO3dCQUNiLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQ2pDLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDakMsQ0FBQztpQkFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQ3BELElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2xDLENBQUM7WUFFRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxPQUFPLENBQUM7b0JBQ1osTUFBTSxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDekMsSUFBSSxFQUFFLEVBQUU7d0JBQ1IsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFHLENBQUMsSUFBSTtxQkFDL0IsQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDYjt3QkFDQyxJQUFJLEVBQUUsRUFBRTt3QkFDUixNQUFNLEVBQUU7NEJBQ1AsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUU7NEJBQzlCLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTOzRCQUMxRixFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRTt5QkFDOUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO3FCQUNuQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsRUFBRTt3QkFDUixJQUFJLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJO3FCQUMvQjtpQkFDRCxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLENBQUM7aUJBQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLENBQUMsT0FBTyxDQUFDO29CQUNaLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUNqQixJQUFJLEVBQUUsRUFBRTt3QkFDUixJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUcsQ0FBQyxJQUFJO3FCQUMvQixDQUFDLENBQUMsQ0FBQyxTQUFTO29CQUNiO3dCQUNDLElBQUksRUFBRSxFQUFFO3dCQUNSLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO3FCQUM3RztpQkFDRCxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLENBQUM7WUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUM7WUFDaEMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sT0FBTyxDQUFDLFVBQXFDO1FBQ3BELElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2YsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEIsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3RCLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDL0IsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUNsQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFNO1lBQzdDLFdBQVcsOEJBQXNCO1lBQ2pDLElBQUksRUFBRSxHQUFHO1lBQ1QsTUFBTSxFQUFFLFVBQVU7U0FDbEIsRUFBRTtZQUNGLE1BQU0sRUFBRSxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDekYsa0JBQWtCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsSUFBSSxDQUFDLGVBQWdCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkQsa0VBQWtFO1FBQ2xFLG9DQUFvQztRQUNwQyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFFTyxlQUFlLENBQUMsS0FBd0M7UUFDL0QsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwRCxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsVUFBVSxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzNCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekcsQ0FBQztJQUNGLENBQUM7SUFFUyxzQkFBc0IsQ0FBQyxRQUFhO1FBQzdDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUMxRCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDM0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxJQUFJLFNBQVMsQ0FBQztRQUN4RSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsSUFBSSxTQUFTLENBQUM7UUFDeEUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzlJLE9BQU8sRUFBRSxHQUFHLE1BQU0sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxDQUFDO0lBQzVELENBQUM7SUFHUyxxQkFBcUIsQ0FBQyxLQUFrQjtRQUNqRCxPQUFPLEtBQUssWUFBWSxnQkFBZ0IsQ0FBQztJQUMxQyxDQUFDO0lBS00sK0JBQStCO1FBQ3JDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckYsSUFBSSxDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsNkJBQTZCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzlFLENBQUM7O0FBbnBCVyxXQUFXO0lBMENyQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxZQUFZLENBQUE7SUFDWixZQUFBLGtCQUFrQixDQUFBO0dBbkRSLFdBQVcsQ0FvcEJ2Qjs7QUFRRCwyQkFBMkI7QUFDM0IsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7O2FBQ0gsU0FBSSxHQUFHLG9CQUFvQixBQUF2QixDQUF3QjtJQUdwRCxZQUE2QixlQUF3QztRQUFoQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFGN0QsV0FBTSxHQUF1QixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFHNUYsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyx3QkFBc0IsQ0FBQyxJQUFJLGdDQUF3QixPQUFPLENBQUMsQ0FBQztRQUU5RixJQUFJLEtBQUssS0FBSyxPQUFPLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ3JFLENBQUM7YUFBTSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQztnQkFDSixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakMsQ0FBQztZQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ1osaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxLQUF5QjtRQUNsQyxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsd0JBQXNCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQywyREFBMkMsQ0FBQztRQUNoSSxDQUFDO0lBQ0YsQ0FBQzs7QUEzQkksc0JBQXNCO0lBSWQsV0FBQSxlQUFlLENBQUE7R0FKdkIsc0JBQXNCLENBNEIzQjtBQUVNLElBQU0sa0NBQWtDLEdBQXhDLE1BQU0sa0NBQW1DLFNBQVEsVUFBVTtJQUVqRSxZQUNrQyxjQUE4QixFQUMzQyxpQkFBcUM7UUFFekQsS0FBSyxFQUFFLENBQUM7UUFIeUIsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBSS9ELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pILENBQUM7SUFFTyxLQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBK0IsRUFBRSxPQUEyQixFQUFFLFVBQWdDO1FBQ3pJLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUM7UUFDeEQsSUFBSSxDQUFDLFVBQVU7ZUFDWCxLQUFLLENBQUMsT0FBTztlQUNiLFVBQVUsWUFBWSxXQUFXO2VBQ2pDLFVBQVUsQ0FBQyxVQUFVLEVBQUU7ZUFDdkIsVUFBVSxDQUFDLEtBQUssWUFBWSxnQkFBZ0I7ZUFDNUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFDbEQsQ0FBQztZQUNGLDZFQUE2RTtZQUM3RSxpREFBaUQ7WUFDakQsTUFBTSxZQUFZLEdBQWdCLFVBQVUsQ0FBQyxVQUFVLEVBQUcsQ0FBQztZQUMzRCxzQkFBc0IsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFlBQVksNEJBQW9CLENBQUM7WUFDdkUsT0FBTyxZQUFZLENBQUM7UUFDckIsQ0FBQztRQUVELHFCQUFxQjtRQUNyQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCxDQUFBO0FBN0JZLGtDQUFrQztJQUc1QyxXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsa0JBQWtCLENBQUE7R0FKUixrQ0FBa0MsQ0E2QjlDOztBQUVNLElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQWdDLFNBQVEsVUFBVTthQUU5QyxPQUFFLEdBQUcsdUNBQXVDLEFBQTFDLENBQTJDO0lBRTdELFlBQ3lCLHFCQUE2QyxFQUM5QyxvQkFBMkM7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFFUixNQUFNLHVCQUF1QixHQUFvQyxDQUFDLFdBQXNDLEVBQTBCLEVBQUU7WUFDbkksT0FBTztnQkFDTixNQUFNLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUMxQyxnQkFBZ0IsRUFDaEIsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQ3pCO29CQUNDLEdBQUcsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVE7b0JBQ2hDLEtBQUssRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssSUFBSSxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7b0JBQ3hFLFdBQVcsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsSUFBSSxFQUFFO29CQUNqRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNO2lCQUNqQyxFQUNEO29CQUNDLEdBQUcsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVE7b0JBQ2hDLEtBQUssRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssSUFBSSxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7b0JBQ3hFLFdBQVcsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsSUFBSSxFQUFFO29CQUNqRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNO2lCQUNqQyxFQUNELFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUMzQjthQUNELENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FDbEQsR0FBRyxFQUNIO1lBQ0MsRUFBRSxFQUFFLDBCQUEwQixDQUFDLEVBQUU7WUFDakMsS0FBSyxFQUFFLDBCQUEwQixDQUFDLFdBQVc7WUFDN0MsTUFBTSxFQUFFLDBCQUEwQixDQUFDLG1CQUFtQjtZQUN0RCxRQUFRLEVBQUUsd0JBQXdCLENBQUMsT0FBTztTQUMxQyxFQUNELEVBQUUsRUFDRjtZQUNDLHNCQUFzQixFQUFFLHVCQUF1QjtTQUMvQyxDQUNELENBQUMsQ0FBQztJQUNKLENBQUM7O0FBN0NXLCtCQUErQjtJQUt6QyxXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFdBQUEscUJBQXFCLENBQUE7R0FOWCwrQkFBK0IsQ0E4QzNDIn0=