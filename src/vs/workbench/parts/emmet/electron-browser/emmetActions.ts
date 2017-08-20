/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { EditorAction, ServicesAccessor, IActionOptions } from 'vs/editor/common/editorCommonExtensions';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from 'vs/workbench/services/textMate/electron-browser/TMGrammars';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IExtensionService, ExtensionPointContribution } from 'vs/platform/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';

interface ModeScopeMap {
	[key: string]: string;
}

export interface IGrammarContributions {
	getGrammar(mode: string): string;
}

export interface ILanguageIdentifierResolver {
	getLanguageIdentifier(modeId: LanguageId): LanguageIdentifier;
}

class GrammarContributions implements IGrammarContributions {

	private static _grammars: ModeScopeMap = null;

	constructor(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		if (GrammarContributions._grammars === null) {
			this.fillModeScopeMap(contributions);
		}
	}

	private fillModeScopeMap(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		GrammarContributions._grammars = {};
		contributions.forEach((contribution) => {
			contribution.value.forEach((grammar) => {
				if (grammar.language && grammar.scopeName) {
					GrammarContributions._grammars[grammar.language] = grammar.scopeName;
				}
			});
		});
	}

	public getGrammar(mode): string {
		return GrammarContributions._grammars[mode];
	}
}

export interface IEmmetActionOptions extends IActionOptions {
	actionName: string;
}

export abstract class EmmetEditorAction extends EditorAction {

	protected emmetActionName: string;

	constructor(opts: IEmmetActionOptions) {
		super(opts);
		this.emmetActionName = opts.actionName;
	}

	private static readonly emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl', 'svg'];

	private _lastGrammarContributions: TPromise<GrammarContributions> = null;
	private _lastExtensionService: IExtensionService = null;
	private _withGrammarContributions(extensionService: IExtensionService): TPromise<GrammarContributions> {
		if (this._lastExtensionService !== extensionService) {
			this._lastExtensionService = extensionService;
			this._lastGrammarContributions = extensionService.readExtensionPointContributions(grammarsExtPoint).then((contributions) => {
				return new GrammarContributions(contributions);
			});
		}
		return this._lastGrammarContributions;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const extensionService = accessor.get(IExtensionService);
		const modeService = accessor.get(IModeService);
		const commandService = accessor.get(ICommandService);

		return this._withGrammarContributions(extensionService).then((grammarContributions) => {

			if (this.id === 'editor.emmet.action.expandAbbreviation') {
				return commandService.executeCommand<void>('emmet.expandAbbreviation', EmmetEditorAction.getLanguage(modeService, editor, grammarContributions));
			}

			return undefined;
		});

	}

	public static getLanguage(languageIdentifierResolver: ILanguageIdentifierResolver, editor: ICommonCodeEditor, grammars: IGrammarContributions) {
		let position = editor.getSelection().getStartPosition();
		editor.getModel().forceTokenization(position.lineNumber);
		let languageId = editor.getModel().getLanguageIdAtPosition(position.lineNumber, position.column);
		let language = languageIdentifierResolver.getLanguageIdentifier(languageId).language;
		let syntax = language.split('.').pop();

		let checkParentMode = (): string => {
			let languageGrammar = grammars.getGrammar(syntax);
			if (!languageGrammar) {
				return syntax;
			}
			let languages = languageGrammar.split('.');
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


