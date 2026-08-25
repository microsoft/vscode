/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { CopilotTelemetryAssignmentContext } from '../../node/copilot/copilotTelemetryAssignmentContext.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly experimentProperties: Array<{ name: string; value: string }> = [];

	override setExperimentProperty(name?: string, value?: string): void {
		this.experimentProperties.push({ name: name ?? '', value: value ?? '' });
	}
}

suite('CopilotTelemetryAssignmentContext', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const notification = (assignmentContext?: string, secondaryAssignmentContext?: string): GitHubTelemetryNotification => ({
		sessionId: 'session',
		restricted: false,
		event: {
			kind: 'response.success',
			properties: { secondary_assignment_context: secondaryAssignmentContext },
			metrics: {},
			exp_assignment_context: assignmentContext,
		},
	});

	test('sets telemetry-wide assignment contexts from forwarded notifications', () => {
		const telemetryService = new RecordingTelemetryService();
		const context = new CopilotTelemetryAssignmentContext(telemetryService);

		context.update(notification('primary:1', 'secondary:1'));
		context.update(notification('primary:1', 'secondary:1'));
		context.update(notification(undefined, 'secondary:2'));

		assert.deepStrictEqual(telemetryService.experimentProperties, [
			{ name: 'abexp.assignmentcontext', value: 'primary:1' },
			{ name: 'secondary_assignment_context', value: 'secondary:1' },
			{ name: 'secondary_assignment_context', value: 'secondary:2' },
		]);
	});

	test('ignores malformed assignment contexts', () => {
		const telemetryService = new RecordingTelemetryService();
		const context = new CopilotTelemetryAssignmentContext(telemetryService);

		context.update(notification('invalid', 'secondary:1'));
		context.update(notification('primary:1', 'invalid'));

		assert.deepStrictEqual(telemetryService.experimentProperties, [
			{ name: 'secondary_assignment_context', value: 'secondary:1' },
			{ name: 'abexp.assignmentcontext', value: 'primary:1' },
		]);
	});
});
