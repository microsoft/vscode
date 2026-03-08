/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient } from '../llm/LlmClient';

/** Language IDs where completions are disabled by default. */
const EXCLUDED_LANGUAGES = new Set(['json', 'jsonc', 'plaintext', 'log']);

/**
 * Provides ghost-text inline completions powered by Haiku for speed.
 * Debounces requests and cancels stale ones automatically.
 */
export class CompletionProvider implements vscode.InlineCompletionItemProvider {
	private readonly llmClient: LlmClient;
	private pendingAbort: AbortController | undefined;

	constructor(llmClient: LlmClient) {
		this.llmClient = llmClient;
	}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
	): Promise<vscode.InlineCompletionItem[] | undefined> {
		// Check if completions are enabled
		const config = vscode.workspace.getConfiguration('sota');
		if (!config.get<boolean>('completions.enabled', true)) {
			return undefined;
		}

		// Skip excluded languages
		if (EXCLUDED_LANGUAGES.has(document.languageId)) {
			return undefined;
		}

		// Skip if in a comment or string (basic heuristic)
		const lineText = document.lineAt(position.line).text;
		const textBeforeCursor = lineText.substring(0, position.character);
		if (this.isInCommentOrString(textBeforeCursor, document.languageId)) {
			return undefined;
		}

		// Cancel any pending request
		this.pendingAbort?.abort();
		this.pendingAbort = new AbortController();
		const signal = this.pendingAbort.signal;

		// Debounce
		const debounceMs = config.get<number>('completions.debounceMs', 300);
		await new Promise<void>(resolve => setTimeout(resolve, debounceMs));

		if (token.isCancellationRequested || signal.aborted) {
			return undefined;
		}

		// Gather context: prefix and suffix around cursor
		const maxContextLines = 100;
		const startLine = Math.max(0, position.line - maxContextLines);
		const endLine = Math.min(document.lineCount - 1, position.line + maxContextLines);

		const prefix = document.getText(
			new vscode.Range(startLine, 0, position.line, position.character)
		);
		const suffix = document.getText(
			new vscode.Range(position.line, position.character, endLine + 1, 0)
		);

		const prompt = [
			`File: ${document.fileName}`,
			`Language: ${document.languageId}`,
			'',
			'Complete the code at the cursor position marked with <CURSOR>. Return ONLY the completion text, nothing else.',
			'',
			prefix + '<CURSOR>' + suffix,
		].join('\n');

		try {
			const completion = await this.llmClient.request({
				model: 'haiku',
				messages: [{ role: 'user', content: prompt }],
				systemPrompt: 'You are an inline code completion engine. Return ONLY the code that should be inserted at the cursor position. No explanations, no markdown, no surrounding code. Just the completion text.',
				maxTokens: 256,
				signal,
			});

			if (token.isCancellationRequested || signal.aborted) {
				return undefined;
			}

			const trimmed = completion.trim();
			if (!trimmed) {
				return undefined;
			}

			return [
				new vscode.InlineCompletionItem(
					trimmed,
					new vscode.Range(position, position),
				),
			];
		} catch {
			return undefined;
		}
	}

	/**
	 * Basic heuristic to detect if cursor is inside a comment or string.
	 */
	private isInCommentOrString(textBeforeCursor: string, _languageId: string): boolean {
		const trimmed = textBeforeCursor.trimStart();

		// Line comments
		if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
			return true;
		}

		// Count unescaped quotes to detect if we're inside a string
		let singleQuotes = 0;
		let doubleQuotes = 0;
		let backticks = 0;
		for (let i = 0; i < textBeforeCursor.length; i++) {
			const ch = textBeforeCursor[i];
			if (ch === '\\') {
				i++; // skip escaped character
				continue;
			}
			if (ch === "'") {
				singleQuotes++;
			}
			if (ch === '"') {
				doubleQuotes++;
			}
			if (ch === '`') {
				backticks++;
			}
		}

		// Odd count means we're inside a string
		return (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0) || (backticks % 2 !== 0);
	}
}
