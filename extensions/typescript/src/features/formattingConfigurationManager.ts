/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, FormattingOptions, TextDocument, CancellationToken, WorkspaceConfiguration } from 'vscode';

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

export default class FormattingOptionsManager {
	private jsConfig: FormattingConfiguration = FormattingConfiguration.def;
	private tsConfig: FormattingConfiguration = FormattingConfiguration.def;

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

	public async ensureFormatOptions(
		document: TextDocument,
		options: FormattingOptions,
		token: CancellationToken
	): Promise<Proto.FormatCodeSettings> {
		const key = document.uri.toString();
		const currentOptions = this.formatOptions[key];
		if (currentOptions && currentOptions.tabSize === options.tabSize && currentOptions.indentSize === options.tabSize && currentOptions.convertTabsToSpaces === options.insertSpaces) {
			return currentOptions;
		}
		const absPath = this.client.normalizePath(document.uri);
		if (!absPath) {
			return Object.create(null);
		}
		const formatOptions = this.getFormatOptions(document, options);
		const args: Proto.ConfigureRequestArguments = {
			file: absPath,
			formatOptions: formatOptions
		};
		await this.client.execute('configure', args, token);
		this.formatOptions[key] = formatOptions;
		return formatOptions;
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		const newJsConfig = config.get('javascript.format', FormattingConfiguration.def);
		const newTsConfig = config.get('typeScript.format', FormattingConfiguration.def);

		if (!FormattingConfiguration.equals(this.jsConfig, newJsConfig) || !FormattingConfiguration.equals(this.tsConfig, newTsConfig)) {
			this.formatOptions = Object.create(null);
		}
		this.jsConfig = newJsConfig;
		this.tsConfig = newTsConfig;
	}

	private getFormatOptions(
		document: TextDocument,
		options: FormattingOptions
	): Proto.FormatCodeSettings {
		const config = document.languageId === 'typescript' || document.languageId === 'typescriptreact' ? this.tsConfig : this.jsConfig;
		return {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convertTabsToSpaces: options.insertSpaces,
			// We can use \n here since the editor normalizes later on to its line endings.
			newLineCharacter: '\n',
			insertSpaceAfterCommaDelimiter: config.insertSpaceAfterCommaDelimiter,
			insertSpaceAfterConstructor: config.insertSpaceAfterConstructor,
			insertSpaceAfterSemicolonInForStatements: config.insertSpaceAfterSemicolonInForStatements,
			insertSpaceBeforeAndAfterBinaryOperators: config.insertSpaceBeforeAndAfterBinaryOperators,
			insertSpaceAfterKeywordsInControlFlowStatements: config.insertSpaceAfterKeywordsInControlFlowStatements,
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: config.insertSpaceAfterFunctionKeywordForAnonymousFunctions,
			insertSpaceBeforeFunctionParenthesis: config.insertSpaceBeforeFunctionParenthesis,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: config.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces,
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: config.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces,
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: config.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces,
			insertSpaceAfterTypeAssertion: config.insertSpaceAfterTypeAssertion,
			placeOpenBraceOnNewLineForFunctions: config.placeOpenBraceOnNewLineForFunctions,
			placeOpenBraceOnNewLineForControlBlocks: config.placeOpenBraceOnNewLineForControlBlocks,
		};
	}
}
