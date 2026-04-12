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
import { timeout } from '../../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { CoreEditingCommands, CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { IBulkEditService } from '../../../../browser/services/bulkEditService.js';
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from '../../../../browser/services/renameSymbolTrackerService.js';
import { TextEdit } from '../../../../common/core/edits/textEdit.js';
import { Range } from '../../../../common/core/range.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { IModelService } from '../../../../common/services/model.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { InlineCompletionsController } from '../../browser/controller/inlineCompletionsController.js';
import { InlineSuggestionsView } from '../../browser/view/inlineSuggestionsView.js';
export class MockInlineCompletionsProvider {
    constructor(enableForwardStability = false) {
        this.enableForwardStability = enableForwardStability;
        this.returnValue = [];
        this.delayMs = 0;
        this.callHistory = new Array();
        this.calledTwiceIn50Ms = false;
        this._onDidChangeEmitter = new Emitter();
        this.onDidChangeInlineCompletions = this._onDidChangeEmitter.event;
        this.lastTimeMs = undefined;
    }
    setReturnValue(value, delayMs = 0) {
        this.returnValue = value ? [value] : [];
        this.delayMs = delayMs;
    }
    setReturnValues(values, delayMs = 0) {
        this.returnValue = values;
        this.delayMs = delayMs;
    }
    getAndClearCallHistory() {
        const history = [...this.callHistory];
        this.callHistory = [];
        return history;
    }
    assertNotCalledTwiceWithin50ms() {
        if (this.calledTwiceIn50Ms) {
            throw new Error('provideInlineCompletions has been called at least twice within 50ms. This should not happen.');
        }
    }
    /**
     * Fire an onDidChange event with an optional change hint.
     */
    fireOnDidChange(changeHint) {
        this._onDidChangeEmitter.fire(changeHint);
    }
    async provideInlineCompletions(model, position, context, token) {
        const currentTimeMs = new Date().getTime();
        if (this.lastTimeMs && currentTimeMs - this.lastTimeMs < 50) {
            this.calledTwiceIn50Ms = true;
        }
        this.lastTimeMs = currentTimeMs;
        this.callHistory.push({
            position: position.toString(),
            triggerKind: context.triggerKind,
            text: model.getValue(),
            ...(context.changeHint !== undefined ? { changeHint: context.changeHint } : {}),
        });
        const result = new Array();
        for (const v of this.returnValue) {
            const x = { ...v };
            if (!x.range) {
                x.range = model.getFullModelRange();
            }
            result.push(x);
        }
        if (this.delayMs > 0) {
            await timeout(this.delayMs);
        }
        return { items: result, enableForwardStability: this.enableForwardStability };
    }
    disposeInlineCompletions() { }
    handleItemDidShow() { }
}
export class MockSearchReplaceCompletionsProvider {
    constructor() {
        this._map = new Map();
    }
    add(search, replace) {
        this._map.set(search, replace);
    }
    async provideInlineCompletions(model, position, context, token) {
        const text = model.getValue();
        for (const [search, replace] of this._map) {
            const idx = text.indexOf(search);
            // replace idx...idx+text.length with replace
            if (idx !== -1) {
                const range = Range.fromPositions(model.getPositionAt(idx), model.getPositionAt(idx + search.length));
                return {
                    items: [
                        { range, insertText: replace, isInlineEdit: true }
                    ]
                };
            }
        }
        return { items: [] };
    }
    disposeInlineCompletions() { }
    handleItemDidShow() { }
}
export class InlineEditContext extends Disposable {
    constructor(model, editor) {
        super();
        this.editor = editor;
        this.prettyViewStates = new Array();
        const edit = derived(reader => {
            const state = model.state.read(reader);
            return state ? new TextEdit(state.edits) : undefined;
        });
        this._register(autorun(reader => {
            /** @description update */
            const e = edit.read(reader);
            let view;
            if (e) {
                view = e.toString(this.editor.getValue());
            }
            else {
                view = undefined;
            }
            this.prettyViewStates.push(view);
        }));
    }
    getAndClearViewStates() {
        const arr = [...this.prettyViewStates];
        this.prettyViewStates.length = 0;
        return arr;
    }
}
export class GhostTextContext extends Disposable {
    get currentPrettyViewState() {
        return this._currentPrettyViewState;
    }
    constructor(model, editor) {
        super();
        this.editor = editor;
        this.prettyViewStates = new Array();
        this._register(autorun(reader => {
            /** @description update */
            const ghostText = model.primaryGhostText.read(reader);
            let view;
            if (ghostText) {
                view = ghostText.render(this.editor.getValue(), true);
            }
            else {
                view = this.editor.getValue();
            }
            if (this._currentPrettyViewState !== view) {
                this.prettyViewStates.push(view);
            }
            this._currentPrettyViewState = view;
        }));
    }
    getAndClearViewStates() {
        const arr = [...this.prettyViewStates];
        this.prettyViewStates.length = 0;
        return arr;
    }
    keyboardType(text) {
        this.editor.trigger('keyboard', 'type', { text });
    }
    cursorUp() {
        this.editor.runCommand(CoreNavigationCommands.CursorUp, null);
    }
    cursorRight() {
        this.editor.runCommand(CoreNavigationCommands.CursorRight, null);
    }
    cursorLeft() {
        this.editor.runCommand(CoreNavigationCommands.CursorLeft, null);
    }
    cursorDown() {
        this.editor.runCommand(CoreNavigationCommands.CursorDown, null);
    }
    cursorLineEnd() {
        this.editor.runCommand(CoreNavigationCommands.CursorLineEnd, null);
    }
    leftDelete() {
        this.editor.runCommand(CoreEditingCommands.DeleteLeft, null);
    }
}
export async function withAsyncTestCodeEditorAndInlineCompletionsModel(text, options, callback) {
    return await runWithFakedTimers({
        useFakeTimers: options.fakeClock,
    }, async () => {
        const disposableStore = new DisposableStore();
        try {
            if (options.provider) {
                const languageFeaturesService = new LanguageFeaturesService();
                if (!options.serviceCollection) {
                    options.serviceCollection = new ServiceCollection();
                }
                options.serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
                // eslint-disable-next-line local/code-no-any-casts
                options.serviceCollection.set(IAccessibilitySignalService, {
                    playSignal: async () => { },
                    isSoundEnabled(signal) { return false; },
                });
                options.serviceCollection.set(IBulkEditService, {
                    apply: async () => { throw new Error('IBulkEditService.apply not implemented'); },
                    hasPreviewHandler: () => { throw new Error('IBulkEditService.hasPreviewHandler not implemented'); },
                    setPreviewHandler: () => { throw new Error('IBulkEditService.setPreviewHandler not implemented'); },
                    _serviceBrand: undefined,
                });
                options.serviceCollection.set(ITextModelService, new SyncDescriptor(MockTextModelService));
                options.serviceCollection.set(IDefaultAccountService, {
                    _serviceBrand: undefined,
                    onDidChangeDefaultAccount: Event.None,
                    onDidChangePolicyData: Event.None,
                    policyData: null,
                    copilotTokenInfo: null,
                    onDidChangeCopilotTokenInfo: Event.None,
                    getDefaultAccount: async () => null,
                    setDefaultAccountProvider: () => { },
                    getDefaultAccountAuthenticationProvider: () => { return { id: 'mockProvider', name: 'Mock Provider', enterprise: false }; },
                    refresh: async () => { return null; },
                    signIn: async () => { return null; },
                    signOut: async () => { },
                });
                options.serviceCollection.set(IRenameSymbolTrackerService, new NullRenameSymbolTrackerService());
                const d = languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, options.provider);
                disposableStore.add(d);
            }
            let result;
            await withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
                instantiationService.stubInstance(InlineSuggestionsView, {
                    shouldShowHoverAtViewZone: () => false,
                    dispose: () => { },
                });
                const controller = instantiationService.createInstance(InlineCompletionsController, editor);
                const model = controller.model.get();
                const context = new GhostTextContext(model, editor);
                try {
                    result = await callback({ editor, editorViewModel, model, context, store: disposableStore });
                }
                finally {
                    context.dispose();
                    model.dispose();
                    controller.dispose();
                }
            });
            if (options.provider instanceof MockInlineCompletionsProvider) {
                options.provider.assertNotCalledTwiceWithin50ms();
            }
            return result;
        }
        finally {
            disposableStore.dispose();
        }
    });
}
export class AnnotatedString {
    constructor(src, annotations = ['↓']) {
        const markers = findMarkers(src, annotations);
        this.value = markers.textWithoutMarkers;
        this.markers = markers.results;
    }
    getMarkerOffset(markerIdx = 0) {
        if (markerIdx >= this.markers.length) {
            throw new BugIndicatingError(`Marker index ${markerIdx} out of bounds`);
        }
        return this.markers[markerIdx].idx;
    }
}
function findMarkers(text, markers) {
    const results = [];
    let textWithoutMarkers = '';
    markers.sort((a, b) => b.length - a.length);
    let pos = 0;
    for (let i = 0; i < text.length;) {
        let foundMarker = false;
        for (const marker of markers) {
            if (text.startsWith(marker, i)) {
                results.push({ mark: marker, idx: pos });
                i += marker.length;
                foundMarker = true;
                break;
            }
        }
        if (!foundMarker) {
            textWithoutMarkers += text[i];
            pos++;
            i++;
        }
    }
    return { results, textWithoutMarkers };
}
export class AnnotatedText extends AnnotatedString {
    constructor() {
        super(...arguments);
        this._transformer = new PositionOffsetTransformer(this.value);
    }
    getMarkerPosition(markerIdx = 0) {
        return this._transformer.getPosition(this.getMarkerOffset(markerIdx));
    }
}
let MockTextModelService = class MockTextModelService {
    constructor(_modelService) {
        this._modelService = _modelService;
    }
    async createModelReference(resource) {
        const model = this._modelService.getModel(resource);
        if (!model) {
            throw new Error(`MockTextModelService: Model not found for ${resource.toString()}`);
        }
        return {
            object: {
                textEditorModel: model,
                getLanguageId: () => model.getLanguageId(),
                isReadonly: () => false,
                isDisposed: () => model.isDisposed(),
                isResolved: () => true,
                onWillDispose: model.onWillDispose,
                resolve: async () => { },
                createSnapshot: () => model.createSnapshot(),
                dispose: () => { },
            },
            dispose: () => { },
        };
    }
    registerTextModelContentProvider() {
        throw new Error('MockTextModelService.registerTextModelContentProvider not implemented');
    }
    canHandleResource() {
        return false;
    }
};
MockTextModelService = __decorate([
    __param(0, IModelService)
], MockTextModelService);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy90ZXN0L2Jyb3dzZXIvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWMsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG1GQUFtRixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN6SSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFckUsT0FBTyxFQUFFLEtBQUssRUFB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