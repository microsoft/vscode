/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DocumentSemanticTokensProvider, ProviderResult, SemanticTokens, SemanticTokensLegend } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptDocumentSemanticTokensProvider implements DocumentSemanticTokensProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptDocumentSemanticTokensProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
	}

	provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): ProviderResult<SemanticTokens> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any semantic tokens
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		if (!parser.body) {
			return undefined;
		}

		const variableReferences = parser.body.variableReferences;
		const slashCommandReferences = parser.body.slashCommandReferences;
		if (!variableReferences.length && !slashCommandReferences.length) {
			return undefined;
		}

		// Prepare semantic tokens data following the delta-encoded, 5-number tuple format:
		// [deltaLine, deltaStart, length, tokenType, tokenModifiers]
		// We expose two token types: 'variable' (index 0) and 'function' (index 1) and no modifiers (bitset 0).
		const data: number[] = [];
		let lastLine = 0;
		let lastChar = 0;

		// Combine and sort all references by position
		const allRefs: Array<{ range: Range; tokenType: number }> = [
			...variableReferences.map(ref => ({ range: ref.range, tokenType: 0 })), // variable token type
			...slashCommandReferences.map(ref => ({ range: ref.range, tokenType: 1 })) // function token type
		].sort((a, b) => a.range.startLineNumber === b.range.startLineNumber
			? a.range.startColumn - b.range.startColumn
			: a.range.startLineNumber - b.range.startLineNumber);

		for (const ref of allRefs) {
			const line = ref.range.startLineNumber - 1; // zero-based
			const char = ref.tokenType === 0 ? ref.range.startColumn - 2 : ref.range.startColumn - 1; // zero-based, include the leading # for variables, / for slash commands
			const length = ref.range.endColumn - ref.range.startColumn + (ref.tokenType === 0 ? 1 : 0);
			const deltaLine = line - lastLine;
			const deltaChar = deltaLine === 0 ? char - lastChar : char;
			data.push(deltaLine, deltaChar, length, ref.tokenType, 0 /* no modifiers */);
			lastLine = line;
			lastChar = char;
			if (token.isCancellationRequested) {
				break; // Return what we have so far if cancelled.
			}
		}

		return { data: new Uint32Array(data) };
	}

	getLegend(): SemanticTokensLegend {
		return { tokenTypes: ['variable', 'function'], tokenModifiers: [] };
	}

	releaseDocumentSemanticTokens(resultId: string | undefined): void {
		// No caching/result management needed for the simple, stateless implementation.
	}
}
