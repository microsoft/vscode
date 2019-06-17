/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IRemoteDiagnosticInfo, IRemoteDiagnosticError } from 'vs/platform/diagnostics/common/diagnosticsService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { UriComponents } from 'vs/base/common/uri';

export const ID = 'launchService';
export const ILaunchService = createDecorator<ILaunchService>(ID);

export interface IWindowInfo {
	pid: number;
	title: string;
	folderURIs: UriComponents[];
	remoteAuthority?: string;
}

export interface IMainProcessInfo {
	mainPID: number;
	// All arguments after argv[0], the exec path
	mainArguments: string[];
	windows: IWindowInfo[];
	screenReader: boolean;
	gpuFeatureStatus: any;
}

export interface IRemoteDiagnosticOptions {
	includeProcesses?: boolean;
	includeWorkspaceMetadata?: boolean;
}

export interface ILaunchService {
	_serviceBrand: any;
	start(args: ParsedArgs, userEnv: IProcessEnvironment): Promise<void>;
	getMainProcessId(): Promise<number>;
	getMainProcessInfo(): Promise<IMainProcessInfo>;
	getLogsPath(): Promise<string>;
	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]>;
}