/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITextFileEditorModelManager} from 'vs/workbench/parts/files/common/files';
import {dispose, IDisposable} from 'vs/base/common/lifecycle';

export class TextFileEditorModelManager implements ITextFileEditorModelManager {
	private mapResourceToDisposeListener: { [resource: string]: IDisposable; };
	private mapResourcePathToModel: { [resource: string]: TextFileEditorModel; };

	constructor() {
		this.mapResourcePathToModel = Object.create(null);
		this.mapResourceToDisposeListener = Object.create(null);
	}

	public dispose(resource: URI): void {
		const model = this.get(resource);
		if (model) {
			if (model.isDirty()) {
				return; // we never dispose dirty models to avoid data loss
			}

			model.dispose();
		}
	}

	public get(resource: URI): TextFileEditorModel {
		return this.mapResourcePathToModel[resource.toString()];
	}

	public getAll(resource?: URI): TextFileEditorModel[] {
		return Object.keys(this.mapResourcePathToModel)
			.filter(r => !resource || resource.toString() === r)
			.map(r => this.mapResourcePathToModel[r]);
	}

	public add(resource: URI, model: TextFileEditorModel): void {
		const knownModel = this.mapResourcePathToModel[resource.toString()];
		if (knownModel === model) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			disposeListener.dispose();
		}

		// store in cache but remove when model gets disposed
		this.mapResourcePathToModel[resource.toString()] = model;
		this.mapResourceToDisposeListener[resource.toString()] = model.addListener2('dispose', () => this.remove(resource));
	}

	public remove(resource: URI): void {
		delete this.mapResourcePathToModel[resource.toString()];

		const disposeListener = this.mapResourceToDisposeListener[resource.toString()];
		if (disposeListener) {
			dispose(disposeListener);
			delete this.mapResourceToDisposeListener[resource.toString()];
		}
	}

	public clear(): void {

		// model cache
		this.mapResourcePathToModel = Object.create(null);

		// dispose listeners
		const keys = Object.keys(this.mapResourceToDisposeListener);
		dispose(keys.map(k => this.mapResourceToDisposeListener[k]));
		this.mapResourceToDisposeListener = Object.create(null);
	}
}