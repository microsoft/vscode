/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICwdDetectionCapability, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { createInstanceCapabilityEventMultiplexer } from '../../browser/terminalEvents.js';
import { ITerminalInstance } from '../../browser/terminal.js';

// Mock implementations for testing
class MockCwdDetectionCapability implements ICwdDetectionCapability {
	readonly type = TerminalCapability.CwdDetection;
	readonly cwds: string[] = [];

	private readonly _onDidChangeCwd = new Emitter<string>();
	readonly onDidChangeCwd = this._onDidChangeCwd.event;

	getCwd(): string {
		return this.cwds[this.cwds.length - 1] || '';
	}

	updateCwd(cwd: string): void {
		this.cwds.push(cwd);
		this._onDidChangeCwd.fire(cwd);
	}

	fireEvent(cwd: string): void {
		this.updateCwd(cwd);
	}

	dispose(): void {
		this._onDidChangeCwd.dispose();
	}
}



function createMockTerminalInstance(instanceId: number, capabilities: TerminalCapabilityStore): ITerminalInstance {
	const instance = {
		instanceId,
		capabilities
	} as unknown as ITerminalInstance;
	return instance;
}

suite('Terminal Events', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('createInstanceCapabilityEventMultiplexer', () => {
		test('should handle existing instances with capabilities', () => {
			const capability = store.add(new MockCwdDetectionCapability());
			const capabilities = store.add(new TerminalCapabilityStore());
			capabilities.add(TerminalCapability.CwdDetection, capability);
			const instance = createMockTerminalInstance(1, capabilities);

			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventFired = false;
			let capturedData: { instance: ITerminalInstance; data: string } | undefined;

			store.add(multiplexer.event(e => {
				eventFired = true;
				capturedData = e;
			}));

			capability.fireEvent('test-data');

			strictEqual(eventFired, true, 'Event should be fired');
			strictEqual(capturedData?.instance, instance, 'Event should contain correct instance');
			strictEqual(capturedData?.data, 'test-data', 'Event should contain correct data');
		});

		test('should handle instances without capabilities', () => {
			const capabilities = store.add(new TerminalCapabilityStore());
			const instance = createMockTerminalInstance(1, capabilities);
			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventFired = false;
			store.add(multiplexer.event(() => {
				eventFired = true;
			}));

			strictEqual(eventFired, false, 'No event should be fired for instances without capabilities');
		});

		test('should handle adding new instances', () => {
			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventFired = false;
			let capturedData: { instance: ITerminalInstance; data: string } | undefined;

			store.add(multiplexer.event(e => {
				eventFired = true;
				capturedData = e;
			}));

			// Add a new instance with capability
			const capability = store.add(new MockCwdDetectionCapability());
			const capabilities = store.add(new TerminalCapabilityStore());
			const instance = createMockTerminalInstance(2, capabilities);

			onAddInstance.fire(instance);

			// Add capability to the instance after it's added to the multiplexer
			capabilities.add(TerminalCapability.CwdDetection, capability);

			// Fire an event from the capability
			capability.fireEvent('new-instance-data');

			strictEqual(eventFired, true, 'Event should be fired from new instance');
			strictEqual(capturedData?.instance, instance, 'Event should contain correct new instance');
			strictEqual(capturedData?.data, 'new-instance-data', 'Event should contain correct data');
		});

		test('should handle removing instances', () => {
			const capability = store.add(new MockCwdDetectionCapability());
			const capabilities = store.add(new TerminalCapabilityStore());
			capabilities.add(TerminalCapability.CwdDetection, capability);
			const instance = createMockTerminalInstance(3, capabilities);

			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventCount = 0;
			store.add(multiplexer.event(() => {
				eventCount++;
			}));

			// Fire event before removal
			capability.fireEvent('before-removal');
			strictEqual(eventCount, 1, 'Event should be fired before removal');

			// Remove the instance
			onRemoveInstance.fire(instance);

			// Fire event after removal - should not be received
			capability.fireEvent('after-removal');
			strictEqual(eventCount, 1, 'Event should not be fired after instance removal');
		});

		test('should handle adding capabilities to existing instances', () => {
			const capabilities = store.add(new TerminalCapabilityStore());
			const instance = createMockTerminalInstance(4, capabilities);
			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventFired = false;
			let capturedData: { instance: ITerminalInstance; data: string } | undefined;

			store.add(multiplexer.event(e => {
				eventFired = true;
				capturedData = e;
			}));

			// Add capability to existing instance
			const capability = store.add(new MockCwdDetectionCapability());
			capabilities.add(TerminalCapability.CwdDetection, capability);

			// Fire an event from the newly added capability
			capability.fireEvent('added-capability-data');

			strictEqual(eventFired, true, 'Event should be fired from newly added capability');
			strictEqual(capturedData?.instance, instance, 'Event should contain correct instance');
			strictEqual(capturedData?.data, 'added-capability-data', 'Event should contain correct data');
		});

		test('should handle removing capabilities from existing instances', () => {
			const capability = store.add(new MockCwdDetectionCapability());
			const capabilities = store.add(new TerminalCapabilityStore());
			capabilities.add(TerminalCapability.CwdDetection, capability);
			const instance = createMockTerminalInstance(5, capabilities);

			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventCount = 0;
			store.add(multiplexer.event(() => {
				eventCount++;
			}));

			// Fire event before removing capability
			capability.fireEvent('before-capability-removal');
			strictEqual(eventCount, 1, 'Event should be fired before capability removal');

			// Remove the capability
			capabilities.remove(TerminalCapability.CwdDetection);			// Fire event after capability removal - should not be received
			capability.fireEvent('after-capability-removal');
			strictEqual(eventCount, 1, 'Event should not be fired after capability removal');
		});

		test('should handle multiple instances with same capability', () => {
			const capability1 = store.add(new MockCwdDetectionCapability());
			const capability2 = store.add(new MockCwdDetectionCapability());
			const capabilities1 = store.add(new TerminalCapabilityStore());
			const capabilities2 = store.add(new TerminalCapabilityStore());
			capabilities1.add(TerminalCapability.CwdDetection, capability1);
			capabilities2.add(TerminalCapability.CwdDetection, capability2);
			const instance1 = createMockTerminalInstance(6, capabilities1);
			const instance2 = createMockTerminalInstance(7, capabilities2);

			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[instance1, instance2],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			const events: Array<{ instance: ITerminalInstance; data: string }> = [];
			store.add(multiplexer.event(e => {
				events.push(e);
			}));

			// Fire events from both capabilities
			capability1.fireEvent('data-from-instance1');
			capability2.fireEvent('data-from-instance2');

			strictEqual(events.length, 2, 'Both events should be received');
			strictEqual(events[0].instance, instance1, 'First event should be from instance1');
			strictEqual(events[0].data, 'data-from-instance1', 'First event should have correct data');
			strictEqual(events[1].instance, instance2, 'Second event should be from instance2');
			strictEqual(events[1].data, 'data-from-instance2', 'Second event should have correct data');
		});

		test('should properly dispose all resources', () => {
			const testStore = new DisposableStore();
			const capability = testStore.add(new MockCwdDetectionCapability());
			const capabilities = testStore.add(new TerminalCapabilityStore());
			capabilities.add(TerminalCapability.CwdDetection, capability);
			const instance = createMockTerminalInstance(8, capabilities);

			const onAddInstance = testStore.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = testStore.add(new Emitter<ITerminalInstance>());

			const multiplexer = testStore.add(createInstanceCapabilityEventMultiplexer(
				[instance],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventCount = 0;
			testStore.add(multiplexer.event(() => {
				eventCount++;
			}));

			// Fire event before disposal
			capability.fireEvent('before-disposal');
			strictEqual(eventCount, 1, 'Event should be fired before disposal');

			// Dispose everything
			testStore.dispose();

			// Fire event after disposal - should not be received
			capability.fireEvent('after-disposal');
			strictEqual(eventCount, 1, 'Event should not be fired after disposal');
		});

		test('should handle empty current instances array', () => {
			const onAddInstance = store.add(new Emitter<ITerminalInstance>());
			const onRemoveInstance = store.add(new Emitter<ITerminalInstance>());

			const multiplexer = store.add(createInstanceCapabilityEventMultiplexer(
				[],
				onAddInstance.event,
				onRemoveInstance.event,
				TerminalCapability.CwdDetection,
				(cap) => cap.onDidChangeCwd
			));

			let eventFired = false;
			store.add(multiplexer.event(() => {
				eventFired = true;
			}));

			// No instances, so no events should be fired initially
			strictEqual(eventFired, false, 'No events should be fired with empty instances array');
		});
	});
});
