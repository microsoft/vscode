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
import { CompletionItemKind, CompletionItemTag } from '../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IAIAssistantService } from '../common/aiAssistantService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class AICompletionProvider extends Disposable implements languages.CompletionItemProvider {
	readonly _debugDisplayName = 'aiCompletions';
	readonly triggerCharacters = ['.', '(', '[', '{', ' ', '\n', '\t'];

	private _isEnabled = true;
	private _completionCache = new Map<string, { completion: string; timestamp: number }>();
	private readonly _cacheTimeout = 5 * 60 * 1000; // 5 minutes

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

	async provideCompletionItems(
		model: ITextModel,
		position: Position,
		context: languages.CompletionContext,
		token: CancellationToken
	): Promise<languages.CompletionList | undefined> {

		if (!this._isEnabled || !this.aiAssistantService.isAvailable()) {
			return undefined;
		}

		// Don't trigger on every keystroke - only on specific triggers or manual invocation
		if (context.triggerKind === languages.CompletionTriggerKind.Invoke ||
			(context.triggerKind === languages.CompletionTriggerKind.TriggerCharacter &&
				this.triggerCharacters.includes(context.triggerCharacter || ''))) {

			try {
				const completions = await this._generateCompletions(model, position, token);
				return {
					suggestions: completions,
					incomplete: false
				};
			} catch (error) {
				onUnexpectedExternalError(error);
				this.logService.error('AI Completion Provider: Failed to generate completions', error);
				return undefined;
			}
		}

		return undefined;
	}

	private async _generateCompletions(
		model: ITextModel,
		position: Position,
		token: CancellationToken
	): Promise<languages.CompletionItem[]> {

		const config = this.configurationService.getValue<any>('aiAssistant.completion') || {};
		const maxLines = config.contextLines || 50;

		// Get context around the cursor
		const startLine = Math.max(1, position.lineNumber - maxLines);
		const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);
		const contextRange = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
		const contextText = model.getValueInRange(contextRange);

		// Get the current line and cursor position
		const currentLine = model.getLineContent(position.lineNumber);
		const textBeforeCursor = currentLine.substring(0, position.column - 1);
		const textAfterCursor = currentLine.substring(position.column - 1);

		// Create cache key
		const cacheKey = `${model.uri.toString()}:${position.lineNumber}:${position.column}:${textBeforeCursor}`;

		// Check cache first
		const cached = this._completionCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
			return this._createCompletionItems(cached.completion, position, textBeforeCursor);
		}

		// Build prompt for AI completion
		const language = model.getLanguageId();
		const prompt = this._buildCompletionPrompt(contextText, textBeforeCursor, textAfterCursor, language);

		try {
			const response = await this.aiAssistantService.generateCompletion({
				prompt,
				context: contextText,
				language,
				maxTokens: config.maxTokens || 500,
				temperature: config.temperature || 0.3,
				stopSequences: ['\n\n', '```', '---']
			}, token);

			// Cache the result
			this._completionCache.set(cacheKey, {
				completion: response.text,
				timestamp: Date.now()
			});

			// Clean old cache entries
			this._cleanCache();

			return this._createCompletionItems(response.text, position, textBeforeCursor);
		} catch (error) {
			this.logService.error('AI Completion: Generation failed', error);
			return [];
		}
	}

	private _buildCompletionPrompt(context: string, beforeCursor: string, afterCursor: string, language: string): string {
		return `Complete the following ${language} code. Provide only the completion text, no explanations.

Context:
\`\`\`${language}
${context}
\`\`\`

Complete this line:
${beforeCursor}|${afterCursor}

Completion:`;
	}

	private _createCompletionItems(completionText: string, position: Position, textBeforeCursor: string): languages.CompletionItem[] {
		if (!completionText.trim()) {
			return [];
		}

		const completions: languages.CompletionItem[] = [];

		// Split completion into multiple suggestions if it contains multiple options
		const suggestions = this._parseCompletionSuggestions(completionText);

		for (let i = 0; i < suggestions.length && i < 3; i++) {
			const suggestion = suggestions[i];
			if (!suggestion.trim()) continue;

			// Determine the range to replace
			const wordInfo = this._getWordInfo(textBeforeCursor, position);
			const range = new Range(
				position.lineNumber,
				wordInfo.startColumn,
				position.lineNumber,
				position.column
			);

			completions.push({
				label: {
					label: suggestion.length > 50 ? suggestion.substring(0, 47) + '...' : suggestion,
					description: 'AI'
				},
				kind: this._determineCompletionKind(suggestion),
				insertText: suggestion,
				range,
				sortText: `ai_${i.toString().padStart(3, '0')}`,
				filterText: suggestion,
				detail: 'AI-generated completion',
				documentation: {
					value: `AI-generated code completion\n\n\`\`\`\n${suggestion}\n\`\`\``,
					isTrusted: true
				},
				tags: [CompletionItemTag.Deprecated], // Use as a marker for AI completions
				command: {
					id: 'aiAssistant.logCompletion',
					title: 'Log AI Completion Usage'
				}
			});
		}

		return completions;
	}

	private _parseCompletionSuggestions(text: string): string[] {
		// Clean up the completion text
		let cleaned = text.trim();

		// Remove code block markers if present
		cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

		// Split by common separators that might indicate multiple suggestions
		const suggestions = cleaned.split(/\n(?=\w)|(?<=;)\s*\n|(?<=})\s*\n/)
			.map(s => s.trim())
			.filter(s => s.length > 0);

		return suggestions.length > 0 ? suggestions : [cleaned];
	}

	private _determineCompletionKind(text: string): CompletionItemKind {
		// Simple heuristics to determine completion kind
		if (text.includes('function ') || text.includes('def ') || text.includes('=>')) {
			return CompletionItemKind.Function;
		}
		if (text.includes('class ')) {
			return CompletionItemKind.Class;
		}
		if (text.includes('const ') || text.includes('let ') || text.includes('var ')) {
			return CompletionItemKind.Variable;
		}
		if (text.includes('interface ') || text.includes('type ')) {
			return CompletionItemKind.Interface;
		}
		if (text.includes('import ') || text.includes('from ')) {
			return CompletionItemKind.Module;
		}
		if (text.includes('//') || text.includes('/*')) {
			return CompletionItemKind.Text;
		}

		return CompletionItemKind.Snippet;
	}

	private _getWordInfo(textBeforeCursor: string, position: Position): { startColumn: number; word: string } {
		// Find the start of the current word
		let startColumn = position.column;
		for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
			const char = textBeforeCursor[i];
			if (/\s/.test(char) || /[^\w$]/.test(char)) {
				break;
			}
			startColumn = i + 1;
		}

		return {
			startColumn,
			word: textBeforeCursor.substring(startColumn - 1)
		};
	}

	private _updateConfiguration(): void {
		const config = this.configurationService.getValue<any>('aiAssistant.completion') || {};
		this._isEnabled = config.enabled !== false;
	}

	private _cleanCache(): void {
		const now = Date.now();
		for (const [key, value] of this._completionCache.entries()) {
			if (now - value.timestamp > this._cacheTimeout) {
				this._completionCache.delete(key);
			}
		}
	}
}
