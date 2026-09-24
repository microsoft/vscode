/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { BuildInfo } from '../config';
import { collectCompletionDiagnostics, formatDiagnosticsAsMarkdown } from '../diagnostics';
import { TelemetryWithExp } from '../telemetry';
import { createLibTestingContext } from './context';

suite('collectCompletionDiagnostics', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	test('includes the opportunity ID alongside the telemetry fields', function () {
		const telemetry = TelemetryWithExp.createEmptyConfigForTesting();
		telemetry.properties.headerRequestId = 'header-123';
		telemetry.properties.choiceIndex = '0';
		// A stale value that must be ignored: the opportunity ID comes from the item, not from telemetry.
		telemetry.properties.opportunityId = 'stale-opportunity-id';
		telemetry.properties.clientCompletionId = 'client-abc';
		telemetry.properties.engineName = 'test-model';

		const report = collectCompletionDiagnostics(accessor, telemetry, 'icr-current-uuid');

		assert.deepStrictEqual(report.sections, [
			{
				name: 'Copilot Extension',
				items: {
					Version: BuildInfo.getVersion(),
					Editor: 'lib-tests-editor 1',
					'Opportunity ID': 'icr-current-uuid',
					'Header Request ID': 'header-123',
					'Choice Index': '0',
					'Client Completion ID': 'client-abc',
					'Model ID': 'test-model',
				},
			},
		]);
		assert.ok(formatDiagnosticsAsMarkdown(report).includes('- Opportunity ID: icr-current-uuid'));
	});

	test('includes the opportunity ID even when no telemetry is available', function () {
		const report = collectCompletionDiagnostics(accessor, undefined, 'icr-only');

		assert.deepStrictEqual(report.sections, [
			{
				name: 'Copilot Extension',
				items: {
					Version: BuildInfo.getVersion(),
					Editor: 'lib-tests-editor 1',
					'Opportunity ID': 'icr-only',
				},
			},
		]);
	});
});
