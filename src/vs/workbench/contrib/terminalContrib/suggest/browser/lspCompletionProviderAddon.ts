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

	async provideCompletions(value: string, cursorPosition: number, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {
		console.log('provideCompletions', value, cursorPosition);

		// TODO: Create and use a fake document in our target language
		// TODO: How come real python path does not work?

		const uri = URI.from({
			scheme: 'untitled',
			path: '/Users/anthonykim/Desktop/vscode/extensions/vscode-colorize-tests/test/colorize-fixtures/test.py'
		});
		const textModel = await this._textModelService.createModelReference(uri);
		textModel.object.textEditorModel.setLanguage('python');
		const providers = this._languageFeaturesService.completionProvider.all(textModel.object.textEditorModel);

		// TODO: Use the actual position based on cursorPosition, is this how you do it?
		const textBeforeCursor = value.substring(0, cursorPosition);
		const lines = textBeforeCursor.split('\n');
		const lineNumber = lines.length;
		const column = lines[lines.length - 1].length + 1;
		const position = new Position(lineNumber, column);

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
				// TODO: Use actual replacement index and length
				replacementIndex: 0,
				replacementLength: 0,
			})));
			console.log(result?.suggestions);
		}

		return completions;
	}
	// Main issues:
	// Pylance never shows up as one of the provider even when we pass in Python file
	// Inside REPL (Python subshell under supershell), prompt input is not tracked, so there is no trigger
	// Label does not show up
	// Currently only enabled for pwsh, even though register happens in broader scope.
}
