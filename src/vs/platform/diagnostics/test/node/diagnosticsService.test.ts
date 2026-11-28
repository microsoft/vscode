/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkspaceStats } from '../../common/diagnostics.js';
import { DiagnosticsService } from '../../node/diagnosticsService.js';

suite('DiagnosticsService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('formatWorkspaceStats omits Conf files section when empty (#349105)', () => {
		const formatWorkspaceStats: (stats: WorkspaceStats) => string = (DiagnosticsService.prototype as unknown as { formatWorkspaceStats: (stats: WorkspaceStats) => string }).formatWorkspaceStats;

		const statsWithoutConfigs: WorkspaceStats = {
			fileTypes: [{ name: 'ts', count: 5 }],
			configFiles: [],
			fileCount: 5,
			maxFilesReached: false,
			launchConfigFiles: [],
			totalScanTime: 10,
			totalReaddirCount: 5
		};

		const outputWithoutConfigs = formatWorkspaceStats(statsWithoutConfigs);
		assert.strictEqual(outputWithoutConfigs.includes('Conf files:'), false);
		assert.strictEqual(outputWithoutConfigs.includes('File types: ts(5)'), true);

		const statsWithConfigs: WorkspaceStats = {
			fileTypes: [{ name: 'ts', count: 5 }],
			configFiles: [{ name: 'package.json', count: 1 }],
			fileCount: 6,
			maxFilesReached: false,
			launchConfigFiles: [],
			totalScanTime: 12,
			totalReaddirCount: 6
		};

		const outputWithConfigs = formatWorkspaceStats(statsWithConfigs);
		assert.strictEqual(outputWithConfigs.includes('Conf files: package.json(1)'), true);
	});
});
