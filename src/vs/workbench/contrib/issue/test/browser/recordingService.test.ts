/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserRecordingService, RecordingState, ScreenCapturePermissionStatus, shouldShowScreenCapturePermissionSettings } from '../../browser/recordingService.js';

suite('Issue reporter recording permission guidance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const status of ['not-determined', 'denied', 'restricted', 'unknown', 'granted'] satisfies ScreenCapturePermissionStatus[]) {
		test(`${status} first request and retry`, () => {
			assert.deepStrictEqual([
				shouldShowScreenCapturePermissionSettings(status, false),
				shouldShowScreenCapturePermissionSettings(status, true),
			], [status === 'restricted', status !== 'granted']);
		});
	}

	test('web fallback does not introduce OS permission UI or recording support', async () => {
		const service = new BrowserRecordingService();
		await assert.rejects(service.startRecording(), /not supported/);
		await service.openScreenCapturePermissionSettings();
		assert.deepStrictEqual({
			supported: service.isSupported, state: service.state, formats: service.getSupportedFormats(),
			permission: await service.getScreenCapturePermissionStatus(), granted: await service.requestScreenCapturePermission(), data: await service.stopRecording(),
		}, { supported: false, state: RecordingState.Idle, formats: [], permission: 'granted', granted: true, data: undefined });
	});
});
