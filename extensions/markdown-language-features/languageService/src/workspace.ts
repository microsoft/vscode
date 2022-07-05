/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from './types/event';
import { ITextDocument } from './types/textDocument';
import { IUri } from './types/uri';

/**
 * Provides set of markdown files in the current workspace.
 */
export interface IMdWorkspace {
	/**
	 * Get list of all known markdown files.
	 */
	getAllMarkdownDocuments(): Promise<Iterable<ITextDocument>>;

	/**
	 * Check if a document already exists in the workspace contents.
	 */
	hasMarkdownDocument(resource: IUri): boolean;

	getOrLoadMarkdownDocument(resource: IUri): Promise<ITextDocument | undefined>;

	pathExists(resource: IUri): Promise<boolean>;

	readDirectory(resource: IUri): Promise<[string, { isDir: boolean }][]>;

	readonly onDidChangeMarkdownDocument: Event<ITextDocument>;
	readonly onDidCreateMarkdownDocument: Event<ITextDocument>;
	readonly onDidDeleteMarkdownDocument: Event<IUri>;
}
