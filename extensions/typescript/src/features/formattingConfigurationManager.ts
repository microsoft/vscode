/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, FormattingOptions, TextDocument, CancellationToken, WorkspaceConfiguration, window } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface FormattingConfiguration {
	insertSpaceAfterCommaDelimiter: boolean;
	insertSpaceAfterConstructor: boolean;
	insertSpaceAfterSemicolonInForStatements: boolean;
	insertSpaceBeforeAndAfterBinaryOperators: boolean;
	insertSpaceAfterKeywordsInControlFlowStatements: boolean;
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: boolean;
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: boolean;
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: boolean;
	insertSpaceAfterTypeAssertion: boolean;
	insertSpaceBeforeFunctionParenthesis: boolean;
	placeOpenBraceOnNewLineForFunctions: boolean;
	placeOpenBraceOnNewLineForControlBlocks: boolean;
}

namespace FormattingConfiguration {
	export function equals(a: FormattingConfiguration, b: FormattingConfiguration): boolean {
		let keys = Object.keys(a);
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			if ((a as any)[key] !== (b as any)[key]) {
				return false;
			}
		}
		return true;
	}

	export const def: FormattingConfiguration = {
		insertSpaceAfterCommaDelimiter: true,
		insertSpaceAfterConstructor: false,
		insertSpaceAfterSemicolonInForStatements: true,
		insertSpaceBeforeAndAfterBinaryOperators: true,
		insertSpaceAfterKeywordsInControlFlowStatements: true,
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
		insertSpaceBeforeFunctionParenthesis: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
		insertSpaceAfterTypeAssertion: false,
		placeOpenBraceOnNewLineForFunctions: false,
		placeOpenBraceOnNewLineForControlBlocks: false
	};
}

export default class FormattingConfigurationManager {
	private config: FormattingConfiguration = FormattingConfiguration.def;

	private formatOptions: { [key: string]: Proto.FormatCodeSettings | undefined; } = Object.create(null);

	public constructor(
		private client: ITypescriptServiceClient
	) {
		Workspace.onDidCloseTextDocument((textDocument) => {
			let key = textDocument.uri.toString();
			// When a document gets closed delete the cached formatting options.
			// This is necessary sine the tsserver now closed a project when its
			// last file in it closes which drops the stored formatting options
			// as well.
			delete this.formatOptions[key];
		});
	}

	public async ensureFormatOptionsForDocument(
		document: TextDocument,
		token: CancellationToken | undefined
	): Promise<void> {
		for (const editor of window.visibleTextEditors) {
			if (editor.document.fileName === document.fileName) {
				const formattingOptions = { tabSize: editor.options.tabSize, insertSpaces: editor.options.insertSpaces } as FormattingOptions;
				return this.ensureFormatOptions(document, formattingOptions, token);
			}
		}
	}

	public async ensureFormatOptions(
		document: TextDocument,
		options: FormattingOptions,
		token: CancellationToken | undefined
	): Promise<void> {
		const key = document.uri.toString();
		const currentOptions = this.formatOptions[key];
		if (currentOptions && currentOptions.tabSize === options.tabSize && currentOptions.indentSize === options.tabSize && currentOptions.convertTabsToSpaces === options.insertSpaces) {
			return;
		}
		const absPath = this.client.normalizePath(document.uri);
		if (!absPath) {
			return Object.create(null);
		}
		const formatOptions = this.getFormatOptions(options);
		const args: Proto.ConfigureRequestArguments = {
			file: absPath,
			formatOptions: formatOptions
		};
		await this.client.execute('configure', args, token);
		this.formatOptions[key] = formatOptions;
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		const newConfig = config.get('format', FormattingConfiguration.def);

		if (!FormattingConfiguration.equals(this.config, newConfig)) {
			this.formatOptions = Object.create(null);
		}
		this.config = newConfig;
	}

	private getFormatOptions(options: FormattingOptions): Proto.FormatCodeSettings {
		return {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convertTabsToSpaces: options.insertSpaces,
			// We can use \n here since the editor normalizes later on to its line endings.
			newLineCharacter: '\n',
			insertSpaceAfterCommaDelimiter: this.config.insertSpaceAfterCommaDelimiter,
			insertSpaceAfterConstructor: this.config.insertSpaceAfterConstructor,
			insertSpaceAfterSemicolonInForStatements: this.config.insertSpaceAfterSemicolonInForStatements,
			insertSpaceBeforeAndAfterBinaryOperators: this.config.insertSpaceBeforeAndAfterBinaryOperators,
			insertSpaceAfterKeywordsInControlFlowStatements: this.config.insertSpaceAfterKeywordsInControlFlowStatements,
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: this.config.insertSpaceAfterFunctionKeywordForAnonymousFunctions,
			insertSpaceBeforeFunctionParenthesis: this.config.insertSpaceBeforeFunctionParenthesis,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces,
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces,
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces,
			insertSpaceAfterTypeAssertion: this.config.insertSpaceAfterTypeAssertion,
			placeOpenBraceOnNewLineForFunctions: this.config.placeOpenBraceOnNewLineForFunctions,
			placeOpenBraceOnNewLineForControlBlocks: this.config.placeOpenBraceOnNewLineForControlBlocks,
		};
	}
}
