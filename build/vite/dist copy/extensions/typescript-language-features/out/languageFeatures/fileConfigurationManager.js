"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InlayHintSettingNames = void 0;
exports.getInlayHintsPreferences = getInlayHintsPreferences;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const fileSchemes = __importStar(require("../configuration/fileSchemes"));
const languageIds_1 = require("../configuration/languageIds");
const api_1 = require("../tsServer/api");
const configuration_1 = require("../utils/configuration");
const dispose_1 = require("../utils/dispose");
const objects_1 = require("../utils/objects");
const resourceMap_1 = require("../utils/resourceMap");
function areFileConfigurationsEqual(a, b) {
    return (0, objects_1.equals)(a, b);
}
class FileConfigurationManager extends dispose_1.Disposable {
    client;
    formatOptions;
    constructor(client, onCaseInsensitiveFileSystem) {
        super();
        this.client = client;
        this.formatOptions = new resourceMap_1.ResourceMap(undefined, { onCaseInsensitiveFileSystem });
        vscode.workspace.onDidCloseTextDocument(textDocument => {
            // When a document gets closed delete the cached formatting options.
            // This is necessary since the tsserver now closed a project when its
            // last file in it closes which drops the stored formatting options
            // as well.
            this.formatOptions.delete(textDocument.uri);
        }, undefined, this._disposables);
    }
    async ensureConfigurationForDocument(document, token) {
        const formattingOptions = this.getFormattingOptions(document)
            ?? { tabSize: undefined, insertSpaces: undefined };
        return this.ensureConfigurationOptions(document, formattingOptions, token);
    }
    getFormattingOptions(document) {
        const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri.toString());
        if (!editor) {
            return undefined;
        }
        return {
            tabSize: typeof editor.options.tabSize === 'number' ? editor.options.tabSize : undefined,
            insertSpaces: typeof editor.options.insertSpaces === 'boolean' ? editor.options.insertSpaces : undefined,
        };
    }
    async ensureConfigurationOptions(document, options, token) {
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
            }
            catch {
                return undefined;
            }
        })();
        this.formatOptions.set(document.uri, task);
        await task;
    }
    async setGlobalConfigurationFromDocument(document, token) {
        const formattingOptions = this.getFormattingOptions(document);
        if (!formattingOptions) {
            return;
        }
        const args = {
            file: undefined /*global*/,
            ...this.getFileOptions(document, formattingOptions),
        };
        await this.client.execute('configure', args, token);
    }
    reset() {
        this.formatOptions.clear();
    }
    getFileOptions(document, options) {
        return {
            formatOptions: this.getFormatOptions(document, options),
            preferences: this.getPreferences(document)
        };
    }
    getFormatOptions(document, options) {
        const fallbackSection = (0, languageIds_1.isTypeScriptDocument)(document) ? 'typescript' : 'javascript';
        return {
            tabSize: options.tabSize,
            indentSize: options.tabSize,
            convertTabsToSpaces: options.insertSpaces,
            // We can use \n here since the editor normalizes later on to its line endings.
            newLineCharacter: '\n',
            insertSpaceAfterCommaDelimiter: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterCommaDelimiter', true, { scope: document, fallbackSection }),
            insertSpaceAfterConstructor: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterConstructor', false, { scope: document, fallbackSection }),
            insertSpaceAfterSemicolonInForStatements: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterSemicolonInForStatements', true, { scope: document, fallbackSection }),
            insertSpaceBeforeAndAfterBinaryOperators: (0, configuration_1.readUnifiedConfig)('format.insertSpaceBeforeAndAfterBinaryOperators', true, { scope: document, fallbackSection }),
            insertSpaceAfterKeywordsInControlFlowStatements: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterKeywordsInControlFlowStatements', true, { scope: document, fallbackSection }),
            insertSpaceAfterFunctionKeywordForAnonymousFunctions: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterFunctionKeywordForAnonymousFunctions', true, { scope: document, fallbackSection }),
            insertSpaceBeforeFunctionParenthesis: (0, configuration_1.readUnifiedConfig)('format.insertSpaceBeforeFunctionParenthesis', false, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis', false, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets', false, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces', true, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces', true, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces', false, { scope: document, fallbackSection }),
            insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces', false, { scope: document, fallbackSection }),
            insertSpaceAfterTypeAssertion: (0, configuration_1.readUnifiedConfig)('format.insertSpaceAfterTypeAssertion', false, { scope: document, fallbackSection }),
            placeOpenBraceOnNewLineForFunctions: (0, configuration_1.readUnifiedConfig)('format.placeOpenBraceOnNewLineForFunctions', false, { scope: document, fallbackSection }),
            placeOpenBraceOnNewLineForControlBlocks: (0, configuration_1.readUnifiedConfig)('format.placeOpenBraceOnNewLineForControlBlocks', false, { scope: document, fallbackSection }),
            semicolons: (0, configuration_1.readUnifiedConfig)('format.semicolons', 'ignore', { scope: document, fallbackSection }),
            indentSwitchCase: (0, configuration_1.readUnifiedConfig)('format.indentSwitchCase', true, { scope: document, fallbackSection }),
        };
    }
    getPreferences(document) {
        const fallbackSection = (0, languageIds_1.isTypeScriptDocument)(document) ? 'typescript' : 'javascript';
        const oldConfig = vscode.workspace.getConfiguration(fallbackSection, document);
        const preferences = {
            ...oldConfig.get('unstable'),
            quotePreference: getQuoteStylePreference(document, fallbackSection),
            importModuleSpecifierPreference: getImportModuleSpecifierPreference(document, fallbackSection),
            importModuleSpecifierEnding: getImportModuleSpecifierEndingPreference(document, fallbackSection),
            jsxAttributeCompletionStyle: getJsxAttributeCompletionStyle(document, fallbackSection),
            allowTextChangesInNewFiles: document.uri.scheme === fileSchemes.file,
            providePrefixAndSuffixTextForRename: (0, configuration_1.readUnifiedConfig)('preferences.useAliasesForRenames', true, { scope: document, fallbackSection }),
            allowRenameOfImportPath: true,
            includeAutomaticOptionalChainCompletions: (0, configuration_1.readUnifiedConfig)('suggest.includeAutomaticOptionalChainCompletions', true, { scope: document, fallbackSection }),
            provideRefactorNotApplicableReason: true,
            generateReturnInDocTemplate: (0, configuration_1.readUnifiedConfig)('suggest.jsdoc.generateReturns', true, { scope: document, fallbackSection }),
            includeCompletionsForImportStatements: (0, configuration_1.readUnifiedConfig)('suggest.includeCompletionsForImportStatements', true, { scope: document, fallbackSection }),
            includeCompletionsWithSnippetText: true,
            includeCompletionsWithClassMemberSnippets: (0, configuration_1.readUnifiedConfig)('suggest.classMemberSnippets.enabled', true, { scope: document, fallbackSection }),
            includeCompletionsWithObjectLiteralMethodSnippets: (0, configuration_1.readUnifiedConfig)('suggest.objectLiteralMethodSnippets.enabled', true, { scope: document, fallbackSection }),
            autoImportFileExcludePatterns: this.getAutoImportFileExcludePatternsPreference(document, fallbackSection, vscode.workspace.getWorkspaceFolder(document.uri)?.uri),
            autoImportSpecifierExcludeRegexes: (0, configuration_1.readUnifiedConfig)('preferences.autoImportSpecifierExcludeRegexes', undefined, { scope: document, fallbackSection }),
            preferTypeOnlyAutoImports: (0, configuration_1.readUnifiedConfig)('preferences.preferTypeOnlyAutoImports', false, { scope: document, fallbackSection }),
            useLabelDetailsInCompletionEntries: true,
            allowIncompleteCompletions: true,
            displayPartsForJSDoc: true,
            disableLineTextInReferences: true,
            interactiveInlayHints: true,
            includeCompletionsForModuleExports: (0, configuration_1.readUnifiedConfig)('suggest.autoImports', true, { scope: document, fallbackSection }),
            ...getInlayHintsPreferences(document, fallbackSection),
            ...getOrganizeImportsPreferences(document, fallbackSection),
            maximumHoverLength: this.getMaximumHoverLength(document),
        };
        return preferences;
    }
    getAutoImportFileExcludePatternsPreference(scope, fallbackSection, workspaceFolder) {
        const patterns = (0, configuration_1.readUnifiedConfig)('preferences.autoImportFileExcludePatterns', undefined, { scope, fallbackSection });
        return workspaceFolder && patterns?.map(p => {
            // Normalization rules: https://github.com/microsoft/TypeScript/pull/49578
            const isRelative = /^\.\.?($|[\/\\])/.test(p);
            // In TypeScript < 5.3, the first path component cannot be a wildcard, so we need to prefix
            // it with a path root (e.g. `/` or `c:\`)
            const wildcardPrefix = this.client.apiVersion.gte(api_1.API.v540)
                ? ''
                : path.parse(this.client.toTsFilePath(workspaceFolder)).root;
            return path.isAbsolute(p) ? p :
                p.startsWith('*') ? wildcardPrefix + p :
                    isRelative ? this.client.toTsFilePath(vscode.Uri.joinPath(workspaceFolder, p)) :
                        wildcardPrefix + '**' + path.sep + p;
        });
    }
    getMaximumHoverLength(document) {
        const defaultMaxLength = 500;
        const maximumHoverLength = vscode.workspace.getConfiguration('js/ts', document).get('hover.maximumLength', defaultMaxLength);
        if (!Number.isSafeInteger(maximumHoverLength) || maximumHoverLength <= 0) {
            return defaultMaxLength;
        }
        return maximumHoverLength;
    }
}
exports.default = FileConfigurationManager;
function withDefaultAsUndefined(value, def) {
    return value === def ? undefined : value;
}
exports.InlayHintSettingNames = Object.freeze({
    parameterNamesEnabled: 'inlayHints.parameterNames.enabled',
    parameterNamesSuppressWhenArgumentMatchesName: 'inlayHints.parameterNames.suppressWhenArgumentMatchesName',
    parameterTypesEnabled: 'inlayHints.parameterTypes.enabled',
    variableTypesEnabled: 'inlayHints.variableTypes.enabled',
    variableTypesSuppressWhenTypeMatchesName: 'inlayHints.variableTypes.suppressWhenTypeMatchesName',
    propertyDeclarationTypesEnabled: 'inlayHints.propertyDeclarationTypes.enabled',
    functionLikeReturnTypesEnabled: 'inlayHints.functionLikeReturnTypes.enabled',
    enumMemberValuesEnabled: 'inlayHints.enumMemberValues.enabled',
});
function getInlayHintsPreferences(scope, fallbackSection) {
    return {
        includeInlayParameterNameHints: getInlayParameterNameHintsPreference(scope, fallbackSection),
        includeInlayParameterNameHintsWhenArgumentMatchesName: !(0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName, true, { scope, fallbackSection }),
        includeInlayFunctionParameterTypeHints: (0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.parameterTypesEnabled, false, { scope, fallbackSection }),
        includeInlayVariableTypeHints: (0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.variableTypesEnabled, false, { scope, fallbackSection }),
        includeInlayVariableTypeHintsWhenTypeMatchesName: !(0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.variableTypesSuppressWhenTypeMatchesName, true, { scope, fallbackSection }),
        includeInlayPropertyDeclarationTypeHints: (0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.propertyDeclarationTypesEnabled, false, { scope, fallbackSection }),
        includeInlayFunctionLikeReturnTypeHints: (0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.functionLikeReturnTypesEnabled, false, { scope, fallbackSection }),
        includeInlayEnumMemberValueHints: (0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.enumMemberValuesEnabled, false, { scope, fallbackSection }),
    };
}
function getInlayParameterNameHintsPreference(scope, fallbackSection) {
    switch ((0, configuration_1.readUnifiedConfig)(exports.InlayHintSettingNames.parameterNamesEnabled, 'none', { scope, fallbackSection })) {
        case 'none': return 'none';
        case 'literals': return 'literals';
        case 'all': return 'all';
        default: return undefined;
    }
}
function getQuoteStylePreference(scope, fallbackSection) {
    switch ((0, configuration_1.readUnifiedConfig)('preferences.quoteStyle', 'auto', { scope, fallbackSection })) {
        case 'single': return 'single';
        case 'double': return 'double';
        default: return 'auto';
    }
}
function getImportModuleSpecifierPreference(scope, fallbackSection) {
    switch ((0, configuration_1.readUnifiedConfig)('preferences.importModuleSpecifier', 'shortest', { scope, fallbackSection })) {
        case 'project-relative': return 'project-relative';
        case 'relative': return 'relative';
        case 'non-relative': return 'non-relative';
        default: return undefined;
    }
}
function getImportModuleSpecifierEndingPreference(scope, fallbackSection) {
    switch ((0, configuration_1.readUnifiedConfig)('preferences.importModuleSpecifierEnding', 'auto', { scope, fallbackSection })) {
        case 'minimal': return 'minimal';
        case 'index': return 'index';
        case 'js': return 'js';
        default: return 'auto';
    }
}
function getJsxAttributeCompletionStyle(scope, fallbackSection) {
    switch ((0, configuration_1.readUnifiedConfig)('preferences.jsxAttributeCompletionStyle', 'auto', { scope, fallbackSection })) {
        case 'braces': return 'braces';
        case 'none': return 'none';
        default: return 'auto';
    }
}
function getOrganizeImportsPreferences(scope, fallbackSection) {
    const organizeImportsCollation = (0, configuration_1.readUnifiedConfig)('preferences.organizeImports.unicodeCollation', 'ordinal', { scope, fallbackSection });
    const organizeImportsCaseSensitivity = (0, configuration_1.readUnifiedConfig)('preferences.organizeImports.caseSensitivity', 'auto', { scope, fallbackSection });
    return {
        // More specific settings
        organizeImportsTypeOrder: withDefaultAsUndefined((0, configuration_1.readUnifiedConfig)('preferences.organizeImports.typeOrder', 'auto', { scope, fallbackSection }), 'auto'),
        organizeImportsIgnoreCase: organizeImportsCaseSensitivity === 'caseInsensitive' ? true
            : organizeImportsCaseSensitivity === 'caseSensitive' ? false
                : 'auto',
        organizeImportsCollation,
        // The rest of the settings are only applicable when using unicode collation
        ...(organizeImportsCollation === 'unicode' ? {
            organizeImportsCaseFirst: organizeImportsCaseSensitivity === 'caseInsensitive' ? undefined : withDefaultAsUndefined((0, configuration_1.readUnifiedConfig)('preferences.organizeImports.caseFirst', false, { scope, fallbackSection }), 'default'),
            organizeImportsAccentCollation: (0, configuration_1.readUnifiedConfig)('preferences.organizeImports.accentCollation', undefined, { scope, fallbackSection }),
            organizeImportsLocale: (0, configuration_1.readUnifiedConfig)('preferences.organizeImports.locale', undefined, { scope, fallbackSection }),
            organizeImportsNumericCollation: (0, configuration_1.readUnifiedConfig)('preferences.organizeImports.numericCollation', undefined, { scope, fallbackSection }),
        } : {}),
    };
}
//# sourceMappingURL=fileConfigurationManager.js.map