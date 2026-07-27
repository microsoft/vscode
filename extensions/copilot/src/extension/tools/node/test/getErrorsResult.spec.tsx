/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { ILanguageDiagnosticsService } from '../../../../platform/languages/common/languageDiagnosticsService';
import { TestLanguageDiagnosticsService } from '../../../../platform/languages/common/testLanguageDiagnosticsService';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../../util/common/languages';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { DiagnosticSeverity, Range } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { DiagnosticToolOutput } from '../getErrorsTool';
import { renderElementToString } from './toolTestUtils';

suite('GetErrorsResult', () => {
	let accessor: ITestingServicesAccessor;
	let collection: TestingServiceCollection;
	let diagnosticsService: TestLanguageDiagnosticsService;

	// Avoid creating windows paths
	const workspaceFolder = URI.file('/test/workspace');
	const tsDocUri = URI.file('/test/workspace/file.ts');
	const tsDoc = createTextDocumentData(tsDocUri, 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;
	const tsDocUri2 = URI.file('/test/workspace/file2.ts');
	const tsDoc2 = createTextDocumentData(tsDocUri2, 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;

	beforeEach(() => {
		collection = createExtensionUnitTestingServices();
		collection.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService, [[workspaceFolder], [tsDoc, tsDoc2]]));
		diagnosticsService = new TestLanguageDiagnosticsService();
		collection.define(ILanguageDiagnosticsService, diagnosticsService);
		accessor = collection.createTestingAccessor();
	});

	afterEach(() => {
		accessor.dispose();
	});

	async function getDiagnostics(uri: URI) {
		const document = await accessor.get(IWorkspaceService).openTextDocumentAndSnapshot(uri);
		const tsDocDiagnostics = {
			context: {
				document,
				language: getLanguage(document)
			},
			diagnostics: [
				{
					message: 'error',
					range: new Range(0, 0, 0, 2),
					severity: DiagnosticSeverity.Error
				},
				{
					message: 'error 2',
					range: new Range(1, 0, 1, 2),
					severity: DiagnosticSeverity.Error
				},
			],
			uri
		};
		return tsDocDiagnostics;
	}

	test('simple diagnostics', async () => {
		const element = <DiagnosticToolOutput
			diagnosticsGroups={[await getDiagnostics(tsDocUri)]}
		/>;

		expect(await renderElementToString(accessor, element)).toMatchSnapshot();
	});

	test('diagnostics with max', async () => {
		const element = <DiagnosticToolOutput
			diagnosticsGroups={[await getDiagnostics(tsDocUri)]}
			maxDiagnostics={1}
		/>;

		expect(await renderElementToString(accessor, element)).toMatchSnapshot();
	});

	test('diagnostics with more complex max', async () => {
		const element = <DiagnosticToolOutput
			diagnosticsGroups={[await getDiagnostics(tsDocUri), await getDiagnostics(tsDocUri2)]}
			maxDiagnostics={3}
		/>;

		expect(await renderElementToString(accessor, element)).toMatchSnapshot();
	});
});
