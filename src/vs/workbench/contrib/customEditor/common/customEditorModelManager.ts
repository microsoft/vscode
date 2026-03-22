/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICustomEditorModel, ICustomEditorModelManager } from './customEditor.js';

export class CustomEditorModelManager implements ICustomEditorModelManager {

	private readonly _references = new Map<string, {
		readonly viewType: string;
		readonly model: Promise<ICustomEditorModel>;
		counter: number;
	}>();

	public async getAllModels(resource: URI): Promise<ICustomEditorModel[]> {
		const keyStart = `${resource.toString()}@@@`;
		const models = [];
		for (const [key, entry] of this._references) {
			if (key.startsWith(keyStart) && entry.model) {
				models.push(await entry.model);
			}
		}
		return models;
	}
	public async get(resource: URI, viewType: string): Promise<ICustomEditorModel | undefined> {
		const key = this.key(resource, viewType);
		const entry = this._references.get(key);
		return entry?.model;
	}

	public tryRetain(resource: URI, viewType: string): Promise<IReference<ICustomEditorModel>> | undefined {
		const key = this.key(resource, viewType);

		const entry = this._references.get(key);
		if (!entry) {
			return undefined;
		}

		entry.counter++;

		return entry.model.then(model => {
			return {
				object: model,
				dispose: createSingleCallFunction(() => {
					if (--entry.counter <= 0) {
						entry.model.then(x => x.dispose());
						this._references.delete(key);
					}
				}),
			};
		});
	}

	public add(resource: URI, viewType: string, model: Promise<ICustomEditorModel>): Promise<IReference<ICustomEditorModel>> {
		const key = this.key(resource, viewType);
		const existing = this._references.get(key);
		if (existing) {
			throw new Error('Model already exists');
		}

		const trackedModel = model.then(undefined, error => {
			// Model creation can fail (for example if the backing file does not exist).
			// In that case, clear the cached entry so a subsequent open can retry model creation.
			if (this._references.get(key)?.model === trackedModel) {
				this._references.delete(key);
			}
			throw error;
		});
		this._references.set(key, { viewType, model: trackedModel, counter: 0 });
		return this.tryRetain(resource, viewType)!;
	}

	public disposeAllModelsForView(viewType: string): void {
		for (const [key, value] of this._references) {
			if (value.viewType === viewType) {
				value.model.then(x => x.dispose());
				this._references.delete(key);
			}
		}
	}

	private key(resource: URI, viewType: string): string {
		return `${resource.toString()}@@@${viewType}`;
	}
}
