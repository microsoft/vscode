/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProviderInstanceBase } from './providerInstanceBase.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../../base/common/objectCache.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../../constants.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { IDiffEditor, IEditor, IEditorModel } from '../../../../../../../editor/common/editorCommon.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';

/**
 * Type for a text editor that is used for reusable prompt files.
 */
export interface IPromptFileEditor extends IEditor {
	readonly getModel: () => ITextModel;
}

/**
 * A generic base class that manages creation and disposal of {@link TInstance}
 * objects for each specific editor object that is used for reusable prompt files.
 */
export abstract class ProviderInstanceManagerBase<TInstance extends ProviderInstanceBase> extends Disposable {
	/**
	 * Currently available {@link TInstance} instances.
	 */
	private readonly instances: ObjectCache<TInstance, ITextModel>;

	/**
	 * Class object of the managed {@link TInstance}.
	 */
	protected abstract get InstanceClass(): new (editor: ITextModel, ...args: any[]) => TInstance;

	constructor(
		@IModelService modelService: IModelService,
		@IEditorService editorService: IEditorService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		// cache of managed instances
		this.instances = this._register(
			new ObjectCache((model: ITextModel) => {
				// sanity check - the new TS/JS discrepancies regarding fields initialization
				// logic mean that this can be `undefined` during runtime while defined in TS
				assertDefined(
					this.InstanceClass,
					'Instance class field must be defined.',
				);

				const instance: TInstance = initService.createInstance(
					this.InstanceClass,
					model,
				);

				// this is a sanity check and the contract of the object cache,
				// we must return a non-disposed object from this factory function
				instance.assertNotDisposed(
					'Created instance must not be disposed.',
				);

				return instance;
			}),
		);

		// if the feature is disabled, do not create any providers
		if (PromptsConfig.enabled(configService) === false) {
			return;
		}

		// subscribe to changes of the active editor
		this._register(editorService.onDidActiveEditorChange(() => {
			const { activeTextEditorControl } = editorService;
			if (activeTextEditorControl === undefined) {
				return;
			}

			this.handleNewEditor(activeTextEditorControl);
		}));

		// handle existing visible text editors
		editorService
			.visibleTextEditorControls
			.forEach(this.handleNewEditor.bind(this));

		// subscribe to "language change" events for all models
		this._register(
			modelService.onModelLanguageChanged((event) => {
				const { model, oldLanguageId } = event;

				// if language is set to `prompt` or `instructions` language, handle that model
				if (isPromptFileModel(model)) {
					this.instances.get(model);
					return;
				}

				// if the language is changed away from `prompt` or `instructions`,
				// remove and dispose provider for this model
				if (isPromptOrInstructionsFile(oldLanguageId)) {
					this.instances.remove(model, true);
					return;
				}
			}),
		);
	}

	/**
	 * Initialize a new {@link TInstance} for the given editor.
	 */
	private handleNewEditor(editor: IEditor | IDiffEditor): this {
		const model = editor.getModel();
		if (model === null) {
			return this;
		}

		if (isPromptFileModel(model) === false) {
			return this;
		}

		// note! calling `get` also creates a provider if it does not exist;
		// 		and the provider is auto-removed when the editor is disposed
		this.instances.get(model);

		return this;
	}
}

/**
 * Check if provided language ID is either
 * the `prompt` or `instructions` one.
 */
const isPromptOrInstructionsFile = (
	languageId: string,
): boolean => {
	return (languageId === PROMPT_LANGUAGE_ID) || (languageId === INSTRUCTIONS_LANGUAGE_ID);
};

/**
 * Check if a provided model is used for prompt files.
 */
const isPromptFileModel = (
	model: IEditorModel,
): model is ITextModel => {
	// we support only `text editors` for now so filter out `diff` ones
	if ('modified' in model || 'model' in model) {
		return false;
	}

	if (model.isDisposed()) {
		return false;
	}

	if (isPromptOrInstructionsFile(model.getLanguageId()) === false) {
		return false;
	}

	return true;
};
