/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as languages from '../../../../editor/common/languages.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatInlineCompletionsProviderEntry, IChatInlineCompletionsService } from '../common/chatInlineCompletionsService.js';

/**
 * Manages provider registration and aggregates completion results from multiple providers.
 * Multiple extensions (e.g., GitHub Copilot, other AI assistants) can each register their own
 * provider to contribute inline completion suggestions for chat input.
 */
export class ChatInlineCompletionsService extends Disposable implements IChatInlineCompletionsService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<number, IChatInlineCompletionsProviderEntry>();

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	registerProvider(handle: number, entry: IChatInlineCompletionsProviderEntry): IDisposable {
		this._providers.set(handle, entry);
		return toDisposable(() => this._providers.delete(handle));
	}

	async provideChatInlineCompletions(
		input: string,
		position: number,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (this._providers.size === 0) {
			return undefined;
		}

		const providerPromises = Array.from(this._providers.values()).map(async provider => {
			try {
				const result = await provider.provideCompletions(input, position, token);
				return result?.items ?? [];
			} catch (err) {
				this.logService.error('[ChatInlineCompletionsService] Error in provider', err);
				// Fail-safe: return empty array to continue with other providers
				return [];
			}
		});

		const results = await Promise.all(providerPromises);

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Flatten all provider results into a single list
		const allResults = results.flat();

		if (allResults.length === 0) {
			return undefined;
		}

		return { items: allResults };
	}
}
