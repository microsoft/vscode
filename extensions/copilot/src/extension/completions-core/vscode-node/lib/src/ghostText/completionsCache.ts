/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { LRURadixTrie } from '../helpers/radix';
import { APIChoice } from '../openai/openai';

interface CompletionsCacheContents {
	content: {
		suffix: string;
		choice: APIChoice;
	}[];
}

export const ICompletionsCacheService = createServiceIdentifier<ICompletionsCacheService>('ICompletionsCacheService');
export interface ICompletionsCacheService {
	readonly _serviceBrand: undefined;

	/** Given a document prefix and suffix, return all of the completions that match. */
	findAll(prefix: string, suffix: string): APIChoice[];

	/** Add cached completions for a given prefix. */
	append(prefix: string, suffix: string, choice: APIChoice): void;

	clear(): void;
}

/** Caches recent completions by document prefix. */
export class CompletionsCache implements ICompletionsCacheService {
	readonly _serviceBrand: undefined;

	private cache = new LRURadixTrie<CompletionsCacheContents>(100);

	/** Given a document prefix and suffix, return all of the completions that match. */
	findAll(prefix: string, suffix: string): APIChoice[] {
		return this.cache.findAll(prefix).flatMap(({ remainingKey, value }) =>
			value.content
				.filter(
					c =>
						c.suffix === suffix &&
						c.choice.completionText.startsWith(remainingKey) &&
						c.choice.completionText.length > remainingKey.length
				)
				.map(c => ({
					...c.choice,
					completionText: c.choice.completionText.slice(remainingKey.length),
					telemetryData: c.choice.telemetryData.extendedBy({}, { foundOffset: remainingKey.length }),
				}))
		);
	}

	/** Add cached completions for a given prefix. */
	append(prefix: string, suffix: string, choice: APIChoice) {
		const existing = this.cache.findAll(prefix);
		// Append to an existing array if there is an exact match.
		if (existing.length > 0 && existing[0].remainingKey === '') {
			const content = existing[0].value.content;
			this.cache.set(prefix, { content: [...content, { suffix, choice }] });
		} else {
			// Otherwise, add a new value.
			this.cache.set(prefix, { content: [{ suffix, choice }] });
		}
	}

	clear() {
		this.cache = new LRURadixTrie<CompletionsCacheContents>(100);
	}
}
