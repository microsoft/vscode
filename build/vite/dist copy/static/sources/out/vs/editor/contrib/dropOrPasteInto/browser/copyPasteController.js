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
var CopyPasteController_1;
import { coalesce } from '../../../../base/common/arrays.js';
import { createCancelablePromise, DeferredPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { createStringDataTransferItem, matchesMimeType, UriList, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { upcast } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { DocumentPasteTriggerKind } from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { InlineProgressManager } from '../../inlineProgress/browser/inlineProgress.js';
import { MessageController } from '../../message/browser/messageController.js';
import { DefaultTextPasteOrDropEditProvider } from './defaultProviders.js';
import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from './edit.js';
import { PostEditWidgetManager } from './postEditWidget.js';
export const changePasteTypeCommandId = 'editor.changePasteType';
export const pasteAsPreferenceConfig = 'editor.pasteAs.preferences';
export const pasteWidgetVisibleCtx = new RawContextKey('pasteWidgetVisible', false, localize('pasteWidgetVisible', "Whether the paste widget is showing"));
const vscodeClipboardMime = 'application/vnd.code.copymetadata';
let CopyPasteController = class CopyPasteController extends Disposable {
    static { CopyPasteController_1 = this; }
    static { this.ID = 'editor.contrib.copyPasteActionController'; }
    static get(editor) {
        return editor.getContribution(CopyPasteController_1.ID);
    }
    static setConfigureDefaultAction(action) {
        CopyPasteController_1._configureDefaultAction = action;
    }
    constructor(editor, instantiationService, _logService, _bulkEditService, _clipboardService, _commandService, _configService, _languageFeaturesService, _quickInputService, _progressService) {
        super();
        this._logService = _logService;
        this._bulkEditService = _bulkEditService;
        this._clipboardService = _clipboardService;
        this._commandService = _commandService;
        this._configService = _configService;
        this._languageFeaturesService = _languageFeaturesService;
        this._quickInputService = _quickInputService;
        this._progressService = _progressService;
        this._editor = editor;
        this._register(editor.onWillCopy(e => this.handleCopy(e)));
        this._register(editor.onWillCut(e => this.handleCopy(e)));
        this._register(editor.onWillPaste(e => this.handlePaste(e)));
        this._pasteProgressManager = this._register(new InlineProgressManager('pasteIntoEditor', editor, instantiationService));
        this._postPasteWidgetManager = this._register(instantiationService.createInstance(PostEditWidgetManager, 'pasteIntoEditor', editor, pasteWidgetVisibleCtx, { id: changePasteTypeCommandId, label: localize('postPasteWidgetTitle', "Show paste options...") }, () => CopyPasteController_1._configureDefaultAction ? [CopyPasteController_1._configureDefaultAction] : []));
    }
    changePasteType() {
        this._postPasteWidgetManager.tryShowSelector();
    }
    async pasteAs(preferred) {
        this._logService.trace('CopyPasteController.pasteAs');
        this._editor.focus();
        try {
            this._logService.trace('Before calling editor.action.clipboardPasteAction');
            this._pasteAsActionContext = { preferred };
            await this._commandService.executeCommand('editor.action.clipboardPasteAction');
        }
        finally {
            this._pasteAsActionContext = undefined;
        }
    }
    clearWidgets() {
        this._postPasteWidgetManager.clear();
    }
    isPasteAsEnabled() {
        return this._editor.getOption(97 /* EditorOption.pasteAs */).enabled;
    }
    async finishedPaste() {
        await this._currentPasteOperation;
    }
    handleCopy(e) {
        this._logService.trace('CopyPasteController#handleCopy');
        if (!this._editor.hasTextFocus()) {
            return;
        }
        // Explicitly clear the clipboard internal state.
        // This is needed because on web, the browser clipboard is faked out using an in-memory store.
        // This means the resources clipboard is not properly updated when copying from the editor.
        this._clipboardService.clearInternalState?.();
        if (!this.isPasteAsEnabled()) {
            return;
        }
        const model = this._editor.getModel();
        const viewModel = this._editor._getViewModel();
        const selections = this._editor.getSelections();
        if (!model || !viewModel || !selections?.length) {
            return;
        }
        const defaultPastePayload = {
            multicursorText: e.dataToCopy.multicursorText ?? null,
            pasteOnNewLine: e.dataToCopy.isFromEmptySelection,
            mode: null
        };
        const providers = this._languageFeaturesService.documentPasteEditProvider
            .ordered(model)
            .filter(x => !!x.prepareDocumentPaste);
        if (!providers.length) {
            this.setCopyMetadata(e.clipboardData, { defaultPastePayload });
            return;
        }
        const dataTransfer = new VSDataTransfer();
        const providerCopyMimeTypes = providers.flatMap(x => x.copyMimeTypes ?? []);
        // Save off a handle pointing to data that VS Code maintains.
        const handle = generateUuid();
        this.setCopyMetadata(e.clipboardData, {
            id: handle,
            providerCopyMimeTypes,
            defaultPastePayload
        });
        const operations = providers.map((provider) => {
            return {
                providerMimeTypes: provider.copyMimeTypes,
                operation: createCancelablePromise(token => provider.prepareDocumentPaste(model, e.dataToCopy.sourceRanges, dataTransfer, token)
                    .catch(err => {
                    console.error(err);
                    return undefined;
                }))
            };
        });
        CopyPasteController_1._currentCopyOperation?.operations.forEach(entry => entry.operation.cancel());
        CopyPasteController_1._currentCopyOperation = { handle, operations };
    }
    async handlePaste(e) {
        this._logService.trace('CopyPasteController#handlePaste for id : ', e.metadata?.id);
        if (!this._editor.hasTextFocus()) {
            return;
        }
        const dataTransfer = e.toExternalVSDataTransfer();
        if (!dataTransfer) {
            return;
        }
        dataTransfer.delete(vscodeClipboardMime);
        MessageController.get(this._editor)?.closeMessage();
        this._currentPasteOperation?.cancel();
        this._currentPasteOperation = undefined;
        const model = this._editor.getModel();
        const selections = this._editor.getSelections();
        if (!selections?.length || !model) {
            return;
        }
        if (this._editor.getOption(104 /* EditorOption.readOnly */) // Never enabled if editor is readonly.
            || (!this.isPasteAsEnabled() && !this._pasteAsActionContext) // Or feature disabled (but still enable if paste was explicitly requested)
        ) {
            return;
        }
        const metadata = this.fetchCopyMetadata(e);
        this._logService.trace('CopyPasteController#handlePaste with metadata : ', metadata?.id, ' and text.length : ', e.clipboardData.getData('text/plain').length);
        const fileTypes = Array.from(e.clipboardData.files).map(file => file.type);
        const allPotentialMimeTypes = [
            ...e.clipboardData.types,
            ...fileTypes,
            ...metadata?.providerCopyMimeTypes ?? [],
            // TODO: always adds `uri-list` because this get set if there are resources in the system clipboard.
            // However we can only check the system clipboard async. For this early check, just add it in.
            // We filter providers again once we have the final dataTransfer we will use.
            Mimes.uriList,
        ];
        const allProviders = this._languageFeaturesService.documentPasteEditProvider
            .ordered(model)
            .filter(provider => {
            // Filter out providers that don't match the requested paste types
            const preference = this._pasteAsActionContext?.preferred;
            if (preference) {
                if (!this.providerMatchesPreference(provider, preference)) {
                    return false;
                }
            }
            // And providers that don't handle any of mime types in the clipboard
            return provider.pasteMimeTypes?.some(type => matchesMimeType(type, allPotentialMimeTypes));
        });
        if (!allProviders.length) {
            if (this._pasteAsActionContext?.preferred) {
                this.showPasteAsNoEditMessage(selections, this._pasteAsActionContext.preferred);
                // Also prevent default paste from applying
                e.setHandled();
            }
            return;
        }
        // Prevent the editor's default paste handler from running.
        // Note that after this point, we are fully responsible for handling paste.
        // If we can't provider a paste for any reason, we need to explicitly delegate pasting back to the editor.
        e.setHandled();
        if (this._pasteAsActionContext) {
            this.showPasteAsPick(this._pasteAsActionContext.preferred, allProviders, selections, dataTransfer, metadata);
        }
        else {
            this.doPasteInline(allProviders, selections, dataTransfer, metadata, e.browserEvent);
        }
    }
    showPasteAsNoEditMessage(selections, preference) {
        const kindLabel = 'only' in preference
            ? preference.only.value
            : 'preferences' in preference
                ? (preference.preferences.length ? preference.preferences.map(preference => preference.value).join(', ') : localize('noPreferences', "empty"))
                : preference.providerId;
        MessageController.get(this._editor)?.showMessage(localize('pasteAsError', "No paste edits for '{0}' found", kindLabel), selections[0].getStartPosition());
    }
    doPasteInline(allProviders, selections, dataTransfer, metadata, clipboardEvent) {
        this._logService.trace('CopyPasteController#doPasteInline');
        const editor = this._editor;
        if (!editor.hasModel()) {
            return;
        }
        const editorStateCts = new EditorStateCancellationTokenSource(editor, 1 /* CodeEditorStateFlag.Value */ | 2 /* CodeEditorStateFlag.Selection */, undefined);
        const p = createCancelablePromise(async (pToken) => {
            const editor = this._editor;
            if (!editor.hasModel()) {
                return;
            }
            const model = editor.getModel();
            const disposables = new DisposableStore();
            const cts = disposables.add(new CancellationTokenSource(pToken));
            disposables.add(editorStateCts.token.onCancellationRequested(() => cts.cancel()));
            const token = cts.token;
            try {
                await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, token);
                if (token.isCancellationRequested) {
                    return;
                }
                const supportedProviders = allProviders.filter(provider => this.isSupportedPasteProvider(provider, dataTransfer));
                if (!supportedProviders.length
                    || (supportedProviders.length === 1 && supportedProviders[0] instanceof DefaultTextPasteOrDropEditProvider) // Only our default text provider is active
                ) {
                    return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
                }
                const context = {
                    triggerKind: DocumentPasteTriggerKind.Automatic,
                };
                const editSession = await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, token);
                disposables.add(editSession);
                if (token.isCancellationRequested) {
                    return;
                }
                // If the only edit returned is our default text edit, use the default paste handler
                if (editSession.edits.length === 1 && editSession.edits[0].provider instanceof DefaultTextPasteOrDropEditProvider) {
                    return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
                }
                if (editSession.edits.length) {
                    const canShowWidget = editor.getOption(97 /* EditorOption.pasteAs */).showPasteSelector === 'afterPaste';
                    return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: this.getInitialActiveEditIndex(model, editSession.edits), allEdits: editSession.edits }, canShowWidget, async (edit, resolveToken) => {
                        if (!edit.provider.resolveDocumentPasteEdit) {
                            return edit;
                        }
                        const resolveP = edit.provider.resolveDocumentPasteEdit(edit, resolveToken);
                        const showP = new DeferredPromise();
                        const resolved = await this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('resolveProcess', "Resolving paste edit for '{0}'. Click to cancel", edit.title), raceCancellation(Promise.race([showP.p, resolveP]), resolveToken), {
                            cancel: () => showP.cancel()
                        }, 0);
                        if (resolved) {
                            edit.insertText = resolved.insertText;
                            edit.additionalEdit = resolved.additionalEdit;
                        }
                        return edit;
                    }, token);
                }
                await this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
            }
            finally {
                disposables.dispose();
                if (this._currentPasteOperation === p) {
                    this._currentPasteOperation = undefined;
                }
            }
        });
        this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize('pasteIntoEditorProgress', "Running paste handlers. Click to cancel and do basic paste"), p, {
            cancel: async () => {
                p.cancel();
                if (editorStateCts.token.isCancellationRequested) {
                    return;
                }
                await this.applyDefaultPasteHandler(dataTransfer, metadata, editorStateCts.token, clipboardEvent);
            }
        }).finally(() => {
            editorStateCts.dispose();
        });
        this._currentPasteOperation = p;
    }
    showPasteAsPick(preference, allProviders, selections, dataTransfer, metadata) {
        this._logService.trace('CopyPasteController#showPasteAsPick');
        const p = createCancelablePromise(async (token) => {
            const editor = this._editor;
            if (!editor.hasModel()) {
                return;
            }
            const model = editor.getModel();
            const disposables = new DisposableStore();
            const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, 1 /* CodeEditorStateFlag.Value */ | 2 /* CodeEditorStateFlag.Selection */, undefined, token));
            try {
                await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, tokenSource.token);
                if (tokenSource.token.isCancellationRequested) {
                    return;
                }
                // Filter out any providers the don't match the full data transfer we will send them.
                let supportedProviders = allProviders.filter(provider => this.isSupportedPasteProvider(provider, dataTransfer, preference));
                if (preference) {
                    // We are looking for a specific edit
                    supportedProviders = supportedProviders.filter(provider => this.providerMatchesPreference(provider, preference));
                }
                const context = {
                    triggerKind: DocumentPasteTriggerKind.PasteAs,
                    only: preference && 'only' in preference ? preference.only : undefined,
                };
                let editSession = disposables.add(await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, tokenSource.token));
                if (tokenSource.token.isCancellationRequested) {
                    return;
                }
                // Filter out any edits that don't match the requested kind
                if (preference) {
                    editSession = {
                        edits: editSession.edits.filter(edit => {
                            if ('only' in preference) {
                                return preference.only.contains(edit.kind);
                            }
                            else if ('preferences' in preference) {
                                return preference.preferences.some(preference => preference.contains(edit.kind));
                            }
                            else {
                                return preference.providerId === edit.provider.id;
                            }
                        }),
                        dispose: editSession.dispose
                    };
                }
                if (!editSession.edits.length) {
                    if (preference) {
                        this.showPasteAsNoEditMessage(selections, preference);
                    }
                    return;
                }
                let pickedEdit;
                if (preference) {
                    pickedEdit = editSession.edits.at(0);
                }
                else {
                    const configureDefaultItem = {
                        id: 'editor.pasteAs.default',
                        label: localize('pasteAsDefault', "Configure default paste action"),
                        edit: undefined,
                    };
                    const selected = await this._quickInputService.pick([
                        ...editSession.edits.map((edit) => ({
                            label: edit.title,
                            description: edit.kind?.value,
                            edit,
                        })),
                        ...(CopyPasteController_1._configureDefaultAction ? [
                            upcast({ type: 'separator' }),
                            {
                                label: CopyPasteController_1._configureDefaultAction.label,
                                edit: undefined,
                            }
                        ] : [])
                    ], {
                        placeHolder: localize('pasteAsPickerPlaceholder', "Select Paste Action"),
                    });
                    if (selected === configureDefaultItem) {
                        CopyPasteController_1._configureDefaultAction?.run();
                        return;
                    }
                    pickedEdit = selected?.edit;
                }
                if (!pickedEdit) {
                    return;
                }
                const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, selections, pickedEdit);
                await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor });
            }
            finally {
                disposables.dispose();
                if (this._currentPasteOperation === p) {
                    this._currentPasteOperation = undefined;
                }
            }
        });
        this._progressService.withProgress({
            location: 10 /* ProgressLocation.Window */,
            title: localize('pasteAsProgress', "Running paste handlers"),
        }, () => p);
    }
    setCopyMetadata(clipboardData, metadata) {
        this._logService.trace('CopyPasteController#setCopyMetadata new id : ', metadata.id);
        clipboardData.setData(vscodeClipboardMime, JSON.stringify(metadata));
    }
    fetchCopyMetadata(e) {
        this._logService.trace('CopyPasteController#fetchCopyMetadata');
        // Prefer using the clipboard data we saved off
        const rawMetadata = e.clipboardData.getData(vscodeClipboardMime);
        if (rawMetadata) {
            try {
                return JSON.parse(rawMetadata);
            }
            catch {
                return undefined;
            }
        }
        if (e.metadata) {
            return {
                defaultPastePayload: {
                    mode: e.metadata.mode,
                    multicursorText: e.metadata.multicursorText ?? null,
                    pasteOnNewLine: !!e.metadata.isFromEmptySelection,
                },
            };
        }
        return undefined;
    }
    async mergeInDataFromCopy(allProviders, dataTransfer, metadata, token) {
        this._logService.trace('CopyPasteController#mergeInDataFromCopy with metadata : ', metadata?.id);
        if (metadata?.id && CopyPasteController_1._currentCopyOperation?.handle === metadata.id) {
            // Only resolve providers that have data we may care about
            const toResolve = CopyPasteController_1._currentCopyOperation.operations
                .filter(op => allProviders.some(provider => provider.pasteMimeTypes.some(type => matchesMimeType(type, op.providerMimeTypes))))
                .map(op => op.operation);
            const toMergeResults = await Promise.all(toResolve);
            if (token.isCancellationRequested) {
                return;
            }
            // Values from higher priority providers should overwrite values from lower priority ones.
            // Reverse the array to so that the calls to `DataTransfer.replace` later will do this
            for (const toMergeData of toMergeResults.reverse()) {
                if (toMergeData) {
                    for (const [key, value] of toMergeData) {
                        dataTransfer.replace(key, value);
                    }
                }
            }
        }
        if (!dataTransfer.has(Mimes.uriList)) {
            const resources = await this._clipboardService.readResources();
            if (token.isCancellationRequested) {
                return;
            }
            if (resources.length) {
                dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
            }
        }
    }
    async getPasteEdits(providers, dataTransfer, model, selections, context, token) {
        const disposables = new DisposableStore();
        const results = await raceCancellation(Promise.all(providers.map(async (provider) => {
            try {
                const edits = await provider.provideDocumentPasteEdits?.(model, selections, dataTransfer, context, token);
                if (edits) {
                    disposables.add(edits);
                }
                return edits?.edits?.map(edit => ({ ...edit, provider }));
            }
            catch (err) {
                if (!isCancellationError(err)) {
                    console.error(err);
                }
                return undefined;
            }
        })), token);
        const edits = coalesce(results ?? []).flat().filter(edit => {
            return !context.only || context.only.contains(edit.kind);
        });
        return {
            edits: sortEditsByYieldTo(edits),
            dispose: () => disposables.dispose()
        };
    }
    async applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent) {
        const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get('text');
        const text = (await textDataTransfer?.asString()) ?? '';
        if (token.isCancellationRequested) {
            return;
        }
        const payload = {
            clipboardEvent,
            text,
            pasteOnNewLine: metadata?.defaultPastePayload.pasteOnNewLine ?? false,
            multicursorText: metadata?.defaultPastePayload.multicursorText ?? null,
            mode: null,
        };
        this._logService.trace('CopyPasteController#applyDefaultPasteHandler for id : ', metadata?.id);
        this._editor.trigger('keyboard', "paste" /* Handler.Paste */, payload);
    }
    /**
     * Filter out providers if they:
     * - Don't handle any of the data transfer types we have
     * - Don't match the preferred paste kind
     */
    isSupportedPasteProvider(provider, dataTransfer, preference) {
        if (!provider.pasteMimeTypes?.some(type => dataTransfer.matches(type))) {
            return false;
        }
        return !preference || this.providerMatchesPreference(provider, preference);
    }
    providerMatchesPreference(provider, preference) {
        if ('only' in preference) {
            return provider.providedPasteEditKinds.some(providedKind => preference.only.contains(providedKind));
        }
        else if ('preferences' in preference) {
            return provider.providedPasteEditKinds.some(providedKind => preference.preferences.some(preferredKind => preferredKind.contains(providedKind)));
        }
        else {
            return provider.id === preference.providerId;
        }
    }
    getInitialActiveEditIndex(model, edits) {
        const preferredProviders = this._configService.getValue(pasteAsPreferenceConfig, { resource: model.uri });
        for (const config of Array.isArray(preferredProviders) ? preferredProviders : []) {
            const desiredKind = new HierarchicalKind(config);
            const editIndex = edits.findIndex(edit => desiredKind.contains(edit.kind));
            if (editIndex >= 0) {
                return editIndex;
            }
        }
        return 0;
    }
};
CopyPasteController = CopyPasteController_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ILogService),
    __param(3, IBulkEditService),
    __param(4, IClipboardService),
    __param(5, ICommandService),
    __param(6, IConfigurationService),
    __param(7, ILanguageFeaturesService),
    __param(8, IQuickInputService),
    __param(9, IProgressService)
], CopyPasteController);
export { CopyPasteController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29weVBhc3RlQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pJLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsNEJBQTRCLEVBQTJCLGVBQWUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0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