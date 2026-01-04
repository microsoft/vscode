/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import * as languages from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatInlineCompletionsService = createDecorator<IChatInlineCompletionsService>('chatInlineCompletionsService');

/**
 * Entry for a chat inline completions provider.
 */
export interface IChatInlineCompletionsProviderEntry {
	provideCompletions(input: string, position: number, token: CancellationToken): Promise<languages.InlineCompletions | undefined>;
}

/**
 * Service for managing chat inline completion providers.
 * Aggregates inline completion suggestions from registered providers for chat input contexts.
 */
export interface IChatInlineCompletionsService {
	readonly _serviceBrand: undefined;

	registerProvider(handle: number, entry: IChatInlineCompletionsProviderEntry): IDisposable;

	provideChatInlineCompletions(
		input: string,
		position: number,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined>;
}
