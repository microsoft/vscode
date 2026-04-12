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
var ReferencesController_1;
import { createCancelablePromise } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { KeyChord } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../browser/services/codeEditorService.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { PeekContext } from '../../../peekView/browser/peekView.js';
import { getOuterEditor } from '../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import * as nls from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementCanExpand } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { OneReference } from '../referencesModel.js';
import { LayoutData, ReferenceWidget } from './referencesWidget.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
export const ctxReferenceSearchVisible = new RawContextKey('referenceSearchVisible', false, nls.localize('referenceSearchVisible', "Whether reference peek is visible, like 'Peek References' or 'Peek Definition'"));
let ReferencesController = class ReferencesController {
    static { ReferencesController_1 = this; }
    static { this.ID = 'editor.contrib.referencesController'; }
    static get(editor) {
        return editor.getContribution(ReferencesController_1.ID);
    }
    constructor(_defaultTreeKeyboardSupport, _editor, contextKeyService, _editorService, _notificationService, _instantiationService, _storageService, _configurationService) {
        this._defaultTreeKeyboardSupport = _defaultTreeKeyboardSupport;
        this._editor = _editor;
        this._editorService = _editorService;
        this._notificationService = _notificationService;
        this._instantiationService = _instantiationService;
        this._storageService = _storageService;
        this._configurationService = _configurationService;
        this._disposables = new DisposableStore();
        this._requestIdPool = 0;
        this._ignoreModelChangeEvent = false;
        this._referenceSearchVisible = ctxReferenceSearchVisible.bindTo(contextKeyService);
    }
    dispose() {
        this._referenceSearchVisible.reset();
        this._disposables.dispose();
        this._widget?.dispose();
        this._model?.dispose();
        this._widget = undefined;
        this._model = undefined;
    }
    toggleWidget(range, modelPromise, peekMode) {
        // close current widget and return early is position didn't change
        let widgetPosition;
        if (this._widget) {
            widgetPosition = this._widget.position;
        }
        this.closeWidget();
        if (!!widgetPosition && range.containsPosition(widgetPosition)) {
            return;
        }
        this._peekMode = peekMode;
        this._referenceSearchVisible.set(true);
        // close the widget on model/mode changes
        this._disposables.add(this._editor.onDidChangeModelLanguage(() => { this.closeWidget(); }));
        this._disposables.add(this._editor.onDidChangeModel(() => {
            if (!this._ignoreModelChangeEvent) {
                this.closeWidget();
            }
        }));
        const storageKey = 'peekViewLayout';
        const data = LayoutData.fromJSON(this._storageService.get(storageKey, 0 /* StorageScope.PROFILE */, '{}'));
        this._widget = this._instantiationService.createInstance(ReferenceWidget, this._editor, this._defaultTreeKeyboardSupport, data);
        this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
        this._widget.show(range);
        this._disposables.add(this._widget.onDidClose(() => {
            modelPromise.cancel();
            if (this._widget) {
                this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
                if (!this._widget.isClosing) {
                    // to prevent calling this too many times, check whether it was already closing.
                    this.closeWidget();
                }
                this._widget = undefined;
            }
            else {
                this.closeWidget();
            }
        }));
        this._disposables.add(this._widget.onDidSelectReference(event => {
            const { element, kind } = event;
            if (!element) {
                return;
            }
            switch (kind) {
                case 'open':
                    if (event.source !== 'editor' || !this._configurationService.getValue('editor.stablePeek')) {
                        // when stable peek is configured we don't close
                        // the peek window on selecting the editor
                        this.openReference(element, false, false);
                    }
                    break;
                case 'side':
                    this.openReference(element, true, false);
                    break;
                case 'goto':
                    if (peekMode) {
                        this._gotoReference(element, true);
                    }
                    else {
                        this.openReference(element, false, true);
                    }
                    break;
            }
        }));
        const requestId = ++this._requestIdPool;
        modelPromise.then(model => {
            // still current request? widget still open?
            if (requestId !== this._requestIdPool || !this._widget) {
                model.dispose();
                return undefined;
            }
            this._model?.dispose();
            this._model = model;
            // show widget
            return this._widget.setModel(this._model).then(() => {
                if (this._widget && this._model && this._editor.hasModel()) { // might have been closed
                    // set title
                    if (!this._model.isEmpty) {
                        this._widget.setMetaTitle(nls.localize('metaTitle.N', "{0} ({1})", this._model.title, this._model.references.length));
                    }
                    else {
                        this._widget.setMetaTitle('');
                    }
                    // set 'best' selection
                    const uri = this._editor.getModel().uri;
                    const pos = new Position(range.startLineNumber, range.startColumn);
                    const selection = this._model.nearestReference(uri, pos);
                    if (selection) {
                        return this._widget.setSelection(selection).then(() => {
                            if (this._widget && this._editor.getOption(99 /* EditorOption.peekWidgetDefaultFocus */) === 'editor') {
                                this._widget.focusOnPreviewEditor();
                            }
                        });
                    }
                }
                return undefined;
            });
        }, error => {
            this._notificationService.error(error);
        });
    }
    changeFocusBetweenPreviewAndReferences() {
        if (!this._widget) {
            // can be called while still resolving...
            return;
        }
        if (this._widget.isPreviewEditorFocused()) {
            this._widget.focusOnReferenceTree();
        }
        else {
            this._widget.focusOnPreviewEditor();
        }
    }
    async goToNextOrPreviousReference(fwd) {
        if (!this._editor.hasModel() || !this._model || !this._widget) {
            // can be called while still resolving...
            return;
        }
        const currentPosition = this._widget.position;
        if (!currentPosition) {
            return;
        }
        const source = this._model.nearestReference(this._editor.getModel().uri, currentPosition);
        if (!source) {
            return;
        }
        const target = this._model.nextOrPreviousReference(source, fwd);
        const editorFocus = this._editor.hasTextFocus();
        const previewEditorFocus = this._widget.isPreviewEditorFocused();
        await this._widget.setSelection(target);
        await this._gotoReference(target, false);
        if (editorFocus) {
            this._editor.focus();
        }
        else if (this._widget && previewEditorFocus) {
            this._widget.focusOnPreviewEditor();
        }
    }
    async revealReference(reference) {
        if (!this._editor.hasModel() || !this._model || !this._widget) {
            // can be called while still resolving...
            return;
        }
        await this._widget.revealReference(reference);
    }
    closeWidget(focusEditor = true) {
        this._widget?.dispose();
        this._model?.dispose();
        this._referenceSearchVisible.reset();
        this._disposables.clear();
        this._widget = undefined;
        this._model = undefined;
        if (focusEditor) {
            this._editor.focus();
        }
        this._requestIdPool += 1; // Cancel pending requests
    }
    _gotoReference(ref, pinned) {
        this._widget?.hide();
        this._ignoreModelChangeEvent = true;
        const range = Range.lift(ref.range).collapseToStart();
        return this._editorService.openCodeEditor({
            resource: ref.uri,
            options: { selection: range, selectionSource: "code.jump" /* TextEditorSelectionSource.JUMP */, pinned }
        }, this._editor).then(openedEditor => {
            this._ignoreModelChangeEvent = false;
            if (!openedEditor || !this._widget) {
                // something went wrong...
                this.closeWidget();
                return;
            }
            if (this._editor === openedEditor) {
                //
                this._widget.show(range);
                this._widget.focusOnReferenceTree();
            }
            else {
                // we opened a different editor instance which means a different controller instance.
                // therefore we stop with this controller and continue with the other
                const other = ReferencesController_1.get(openedEditor);
                const model = this._model.clone();
                this.closeWidget();
                openedEditor.focus();
                other?.toggleWidget(range, createCancelablePromise(_ => Promise.resolve(model)), this._peekMode ?? false);
            }
        }, (err) => {
            this._ignoreModelChangeEvent = false;
            onUnexpectedError(err);
        });
    }
    openReference(ref, sideBySide, pinned) {
        // clear stage
        if (!sideBySide) {
            this.closeWidget();
        }
        const { uri, range } = ref;
        this._editorService.openCodeEditor({
            resource: uri,
            options: { selection: range, selectionSource: "code.jump" /* TextEditorSelectionSource.JUMP */, pinned }
        }, this._editor, sideBySide);
    }
};
ReferencesController = ReferencesController_1 = __decorate([
    __param(2, IContextKeyService),
    __param(3, ICodeEditorService),
    __param(4, INotificationService),
    __param(5, IInstantiationService),
    __param(6, IStorageService),
    __param(7, IConfigurationService)
], ReferencesController);
export { ReferencesController };
function withController(accessor, fn) {
    const outerEditor = getOuterEditor(accessor);
    if (!outerEditor) {
        return;
    }
    const controller = ReferencesController.get(outerEditor);
    if (controller) {
        fn(controller);
    }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'togglePeekWidgetFocus',
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 60 /* KeyCode.F2 */),
    when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
    handler(accessor) {
        withController(accessor, controller => {
            controller.changeFocusBetweenPreviewAndReferences();
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'goToNextReference',
    weight: 100 /* KeybindingWeight.EditorContrib */ - 10,
    primary: 62 /* KeyCode.F4 */,
    secondary: [70 /* KeyCode.F12 */],
    when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
    handler(accessor) {
        withController(accessor, controller => {
            controller.goToNextOrPreviousReference(true);
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'goToPreviousReference',
    weight: 100 /* KeybindingWeight.EditorContrib */ - 10,
    primary: 1024 /* KeyMod.Shift */ | 62 /* KeyCode.F4 */,
    secondary: [1024 /* KeyMod.Shift */ | 70 /* KeyCode.F12 */],
    when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
    handler(accessor) {
        withController(accessor, controller => {
            controller.goToNextOrPreviousReference(false);
        });
    }
});
// commands that aren't needed anymore because there is now ContextKeyExpr.OR
CommandsRegistry.registerCommandAlias('goToNextReferenceFromEmbeddedEditor', 'goToNextReference');
CommandsRegistry.registerCommandAlias('goToPreviousReferenceFromEmbeddedEditor', 'goToPreviousReference');
// close
CommandsRegistry.registerCommandAlias('closeReferenceSearchEditor', 'closeReferenceSearch');
CommandsRegistry.registerCommand('closeReferenceSearch', accessor => withController(accessor, controller => controller.closeWidget()));
KeybindingsRegistry.registerKeybindingRule({
    id: 'closeReferenceSearch',
    weight: 100 /* KeybindingWeight.EditorContrib */ - 101,
    primary: 9 /* KeyCode.Escape */,
    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
    when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not('config.editor.stablePeek'))
});
KeybindingsRegistry.registerKeybindingRule({
    id: 'closeReferenceSearch',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    primary: 9 /* KeyCode.Escape */,
    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
    when: ContextKeyExpr.and(ctxReferenceSearchVisible, ContextKeyExpr.not('config.editor.stablePeek'), ContextKeyExpr.or(EditorContextKeys.editorTextFocus, InputFocusedContext.negate()))
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'revealReference',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 3 /* KeyCode.Enter */,
    mac: {
        primary: 3 /* KeyCode.Enter */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */]
    },
    when: ContextKeyExpr.and(ctxReferenceSearchVisible, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse.negate(), WorkbenchTreeElementCanExpand.negate()),
    handler(accessor) {
        const listService = accessor.get(IListService);
        const focus = listService.lastFocusedList?.getFocus();
        if (Array.isArray(focus) && focus[0] instanceof OneReference) {
            withController(accessor, controller => controller.revealReference(focus[0]));
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'openReferenceToSide',
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
    mac: {
        primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */
    },
    when: ContextKeyExpr.and(ctxReferenceSearchVisible, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse.negate(), WorkbenchTreeElementCanExpand.negate()),
    handler(accessor) {
        const listService = accessor.get(IListService);
        const focus = listService.lastFocusedList?.getFocus();
        if (Array.isArray(focus) && focus[0] instanceof OneReference) {
            withController(accessor, controller => controller.openReference(focus[0], true, true));
        }
    }
});
CommandsRegistry.registerCommand('openReference', (accessor) => {
    const listService = accessor.get(IListService);
    const focus = listService.lastFocusedList?.getFocus();
    if (Array.isArray(focus) && focus[0] instanceof OneReference) {
        withController(accessor, controller => controller.openReference(focus[0], false, true));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlc0NvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvcGVlay9yZWZlcmVuY2VzQ29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0sd0NBQXdDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXZGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHekQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNuRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBQzdDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFekksT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxtQkFBbUIsRUFBb0IsTUFBTSxrRUFB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