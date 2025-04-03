/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ObjectCache } from '../../../../../../../base/common/objectCache.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { isPromptFile } from '../../../../../../../platform/prompts/common/constants.js';
import { IDiffEditor, IEditor } from '../../../../../../../editor/common/editorCommon.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { ObservableDisposable } from '../../../../../../../base/common/observableDisposable.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';

/**
 * A generic base class that manages creation and disposal of {@link TInstance}
 * objects for each specific editor object that is used for reusable prompt files.
 */
export abstract class PromptLinkDiagnosticsInstanceManager<TInstance extends ObservableDisposable> extends Disposable {
	/**
	 * Currently available {@link TInstance} instances.
	 */
	private readonly instances: ObjectCache<TInstance, IEditor>;

	/**
	 * Class object of the managed {@link TInstance}.
	 */
	protected abstract readonly InstanceClass: new (editor: IEditor, ...args: any[]) => TInstance;

	constructor(
		@IEditorService editorService: IEditorService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		// cache of managed instances
		this.instances = this._register(
			new ObjectCache((editor: IEditor) => {
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
		const model = editor.getModel();
		if (model === null) {
			return this;
		}

		// we support only `text editors` for now so filter out `diff` ones
		if ('modified' in model || 'model' in model) {
			return this;
		}

		// enable this only for prompt file editors
		if (isPromptFile(model.uri) === false) {
			return this;
		}

		// note! calling `get` also creates a provider if it does not exist;
		// 		and the provider is auto-removed when the editor is disposed
		this.instances.get(editor);

		return this;
	}
}
