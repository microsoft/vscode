/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService, TSharedPrompt } from '../../service/types.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
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
	protected readonly parser: TSharedPrompt;

	constructor(
		protected readonly model: ITextModel,
		@IPromptsService promptsService: IPromptsService,
	) {
		super();

		this.parser = promptsService.getSyntaxParserFor(model);
		this.parser.onUpdate(this.onPromptParserUpdate.bind(this));
		this.parser.onDispose(this.dispose.bind(this));
		this.parser.start();

		// initialize an update
		this.onPromptParserUpdate();
	}
}
