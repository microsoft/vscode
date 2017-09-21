/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, FormattingOptions, TextDocument, CancellationToken, WorkspaceConfiguration } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface Configuration {
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
namespace Configuration {
	export const insertSpaceAfterCommaDelimiter = 'insertSpaceAfterCommaDelimiter';
	export const insertSpaceAfterConstructor = 'insertSpaceAfterConstructor';
	export const insertSpaceAfterSemicolonInForStatements = 'insertSpaceAfterSemicolonInForStatements';
	export const insertSpaceBeforeAndAfterBinaryOperators = 'insertSpaceBeforeAndAfterBinaryOperators';
	export const insertSpaceAfterKeywordsInControlFlowStatements = 'insertSpaceAfterKeywordsInControlFlowStatements';
	export const insertSpaceAfterFunctionKeywordForAnonymousFunctions = 'insertSpaceAfterFunctionKeywordForAnonymousFunctions';
	export const insertSpaceBeforeFunctionParenthesis = 'insertSpaceBeforeFunctionParenthesis';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces';
	export const insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces = 'insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces';
	export const insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces = 'insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces';
	export const insertSpaceAfterTypeAssertion = 'insertSpaceAfterTypeAssertion';
	export const placeOpenBraceOnNewLineForFunctions = 'placeOpenBraceOnNewLineForFunctions';
	export const placeOpenBraceOnNewLineForControlBlocks = 'placeOpenBraceOnNewLineForControlBlocks';

	export function equals(a: Configuration, b: Configuration): boolean {
		let keys = Object.keys(a);
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			if ((a as any)[key] !== (b as any)[key]) {
				return false;
			}
		}
		return true;
	}

	export function def(): Configuration {
		let result: Configuration = Object.create(null);
		result.insertSpaceAfterCommaDelimiter = true;
		result.insertSpaceAfterConstructor = false;
		result.insertSpaceAfterSemicolonInForStatements = true;
		result.insertSpaceBeforeAndAfterBinaryOperators = true;
		result.insertSpaceAfterKeywordsInControlFlowStatements = true;
		result.insertSpaceAfterFunctionKeywordForAnonymousFunctions = false;
		result.insertSpaceBeforeFunctionParenthesis = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces = true;
		result.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces = false;
		result.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces = false;
		result.insertSpaceAfterTypeAssertion = false;
		result.placeOpenBraceOnNewLineForFunctions = false;
		result.placeOpenBraceOnNewLineForControlBlocks = false;
		return result;
	}
}

export default class FormattingOptionsManager {
	private config: Configuration;

	private formatOptions: { [key: string]: Proto.FormatCodeSettings | undefined; } = Object.create(null);

	public constructor(
		private client: ITypescriptServiceClient
	) {
		this.config = Configuration.def();
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
		const formatOptions = this.getFormatOptions(options);
		const args: Proto.ConfigureRequestArguments = {
			file: absPath,
			formatOptions: formatOptions
		};
		await this.client.execute('configure', args, token);
		this.formatOptions[key] = formatOptions;
		return formatOptions;
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		let newConfig = config.get('format', Configuration.def());

		if (!Configuration.equals(this.config, newConfig)) {
			this.config = newConfig;
			this.formatOptions = Object.create(null);
		}
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
