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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, derived, observableSignalFromEvent, observableValue, runOnChange, waitForState } from '../../../../base/common/observable.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CTX_INLINE_CHAT_AFFORDANCE_VISIBLE } from '../common/inlineChat.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { InlineChatEditorAffordance } from './inlineChatEditorAffordance.js';
import { InlineChatGutterAffordance } from './inlineChatGutterAffordance.js';
import { assertType } from '../../../../base/common/types.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
let InlineChatAffordance = class InlineChatAffordance extends Disposable {
    #editor;
    #inputWidget;
    #instantiationService;
    #menuData = observableValue(this, undefined);
    #selectionData = observableValue(this, undefined);
    constructor(editor, inputWidget, instantiationService, configurationService, chatEntiteldService, inlineChatSessionService, telemetryService, contextKeyService) {
        super();
        this.#editor = editor;
        this.#inputWidget = inputWidget;
        this.#instantiationService = instantiationService;
        const editorObs = observableCodeEditor(this.#editor);
        const affordance = observableConfigValue("inlineChat.affordance" /* InlineChatConfigKeys.Affordance */, 'off', configurationService);
        const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);
        const selectionData = this.#selectionData;
        const ctxAffordanceVisible = CTX_INLINE_CHAT_AFFORDANCE_VISIBLE.bindTo(contextKeyService);
        this._store.add({ dispose: () => ctxAffordanceVisible.reset() });
        let explicitSelection = false;
        let affordanceId;
        this._store.add(runOnChange(editorObs.selections, (value, _prev, events) => {
            explicitSelection = events.every(e => e.reason === 3 /* CursorChangeReason.Explicit */);
            if (!value || value.length !== 1 || value[0].isEmpty() || !explicitSelection) {
                selectionData.set(undefined, undefined);
            }
        }));
        this._store.add(autorun(r => {
            const value = debouncedSelection.read(r);
            if (!value || value.isEmpty() || !explicitSelection || this.#editor.getModel()?.getValueInRange(value).match(/^\s+$/)) {
                selectionData.set(undefined, undefined);
                affordanceId = undefined;
                return;
            }
            affordanceId = generateUuid();
            const mode = affordance.read(undefined);
            if (mode === 'gutter' || mode === 'editor') {
                telemetryService.publicLog2('inlineChatAffordance/shown', { mode, id: affordanceId, commandId: '' });
            }
            selectionData.set(value, undefined);
        }));
        this._store.add(autorun(r => {
            if (chatEntiteldService.sentimentObs.read(r).hidden) {
                selectionData.set(undefined, undefined);
            }
        }));
        const hasSessionObs = derived(r => {
            observableSignalFromEvent(this, inlineChatSessionService.onDidChangeSessions).read(r);
            const model = editorObs.model.read(r);
            return model ? inlineChatSessionService.getSessionByTextModel(model.uri) !== undefined : false;
        });
        this._store.add(autorun(r => {
            if (hasSessionObs.read(r)) {
                selectionData.set(undefined, undefined);
            }
        }));
        // Hide when the editor context menu shows
        this._store.add(this.#editor.onContextMenu(() => {
            selectionData.set(undefined, undefined);
        }));
        // Hide when the editor loses focus (e.g., switching tabs in notebooks)
        this._store.add(autorun(r => {
            if (!editorObs.isFocused.read(r)) {
                selectionData.set(undefined, undefined);
            }
        }));
        this._store.add(autorun(r => {
            const sel = selectionData.read(r);
            const mode = affordance.read(r);
            ctxAffordanceVisible.set(sel !== undefined && (mode === 'editor' || mode === 'gutter'));
        }));
        const gutterAffordance = this._store.add(this.#instantiationService.createInstance(InlineChatGutterAffordance, editorObs, derived(r => affordance.read(r) === 'gutter' ? selectionData.read(r) : undefined)));
        const editorAffordance = this.#instantiationService.createInstance(InlineChatEditorAffordance, this.#editor, derived(r => affordance.read(r) === 'editor' ? selectionData.read(r) : undefined));
        this._store.add(editorAffordance);
        this._store.add(Event.any(editorAffordance.onDidRunAction, gutterAffordance.onDidRunAction)(commandId => {
            if (affordanceId) {
                telemetryService.publicLog2('inlineChatAffordance/selected', { mode: affordance.get(), id: affordanceId, commandId });
            }
        }));
        this._store.add(autorun(r => {
            const mode = affordance.read(r);
            const hideWithSelection = mode === 'editor' || mode === 'gutter';
            const controller = CodeActionController.get(this.#editor);
            if (controller) {
                controller.onlyLightBulbWithEmptySelection = hideWithSelection;
            }
        }));
        this._store.add(autorun(r => {
            const data = this.#menuData.read(r);
            if (!data) {
                return;
            }
            // Reveal the line in case it's outside the viewport (e.g., when triggered from sticky scroll)
            this.#editor.revealLineInCenterIfOutsideViewport(data.lineNumber, 1 /* ScrollType.Immediate */);
            const editorDomNode = this.#editor.getDomNode();
            const editorRect = editorDomNode.getBoundingClientRect();
            const left = data.rect.left - editorRect.left;
            // Show the overlay widget
            this.#inputWidget.show(data.lineNumber, left, data.above, data.placeholder, data.value);
        }));
        this._store.add(autorun(r => {
            const pos = this.#inputWidget.position.read(r);
            if (pos === null) {
                this.#menuData.set(undefined, undefined);
            }
        }));
    }
    dismiss() {
        this.#selectionData.set(undefined, undefined);
    }
    async showMenuAtSelection(placeholder, value) {
        assertType(this.#editor.hasModel());
        const direction = this.#editor.getSelection().getDirection();
        const position = this.#editor.getPosition();
        const editorDomNode = this.#editor.getDomNode();
        const scrolledPosition = this.#editor.getScrolledVisiblePosition(position);
        const editorRect = editorDomNode.getBoundingClientRect();
        const x = editorRect.left + scrolledPosition.left;
        const y = editorRect.top + scrolledPosition.top;
        this.#menuData.set({
            rect: new DOMRect(x, y, 0, scrolledPosition.height),
            above: direction === 1 /* SelectionDirection.RTL */,
            lineNumber: position.lineNumber,
            placeholder,
            value
        }, undefined);
        await waitForState(this.#inputWidget.position, pos => pos === null);
    }
};
InlineChatAffordance = __decorate([
    __param(2, IInstantiationService),
    __param(3, IConfigurationService),
    __param(4, IChatEntitlementService),
    __param(5, IInlineChatSessionService),
    __param(6, ITelemetryService),
    __param(7, IContextKeyService)
], InlineChatAffordance);
export { InlineChatAffordance };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdEFmZm9yZGFuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdEFmZm9yZGFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFckssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUF3QixrQ0FBa0MsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU5RCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUM3RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFB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