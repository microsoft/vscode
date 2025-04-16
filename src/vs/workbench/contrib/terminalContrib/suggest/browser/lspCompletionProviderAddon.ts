/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Disposable, IReference } from '../../../../../base/common/lifecycle.js';
import { ITerminalCompletionProvider, type TerminalCompletionList } from './terminalCompletionService.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionItemProvider, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { Schemas } from '../../../../../base/common/network.js';

export function createTerminalLanguageVirtualUri(terminalId: string, languageExtension: string): URI {
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${terminalId}/terminal.${languageExtension}`,
	});
}

// IMPORTANT: Each LSPCompletionProviderAddon should be responsible for managing ONE specific language server completion provider.
// Rather than handling all of them.
// TODO: In the constructor pass in provider, so each provider can pass its own trigger characters, have its own provideCompletions method
export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	readonly isBuiltin = true;
	// TODO: Define this, it's determined by the language features that we don't get until later currently?
	//	- Depending on the providerthat gets passed into constructor & shell info, use different triggerCharacters
	readonly triggerCharacters?: string[] | undefined;
	private _provider: any;
	private _textVirtualModel: IReference<IResolvedTextEditorModel>;

	constructor(
		provider: CompletionItemProvider,
		textVirtualModel: IReference<IResolvedTextEditorModel>,
		// triggerCharacters: string[] | undefined,
		// id: string,
	) {
		super();
		this._provider = provider;
		this._textVirtualModel = textVirtualModel;
		// this.triggerCharacters = triggerCharacters;
		// this.id = id;
	}

	activate(terminal: Terminal): void {
		console.log('activate');
	}

	// On higher level, where we instantiate LSPCompletionProviderAddon (terminal.suggest.contribution.ts for now), we should:
	// 1. Identify shell type
	// 2. Create appropriate virtual document (vscodeTerminal scheme) with appropriate extension (e.g. .py)
	// 3. Then have each of the relevant providers call its provideCompletions method

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: false, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {
		// Hardcoded Python file, good for testing.
		// const uri = URI.file('/Users/anthonykim/Desktop/vscode/src/vs/workbench/contrib/terminalContrib/suggest/browser/usePylance.py');
		// const testRealUri = this._textModelService.canHandleResource(uri);
		// const textModel = await this._textModelService.createModelReference(uri);
		// const providers = this._languageFeaturesService.completionProvider.all(textModel.object.textEditorModel);

		const textBeforeCursor = value.substring(0, cursorPosition);
		const lines = textBeforeCursor.split('\n');
		const lineNumber = lines.length;
		const column = lines[lines.length - 1].length + 1;
		const position = new Position(lineNumber, column);

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
			const result = await this._provider.provideCompletionItems(this._textVirtualModel.object.textEditorModel, position, { triggerKind: CompletionTriggerKind.Invoke }, token);
			// TODO: Discard duplicates (i.e. language should take precendence over word based completions)
			// TODO: Discard completion items that we cannot map to terminal items (complex edits?)
			completions.push(...(result?.suggestions || []).map((e: any) => ({
				// TODO: Investigate insertTextRules, edits, etc
				label: e.insertText,
				provider: `lsp:${this._provider._debugDisplayName}`,
				detail: e.detail,
				// TODO: Map kind to terminal kindc
				kind: TerminalCompletionItemKind.Method,
				// Use calculated replacement index and length
				replacementIndex,
				replacementLength,
			})));
			console.log(result?.suggestions);
		}

		return completions;
	}
}
