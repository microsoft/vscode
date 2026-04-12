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
import { Event } from '../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { BoundModelReferenceCollection } from './mainThreadDocuments.js';
import { NotebookCellsChangeType } from '../../contrib/notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../contrib/notebook/common/notebookEditorModelResolverService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { ExtHostContext } from '../common/extHost.protocol.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
let MainThreadNotebookDocuments = class MainThreadNotebookDocuments {
    constructor(extHostContext, _notebookEditorModelResolverService, _uriIdentityService) {
        this._notebookEditorModelResolverService = _notebookEditorModelResolverService;
        this._uriIdentityService = _uriIdentityService;
        this._disposables = new DisposableStore();
        this._documentEventListenersMapping = new ResourceMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookDocuments);
        this._modelReferenceCollection = new BoundModelReferenceCollection(this._uriIdentityService.extUri);
        // forward dirty and save events
        this._disposables.add(this._notebookEditorModelResolverService.onDidChangeDirty(model => this._proxy.$acceptDirtyStateChanged(model.resource, model.isDirty())));
        this._disposables.add(this._notebookEditorModelResolverService.onDidSaveNotebook(e => this._proxy.$acceptModelSaved(e)));
        // when a conflict is going to happen RELEASE references that are held by extensions
        this._disposables.add(_notebookEditorModelResolverService.onWillFailWithConflict(e => {
            this._modelReferenceCollection.remove(e.resource);
        }));
    }
    dispose() {
        this._disposables.dispose();
        this._modelReferenceCollection.dispose();
        dispose(this._documentEventListenersMapping.values());
    }
    handleNotebooksAdded(notebooks) {
        for (const textModel of notebooks) {
            const disposableStore = new DisposableStore();
            disposableStore.add(textModel.onDidChangeContent(event => {
                const eventDto = {
                    versionId: event.versionId,
                    rawEvents: []
                };
                for (const e of event.rawEvents) {
                    switch (e.kind) {
                        case NotebookCellsChangeType.ModelChange:
                            eventDto.rawEvents.push({
                                kind: e.kind,
                                changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(cell => NotebookDto.toNotebookCellDto(cell))])
                            });
                            break;
                        case NotebookCellsChangeType.Move:
                            eventDto.rawEvents.push({
                                kind: e.kind,
                                index: e.index,
                                length: e.length,
                                newIdx: e.newIdx,
                            });
                            break;
                        case NotebookCellsChangeType.Output:
                            eventDto.rawEvents.push({
                                kind: e.kind,
                                index: e.index,
                                outputs: e.outputs.map(NotebookDto.toNotebookOutputDto)
                            });
                            break;
                        case NotebookCellsChangeType.OutputItem:
                            eventDto.rawEvents.push({
                                kind: e.kind,
                                index: e.index,
                                outputId: e.outputId,
                                outputItems: e.outputItems.map(NotebookDto.toNotebookOutputItemDto),
                                append: e.append
                            });
                            break;
                        case NotebookCellsChangeType.ChangeCellLanguage:
                        case NotebookCellsChangeType.ChangeCellContent:
                        case NotebookCellsChangeType.ChangeCellMetadata:
                        case NotebookCellsChangeType.ChangeCellInternalMetadata:
                            eventDto.rawEvents.push(e);
                            break;
                    }
                }
                const hasDocumentMetadataChangeEvent = event.rawEvents.find(e => e.kind === NotebookCellsChangeType.ChangeDocumentMetadata);
                // using the model resolver service to know if the model is dirty or not.
                // assuming this is the first listener it can mean that at first the model
                // is marked as dirty and that another event is fired
                this._proxy.$acceptModelChanged(textModel.uri, new SerializableObjectWithBuffers(eventDto), this._notebookEditorModelResolverService.isDirty(textModel.uri), hasDocumentMetadataChangeEvent ? textModel.metadata : undefined);
            }));
            this._documentEventListenersMapping.set(textModel.uri, disposableStore);
        }
    }
    handleNotebooksRemoved(uris) {
        for (const uri of uris) {
            this._documentEventListenersMapping.get(uri)?.dispose();
            this._documentEventListenersMapping.delete(uri);
        }
    }
    async $tryCreateNotebook(options) {
        if (options.content) {
            const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: undefined }, options.viewType);
            // untitled notebooks are disposed when they get saved. we should not hold a reference
            // to such a disposed notebook and therefore dispose the reference as well
            Event.once(ref.object.notebook.onWillDispose)(() => {
                ref.dispose();
            });
            // untitled notebooks with content are dirty by default
            this._proxy.$acceptDirtyStateChanged(ref.object.resource, true);
            // apply content changes... slightly HACKY -> this triggers a change event
            if (options.content) {
                const data = NotebookDto.fromNotebookDataDto(options.content);
                ref.object.notebook.reset(data.cells, data.metadata, ref.object.notebook.transientOptions);
            }
            return ref.object.notebook.uri;
        }
        else {
            // If we aren't adding content, we don't need to resolve the full editor model yet.
            // This will allow us to adjust settings when the editor is opened, e.g. scratchpad
            const notebook = await this._notebookEditorModelResolverService.createUntitledNotebookTextModel(options.viewType);
            return notebook.uri;
        }
    }
    async $tryOpenNotebook(uriComponents) {
        const uri = URI.revive(uriComponents);
        const ref = await this._notebookEditorModelResolverService.resolve(uri, undefined);
        if (uriComponents.scheme === 'untitled') {
            // untitled notebooks are disposed when they get saved. we should not hold a reference
            // to such a disposed notebook and therefore dispose the reference as well
            ref.object.notebook.onWillDispose(() => {
                ref.dispose();
            });
        }
        this._modelReferenceCollection.add(uri, ref);
        return uri;
    }
    async $trySaveNotebook(uriComponents) {
        const uri = URI.revive(uriComponents);
        const ref = await this._notebookEditorModelResolverService.resolve(uri);
        const saveResult = await ref.object.save();
        ref.dispose();
        return saveResult;
    }
};
MainThreadNotebookDocuments = __decorate([
    __param(1, INotebookEditorModelResolverService),
    __param(2, IUriIdentityService)
], MainThreadNotebookDocuments);
export { MainThreadNotebookDocuments };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE5vdGVib29rRG9jdW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWROb3RlYm9va0RvY3VtZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUV6RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUMxSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFtSSxNQUFNLCtCQUErQixDQUFDO0FBQ2hNLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUc3RixJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUEyQjtJQVF2QyxZQUNDLGNBQStCLEVBQ00sbUNBQXlGLEVBQ3pHLG1CQUF5RDtRQUR4Qix3Q0FBbUMsR0FBbkMsbUNBQW1DLENBQXFDO1FBQ3hGLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFUOUQsaUJBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBR3JDLG1DQUE4QixHQUFHLElBQUksV0FBVyxFQUFtQixDQUFDO1FBUXBGLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUMvRSxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEcsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakssSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFekgsb0ZBQW9GO1FBQ3BGLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3BGLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsb0JBQW9CLENBQUMsU0FBdUM7UUFFM0QsS0FBSyxNQUFNLFNBQVMsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNuQyxNQUFNLGVBQWUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQzlDLGVBQWUsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUV4RCxNQUFNLFFBQVEsR0FBaUM7b0JBQzlDLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztvQkFDMUIsU0FBUyxFQUFFLEVBQUU7aUJBQ2IsQ0FBQztnQkFFRixLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFFakMsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ2hCLEtBQUssdUJBQXVCLENBQUMsV0FBVzs0QkFDdkMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0NBQ3ZCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtnQ0FDWixPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUF3QyxDQUFDOzZCQUNuSixDQUFDLENBQUM7NEJBQ0gsTUFBTTt3QkFDUCxLQUFLLHVCQUF1QixDQUFDLElBQUk7NEJBQ2hDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO2dDQUN2QixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7Z0NBQ1osS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO2dDQUNkLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTTtnQ0FDaEIsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNOzZCQUNoQixDQUFDLENBQUM7NEJBQ0gsTUFBTTt3QkFDUCxLQUFLLHVCQUF1QixDQUFDLE1BQU07NEJBQ2xDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO2dDQUN2QixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7Z0NBQ1osS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO2dDQUNkLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUM7NkJBQ3ZELENBQUMsQ0FBQzs0QkFDSCxNQUFNO3dCQUNQLEtBQUssdUJBQXVCLENBQUMsVUFBVTs0QkFDdEMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7Z0NBQ3ZCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtnQ0FDWixLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUs7Z0NBQ2QsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO2dDQUNwQixXQUFXLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDO2dDQUNuRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU07NkJBQ2hCLENBQUMsQ0FBQzs0QkFDSCxNQUFNO3dCQUNQLEtBQUssdUJBQXVCLENBQUMsa0JBQWtCLENBQUM7d0JBQ2hELEtBQUssdUJBQXVCLENBQUMsaUJBQWlCLENBQUM7d0JBQy9DLEtBQUssdUJBQXVCLENBQUMsa0JBQWtCLENBQUM7d0JBQ2hELEtBQUssdUJBQXVCLENBQUMsMEJBQTBCOzRCQUN0RCxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzs0QkFDM0IsTUFBTTtvQkFDUixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsTUFBTSw4QkFBOEIsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFFNUgseUVBQXlFO2dCQUN6RSwwRUFBMEU7Z0JBQzFFLHFEQUFxRDtnQkFDckQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FDOUIsU0FBUyxDQUFDLEdBQUcsRUFDYixJQUFJLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxFQUMzQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFDL0QsOEJBQThCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FDL0QsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixJQUFJLENBQUMsOEJBQThCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNGLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxJQUFXO1FBQ2pDLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUN4RCxJQUFJLENBQUMsOEJBQThCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE9BQXdEO1FBQ2hGLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUV0SCxzRkFBc0Y7WUFDdEYsMEVBQTBFO1lBQzFFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUMsR0FBRyxFQUFFO2dCQUNsRCxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZixDQUFDLENBQUMsQ0FBQztZQUVILHVEQUF1RDtZQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRWhFLDBFQUEwRTtZQUMxRSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDckIsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDOUQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzVGLENBQUM7WUFDRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUNoQyxDQUFDO2FBQU0sQ0FBQztZQUNQLG1GQUFtRjtZQUNuRixtRkFBbUY7WUFDbkYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsK0JBQStCLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2xILE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUNyQixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUE0QjtRQUNsRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLG1DQUFtQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFbkYsSUFBSSxhQUFhLENBQUMsTUFBTSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3pDLHNGQUFzRjtZQUN0RiwwRUFBMEU7WUFDMUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtnQkFDdEMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDN0MsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRUQsS0FBSyxDQUFDLGdCQUFnQixDQUFDLGFBQTRCO1FBQ2xELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFdEMsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsbUNBQW1DLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sVUFBVSxHQUFHLE1BQU0sR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMzQyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0NBQ0QsQ0FBQTtBQWhLWSwyQkFBMkI7SUFVckMsV0FBQSxtQ0FBbUMsQ0FBQTtJQUNuQyxXQUFBLG1CQUFtQixDQUFBO0dBWFQsMkJBQTJCLENBZ0t2QyJ9