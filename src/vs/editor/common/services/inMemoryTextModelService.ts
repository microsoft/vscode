/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { Disposable, IDisposable, IReference, ReferenceCollection } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILanguageSelection } from '../languages/language.js';
import { ITextBufferFactory, ITextModel, ITextSnapshot } from '../model.js';
import { IModelService } from './model.js';
import { IResolvedTextEditorModel, ITextModelService } from './resolverService.js';

export class InMemoryTextModelService implements ITextModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _models: InMemoryModelCollection;

	constructor(
		@IModelService modelService: IModelService
	) {
		this._models = new InMemoryModelCollection(modelService);
	}

	public createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		return this._acquire(resource);
	}

	public createSyntheticDocument(value: string | ITextBufferFactory, languageSelection: ILanguageSelection | null): Promise<IReference<IResolvedTextEditorModel>> {
		const resource = URI.from({ scheme: Schemas.inMemory, path: `/synthetic/${generateUuid()}` });
		return this._acquire(resource, value, languageSelection);
	}

	private async _acquire(resource: URI, value?: string | ITextBufferFactory, languageSelection: ILanguageSelection | null = null): Promise<IReference<IResolvedTextEditorModel>> {
		const reference = this._models.acquire(resource.toString(), value, languageSelection);
		try {
			// The entry must exist before model creation, and reentrant opens must
			// wait for its lazy factory to finish.
			await Promise.resolve();
			return { object: reference.object.value, dispose: () => reference.dispose() };
		} catch (error) {
			reference.dispose();
			throw error;
		}
	}

	public registerTextModelContentProvider(): IDisposable {
		return Disposable.None;
	}

	public canHandleResource(): boolean {
		return false;
	}
}

class InMemoryModelCollection extends ReferenceCollection<Lazy<SimpleModel>> {
	constructor(private readonly _modelService: IModelService) {
		super();
	}

	protected createReferencedObject(key: string, value?: string | ITextBufferFactory, languageSelection: ILanguageSelection | null = null): Lazy<SimpleModel> {
		return new Lazy(() => {
			const resource = URI.parse(key);
			const model = value === undefined
				? this._modelService.getModel(resource)
				: this._modelService.createModel(value, languageSelection, resource);
			if (!model) {
				throw new Error('Model not found');
			}
			return new SimpleModel(model, value !== undefined);
		});
	}

	protected destroyReferencedObject(_key: string, model: Lazy<SimpleModel>): void {
		model.rawValue?.dispose();
	}
}

class SimpleModel extends Disposable implements IResolvedTextEditorModel {
	private readonly _onWillDispose = this._register(new Emitter<void>());
	public readonly onWillDispose = this._onWillDispose.event;

	constructor(
		public readonly textEditorModel: ITextModel,
		private readonly _ownsModel: boolean,
	) {
		super();
	}

	public async resolve(): Promise<void> { }

	public createSnapshot(): ITextSnapshot {
		return this.textEditorModel.createSnapshot();
	}

	public isReadonly(): boolean {
		return false;
	}

	public override dispose(): void {
		if (this.isDisposed()) {
			return;
		}
		this._onWillDispose.fire();
		super.dispose();
		if (this._ownsModel) {
			this.textEditorModel.dispose();
		}
	}

	public isDisposed(): boolean {
		return this._store.isDisposed;
	}

	public isResolved(): boolean {
		return true;
	}

	public getLanguageId(): string | undefined {
		return this.textEditorModel.getLanguageId();
	}
}
