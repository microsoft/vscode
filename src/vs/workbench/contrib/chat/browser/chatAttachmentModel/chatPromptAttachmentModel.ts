/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FilePromptParser } from '../../common/promptSyntax/parsers/filePromptParser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Model for a single chat prompt instructions attachment.
 */
export class ChatPromptAttachmentModel extends Disposable {
	/**
	 * Private reference of the underlying prompt instructions
	 * reference instance.
	 */
	private readonly _reference: FilePromptParser;
	/**
	 * Get the prompt instructions reference instance.
	 */
	public get reference(): FilePromptParser {
		return this._reference;
	}

	/**
	 * Get `URI` for the main reference and `URI`s of all valid child
	 * references it may contain, including reference of this model itself.
	 */
	public get references(): readonly URI[] {
		const { reference } = this;
		const { errorCondition } = this.reference;

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
	 * Promise that resolves when the prompt is fully parsed,
	 * including all its possible nested child references.
	 */
	public get allSettled(): Promise<FilePromptParser> {
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
	 * See {@linkcode onUpdate}.
	 */
	protected _onUpdate = this._register(new Emitter<void>());
	/**
	 * Subscribe to the `onUpdate` event.
	 * @param callback Function to invoke on update.
	 */
	public onUpdate(callback: () => unknown): this {
		this._register(this._onUpdate.event(callback));

		return this;
	}

	/**
	 * Event that fires when the object is disposed.
	 *
	 * See {@linkcode onDispose}.
	 */
	protected _onDispose = this._register(new Emitter<void>());
	/**
	 * Subscribe to the `onDispose` event.
	 * @param callback Function to invoke on dispose.
	 */
	public onDispose(callback: () => unknown): this {
		this._register(this._onDispose.event(callback));

		return this;
	}

	constructor(
		uri: URI,
		@IInstantiationService private readonly initService: IInstantiationService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);
		this._reference = this._register(this.initService.createInstance(FilePromptParser, uri, []))
			.onUpdate(this._onUpdate.fire);
	}

	/**
	 * Start resolving the prompt instructions reference and child references
	 * that it may contain.
	 */
	public resolve(): this {
		this._reference.start();

		return this;
	}

	public override dispose(): void {
		this._onDispose.fire();

		super.dispose();
	}
}
