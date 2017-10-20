/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancellationToken, Uri, Event } from 'vscode';
import * as Proto from './protocol';
import API from './utils/api';
import { TypeScriptServerPlugin } from './utils/plugins';

export interface ITypescriptServiceClientHost {
	syntaxDiagnosticsReceived(event: Proto.DiagnosticEvent): void;
	semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void;
	configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void;
	populateService(): void;
}


export interface ITypescriptServiceClient {
	normalizePath(resource: Uri): string | null;
	asUrl(filepath: string): Uri;
	getWorkspaceRootForResource(resource: Uri): string | undefined;

	warn(message: string, data?: any): void;

	onTsServerStarted: Event<void>;

	onProjectLanguageServiceStateChanged: Event<Proto.ProjectLanguageServiceStateEventBody>;
	onDidBeginInstallTypings: Event<Proto.BeginInstallTypesEventBody>;
	onDidEndInstallTypings: Event<Proto.EndInstallTypesEventBody>;
	onTypesInstallerInitializationFailed: Event<Proto.TypesInstallerInitializationFailedEventBody>;

	logTelemetry(eventName: string, properties?: { [prop: string]: string }): void;

	apiVersion: API;

	plugins: TypeScriptServerPlugin[];

	execute(command: 'configure', args: Proto.ConfigureRequestArguments, token?: CancellationToken): Promise<Proto.ConfigureResponse>;
	execute(command: 'open', args: Proto.OpenRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'close', args: Proto.FileRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'change', args: Proto.ChangeRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'geterr', args: Proto.GeterrRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'quickinfo', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.QuickInfoResponse>;
	execute(command: 'completions', args: Proto.CompletionsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionsResponse>;
	execute(command: 'completionEntryDetails', args: Proto.CompletionDetailsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionDetailsResponse>;
	execute(command: 'signatureHelp', args: Proto.SignatureHelpRequestArgs, token?: CancellationToken): Promise<Proto.SignatureHelpResponse>;
	execute(command: 'definition', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.DefinitionResponse>;
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
	execute(command: 'docCommentTemplate', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.DocCommandTemplateResponse>;
	execute(command: 'getApplicableRefactors', args: Proto.GetApplicableRefactorsRequestArgs, token?: CancellationToken): Promise<Proto.GetApplicableRefactorsResponse>;
	execute(command: 'getEditsForRefactor', args: Proto.GetEditsForRefactorRequestArgs, token?: CancellationToken): Promise<Proto.GetEditsForRefactorResponse>;
	// execute(command: 'compileOnSaveAffectedFileList', args: Proto.CompileOnSaveEmitFileRequestArgs, token?: CancellationToken): Promise<Proto.CompileOnSaveAffectedFileListResponse>;
	// execute(command: 'compileOnSaveEmitFile', args: Proto.CompileOnSaveEmitFileRequestArgs, token?: CancellationToken): Promise<any>;
	execute(command: string, args: any, expectedResult: boolean | CancellationToken, token?: CancellationToken): Promise<any>;
}