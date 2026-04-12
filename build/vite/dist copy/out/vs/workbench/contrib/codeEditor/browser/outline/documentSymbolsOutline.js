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
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IOutlineService, } from '../../../../services/outline/browser/outline.js';
import { Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DocumentSymbolComparator, DocumentSymbolAccessibilityProvider, DocumentSymbolRenderer, DocumentSymbolFilter, DocumentSymbolGroupRenderer, DocumentSymbolIdentityProvider, DocumentSymbolNavigationLabelProvider, DocumentSymbolVirtualDelegate, DocumentSymbolDragAndDrop } from './documentSymbolsTree.js';
import { isCodeEditor, isDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { OutlineGroup, OutlineElement, OutlineModel, TreeElement, IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { raceCancellation, TimeoutTimer, timeout, Barrier } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { localize } from '../../../../../nls.js';
import { IMarkerDecorationsService } from '../../../../../editor/common/services/markerDecorations.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
let DocumentSymbolBreadcrumbsSource = class DocumentSymbolBreadcrumbsSource {
    constructor(_editor, _textResourceConfigurationService) {
        this._editor = _editor;
        this._textResourceConfigurationService = _textResourceConfigurationService;
        this._breadcrumbs = [];
    }
    getBreadcrumbElements() {
        return this._breadcrumbs;
    }
    clear() {
        this._breadcrumbs = [];
    }
    update(model, position) {
        const newElements = this._computeBreadcrumbs(model, position);
        this._breadcrumbs = newElements.map(element => ({
            element,
            label: element instanceof OutlineElement ? element.symbol.name : ''
        }));
    }
    _computeBreadcrumbs(model, position) {
        let item = model.getItemEnclosingPosition(position);
        if (!item) {
            return [];
        }
        const chain = [];
        while (item) {
            chain.push(item);
            const parent = item.parent;
            if (parent instanceof OutlineModel) {
                break;
            }
            if (parent instanceof OutlineGroup && parent.parent && parent.parent.children.size === 1) {
                break;
            }
            item = parent;
        }
        const result = [];
        for (let i = chain.length - 1; i >= 0; i--) {
            const element = chain[i];
            if (this._isFiltered(element)) {
                break;
            }
            result.push(element);
        }
        if (result.length === 0) {
            return [];
        }
        return result;
    }
    _isFiltered(element) {
        if (!(element instanceof OutlineElement)) {
            return false;
        }
        const key = `breadcrumbs.${DocumentSymbolFilter.kindToConfigName[element.symbol.kind]}`;
        let uri;
        if (this._editor && this._editor.getModel()) {
            const model = this._editor.getModel();
            uri = model.uri;
        }
        return !this._textResourceConfigurationService.getValue(uri, key);
    }
};
DocumentSymbolBreadcrumbsSource = __decorate([
    __param(1, ITextResourceConfigurationService)
], DocumentSymbolBreadcrumbsSource);
let DocumentSymbolsOutline = class DocumentSymbolsOutline {
    get activeElement() {
        const posistion = this._editor.getPosition();
        if (!posistion || !this._outlineModel) {
            return undefined;
        }
        else {
            return this._outlineModel.getItemEnclosingPosition(posistion);
        }
    }
    constructor(_editor, target, firstLoadBarrier, _languageFeaturesService, _codeEditorService, _outlineModelService, _configurationService, _markerDecorationsService, textResourceConfigurationService, instantiationService) {
        this._editor = _editor;
        this._languageFeaturesService = _languageFeaturesService;
        this._codeEditorService = _codeEditorService;
        this._outlineModelService = _outlineModelService;
        this._configurationService = _configurationService;
        this._markerDecorationsService = _markerDecorationsService;
        this._disposables = new DisposableStore();
        this._onDidChange = this._disposables.add(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._outlineDisposables = new DisposableStore();
        this.outlineKind = 'documentSymbols';
        this._breadcrumbsDataSource = new DocumentSymbolBreadcrumbsSource(_editor, textResourceConfigurationService);
        const delegate = new DocumentSymbolVirtualDelegate();
        const renderers = [new DocumentSymbolGroupRenderer(), instantiationService.createInstance(DocumentSymbolRenderer, true, target)];
        const treeDataSource = {
            getChildren: (parent) => {
                if (parent instanceof OutlineElement || parent instanceof OutlineGroup) {
                    return parent.children.values();
                }
                if (parent === this && this._outlineModel) {
                    return this._outlineModel.children.values();
                }
                return [];
            }
        };
        const comparator = new DocumentSymbolComparator();
        const initialState = textResourceConfigurationService.getValue(_editor.getModel()?.uri, "outline.collapseItems" /* OutlineConfigKeys.collapseItems */);
        const options = {
            collapseByDefault: target === 2 /* OutlineTarget.Breadcrumbs */ || (target === 1 /* OutlineTarget.OutlinePane */ && initialState === "alwaysCollapse" /* OutlineConfigCollapseItemsValues.Collapsed */),
            expandOnlyOnTwistieClick: true,
            multipleSelectionSupport: false,
            identityProvider: new DocumentSymbolIdentityProvider(),
            keyboardNavigationLabelProvider: new DocumentSymbolNavigationLabelProvider(),
            accessibilityProvider: new DocumentSymbolAccessibilityProvider(localize('document', "Document Symbols")),
            filter: target === 1 /* OutlineTarget.OutlinePane */
                ? instantiationService.createInstance(DocumentSymbolFilter, 'outline')
                : target === 2 /* OutlineTarget.Breadcrumbs */
                    ? instantiationService.createInstance(DocumentSymbolFilter, 'breadcrumbs')
                    : undefined,
            dnd: instantiationService.createInstance(DocumentSymbolDragAndDrop),
        };
        this.config = {
            breadcrumbsDataSource: this._breadcrumbsDataSource,
            delegate,
            renderers,
            treeDataSource,
            comparator,
            options,
            quickPickDataSource: { getQuickPickElements: () => { throw new Error('not implemented'); } },
        };
        // update as language, model, providers changes
        this._disposables.add(_languageFeaturesService.documentSymbolProvider.onDidChange(_ => this._createOutline()));
        this._disposables.add(this._editor.onDidChangeModel(_ => this._createOutline()));
        this._disposables.add(this._editor.onDidChangeModelLanguage(_ => this._createOutline()));
        // update soon'ish as model content change
        const updateSoon = new TimeoutTimer();
        this._disposables.add(updateSoon);
        this._disposables.add(this._editor.onDidChangeModelContent(event => {
            const model = this._editor.getModel();
            if (model) {
                const timeout = _outlineModelService.getDebounceValue(model);
                updateSoon.cancelAndSet(() => this._createOutline(event), timeout);
            }
        }));
        // stop when editor dies
        this._disposables.add(this._editor.onDidDispose(() => this._outlineDisposables.clear()));
        // initial load
        this._createOutline().finally(() => firstLoadBarrier.open());
    }
    dispose() {
        this._disposables.dispose();
        this._outlineDisposables.dispose();
    }
    get isEmpty() {
        return !this._outlineModel || TreeElement.empty(this._outlineModel);
    }
    get uri() {
        return this._outlineModel?.uri;
    }
    async reveal(entry, options, sideBySide, select) {
        const model = OutlineModel.get(entry);
        if (!model || !(entry instanceof OutlineElement)) {
            return;
        }
        await this._codeEditorService.openCodeEditor({
            resource: model.uri,
            options: {
                ...options,
                selection: select ? entry.symbol.range : Range.collapseToStart(entry.symbol.selectionRange),
                selectionRevealType: 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */,
            }
        }, this._editor, sideBySide);
    }
    preview(entry) {
        if (!(entry instanceof OutlineElement)) {
            return Disposable.None;
        }
        const { symbol } = entry;
        this._editor.revealRangeInCenterIfOutsideViewport(symbol.range, 0 /* ScrollType.Smooth */);
        const decorationsCollection = this._editor.createDecorationsCollection([{
                range: symbol.range,
                options: {
                    description: 'document-symbols-outline-range-highlight',
                    className: 'rangeHighlight',
                    isWholeLine: true
                }
            }]);
        return toDisposable(() => decorationsCollection.clear());
    }
    captureViewState() {
        const viewState = this._editor.saveViewState();
        return toDisposable(() => {
            if (viewState) {
                this._editor.restoreViewState(viewState);
            }
        });
    }
    async _createOutline(contentChangeEvent) {
        this._outlineDisposables.clear();
        if (!contentChangeEvent) {
            this._setOutlineModel(undefined);
        }
        if (!this._editor.hasModel()) {
            return;
        }
        const buffer = this._editor.getModel();
        if (!this._languageFeaturesService.documentSymbolProvider.has(buffer)) {
            return;
        }
        const cts = new CancellationTokenSource();
        const versionIdThen = buffer.getVersionId();
        const timeoutTimer = new TimeoutTimer();
        this._outlineDisposables.add(timeoutTimer);
        this._outlineDisposables.add(toDisposable(() => cts.dispose(true)));
        try {
            const model = await this._outlineModelService.getOrCreate(buffer, cts.token);
            if (cts.token.isCancellationRequested) {
                // cancelled -> do nothing
                return;
            }
            if (TreeElement.empty(model) || !this._editor.hasModel()) {
                // empty -> no outline elements
                this._setOutlineModel(model);
                return;
            }
            // heuristic: when the symbols-to-lines ratio changes by 50% between edits
            // wait a little (and hope that the next change isn't as drastic).
            if (contentChangeEvent && this._outlineModel && buffer.getLineCount() >= 25) {
                const newSize = TreeElement.size(model);
                const newLength = buffer.getValueLength();
                const newRatio = newSize / newLength;
                const oldSize = TreeElement.size(this._outlineModel);
                const oldLength = newLength - contentChangeEvent.changes.reduce((prev, value) => prev + value.rangeLength, 0);
                const oldRatio = oldSize / oldLength;
                if (newRatio <= oldRatio * 0.5 || newRatio >= oldRatio * 1.5) {
                    // wait for a better state and ignore current model when more
                    // typing has happened
                    const value = await raceCancellation(timeout(2000).then(() => true), cts.token, false);
                    if (!value) {
                        return;
                    }
                }
            }
            // feature: show markers with outline element
            this._applyMarkersToOutline(model);
            this._outlineDisposables.add(this._markerDecorationsService.onDidChangeMarker(textModel => {
                if (isEqual(model.uri, textModel.uri)) {
                    this._applyMarkersToOutline(model);
                    this._onDidChange.fire({});
                }
            }));
            this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */) || e.affectsConfiguration('problems.visibility')) {
                    const problem = this._configurationService.getValue('problems.visibility');
                    const config = this._configurationService.getValue("outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */);
                    if (!problem || !config) {
                        model.updateMarker([]);
                    }
                    else {
                        this._applyMarkersToOutline(model);
                    }
                    this._onDidChange.fire({});
                }
                if (e.affectsConfiguration('outline')) {
                    // outline filtering, problems on/off
                    this._onDidChange.fire({});
                }
                if (e.affectsConfiguration('breadcrumbs') && this._editor.hasModel()) {
                    // breadcrumbs filtering
                    this._breadcrumbsDataSource.update(model, this._editor.getPosition());
                    this._onDidChange.fire({});
                }
            }));
            // feature: toggle icons
            this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("outline.icons" /* OutlineConfigKeys.icons */)) {
                    this._onDidChange.fire({});
                }
                if (e.affectsConfiguration('outline')) {
                    this._onDidChange.fire({});
                }
            }));
            // feature: update active when cursor changes
            this._outlineDisposables.add(this._editor.onDidChangeCursorPosition(_ => {
                timeoutTimer.cancelAndSet(() => {
                    if (!buffer.isDisposed() && versionIdThen === buffer.getVersionId() && this._editor.hasModel()) {
                        this._breadcrumbsDataSource.update(model, this._editor.getPosition());
                        this._onDidChange.fire({ affectOnlyActiveElement: true });
                    }
                }, 150);
            }));
            // update properties, send event
            this._setOutlineModel(model);
        }
        catch (err) {
            this._setOutlineModel(undefined);
            onUnexpectedError(err);
        }
    }
    _applyMarkersToOutline(model) {
        const problem = this._configurationService.getValue('problems.visibility');
        const config = this._configurationService.getValue("outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */);
        if (!model || !problem || !config) {
            return;
        }
        const markers = [];
        for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(model.uri)) {
            if (marker.severity === MarkerSeverity.Error || marker.severity === MarkerSeverity.Warning) {
                markers.push({ ...range, severity: marker.severity });
            }
        }
        model.updateMarker(markers);
    }
    _setOutlineModel(model) {
        const position = this._editor.getPosition();
        if (!position || !model) {
            this._outlineModel = undefined;
            this._breadcrumbsDataSource.clear();
        }
        else {
            if (!this._outlineModel?.merge(model)) {
                this._outlineModel = model;
            }
            this._breadcrumbsDataSource.update(model, position);
        }
        this._onDidChange.fire({});
    }
};
DocumentSymbolsOutline = __decorate([
    __param(3, ILanguageFeaturesService),
    __param(4, ICodeEditorService),
    __param(5, IOutlineModelService),
    __param(6, IConfigurationService),
    __param(7, IMarkerDecorationsService),
    __param(8, ITextResourceConfigurationService),
    __param(9, IInstantiationService)
], DocumentSymbolsOutline);
let DocumentSymbolsOutlineCreator = class DocumentSymbolsOutlineCreator {
    constructor(outlineService) {
        const reg = outlineService.registerOutlineCreator(this);
        this.dispose = () => reg.dispose();
    }
    matches(candidate) {
        const ctrl = candidate.getControl();
        return isCodeEditor(ctrl) || isDiffEditor(ctrl);
    }
    async createOutline(pane, target, _token) {
        const control = pane.getControl();
        let editor;
        if (isCodeEditor(control)) {
            editor = control;
        }
        else if (isDiffEditor(control)) {
            editor = control.getModifiedEditor();
        }
        if (!editor) {
            return undefined;
        }
        const firstLoadBarrier = new Barrier();
        const result = editor.invokeWithinContext(accessor => accessor.get(IInstantiationService).createInstance(DocumentSymbolsOutline, editor, target, firstLoadBarrier));
        await firstLoadBarrier.wait();
        return result;
    }
};
DocumentSymbolsOutlineCreator = __decorate([
    __param(0, IOutlineService)
], DocumentSymbolsOutlineCreator);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DocumentSymbolsOutlineCreator, 4 /* LifecyclePhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9jdW1lbnRTeW1ib2xzT3V0bGluZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9vdXRsaW5lL2RvY3VtZW50U3ltYm9sc091dGxpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pILE9BQU8sRUFBdUksZUFBZSxHQUF5RCxNQUFNLGlEQUFpRCxDQUFDO0FBQzlRLE9BQU8sRUFBbUMsVUFBVSxJQUFJLG1CQUFtQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRy9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxtQ0FBbUMsRUFBRSxzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSwyQkFBMkIsRUFBRSw4QkFBOEIsRUFBRSxxQ0FBcUMsRUFBRSw2QkFBNkIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JULE9BQU8sRUFBZSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBa0Isb0JBQW9CLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUN0TCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkcsT0FBTyxF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