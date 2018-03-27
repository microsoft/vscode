/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, FormattingOptions, TextDocument, CancellationToken, window, Disposable, workspace } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as languageIds from '../utils/languageModeIds';

namespace FormattingConfiguration {
	export function equals(a: Proto.FormatCodeSettings, b: Proto.FormatCodeSettings): boolean {
		let keys = Object.keys(a);
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			if ((a as any)[key] !== (b as any)[key]) {
				return false;
			}
		}
		return true;
	}
}

export default class FormattingConfigurationManager {
	private onDidCloseTextDocumentSub: Disposable | undefined;
	private formatOptions: { [key: string]: Proto.FormatCodeSettings | undefined; } = Object.create(null);

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		this.onDidCloseTextDocumentSub = Workspace.onDidCloseTextDocument((textDocument) => {
			const key = textDocument.uri.toString();
			// When a document gets closed delete the cached formatting options.
			// This is necessary since the tsserver now closed a project when its
			// last file in it closes which drops the stored formatting options
			// as well.
			delete this.formatOptions[key];
		});
	}

	public dispose() {
		if (this.onDidCloseTextDocumentSub) {
			this.onDidCloseTextDocumentSub.dispose();
			this.onDidCloseTextDocumentSub = undefined;
		}
	}

	public async ensureFormatOptionsForDocument(
		document: TextDocument,
		token: CancellationToken | undefined
	): Promise<void> {
		const editor = window.visibleTextEditors.find(editor => editor.document.fileName === document.fileName);
		if (editor) {
			const formattingOptions = {
				tabSize: editor.options.tabSize,
				insertSpaces: editor.options.insertSpaces
			} as FormattingOptions;
			return this.ensureFormatOptions(document, formattingOptions, token);
		}
	}

	public async ensureFormatOptions(
		document: TextDocument,
		options: FormattingOptions,
		token: CancellationToken | undefined
	): Promise<void> {
		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return;
		}

		const key = document.uri.toString();
		const cachedOptions = this.formatOptions[key];
		const formatOptions = this.getFormatOptions(document, options);

		if (cachedOptions && FormattingConfiguration.equals(cachedOptions, formatOptions)) {
			return;
		}

		const args: Proto.ConfigureRequestArguments = {
			file: file,
			formatOptions: formatOptions
		};
		await this.client.execute('configure', args, token);
		this.formatOptions[key] = formatOptions;
	}

	public reset() {
		this.formatOptions = Object.create(null);
	}

	private getFormatOptions(
		document: TextDocument,
		options: FormattingOptions
	): Proto.FormatCodeSettings {
		const config = workspace.getConfiguration(
			document.languageId === languageIds.typescript || document.languageId === languageIds.typescriptreact
				? 'typescript.format'
				: 'javascript.format',
			document.uri);
		return {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convertTabsToSpaces: options.insertSpaces,
			// We can use \n here since the editor normalizes later on to its line endings.
			newLineCharacter: '\n',
			insertSpaceAfterCommaDelimiter: config.get<boolean>('insertSpaceAfterCommaDelimiter'),
			insertSpaceAfterConstructor: config.get<boolean>('insertSpaceAfterConstructor'),
			insertSpaceAfterSemicolonInForStatements: config.get<boolean>('insertSpaceAfterSemicolonInForStatements'),
			insertSpaceBeforeAndAfterBinaryOperators: config.get<boolean>('insertSpaceBeforeAndAfterBinaryOperators'),
			insertSpaceAfterKeywordsInControlFlowStatements: config.get<boolean>('insertSpaceAfterKeywordsInControlFlowStatements'),
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: config.get<boolean>('insertSpaceAfterFunctionKeywordForAnonymousFunctions'),
			insertSpaceBeforeFunctionParenthesis: config.get<boolean>('insertSpaceBeforeFunctionParenthesis'),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis'),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets'),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces'),
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces'),
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces'),
			insertSpaceAfterTypeAssertion: config.get<boolean>('insertSpaceAfterTypeAssertion'),
			placeOpenBraceOnNewLineForFunctions: config.get<boolean>('placeOpenBraceOnNewLineForFunctions'),
			placeOpenBraceOnNewLineForControlBlocks: config.get<boolean>('placeOpenBraceOnNewLineForControlBlocks'),
		};
	}
}
