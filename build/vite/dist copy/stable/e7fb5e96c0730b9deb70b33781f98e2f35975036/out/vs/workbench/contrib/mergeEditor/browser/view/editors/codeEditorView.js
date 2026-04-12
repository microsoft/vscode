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
import { h } from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { EditorExtensionsRegistry } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { CodeLensContribution } from '../../../../../../editor/contrib/codelens/browser/codelensController.js';
import { FoldingController } from '../../../../../../editor/contrib/folding/browser/folding.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../../../browser/parts/editor/editor.js';
import { setStyle } from '../../utils.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
export class CodeEditorView extends Disposable {
    updateOptions(newOptions) {
        this.editor.updateOptions(newOptions);
    }
    constructor(instantiationService, viewModel, configurationService) {
        super();
        this.instantiationService = instantiationService;
        this.viewModel = viewModel;
        this.configurationService = configurationService;
        this.model = this.viewModel.map(m => /** @description model */ m?.model);
        this.htmlElements = h('div.code-view', [
            h('div.header@header', [
                h('span.title@title'),
                h('span.description@description'),
                h('span.detail@detail'),
                h('span.toolbar@toolbar'),
            ]),
            h('div.container', [
                h('div.gutter@gutterDiv'),
                h('div@editor'),
            ]),
        ]);
        this._onDidViewChange = this._register(new Emitter());
        this.view = {
            element: this.htmlElements.root,
            minimumWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
            maximumWidth: DEFAULT_EDITOR_MAX_DIMENSIONS.width,
            minimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
            maximumHeight: DEFAULT_EDITOR_MAX_DIMENSIONS.height,
            onDidChange: this._onDidViewChange.event,
            layout: (width, height, top, left) => {
                setStyle(this.htmlElements.root, { width, height, top, left });
                this.editor.layout({
                    width: width - this.htmlElements.gutterDiv.clientWidth,
                    height: height - this.htmlElements.header.clientHeight,
                });
            }
            // preferredWidth?: number | undefined;
            // preferredHeight?: number | undefined;
            // priority?: LayoutPriority | undefined;
            // snap?: boolean | undefined;
        };
        this.checkboxesVisible = observableConfigValue('mergeEditor.showCheckboxes', false, this.configurationService);
        this.showDeletionMarkers = observableConfigValue('mergeEditor.showDeletionMarkers', true, this.configurationService);
        this.useSimplifiedDecorations = observableConfigValue('mergeEditor.useSimplifiedDecorations', false, this.configurationService);
        this.editor = this.instantiationService.createInstance(CodeEditorWidget, this.htmlElements.editor, {}, {
            contributions: this.getEditorContributions(),
        });
        this.isFocused = observableFromEvent(this, Event.any(this.editor.onDidBlurEditorWidget, this.editor.onDidFocusEditorWidget), () => /** @description editor.hasWidgetFocus */ this.editor.hasWidgetFocus());
        this.cursorPosition = observableFromEvent(this, this.editor.onDidChangeCursorPosition, () => /** @description editor.getPosition */ this.editor.getPosition());
        this.selection = observableFromEvent(this, this.editor.onDidChangeCursorSelection, () => /** @description editor.getSelections */ this.editor.getSelections());
        this.cursorLineNumber = this.cursorPosition.map(p => /** @description cursorPosition.lineNumber */ p?.lineNumber);
    }
    getEditorContributions() {
        return EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== FoldingController.ID && c.id !== CodeLensContribution.ID);
    }
}
export function createSelectionsAutorun(codeEditorView, translateRange) {
    const selections = derived(reader => {
        /** @description selections */
        const viewModel = codeEditorView.viewModel.read(reader);
        if (!viewModel) {
            return [];
        }
        const baseRange = viewModel.selectionInBase.read(reader);
        if (!baseRange || baseRange.sourceEditor === codeEditorView) {
            return [];
        }
        return baseRange.rangesInBase.map(r => translateRange(r, viewModel));
    });
    return autorun(reader => {
        /** @description set selections */
        const ranges = selections.read(reader);
        if (ranges.length === 0) {
            return;
        }
        codeEditorView.editor.setSelections(ranges.map(r => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)));
    });
}
let TitleMenu = class TitleMenu extends Disposable {
    constructor(menuId, targetHtmlElement, instantiationService) {
        super();
        const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, targetHtmlElement, menuId, {
            menuOptions: { renderShortTitle: true },
            toolbarOptions: { primaryGroup: (g) => g === 'primary' }
        });
        this._store.add(toolbar);
    }
};
TitleMenu = __decorate([
    __param(2, IInstantiationService)
], TitleMenu);
export { TitleMenu };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUVkaXRvclZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL3ZpZXcvZWRpdG9ycy9jb2RlRWRpdG9yVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFlLE9BQU8sRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsd0JBQXdCLEVBQWtDLE1BQU0sc0RBQXNELENBQUM7QUFDaEksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFHMUcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQy9HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUdoSCxNQUFN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