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
import { readUnifiedConfig, UnifiedConfigurationScope } from '../utils/configuration';
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
		const fallbackSection = isTypeScriptDocument(document) ? 'typescript' : 'javascript';

		return {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convertTabsToSpaces: options.insertSpaces,
			// We can use \n here since the editor normalizes later on to its line endings.
			newLineCharacter: '\n',
			insertSpaceAfterCommaDelimiter: readUnifiedConfig<boolean>('format.insertSpaceAfterCommaDelimiter', true, { scope: document, fallbackSection }),
			insertSpaceAfterConstructor: readUnifiedConfig<boolean>('format.insertSpaceAfterConstructor', false, { scope: document, fallbackSection }),
			insertSpaceAfterSemicolonInForStatements: readUnifiedConfig<boolean>('format.insertSpaceAfterSemicolonInForStatements', true, { scope: document, fallbackSection }),
			insertSpaceBeforeAndAfterBinaryOperators: readUnifiedConfig<boolean>('format.insertSpaceBeforeAndAfterBinaryOperators', true, { scope: document, fallbackSection }),
			insertSpaceAfterKeywordsInControlFlowStatements: readUnifiedConfig<boolean>('format.insertSpaceAfterKeywordsInControlFlowStatements', true, { scope: document, fallbackSection }),
			insertSpaceAfterFunctionKeywordForAnonymousFunctions: readUnifiedConfig<boolean>('format.insertSpaceAfterFunctionKeywordForAnonymousFunctions', true, { scope: document, fallbackSection }),
			insertSpaceBeforeFunctionParenthesis: readUnifiedConfig<boolean>('format.insertSpaceBeforeFunctionParenthesis', false, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis', false, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets', false, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces', true, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces', true, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces', false, { scope: document, fallbackSection }),
			insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: readUnifiedConfig<boolean>('format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces', false, { scope: document, fallbackSection }),
			insertSpaceAfterTypeAssertion: readUnifiedConfig<boolean>('format.insertSpaceAfterTypeAssertion', false, { scope: document, fallbackSection }),
			placeOpenBraceOnNewLineForFunctions: readUnifiedConfig<boolean>('format.placeOpenBraceOnNewLineForFunctions', false, { scope: document, fallbackSection }),
			placeOpenBraceOnNewLineForControlBlocks: readUnifiedConfig<boolean>('format.placeOpenBraceOnNewLineForControlBlocks', false, { scope: document, fallbackSection }),
			semicolons: readUnifiedConfig<Proto.SemicolonPreference>('format.semicolons', 'ignore' as Proto.SemicolonPreference, { scope: document, fallbackSection }),
			indentSwitchCase: readUnifiedConfig<boolean>('format.indentSwitchCase', true, { scope: document, fallbackSection }),
		};
	}

	private getPreferences(document: vscode.TextDocument): Proto.UserPreferences {
		const config = vscode.workspace.getConfiguration(
			isTypeScriptDocument(document) ? 'typescript' : 'javascript',
			document);

		const fallbackSection = isTypeScriptDocument(document) ? 'typescript' : 'javascript';

		const preferences: Proto.UserPreferences = {
			...config.get('unstable'),
			quotePreference: getQuoteStylePreference(document, fallbackSection),
			importModuleSpecifierPreference: getImportModuleSpecifierPreference(document, fallbackSection),
			importModuleSpecifierEnding: getImportModuleSpecifierEndingPreference(document, fallbackSection),
			jsxAttributeCompletionStyle: getJsxAttributeCompletionStyle(document, fallbackSection),
			allowTextChangesInNewFiles: document.uri.scheme === fileSchemes.file,
			providePrefixAndSuffixTextForRename: readUnifiedConfig<boolean>('preferences.useAliasesForRenames', true, { scope: document, fallbackSection }),
			allowRenameOfImportPath: true,
			includeAutomaticOptionalChainCompletions: readUnifiedConfig<boolean>('suggest.includeAutomaticOptionalChainCompletions', true, { scope: document, fallbackSection }),
			provideRefactorNotApplicableReason: true,
			generateReturnInDocTemplate: readUnifiedConfig<boolean>('suggest.jsdoc.generateReturns', true, { scope: document, fallbackSection }),
			includeCompletionsForImportStatements: readUnifiedConfig<boolean>('suggest.includeCompletionsForImportStatements', true, { scope: document, fallbackSection }),
			includeCompletionsWithSnippetText: true,
			includeCompletionsWithClassMemberSnippets: readUnifiedConfig<boolean>('suggest.classMemberSnippets.enabled', true, { scope: document, fallbackSection }),
			includeCompletionsWithObjectLiteralMethodSnippets: readUnifiedConfig<boolean>('suggest.objectLiteralMethodSnippets.enabled', true, { scope: document, fallbackSection }),
			autoImportFileExcludePatterns: this.getAutoImportFileExcludePatternsPreference(document, fallbackSection, vscode.workspace.getWorkspaceFolder(document.uri)?.uri),
			autoImportSpecifierExcludeRegexes: readUnifiedConfig<string[] | undefined>('preferences.autoImportSpecifierExcludeRegexes', undefined, { scope: document, fallbackSection }),
			preferTypeOnlyAutoImports: readUnifiedConfig<boolean>('preferences.preferTypeOnlyAutoImports', false, { scope: document, fallbackSection }),
			useLabelDetailsInCompletionEntries: true,
			allowIncompleteCompletions: true,
			displayPartsForJSDoc: true,
			disableLineTextInReferences: true,
			interactiveInlayHints: true,
			includeCompletionsForModuleExports: readUnifiedConfig<boolean>('suggest.autoImports', true, { scope: document, fallbackSection }),
			...getInlayHintsPreferences(document, fallbackSection),
			...getOrganizeImportsPreferences(document, fallbackSection),
			maximumHoverLength: this.getMaximumHoverLength(document),
		};

		return preferences;
	}

	private getAutoImportFileExcludePatternsPreference(scope: UnifiedConfigurationScope, fallbackSection: string, workspaceFolder: vscode.Uri | undefined): string[] | undefined {
		const patterns = readUnifiedConfig<string[] | undefined>('preferences.autoImportFileExcludePatterns', undefined, { scope, fallbackSection });
		return workspaceFolder && patterns?.map(p => {
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


	private getMaximumHoverLength(document: vscode.TextDocument): number {
		const defaultMaxLength = 500;
		const maximumHoverLength = vscode.workspace.getConfiguration('js/ts', document).get<number>('hover.maximumLength', defaultMaxLength);
		if (!Number.isSafeInteger(maximumHoverLength) || maximumHoverLength <= 0) {
			return defaultMaxLength;
		}
		return maximumHoverLength;
	}
}

function withDefaultAsUndefined<T, O extends T>(value: T, def: O): Exclude<T, O> | undefined {
	return value === def ? undefined : value as Exclude<T, O>;
}

export const InlayHintSettingNames = Object.freeze({
	parameterNamesEnabled: 'inlayHints.parameterNames.enabled',
	parameterNamesSuppressWhenArgumentMatchesName: 'inlayHints.parameterNames.suppressWhenArgumentMatchesName',
	parameterTypesEnabled: 'inlayHints.parameterTypes.enabled',
	variableTypesEnabled: 'inlayHints.variableTypes.enabled',
	variableTypesSuppressWhenTypeMatchesName: 'inlayHints.variableTypes.suppressWhenTypeMatchesName',
	propertyDeclarationTypesEnabled: 'inlayHints.propertyDeclarationTypes.enabled',
	functionLikeReturnTypesEnabled: 'inlayHints.functionLikeReturnTypes.enabled',
	enumMemberValuesEnabled: 'inlayHints.enumMemberValues.enabled',
});

export function getInlayHintsPreferences(scope: UnifiedConfigurationScope, fallbackSection: string) {
	return {
		includeInlayParameterNameHints: getInlayParameterNameHintsPreference(scope, fallbackSection),
		includeInlayParameterNameHintsWhenArgumentMatchesName: !readUnifiedConfig<boolean>(InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName, true, { scope, fallbackSection }),
		includeInlayFunctionParameterTypeHints: readUnifiedConfig<boolean>(InlayHintSettingNames.parameterTypesEnabled, false, { scope, fallbackSection }),
		includeInlayVariableTypeHints: readUnifiedConfig<boolean>(InlayHintSettingNames.variableTypesEnabled, false, { scope, fallbackSection }),
		includeInlayVariableTypeHintsWhenTypeMatchesName: !readUnifiedConfig<boolean>(InlayHintSettingNames.variableTypesSuppressWhenTypeMatchesName, true, { scope, fallbackSection }),
		includeInlayPropertyDeclarationTypeHints: readUnifiedConfig<boolean>(InlayHintSettingNames.propertyDeclarationTypesEnabled, false, { scope, fallbackSection }),
		includeInlayFunctionLikeReturnTypeHints: readUnifiedConfig<boolean>(InlayHintSettingNames.functionLikeReturnTypesEnabled, false, { scope, fallbackSection }),
		includeInlayEnumMemberValueHints: readUnifiedConfig<boolean>(InlayHintSettingNames.enumMemberValuesEnabled, false, { scope, fallbackSection }),
	} as const;
}

function getInlayParameterNameHintsPreference(scope: UnifiedConfigurationScope, fallbackSection: string) {
	switch (readUnifiedConfig<string>(InlayHintSettingNames.parameterNamesEnabled, 'none', { scope, fallbackSection })) {
		case 'none': return 'none';
		case 'literals': return 'literals';
		case 'all': return 'all';
		default: return undefined;
	}
}

function getQuoteStylePreference(scope: UnifiedConfigurationScope, fallbackSection: string) {
	switch (readUnifiedConfig<string>('preferences.quoteStyle', 'auto', { scope, fallbackSection })) {
		case 'single': return 'single';
		case 'double': return 'double';
		default: return 'auto';
	}
}

function getImportModuleSpecifierPreference(scope: UnifiedConfigurationScope, fallbackSection: string) {
	switch (readUnifiedConfig<string>('preferences.importModuleSpecifier', 'shortest', { scope, fallbackSection })) {
		case 'project-relative': return 'project-relative';
		case 'relative': return 'relative';
		case 'non-relative': return 'non-relative';
		default: return undefined;
	}
}

function getImportModuleSpecifierEndingPreference(scope: UnifiedConfigurationScope, fallbackSection: string) {
	switch (readUnifiedConfig<string>('preferences.importModuleSpecifierEnding', 'auto', { scope, fallbackSection })) {
		case 'minimal': return 'minimal';
		case 'index': return 'index';
		case 'js': return 'js';
		default: return 'auto';
	}
}

function getJsxAttributeCompletionStyle(scope: UnifiedConfigurationScope, fallbackSection: string) {
	switch (readUnifiedConfig<string>('preferences.jsxAttributeCompletionStyle', 'auto', { scope, fallbackSection })) {
		case 'braces': return 'braces';
		case 'none': return 'none';
		default: return 'auto';
	}
}

function getOrganizeImportsPreferences(scope: UnifiedConfigurationScope, fallbackSection: string): Proto.UserPreferences {
	const organizeImportsCollation = readUnifiedConfig<'ordinal' | 'unicode'>('preferences.organizeImports.unicodeCollation', 'ordinal', { scope, fallbackSection });
	const organizeImportsCaseSensitivity = readUnifiedConfig<'auto' | 'caseInsensitive' | 'caseSensitive'>('preferences.organizeImports.caseSensitivity', 'auto', { scope, fallbackSection });
	return {
		// More specific settings
		organizeImportsTypeOrder: withDefaultAsUndefined(readUnifiedConfig<'auto' | 'last' | 'inline' | 'first'>('preferences.organizeImports.typeOrder', 'auto', { scope, fallbackSection }), 'auto'),
		organizeImportsIgnoreCase: organizeImportsCaseSensitivity === 'caseInsensitive' ? true
			: organizeImportsCaseSensitivity === 'caseSensitive' ? false
				: 'auto',
		organizeImportsCollation,

		// The rest of the settings are only applicable when using unicode collation
		...(organizeImportsCollation === 'unicode' ? {
			organizeImportsCaseFirst: organizeImportsCaseSensitivity === 'caseInsensitive' ? undefined : withDefaultAsUndefined(readUnifiedConfig<'default' | 'upper' | 'lower' | false>('preferences.organizeImports.caseFirst', false, { scope, fallbackSection }), 'default'),
			organizeImportsAccentCollation: readUnifiedConfig<boolean | undefined>('preferences.organizeImports.accentCollation', undefined, { scope, fallbackSection }),
			organizeImportsLocale: readUnifiedConfig<string | undefined>('preferences.organizeImports.locale', undefined, { scope, fallbackSection }),
			organizeImportsNumericCollation: readUnifiedConfig<boolean | undefined>('preferences.organizeImports.numericCollation', undefined, { scope, fallbackSection }),
		} : {}),
	};
}
