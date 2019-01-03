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
import { PluginManager } from './utils/plugins';

export class CancelledResponse {
	public readonly type: 'cancelled' = 'cancelled';

	constructor(
		public readonly reason: string
	) { }
}

export class NoContentResponse {
	public readonly type: 'noContent' = 'noContent';
}

export type ServerResponse<T extends Proto.Response> = T | CancelledResponse | NoContentResponse;

interface TypeScriptRequestTypes {
	'applyCodeActionCommand': [Proto.ApplyCodeActionCommandRequestArgs, Proto.ApplyCodeActionCommandResponse];
	'completionEntryDetails': [Proto.CompletionDetailsRequestArgs, Proto.CompletionDetailsResponse];
	'completionInfo': [Proto.CompletionsRequestArgs, Proto.CompletionInfoResponse];
	'completions': [Proto.CompletionsRequestArgs, Proto.CompletionsResponse];
	'configure': [Proto.ConfigureRequestArguments, Proto.ConfigureResponse];
	'definition': [Proto.FileLocationRequestArgs, Proto.DefinitionResponse];
	'definitionAndBoundSpan': [Proto.FileLocationRequestArgs, Proto.DefinitionInfoAndBoundSpanReponse];
	'docCommentTemplate': [Proto.FileLocationRequestArgs, Proto.DocCommandTemplateResponse];
	'documentHighlights': [Proto.DocumentHighlightsRequestArgs, Proto.DocumentHighlightsResponse];
	'format': [Proto.FormatRequestArgs, Proto.FormatResponse];
	'formatonkey': [Proto.FormatOnKeyRequestArgs, Proto.FormatResponse];
	'getApplicableRefactors': [Proto.GetApplicableRefactorsRequestArgs, Proto.GetApplicableRefactorsResponse];
	'getCodeFixes': [Proto.CodeFixRequestArgs, Proto.GetCodeFixesResponse];
	'getCombinedCodeFix': [Proto.GetCombinedCodeFixRequestArgs, Proto.GetCombinedCodeFixResponse];
	'getEditsForFileRename': [Proto.GetEditsForFileRenameRequestArgs, Proto.GetEditsForFileRenameResponse];
	'getEditsForRefactor': [Proto.GetEditsForRefactorRequestArgs, Proto.GetEditsForRefactorResponse];
	'getOutliningSpans': [Proto.FileRequestArgs, Proto.OutliningSpansResponse];
	'getSupportedCodeFixes': [null, Proto.GetSupportedCodeFixesResponse];
	'implementation': [Proto.FileLocationRequestArgs, Proto.ImplementationResponse];
	'jsxClosingTag': [Proto.JsxClosingTagRequestArgs, Proto.JsxClosingTagResponse];
	'navto': [Proto.NavtoRequestArgs, Proto.NavtoResponse];
	'navtree': [Proto.FileRequestArgs, Proto.NavTreeResponse];
	'occurrences': [Proto.FileLocationRequestArgs, Proto.OccurrencesResponse];
	'organizeImports': [Proto.OrganizeImportsRequestArgs, Proto.OrganizeImportsResponse];
	'projectInfo': [Proto.ProjectInfoRequestArgs, Proto.ProjectInfoResponse];
	'quickinfo': [Proto.FileLocationRequestArgs, Proto.QuickInfoResponse];
	'references': [Proto.FileLocationRequestArgs, Proto.ReferencesResponse];
	'rename': [Proto.RenameRequestArgs, Proto.RenameResponse];
	'signatureHelp': [Proto.SignatureHelpRequestArgs, Proto.SignatureHelpResponse];
	'typeDefinition': [Proto.FileLocationRequestArgs, Proto.TypeDefinitionResponse];
}

export interface ITypeScriptServiceClient {
	/**
	 * Convert a resource (VS Code) to a normalized path (TypeScript).
	 *
	 * Does not try handling case insensitivity.
	 */
	normalizedPath(resource: vscode.Uri): string | undefined;

	/**
	 * Map a resource to a normalized path
	 *
	 * This will attempt to handle case insensitivity.
	 */
	toPath(resource: vscode.Uri): string | undefined;

	/**
	 * Convert a path to a resource.
	 */
	toResource(filepath: string): vscode.Uri;

	/**
	 * Tries to ensure that a vscode document is open on the TS server.
	 *
	 * Returns the normalized path.
	 */
	toOpenedFilePath(document: vscode.TextDocument): string | undefined;

	getWorkspaceRootForResource(resource: vscode.Uri): string | undefined;

	readonly onTsServerStarted: vscode.Event<API>;
	readonly onProjectLanguageServiceStateChanged: vscode.Event<Proto.ProjectLanguageServiceStateEventBody>;
	readonly onDidBeginInstallTypings: vscode.Event<Proto.BeginInstallTypesEventBody>;
	readonly onDidEndInstallTypings: vscode.Event<Proto.EndInstallTypesEventBody>;
	readonly onTypesInstallerInitializationFailed: vscode.Event<Proto.TypesInstallerInitializationFailedEventBody>;

	readonly apiVersion: API;
	readonly pluginManager: PluginManager;
	readonly configuration: TypeScriptServiceConfiguration;
	readonly logger: Logger;
	readonly bufferSyncSupport: BufferSyncSupport;

	execute<K extends keyof TypeScriptRequestTypes>(
		command: K,
		args: TypeScriptRequestTypes[K][0],
		token: vscode.CancellationToken,
		lowPriority?: boolean
	): Promise<ServerResponse<TypeScriptRequestTypes[K][1]>>;

	executeWithoutWaitingForResponse(command: 'open', args: Proto.OpenRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'close', args: Proto.FileRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'change', args: Proto.ChangeRequestArgs): void;
	executeWithoutWaitingForResponse(command: 'compilerOptionsForInferredProjects', args: Proto.SetCompilerOptionsForInferredProjectsArgs): void;
	executeWithoutWaitingForResponse(command: 'reloadProjects', args: null): void;

	executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: vscode.CancellationToken): Promise<any>;

	/**
	 * Cancel on going geterr requests and re-queue them after `f` has been evaluated.
	 */
	interuptGetErr<R>(f: () => R): R;
}