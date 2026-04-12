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
import { GeneralShellType, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';

export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	readonly isBuiltin = true;
	readonly triggerCharacters?: string[];
	private _provider: CompletionItemProvider;
	private _textVirtualModel: IReference<IResolvedTextEditorModel>;
	private _lspTerminalModelContentProvider: LspTerminalModelContentProvider;
	readonly shellTypes: TerminalShellType[] = [GeneralShellType.Python];

	constructor(
		provider: CompletionItemProvider,
		textVirtualModel: IReference<IResolvedTextEditorModel>,
		lspTerminalModelContentProvider: LspTerminalModelContentProvider,
	) {
		super();
		this._provider = provider;
		this._textVirtualModel = textVirtualModel;
		this._lspTerminalModelContentProvider = lspTerminalModelContentProvider;
		this.triggerCharacters = provider.triggerCharacters ? [...provider.triggerCharacters, ' ', '('] : [' ', '('];
	}

	activate(terminal: Terminal): void {
		// console.log('activate');
	}

	async provideCompletions(value: string, cursorPosition: number, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {

		// Apply edit for non-executed current commandline --> Pretend we are typing in the real-document.
		this._lspTerminalModelContentProvider.trackPromptInputToVirtualFile(value);

		const textBeforeCursor = value.substring(0, cursorPosition);
		const lines = textBeforeCursor.split('\n');
		const column = lines[lines.length - 1].length + 1;

		// Get line from virtualDocument, not from terminal
		const lineNum = this._textVirtualModel.object.textEditorModel.getLineCount();
		const positionVirtualDocument = new Position(lineNum, column);

		const completions: ITerminalCompletion[] = [];
		if (this._provider && this._provider._debugDisplayName !== 'wordbasedCompletions') {

			const result = await this._provider.provideCompletionItems(this._textVirtualModel.object.textEditorModel, positionVirtualDocument, { triggerKind: CompletionTriggerKind.TriggerCharacter }, token);
			for (const item of (result?.suggestions || [])) {
				// TODO: Support more terminalCompletionItemKind for [different LSP providers](https://github.com/microsoft/vscode/issues/249479)
				const convertedKind = item.kind ? mapLspKindToTerminalKind(item.kind) : TerminalCompletionItemKind.Method;
				const completionItemTemp = createCompletionItemPython(cursorPosition, textBeforeCursor, convertedKind, 'lspCompletionItem', undefined);
				const terminalCompletion: ITerminalCompletion = {
					label: item.label,
					provider: `lsp:${item.extensionId?.value}`,
					detail: item.detail,
					documentation: item.documentation,
					kind: convertedKind,
					replacementRange: completionItemTemp.replacementRange,
				};

				// Store unresolved item and provider for lazy resolution if needed
				if (this._provider.resolveCompletionItem && (!item.detail || !item.documentation)) {
					terminalCompletion._unresolvedItem = item;
					terminalCompletion._resolveProvider = this._provider;
				}

				completions.push(terminalCompletion);
			}
		}

		return completions;
	}
}

export function createCompletionItemPython(
	cursorPosition: number,
	prefix: string,
	kind: TerminalCompletionItemKind,
	label: string | CompletionItemLabel,
	detail: string | undefined
): TerminalCompletionItem {
	const lastWord = getLastWord(prefix);

	return {
		label,
		detail: detail ?? '',
		replacementRange: [cursorPosition - lastWord.length, cursorPosition],
		kind: kind ?? TerminalCompletionItemKind.Method
	};
}

function getLastWord(prefix: string): string {
	if (prefix.endsWith(' ')) {
		return '';
	}

	if (prefix.endsWith('.')) {
		return '';
	}

	const lastSpaceIndex = prefix.lastIndexOf(' ');
	const lastDotIndex = prefix.lastIndexOf('.');
	const lastParenIndex = prefix.lastIndexOf('(');

	// Get the maximum index (most recent delimiter)
	const lastDelimiterIndex = Math.max(lastSpaceIndex, lastDotIndex, lastParenIndex);

	// If no delimiter found, return the entire prefix
	if (lastDelimiterIndex === -1) {
		return prefix;
	}

	// Return the substring after the last delimiter
	return prefix.substring(lastDelimiterIndex + 1);
}

export interface TerminalCompletionItem {
	/**
	 * The label of the completion.
	 */
	label: string | CompletionItemLabel;

	/**
	 * Selection range (inclusive start, exclusive end) to replace when this completion is applied.
	 */
	replacementRange: readonly [number, number] | undefined;

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
