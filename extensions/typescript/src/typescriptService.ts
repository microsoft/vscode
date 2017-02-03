/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CancellationToken, Uri, Event } from 'vscode';
import * as Proto from './protocol';
import * as semver from 'semver';

export interface ITypescriptServiceClientHost {
	syntaxDiagnosticsReceived(event: Proto.DiagnosticEvent): void;
	semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void;
	configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void;
	populateService(): void;
}

export class API {

	private _version: string;

	constructor(private _versionString: string) {
		this._version = semver.valid(_versionString);
		if (!this._version) {
			this._version = '1.0.0';
		} else {
			// Cut of any prerelease tag since we sometimes consume those
			// on purpose.
			let index = _versionString.indexOf('-');
			if (index >= 0) {
				this._version = this._version.substr(0, index);
			}
		}
	}

	public get versionString(): string {
		return this._versionString;
	}

	public has203Features(): boolean {
		return semver.gte(this._version, '2.0.3');
	}

	public has206Features(): boolean {
		return semver.gte(this._version, '2.0.6');
	}

	public has208Features(): boolean {
		return semver.gte(this._version, '2.0.8');
	}

	public has213Features(): boolean {
		return semver.gte(this._version, '2.1.3');
	}

	public has220Features(): boolean {
		return semver.gte(this._version, '2.2.0');
	}
}

export interface ITypescriptServiceClient {
	normalizePath(resource: Uri): string | null;
	asUrl(filepath: string): Uri;

	info(message: string, data?: any): void;
	warn(message: string, data?: any): void;
	error(message: string, data?: any): void;

	onProjectLanguageServiceStateChanged: Event<Proto.ProjectLanguageServiceStateEventBody>;
	onDidBeginInstallTypings: Event<Proto.BeginInstallTypesEventBody>;
	onDidEndInstallTypings: Event<Proto.EndInstallTypesEventBody>;

	logTelemetry(eventName: string, properties?: { [prop: string]: string }): void;

	experimentalAutoBuild: boolean;
	apiVersion: API;
	checkGlobalTSCVersion: boolean;

	execute(command: 'configure', args: Proto.ConfigureRequestArguments, token?: CancellationToken): Promise<Proto.ConfigureResponse>;
	execute(command: 'open', args: Proto.OpenRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'close', args: Proto.FileRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'change', args: Proto.ChangeRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'geterr', args: Proto.GeterrRequestArgs, expectedResult: boolean, token?: CancellationToken): Promise<any>;
	execute(command: 'quickinfo', args: Proto.FileLocationRequestArgs, token?: CancellationToken): Promise<Proto.QuickInfoResponse>;
	execute(command: 'completions', args: Proto.CompletionsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionsResponse>;
	execute(commant: 'completionEntryDetails', args: Proto.CompletionDetailsRequestArgs, token?: CancellationToken): Promise<Proto.CompletionDetailsResponse>;
	execute(commant: 'signatureHelp', args: Proto.SignatureHelpRequestArgs, token?: CancellationToken): Promise<Proto.SignatureHelpResponse>;
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
	// execute(command: 'compileOnSaveAffectedFileList', args: Proto.CompileOnSaveEmitFileRequestArgs, token?: CancellationToken): Promise<Proto.CompileOnSaveAffectedFileListResponse>;
	// execute(command: 'compileOnSaveEmitFile', args: Proto.CompileOnSaveEmitFileRequestArgs, token?: CancellationToken): Promise<any>;
	execute(command: string, args: any, expectedResult: boolean | CancellationToken, token?: CancellationToken): Promise<any>;
}