/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { FileChunkAndScore } from '../../chunking/common/chunk';
import { ILogService } from '../../log/common/logService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';

export const IRerankerService = createServiceIdentifier<IRerankerService>('IRerankerService');

export interface IRerankerService {
	readonly _serviceBrand: undefined;
	/**
	 * Re-rank a list of file chunks for a natural language query.
	 */
	rerank(query: string, documents: readonly FileChunkAndScore[], token: CancellationToken): Promise<readonly FileChunkAndScore[]>;
	/**
	 * Whether the remote reranker endpoint is available
	 */
	readonly isAvailable: boolean;
}


interface RemoteRerankResultEntry {
	readonly index: number;
	readonly relevance_score?: number;
}
interface RemoteRerankResponse {
	readonly results?: readonly RemoteRerankResultEntry[];
}

function buildQueryPrompt(userQuery: string): string {
	return '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n'
		+ '<|im_start|>user\n'
		+ '<Instruct>: Given a web search query, retrieve relevant passages that answer the query\n'
		+ `<Query>: ${userQuery}\n`;
}

function wrapDocument(text: string): string {
	return `<Document>: ${text}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

export class RerankerService implements IRerankerService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _expService: IExperimentationService
	) { }

	private get _endpoint(): string | undefined {
		return this._expService.getTreatmentVariable<string>('rerankEndpointUrl')?.trim();
	}

	get isAvailable(): boolean {
		return !!this._endpoint;
	}

	async rerank(query: string, documents: readonly FileChunkAndScore[], token: CancellationToken): Promise<readonly FileChunkAndScore[]> {
		if (!documents.length || !this.isAvailable || !this._endpoint) {
			return documents;
		}

		const payload = {
			query: buildQueryPrompt(query),
			documents: documents.map(d => wrapDocument(d.chunk.text))
		};

		try {
			const response = await raceCancellationError(fetch(this._endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			}), token);

			if (!response.ok) {
				this._logService.error(`RerankerService::rerank request failed. status=${response.status}`);
				throw new Error(`Reranker request failed with status ${response.status}`);
			}

			const json = await raceCancellationError(response.json() as Promise<RemoteRerankResponse>, token);
			const results = json.results;
			if (!Array.isArray(results) || results.length === 0) {
				throw new Error('Reranker returned no results');
			}

			// Sort descending by relevance (higher score = more relevant). If scores missing, treat as 0.
			const sorted = [...results].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
			const used = new Set<number>();
			const reordered: FileChunkAndScore[] = [];
			for (const entry of sorted) {
				if (typeof entry.index === 'number' && entry.index >= 0 && entry.index < documents.length && !used.has(entry.index)) {
					used.add(entry.index);
					reordered.push(documents[entry.index]);
				}
			}
			// Preserve any documents that were not returned by the reranker (defensive)
			for (let i = 0; i < documents.length; i++) {
				if (!used.has(i)) {
					reordered.push(documents[i]);
				}
			}
			return reordered;
		} catch (e) {
			this._logService.error(e, 'RerankerService::rerank exception');
			throw e;
		}
	}
}
