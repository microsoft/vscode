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
import { addDisposableListener, onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { EditorAction, registerDiffEditorContribution, registerEditorAction, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { findDiffEditorContainingCodeEditor } from '../../../../editor/browser/widget/diffEditor/commands.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
const transientWordWrapState = 'transientWordWrapState';
const isWordWrapMinifiedKey = 'isWordWrapMinified';
const isDominatedByLongLinesKey = 'isDominatedByLongLines';
const CAN_TOGGLE_WORD_WRAP = new RawContextKey('canToggleWordWrap', false, true);
const EDITOR_WORD_WRAP = new RawContextKey('editorWordWrap', false, nls.localize('editorWordWrap', 'Whether the editor is currently using word wrapping.'));
/**
 * Store (in memory) the word wrap state for a particular model.
 */
export function writeTransientState(model, state, codeEditorService) {
    codeEditorService.setTransientModelProperty(model, transientWordWrapState, state);
}
/**
 * Read (in memory) the word wrap state for a particular model.
 */
export function readTransientState(model, codeEditorService) {
    return codeEditorService.getTransientModelProperty(model, transientWordWrapState);
}
const TOGGLE_WORD_WRAP_ID = 'editor.action.toggleWordWrap';
class ToggleWordWrapAction extends EditorAction {
    constructor() {
        super({
            id: TOGGLE_WORD_WRAP_ID,
            label: nls.localize2('toggle.wordwrap', "View: Toggle Word Wrap"),
            precondition: undefined,
            kbOpts: {
                kbExpr: null,
                primary: 512 /* KeyMod.Alt */ | 56 /* KeyCode.KeyZ */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const instaService = accessor.get(IInstantiationService);
        if (!canToggleWordWrap(codeEditorService, editor)) {
            return;
        }
        const model = editor.getModel();
        // Read the current state
        const transientState = readTransientState(model, codeEditorService);
        // Compute the new state
        let newState;
        if (transientState) {
            newState = null;
        }
        else {
            const actualWrappingInfo = editor.getOption(166 /* EditorOption.wrappingInfo */);
            const wordWrapOverride = (actualWrappingInfo.wrappingColumn === -1 ? 'on' : 'off');
            newState = { wordWrapOverride };
        }
        // Write the new state
        // (this will cause an event and the controller will apply the state)
        writeTransientState(model, newState, codeEditorService);
        // if we are in a diff editor, update the other editor (if possible)
        const diffEditor = instaService.invokeFunction(findDiffEditorContainingCodeEditor, editor);
        if (diffEditor) {
            const originalEditor = diffEditor.getOriginalEditor();
            const modifiedEditor = diffEditor.getModifiedEditor();
            const otherEditor = (originalEditor === editor ? modifiedEditor : originalEditor);
            if (canToggleWordWrap(codeEditorService, otherEditor)) {
                writeTransientState(otherEditor.getModel(), newState, codeEditorService);
                diffEditor.updateOptions({});
            }
        }
    }
}
let ToggleWordWrapController = class ToggleWordWrapController extends Disposable {
    static { this.ID = 'editor.contrib.toggleWordWrapController'; }
    constructor(_editor, _contextKeyService, _codeEditorService) {
        super();
        this._editor = _editor;
        this._contextKeyService = _contextKeyService;
        this._codeEditorService = _codeEditorService;
        const options = this._editor.getOptions();
        const wrappingInfo = options.get(166 /* EditorOption.wrappingInfo */);
        const isWordWrapMinified = this._contextKeyService.createKey(isWordWrapMinifiedKey, wrappingInfo.isWordWrapMinified);
        const isDominatedByLongLines = this._contextKeyService.createKey(isDominatedByLongLinesKey, wrappingInfo.isDominatedByLongLines);
        let currentlyApplyingEditorConfig = false;
        this._register(_editor.onDidChangeConfiguration((e) => {
            if (!e.hasChanged(166 /* EditorOption.wrappingInfo */)) {
                return;
            }
            const options = this._editor.getOptions();
            const wrappingInfo = options.get(166 /* EditorOption.wrappingInfo */);
            isWordWrapMinified.set(wrappingInfo.isWordWrapMinified);
            isDominatedByLongLines.set(wrappingInfo.isDominatedByLongLines);
            if (!currentlyApplyingEditorConfig) {
                // I am not the cause of the word wrap getting changed
                ensureWordWrapSettings();
            }
        }));
        this._register(_editor.onDidChangeModel((e) => {
            ensureWordWrapSettings();
        }));
        this._register(_codeEditorService.onDidChangeTransientModelProperty(() => {
            ensureWordWrapSettings();
        }));
        const ensureWordWrapSettings = () => {
            if (!canToggleWordWrap(this._codeEditorService, this._editor)) {
                return;
            }
            const transientState = readTransientState(this._editor.getModel(), this._codeEditorService);
            // Apply the state
            try {
                currentlyApplyingEditorConfig = true;
                this._applyWordWrapState(transientState);
            }
            finally {
                currentlyApplyingEditorConfig = false;
            }
        };
    }
    _applyWordWrapState(state) {
        const wordWrapOverride2 = state ? state.wordWrapOverride : 'inherit';
        this._editor.updateOptions({
            wordWrapOverride2: wordWrapOverride2
        });
    }
};
ToggleWordWrapController = __decorate([
    __param(1, IContextKeyService),
    __param(2, ICodeEditorService)
], ToggleWordWrapController);
let DiffToggleWordWrapController = class DiffToggleWordWrapController extends Disposable {
    static { this.ID = 'diffeditor.contrib.toggleWordWrapController'; }
    constructor(_diffEditor, _codeEditorService) {
        super();
        this._diffEditor = _diffEditor;
        this._codeEditorService = _codeEditorService;
        this._register(this._diffEditor.onDidChangeModel(() => {
            this._ensureSyncedWordWrapToggle();
        }));
    }
    _ensureSyncedWordWrapToggle() {
        const originalEditor = this._diffEditor.getOriginalEditor();
        const modifiedEditor = this._diffEditor.getModifiedEditor();
        if (!originalEditor.hasModel() || !modifiedEditor.hasModel()) {
            return;
        }
        const originalTransientState = readTransientState(originalEditor.getModel(), this._codeEditorService);
        const modifiedTransientState = readTransientState(modifiedEditor.getModel(), this._codeEditorService);
        if (originalTransientState && !modifiedTransientState && canToggleWordWrap(this._codeEditorService, originalEditor)) {
            writeTransientState(modifiedEditor.getModel(), originalTransientState, this._codeEditorService);
            this._diffEditor.updateOptions({});
        }
        if (!originalTransientState && modifiedTransientState && canToggleWordWrap(this._codeEditorService, modifiedEditor)) {
            writeTransientState(originalEditor.getModel(), modifiedTransientState, this._codeEditorService);
            this._diffEditor.updateOptions({});
        }
    }
};
DiffToggleWordWrapController = __decorate([
    __param(1, ICodeEditorService)
], DiffToggleWordWrapController);
function canToggleWordWrap(codeEditorService, editor) {
    if (!editor) {
        return false;
    }
    if (editor.isSimpleWidget) {
        // in a simple widget...
        return false;
    }
    // Ensure correct word wrap settings
    const model = editor.getModel();
    if (!model) {
        return false;
    }
    if (editor.getOption(70 /* EditorOption.inDiffEditor */)) {
        // this editor belongs to a diff editor
        for (const diffEditor of codeEditorService.listDiffEditors()) {
            if (diffEditor.getOriginalEditor() === editor && !diffEditor.renderSideBySide) {
                // this editor is the left side of an inline diff editor
                return false;
            }
        }
    }
    return true;
}
let EditorWordWrapContextKeyTracker = class EditorWordWrapContextKeyTracker extends Disposable {
    static { this.ID = 'workbench.contrib.editorWordWrapContextKeyTracker'; }
    constructor(_editorService, _codeEditorService, _contextService) {
        super();
        this._editorService = _editorService;
        this._codeEditorService = _codeEditorService;
        this._contextService = _contextService;
        this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
            disposables.add(addDisposableListener(window, 'focus', () => this._update(), true));
            disposables.add(addDisposableListener(window, 'blur', () => this._update(), true));
        }, { window: mainWindow, disposables: this._store }));
        this._register(this._editorService.onDidActiveEditorChange(() => this._update()));
        this._canToggleWordWrap = CAN_TOGGLE_WORD_WRAP.bindTo(this._contextService);
        this._editorWordWrap = EDITOR_WORD_WRAP.bindTo(this._contextService);
        this._activeEditor = null;
        this._activeEditorListener = this._register(new DisposableStore());
        this._update();
    }
    _update() {
        const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
        if (this._activeEditor === activeEditor) {
            // no change
            return;
        }
        this._activeEditorListener.clear();
        this._activeEditor = activeEditor;
        if (activeEditor) {
            this._activeEditorListener.add(activeEditor.onDidChangeModel(() => this._updateFromCodeEditor()));
            this._activeEditorListener.add(activeEditor.onDidChangeConfiguration((e) => {
                if (e.hasChanged(166 /* EditorOption.wrappingInfo */)) {
                    this._updateFromCodeEditor();
                }
            }));
            this._updateFromCodeEditor();
        }
    }
    _updateFromCodeEditor() {
        if (!canToggleWordWrap(this._codeEditorService, this._activeEditor)) {
            return this._setValues(false, false);
        }
        else {
            const wrappingInfo = this._activeEditor.getOption(166 /* EditorOption.wrappingInfo */);
            this._setValues(true, wrappingInfo.wrappingColumn !== -1);
        }
    }
    _setValues(canToggleWordWrap, isWordWrap) {
        this._canToggleWordWrap.set(canToggleWordWrap);
        this._editorWordWrap.set(isWordWrap);
    }
};
EditorWordWrapContextKeyTracker = __decorate([
    __param(0, IEditorService),
    __param(1, ICodeEditorService),
    __param(2, IContextKeyService)
], EditorWordWrapContextKeyTracker);
registerWorkbenchContribution2(EditorWordWrapContextKeyTracker.ID, EditorWordWrapContextKeyTracker, 3 /* WorkbenchPhase.AfterRestored */);
registerEditorContribution(ToggleWordWrapController.ID, ToggleWordWrapController, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to change the editor word wrap configuration
registerDiffEditorContribution(DiffToggleWordWrapController.ID, DiffToggleWordWrapController);
registerEditorAction(ToggleWordWrapAction);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: TOGGLE_WORD_WRAP_ID,
        title: nls.localize('unwrapMinified', "Disable wrapping for this file"),
        icon: Codicon.wordWrap
    },
    group: 'navigation',
    order: 1,
    when: ContextKeyExpr.and(ContextKeyExpr.has(isDominatedByLongLinesKey), ContextKeyExpr.has(isWordWrapMinifiedKey))
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: TOGGLE_WORD_WRAP_ID,
        title: nls.localize('wrapMinified', "Enable wrapping for this file"),
        icon: Codicon.wordWrap
    },
    group: 'navigation',
    order: 1,
    when: ContextKeyExpr.and(EditorContextKeys.inDiffEditor.negate(), ContextKeyExpr.has(isDominatedByLongLinesKey), ContextKeyExpr.not(isWordWrapMinifiedKey))
});
// View menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
    command: {
        id: TOGGLE_WORD_WRAP_ID,
        title: nls.localize({ key: 'miToggleWordWrap', comment: ['&& denotes a mnemonic'] }, "&&Word Wrap"),
        toggled: EDITOR_WORD_WRAP,
        precondition: CAN_TOGGLE_WORD_WRAP
    },
    order: 1,
    group: '6_editor'
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlV29yZFdyYXAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2Jyb3dzZXIvdG9nZ2xlV29yZFdyYXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVuRixPQUFPLEVBQUUsWUFBWSxFQUFxRCw4QkFBOEIsRUFBRSxvQkFBb0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25OLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRW5GLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBMEMsOEJBQThCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsTUFBTSxzQkFBc0IsR0FBRyx3QkFBd0IsQ0FBQztBQUN4RCxNQUFNLHFCQUFxQixHQUFHLG9CQUFvQixDQUFDO0FBQ25ELE1BQU0seUJBQXlCLEdBQUcsd0JBQXdCLENBQUM7QUFDM0QsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDMUYsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxzREFBc0QsQ0FBQyxDQUFDLENBQUM7QUFTcks7O0dBRUc7QUFDSCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsS0FBaUIsRUFBRSxLQUFxQyxFQUFFLGlCQUFxQztJQUNsSSxpQkFBaUIsQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbkYsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEtBQWlCLEVBQUUsaUJBQXFDO0lBQzFGLE9BQU8saUJBQWlCLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLHNCQUFzQixDQUFtQyxDQUFDO0FBQ3JILENBQUM7QUFFRCxNQUFNLG1CQUFtQixHQUFHLDhCQUE4QixDQUFDO0FBQzNELE1BQU0sb0JBQXFCLFNBQVEsWUFBWTtJQUU5QztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxtQkFBbUI7WUFDdkIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsd0JBQXdCLENBQUM7WUFDakUsWUFBWSxFQUFFLFNBQVM7WUFDdkIsTUFBTSxFQUFFO2dCQUNQLE1BQU0sRUFBRSxJQUFJO2dCQUNaLE9BQU8sRUFBRSw0Q0FBeUI7Z0JBQ2xDLE1BQU0sMENBQWdDO2FBQ3RDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVNLEdBQUcsQ0FBQyxRQUEwQixFQUFFLE1BQW1CO1FBQ3pELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUV6RCxJQUFJLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNuRCxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVoQyx5QkFBeUI7UUFDekIsTUFBTSxjQUFjLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFFcEUsd0JBQXdCO1FBQ3hCLElBQUksUUFBd0MsQ0FBQztRQUM3QyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDakIsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxTQUFTLHFDQUEyQixDQUFDO1lBQ3ZFLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkYsUUFBUSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztRQUNqQyxDQUFDO1FBRUQsc0JBQXNCO1FBQ3RCLHFFQUFxRTtRQUNyRSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFFeEQsb0VBQW9FO1FBQ3BFLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDM0YsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN0RCxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN0RCxNQUFNLFdBQVcsR0FBRyxDQUFDLGNBQWMsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDbEYsSUFBSSxpQkFBaUIsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDO2dCQUN2RCxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixDQUFDLENBQUM7Z0JBQ3pFLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF5QixTQUFRLFVBQVU7YUFFekIsT0FBRSxHQUFHLHlDQUF5QyxBQUE1QyxDQUE2QztJQUV0RSxZQUNrQixPQUFvQixFQUNBLGtCQUFzQyxFQUN0QyxrQkFBc0M7UUFFM0UsS0FBSyxFQUFFLENBQUM7UUFKUyxZQUFPLEdBQVAsT0FBTyxDQUFhO1FBQ0EsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0Qyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBSTNFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDMUMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcscUNBQTJCLENBQUM7UUFDNUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLHFCQUFxQixFQUFFLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JILE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSxZQUFZLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNqSSxJQUFJLDZCQUE2QixHQUFHLEtBQUssQ0FBQztRQUUxQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3JELElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxxQ0FBMkIsRUFBRSxDQUFDO2dCQUM5QyxPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDMUMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcscUNBQTJCLENBQUM7WUFDNUQsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3hELHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNoRSxJQUFJLENBQUMsNkJBQTZCLEVBQUUsQ0FBQztnQkFDcEMsc0RBQXNEO2dCQUN0RCxzQkFBc0IsRUFBRSxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUM3QyxzQkFBc0IsRUFBRSxDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLGlDQUFpQyxDQUFDLEdBQUcsRUFBRTtZQUN4RSxzQkFBc0IsRUFBRSxDQUFDO1FBQzFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLHNCQUFzQixHQUFHLEdBQUcsRUFBRTtZQUNuQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFNUYsa0JBQWtCO1lBQ2xCLElBQUksQ0FBQztnQkFDSiw2QkFBNkIsR0FBRyxJQUFJLENBQUM7Z0JBQ3JDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMxQyxDQUFDO29CQUFTLENBQUM7Z0JBQ1YsNkJBQTZCLEdBQUcsS0FBSyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDLENBQUM7SUFDSCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsS0FBcUM7UUFDaEUsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDO1lBQzFCLGlCQUFpQixFQUFFLGlCQUFpQjtTQUNwQyxDQUFDLENBQUM7SUFDSixDQUFDOztBQTdESSx3QkFBd0I7SUFNM0IsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGtCQUFrQixDQUFBO0dBUGYsd0JBQXdCLENBOEQ3QjtBQUVELElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTthQUU3QixPQUFFLEdBQUcsNkNBQTZDLEFBQWhELENBQWlEO0lBRTFFLFlBQ2tCLFdBQXdCLEVBQ0osa0JBQXNDO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBSFMsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFDSix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBSTNFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUU7WUFDckQsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTywyQkFBMkI7UUFDbEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUU1RCxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDOUQsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLHNCQUFzQixHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN0RyxNQUFNLHNCQUFzQixHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUV0RyxJQUFJLHNCQUFzQixJQUFJLENBQUMsc0JBQXNCLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDckgsbUJBQW1CLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxFQUFFLHNCQUFzQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2hHLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFDRCxJQUFJLENBQUMsc0JBQXNCLElBQUksc0JBQXNCLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDckgsbUJBQW1CLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxFQUFFLHNCQUFzQixFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2hHLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDOztBQWxDSSw0QkFBNEI7SUFNL0IsV0FBQSxrQkFBa0IsQ0FBQTtHQU5mLDRCQUE0QixDQW1DakM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLGlCQUFxQyxFQUFFLE1BQTBCO0lBQzNGLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNiLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzNCLHdCQUF3QjtRQUN4QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxvQ0FBb0M7SUFDcEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2hDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNaLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELElBQUksTUFBTSxDQUFDLFNBQVMsb0NBQTJCLEVBQUUsQ0FBQztRQUNqRCx1Q0FBdUM7UUFDdkMsS0FBSyxNQUFNLFVBQVUsSUFBSSxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDO1lBQzlELElBQUksVUFBVSxDQUFDLGlCQUFpQixFQUFFLEtBQUssTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQy9FLHdEQUF3RDtnQkFDeEQsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7YUFFdkMsT0FBRSxHQUFHLG1EQUFtRCxBQUF0RCxDQUF1RDtJQU96RSxZQUNrQyxjQUE4QixFQUMxQixrQkFBc0MsRUFDdEMsZUFBbUM7UUFFeEUsS0FBSyxFQUFFLENBQUM7UUFKeUIsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQzFCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdEMsb0JBQWUsR0FBZixlQUFlLENBQW9CO1FBR3hFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUU7WUFDckYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3BGLFdBQVcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNwRixDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxlQUFlLEdBQUcsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztRQUMxQixJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFFTyxPQUFPO1FBQ2QsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDckgsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQ3pDLFlBQVk7WUFDWixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztRQUVsQyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNsRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUMxRSxJQUFJLENBQUMsQ0FBQyxVQUFVLHFDQUEyQixFQUFFLENBQUM7b0JBQzdDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUM5QixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBRU8scUJBQXFCO1FBQzVCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDckUsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxxQ0FBMkIsQ0FBQztZQUM3RSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsY0FBYyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNGLENBQUM7SUFFTyxVQUFVLENBQUMsaUJBQTBCLEVBQUUsVUFBbUI7UUFDakUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7O0FBM0RJLCtCQUErQjtJQVVsQyxXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxrQkFBa0IsQ0FBQTtHQVpmLCtCQUErQixDQTREcEM7QUFFRCw4QkFBOEIsQ0FBQywrQkFBK0IsQ0FBQyxFQUFFLEVBQUUsK0JBQStCLHVDQUErQixDQUFDO0FBRWxJLDBCQUEwQixDQUFDLHdCQUF3QixDQUFDLEVBQUUsRUFBRSx3QkFBd0IsZ0RBQXdDLENBQUMsQ0FBQyxzRUFBc0U7QUFDaE0sOEJBQThCLENBQUMsNEJBQTRCLENBQUMsRUFBRSxFQUFFLDRCQUE0QixDQUFDLENBQUM7QUFDOUYsb0JBQW9CLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUUzQyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7SUFDL0MsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLG1CQUFtQjtRQUN2QixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxnQ0FBZ0MsQ0FBQztRQUN2RSxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7S0FDdEI7SUFDRCxLQUFLLEVBQUUsWUFBWTtJQUNuQixLQUFLLEVBQUUsQ0FBQztJQUNSLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUN2QixjQUFjLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLEVBQzdDLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FDekM7Q0FDRCxDQUFDLENBQUM7QUFDSCxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7SUFDL0MsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLG1CQUFtQjtRQUN2QixLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsK0JBQStCLENBQUM7UUFDcEUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxRQUFRO0tBQ3RCO0lBQ0QsS0FBSyxFQUFFLFlBQVk7SUFDbkIsS0FBSyxFQUFFLENBQUM7SUFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FDdkIsaUJBQWlCLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxFQUN2QyxjQUFjLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLEVBQzdDLGNBQWMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FDekM7Q0FDRCxDQUFDLENBQUM7QUFHSCxZQUFZO0FBQ1osWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFO0lBQ25ELE9BQU8sRUFBRTtRQUNSLEVBQUUsRUFBRSxtQkFBbUI7UUFDdkIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLGFBQWEsQ0FBQztRQUNuRyxPQUFPLEVBQUUsZ0JBQWdCO1FBQ3pCLFlBQVksRUFBRSxvQkFBb0I7S0FDbEM7SUFDRCxLQUFLLEVBQUUsQ0FBQztJQUNSLEtBQUssRUFBRSxVQUFVO0NBQ2pCLENBQUMsQ0FBQyJ9