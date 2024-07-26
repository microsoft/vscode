/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainProcessDiagnostics, IRemoteDiagnosticError, IRemoteDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ID = 'diagnosticsMainService';
export const IDiagnosticsMainService = createDecorator<IDiagnosticsMainService>(ID);

export interface IRemoteDiagnosticOptions {
	includeProcesses?: boolean;
	includeWorkspaceMetadata?: boolean;
}

export interface IDiagnosticsMainService {
	readonly _serviceBrand: undefined;
	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]>;
	getMainDiagnostics(): Promise<IMainProcessDiagnostics>;
}
