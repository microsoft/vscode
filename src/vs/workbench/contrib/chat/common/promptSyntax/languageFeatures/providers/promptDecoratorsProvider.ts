/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../../editor/common/model.js';
import { TextModelPromptDecorator } from './textModelPromptDecorator.js';
import { IEditorModel } from '../../../../../../../editor/common/editorCommon.js';
import { isPromptFile } from '../../../../../../../platform/prompts/common/constants.js';
import { Disposable, DisposableMap } from '../../../../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Provider for prompt syntax decorators on text models.
 */
export class PromptDecoratorsInstanceManager extends Disposable {
	/**
	 * Map of all currently active prompt decorator instances.
	 */
	private readonly decorators: DisposableMap<ITextModel, TextModelPromptDecorator> = this._register(new DisposableMap());

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// TODO: @legomushroom - condition on promptFiles enablement

		this.deleteDecorator = this.deleteDecorator.bind(this);

		this._register(this.editorService.onDidActiveEditorChange(() => {
			const { activeTextEditorControl } = this.editorService;

			if (!activeTextEditorControl) {
				return;
			}

			const editorModel = activeTextEditorControl.getModel();
			if (!editorModel) {
				return;
			}

			this.handleModel(editorModel);
		}));

		this.editorService.visibleTextEditorControls.forEach((editor) => {
			const model = editor.getModel();
			if (!model) {
				return;
			}

			this.handleModel(model);
		});
	}

	/**
	 * Initialize the decorators provider for the given editor model,
	 * if the model drives a prompt file.
	 */
	private handleModel(editorModel: IEditorModel): this {
		// we support only `text editors` for now so filter out `diff` ones
		if ('modified' in editorModel || 'model' in editorModel) {
			return this;
		}

		// TODO: @legomushroom
		// editorModel.selec();

		// enable this on editors of reusable prompt files
		if (isPromptFile(editorModel.uri) === false) {
			return this;
		}

		let decorationsProvider = this.decorators.get(editorModel);

		// if a valid prompt editor exists, nothing to do
		if (decorationsProvider && (decorationsProvider.disposed === false)) {
			return this;
		}

		// if the decorator instance is already disposed, delete it
		if (decorationsProvider?.disposed) {
			this.deleteDecorator(editorModel);
		}

		// add new prompt editor instance for this model
		decorationsProvider = this.instantiationService.createInstance(TextModelPromptDecorator, editorModel);
		this.decorators.set(editorModel, decorationsProvider);

		// automatically delete a decorator reference when it is disposed
		decorationsProvider.onDispose(this.deleteDecorator.bind(this, editorModel));

		return this;
	}

	/**
	 * Delete and dispose specified editor model reference.
	 */
	private deleteDecorator(editorModel: ITextModel): this {
		this.decorators.deleteAndDispose(editorModel);

		return this;
	}
}
