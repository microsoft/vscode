/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { PromptParser } from '../../common/promptSyntax/parsers/promptParser.js';
import { BasePromptParser } from '../../common/promptSyntax/parsers/basePromptParser.js';
import { ObservableDisposable } from '../../../../../base/common/observableDisposable.js';
import { IPromptContentsProvider } from '../../common/promptSyntax/contentProviders/types.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Type for a generic prompt parser object.
 */
type TPromptParser = BasePromptParser<IPromptContentsProvider>;

/**
 * Model for a single chat prompt instructions attachment.
 */
export class ChatPromptAttachmentModel extends ObservableDisposable {
	/**
	 * Private reference of the underlying prompt instructions
	 * reference instance.
	 */
	private readonly _reference: TPromptParser;

	/**
	 * Get the prompt instructions reference instance.
	 */
	public get reference(): TPromptParser {
		return this._reference;
	}

	/**
	 * Get `URI` for the main reference and `URI`s of all valid child
	 * references it may contain, including reference of this model itself.
	 */
	public get references(): readonly URI[] {
		const { reference } = this;
		const { errorCondition } = reference;

		// return no references if the attachment is disabled
		// or if this object itself has an error
		if (errorCondition) {
			return [];
		}

		// otherwise return `URI` for the main reference and
		// all valid child `URI` references it may contain
		return [
			...reference.allValidReferencesUris,
			reference.uri,
		];
	}

	/**
	 * Get list of all tools associated with the prompt.
	 *
	 * Note! This property returns pont-in-time state of the tools metadata
	 *       and does not take into account if the prompt or its nested child
	 *       references are still being resolved. Please use the {@link settled}
	 *       or {@link allSettled} properties if you need to retrieve the final
	 *       list of the tools available.
	 */
	public get toolsMetadata(): readonly string[] | null {
		return this.reference.allToolsMetadata;
	}

	/**
	 * Promise that resolves when the prompt is fully parsed,
	 * including all its possible nested child references.
	 */
	public get allSettled(): Promise<TPromptParser> {
		return this.reference.allSettled();
	}

	/**
	 * Get the top-level error of the prompt instructions
	 * reference, if any.
	 */
	public get topError() {
		return this.reference.topError;
	}

	/**
	 * Event that fires when the error condition of the prompt
	 * reference changes.
	 *
	 * See {@link onUpdate}.
	 */
	protected _onUpdate = this._register(new Emitter<void>());
	/**
	 * Subscribe to the `onUpdate` event.
	 * @param callback Function to invoke on update.
	 */
	public onUpdate(callback: () => unknown): IDisposable {
		return this._onUpdate.event(callback);
	}

	constructor(
		public readonly uri: URI,
		@IInstantiationService private readonly initService: IInstantiationService,
	) {
		super();

		this._reference = this._register(
			this.initService.createInstance(
				PromptParser,
				this.uri,
				// in this case we know that the attached file must have been a
				// prompt file, hence we pass the `allowNonPromptFiles` option
				// to the provider to allow for non-prompt files to be attached
				{ allowNonPromptFiles: true },
			)
		);

		this._reference.onUpdate(
			this._onUpdate.fire.bind(this._onUpdate),
		);
	}

	/**
	 * Start resolving the prompt instructions reference and child references
	 * that it may contain.
	 */
	public resolve(): this {
		this._reference.start();

		return this;
	}
}
