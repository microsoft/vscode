/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { INotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { DisposableStore, IDisposable, IReference, ReferenceCollection } from 'vs/base/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ILogService } from 'vs/platform/log/common/log';
import { Event } from 'vs/base/common/event';

export const INotebookEditorModelResolverService = createDecorator<INotebookEditorModelResolverService>('INotebookModelResolverService');

export interface INotebookEditorModelResolverService {
	readonly _serviceBrand: undefined;
	resolve(resource: URI, viewType?: string): Promise<IReference<INotebookEditorModel>>;
}


export class NotebookModelReferenceCollection extends ReferenceCollection<Promise<INotebookEditorModel>> {

	constructor(
		@IInstantiationService readonly _instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	protected createReferencedObject(key: string, viewType: string): Promise<INotebookEditorModel> {
		const uri = URI.parse(key);
		const model = this._instantiationService.createInstance(NotebookEditorModel, uri, viewType);
		const promise = model.load();
		return promise;
	}

	protected destroyReferencedObject(_key: string, object: Promise<INotebookEditorModel>): void {
		object.then(model => {
			this._notebookService.destoryNotebookDocument(model.viewType, model.notebook);
			model.dispose();
		}).catch(err => {
			this._logService.critical('FAILED to destory notebook', err);
		});
	}
}

export class NotebookModelResolverService implements INotebookEditorModelResolverService {

	readonly _serviceBrand: undefined;

	private readonly _data: NotebookModelReferenceCollection;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService
	) {
		this._data = instantiationService.createInstance(NotebookModelReferenceCollection);
	}

	async resolve(resource: URI, viewType?: string): Promise<IReference<INotebookEditorModel>> {

		const existingViewType = this._notebookService.getNotebookTextModel(resource)?.viewType;
		if (!viewType) {
			if (existingViewType) {
				viewType = existingViewType;
			} else {
				const providers = this._notebookService.getContributedNotebookProviders(resource);
				const exclusiveProvider = providers.find(provider => provider.exclusive);
				viewType = exclusiveProvider?.id || providers[0]?.id;
			}
		}

		if (!viewType) {
			throw new Error(`Missing viewType for '${resource}'`);
		}

		if (existingViewType && existingViewType !== viewType) {
			throw new Error(`A notebook with view type '${existingViewType}' already exists for '${resource}', CANNOT create another notebook with view type ${viewType}`);
		}

		const reference = this._data.acquire(resource.toString(), viewType);
		const model = await reference.object;
		NotebookModelResolverService._autoReferenceDirtyModel(model, () => this._data.acquire(resource.toString(), viewType));
		return {
			object: model,
			dispose() { reference.dispose(); }
		};
	}

	private static _autoReferenceDirtyModel(model: INotebookEditorModel, ref: () => IDisposable) {

		const references = new DisposableStore();
		const listener = model.onDidChangeDirty(() => {
			if (model.isDirty()) {
				references.add(ref());
			} else {
				references.clear();
			}
		});

		Event.once(model.notebook.onWillDispose)(() => {
			listener.dispose();
			references.dispose();
		});
	}
}
