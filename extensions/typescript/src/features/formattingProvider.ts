/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider, FormattingOptions, TextDocument, Position, Range, CancellationToken, TextEdit, WorkspaceConfiguration } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface Configuration {
	insertSpaceAfterCommaDelimiter: boolean;
	insertSpaceAfterSemicolonInForStatements: boolean;
	insertSpaceBeforeAndAfterBinaryOperators: boolean;
	insertSpaceAfterKeywordsInControlFlowStatements: boolean;
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
	placeOpenBraceOnNewLineForFunctions: boolean;
	placeOpenBraceOnNewLineForControlBlocks: boolean;
}

namespace Configuration {
	export const insertSpaceAfterCommaDelimiter: string = 'insertSpaceAfterCommaDelimiter';
	export const insertSpaceAfterSemicolonInForStatements: string = 'insertSpaceAfterSemicolonInForStatements';
	export const insertSpaceBeforeAndAfterBinaryOperators: string = 'insertSpaceBeforeAndAfterBinaryOperators';
	export const insertSpaceAfterKeywordsInControlFlowStatements: string = 'insertSpaceAfterKeywordsInControlFlowStatements';
	export const insertSpaceAfterFunctionKeywordForAnonymousFunctions: string = 'insertSpaceAfterFunctionKeywordForAnonymousFunctions';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: string = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: string = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets';
	export const placeOpenBraceOnNewLineForFunctions: string = 'placeOpenBraceOnNewLineForFunctions';
	export const placeOpenBraceOnNewLineForControlBlocks: string = 'placeOpenBraceOnNewLineForControlBlocks';

	export function equals(a: Configuration, b: Configuration): boolean {
		let keys = Object.keys(a);
		for (let i = 0; i < keys.length; i++) {
			let key = keys[i];
			if (a[key] !== b[key]) {
				return false;
			}
		}
		return true;
	}

	export function def(): Configuration {
		let result: Configuration = Object.create(null);
		result.insertSpaceAfterCommaDelimiter = true;
		result.insertSpaceAfterSemicolonInForStatements = true;
		result.insertSpaceBeforeAndAfterBinaryOperators = true;
		result.insertSpaceAfterKeywordsInControlFlowStatements = true;
		result.insertSpaceAfterFunctionKeywordForAnonymousFunctions = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = false;
		result.placeOpenBraceOnNewLineForFunctions = false;
		result.placeOpenBraceOnNewLineForControlBlocks = false;
		return result;
	}
}

export default class TypeScriptFormattingProvider implements DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider {

	private client: ITypescriptServiceClient;
	private config: Configuration;
	private formatOptions: { [key: string]: Proto.FormatOptions; };

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
		this.config = Configuration.def();
		this.formatOptions = Object.create(null);
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		let newConfig = config.get('format', Configuration.def());

		if (!Configuration.equals(this.config, newConfig)) {
			this.config = newConfig;
			this.formatOptions = Object.create(null);
		}
	}

	private ensureFormatOptions(document: TextDocument, options: FormattingOptions, token: CancellationToken): Promise<Proto.FormatOptions> {
		let key = document.uri.toString();
		let currentOptions = this.formatOptions[key];
		if (currentOptions && currentOptions.tabSize === options.tabSize && currentOptions.indentSize === options.tabSize && currentOptions.convertTabsToSpaces === options.insertSpaces) {
			return Promise.resolve(currentOptions);
		} else {
			let args: Proto.ConfigureRequestArguments = {
				file: this.client.asAbsolutePath(document.uri),
				formatOptions: this.getFormatOptions(options)
			};
			return this.client.execute('configure', args, token).then((response) => {
				this.formatOptions[key] = args.formatOptions;
				return args.formatOptions;
			});
		}
	}

	private doFormat(document: TextDocument, options: FormattingOptions, args: Proto.FormatRequestArgs, token: CancellationToken): Promise<TextEdit[]> {
		return this.ensureFormatOptions(document, options, token).then(() => {
			return this.client.execute('format', args, token).then((response): TextEdit[] => {
				return response.body.map(this.codeEdit2SingleEditOperation);
			}, (err: any) => {
				return [];
			});
		});
	}

	public provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {
		let args: Proto.FormatRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: range.start.line + 1,
			offset: range.start.character + 1,
			endLine: range.end.line + 1,
			endOffset: range.end.character + 1
		};
		return this.doFormat(document, options, args, token);
	}

	public provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {
		let args: Proto.FormatOnKeyRequestArgs = {
			file: this.client.asAbsolutePath(document.uri),
			line: position.line + 1,
			offset: position.character + 1,
			key: ch
		};

		return this.ensureFormatOptions(document, options, token).then(() => {
			return this.client.execute('formatonkey', args, token).then((response): TextEdit[] => {
				return response.body.map(this.codeEdit2SingleEditOperation);
			}, (err: any) => {
				return [];
			});
		});
	}

	private codeEdit2SingleEditOperation(edit: Proto.CodeEdit): TextEdit {
		return new TextEdit(new Range(edit.start.line - 1, edit.start.offset - 1, edit.end.line - 1, edit.end.offset - 1),
			edit.newText);
	}

	private getFormatOptions(options: FormattingOptions): Proto.FormatOptions {
		return {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convertTabsToSpaces: options.insertSpaces,
			// We can use \n here since the editor normalizes later on to its line endings.
			newLineCharacter: '\n',
			insertSpaceAfterCommaDelimiter: this.config.insertSpaceAfterCommaDelimiter,
			insertSpaceAfterSemicolonInForStatements: this.config.insertSpaceAfterSemicolonInForStatements,
			insertSpaceBeforeAndAfterBinaryOperators: this.config.insertSpaceBeforeAndAfterBinaryOperators,
			insertSpaceAfterKeywordsInControlFlowStatements: this.config.insertSpaceAfterKeywordsInControlFlowStatements,
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: this.config.insertSpaceAfterFunctionKeywordForAnonymousFunctions,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis,
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: this.config.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets,
			placeOpenBraceOnNewLineForFunctions: this.config.placeOpenBraceOnNewLineForFunctions,
			placeOpenBraceOnNewLineForControlBlocks: this.config.placeOpenBraceOnNewLineForControlBlocks
		};
	}
}