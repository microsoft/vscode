/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITestingServicesAccessor } from '../../../src/platform/test/node/services';
import { DiagnosticProviderId } from '../types';
import { CppDiagnosticsProvider } from './cpp';
import { IFile, ITestDiagnostic } from './diagnosticsProvider';
import { EslintDiagnosticsProvider } from './eslint';
import { PylintDiagnosticsProvider, PyrightDiagnosticsProvider } from './python';
import { RoslynDiagnosticsProvider } from './roslyn';
import { RuffDiagnosticsProvider } from './ruff';
import { TSServerDiagnosticsProvider } from './tsc';

export class KnownDiagnosticProviders {
	public static readonly tsc = new TSServerDiagnosticsProvider();
	public static readonly tscIgnoreImportErrors = new TSServerDiagnosticsProvider({ ignoreImportErrors: true });
	public static readonly eslint = new EslintDiagnosticsProvider();
	public static readonly pyright = new PyrightDiagnosticsProvider();
	public static readonly pylint = new PylintDiagnosticsProvider();
	public static readonly roslyn = new RoslynDiagnosticsProvider();
	public static readonly cpp = new CppDiagnosticsProvider();
	public static readonly ruff = new RuffDiagnosticsProvider();
}

export function getDiagnostics(accessor: ITestingServicesAccessor, files: IFile[], providerId: DiagnosticProviderId): Promise<ITestDiagnostic[]> {
	const provider = KnownDiagnosticProviders[providerId];
	return provider.getDiagnostics(accessor, files);
}
