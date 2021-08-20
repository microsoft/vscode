/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI, UriComponents } from 'vs/base/common/uri';
import { BoundModelReferenceCollection } from 'vs/workbench/api/browser/mainThreadDocuments';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { ExtHostContext, ExtHostNotebookDocumentsShape, IExtHostContext, MainThreadNotebookDocumentsShape, NotebookCellDto, NotebookCellsChangedEventDto, NotebookDataDto } from '../common/extHost.protocol';
import { MainThreadNotebooksAndEditors } from 'vs/workbench/api/browser/mainThreadNotebookDocumentsAndEditors';
import { NotebookDto } from 'vs/workbench/api/browser/mainThreadNotebookDto';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';

export class MainThreadNotebookDocuments implements MainThreadNotebookDocumentsShape {

	private readonly _disposables = new DisposableStore();

	private readonly _proxy: ExtHostNotebookDocumentsShape;
	private readonly _documentEventListenersMapping = new ResourceMap<DisposableStore>();
	private readonly _modelReferenceCollection: BoundModelReferenceCollection;

	constructor(
		extHostContext: IExtHostContext,
		notebooksAndEditors: MainThreadNotebooksAndEditors,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookDocuments);
		this._modelReferenceCollection = new BoundModelReferenceCollection(this._uriIdentityService.extUri);

		notebooksAndEditors.onDidAddNotebooks(this._handleNotebooksAdded, this, this._disposables);
		notebooksAndEditors.onDidRemoveNotebooks(this._handleNotebooksRemoved, this, this._disposables);

		// forward dirty and save events
		this._disposables.add(this._notebookEditorModelResolverService.onDidChangeDirty(model => this._proxy.$acceptDirtyStateChanged(model.resource, model.isDirty())));
		this._disposables.add(this._notebookEditorModelResolverService.onDidSaveNotebook(e => this._proxy.$acceptModelSaved(e)));
	}

	dispose(): void {
		this._disposables.dispose();
		this._modelReferenceCollection.dispose();
		dispose(this._documentEventListenersMapping.values());
	}

	private _handleNotebooksAdded(notebooks: readonly NotebookTextModel[]): void {

		for (const textModel of notebooks) {
			const disposableStore = new DisposableStore();
			disposableStore.add(textModel.onDidChangeContent(event => {

				const eventDto: NotebookCellsChangedEventDto = {
					versionId: event.versionId,
					rawEvents: []
				};

				for (const e of event.rawEvents) {

					switch (e.kind) {
						case NotebookCellsChangeType.ModelChange:
							eventDto.rawEvents.push({
								kind: e.kind,
								changes: e.changes.map(diff => [diff[0], diff[1], diff[2].map(cell => NotebookDto.toNotebookCellDto(cell as NotebookCellTextModel))] as [number, number, NotebookCellDto[]])
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
						case NotebookCellsChangeType.ChangeLanguage:
						case NotebookCellsChangeType.ChangeCellMetadata:
						case NotebookCellsChangeType.ChangeCellInternalMetadata:
							eventDto.rawEvents.push(e);
							break;
					}
				}

				// using the model resolver service to know if the model is dirty or not.
				// assuming this is the first listener it can mean that at first the model
				// is marked as dirty and that another event is fired
				this._proxy.$acceptModelChanged(
					textModel.uri,
					new SerializableObjectWithBuffers(eventDto),
					this._notebookEditorModelResolverService.isDirty(textModel.uri)
				);

				const hasDocumentMetadataChangeEvent = event.rawEvents.find(e => e.kind === NotebookCellsChangeType.ChangeDocumentMetadata);
				if (hasDocumentMetadataChangeEvent) {
					this._proxy.$acceptDocumentPropertiesChanged(textModel.uri, { metadata: textModel.metadata });
				}
			}));

			this._documentEventListenersMapping.set(textModel.uri, disposableStore);
		}
	}

	private _handleNotebooksRemoved(uris: URI[]): void {
		for (const uri of uris) {
			this._documentEventListenersMapping.get(uri)?.dispose();
			this._documentEventListenersMapping.delete(uri);
		}
	}


	async $tryCreateNotebook(options: { viewType: string, content?: NotebookDataDto }): Promise<UriComponents> {
		const ref = await this._notebookEditorModelResolverService.resolve({ untitledResource: undefined }, options.viewType);

		// untitled notebooks are disposed when they get saved. we should not hold a reference
		// to such a disposed notebook and therefore dispose the reference as well
		ref.object.notebook.onWillDispose(() => {
			ref.dispose();
		});

		// untitled notebooks are dirty by default
		this._proxy.$acceptDirtyStateChanged(ref.object.resource, true);

		// apply content changes... slightly HACKY -> this triggers a change event
		if (options.content) {
			const data = NotebookDto.fromNotebookDataDto(options.content);
			ref.object.notebook.reset(data.cells, data.metadata, ref.object.notebook.transientOptions);
		}
		return ref.object.resource;
	}

	async $tryOpenNotebook(uriComponents: UriComponents): Promise<URI> {
		const uri = URI.revive(uriComponents);
		const ref = await this._notebookEditorModelResolverService.resolve(uri, undefined);
		this._modelReferenceCollection.add(uri, ref);
		return uri;
	}

	async $trySaveNotebook(uriComponents: UriComponents) {
		const uri = URI.revive(uriComponents);

		const ref = await this._notebookEditorModelResolverService.resolve(uri);
		const saveResult = await ref.object.save();
		ref.dispose();
		return saveResult;
	}
}
