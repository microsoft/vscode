/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncReferenceCollection, IReference, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { IModifiedFileEntry } from '../../../../chat/common/chatEditingService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';


export const INotebookOriginalModelReferenceFactory = createDecorator<INotebookOriginalModelReferenceFactory>('INotebookOriginalModelReferenceFactory');

export interface INotebookOriginalModelReferenceFactory {
	readonly _serviceBrand: undefined;
	getOrCreate(fileEntry: IModifiedFileEntry, viewType: string): Promise<IReference<NotebookTextModel>>;
}


export class OriginalNotebookModelReferenceCollection extends ReferenceCollection<Promise<NotebookTextModel>> {
	private readonly modelsToDispose = new Set<string>();
	constructor(@INotebookService private readonly notebookService: INotebookService) {
		super();
	}

	protected override async createReferencedObject(key: string, fileEntry: IModifiedFileEntry, viewType: string): Promise<NotebookTextModel> {
		this.modelsToDispose.delete(key);
		const uri = fileEntry.originalURI;
		const model = this.notebookService.getNotebookTextModel(uri);
		if (model) {
			return model;
		}
		const bytes = VSBuffer.fromString(fileEntry.originalModel.getValue());
		const stream = bufferToStream(bytes);

		return this.notebookService.createNotebookTextModel(viewType, uri, stream);
	}
	protected override destroyReferencedObject(key: string, modelPromise: Promise<NotebookTextModel>): void {
		this.modelsToDispose.add(key);

		(async () => {
			try {
				const model = await modelPromise;

				if (!this.modelsToDispose.has(key)) {
					// return if model has been acquired again meanwhile
					return;
				}

				// Finally we can dispose the model
				model.dispose();
			} catch (error) {
				// ignore
			} finally {
				this.modelsToDispose.delete(key); // Untrack as being disposed
			}
		})();
	}
}

export class NotebookOriginalModelReferenceFactory implements INotebookOriginalModelReferenceFactory {
	readonly _serviceBrand: undefined;
	private _resourceModelCollection: OriginalNotebookModelReferenceCollection & ReferenceCollection<Promise<NotebookTextModel>> /* TS Fail */ | undefined = undefined;
	private get resourceModelCollection() {
		if (!this._resourceModelCollection) {
			this._resourceModelCollection = this.instantiationService.createInstance(OriginalNotebookModelReferenceCollection);
		}

		return this._resourceModelCollection;
	}

	private _asyncModelCollection: AsyncReferenceCollection<NotebookTextModel> | undefined = undefined;
	private get asyncModelCollection() {
		if (!this._asyncModelCollection) {
			this._asyncModelCollection = new AsyncReferenceCollection(this.resourceModelCollection);
		}

		return this._asyncModelCollection;
	}

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	getOrCreate(fileEntry: IModifiedFileEntry, viewType: string): Promise<IReference<NotebookTextModel>> {
		return this.asyncModelCollection.acquire(fileEntry.originalURI.toString(), fileEntry, viewType);
	}
}

