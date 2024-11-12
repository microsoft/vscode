/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ChatbotPromptReference } from '../chatVariables.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDynamicVariable } from '../../common/chatVariables.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../base/common/assert.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

/**
 * TODO: @legomushroom
 */
export class ChatDynamicVariable extends Disposable implements IDynamicVariable {
	// The URI of the file reference.
	private readonly uri: URI;

	// Chatbot prompt reference instance for prompt files.
	private readonly promptSnippetReference?: ChatbotPromptReference;

	// Promise is resolved when all nested file references for prompt files are resolved.
	public readonly resolveReferencesReady: Promise<ReadonlyArray<URI>>;

	private readonly _onReferencesUpdated = this._register(new Emitter<void>());
	// The event is fired when nested prompt snippet references are updated, if any.
	public readonly onReferencesUpdated = this._onReferencesUpdated.event;

	// The URIs of the child file references, if any.
	private _childReferences?: URI[];
	// The URIs of the child file references, if any.
	public get childReferences(): ReadonlyArray<URI> | undefined {
		return this._childReferences;
	}

	constructor(
		private readonly reference: IDynamicVariable,
		private readonly fileService: IFileService,
	) {
		super();

		this.uri = this.parseUri(reference.data);

		if (reference.isFile && this.uri.path.endsWith('.copilot-prompt')) {
			// TODO: @legomushroom - subscribe to file changes and re-resolve
			this.promptSnippetReference = this._register(new ChatbotPromptReference(this.uri, this.fileService));
			// start resolving the prompt file references immediately
			this.resolveReferencesReady = this.promptSnippetReference
				.resolve()
				.then((variableFileReference) => {
					const uris = variableFileReference.flatten()
						// skip the first reference that contains data for the DynamicVariable itself
						.slice(1)
						// map to a list of URIs
						.map((child) => {
							return child.uri;
						});

					this._childReferences = uris;
					this._onReferencesUpdated.fire();

					return uris;
				});

			return this;
		}

		// if not a prompt file, then there are no nested file references to resolve
		// we use an empty promise to keep the logic simple and consistent for consumers
		this.resolveReferencesReady = Promise.resolve([]);
	}

	/**
	 * Parse the `data` property of a reference as an `URI`.
	 *
	 * Throws! if the reference is not defined or an invalid `URI`.
	 */
	private parseUri(data: IDynamicVariable['data']): URI {
		assertDefined(
			data,
			`The reference must have a \`data\` property, got ${data}.`,
		);

		if (typeof data === 'string') {
			return URI.parse(data);
		}

		if (data instanceof URI) {
			return data;
		}

		if ('uri' in data && data.uri instanceof URI) {
			return data.uri;
		}

		throw new Error(
			`The reference must have a \`data\` property parseable as an 'URI', got ${data}.`,
		);
	}

	// TODO: @legomushroom - is it possible to use a `Proxy` instead of all
	// 						 the getters and make TS happy at the same time?
	get id() {
		return this.reference.id;
	}

	get range() {
		return this.reference.range;
	}

	set range(range: IRange) {
		this.reference.range = range;
	}

	get data(): URI {
		return this.uri;
	}

	get prefix() {
		return this.reference.prefix;
	}

	get isFile() {
		return this.reference.isFile;
	}

	get fullName() {
		return this.reference.fullName;
	}

	get modelDescription() {
		return this.reference.modelDescription;
	}

	// TODO: @legomushroom - remove?
	// public override dispose() {
	// 	if (this.resolveReferencesReady) {
	// 		// unfortunately, we can't cancel the promise so
	// 		// all we do here is to delete the reference
	// 		delete this.resolveReferencesReady;
	// 	}

	// 	super.dispose();
	// }
}
