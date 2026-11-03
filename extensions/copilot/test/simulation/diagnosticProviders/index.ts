/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITestingServicesAccessor } from '../../../src/platform/test/node/services';
import { DiagnosticProviderId } from '../types';
import { IFile, ITestDiagnostic } from './diagnosticsProvider';
import { PyrightDiagnosticsProvider } from './python';
import { TSServerDiagnosticsProvider } from './tsc';

export class KnownDiagnosticProviders {
	public static readonly tsc = new TSServerDiagnosticsProvider();
	public static readonly tscIgnoreImportErrors = new TSServerDiagnosticsProvider({ ignoreImportErrors: true });
	public static readonly pyright = new PyrightDiagnosticsProvider();
}

export function getDiagnostics(accessor: ITestingServicesAccessor, files: IFile[], providerId: DiagnosticProviderId): Promise<ITestDiagnostic[]> {
	const provider = KnownDiagnosticProviders[providerId];
	return provider.getDiagnostics(accessor, files);
}
