/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, createCancelablePromise, raceCancellablePromises, raceCancellation, timeout } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const ISemanticSimilarityService = createDecorator<ISemanticSimilarityService>('ISemanticSimilarityService');

export interface ISemanticSimilarityService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	getSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]>;
	registerSemanticSimilarityProvider(provider: ISemanticSimilarityProvider): IDisposable;
}

export interface ISemanticSimilarityProvider {
	provideSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]>;
}

export class SemanticSimilarityService implements ISemanticSimilarityService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private readonly _providers: ISemanticSimilarityProvider[] = [];
	// remove when we move over to API
	private readonly oldService: OldSemanticSimilarityService;

	constructor(
		// for the old service
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService
	) {
		this.oldService = new OldSemanticSimilarityService(commandService, fileService);
	}

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerSemanticSimilarityProvider(provider: ISemanticSimilarityProvider): IDisposable {
		this._providers.push(provider);
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index >= 0) {
					this._providers.splice(index, 1);
				}
			}
		};
	}

	async getSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]> {
		if (this._providers.length === 0) {
			// Remove when we have a provider shipping in extensions
			if (this.oldService.isEnabled()) {
				return this.oldService.getSimilarityScore(string1, comparisons, token);
			}
			throw new Error('No semantic similarity providers registered');
		}

		const cancellablePromises: Array<CancelablePromise<number[]>> = [];

		const timer = timeout(SemanticSimilarityService.DEFAULT_TIMEOUT);
		const disposible = token.onCancellationRequested(() => {
			disposible.dispose();
			timer.cancel();
		});

		for (const provider of this._providers) {
			cancellablePromises.push(createCancelablePromise(async t => {
				try {
					return await provider.provideSimilarityScore(string1, comparisons, t);
				} catch (e) {
					// logged in extension host
				}
				// Wait for the timer to finish to allow for another provider to resolve.
				// Alternatively, if something resolved, or we've timed out, this will throw
				// as expected.
				await timer;
				throw new Error('Semantic similarity provider timed out');
			}));
		}

		cancellablePromises.push(createCancelablePromise(async (t) => {
			const disposible = t.onCancellationRequested(() => {
				timer.cancel();
				disposible.dispose();
			});
			await timer;
			throw new Error('Semantic similarity provider timed out');
		}));

		const result = await raceCancellablePromises(cancellablePromises);
		return result;
	}
}

// TODO: remove this when the extensions are updated

interface ICommandsEmbeddingsCache {
	[commandId: string]: { embedding: number[] };
}

interface INewCommandsEmbeddingsCacheFormat {
	core: ICommandsEmbeddingsCache;
}

class OldSemanticSimilarityService {
	declare _serviceBrand: undefined;

	static readonly CALCULATE_EMBEDDING_COMMAND_ID = '_vscode.ai.calculateEmbedding';
	static readonly COMMAND_EMBEDDING_CACHE_COMMAND_ID = '_vscode.ai.commandEmbeddingsCache';

	private cache: Promise<ICommandsEmbeddingsCache>;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService
	) {
		this.cache = this.loadCache();
	}

	private async loadCache(): Promise<ICommandsEmbeddingsCache> {
		const path = await this.commandService.executeCommand<string>(OldSemanticSimilarityService.COMMAND_EMBEDDING_CACHE_COMMAND_ID);
		if (!path) {
			return {};
		}
		const content = await this.fileService.readFile(URI.parse(path));
		const parsed = JSON.parse(content.value.toString()) as INewCommandsEmbeddingsCacheFormat | ICommandsEmbeddingsCache;
		if ('core' in parsed) {
			return (parsed as INewCommandsEmbeddingsCacheFormat).core;
		}
		return parsed;
	}

	isEnabled(): boolean {
		return !!CommandsRegistry.getCommand(OldSemanticSimilarityService.CALCULATE_EMBEDDING_COMMAND_ID);
	}

	async getSimilarityScore(str: string, comparisons: string[], token: CancellationToken): Promise<number[]> {
		const embedding1 = await this.computeEmbedding(str, token);
		const scores: number[] = [];
		for (const comparison of comparisons) {
			if (token.isCancellationRequested) {
				scores.push(0);
				continue;
			}
			const embedding2 = await this.getCommandEmbeddingFromCache(comparison, token);
			if (embedding2) {
				scores.push(this.getEmbeddingSimilarityScore(embedding1, embedding2));
				continue;
			}
			scores.push(0);
		}
		return scores;
	}

	private async computeEmbedding(text: string, token: CancellationToken): Promise<number[]> {
		if (!this.isEnabled()) {
			throw new Error('Embeddings are not enabled');
		}
		const result = await raceCancellation(this.commandService.executeCommand<number[][]>(OldSemanticSimilarityService.CALCULATE_EMBEDDING_COMMAND_ID, text), token);
		if (!result) {
			throw new Error('No result');
		}
		return result[0];
	}

	private async getCommandEmbeddingFromCache(commandId: string, token: CancellationToken): Promise<number[] | undefined> {
		const cache = await raceCancellation(this.cache, token);
		return cache?.[commandId]?.embedding;
	}

	/**
	 * Performs cosine similarity on two vectors to determine their similarity.
	 * @param embedding1 The first embedding
	 * @param embedding2 The second embedding
	 * @returns A number between 0 and 1 for how similar the two embeddings are
	 */
	private getEmbeddingSimilarityScore(embedding1: number[], embedding2: number[]): number {
		const dotProduct = embedding1.reduce((sum, value, index) => sum + value * embedding2[index], 0);
		const magnitude1 = Math.sqrt(embedding1.reduce((sum, value) => sum + value * value, 0));
		const magnitude2 = Math.sqrt(embedding2.reduce((sum, value) => sum + value * value, 0));
		return dotProduct / (magnitude1 * magnitude2);
	}
}

registerSingleton(ISemanticSimilarityService, SemanticSimilarityService, InstantiationType.Delayed);
