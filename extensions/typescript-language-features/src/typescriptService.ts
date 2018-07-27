/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import BufferSyncSupport from './features/bufferSyncSupport';
import * as Proto from './protocol';
import API from './utils/api';
import { TypeScriptServiceConfiguration } from './utils/configuration';
import Logger from './utils/logger';
import { TypeScriptServerPlugin } from './utils/plugins';

interface TypeScriptArgsMap {
	'configure': Proto.ConfigureRequestArguments;
	'quickinfo': Proto.FileLocationRequestArgs;
	'completions': Proto.CompletionsRequestArgs;
	'completionInfo': Proto.CompletionsRequestArgs;
	'completionEntryDetails': Proto.CompletionDetailsRequestArgs;
	'signatureHelp': Proto.SignatureHelpRequestArgs;
	'definition': Proto.FileLocationRequestArgs;
	'definitionAndBoundSpan': Proto.FileLocationRequestArgs;
	'implementation': Proto.FileLocationRequestArgs;
	'typeDefinition': Proto.FileLocationRequestArgs;
	'references': Proto.FileLocationRequestArgs;
	'navto': Proto.NavtoRequestArgs;
	'format': Proto.FormatRequestArgs;
	'formatonkey': Proto.FormatOnKeyRequestArgs;
	'rename': Proto.RenameRequestArgs;
	'occurrences': Proto.FileLocationRequestArgs;
	'projectInfo': Proto.ProjectInfoRequestArgs;
	'navtree': Proto.FileRequestArgs;
	'getCodeFixes': Proto.CodeFixRequestArgs;
	'getSupportedCodeFixes': null;
	'getCombinedCodeFix': Proto.GetCombinedCodeFixRequestArgs;
	'docCommentTemplate': Proto.FileLocationRequestArgs;
	'getApplicableRefactors': Proto.GetApplicableRefactorsRequestArgs;
	'getEditsForRefactor': Proto.GetEditsForRefactorRequestArgs;
	'applyCodeActionCommand': Proto.ApplyCodeActionCommandRequestArgs;
	'organizeImports': Proto.OrganizeImportsRequestArgs;
	'getOutliningSpans': Proto.FileRequestArgs;
	'getEditsForFileRename': Proto.GetEditsForFileRenameRequestArgs;
	'jsxClosingTag': Proto.JsxClosingTagRequestArgs;
}

interface TypeScriptResultMap {
	'configure': Proto.ConfigureResponse;
	'quickinfo': Proto.QuickInfoResponse;
	'completions': Proto.CompletionsResponse;
	'completionInfo': Proto.CompletionInfoResponse;
	'completionEntryDetails': Proto.CompletionDetailsResponse;
	'signatureHelp': Proto.SignatureHelpResponse;
	'definition': Proto.DefinitionResponse;
	'definitionAndBoundSpan': Proto.DefinitionInfoAndBoundSpanReponse;
	'implementation': Proto.ImplementationResponse;
	'typeDefinition': Proto.TypeDefinitionResponse;
	'references': Proto.ReferencesResponse;
	'navto': Proto.NavtoResponse;
	'format': Proto.FormatResponse;
	'formatonkey': Proto.FormatResponse;
	'rename': Proto.RenameResponse;
	'occurrences': Proto.OccurrencesResponse;
	'projectInfo': Proto.ProjectInfoResponse;
	'navtree': Proto.NavTreeResponse;
	'getCodeFixes': Proto.GetCodeFixesResponse;
	'getSupportedCodeFixes': Proto.GetSupportedCodeFixesResponse;
	'getCombinedCodeFix': Proto.GetCombinedCodeFixResponse;
	'docCommentTemplate': Proto.DocCommandTemplateResponse;
	'getApplicableRefactors': Proto.GetApplicableRefactorsResponse;
	'getEditsForRefactor': Proto.GetEditsForRefactorResponse;
	'applyCodeActionCommand': Proto.ApplyCodeActionCommandResponse;
	'organizeImports': Proto.OrganizeImportsResponse;
	'getOutliningSpans': Proto.OutliningSpansResponse;
	'getEditsForFileRename': Proto.GetEditsForFileRenameResponse;
	'jsxClosingTag': Proto.JsxClosingTagResponse;
}

export interface ITypeScriptServiceClient {
	/**
	 * Convert a resource (VS Code) to a normalized path (TypeScript).
	 *
	 * Does not try handling case insensitivity.
	 */
	normalizedPath(resource: vscode.Uri): string | null;

	/**
	 * Map a resource to a normalized path
	 *
	 * This will attempt to handle case insensitivity.
	 */
	toPath(resource: vscode.Uri): string | null;

	/**
	 * Convert a path to a resource.
	 */
	toResource(filepath: string): vscode.Uri;

	getWorkspaceRootForResource(resource: vscode.Uri): string | undefined;

	readonly onTsServerStarted: vscode.Event<API>;
	readonly onProjectLanguageServiceStateChanged: vscode.Event<Proto.ProjectLanguageServiceStateEventBody>;
	readonly onDidBeginInstallTypings: vscode.Event<Proto.BeginInstallTypesEventBody>;
	readonly onDidEndInstallTypings: vscode.Event<Proto.EndInstallTypesEventBody>;
	readonly onTypesInstallerInitializationFailed: vscode.Event<Proto.TypesInstallerInitializationFailedEventBody>;

	readonly apiVersion: API;
	readonly plugins: TypeScriptServerPlugin[];
	readonly configuration: TypeScriptServiceConfiguration;
	readonly logger: Logger;
	readonly bufferSyncSupport: BufferSyncSupport;

	execute<K extends keyof TypeScriptArgsMap>(
		command: K,
		args: TypeScriptArgsMap[K],
		token: vscode.CancellationToken
	): Promise<TypeScriptResultMap[K]>;

	executeWithoutWaitingForResponse(command: 'open', args: Proto.OpenRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'close', args: Proto.FileRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'change', args: Proto.ChangeRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'compilerOptionsForInferredProjects', args: Proto.SetCompilerOptionsForInferredProjectsArgs): void;
	executeWithoutWaitingForResponse(command: 'reloadProjects', args: null): void;

	executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: vscode.CancellationToken): Promise<any>;
}