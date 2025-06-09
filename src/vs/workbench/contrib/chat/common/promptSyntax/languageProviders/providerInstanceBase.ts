/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService, TSharedPrompt } from '../service/promptsService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ObservableDisposable } from '../utils/observableDisposable.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';

/**
 * Abstract base class for all reusable prompt file providers.
 */
export abstract class ProviderInstanceBase extends ObservableDisposable {
	/**
	 * Function that is called when the prompt parser is settled.
	 */
	protected abstract onPromptSettled(error: Error | undefined, token: CancellationToken): this;

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

		this._register(
			this.parser.onDispose(this.dispose.bind(this)),
		);

		let cancellationSource = new CancellationTokenSource();
		this._register(
			this.parser.onSettled((error) => {
				cancellationSource.dispose(true);
				cancellationSource = new CancellationTokenSource();

				this.onPromptSettled(error, cancellationSource.token);
			}),
		);

		this.parser.start();
	}
}
