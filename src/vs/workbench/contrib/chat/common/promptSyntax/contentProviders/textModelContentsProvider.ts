/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { TextModel } from '../../../../../../editor/common/model/textModel.js';
import { IModelContentChangedEvent } from '../../../../../../editor/common/textModelEvents.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { objectStreamFromTextModel } from '../codecs/base/utils/objectStreamFromTextModel.js';
import { FilePromptContentProvider } from './filePromptContentsProvider.js';
import { IPromptContentsProviderOptions, PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { IPromptContentsProvider } from './types.js';

/**
 * Prompt contents provider for a {@link ITextModel} instance.
 */
export class TextModelContentsProvider extends PromptContentsProviderBase<IModelContentChangedEvent> {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	public get uri(): URI {
		return this.model.uri;
	}

	public override get sourceName(): string {
		return 'text-model';
	}

	public override get languageId(): string {
		return this.model.getLanguageId();
	}

	constructor(
		private readonly model: ITextModel,
		options: Partial<IPromptContentsProviderOptions>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(options);

		this._register(this.model.onWillDispose(this.dispose.bind(this)));
		this._register(
			this.model.onDidChangeContent(this.onChangeEmitter.fire.bind(this.onChangeEmitter)),
		);
	}

	/**
	 * Creates a stream of binary data from the text model based on the changes
	 * listed in the provided event.
	 *
	 * Note! this method implements a basic logic which does not take into account
	 * 		 the `_event` argument for incremental updates. This needs to be improved.
	 *
	 * @param _event - event that describes the changes in the text model; `'full'` is
	 * 				   the special value that means that all contents have changed
	 * @param cancellationToken - token that cancels this operation
	 */
	protected override async getContentsStream(
		_event: IModelContentChangedEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream> {
		return objectStreamFromTextModel(this.model, cancellationToken);
	}

	public override createNew(
		promptContentsSource: TextModel | { uri: URI },
		options: Partial<IPromptContentsProviderOptions> = {},
	): IPromptContentsProvider {
		if (promptContentsSource instanceof TextModel) {
			return this.instantiationService.createInstance(
				TextModelContentsProvider,
				promptContentsSource,
				options,
			);
		}

		return this.instantiationService.createInstance(
			FilePromptContentProvider,
			promptContentsSource.uri,
			options,
		);
	}

	/**
	 * String representation of this object.
	 */
	public override toString(): string {
		return `text-model-prompt-contents-provider:${this.uri.path}`;
	}
}
