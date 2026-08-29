/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { CopilotSecondaryAssignmentContext } from '../../node/copilot/copilotSecondaryAssignmentContext.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly experimentProperties: Array<{ name: string; value: string }> = [];

	override setExperimentProperty(name?: string, value?: string): void {
		this.experimentProperties.push({ name: name ?? '', value: value ?? '' });
	}
}

suite('CopilotSecondaryAssignmentContext', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const notification = (secondaryAssignmentContext?: string): GitHubTelemetryNotification => ({
		sessionId: 'session',
		restricted: false,
		event: {
			kind: 'response.success',
			properties: { secondary_assignment_context: secondaryAssignmentContext },
			metrics: {},
		},
	});

	test('sets the telemetry-wide secondary assignment context from forwarded notifications', () => {
		const telemetryService = new RecordingTelemetryService();
		const context = new CopilotSecondaryAssignmentContext(telemetryService);

		context.update(notification('secondary:1'));
		context.update(notification('secondary:1'));
		context.update(notification('secondary:2'));

		assert.deepStrictEqual(telemetryService.experimentProperties, [
			{ name: 'secondary_assignment_context', value: 'secondary:1' },
			{ name: 'secondary_assignment_context', value: 'secondary:2' },
		]);
	});

	test('ignores a malformed secondary assignment context', () => {
		const telemetryService = new RecordingTelemetryService();
		const context = new CopilotSecondaryAssignmentContext(telemetryService);

		context.update(notification('invalid'));
		context.update(notification('secondary:1'));

		assert.deepStrictEqual(telemetryService.experimentProperties, [
			{ name: 'secondary_assignment_context', value: 'secondary:1' },
		]);
	});
});
