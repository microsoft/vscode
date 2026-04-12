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
import { Emitter } from '../../../../base/common/event.js';
import { combinedDisposable, DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { EditorCommand, registerEditorCommand } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Range } from '../../../common/core/range.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
export const ctxHasSymbols = new RawContextKey('hasSymbols', false, localize('hasSymbols', "Whether there are symbol locations that can be navigated via keyboard-only."));
export const ISymbolNavigationService = createDecorator('ISymbolNavigationService');
let SymbolNavigationService = class SymbolNavigationService {
    constructor(contextKeyService, _editorService, _notificationService, _keybindingService) {
        this._editorService = _editorService;
        this._notificationService = _notificationService;
        this._keybindingService = _keybindingService;
        this._currentModel = undefined;
        this._currentIdx = -1;
        this._ignoreEditorChange = false;
        this._ctxHasSymbols = ctxHasSymbols.bindTo(contextKeyService);
    }
    reset() {
        this._ctxHasSymbols.reset();
        this._currentState?.dispose();
        this._currentMessage?.close();
        this._currentModel = undefined;
        this._currentIdx = -1;
    }
    put(anchor) {
        const refModel = anchor.parent.parent;
        if (refModel.references.length <= 1) {
            this.reset();
            return;
        }
        this._currentModel = refModel;
        this._currentIdx = refModel.references.indexOf(anchor);
        this._ctxHasSymbols.set(true);
        this._showMessage();
        const editorState = new EditorState(this._editorService);
        const listener = editorState.onDidChange(_ => {
            if (this._ignoreEditorChange) {
                return;
            }
            const editor = this._editorService.getActiveCodeEditor();
            if (!editor) {
                return;
            }
            const model = editor.getModel();
            const position = editor.getPosition();
            if (!model || !position) {
                return;
            }
            let seenUri = false;
            let seenPosition = false;
            for (const reference of refModel.references) {
                if (isEqual(reference.uri, model.uri)) {
                    seenUri = true;
                    seenPosition = seenPosition || Range.containsPosition(reference.range, position);
                }
                else if (seenUri) {
                    break;
                }
            }
            if (!seenUri || !seenPosition) {
                this.reset();
            }
        });
        this._currentState = combinedDisposable(editorState, listener);
    }
    revealNext(source) {
        if (!this._currentModel) {
            return Promise.resolve();
        }
        // get next result and advance
        this._currentIdx += 1;
        this._currentIdx %= this._currentModel.references.length;
        const reference = this._currentModel.references[this._currentIdx];
        // status
        this._showMessage();
        // open editor, ignore events while that happens
        this._ignoreEditorChange = true;
        return this._editorService.openCodeEditor({
            resource: reference.uri,
            options: {
                selection: Range.collapseToStart(reference.range),
                selectionRevealType: 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */
            }
        }, source).finally(() => {
            this._ignoreEditorChange = false;
        });
    }
    _showMessage() {
        this._currentMessage?.close();
        const kb = this._keybindingService.lookupKeybinding('editor.gotoNextSymbolFromResult');
        const message = kb
            ? localize('location.kb', "Symbol {0} of {1}, {2} for next", this._currentIdx + 1, this._currentModel.references.length, kb.getLabel())
            : localize('location', "Symbol {0} of {1}", this._currentIdx + 1, this._currentModel.references.length);
        this._currentMessage = this._notificationService.status(message);
    }
};
SymbolNavigationService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ICodeEditorService),
    __param(2, INotificationService),
    __param(3, IKeybindingService)
], SymbolNavigationService);
registerSingleton(ISymbolNavigationService, SymbolNavigationService, 1 /* InstantiationType.Delayed */);
registerEditorCommand(new class extends EditorCommand {
    constructor() {
        super({
            id: 'editor.gotoNextSymbolFromResult',
            precondition: ctxHasSymbols,
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 70 /* KeyCode.F12 */
            }
        });
    }
    runEditorCommand(accessor, editor) {
        return accessor.get(ISymbolNavigationService).revealNext(editor);
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'editor.gotoNextSymbolFromResult.cancel',
    weight: 100 /* KeybindingWeight.EditorContrib */,
    when: ctxHasSymbols,
    primary: 9 /* KeyCode.Escape */,
    handler(accessor) {
        accessor.get(ISymbolNavigationService).reset();
    }
});
//
let EditorState = class EditorState {
    constructor(editorService) {
        this._listener = new Map();
        this._disposables = new DisposableStore();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._disposables.add(editorService.onCodeEditorRemove(this._onDidRemoveEditor, this));
        this._disposables.add(editorService.onCodeEditorAdd(this._onDidAddEditor, this));
        editorService.listCodeEditors().forEach(this._onDidAddEditor, this);
    }
    dispose() {
        this._disposables.dispose();
        this._onDidChange.dispose();
        dispose(this._listener.values());
    }
    _onDidAddEditor(editor) {
        this._listener.set(editor, combinedDisposable(editor.onDidChangeCursorPosition(_ => this._onDidChange.fire({ editor })), editor.onDidChangeModelContent(_ => this._onDidChange.fire({ editor }))));
    }
    _onDidRemoveEditor(editor) {
        this._listener.get(editor)?.dispose();
        this._listener.delete(editor);
    }
};
EditorState = __decorate([
    __param(0, ICodeEditorService)
], EditorState);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ltYm9sTmF2aWdhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9zeW1ib2xOYXZpZ2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxvQkFBb0IsRUFBaUIsTUFBTSwwREFBMEQsQ0FBQztBQUUvRyxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxhQUFhLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxR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