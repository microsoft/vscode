/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Disposable, IReference } from '../../../../../base/common/lifecycle.js';
import { ITerminalCompletionProvider, type TerminalCompletionList } from './terminalCompletionService.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITerminalCompletion, mapLspKindToTerminalKind, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionItemLabel, CompletionItemProvider, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { LspTerminalModelContentProvider } from './lspTerminalModelContentProvider.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';

export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	readonly isBuiltin = true;
	// TODO: Define this, it's determined by the language features that we don't get until later currently?
	//	- Depending on the providerthat gets passed into constructor & shell info, use different triggerCharacters
	readonly triggerCharacters?: string[];
	private _provider: CompletionItemProvider;
	private _textVirtualModel: IReference<IResolvedTextEditorModel>;
	private _lspTerminalModelContentProvider: LspTerminalModelContentProvider;

	constructor(
		provider: CompletionItemProvider,
		textVirtualModel: IReference<IResolvedTextEditorModel>,
		// triggerCharacters: string[] | undefined,
		lspTerminalModelContentProvider: LspTerminalModelContentProvider,
	) {
		super();
		this._provider = provider;
		this._textVirtualModel = textVirtualModel;
		this._lspTerminalModelContentProvider = lspTerminalModelContentProvider;
		this.triggerCharacters = provider.triggerCharacters;
		this.triggerCharacters?.push(' ');
	}

	activate(terminal: Terminal): void {
		console.log('activate');
	}

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: false, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {

		// Apply edit for non-executed current commandline --> Pretend we are typing in the real-document.
		this._lspTerminalModelContentProvider.trackPromptInputToVirtualFile(value);

		const textBeforeCursor = value.substring(0, cursorPosition);
		const lines = textBeforeCursor.split('\n');
		const column = lines[lines.length - 1].length + 1;

		// Get line from virtualDocument, not from terminal
		const lineNum = this._textVirtualModel.object.textEditorModel.getLineCount();
		const positionVirtualDocument = new Position(lineNum, column);

		// Calculate replacement index and length, similar to pwshCompletionProviderAddon
		let replacementIndex = 0;
		let replacementLength = 0;

		// Scan backwards from cursor position to find the start of the current word
		const lastLine = lines[lines.length - 1];
		const wordStartRegex = /[a-zA-Z0-9_\-\.]*$/;
		const match = lastLine.match(wordStartRegex);

		if (match && match.index !== undefined) {
			// Calculate the replacement index - position where the word starts
			replacementIndex = match.index;
			// Calculate replacement length - length of the word being replaced
			replacementLength = match[0].length;
		} else {
			// If no match, set replacement length to cursor position on current line
			replacementLength = lastLine.length;
		}

		// TODO: Scan back to start of nearest word like other providers? Is this needed for `ILanguageFeaturesService`?
		const completions: ITerminalCompletion[] = [];
		if (this._provider && this._provider._debugDisplayName !== 'wordbasedCompletions') {

			const result = await this._provider.provideCompletionItems(this._textVirtualModel.object.textEditorModel, positionVirtualDocument, { triggerKind: CompletionTriggerKind.TriggerCharacter }, token);
			// TODO: Discard duplicates (i.e. language should take precendence over word based completions)
			// TODO: Discard completion items that we cannot map to terminal items (complex edits?)

			completions.push(...(result?.suggestions || []).map((e: any) => {
				const convertedKind = e.kind ? mapLspKindToTerminalKind(e.kind) : TerminalCompletionItemKind.Method;
				const completionItemTemp = createCompletionItemPython(cursorPosition, textBeforeCursor, convertedKind, 'tempLabel', undefined);

				return {
					// TODO: Investigate insertTextRules, edits, etc
					label: e.insertText,
					provider: `lsp:${this._provider._debugDisplayName}`,
					detail: e.detail,
					// Question: Using kind, but LSP completion item still behind regular files, etc
					kind: convertedKind,
					replacementIndex: completionItemTemp.replacementIndex,
					replacementLength: completionItemTemp.replacementLength,
				};
			}));

			console.log(result?.suggestions);
		}
		// const whatIsIntheFile = this._textVirtualModel.object.textEditorModel.getValue();

		return completions;
	}
}

export function createCompletionItemPython(cursorPosition: number, prefix: string, kind: TerminalCompletionItemKind, label: string | CompletionItemLabel, detail: string | undefined): TerminalCompletionItem {
	const endsWithDot = prefix.endsWith('.');
	const endsWithSpace = prefix.endsWith(' ');

	if (endsWithSpace) {
		const lastWord = endsWithSpace ? '' : prefix.split(' ').at(-1) ?? '';
		return {
			label: label,
			detail: detail ?? detail ?? '',
			replacementIndex: cursorPosition - lastWord.length,
			replacementLength: lastWord.length,
			kind: kind ?? kind ?? TerminalCompletionItemKind.Method
		};
	} else {
		const lastWord = endsWithDot ? '' : prefix.split('.').at(-1) ?? '';
		return {
			label,
			detail: detail ?? detail ?? '',
			replacementIndex: cursorPosition - lastWord.length,
			replacementLength: lastWord.length,
			kind: kind ?? kind ?? TerminalCompletionItemKind.Method
		};
	}
}

export interface TerminalCompletionItem {
	/**
	 * The label of the completion.
	 */
	label: string | CompletionItemLabel;

	/**
	 * The index of the start of the range to replace.
	 */
	replacementIndex: number;

	/**
	 * The length of the range to replace.
	 */
	replacementLength: number;

	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;


	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | MarkdownString;

	/**
	 * The completion's kind. Note that this will map to an icon.
	 */
	kind?: TerminalCompletionItemKind;
}
