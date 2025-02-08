/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { SnippetFile, Snippet } from './snippetsFile.js';

export const ISnippetsService = createDecorator<ISnippetsService>('snippetService');

export interface ISnippetGetOptions {
	includeDisabledSnippets?: boolean;
	includeNoPrefixSnippets?: boolean;
	noRecencySort?: boolean;
	fileTemplateSnippets?: boolean;
}

export interface ISnippetsService {

	readonly _serviceBrand: undefined;

	getSnippetFiles(): Promise<Iterable<SnippetFile>>;

	isEnabled(snippet: Snippet): boolean;

	updateEnablement(snippet: Snippet, enabled: boolean): void;

	updateUsageTimestamp(snippet: Snippet): void;

	getSnippets(languageId: string | undefined, opt?: ISnippetGetOptions): Promise<Snippet[]>;

	getSnippetsSync(languageId: string, opt?: ISnippetGetOptions): Snippet[];
}
