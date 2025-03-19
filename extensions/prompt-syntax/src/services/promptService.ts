/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TextDocument } from 'vscode';

import { ObservableDisposable } from '../utils/vscode';
import { ObjectCache } from '../utils/objectCache';
import { IFileSystemService, ILogService, IPromptService } from './types';
import { TextDocumentPromptParser } from '../parsers/textDocumentPromptParser';

/**
 * TODO: @legomushroom
 */
export type TNotDisposed<T extends object> = T & { disposed: false };

/**
 * TODO: @legomushroom
 */
export class PromptService extends ObservableDisposable implements IPromptService {
	/**
	 * Cache of text document prompt parsers.
	 */
	private readonly cache: ObjectCache<TextDocumentPromptParser, TextDocument>;

	constructor(
		filesystemService: IFileSystemService,
		logService: ILogService,
	) {
		super();

		// the factory function below creates a new prompt parser object
		// for the provided model, if no active non-disposed parser exists
		this.cache = this._register(
			new ObjectCache((model) => {
				/**
				 * Note! When/if shared with "file" prompts, the `seenReferences` array below must be taken into account.
				 * Otherwise consumers will either see incorrect failing or incorrect successful results, based on their
				 * use case, timing of their calls to the {@link getTokensStreamFor} function, and state of this service.
				 */
				const parser: TextDocumentPromptParser = new TextDocumentPromptParser(
					model,
					[],
					filesystemService,
					logService,
				);

				parser.start();

				// this is a sanity check and the contract of the object cache,
				// we must return a non-disposed object from this factory function
				parser.assertNotDisposed(
					'Created prompt parser must not be disposed.',
				);

				return parser;
			})
		);
	}

	/**
	 * @throws if:
	 * 	- the provided text document is already closed
	 * 	- newly syntax tokens stream is disposed immediately on initialization.
	 * 	  See factory function in the constructor for more info.
	 */
	getTokensStreamFor(document: TextDocument): TNotDisposed<TextDocumentPromptParser> {
		assert(
			!document.isClosed,
			'Cannot create a syntax tokens stream for an already closed document.',
		);

		return this.cache.get(document);
	}
}
