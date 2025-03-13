/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITerminalCompletionProvider, type TerminalCompletionList } from './terminalCompletionService.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { GeneralShellType } from '../../../../../platform/terminal/common/terminal.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionTriggerKind } from '../../../../../editor/common/languages.js';
// TODO: have one terminalCompletion provider per a single LspCompletionProviderAddon
// TODO: In the constructor pass in provider, so each provider can pass its own trigger characters, have its own provideCompletions method

export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	// TODO: Refine this list, what languages do we want to support?
	readonly shellTypes = [
		GeneralShellType.Python,
		GeneralShellType.PowerShell
	];
	readonly isBuiltin = true;

	// TODO: Define this, it's determined by the language features that we don't get until later
	// currently?
	triggerCharacters?: string[] | undefined;

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
	}

	activate(terminal: Terminal): void {
		console.log('activate');
	}

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: false, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {
		console.log('provideCompletions', value, cursorPosition);

		// TODO: Create and use a fake document in our target language

		// TODO: Get Virtual file to work.
		//       TODO: look for adding new scheme, look how existing ones were created.

		// one virtual fake document per terminal instance + life time of it
		// lazily create it when needed, and load

		const uri = URI.file('/Users/anthonykim/Desktop/vscode/src/vs/workbench/contrib/terminalContrib/suggest/browser/usePylance.py');
		const textModel = await this._textModelService.createModelReference(uri);
		const providers = this._languageFeaturesService.completionProvider.all(textModel.object.textEditorModel);

		// TODO: Use the actual position based on cursorPosition:
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
		for (const provider of providers) {
			const result = await provider.provideCompletionItems(textModel.object.textEditorModel, position, { triggerKind: CompletionTriggerKind.Invoke }, token);
			// TODO: Discard duplicates (ie. language should take precedence over word based completions)
			// TODO: Discard completion items that we cannot map to terminal items (complex edits?)
			completions.push(...(result?.suggestions || []).map(e => ({
				// TODO: Investigate insertTextRules, edits, etc.
				label: e.insertText,
				provider: `lsp:${provider._debugDisplayName}`,
				detail: e.detail,
				// TODO: Map kind to terminal kind
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
