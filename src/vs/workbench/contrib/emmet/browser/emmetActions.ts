/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorAction, ServicesAccessor, IActionOptions } from '../../../../editor/browser/editorExtensions.js';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from '../../../services/textMate/common/TMGrammars.js';
import { IExtensionService, ExtensionPointContribution } from '../../../services/extensions/common/extensions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';

interface ModeScopeMap {
	[key: string]: string;
}

export interface IGrammarContributions {
	getGrammar(mode: string): string;
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

interface IEmmetActionOptions extends IActionOptions {
	actionName: string;
}

export abstract class EmmetEditorAction extends EditorAction {

	protected emmetActionName: string;

	constructor(opts: IEmmetActionOptions) {
		super(opts);
		this.emmetActionName = opts.actionName;
	}

	private static readonly emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl', 'svg'];

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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);
		const commandService = accessor.get(ICommandService);

		return this._withGrammarContributions(extensionService).then((grammarContributions) => {

			if (this.id === 'editor.emmet.action.expandAbbreviation' && grammarContributions) {
				return commandService.executeCommand<void>('emmet.expandAbbreviation', EmmetEditorAction.getLanguage(editor, grammarContributions));
			}

			return undefined;
		});

	}

	public static getLanguage(editor: ICodeEditor, grammars: IGrammarContributions) {
		const model = editor.getModel();
		const selection = editor.getSelection();

		if (!model || !selection) {
			return null;
		}

		const position = selection.getStartPosition();
		model.tokenization.tokenizeIfCheap(position.lineNumber);
		const languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		const syntax = languageId.split('.').pop();

		if (!syntax) {
			return null;
		}

		const checkParentMode = (): string => {
			const languageGrammar = grammars.getGrammar(syntax);
			if (!languageGrammar) {
				return syntax;
			}
			const languages = languageGrammar.split('.');
			if (languages.length < 2) {
				return syntax;
			}
			for (let i = 1; i < languages.length; i++) {
				const language = languages[languages.length - i];
				if (this.emmetSupportedModes.indexOf(language) !== -1) {
					return language;
				}
			}
			return syntax;
		};

		return {
			language: syntax,
			parentMode: checkParentMode()
		};
	}


}
