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
import * as dom from '../../../../../base/browser/dom.js';
import { Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basenameOrAuthority, dirname } from '../../../../../base/common/resources.js';
import './referencesWidget.css';
import { EmbeddedCodeEditorWidget } from '../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Range } from '../../../../common/core/range.js';
import { ModelDecorationOptions, TextModel } from '../../../../common/model/textModel.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../common/languages/modesRegistry.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { AccessibilityProvider, DataSource, Delegate, FileReferencesRenderer, IdentityProvider, OneReferenceRenderer, StringRepresentationProvider } from './referencesTree.js';
import * as peekView from '../../../peekView/browser/peekView.js';
import * as nls from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { FileReferences, OneReference } from '../referencesModel.js';
import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { withSelection } from '../../../../../platform/opener/common/opener.js';
class DecorationsManager {
    static { this.DecorationOptions = ModelDecorationOptions.register({
        description: 'reference-decoration',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'reference-decoration'
    }); }
    constructor(_editor, _model) {
        this._editor = _editor;
        this._model = _model;
        this._decorations = new Map();
        this._decorationIgnoreSet = new Set();
        this._callOnDispose = new DisposableStore();
        this._callOnModelChange = new DisposableStore();
        this._callOnDispose.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
        this._onModelChanged();
    }
    dispose() {
        this._callOnModelChange.dispose();
        this._callOnDispose.dispose();
        this.removeDecorations();
    }
    _onModelChanged() {
        this._callOnModelChange.clear();
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        for (const ref of this._model.references) {
            if (ref.uri.toString() === model.uri.toString()) {
                this._addDecorations(ref.parent);
                return;
            }
        }
    }
    _addDecorations(reference) {
        if (!this._editor.hasModel()) {
            return;
        }
        this._callOnModelChange.add(this._editor.getModel().onDidChangeDecorations(() => this._onDecorationChanged()));
        const newDecorations = [];
        const newDecorationsActualIndex = [];
        for (let i = 0, len = reference.children.length; i < len; i++) {
            const oneReference = reference.children[i];
            if (this._decorationIgnoreSet.has(oneReference.id)) {
                continue;
            }
            if (oneReference.uri.toString() !== this._editor.getModel().uri.toString()) {
                continue;
            }
            newDecorations.push({
                range: oneReference.range,
                options: DecorationsManager.DecorationOptions
            });
            newDecorationsActualIndex.push(i);
        }
        this._editor.changeDecorations((changeAccessor) => {
            const decorations = changeAccessor.deltaDecorations([], newDecorations);
            for (let i = 0; i < decorations.length; i++) {
                this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
            }
        });
    }
    _onDecorationChanged() {
        const toRemove = [];
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        for (const [decorationId, reference] of this._decorations) {
            const newRange = model.getDecorationRange(decorationId);
            if (!newRange) {
                continue;
            }
            let ignore = false;
            if (Range.equalsRange(newRange, reference.range)) {
                continue;
            }
            if (Range.spansMultipleLines(newRange)) {
                ignore = true;
            }
            else {
                const lineLength = reference.range.endColumn - reference.range.startColumn;
                const newLineLength = newRange.endColumn - newRange.startColumn;
                if (lineLength !== newLineLength) {
                    ignore = true;
                }
            }
            if (ignore) {
                this._decorationIgnoreSet.add(reference.id);
                toRemove.push(decorationId);
            }
            else {
                reference.range = newRange;
            }
        }
        for (let i = 0, len = toRemove.length; i < len; i++) {
            this._decorations.delete(toRemove[i]);
        }
        this._editor.removeDecorations(toRemove);
    }
    removeDecorations() {
        this._editor.removeDecorations([...this._decorations.keys()]);
        this._decorations.clear();
    }
}
export class LayoutData {
    constructor() {
        this.ratio = 0.7;
        this.heightInLines = 18;
    }
    static fromJSON(raw) {
        let ratio;
        let heightInLines;
        try {
            const data = JSON.parse(raw);
            ratio = data.ratio;
            heightInLines = data.heightInLines;
        }
        catch {
            //
        }
        return {
            ratio: ratio || 0.7,
            heightInLines: heightInLines || 18
        };
    }
}
class ReferencesTree extends WorkbenchAsyncDataTree {
}
let ReferencesDragAndDrop = class ReferencesDragAndDrop {
    constructor(labelService) {
        this.labelService = labelService;
        this.disposables = new DisposableStore();
    }
    getDragURI(element) {
        if (element instanceof FileReferences) {
            return element.uri.toString();
        }
        else if (element instanceof OneReference) {
            return withSelection(element.uri, element.range).toString();
        }
        return null;
    }
    getDragLabel(elements) {
        if (elements.length === 0) {
            return undefined;
        }
        const labels = elements.map(e => this.labelService.getUriBasenameLabel(e.uri));
        return labels.join(', ');
    }
    onDragStart(data, originalEvent) {
        if (!originalEvent.dataTransfer) {
            return;
        }
        const elements = data.elements;
        const resources = elements.map(e => this.getDragURI(e)).filter(Boolean);
        if (resources.length) {
            // Apply resources as resource-list
            originalEvent.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(resources));
            // Also add as plain text for outside consumers
            originalEvent.dataTransfer.setData(DataTransfers.TEXT, resources.join('\n'));
        }
    }
    onDragOver() { return false; }
    drop() { }
    dispose() { this.disposables.dispose(); }
};
ReferencesDragAndDrop = __decorate([
    __param(0, ILabelService)
], ReferencesDragAndDrop);
/**
 * ZoneWidget that is shown inside the editor
 */
