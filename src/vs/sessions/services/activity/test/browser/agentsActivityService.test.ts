/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsActivityService } from '../../browser/agentsActivityService.js';

suite('AgentsActivityService', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): { service: AgentsActivityService; events: { readonly eventName: string; readonly data: Record<string, unknown> }[] } {
		const events: { readonly eventName: string; readonly data: Record<string, unknown> }[] = [];
		const telemetryService = upcastPartial<ITelemetryService>({
			publicLog2: ((eventName: string, data?: Record<string, unknown>) => { events.push({ eventName, data: data ?? {} }); }) as ITelemetryService['publicLog2'],
		});
		const service = disposables.add(new AgentsActivityService(telemetryService));
		return { service, events };
	}

	test('emits a start checkpoint on construction', () => {
		const { events } = createService();
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].eventName, 'agents/activeContextChanged');
		assert.strictEqual(events[0].data.transitionCause, 'open');
		assert.strictEqual(events[0].data.fromSurface, 'none');
		assert.strictEqual(events[0].data.toSurface, 'none');
	});

	test('emits focus then switch transitions with previous-surface dwell', () => {
		const { service, events } = createService();
		service.reportActiveSurface('inbox', { agentSessionId: 'hash-a', providerId: 'local-agent-host', surfaceInstanceId: 'inbox-1' });
		service.reportActiveSurface('sessionChat', { agentSessionId: 'hash-b', providerId: 'local-agent-host', surfaceInstanceId: 'chat-1' });

		const transitions = events.filter(event => event.eventName === 'agents/activeContextChanged');
		// [0] start checkpoint, [1] none->inbox (focus), [2] inbox->sessionChat (switch)
		assert.strictEqual(transitions[1].data.fromSurface, 'none');
		assert.strictEqual(transitions[1].data.toSurface, 'inbox');
		assert.strictEqual(transitions[1].data.transitionCause, 'focus');
		assert.strictEqual(transitions[1].data.contextAgentSessionId, 'hash-a');

		assert.strictEqual(transitions[2].data.fromSurface, 'inbox');
		assert.strictEqual(transitions[2].data.toSurface, 'sessionChat');
		assert.strictEqual(transitions[2].data.transitionCause, 'switch');
		assert.strictEqual(transitions[2].data.contextAgentSessionId, 'hash-b');
		assert.ok(typeof transitions[2].data.previousFocusedDwellMs === 'number' && (transitions[2].data.previousFocusedDwellMs as number) >= 0);
	});

	test('coalesces re-report of the same surface and context', () => {
		const { service, events } = createService();
		service.reportActiveSurface('inbox', { surfaceInstanceId: 'inbox-1' });
		const before = events.length;
		service.reportActiveSurface('inbox', { surfaceInstanceId: 'inbox-1' });
		assert.strictEqual(events.length, before, 'a no-op re-report should not emit a transition');
	});

	test('blur emits a transition to none only after the debounce with no new focus', async () => {
		const { service, events } = createService();
		service.reportActiveSurface('inbox', { surfaceInstanceId: 'inbox-1' });
		const countBeforeBlur = events.length;
		service.reportSurfaceBlurred('inbox');
		// Synchronously, no blur transition yet (debounced).
		assert.strictEqual(events.length, countBeforeBlur);
		await new Promise(resolve => setTimeout(resolve, 5));
		const last = events[events.length - 1];
		assert.strictEqual(last.data.fromSurface, 'inbox');
		assert.strictEqual(last.data.toSurface, 'none');
		assert.strictEqual(last.data.transitionCause, 'blur');
	});

	test('a focus that follows a blur cancels the pending blur (no none transition)', async () => {
		const { service, events } = createService();
		service.reportActiveSurface('inbox', { surfaceInstanceId: 'inbox-1' });
		service.reportSurfaceBlurred('inbox');
		service.reportActiveSurface('sessionChat', { surfaceInstanceId: 'chat-1' });
		await new Promise(resolve => setTimeout(resolve, 5));
		const noneTransitions = events.filter(event => event.data.toSurface === 'none' && event.data.transitionCause === 'blur');
		assert.strictEqual(noneTransitions.length, 0, 'the pending blur should have been cancelled by the subsequent focus');
	});
});
