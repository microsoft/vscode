/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { APIChoice } from '../openai/openai';
import { Prompt } from '../prompt/prompt';
import { ICompletionsCacheService } from './completionsCache';

/** Info for caching completions. */
interface CacheContext {
	/** The text content up to the cursor. */
	prefix: string;
	/** The prompt to send to the model. */
	prompt: Prompt;
	/**
	 * If true, add an extra newline at the end of the prefix of the prompt. This is used to get a completion for the next line.
	 * Unset if the feature is disabled.
	 */
	requestForNextLine?: boolean;
}

/** Appends completions to existing entry in cache or creates new entry. */
export function appendToCache(completionsCacheService: ICompletionsCacheService, requestContext: CacheContext, choice: APIChoice) {
	completionsCacheService.append(requestContext.prefix, requestContext.prompt.suffix, choice);
}
