/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BlockMode } from '../config';
import { CompletionHeaders } from '../openai/fetch';
import { ContextIndentation } from '../prompt/parseBlock';
import { Prompt } from '../prompt/prompt';
import { MaybeRepoInfo } from '../prompt/repository';

/** Info for requesting and caching completions. */
export interface RequestContext {
	/** How block trimming should be done. */
	blockMode: BlockMode;
	/** The language of the file. */
	languageId: string;
	/** Information about the repository the file is in, if available. */
	repoInfo: MaybeRepoInfo;
	/** The engine used for the request. */
	engineModelId: string;
	/** A request id we choose in the hope that the model will use it in responses */
	ourRequestId: string;
	/** The text content up to the cursor. */
	prefix: string;
	/** The prompt to send to the model. */
	prompt: Prompt;
	/** Whether this request should be able to generate multiple lines. */
	multiline: boolean;
	/** Indentation (tabs or spaces) on/before and after the cursor. */
	indentation: ContextIndentation;
	/** Follow up request happening when user requested cycling */
	isCycling: boolean;
	/** Additional request headers */
	headers: CompletionHeaders;
	/** Optional override for the default stop sequences for this request. */
	stop?: string[];
	/** Optional override for max tokens to return */
	maxTokens?: number;
	/** Whether the current request is following an accepted completion. */
	afterAccept: boolean;
}