let ReferenceWidget = class ReferenceWidget extends peekView.PeekViewWidget {
    constructor(editor, _defaultTreeKeyboardSupport, layoutData, themeService, _textModelResolverService, _instantiationService, _peekViewService, _uriLabel, _keybindingService) {
        super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true, supportOnTitleClick: true }, _instantiationService);
        this._defaultTreeKeyboardSupport = _defaultTreeKeyboardSupport;
        this.layoutData = layoutData;
        this._textModelResolverService = _textModelResolverService;
        this._instantiationService = _instantiationService;
        this._peekViewService = _peekViewService;
        this._uriLabel = _uriLabel;
        this._keybindingService = _keybindingService;
        this._disposeOnNewModel = new DisposableStore();
        this._callOnDispose = new DisposableStore();
        this._onDidSelectReference = this._callOnDispose.add(new Emitter());
        this.onDidSelectReference = this._onDidSelectReference.event;
        this._dim = new dom.Dimension(0, 0);
        this._isClosing = false; // whether or not a dispose is already in progress
        this._applyTheme(themeService.getColorTheme());
        this._callOnDispose.add(themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
        this._peekViewService.addExclusiveWidget(editor, this);
        this.create();
    }
    get isClosing() {
        return this._isClosing;
    }
    dispose() {
        this._isClosing = true;
        this.setModel(undefined);
        this._callOnDispose.dispose();
        this._disposeOnNewModel.dispose();
        dispose(this._preview);
        dispose(this._previewNotAvailableMessage);
        dispose(this._tree);
        dispose(this._previewModelReference);
        this._splitView.dispose();
        super.dispose();
    }
    _applyTheme(theme) {
        const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
        this.style({
            arrowColor: borderColor,
            frameColor: borderColor,
            headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
            primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
            secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
        });
    }
    show(where) {
        super.show(where, this.layoutData.heightInLines || 18);
    }
    focusOnReferenceTree() {
        this._tree.domFocus();
    }
    focusOnPreviewEditor() {
        this._preview.focus();
    }
    isPreviewEditorFocused() {
        return this._preview.hasTextFocus();
    }
    _onTitleClick(e) {
        if (this._preview && this._preview.getModel()) {
            this._onDidSelectReference.fire({
                element: this._getFocusedReference(),
                kind: e.ctrlKey || e.metaKey || e.altKey ? 'side' : 'open',
                source: 'title'
            });
        }
    }
    _fillBody(containerElement) {
        this.setCssClass('reference-zone-widget');
        // message pane
        this._messageContainer = dom.append(containerElement, dom.$('div.messages'));
        dom.hide(this._messageContainer);
        this._splitView = new SplitView(containerElement, { orientation: 1 /* Orientation.HORIZONTAL */ });
        // editor
        this._previewContainer = dom.append(containerElement, dom.$('div.preview.inline'));
        const options = {
            scrollBeyondLastLine: false,
            scrollbar: {
                verticalScrollbarSize: 14,
                horizontal: 'auto',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                alwaysConsumeMouseWheel: true
            },
            overviewRulerLanes: 2,
            fixedOverflowWidgets: true,
            minimap: {
                enabled: false
            }
        };
        this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewContainer, options, {}, this.editor);
        dom.hide(this._previewContainer);
        this._previewNotAvailableMessage = this._instantiationService.createInstance(TextModel, nls.localize('missingPreviewMessage', "no preview available"), PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null);
        // tree
        this._treeContainer = dom.append(containerElement, dom.$('div.ref-tree.inline'));
        const treeOptions = {
            keyboardSupport: this._defaultTreeKeyboardSupport,
            accessibilityProvider: new AccessibilityProvider(),
            keyboardNavigationLabelProvider: this._instantiationService.createInstance(StringRepresentationProvider),
            identityProvider: new IdentityProvider(),
            openOnSingleClick: true,
            selectionNavigation: true,
            overrideStyles: {
                listBackground: peekView.peekViewResultsBackground
            },
            dnd: this._instantiationService.createInstance(ReferencesDragAndDrop)
        };
        if (this._defaultTreeKeyboardSupport) {
            // the tree will consume `Escape` and prevent the widget from closing
            this._callOnDispose.add(dom.addStandardDisposableListener(this._treeContainer, 'keydown', (e) => {
                if (e.equals(9 /* KeyCode.Escape */)) {
                    this._keybindingService.dispatchEvent(e, e.target);
                    e.stopPropagation();
                }
            }, true));
        }
        this._tree = this._instantiationService.createInstance(ReferencesTree, 'ReferencesWidget', this._treeContainer, new Delegate(), [
            this._instantiationService.createInstance(FileReferencesRenderer),
            this._instantiationService.createInstance(OneReferenceRenderer),
        ], this._instantiationService.createInstance(DataSource), treeOptions);
        // split stuff
        this._splitView.addView({
            onDidChange: Event.None,
            element: this._previewContainer,
            minimumSize: 200,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                this._preview.layout({ height: this._dim.height, width });
            }
        }, Sizing.Distribute);
        this._splitView.addView({
            onDidChange: Event.None,
            element: this._treeContainer,
            minimumSize: 100,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                this._treeContainer.style.height = `${this._dim.height}px`;
                this._treeContainer.style.width = `${width}px`;
                this._tree.layout(this._dim.height, width);
            }
        }, Sizing.Distribute);
        this._disposables.add(this._splitView.onDidSashChange(() => {
            if (this._dim.width) {
                this.layoutData.ratio = this._splitView.getViewSize(0) / this._dim.width;
            }
        }, undefined));
        // listen on selection and focus
        const onEvent = (element, kind) => {
            if (element instanceof OneReference) {
                if (kind === 'show') {
                    this._revealReference(element, false);
                }
                this._onDidSelectReference.fire({ element, kind, source: 'tree' });
            }
        };
        this._disposables.add(this._tree.onDidOpen(e => {
            if (e.sideBySide) {
                onEvent(e.element, 'side');
            }
            else if (e.editorOptions.pinned) {
                onEvent(e.element, 'goto');
            }
            else {
                onEvent(e.element, 'show');
            }
        }));
        dom.hide(this._treeContainer);
    }
    _onWidth(width) {
        if (this._dim) {
            this._doLayoutBody(this._dim.height, width);
        }
    }
    _doLayoutBody(heightInPixel, widthInPixel) {
        super._doLayoutBody(heightInPixel, widthInPixel);
        this._dim = new dom.Dimension(widthInPixel, heightInPixel);
        this.layoutData.heightInLines = this._viewZone ? this._viewZone.heightInLines : this.layoutData.heightInLines;
        this._splitView.layout(widthInPixel);
        this._splitView.resizeView(0, widthInPixel * this.layoutData.ratio);
    }
    setSelection(selection) {
        return this._revealReference(selection, true).then(() => {
            if (!this._model) {
                // disposed
                return;
            }
            // show in tree
            this._tree.setSelection([selection]);
            this._tree.setFocus([selection]);
        });
    }
    setModel(newModel) {
        // clean up
        this._disposeOnNewModel.clear();
        this._model = newModel;
        if (this._model) {
            return this._onNewModel();
        }
        return Promise.resolve();
    }
    _onNewModel() {
        if (!this._model) {
            return Promise.resolve(undefined);
        }
        if (this._model.isEmpty) {
            this.setTitle('');
            this._messageContainer.innerText = nls.localize('noResults', "No results");
            dom.show(this._messageContainer);
            return Promise.resolve(undefined);
        }
        dom.hide(this._messageContainer);
        this._decorationsManager = new DecorationsManager(this._preview, this._model);
        this._disposeOnNewModel.add(this._decorationsManager);
        // listen on model changes
        this._disposeOnNewModel.add(this._model.onDidChangeReferenceRange(reference => this._tree.rerender(reference)));
        // listen on editor
        this._disposeOnNewModel.add(this._preview.onMouseDown(e => {
            const { event, target } = e;
            if (event.detail !== 2) {
                return;
            }
            const element = this._getFocusedReference();
            if (!element) {
                return;
            }
            this._onDidSelectReference.fire({
                element: { uri: element.uri, range: target.range },
                kind: (event.ctrlKey || event.metaKey || event.altKey) ? 'side' : 'open',
                source: 'editor'
            });
        }));
        // make sure things are rendered
        this.container.classList.add('results-loaded');
        dom.show(this._treeContainer);
        dom.show(this._previewContainer);
        this._splitView.layout(this._dim.width);
        this.focusOnReferenceTree();
        // pick input and a reference to begin with
        return this._tree.setInput(this._model.groups.length === 1 ? this._model.groups[0] : this._model);
    }
    _getFocusedReference() {
        const [element] = this._tree.getFocus();
        if (element instanceof OneReference) {
            return element;
        }
        else if (element instanceof FileReferences) {
            if (element.children.length > 0) {
                return element.children[0];
            }
        }
        return undefined;
    }
    async revealReference(reference) {
        await this._revealReference(reference, false);
        this._onDidSelectReference.fire({ element: reference, kind: 'goto', source: 'tree' });
    }
    async _revealReference(reference, revealParent) {
        // check if there is anything to do...
        if (this._revealedReference === reference) {
            return;
        }
        this._revealedReference = reference;
        // Update widget header
        if (reference.uri.scheme !== Schemas.inMemory) {
            this.setTitle(basenameOrAuthority(reference.uri), this._uriLabel.getUriLabel(dirname(reference.uri)));
        }
        else {
            this.setTitle(nls.localize('peekView.alternateTitle', "References"));
        }
        const promise = this._textModelResolverService.createModelReference(reference.uri);
        if (this._tree.getInput() === reference.parent) {
            this._tree.reveal(reference);
        }
        else {
            if (revealParent) {
                this._tree.reveal(reference.parent);
            }
            await this._tree.expand(reference.parent);
            this._tree.reveal(reference);
        }
        const ref = await promise;
        if (!this._model) {
            // disposed
            ref.dispose();
            return;
        }
        dispose(this._previewModelReference);
        // show in editor
        const model = ref.object;
        if (model) {
            const scrollType = this._preview.getModel() === model.textEditorModel ? 0 /* ScrollType.Smooth */ : 1 /* ScrollType.Immediate */;
            const sel = Range.lift(reference.range).collapseToStart();
            this._previewModelReference = ref;
            this._preview.setModel(model.textEditorModel);
            this._preview.setSelection(sel);
            this._preview.revealRangeInCenter(sel, scrollType);
        }
        else {
            this._preview.setModel(this._previewNotAvailableMessage);
            ref.dispose();
        }
    }
};
ReferenceWidget = __decorate([
    __param(3, IThemeService),
    __param(4, ITextModelService),
    __param(5, IInstantiationService),
    __param(6, peekView.IPeekViewService),
    __param(7, ILabelService),
    __param(8, IKeybindingService)
], ReferenceWidget);
export { ReferenceWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlc1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9wZWVrL3JlZmVyZW5jZXNXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUcxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBR3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUEyQixNQUFNLHlDQUF5QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkYsT0FBTyx3QkFBd0IsQ0FBQztBQUVoQyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUU3RyxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHakUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLFNBQVMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RGLE9BQU8sRUFBb0IsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxzQkFBc0IsRUFBRSxnQkFBZ0IsRUFBRSxvQkFBb0IsRUFBRSw0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