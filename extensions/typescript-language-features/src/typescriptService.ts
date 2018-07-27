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
	'applyCodeActionCommand': Proto.ApplyCodeActionCommandRequestArgs;
	'completionEntryDetails': Proto.CompletionDetailsRequestArgs;
	'completionInfo': Proto.CompletionsRequestArgs;
	'completions': Proto.CompletionsRequestArgs;
	'configure': Proto.ConfigureRequestArguments;
	'definition': Proto.FileLocationRequestArgs;
	'definitionAndBoundSpan': Proto.FileLocationRequestArgs;
	'docCommentTemplate': Proto.FileLocationRequestArgs;
	'format': Proto.FormatRequestArgs;
	'formatonkey': Proto.FormatOnKeyRequestArgs;
	'getApplicableRefactors': Proto.GetApplicableRefactorsRequestArgs;
	'getCodeFixes': Proto.CodeFixRequestArgs;
	'getCombinedCodeFix': Proto.GetCombinedCodeFixRequestArgs;
	'getEditsForFileRename': Proto.GetEditsForFileRenameRequestArgs;
	'getEditsForRefactor': Proto.GetEditsForRefactorRequestArgs;
	'getOutliningSpans': Proto.FileRequestArgs;
	'getSupportedCodeFixes': null;
	'implementation': Proto.FileLocationRequestArgs;
	'jsxClosingTag': Proto.JsxClosingTagRequestArgs;
	'navto': Proto.NavtoRequestArgs;
	'navtree': Proto.FileRequestArgs;
	'occurrences': Proto.FileLocationRequestArgs;
	'organizeImports': Proto.OrganizeImportsRequestArgs;
	'projectInfo': Proto.ProjectInfoRequestArgs;
	'quickinfo': Proto.FileLocationRequestArgs;
	'references': Proto.FileLocationRequestArgs;
	'rename': Proto.RenameRequestArgs;
	'signatureHelp': Proto.SignatureHelpRequestArgs;
	'typeDefinition': Proto.FileLocationRequestArgs;
}

interface TypeScriptResultMap {
	'applyCodeActionCommand': Proto.ApplyCodeActionCommandResponse;
	'completionEntryDetails': Proto.CompletionDetailsResponse;
	'completionInfo': Proto.CompletionInfoResponse;
	'completions': Proto.CompletionsResponse;
	'configure': Proto.ConfigureResponse;
	'definition': Proto.DefinitionResponse;
	'definitionAndBoundSpan': Proto.DefinitionInfoAndBoundSpanReponse;
	'docCommentTemplate': Proto.DocCommandTemplateResponse;
	'format': Proto.FormatResponse;
	'formatonkey': Proto.FormatResponse;
	'getApplicableRefactors': Proto.GetApplicableRefactorsResponse;
	'getCodeFixes': Proto.GetCodeFixesResponse;
	'getCombinedCodeFix': Proto.GetCombinedCodeFixResponse;
	'getEditsForFileRename': Proto.GetEditsForFileRenameResponse;
	'getEditsForRefactor': Proto.GetEditsForRefactorResponse;
	'getOutliningSpans': Proto.OutliningSpansResponse;
	'getSupportedCodeFixes': Proto.GetSupportedCodeFixesResponse;
	'implementation': Proto.ImplementationResponse;
	'jsxClosingTag': Proto.JsxClosingTagResponse;
	'navto': Proto.NavtoResponse;
	'navtree': Proto.NavTreeResponse;
	'occurrences': Proto.OccurrencesResponse;
	'organizeImports': Proto.OrganizeImportsResponse;
	'projectInfo': Proto.ProjectInfoResponse;
	'quickinfo': Proto.QuickInfoResponse;
	'references': Proto.ReferencesResponse;
	'rename': Proto.RenameResponse;
	'signatureHelp': Proto.SignatureHelpResponse;
	'typeDefinition': Proto.TypeDefinitionResponse;
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