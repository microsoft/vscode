/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor, EditorCommand } from 'vs/editor/browser/editorExtensions';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from 'vs/workbench/services/textMate/common/TMGrammars';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IExtensionService, ExtensionPointContribution } from 'vs/workbench/services/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

interface ModeScopeMap {
	[key: string]: string;
}

export interface IGrammarContributions {
	getGrammar(mode: string): string;
}

export interface ILanguageIdentifierResolver {
	getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier | null;
}

class GrammarContributions implements IGrammarContributions {
	private static _grammars: ModeScopeMap = {};

	constructor(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		if (!Object.keys(GrammarContributions._grammars).length) {
			this.fillModeScopeMap(contributions);
		}
	}

	private fillModeScopeMap(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		contributions.forEach((contribution) => {
			contribution.value.forEach((grammar) => {
				if (grammar.language && grammar.scopeName) {
					GrammarContributions._grammars[grammar.language] = grammar.scopeName;
				}
			});
		});
	}

	public getGrammar(mode: string): string {
		return GrammarContributions._grammars[mode];
	}
}

export class ExpandEmmetAbbreviationCommand extends EditorCommand {
	constructor() {
		super({ id: 'workbench.action.expandEmmetAbbreviation', precondition: undefined });
	}

	private static readonly emmetSupportedModes = ['html', 'xml', 'xsl', 'jsx', 'js', 'pug', 'slim', 'haml', 'css', 'sass', 'scss', 'less', 'sss', 'stylus'];

	private _lastGrammarContributions: Promise<GrammarContributions> | null = null;
	private _lastExtensionService: IExtensionService | null = null;
	private _withGrammarContributions(extensionService: IExtensionService): Promise<GrammarContributions | null> {
		if (this._lastExtensionService !== extensionService) {
			this._lastExtensionService = extensionService;
			this._lastGrammarContributions = extensionService.readExtensionPointContributions(grammarsExtPoint).then((contributions) => {
				return new GrammarContributions(contributions);
			});
		}
		return this._lastGrammarContributions || Promise.resolve(null);
	}

	public runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: any): void | Promise<void> {
		if (!accessor) {
			return;
		}

		const extensionService = accessor.get(IExtensionService);
		const modeService = accessor.get(IModeService);
		const commandService = accessor.get(ICommandService);

		return this._withGrammarContributions(extensionService).then((grammarContributions) => {
			if (this.id === 'workbench.action.expandEmmetAbbreviation' && grammarContributions) {
				return commandService.executeCommand<void>('editor.emmet.action.expandAbbreviationInternal', ExpandEmmetAbbreviationCommand.getLanguage(modeService, editor, grammarContributions));
			}
			return undefined;
		});
	}

	public static getLanguage(languageIdentifierResolver: ILanguageIdentifierResolver, editor: ICodeEditor, grammars: IGrammarContributions) {
		const model = editor.getModel();
		const selection = editor.getSelection();

		if (!model || !selection) {
			return null;
		}

		const position = selection.getStartPosition();
		model.tokenizeIfCheap(position.lineNumber);
		const languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		const languageIdentifier = languageIdentifierResolver.getLanguageIdentifier(languageId);
		const language = languageIdentifier ? languageIdentifier.language : '';
		let syntax = language.split('.').pop();

		if (!syntax) {
			return null;
		}

		// map to something Emmet understands
		if (['jsx-tags', 'javascriptreact', 'typescriptreact'].includes(syntax)) {
			syntax = 'jsx';
		}

		const getParentMode = (syntax: string): string => {
			if (syntax === 'jsx') {
				// return otherwise getGrammar gives a string that Emmet doesn't understand
				return syntax;
			}

			const languageGrammar = grammars.getGrammar(syntax);
			if (!languageGrammar) {
				return syntax;
			}
			const languages = languageGrammar.split('.');
			if (languages.length <= 1) {
				return syntax;
			}
			for (let i = 0; i < languages.length - 1; i++) {
				const language = languages[languages.length - i - 1];
				if (this.emmetSupportedModes.includes(language)) {
					return language;
				}
			}
			return syntax;
		};

		return {
			language: syntax,
			parentMode: getParentMode(syntax)
		};
	}
}

export const expandEmmetAbbreviationCommand = new ExpandEmmetAbbreviationCommand();
