/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';
import * as languages from '../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IAIAssistantService } from '../common/aiAssistantService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class AIInlineCompletionProvider extends Disposable implements languages.InlineCompletionsProvider {
	readonly _debugDisplayName = 'aiInlineCompletions';

	private _isEnabled = true;
	private _lastCompletionTime = 0;
	private readonly _debounceMs = 500; // Debounce completions

	constructor(
		@IAIAssistantService private readonly aiAssistantService: IAIAssistantService,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('aiAssistant.completion')) {
				this._updateConfiguration();
			}
		}));
		this._updateConfiguration();
	}

	async provideInlineCompletions(
		model: ITextModel,
		position: Position,
		context: languages.InlineCompletionContext,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined> {

		if (!this._isEnabled || !this.aiAssistantService.isAvailable()) {
			return undefined;
		}

		// Debounce rapid requests
		const now = Date.now();
		if (now - this._lastCompletionTime < this._debounceMs) {
			return undefined;
		}
		this._lastCompletionTime = now;

		// Only provide completions for manual triggers or after significant typing
		if (context.triggerKind === languages.InlineCompletionTriggerKind.Automatic) {
			const currentLine = model.getLineContent(position.lineNumber);
			const textBeforeCursor = currentLine.substring(0, position.column - 1);

			// Only trigger if we have a reasonable amount of context
			if (textBeforeCursor.trim().length < 3) {
				return undefined;
			}
		}

		try {
			const completions = await this._generateInlineCompletions(model, position, token);
			return {
				items: completions,
				enableForwardStability: true
			};
		} catch (error) {
			onUnexpectedExternalError(error);
			this.logService.error('AI Inline Completion Provider: Failed to generate completions', error);
			return undefined;
		}
	}

	private async _generateInlineCompletions(
		model: ITextModel,
		position: Position,
		token: CancellationToken
	): Promise<languages.InlineCompletion[]> {

		const config = this.configurationService.getValue<any>('aiAssistant.completion') || {};
		const contextLines = config.contextLines || 50;

		// Get context around the cursor
		const startLine = Math.max(1, position.lineNumber - contextLines);

		// Get text before cursor for context
		const textBeforeRange = new Range(startLine, 1, position.lineNumber, position.column);
		const textBefore = model.getValueInRange(textBeforeRange);

		// Get current line and text after cursor
		const currentLine = model.getLineContent(position.lineNumber);
		const textAfterCursor = currentLine.substring(position.column - 1);

		// Build prompt for multi-line completion
		const language = model.getLanguageId();
		const prompt = this._buildInlineCompletionPrompt(textBefore, textAfterCursor, language);

		try {
			const response = await this.aiAssistantService.generateCompletion({
				prompt,
				context: textBefore,
				language,
				maxTokens: config.maxTokens || 200,
				temperature: config.temperature || 0.2,
				stopSequences: ['\n\n\n', '```', '---', '===']
			}, token);

			if (!response.text.trim()) {
				return [];
			}

			// Parse the completion to handle multi-line suggestions
			const completions = this._parseInlineCompletion(response.text, position, textAfterCursor);
			return completions;

		} catch (error) {
			this.logService.error('AI Inline Completion: Generation failed', error);
			return [];
		}
	}

	private _buildInlineCompletionPrompt(textBefore: string, textAfter: string, language: string): string {
		// Build a focused prompt for inline completion
		const lines = textBefore.split('\n');
		const lastFewLines = lines.slice(-10).join('\n'); // Last 10 lines for immediate context

		return `Complete the following ${language} code. Provide only the completion that should be inserted at the cursor position. Do not repeat existing code.

Recent context:
\`\`\`${language}
${lastFewLines}
\`\`\`

Text after cursor: ${textAfter ? `"${textAfter}"` : '(end of line)'}

Complete the code at the cursor position:`;
	}

	private _parseInlineCompletion(completionText: string, position: Position, textAfterCursor: string): languages.InlineCompletion[] {
		// Clean up the completion
		let cleaned = completionText.trim();

		// Remove code block markers if present
		cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

		// Remove any leading/trailing whitespace that might interfere
		cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');

		if (!cleaned) {
			return [];
		}

		const completions: languages.InlineCompletion[] = [];

		// Split into potential multiple completions
		const suggestions = this._splitCompletionSuggestions(cleaned);

		for (let i = 0; i < Math.min(suggestions.length, 3); i++) {
			const suggestion = suggestions[i];
			if (!suggestion.trim()) continue;

			// Determine the range for insertion
			const insertRange = this._calculateInsertRange(suggestion, position, textAfterCursor);

			completions.push({
				insertText: suggestion,
				range: insertRange,
				command: {
					id: 'aiAssistant.logInlineCompletion',
					title: 'Log AI Inline Completion Usage'
				}
			});
		}

		return completions;
	}

	private _splitCompletionSuggestions(text: string): string[] {
		// Try to intelligently split multi-line completions
		const lines = text.split('\n');

		// If it's a single line or short completion, return as is
		if (lines.length <= 3 || text.length < 100) {
			return [text];
		}

		// For longer completions, try to find natural break points
		const suggestions: string[] = [];
		let currentSuggestion = '';
		let braceCount = 0;
		let parenCount = 0;

		for (const line of lines) {
			currentSuggestion += (currentSuggestion ? '\n' : '') + line;

			// Count braces and parentheses to find complete blocks
			for (const char of line) {
				if (char === '{') braceCount++;
				else if (char === '}') braceCount--;
				else if (char === '(') parenCount++;
				else if (char === ')') parenCount--;
			}

			// If we have a complete block or reached a natural stopping point
			if ((braceCount === 0 && parenCount === 0) ||
				line.trim().endsWith(';') ||
				line.trim().endsWith('}') ||
				currentSuggestion.split('\n').length >= 10) {

				suggestions.push(currentSuggestion);
				currentSuggestion = '';

				// Limit to 3 suggestions
				if (suggestions.length >= 3) {
					break;
				}
			}
		}

		// Add any remaining content
		if (currentSuggestion.trim() && suggestions.length < 3) {
			suggestions.push(currentSuggestion);
		}

		return suggestions.length > 0 ? suggestions : [text];
	}

	private _calculateInsertRange(suggestion: string, position: Position, textAfterCursor: string): Range {
		// Calculate how much of the existing text after cursor should be replaced
		let replaceLength = 0;

		// If the suggestion starts with the same text as what's after the cursor,
		// we should replace that overlapping part
		if (textAfterCursor) {
			const suggestionStart = suggestion.split('\n')[0];
			let overlap = 0;

			for (let i = 0; i < Math.min(suggestionStart.length, textAfterCursor.length); i++) {
				if (suggestionStart[i] === textAfterCursor[i]) {
					overlap++;
				} else {
					break;
				}
			}

			replaceLength = overlap;
		}

		return new Range(
			position.lineNumber,
			position.column,
			position.lineNumber,
			position.column + replaceLength
		);
	}

	private _updateConfiguration(): void {
		const config = this.configurationService.getValue<any>('aiAssistant.completion') || {};
		this._isEnabled = config.enabled !== false;
	}

	freeInlineCompletions(): void {
		// Cleanup method - nothing to do for now
	}

	disposeInlineCompletions(): void {
		// Dispose method required by interface
	}
}
