/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace as Workspace, DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider, FormattingOptions, TextDocument, Position, Range, CancellationToken, TextEdit, WorkspaceConfiguration } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';

interface Configuration {
	enable: boolean;
	insertSpaceAfterCommaDelimiter: boolean;
	insertSpaceAfterSemicolonInForStatements: boolean;
	insertSpaceBeforeAndAfterBinaryOperators: boolean;
	insertSpaceAfterKeywordsInControlFlowStatements: boolean;
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: boolean;
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: boolean;
	placeOpenBraceOnNewLineForFunctions: boolean;
	placeOpenBraceOnNewLineForControlBlocks: boolean;

	[key: string]: boolean;
}

namespace Configuration {
	export const insertSpaceAfterCommaDelimiter: string = 'insertSpaceAfterCommaDelimiter';
	export const insertSpaceAfterSemicolonInForStatements: string = 'insertSpaceAfterSemicolonInForStatements';
	export const insertSpaceBeforeAndAfterBinaryOperators: string = 'insertSpaceBeforeAndAfterBinaryOperators';
	export const insertSpaceAfterKeywordsInControlFlowStatements: string = 'insertSpaceAfterKeywordsInControlFlowStatements';
	export const insertSpaceAfterFunctionKeywordForAnonymousFunctions: string = 'insertSpaceAfterFunctionKeywordForAnonymousFunctions';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: string = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis';
	export const insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: string = 'insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets';
	export const insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: string = 'insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces';
	export const insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: string = 'insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces';
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
		result.enable = true;
		result.insertSpaceAfterCommaDelimiter = true;
		result.insertSpaceAfterSemicolonInForStatements = true;
		result.insertSpaceBeforeAndAfterBinaryOperators = true;
		result.insertSpaceAfterKeywordsInControlFlowStatements = true;
		result.insertSpaceAfterFunctionKeywordForAnonymousFunctions = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis = false;
		result.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = false;
		result.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces = false;
		result.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces = false;
		result.placeOpenBraceOnNewLineForFunctions = false;
		result.placeOpenBraceOnNewLineForControlBlocks = false;
		return result;
	}
}

export default class TypeScriptFormattingProvider implements DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider {
	private config: Configuration;
	private formatOptions: { [key: string]: Proto.FormatCodeSettings | undefined; };

	public constructor(
		private client: ITypescriptServiceClient
	) {
		this.config = Configuration.def();
		this.formatOptions = Object.create(null);
		Workspace.onDidCloseTextDocument((textDocument) => {
			let key = textDocument.uri.toString();
			// When a document gets closed delete the cached formatting options.
			// This is necessary sine the tsserver now closed a project when its
			// last file in it closes which drops the stored formatting options
			// as well.
			delete this.formatOptions[key];
		});
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		let newConfig = config.get('format', Configuration.def());

		if (!Configuration.equals(this.config, newConfig)) {
			this.config = newConfig;
			this.formatOptions = Object.create(null);
		}
	}

	public isEnabled(): boolean {
		return this.config.enable;
	}

	private ensureFormatOptions(document: TextDocument, options: FormattingOptions, token: CancellationToken): Promise<Proto.FormatCodeSettings> {
		const key = document.uri.toString();
		const currentOptions = this.formatOptions[key];
		if (currentOptions && currentOptions.tabSize === options.tabSize && currentOptions.indentSize === options.tabSize && currentOptions.convertTabsToSpaces === options.insertSpaces) {
			return Promise.resolve(currentOptions);
		} else {
			const absPath = this.client.normalizePath(document.uri);
			if (!absPath) {
				return Promise.resolve(Object.create(null));
			}
			const args: Proto.ConfigureRequestArguments = {
				file: absPath,
				formatOptions: this.getFormatOptions(options)
			};
			return this.client.execute('configure', args, token).then(_ => {
				this.formatOptions[key] = args.formatOptions;
				return args.formatOptions;
			});
		}
	}

	private doFormat(document: TextDocument, options: FormattingOptions, args: Proto.FormatRequestArgs, token: CancellationToken): Promise<TextEdit[]> {
		return this.ensureFormatOptions(document, options, token).then(() => {
			return this.client.execute('format', args, token).then((response): TextEdit[] => {
				if (response.body) {
					return response.body.map(this.codeEdit2SingleEditOperation);
				} else {
					return [];
				}
			}, (err: any) => {
				this.client.error(`'format' request failed with error.`, err);
				return [];
			});
		});
	}

	public provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {
		const absPath = this.client.normalizePath(document.uri);
		if (!absPath) {
			return Promise.resolve([]);
		}
		const args: Proto.FormatRequestArgs = {
			file: absPath,
			line: range.start.line + 1,
			offset: range.start.character + 1,
			endLine: range.end.line + 1,
			endOffset: range.end.character + 1
		};
		return this.doFormat(document, options, args, token);
	}

	public provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return Promise.resolve([]);
		}
		let args: Proto.FormatOnKeyRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1,
			key: ch
		};

		return this.ensureFormatOptions(document, options, token).then(() => {
			return this.client.execute('formatonkey', args, token).then((response): TextEdit[] => {
				let edits = response.body;
				let result: TextEdit[] = [];
				if (!edits) {
					return result;
				}
				for (let edit of edits) {
					let textEdit = this.codeEdit2SingleEditOperation(edit);
					let range = textEdit.range;
					// Work around for https://github.com/Microsoft/TypeScript/issues/6700.
					// Check if we have an edit at the beginning of the line which only removes white spaces and leaves
					// an empty line. Drop those edits
					if (range.start.character === 0 && range.start.line === range.end.line && textEdit.newText === '') {
						let lText = document.lineAt(range.start.line).text;
						// If the edit leaves something on the line keep the edit (note that the end character is exclusive).
						// Keep it also if it removes something else than whitespace
						if (lText.trim().length > 0 || lText.length > range.end.character) {
							result.push(textEdit);
						}
					} else {
						result.push(textEdit);
					}
				}
				return result;
			}, (err: any) => {
				this.client.error(`'formatonkey' request failed with error.`, err);
				return [];
			});
		});
	}

	private codeEdit2SingleEditOperation(edit: Proto.CodeEdit): TextEdit {
		return new TextEdit(new Range(edit.start.line - 1, edit.start.offset - 1, edit.end.line - 1, edit.end.offset - 1),
			edit.newText);
	}

	private getFormatOptions(options: FormattingOptions): Proto.FormatCodeSettings {
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
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces,
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: this.config.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces,
			placeOpenBraceOnNewLineForFunctions: this.config.placeOpenBraceOnNewLineForFunctions,
			placeOpenBraceOnNewLineForControlBlocks: this.config.placeOpenBraceOnNewLineForControlBlocks
		};
	}
}