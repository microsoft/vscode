/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as fileSchemes from '../configuration/fileSchemes';
import { isTypeScriptDocument } from '../configuration/languageIds';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import { equals } from '../utils/objects';
import { ResourceMap } from '../utils/resourceMap';

interface FileConfiguration {
	readonly formatOptions: Proto.FormatCodeSettings;
	readonly preferences: Proto.UserPreferences;
}

interface FormattingOptions {

	readonly tabSize: number | undefined;

	readonly insertSpaces: boolean | undefined;
}

function areFileConfigurationsEqual(a: FileConfiguration, b: FileConfiguration): boolean {
	return equals(a, b);
}

export default class FileConfigurationManager extends Disposable {
	private readonly formatOptions: ResourceMap<Promise<FileConfiguration | undefined>>;

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		onCaseInsensitiveFileSystem: boolean
	) {
		super();
		this.formatOptions = new ResourceMap(undefined, { onCaseInsensitiveFileSystem });
		vscode.workspace.onDidCloseTextDocument(textDocument => {
			// When a document gets closed delete the cached formatting options.
			// This is necessary since the tsserver now closed a project when its
			// last file in it closes which drops the stored formatting options
			// as well.
			this.formatOptions.delete(textDocument.uri);
		}, undefined, this._disposables);
	}

	public async ensureConfigurationForDocument(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Promise<void> {
		const formattingOptions = this.getFormattingOptions(document);
		if (formattingOptions) {
			return this.ensureConfigurationOptions(document, formattingOptions, token);
		}
	}

	private getFormattingOptions(document: vscode.TextDocument): FormattingOptions | undefined {
		const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri.toString());
		if (!editor) {
			return undefined;
		}

		return {
			tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : undefined,
			insertSpaces: typeof editor.options.insertSpaces === 'boolean' ? editor.options.insertSpaces : undefined,
		};
	}

	public async ensureConfigurationOptions(
		document: vscode.TextDocument,
		options: FormattingOptions,
		token: vscode.CancellationToken
	): Promise<void> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		const currentOptions = this.getFileOptions(document, options);
		const cachedOptions = this.formatOptions.get(document.uri);
		if (cachedOptions) {
			const cachedOptionsValue = await cachedOptions;
			if (token.isCancellationRequested) {
				return;
			}

			if (cachedOptionsValue && areFileConfigurationsEqual(cachedOptionsValue, currentOptions)) {
				return;
			}
		}

		const task = (async () => {
			try {
				const response = await this.client.execute('configure', { file, ...currentOptions }, token);
				return response.type === 'response' ? currentOptions : undefined;
			} catch {
				return undefined;
			}
		})();

		this.formatOptions.set(document.uri, task);

		await task;
	}

	public async setGlobalConfigurationFromDocument(
		document: vscode.TextDocument,
		token: vscode.CancellationToken,
	): Promise<void> {
		const formattingOptions = this.getFormattingOptions(document);
		if (!formattingOptions) {
			return;
		}

		const args: Proto.ConfigureRequestArguments = {
			file: undefined /*global*/,
			...this.getFileOptions(document, formattingOptions),
		};
		await this.client.execute('configure', args, token);
	}

	public reset() {
		this.formatOptions.clear();
	}

	private getFileOptions(
		document: vscode.TextDocument,
		options: FormattingOptions
	): FileConfiguration {
		return {
			formatOptions: this.getFormatOptions(document, options),
			preferences: this.getPreferences(document)
		};
	}

	private getFormatOptions(
		document: vscode.TextDocument,
		options: FormattingOptions
	): Proto.FormatCodeSettings {
		const config = vscode.workspace.getConfiguration(
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
			insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingEmptyBraces'),
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces'),
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: config.get<boolean>('insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces'),
			insertSpaceAfterTypeAssertion: config.get<boolean>('insertSpaceAfterTypeAssertion'),
			placeOpenBraceOnNewLineForFunctions: config.get<boolean>('placeOpenBraceOnNewLineForFunctions'),
			placeOpenBraceOnNewLineForControlBlocks: config.get<boolean>('placeOpenBraceOnNewLineForControlBlocks'),
			semicolons: config.get<Proto.SemicolonPreference>('semicolons'),
			indentSwitchCase: config.get<boolean>('indentSwitchCase'),
		};
	}

	private getPreferences(document: vscode.TextDocument): Proto.UserPreferences {
		const config = vscode.workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript' : 'javascript',
			document);

		const preferencesConfig = vscode.workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript.preferences' : 'javascript.preferences',
			document);

		const preferences: Proto.UserPreferences = {
			...config.get('unstable'),
			quotePreference: this.getQuoteStylePreference(preferencesConfig),
			importModuleSpecifierPreference: getImportModuleSpecifierPreference(preferencesConfig),
			importModuleSpecifierEnding: getImportModuleSpecifierEndingPreference(preferencesConfig),
			jsxAttributeCompletionStyle: getJsxAttributeCompletionStyle(preferencesConfig),
			allowTextChangesInNewFiles: document.uri.scheme === fileSchemes.file,
			providePrefixAndSuffixTextForRename: preferencesConfig.get<boolean>('renameShorthandProperties', true) === false ? false : preferencesConfig.get<boolean>('useAliasesForRenames', true),
			allowRenameOfImportPath: true,
			includeAutomaticOptionalChainCompletions: config.get<boolean>('suggest.includeAutomaticOptionalChainCompletions', true),
			provideRefactorNotApplicableReason: true,
			generateReturnInDocTemplate: config.get<boolean>('suggest.jsdoc.generateReturns', true),
			includeCompletionsForImportStatements: config.get<boolean>('suggest.includeCompletionsForImportStatements', true),
			includeCompletionsWithSnippetText: true,
			includeCompletionsWithClassMemberSnippets: config.get<boolean>('suggest.classMemberSnippets.enabled', true),
			includeCompletionsWithObjectLiteralMethodSnippets: config.get<boolean>('suggest.objectLiteralMethodSnippets.enabled', true),
			autoImportFileExcludePatterns: this.getAutoImportFileExcludePatternsPreference(preferencesConfig, vscode.workspace.getWorkspaceFolder(document.uri)?.uri),
			autoImportSpecifierExcludeRegexes: preferencesConfig.get<string[]>('autoImportSpecifierExcludeRegexes'),
			preferTypeOnlyAutoImports: preferencesConfig.get<boolean>('preferTypeOnlyAutoImports', false),
			useLabelDetailsInCompletionEntries: true,
			allowIncompleteCompletions: true,
			displayPartsForJSDoc: true,
			disableLineTextInReferences: true,
			interactiveInlayHints: true,
			includeCompletionsForModuleExports: config.get<boolean>('suggest.autoImports'),
			...getInlayHintsPreferences(config),
			...this.getOrganizeImportsPreferences(preferencesConfig),
		};

		return preferences;
	}

	private getQuoteStylePreference(config: vscode.WorkspaceConfiguration) {
		switch (config.get<string>('quoteStyle')) {
			case 'single': return 'single';
			case 'double': return 'double';
			default: return 'auto';
		}
	}

	private getAutoImportFileExcludePatternsPreference(config: vscode.WorkspaceConfiguration, workspaceFolder: vscode.Uri | undefined): string[] | undefined {
		return workspaceFolder && config.get<string[]>('autoImportFileExcludePatterns')?.map(p => {
			// Normalization rules: https://github.com/microsoft/TypeScript/pull/49578
			const isRelative = /^\.\.?($|[\/\\])/.test(p);
			// In TypeScript < 5.3, the first path component cannot be a wildcard, so we need to prefix
			// it with a path root (e.g. `/` or `c:\`)
			const wildcardPrefix = this.client.apiVersion.gte(API.v540)
				? ''
				: path.parse(this.client.toTsFilePath(workspaceFolder)!).root;
			return path.isAbsolute(p) ? p :
				p.startsWith('*') ? wildcardPrefix + p :
					isRelative ? this.client.toTsFilePath(vscode.Uri.joinPath(workspaceFolder, p))! :
						wildcardPrefix + '**' + path.sep + p;
		});
	}

	private getOrganizeImportsPreferences(config: vscode.WorkspaceConfiguration): Proto.UserPreferences {
		return {
			// More specific settings
			organizeImportsAccentCollation: config.get<boolean>('organizeImports.accentCollation'),
			organizeImportsCaseFirst: withDefaultAsUndefined(config.get<'default' | 'upper' | 'lower'>('organizeImports.caseFirst', 'default'), 'default'),
			organizeImportsCollation: config.get<'ordinal' | 'unicode'>('organizeImports.collation'),
			organizeImportsIgnoreCase: withDefaultAsUndefined(config.get<'auto' | 'caseInsensitive' | 'caseSensitive'>('organizeImports.caseSensitivity'), 'auto'),
			organizeImportsLocale: config.get<string>('organizeImports.locale'),
			organizeImportsNumericCollation: config.get<boolean>('organizeImports.numericCollation'),
			organizeImportsTypeOrder: withDefaultAsUndefined(config.get<'auto' | 'last' | 'inline' | 'first'>('organizeImports.typeOrder', 'auto'), 'auto'),
		};
	}
}

