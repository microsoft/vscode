/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { raceCancellation } from 'vs/base/common/async';

export const ISemanticSimilarityService = createDecorator<ISemanticSimilarityService>('IEmbeddingsService');

export interface ISemanticSimilarityService {
	isEnabled(): boolean;
	getSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]>;
}

interface ICommandsEmbeddingsCache {
	[commandId: string]: { embedding: number[] };
}

// TODO: use proper API for this instead of commands
export class SemanticSimilarityService implements ISemanticSimilarityService {
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
		const path = await this.commandService.executeCommand<string>(SemanticSimilarityService.COMMAND_EMBEDDING_CACHE_COMMAND_ID);
		if (!path) {
			return {};
		}
		const content = await this.fileService.readFile(URI.parse(path));
		return JSON.parse(content.value.toString());
	}

	isEnabled(): boolean {
		return !!CommandsRegistry.getCommand(SemanticSimilarityService.CALCULATE_EMBEDDING_COMMAND_ID);
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
		const result = await raceCancellation(this.commandService.executeCommand<number[][]>(SemanticSimilarityService.CALCULATE_EMBEDDING_COMMAND_ID, text), token);
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
