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
var CallHierarchyController_1;
import { localize, localize2 } from '../../../../nls.js';
import { CallHierarchyProviderRegistry, CallHierarchyModel } from '../common/callHierarchy.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CallHierarchyTreePeekWidget } from './callHierarchyPeek.js';
import { Event } from '../../../../base/common/event.js';
import { registerEditorContribution, EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { IContextKeyService, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { PeekContext } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { isCancellationError } from '../../../../base/common/errors.js';
const _ctxHasCallHierarchyProvider = new RawContextKey('editorHasCallHierarchyProvider', false, localize('editorHasCallHierarchyProvider', 'Whether a call hierarchy provider is available'));
const _ctxCallHierarchyVisible = new RawContextKey('callHierarchyVisible', false, localize('callHierarchyVisible', 'Whether call hierarchy peek is currently showing'));
const _ctxCallHierarchyDirection = new RawContextKey('callHierarchyDirection', undefined, { type: 'string', description: localize('callHierarchyDirection', 'Whether call hierarchy shows incoming or outgoing calls') });
function sanitizedDirection(candidate) {
    return candidate === "outgoingCalls" /* CallHierarchyDirection.CallsFrom */ || candidate === "incomingCalls" /* CallHierarchyDirection.CallsTo */
        ? candidate
        : "incomingCalls" /* CallHierarchyDirection.CallsTo */;
}
let CallHierarchyController = class CallHierarchyController {
    static { CallHierarchyController_1 = this; }
    static { this.Id = 'callHierarchy'; }
    static get(editor) {
        return editor.getContribution(CallHierarchyController_1.Id);
    }
    static { this._StorageDirection = 'callHierarchy/defaultDirection'; }
    constructor(_editor, _contextKeyService, _storageService, _editorService, _instantiationService) {
        this._editor = _editor;
        this._contextKeyService = _contextKeyService;
        this._storageService = _storageService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._dispoables = new DisposableStore();
        this._sessionDisposables = new DisposableStore();
        this._ctxIsVisible = _ctxCallHierarchyVisible.bindTo(this._contextKeyService);
        this._ctxHasProvider = _ctxHasCallHierarchyProvider.bindTo(this._contextKeyService);
        this._ctxDirection = _ctxCallHierarchyDirection.bindTo(this._contextKeyService);
        this._dispoables.add(Event.any(_editor.onDidChangeModel, _editor.onDidChangeModelLanguage, CallHierarchyProviderRegistry.onDidChange)(() => {
            this._ctxHasProvider.set(_editor.hasModel() && CallHierarchyProviderRegistry.has(_editor.getModel()));
        }));
        this._dispoables.add(this._sessionDisposables);
    }
    dispose() {
        this._ctxHasProvider.reset();
        this._ctxIsVisible.reset();
        this._dispoables.dispose();
    }
    async startCallHierarchyFromEditor() {
        this._sessionDisposables.clear();
        if (!this._editor.hasModel()) {
            return;
        }
        const document = this._editor.getModel();
        const position = this._editor.getPosition();
        if (!CallHierarchyProviderRegistry.has(document)) {
            return;
        }
        const cts = new CancellationTokenSource();
        const model = CallHierarchyModel.create(document, position, cts.token);
        const direction = sanitizedDirection(this._storageService.get(CallHierarchyController_1._StorageDirection, 0 /* StorageScope.PROFILE */, "incomingCalls" /* CallHierarchyDirection.CallsTo */));
        this._showCallHierarchyWidget(position, direction, model, cts);
    }
    async startCallHierarchyFromCallHierarchy() {
        if (!this._widget) {
            return;
        }
        const model = this._widget.getModel();
        const call = this._widget.getFocused();
        if (!call || !model) {
            return;
        }
        const newEditor = await this._editorService.openCodeEditor({ resource: call.item.uri }, this._editor);
        if (!newEditor) {
            return;
        }
        const newModel = model.fork(call.item);
        this._sessionDisposables.clear();
        CallHierarchyController_1.get(newEditor)?._showCallHierarchyWidget(Range.lift(newModel.root.selectionRange).getStartPosition(), this._widget.direction, Promise.resolve(newModel), new CancellationTokenSource());
    }
    _showCallHierarchyWidget(position, direction, model, cts) {
        this._ctxIsVisible.set(true);
        this._ctxDirection.set(direction);
        Event.any(this._editor.onDidChangeModel, this._editor.onDidChangeModelLanguage)(this.endCallHierarchy, this, this._sessionDisposables);
        this._widget = this._instantiationService.createInstance(CallHierarchyTreePeekWidget, this._editor, position, direction);
        this._widget.showLoading();
        this._sessionDisposables.add(this._widget.onDidClose(() => {
            this.endCallHierarchy();
            this._storageService.store(CallHierarchyController_1._StorageDirection, this._widget.direction, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }));
        this._sessionDisposables.add({ dispose() { cts.dispose(true); } });
        this._sessionDisposables.add(this._widget);
        model.then(model => {
            if (cts.token.isCancellationRequested) {
                return; // nothing
            }
            if (model) {
                this._sessionDisposables.add(model);
                this._widget.showModel(model);
            }
            else {
                this._widget.showMessage(localize('no.item', "No results"));
            }
        }).catch(err => {
            if (isCancellationError(err)) {
                this.endCallHierarchy();
                return;
            }
            this._widget.showMessage(localize('error', "Failed to show call hierarchy"));
        });
    }
    showOutgoingCalls() {
        this._widget?.updateDirection("outgoingCalls" /* CallHierarchyDirection.CallsFrom */);
        this._ctxDirection.set("outgoingCalls" /* CallHierarchyDirection.CallsFrom */);
    }
    showIncomingCalls() {
        this._widget?.updateDirection("incomingCalls" /* CallHierarchyDirection.CallsTo */);
        this._ctxDirection.set("incomingCalls" /* CallHierarchyDirection.CallsTo */);
    }
    endCallHierarchy() {
        this._sessionDisposables.clear();
        this._ctxIsVisible.set(false);
        this._editor.focus();
    }
};
CallHierarchyController = CallHierarchyController_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IStorageService),
    __param(3, ICodeEditorService),
    __param(4, IInstantiationService)
], CallHierarchyController);
registerEditorContribution(CallHierarchyController.Id, CallHierarchyController, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to define a context key
registerAction2(class PeekCallHierarchyAction extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.showCallHierarchy',
            title: localize2('title', 'Peek Call Hierarchy'),
            menu: {
                id: MenuId.EditorContextPeek,
                group: 'navigation',
                order: 1000,
                when: ContextKeyExpr.and(_ctxHasCallHierarchyProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            },
            keybinding: {
                when: EditorContextKeys.editorTextFocus,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ + 512 /* KeyMod.Alt */ + 38 /* KeyCode.KeyH */
            },
            precondition: ContextKeyExpr.and(_ctxHasCallHierarchyProvider, PeekContext.notInPeekEditor),
            f1: true
        });
    }
    async runEditorCommand(_accessor, editor) {
        return CallHierarchyController.get(editor)?.startCallHierarchyFromEditor();
    }
});
registerAction2(class extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.showIncomingCalls',
            title: localize2('title.incoming', 'Show Incoming Calls'),
            icon: registerIcon('callhierarchy-incoming', Codicon.callIncoming, localize('showIncomingCallsIcons', 'Icon for incoming calls in the call hierarchy view.')),
            precondition: ContextKeyExpr.and(_ctxCallHierarchyVisible, _ctxCallHierarchyDirection.isEqualTo("outgoingCalls" /* CallHierarchyDirection.CallsFrom */)),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ + 512 /* KeyMod.Alt */ + 38 /* KeyCode.KeyH */,
            },
            menu: {
                id: CallHierarchyTreePeekWidget.TitleMenu,
                when: _ctxCallHierarchyDirection.isEqualTo("outgoingCalls" /* CallHierarchyDirection.CallsFrom */),
                order: 1,
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        return CallHierarchyController.get(editor)?.showIncomingCalls();
    }
});
registerAction2(class extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.showOutgoingCalls',
            title: localize2('title.outgoing', 'Show Outgoing Calls'),
            icon: registerIcon('callhierarchy-outgoing', Codicon.callOutgoing, localize('showOutgoingCallsIcon', 'Icon for outgoing calls in the call hierarchy view.')),
            precondition: ContextKeyExpr.and(_ctxCallHierarchyVisible, _ctxCallHierarchyDirection.isEqualTo("incomingCalls" /* CallHierarchyDirection.CallsTo */)),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ + 512 /* KeyMod.Alt */ + 38 /* KeyCode.KeyH */,
            },
            menu: {
                id: CallHierarchyTreePeekWidget.TitleMenu,
                when: _ctxCallHierarchyDirection.isEqualTo("incomingCalls" /* CallHierarchyDirection.CallsTo */),
                order: 1
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        return CallHierarchyController.get(editor)?.showOutgoingCalls();
    }
});
registerAction2(class extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.refocusCallHierarchy',
            title: localize2('title.refocus', 'Refocus Call Hierarchy'),
            precondition: _ctxCallHierarchyVisible,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ + 3 /* KeyCode.Enter */
            }
        });
    }
    async runEditorCommand(_accessor, editor) {
        return CallHierarchyController.get(editor)?.startCallHierarchyFromCallHierarchy();
    }
});
registerAction2(class extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.closeCallHierarchy',
            title: localize('close', 'Close'),
            icon: Codicon.close,
            precondition: _ctxCallHierarchyVisible,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                primary: 9 /* KeyCode.Escape */,
                when: ContextKeyExpr.not('config.editor.stablePeek')
            },
            menu: {
                id: CallHierarchyTreePeekWidget.TitleMenu,
                order: 1000
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        return CallHierarchyController.get(editor)?.endCallHierarchy();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbEhpZXJhcmNoeS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jYWxsSGllcmFyY2h5L2Jyb3dzZXIvY2FsbEhpZXJhcmNoeS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLDZCQUE2QixFQUEwQixrQkFBa0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3ZILE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNyRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGFBQWEsRUFBbUMsTUFBTSxnREFBZ0QsQ0FBQztBQUc1SSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsYUFBYSxFQUFlLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDdEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1B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