function withDefaultAsUndefined<T, O extends T>(value: T, def: O): Exclude<T, O> | undefined {
	return value === def ? undefined : value as Exclude<T, O>;
}

export class InlayHintSettingNames {
	static readonly parameterNamesSuppressWhenArgumentMatchesName = 'inlayHints.parameterNames.suppressWhenArgumentMatchesName';
	static readonly parameterNamesEnabled = 'inlayHints.parameterTypes.enabled';
	static readonly variableTypesEnabled = 'inlayHints.variableTypes.enabled';
	static readonly variableTypesSuppressWhenTypeMatchesName = 'inlayHints.variableTypes.suppressWhenTypeMatchesName';
	static readonly propertyDeclarationTypesEnabled = 'inlayHints.propertyDeclarationTypes.enabled';
	static readonly functionLikeReturnTypesEnabled = 'inlayHints.functionLikeReturnTypes.enabled';
	static readonly enumMemberValuesEnabled = 'inlayHints.enumMemberValues.enabled';
}

export function getInlayHintsPreferences(config: vscode.WorkspaceConfiguration) {
	return {
		includeInlayParameterNameHints: getInlayParameterNameHintsPreference(config),
		includeInlayParameterNameHintsWhenArgumentMatchesName: !config.get<boolean>(InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName, true),
		includeInlayFunctionParameterTypeHints: config.get<boolean>(InlayHintSettingNames.parameterNamesEnabled, false),
		includeInlayVariableTypeHints: config.get<boolean>(InlayHintSettingNames.variableTypesEnabled, false),
		includeInlayVariableTypeHintsWhenTypeMatchesName: !config.get<boolean>(InlayHintSettingNames.variableTypesSuppressWhenTypeMatchesName, true),
		includeInlayPropertyDeclarationTypeHints: config.get<boolean>(InlayHintSettingNames.propertyDeclarationTypesEnabled, false),
		includeInlayFunctionLikeReturnTypeHints: config.get<boolean>(InlayHintSettingNames.functionLikeReturnTypesEnabled, false),
		includeInlayEnumMemberValueHints: config.get<boolean>(InlayHintSettingNames.enumMemberValuesEnabled, false),
	} as const;
}

function getInlayParameterNameHintsPreference(config: vscode.WorkspaceConfiguration) {
	switch (config.get<string>('inlayHints.parameterNames.enabled')) {
		case 'none': return 'none';
		case 'literals': return 'literals';
		case 'all': return 'all';
		default: return undefined;
	}
}

function getImportModuleSpecifierPreference(config: vscode.WorkspaceConfiguration) {
	switch (config.get<string>('importModuleSpecifier')) {
		case 'project-relative': return 'project-relative';
		case 'relative': return 'relative';
		case 'non-relative': return 'non-relative';
		default: return undefined;
	}
}

function getImportModuleSpecifierEndingPreference(config: vscode.WorkspaceConfiguration) {
	switch (config.get<string>('importModuleSpecifierEnding')) {
		case 'minimal': return 'minimal';
		case 'index': return 'index';
		case 'js': return 'js';
		default: return 'auto';
	}
}

function getJsxAttributeCompletionStyle(config: vscode.WorkspaceConfiguration) {
	switch (config.get<string>('jsxAttributeCompletionStyle')) {
		case 'braces': return 'braces';
		case 'none': return 'none';
		default: return 'auto';
	}
}
