/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ProcessItem } from '../../../../base/common/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ByteSize } from '../../../files/common/files.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IMainProcessDiagnostics } from '../../common/diagnostics.js';
import { DiagnosticsService } from '../../node/diagnosticsService.js';

suite('DiagnosticsService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats ProcessItem memory as bytes on every platform', () => {
		const service = new DiagnosticsService(NullTelemetryService, { applicationName: 'code' } as IProductService);
		const diagnostics = {
			mainPID: 123,
			windows: [],
			pidToNames: []
		} as unknown as IMainProcessDiagnostics;
		const rootProcess: ProcessItem = {
			name: 'code',
			cmd: 'code',
			pid: 123,
			ppid: 1,
			load: 0,
			mem: 512 * ByteSize.MB
		};
		const formatProcessList = (service as unknown as {
			formatProcessList(info: IMainProcessDiagnostics, rootProcess: ProcessItem): string;
		}).formatProcessList.bind(service);

		assert.strictEqual(formatProcessList(diagnostics, rootProcess), [
			'CPU %\tMem MB\t   PID\tProcess',
			'    0\t   512\t   123\tcode'
		].join('\n'));
	});
});
