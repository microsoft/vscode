/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSimilarFilesOptions } from '../../completions-core/vscode-node/lib/src/experiments/similarFileOptionsProvider';
import { getPromptOptions } from '../../completions-core/vscode-node/lib/src/prompt/prompt';
import { NeighborSource } from '../../completions-core/vscode-node/lib/src/prompt/similarFiles/neighborFiles';
import { TelemetryWithExp } from '../../completions-core/vscode-node/lib/src/telemetry';
import { ICompletionsTextDocumentManagerService } from '../../completions-core/vscode-node/lib/src/textDocumentManager';
import { DocumentInfoWithOffset } from '../../completions-core/vscode-node/prompt/src/prompt';
import { getSimilarSnippets } from '../../completions-core/vscode-node/prompt/src/snippetInclusion/similarFiles';
import { ICopilotInlineCompletionItemProviderService } from '../../completions/common/copilotInlineCompletionItemProviderService';
import { ISimilarFilesContextService } from '../../xtab/common/similarFilesContextService';

export class SimilarFilesContextService implements ISimilarFilesContextService {

	readonly _serviceBrand: undefined;

	constructor(
		@ICopilotInlineCompletionItemProviderService private readonly _copilotService: ICopilotInlineCompletionItemProviderService,
	) { }

	async compute(uri: string, languageId: string, source: string, cursorOffset: number): Promise<string | undefined> {
		try {
			const completionsInstaService = this._copilotService.getOrCreateInstantiationService();
			const telemetryData = TelemetryWithExp.createEmptyConfigForTesting();

			const { docs } = await completionsInstaService.invokeFunction(
				accessor => NeighborSource.getNeighborFilesAndTraits(accessor, uri, languageId, telemetryData)
			);

			const promptOptions = completionsInstaService.invokeFunction(getPromptOptions, telemetryData, languageId);
			const similarFilesOptions =
				promptOptions.similarFilesOptions ||
				completionsInstaService.invokeFunction(getSimilarFilesOptions, telemetryData, languageId);

			const tdm = completionsInstaService.invokeFunction(accessor => accessor.get(ICompletionsTextDocumentManagerService));
			const relativePath = tdm.getRelativePath({ uri });

			const docInfo: DocumentInfoWithOffset = {
				uri,
				source,
				languageId,
				offset: cursorOffset,
				relativePath,
			};

			const snippets = (await getSimilarSnippets(
				docInfo,
				Array.from(docs.values()),
				similarFilesOptions,
			))
				.filter(s => s.snippet.length > 0)
				.sort((a, b) => a.score - b.score);

			return JSON.stringify({
				neighborFileCount: docs.size,
				snippets: snippets.map(s => ({
					score: s.score,
					startLine: s.startLine,
					endLine: s.endLine,
					relativePath: s.relativePath,
					snippet: s.snippet,
				})),
			});
		} catch {
			return undefined;
		}
	}
}
