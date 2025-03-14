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
import { Schemas } from '../../../../../base/common/network.js';

export function createTerminalLanguageVirtualUri(terminalId: string, languageExtension: string): URI {
	return URI.from({
		scheme: Schemas.vscodeTerminal,
		path: `/${terminalId}/terminal.${languageExtension}`,
	});
}

// TODO: Have one terminalCompletion provider per a single LspCompletionProviderAddon
// TODO: In the constructor pass in provider, so each provider can pass its own trigger characters, have its own provideCompletions method
export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	// TODO: Higher level (probably put this in terminal.suggest.contribution.ts), where we instatntiate LSPCompletionProviderAddon:
	//    - List out all the shells that we support using lsp.
	readonly shellTypes = [
		GeneralShellType.Python,
		GeneralShellType.PowerShell
	];
	readonly isBuiltin = true;

	// TODO: Define this, it's determined by the language features that we don't get until later currently?
	//	- Depending on the providerthat gets passed into constructor & shell info, use different triggerCharacters

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

	// On higher level, where we instantiate LSPCompletionProviderAddon (terminal.suggest.contribution.ts for now), we should:
	// 1. Identify shell type
	// 2. Create appropriate virtual document (vscodeTerminal scheme) with appropriate extension (e.g. .py)
	// 3. Then have each of the relevant providers call its provideCompletions method

	// More design details TODO:
	//	-One virtual fake document per terminal instance + life time of it
	// lazily create it when needed, and load

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: false, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {
		console.log('provideCompletions', value, cursorPosition);

		// WIP 03/14/25 -> TODO: Create and use a fake/virtual document in our target language.

		const uri = URI.file('/Users/anthonykim/Desktop/vscode/src/vs/workbench/contrib/terminalContrib/suggest/browser/usePylance.py');
		const testRealUri = this._textModelService.canHandleResource(uri);
		const testVirtualUri = this._textModelService.canHandleResource(createTerminalLanguageVirtualUri('1', 'py'));
		console.log('testRealUri', testRealUri);
		console.log('testVirtualUri', testVirtualUri); // cannot resolve to a text model
		const textModel = await this._textModelService.createModelReference(uri);
		const providers = this._languageFeaturesService.completionProvider.all(textModel.object.textEditorModel);

		// Problem: When trying to pass in a custom uri made via {createTerminalLanguageVirtualUri}
		// into `await this._textModelService.createModelReference(uri);`

		// We crash... Why?
		// Because resource can be resolved to a text model.

		// Potential solution: Might need to create/register a ITextModelContentProvider for vscodeTerminal scheme??
		//	- This include implementing provideTextContent method. -> returns ITextModel for given URI

		// Why do I need all of above in the potential solution section:
		// ILanguageFeatureService relies on ITextModel to determine which providers are applicable for given file?

		// Does ITextModel contain information about file's language, URI, metadata that language feature service uses to filter the providers?

		// Question: Can I trust `languageFeatureService.completionProvider.all()` to give me the right providers?
		// If the extension is `.py` would it automatically contain all Python related one?

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
		// TODO: After getting provider passed into constructor, we should not iterate through list of ALL providers.
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
