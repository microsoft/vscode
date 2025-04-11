/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PROMPT_LANGUAGE_ID } from '../../constants.js';
import { ProviderInstanceBase } from './providerInstanceBase.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../../base/common/objectCache.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { IDiffEditor, IEditor } from '../../../../../../../editor/common/editorCommon.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
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
	private readonly instances: ObjectCache<TInstance, IPromptFileEditor>;

	/**
	 * Class object of the managed {@link TInstance}.
	 */
	protected abstract get InstanceClass(): new (editor: IPromptFileEditor, ...args: any[]) => TInstance;

	constructor(
		@IEditorService editorService: IEditorService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		// cache of managed instances
		this.instances = this._register(
			new ObjectCache((editor: IPromptFileEditor) => {
				// sanity check - the new TS/JS discrepancies regarding fields initialization
				// logic mean that this can be `undefined` during runtime while defined in TS
				assertDefined(
					this.InstanceClass,
					'Instance class field must be defined.',
				);

				const instance: TInstance = initService.createInstance(
					this.InstanceClass,
					editor,
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
	}

	/**
	 * Initialize a new {@link TInstance} for the given editor.
	 */
	private handleNewEditor(editor: IEditor | IDiffEditor): this {
		if (isPromptFileEditor(editor) === false) {
			return this;
		}

		// note! calling `get` also creates a provider if it does not exist;
		// 		and the provider is auto-removed when the editor is disposed
		this.instances.get(editor);

		return this;
	}
}

/**
 * Check if a provided editor is a text editor that is used for reusable
 * prompt files.
 */
const isPromptFileEditor = (
	editor: IEditor | IDiffEditor,
): editor is IPromptFileEditor => {
	const model = editor.getModel();
	if (model === null) {
		return false;
	}

	// we support only `text editors` for now so filter out `diff` ones
	if ('modified' in model || 'model' in model) {
		return false;
	}

	if (model.isDisposed()) {
		return false;
	}

	if (model.getLanguageId() !== PROMPT_LANGUAGE_ID) {
		return false;
	}

	// override the `getModel()` method to align with the `IPromptFileEditor` interface
	// which guarantees that the `getModel()` always returns a non-null model
	editor.getModel = () => {
		return model;
	};

	return true;
};
