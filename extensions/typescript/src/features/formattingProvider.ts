/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider, FormattingOptions, TextDocument, Position, Range, CancellationToken, TextEdit, WorkspaceConfiguration, Disposable, languages, workspace } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange } from '../utils/convert';

interface Configuration {
	enable: boolean;
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
		result.enable = true;
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

export class FormattingOptionsManager {
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

export class TypeScriptFormattingProvider implements DocumentRangeFormattingEditProvider, OnTypeFormattingEditProvider {
	private config: Configuration;
	private formattingOptionsManager: FormattingOptionsManager;

	public constructor(
		private client: ITypescriptServiceClient
	) {
		this.config = Configuration.def();
		this.formattingOptionsManager = new FormattingOptionsManager(client);
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		this.config = config.get('format', Configuration.def());
		this.formattingOptionsManager.updateConfiguration(config);
	}

	public isEnabled(): boolean {
		return this.config.enable;
	}

	private async doFormat(
		document: TextDocument,
		options: FormattingOptions,
		args: Proto.FormatRequestArgs,
		token: CancellationToken
	): Promise<TextEdit[]> {
		await this.formattingOptionsManager.ensureFormatOptions(document, options, token);
		try {
			const response = await this.client.execute('format', args, token);
			if (response.body) {
				return response.body.map(this.codeEdit2SingleEditOperation);
			}
		} catch {
			// noop
		}
		return [];
	}

	public async provideDocumentRangeFormattingEdits(
		document: TextDocument,
		range: Range,
		options: FormattingOptions,
		token: CancellationToken
	): Promise<TextEdit[]> {
		const absPath = this.client.normalizePath(document.uri);
		if (!absPath) {
			return [];
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

	public async provideOnTypeFormattingEdits(
		document: TextDocument,
		position: Position,
		ch: string,
		options: FormattingOptions,
		token: CancellationToken
	): Promise<TextEdit[]> {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return [];
		}
		let args: Proto.FormatOnKeyRequestArgs = {
			file: filepath,
			line: position.line + 1,
			offset: position.character + 1,
			key: ch
		};

		await this.formattingOptionsManager.ensureFormatOptions(document, options, token);
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
		}, () => {
			return [];
		});
	}

	private codeEdit2SingleEditOperation(edit: Proto.CodeEdit): TextEdit {
		return new TextEdit(tsTextSpanToVsRange(edit), edit.newText);
	}
}

export class FormattingProviderManager {
	private formattingProviderRegistration: Disposable | undefined;

	constructor(
		private readonly modeId: string,
		private readonly formattingProvider: TypeScriptFormattingProvider,
		private readonly selector: string[]
	) { }

	public dispose() {
		if (this.formattingProviderRegistration) {
			this.formattingProviderRegistration.dispose();
			this.formattingProviderRegistration = undefined;
		}
	}

	public updateConfiguration(): void {
		const config = workspace.getConfiguration(this.modeId);
		this.formattingProvider.updateConfiguration(config);

		if (!this.formattingProvider.isEnabled() && this.formattingProviderRegistration) {
			this.formattingProviderRegistration.dispose();
			this.formattingProviderRegistration = undefined;
		} else if (this.formattingProvider.isEnabled() && !this.formattingProviderRegistration) {
			this.formattingProviderRegistration = languages.registerDocumentRangeFormattingEditProvider(this.selector, this.formattingProvider);
		}
	}
}