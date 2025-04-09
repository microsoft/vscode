/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../../service/types.js';
import { IPromptFileEditor } from './providerInstanceManagerBase.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { TextModelPromptParser } from '../../parsers/textModelPromptParser.js';
import { ObservableDisposable } from '../../../../../../../base/common/observableDisposable.js';

/**
 * Abstract base class for all reusable prompt file providers.
 */
export abstract class ProviderInstanceBase extends ObservableDisposable {
	/**
	 * Function that is called when the prompt parser is updated.
	 */
	protected abstract onPromptParserUpdate(): Promise<this>;

	/**
	 * Returns a string representation of this object.
	 */
	public abstract override toString(): string;

	/**
	 * The prompt parser instance.
	 */
	protected readonly parser: TextModelPromptParser;

	constructor(
		protected readonly editor: IPromptFileEditor,
		@IPromptsService promptsService: IPromptsService,
	) {
		super();

		this.parser = promptsService.getSyntaxParserFor(this.model);
		this.parser.onUpdate(this.onPromptParserUpdate.bind(this));
		this.parser.onDispose(this.dispose.bind(this));
		this.parser.start();

		// initialize an update
		this.onPromptParserUpdate();
	}

	/**
	 * Underlying text model of the editor.
	 */
	protected get model(): ITextModel {
		return this.editor.getModel();
	}
}
