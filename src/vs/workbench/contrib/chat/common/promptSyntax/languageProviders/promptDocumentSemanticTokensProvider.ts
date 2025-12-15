/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DocumentSemanticTokensProvider, ProviderResult, SemanticTokens, SemanticTokensLegend } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { isGithubTarget } from './promptValidator.js';

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

		const promptAST = this.promptsService.getParsedPromptFile(model);
		if (!promptAST.body) {
			return undefined;
		}

		if (isGithubTarget(promptType, promptAST.header?.target)) {
			// In GitHub Copilot mode, we don't provide variable semantic tokens to tool references
			return undefined;
		}

		const variableReferences = promptAST.body.variableReferences;
		if (!variableReferences.length) {
			return undefined;
		}

		// Prepare semantic tokens data following the delta-encoded, 5-number tuple format:
		// [deltaLine, deltaStart, length, tokenType, tokenModifiers]
		// We expose a single token type 'variable' (index 0) and no modifiers (bitset 0).
		const data: number[] = [];
		let lastLine = 0;
		let lastChar = 0;

		// Ensure stable order (parser already produces them in order, but sort defensively)
		const ordered = [...variableReferences].sort((a, b) => a.range.startLineNumber === b.range.startLineNumber
			? a.range.startColumn - b.range.startColumn
			: a.range.startLineNumber - b.range.startLineNumber);

		for (const ref of ordered) {
			// Also include the '#tool:' prefix for syntax highlighting purposes, even if it's not originally part of the variable name itself.
			const extraCharCount = '#tool:'.length;
			const line = ref.range.startLineNumber - 1; // zero-based
			const char = ref.range.startColumn - extraCharCount - 1; // zero-based
			const length = ref.range.endColumn - ref.range.startColumn + extraCharCount;
			const deltaLine = line - lastLine;
			const deltaChar = deltaLine === 0 ? char - lastChar : char;
			data.push(deltaLine, deltaChar, length, 0 /* variable token type index */, 0 /* no modifiers */);
			lastLine = line;
			lastChar = char;
			if (token.isCancellationRequested) {
				break; // Return what we have so far if cancelled.
			}
		}

		return { data: new Uint32Array(data) };
	}

	getLegend(): SemanticTokensLegend {
		return { tokenTypes: ['variable'], tokenModifiers: [] };
	}

	releaseDocumentSemanticTokens(resultId: string | undefined): void {
		// No caching/result management needed for the simple, stateless implementation.
	}
}
