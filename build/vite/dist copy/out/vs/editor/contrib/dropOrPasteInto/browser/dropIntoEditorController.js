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
var DropIntoEditorController_1;
import { coalesce } from '../../../../base/common/arrays.js';
import { createCancelablePromise, raceCancellation } from '../../../../base/common/async.js';
import { VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { toExternalVSDataTransfer } from '../../../browser/dataTransfer.js';
import { Range } from '../../../common/core/range.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { DraggedTreeItemsIdentifier } from '../../../common/services/treeViewsDnd.js';
import { ITreeViewsDnDService } from '../../../common/services/treeViewsDndService.js';
import { EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { InlineProgressManager } from '../../inlineProgress/browser/inlineProgress.js';
import { sortEditsByYieldTo } from './edit.js';
import { PostEditWidgetManager } from './postEditWidget.js';
export const dropAsPreferenceConfig = 'editor.dropIntoEditor.preferences';
export const changeDropTypeCommandId = 'editor.changeDropType';
export const dropWidgetVisibleCtx = new RawContextKey('dropWidgetVisible', false, localize('dropWidgetVisible', "Whether the drop widget is showing"));
let DropIntoEditorController = class DropIntoEditorController extends Disposable {
    static { DropIntoEditorController_1 = this; }
    static { this.ID = 'editor.contrib.dropIntoEditorController'; }
    static get(editor) {
        return editor.getContribution(DropIntoEditorController_1.ID);
    }
    static setConfigureDefaultAction(action) {
        this._configureDefaultAction = action;
    }
    constructor(editor, instantiationService, _configService, _languageFeaturesService, _treeViewsDragAndDropService) {
        super();
        this._configService = _configService;
        this._languageFeaturesService = _languageFeaturesService;
        this._treeViewsDragAndDropService = _treeViewsDragAndDropService;
        this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
        this._dropProgressManager = this._register(instantiationService.createInstance(InlineProgressManager, 'dropIntoEditor', editor));
        this._postDropWidgetManager = this._register(instantiationService.createInstance(PostEditWidgetManager, 'dropIntoEditor', editor, dropWidgetVisibleCtx, { id: changeDropTypeCommandId, label: localize('postDropWidgetTitle', "Show drop options...") }, () => DropIntoEditorController_1._configureDefaultAction ? [DropIntoEditorController_1._configureDefaultAction] : []));
        this._register(editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event)));
    }
    clearWidgets() {
        this._postDropWidgetManager.clear();
    }
    changeDropType() {
        this._postDropWidgetManager.tryShowSelector();
    }
    async onDropIntoEditor(editor, position, dragEvent) {
        if (!dragEvent.dataTransfer || !editor.hasModel()) {
            return;
        }
        DropIntoEditorController_1._currentDropOperation?.cancel();
        editor.focus();
        editor.setPosition(position);
        const p = createCancelablePromise(async (token) => {
            const disposables = new DisposableStore();
            const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, 1 /* CodeEditorStateFlag.Value */, undefined, token));
            try {
                const ourDataTransfer = await this.extractDataTransferData(dragEvent);
                if (ourDataTransfer.size === 0 || tokenSource.token.isCancellationRequested) {
                    return;
                }
                const model = editor.getModel();
                if (!model) {
                    return;
                }
                const providers = this._languageFeaturesService.documentDropEditProvider
                    .ordered(model)
                    .filter(provider => {
                    if (!provider.dropMimeTypes) {
                        // Keep all providers that don't specify mime types
                        return true;
                    }
                    return provider.dropMimeTypes.some(mime => ourDataTransfer.matches(mime));
                });
                const editSession = disposables.add(await this.getDropEdits(providers, model, position, ourDataTransfer, tokenSource.token));
                if (tokenSource.token.isCancellationRequested) {
                    return;
                }
                if (editSession.edits.length) {
                    const activeEditIndex = this.getInitialActiveEditIndex(model, editSession.edits);
                    const canShowWidget = editor.getOption(43 /* EditorOption.dropIntoEditor */).showDropSelector === 'afterDrop';
                    // Pass in the parent token here as it tracks cancelling the entire drop operation
                    await this._postDropWidgetManager.applyEditAndShowIfNeeded([Range.fromPositions(position)], { activeEditIndex, allEdits: editSession.edits }, canShowWidget, async (edit) => edit, token);
                }
            }
            finally {
                disposables.dispose();
                if (DropIntoEditorController_1._currentDropOperation === p) {
                    DropIntoEditorController_1._currentDropOperation = undefined;
                }
            }
        });
        this._dropProgressManager.showWhile(position, localize('dropIntoEditorProgress', "Running drop handlers. Click to cancel"), p, { cancel: () => p.cancel() });
        DropIntoEditorController_1._currentDropOperation = p;
    }
    async getDropEdits(providers, model, position, dataTransfer, token) {
        const disposables = new DisposableStore();
        const results = await raceCancellation(Promise.all(providers.map(async (provider) => {
            try {
                const edits = await provider.provideDocumentDropEdits(model, position, dataTransfer, token);
                if (edits) {
                    disposables.add(edits);
                }
                return edits?.edits.map(edit => ({ ...edit, providerId: provider.id }));
            }
            catch (err) {
                if (!isCancellationError(err)) {
                    console.error(err);
                }
                console.error(err);
            }
            return undefined;
        })), token);
        const edits = coalesce(results ?? []).flat();
        return {
            edits: sortEditsByYieldTo(edits),
            dispose: () => disposables.dispose()
        };
    }
    getInitialActiveEditIndex(model, edits) {
        const preferredProviders = this._configService.getValue(dropAsPreferenceConfig, { resource: model.uri });
        for (const config of Array.isArray(preferredProviders) ? preferredProviders : []) {
            const desiredKind = new HierarchicalKind(config);
            const editIndex = edits.findIndex(edit => edit.kind && desiredKind.contains(edit.kind));
            if (editIndex >= 0) {
                return editIndex;
            }
        }
        return 0;
    }
    async extractDataTransferData(dragEvent) {
        if (!dragEvent.dataTransfer) {
            return new VSDataTransfer();
        }
        const dataTransfer = toExternalVSDataTransfer(dragEvent.dataTransfer);
        if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
            const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
            if (Array.isArray(data)) {
                for (const id of data) {
                    const treeDataTransfer = await this._treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
                    if (treeDataTransfer) {
                        for (const [type, value] of treeDataTransfer) {
                            dataTransfer.replace(type, value);
                        }
                    }
                }
            }
        }
        return dataTransfer;
    }
};
DropIntoEditorController = DropIntoEditorController_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, ILanguageFeaturesService),
    __param(4, ITreeViewsDnDService)
], DropIntoEditorController);
export { DropIntoEditorController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJvcEludG9FZGl0b3JDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvZHJvcEludG9FZGl0b3JDb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWhILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFJNUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBSXRELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSwwQkFBMEIs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