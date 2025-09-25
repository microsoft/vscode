/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DocumentSemanticTokensProvider, ProviderResult, SemanticTokens, SemanticTokensLegend } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';

export class PromptDocumentSemanticTokensProvider extends Disposable implements DocumentSemanticTokensProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptDocumentSemanticTokensProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
	) {
		super();

		this._register(this.languageService.documentSemanticTokensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	provideDocumentSemanticTokens(model: ITextModel, lastResultId: string | null, token: CancellationToken): ProviderResult<SemanticTokens> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any completions
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		if (!parser.body) {
			return undefined;
		}

		const variableReferences = parser.body.variableReferences;
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
			const line = ref.range.startLineNumber - 1; // zero-based
			const char = ref.range.startColumn - 2; // zero-based, include the leading #
			const length = ref.range.endColumn - ref.range.startColumn + 1;
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
