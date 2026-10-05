/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationDialogTelemetry, logAutomationViewShown, withAutomationDialogPersistenceTelemetry } from '../../browser/automationTelemetry.js';

function isTelemetryData(data: unknown): data is Record<string, unknown> {
	return typeof data === 'object' && data !== null;
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName && isTelemetryData(data)) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('Automation telemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports identifier-free view and dialog funnel outcomes once', async () => {
		const telemetryService = new TestTelemetryService();
		logAutomationViewShown(telemetryService);
		const dialog = new AutomationDialogTelemetry(telemetryService, 'create');
		dialog.validationFailed();
		dialog.validationFailed();
		dialog.captureFailed();
		dialog.captureFailed();
		dialog.complete(false);
		dialog.complete(true);
		await assert.rejects(withAutomationDialogPersistenceTelemetry(telemetryService, 'update', async () => {
			throw new Error('storage unavailable');
		}), /storage unavailable/);

		assert.deepStrictEqual(telemetryService.events, [
			{ name: 'automation.viewShown', data: { surface: 'agentsWindow' } },
			{ name: 'automation.newInitiated', data: { surface: 'agentsWindow' } },
			{ name: 'automation.dialogOutcome', data: { operation: 'create', outcome: 'validationFailed' } },
			{ name: 'automation.dialogOutcome', data: { operation: 'create', outcome: 'captureFailed' } },
			{ name: 'automation.dialogOutcome', data: { operation: 'create', outcome: 'cancelled' } },
			{ name: 'automation.dialogOutcome', data: { operation: 'update', outcome: 'persistenceFailed' } },
		]);
	});
});
