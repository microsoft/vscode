/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommonCodeEditor, IModel, EditorType, IEditor as ICommonEditor } from 'vs/editor/common/editorCommon';
import { IDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextEditorModel, IEditorInput } from 'vs/platform/editor/common/editor';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { sequence } from 'vs/base/common/async';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import network = require('vs/base/common/network');
import { ITextModelResolverService, ITextModelContentProvider, IResolveOptions } from 'vs/platform/textmodelResolver/common/resolver';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import types = require('vs/base/common/types');
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor';

export class TextModelResolverService implements ITextModelResolverService {

	public _serviceBrand: any;

	private loadingTextModels: { [uri: string]: TPromise<IModel> } = Object.create(null);
	private contentProviderRegistry: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService
	) {
	}

	public resolve(resource: URI, options?: IResolveOptions): TPromise<ITextEditorModel> {

		// File Schema: use text file service
		if (resource.scheme === network.Schemas.file) {
			return this.textFileService.models.loadOrCreate(resource, options && options.encoding, false /* refresh */);
		}

		// Untitled Schema: go through cached input
		if (resource.scheme === UntitledEditorInput.SCHEMA) {
			return this.untitledEditorService.createOrGet(resource).resolve();
		}

		// In Memory: only works on the active editor
		if (resource.scheme === network.Schemas.inMemory) {
			return this.resolveInMemory(resource);
		}

		// Any other resource: use registry
		return this.resolveTextModelContent(this.modelService, resource).then(() => this.instantiationService.createInstance(ResourceEditorModel, resource));
	}

	private resolveInMemory(resource: URI): TPromise<ITextEditorModel> {

		// For in-memory resources we only support to resolve the input from the current active editor
		// because the workbench does not track editor models by in memory URL. This concept is only
		// being used in the code editor.
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const control = <ICommonEditor>activeEditor.getControl();
			if (types.isFunction(control.getEditorType)) {

				// Single Editor: If code editor model matches, return input from editor
				if (control.getEditorType() === EditorType.ICodeEditor) {
					const codeEditor = <ICodeEditor>control;
					const model = this.findModel(codeEditor, resource);
					if (model) {
						return this.resolveFromInput(activeEditor.input);
					}
				}

				// Diff Editor: If left or right code editor model matches, return associated input
				else if (control.getEditorType() === EditorType.IDiffEditor) {
					const diffInput = <DiffEditorInput>activeEditor.input;
					const diffCodeEditor = <IDiffEditor>control;

					const originalModel = this.findModel(diffCodeEditor.getOriginalEditor(), resource);
					if (originalModel) {
						return this.resolveFromInput(diffInput.originalInput);
					}

					const modifiedModel = this.findModel(diffCodeEditor.getModifiedEditor(), resource);
					if (modifiedModel) {
						return this.resolveFromInput(diffInput.modifiedInput);
					}
				}
			}
		}

		return TPromise.as(null);
	}

	private resolveFromInput(input: IEditorInput): TPromise<ITextEditorModel> {
		if (input instanceof EditorInput) {
			return input.resolve();
		}

		return TPromise.as(null);
	}

	private findModel(editor: ICommonCodeEditor, resource: URI): IModel {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		return model.uri.toString() === resource.toString() ? model : null;
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		let array = this.contentProviderRegistry[scheme];
		if (!array) {
			array = [provider];
			this.contentProviderRegistry[scheme] = array;
		} else {
			array.unshift(provider);
		}

		const registry = this.contentProviderRegistry;
		return {
			dispose() {
				const array = registry[scheme];
				const idx = array.indexOf(provider);
				if (idx >= 0) {
					array.splice(idx, 1);
					if (array.length === 0) {
						delete registry[scheme];
					}
				}
			}
		};
	}

	private resolveTextModelContent(modelService: IModelService, resource: URI): TPromise<IModel> {
		const model = modelService.getModel(resource);
		if (model) {
			return TPromise.as(model);
		}

		let loadingTextModel = this.loadingTextModels[resource.toString()];
		if (!loadingTextModel) {

			// make sure we have a provider this scheme
			// the resource uses
			const contentProviders = this.contentProviderRegistry[resource.scheme];
			if (!contentProviders) {
				return TPromise.wrapError(`No model with uri '${resource}' nor a resolver for the scheme '${resource.scheme}'.`);
			}

			// load the model-content from the provider and cache
			// the loading such that we don't create the same model
			// twice
			this.loadingTextModels[resource.toString()] = loadingTextModel = new TPromise<IModel>((resolve, reject) => {
				let result: IModel;
				let lastError: any;

				sequence(contentProviders.map(provider => {
					return () => {
						if (!result) {
							const contentPromise = provider.provideTextContent(resource);
							if (!contentPromise) {
								return TPromise.wrapError<any>(`No resolver for the scheme '${resource.scheme}' found.`);
							}

							return contentPromise.then(value => {
								result = value;
							}, err => {
								lastError = err;
							});
						}
					};
				})).then(() => {
					if (!result && lastError) {
						reject(lastError);
					} else {
						resolve(result);
					}
				}, reject);

			}, function () {
				// no cancellation when caching promises
			});

			// remove the cached promise 'cos the model is now known to the model service (see above)
			loadingTextModel.then(() => delete this.loadingTextModels[resource.toString()], () => delete this.loadingTextModels[resource.toString()]);
		}

		return loadingTextModel;
	}
}