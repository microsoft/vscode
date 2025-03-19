/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode';

import { PromptParserBase } from './promptParserBase';
import { TextDocumentContentsProvider } from './contentProviders';
import { IFileSystemService, ILogService } from '../services/types';

/**
 * Class capable of parsing prompt syntax out of a provided text model,
 * including all the nested child file references it may have.
 */
export class TextDocumentPromptParser extends PromptParserBase<TextDocumentContentsProvider> {
	constructor(
		document: TextDocument,
		seenReferences: string[] = [],
		filesystemService: IFileSystemService,
		logService: ILogService,
	) {
		const contentsProvider = new TextDocumentContentsProvider(document, logService)
			.onDispose(() => this.dispose());

		super(contentsProvider, seenReferences, filesystemService, logService);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-document-prompt:${this.uri.path}`;
	}
}
