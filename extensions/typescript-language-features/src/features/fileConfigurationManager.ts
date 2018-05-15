/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace as Workspace, FormattingOptions, TextDocument, CancellationToken, window, Disposable, workspace, WorkspaceConfiguration } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as languageIds from '../utils/languageModeIds';

function objsAreEqual<T>(a: T, b: T): boolean {
	let keys = Object.keys(a);
	for (let i = 0; i < keys.length; i++) {
		let key = keys[i];
		if ((a as any)[key] !== (b as any)[key]) {
			return false;
		}
	}
	return true;
}

interface FileConfiguration {
	formatOptions: Proto.FormatCodeSettings;
	preferences: Proto.UserPreferences;
}

function areFileConfigurationsEqual(a: FileConfiguration, b: FileConfiguration): boolean {
	return (
		objsAreEqual(a.formatOptions, b.formatOptions)
		&& objsAreEqual(a.preferences, b.preferences)
	);
}

export default class FileConfigurationManager {
	private onDidCloseTextDocumentSub: Disposable | undefined;
	private formatOptions: { [key: string]: FileConfiguration | undefined } = Object.create(null);

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

	public async ensureConfigurationForDocument(
		document: TextDocument,
		token: CancellationToken | undefined
	): Promise<void> {
		const editor = window.visibleTextEditors.find(editor => editor.document.fileName === document.fileName);
		if (editor) {
			const formattingOptions = {
				tabSize: editor.options.tabSize,
				insertSpaces: editor.options.insertSpaces
			} as FormattingOptions;
			return this.ensureConfigurationOptions(document, formattingOptions, token);
		}
	}

	public async ensureConfigurationOptions(
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
		const currentOptions = this.getFileOptions(document, options);

		if (cachedOptions && areFileConfigurationsEqual(cachedOptions, currentOptions)) {
			return;
		}

		const args: Proto.ConfigureRequestArguments = {
			file,
			...currentOptions
		};
		await this.client.execute('configure', args, token);
		this.formatOptions[key] = currentOptions;
	}

	public reset() {
		this.formatOptions = Object.create(null);
	}


	private getFileOptions(
		document: TextDocument,
		options: FormattingOptions
	): FileConfiguration {
		return {
			formatOptions: this.getFormatOptions(document, options),
			preferences: this.getPreferences(document)
		};
	}

	private getFormatOptions(
		document: TextDocument,
		options: FormattingOptions
	): Proto.FormatCodeSettings {
		const config = workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript.format' : 'javascript.format',
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

	private getPreferences(document: TextDocument): Proto.UserPreferences {
		if (!this.client.apiVersion.has290Features()) {
			return {};
		}

		const config = workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript' : 'javascript',
			document.uri);

		const preferences = workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript.preferences' : 'javascript.preferences',
			document.uri);

		return {
			quotePreference: getQuoteStylePreference(preferences),
			importModuleSpecifierPreference: getImportModuleSpecifierPreference(preferences),
			disableSuggestions: disableSuggestionsPreference(config),
		};
	}
}

function disableSuggestionsPreference(config: WorkspaceConfiguration) {
	return !config.get<boolean>('suggestionActions.enabled');
}

function getQuoteStylePreference(config: WorkspaceConfiguration) {
	switch (config.get<string>('quoteStyle')) {
		case 'single': return 'single';
		case 'double': return 'double';
		default: return undefined;
	}
}

function getImportModuleSpecifierPreference(config: WorkspaceConfiguration) {
	switch (config.get<string>('importModuleSpecifier')) {
		case 'relative': return 'relative';
		case 'non-relative': return 'non-relative';
		default: return undefined;
	}
}

function isTypeScriptDocument(document: TextDocument) {
	return document.languageId === languageIds.typescript || document.languageId === languageIds.typescriptreact;
}
