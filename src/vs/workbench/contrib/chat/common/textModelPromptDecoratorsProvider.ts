/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../editor/common/model.js';
import { IEditorModel } from '../../../../editor/common/editorCommon.js';
import { TextModelPromptDecorator } from './textModelPromptDecorator.js';
import { BasePromptParser } from './promptSyntax/parsers/basePromptParser.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * TODO: @legomushroom
 *
 * 	- move to the correct place
 * 	- add unit tests
 */

/**
 * Provider for prompt syntax decorators on text models.
 */
export class TextModelPromptDecoratorsProvider extends Disposable {
	/**
	 * Map of all currently active prompt decorator instances.
	 */
	private readonly decorators: DisposableMap<ITextModel, TextModelPromptDecorator> = this._register(new DisposableMap());

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		if (!BasePromptParser.promptSnippetsEnabled(configService)) {
			return;
		}

		this.deleteDecorator = this.deleteDecorator.bind(this);

		this._register(this.editorService.onDidActiveEditorChange(() => {
			const editorModel = this.editorService.activeTextEditorControl?.getModel();
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
	 * TODO: @legomushroom
	 */
	private handleModel(editorModel: IEditorModel): this {
		// we support only `text editors` for now so filter out `diff` ones
		if ('modified' in editorModel || 'model' in editorModel) {
			return this;
		}

		// enable this on editors for prompt snippet files
		if (!BasePromptParser.isPromptSnippet(editorModel.uri)) {
			return this;
		}

		let decorator = this.decorators.get(editorModel);
		// if a valid prompt editor exists, nothing to do
		if (decorator && !decorator.disposed) {
			return this;
		}

		// Note! TODO: @legomushroom - add description on why we check if disposed
		if (decorator?.disposed) {
			this.deleteDecorator(editorModel);
		}

		// add new prompt editor instance for this model
		decorator = this.instantiationService.createInstance(TextModelPromptDecorator, editorModel);
		this.decorators.set(editorModel, decorator);

		// automatically delete a disposed prompt editor
		decorator.onDispose(this.deleteDecorator.bind(this, editorModel));

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
