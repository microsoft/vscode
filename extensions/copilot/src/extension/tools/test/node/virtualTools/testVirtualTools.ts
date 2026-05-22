/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { Embedding } from '../../../../../platform/embeddings/common/embeddingsComputer';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { IToolEmbeddingsComputer } from '../../../common/virtualTools/toolEmbeddingsComputer';

export class TestToolEmbeddingsComputer implements IToolEmbeddingsComputer {
	declare _serviceBrand: undefined;

	retrieveSimilarEmbeddingsForAvailableTools(queryEmbedding: Embedding, availableToolNames: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<string[]> {
		return Promise.resolve(availableToolNames.slice(0, limit).map(t => t.name));
	}

	searchToolsByQuery(query: string, availableTools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<string[]> {
		return Promise.resolve(availableTools.slice(0, limit).map(t => t.name));
	}

	computeToolGroupings(tools: readonly LanguageModelToolInformation[], limit: number, token: CancellationToken): Promise<LanguageModelToolInformation[][]> {
		// Simple test implementation that groups tools by pairs
		const groups: LanguageModelToolInformation[][] = [];
		for (let i = 0; i < tools.length; i += 2) {
			const group = tools.slice(i, i + 2);
			groups.push(group);
		}
		return Promise.resolve(groups.slice(0, limit));
	}
}
