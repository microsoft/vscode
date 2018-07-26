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

	execute(command: 'configure', args: Proto.ConfigureRequestArguments, token?: vscode.CancellationToken): Promise<Proto.ConfigureResponse>;
	execute(command: 'open', args: Proto.OpenRequestArgs, expectedResult: boolean, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'close', args: Proto.FileRequestArgs, expectedResult: boolean, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'change', args: Proto.ChangeRequestArgs, expectedResult: boolean, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'quickinfo', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.QuickInfoResponse>;
	execute(command: 'completions', args: Proto.CompletionsRequestArgs, token?: vscode.CancellationToken): Promise<Proto.CompletionsResponse>;
	execute(command: 'completionInfo', args: Proto.CompletionsRequestArgs, token?: vscode.CancellationToken): Promise<Proto.CompletionInfoResponse>;
	execute(command: 'completionEntryDetails', args: Proto.CompletionDetailsRequestArgs, token?: vscode.CancellationToken): Promise<Proto.CompletionDetailsResponse>;
	execute(command: 'signatureHelp', args: Proto.SignatureHelpRequestArgs, token?: vscode.CancellationToken): Promise<Proto.SignatureHelpResponse>;
	execute(command: 'definition', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.DefinitionResponse>;
	execute(command: 'definitionAndBoundSpan', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.DefinitionInfoAndBoundSpanReponse>;
	execute(command: 'implementation', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.ImplementationResponse>;
	execute(command: 'typeDefinition', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.TypeDefinitionResponse>;
	execute(command: 'references', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.ReferencesResponse>;
	execute(command: 'navto', args: Proto.NavtoRequestArgs, token?: vscode.CancellationToken): Promise<Proto.NavtoResponse>;
	execute(command: 'format', args: Proto.FormatRequestArgs, token?: vscode.CancellationToken): Promise<Proto.FormatResponse>;
	execute(command: 'formatonkey', args: Proto.FormatOnKeyRequestArgs, token?: vscode.CancellationToken): Promise<Proto.FormatResponse>;
	execute(command: 'rename', args: Proto.RenameRequestArgs, token?: vscode.CancellationToken): Promise<Proto.RenameResponse>;
	execute(command: 'occurrences', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.OccurrencesResponse>;
	execute(command: 'projectInfo', args: Proto.ProjectInfoRequestArgs, token?: vscode.CancellationToken): Promise<Proto.ProjectInfoResponse>;
	execute(command: 'reloadProjects', args: any, expectedResult: boolean, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'reload', args: Proto.ReloadRequestArgs, expectedResult: boolean, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'compilerOptionsForInferredProjects', args: Proto.SetCompilerOptionsForInferredProjectsArgs, token?: vscode.CancellationToken): Promise<any>;
	execute(command: 'navtree', args: Proto.FileRequestArgs, token?: vscode.CancellationToken): Promise<Proto.NavTreeResponse>;
	execute(command: 'getCodeFixes', args: Proto.CodeFixRequestArgs, token?: vscode.CancellationToken): Promise<Proto.GetCodeFixesResponse>;
	execute(command: 'getSupportedCodeFixes', args: null, token?: vscode.CancellationToken): Promise<Proto.GetSupportedCodeFixesResponse>;
	execute(command: 'getCombinedCodeFix', args: Proto.GetCombinedCodeFixRequestArgs, token?: vscode.CancellationToken): Promise<Proto.GetCombinedCodeFixResponse>;
	execute(command: 'docCommentTemplate', args: Proto.FileLocationRequestArgs, token?: vscode.CancellationToken): Promise<Proto.DocCommandTemplateResponse>;
	execute(command: 'getApplicableRefactors', args: Proto.GetApplicableRefactorsRequestArgs, token?: vscode.CancellationToken): Promise<Proto.GetApplicableRefactorsResponse>;
	execute(command: 'getEditsForRefactor', args: Proto.GetEditsForRefactorRequestArgs, token?: vscode.CancellationToken): Promise<Proto.GetEditsForRefactorResponse>;
	execute(command: 'applyCodeActionCommand', args: Proto.ApplyCodeActionCommandRequestArgs, token?: vscode.CancellationToken): Promise<Proto.ApplyCodeActionCommandResponse>;
	execute(command: 'organizeImports', args: Proto.OrganizeImportsRequestArgs, token?: vscode.CancellationToken): Promise<Proto.OrganizeImportsResponse>;
	execute(command: 'getOutliningSpans', args: Proto.FileRequestArgs, token: vscode.CancellationToken): Promise<Proto.OutliningSpansResponse>;
	execute(command: 'getEditsForFileRename', args: Proto.GetEditsForFileRenameRequestArgs): Promise<Proto.GetEditsForFileRenameResponse>;
	execute(command: 'jsxClosingTag', args: Proto.JsxClosingTagRequestArgs, token: vscode.CancellationToken): Promise<Proto.JsxClosingTagResponse>;
	execute(command: string, args: any, expectedResult: boolean | vscode.CancellationToken, token?: vscode.CancellationToken): Promise<any>;

	executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: vscode.CancellationToken): Promise<any>;
}