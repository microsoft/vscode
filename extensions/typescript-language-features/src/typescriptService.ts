/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Uri, Event } from 'vscode';
import * as Proto from './protocol';
import API from './utils/api';
import { TypeScriptServerPlugin } from './utils/plugins';
import { TypeScriptServiceConfiguration } from './utils/configuration';
import Logger from './utils/logger';
import BufferSyncSupport from './features/bufferSyncSupport';

declare module './protocol' {
	export type JsxClosingTagRequestArgs = any;
	export type JsxClosingTagResponse = any;
}

export interface ITypeScriptServiceClient {
	/**
	 * Convert a resource (VS Code) to a normalized path (TypeScript).
	 *
	 * Does not try handling case insensitivity.
	 */
	normalizedPath(resource: Uri): string | null;

	/**
	 * Map a resource to a normalized path
	 *
	 * This will attempt to handle case insensitivity.
	 */
	toPath(resource: Uri): string | null;

	/**
	 * Convert a path to a resource.
	 */
	toResource(filepath: string): Uri;

	getWorkspaceRootForResource(resource: Uri): string | undefined;

	readonly onTsServerStarted: Event<API>;
	readonly onProjectLanguageServiceStateChanged: Event<Proto.ProjectLanguageServiceStateEventBody>;
	readonly onDidBeginInstallTypings: Event<Proto.BeginInstallTypesEventBody>;
	readonly onDidEndInstallTypings: Event<Proto.EndInstallTypesEventBody>;
	readonly onTypesInstallerInitializationFailed: Event<Proto.TypesInstallerInitializationFailedEventBody>;

	readonly apiVersion: API;
	readonly plugins: TypeScriptServerPlugin[];
	readonly configuration: TypeScriptServiceConfiguration;
	readonly logger: Logger;
	readonly bufferSyncSupport: BufferSyncSupport;

	execute(command: 'configure', args: Proto.ConfigureRequestArguments, token?: CancellationToken): Promise<Proto.ConfigureResponse>;
	execute(command: 'open', args: Proto.OpenRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'close', args: Proto.FileRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'change', args: Proto.ChangeRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'quickinfo', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.QuickInfoResponse>;
	execute(command: 'completions', args: Proto.CompletionsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionsResponse>;
	execute(command: 'completionEntryDetails', args: Proto.CompletionDetailsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionDetailsResponse>;
	execute(command: 'signatureHelp', args: Proto.SignatureHelpRequestArgs, token?: CancellationToken): Promise<Proto.SignatureHelpResponse>;
	execute(command: 'definition', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.DefinitionResponse>;
	execute(command: 'definitionAndBoundSpan', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.DefinitionInfoAndBoundSpanReponse>;
	execute(command: 'implementation', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.ImplementationResponse>;
	execute(command: 'typeDefinition', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.TypeDefinitionResponse>;
	execute(command: 'references', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.ReferencesResponse>;
	execute(command: 'navto', args: Proto.NavtoRequestArgs, token?: CancellationToken): Promise<Proto.NavtoResponse>;
	execute(command: 'navbar', args: Proto.FileRequestArgs, token?: CancellationToken): Promise<Proto.NavBarResponse>;
	execute(command: 'format', args: Proto.FormatRequestArgs, token?: CancellationToken): Promise<Proto.FormatResponse>;
	execute(command: 'formatonkey', args: Proto.FormatOnKeyRequestArgs, token?: CancellationToken): Promise<Proto.FormatResponse>;
	execute(command: 'rename', args: Proto.RenameRequestArgs, token?: CancellationToken): Promise<Proto.RenameResponse>;
	execute(command: 'occurrences', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.OccurrencesResponse>;
	execute(command: 'projectInfo', args: Proto.ProjectInfoRequestArgs, token?: CancellationToken): Promise<Proto.ProjectInfoResponse>;
	execute(command: 'reloadProjects', args: any, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'reload', args: Proto.ReloadRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'compilerOptionsForInferredProjects', args: Proto.SetCompilerOptionsForInferredProjectsArgs, token?: CancellationToken): Promise<any>;
	execute(command: 'navtree', args: Proto.FileRequestArgs, token?: CancellationToken): Promise<Proto.NavTreeResponse>;
	execute(command: 'getCodeFixes', args: Proto.CodeFixRequestArgs, token?: CancellationToken): Promise<Proto.GetCodeFixesResponse>;
	execute(command: 'getSupportedCodeFixes', args: null, token?: CancellationToken): Promise<Proto.GetSupportedCodeFixesResponse>;
	execute(command: 'getCombinedCodeFix', args: Proto.GetCombinedCodeFixRequestArgs, token?: CancellationToken): Promise<Proto.GetCombinedCodeFixResponse>;
	execute(command: 'docCommentTemplate', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.DocCommandTemplateResponse>;
	execute(command: 'getApplicableRefactors', args: Proto.GetApplicableRefactorsRequestArgs, token?: CancellationToken): Promise<Proto.GetApplicableRefactorsResponse>;
	execute(command: 'getEditsForRefactor', args: Proto.GetEditsForRefactorRequestArgs, token?: CancellationToken): Promise<Proto.GetEditsForRefactorResponse>;
	execute(command: 'applyCodeActionCommand', args: Proto.ApplyCodeActionCommandRequestArgs, token?: CancellationToken): Promise<Proto.ApplyCodeActionCommandResponse>;
	execute(command: 'organizeImports', args: Proto.OrganizeImportsRequestArgs, token?: CancellationToken): Promise<Proto.OrganizeImportsResponse>;
	execute(command: 'getOutliningSpans', args: Proto.FileRequestArgs, token: CancellationToken): Promise<Proto.OutliningSpansResponse>;
	execute(command: 'getEditsForFileRename', args: Proto.GetEditsForFileRenameRequestArgs): Promise<Proto.GetEditsForFileRenameResponse>;
	execute(command: 'jsxClosingTag', args: Proto.JsxClosingTagRequestArgs, token: CancellationToken): Promise<Proto.JsxClosingTagResponse>;
	execute(command: string, args: any, expectedResult: boolean | CancellationToken, token?: CancellationToken): Promise<any>;

	executeAsync(command: 'geterr', args: Proto.GeterrRequestArgs, token: CancellationToken): Promise<any>;
}