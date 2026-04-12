/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { createInstanceCapabilityEventMultiplexer } from '../../browser/terminalEvents.js';
// Mock implementations for testing
class MockCwdDetectionCapability {
    constructor() {
        this.type = 0 /* TerminalCapability.CwdDetection */;
        this.cwds = [];
        this._onDidChangeCwd = new Emitter();
        this.onDidChangeCwd = this._onDidChangeCwd.event;
    }
    getCwd() {
        return this.cwds[this.cwds.length - 1] || '';
    }
    updateCwd(cwd) {
        this.cwds.push(cwd);
        this._onDidChangeCwd.fire(cwd);
    }
    fireEvent(cwd) {
        this.updateCwd(cwd);
    }
    dispose() {
        this._onDidChangeCwd.dispose();
    }
}
function createMockTerminalInstance(instanceId, capabilities) {
    const instance = {
        instanceId,
        capabilities
    };
    return instance;
}
suite('Terminal Events', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    suite('createInstanceCapabilityEventMultiplexer', () => {
        test('should handle existing instances with capabilities', () => {
            const capability = store.add(new MockCwdDetectionCapability());
            const capabilities = store.add(new TerminalCapabilityStore());
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            const instance = createMockTerminalInstance(1, capabilities);
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventFired = false;
            let capturedData;
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
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventFired = false;
            store.add(multiplexer.event(() => {
                eventFired = true;
            }));
            strictEqual(eventFired, false, 'No event should be fired for instances without capabilities');
        });
        test('should handle adding new instances', () => {
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventFired = false;
            let capturedData;
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
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            // Fire an event from the capability
            capability.fireEvent('new-instance-data');
            strictEqual(eventFired, true, 'Event should be fired from new instance');
            strictEqual(capturedData?.instance, instance, 'Event should contain correct new instance');
            strictEqual(capturedData?.data, 'new-instance-data', 'Event should contain correct data');
        });
        test('should handle removing instances', () => {
            const capability = store.add(new MockCwdDetectionCapability());
            const capabilities = store.add(new TerminalCapabilityStore());
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            const instance = createMockTerminalInstance(3, capabilities);
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
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
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventFired = false;
            let capturedData;
            store.add(multiplexer.event(e => {
                eventFired = true;
                capturedData = e;
            }));
            // Add capability to existing instance
            const capability = store.add(new MockCwdDetectionCapability());
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            // Fire an event from the newly added capability
            capability.fireEvent('added-capability-data');
            strictEqual(eventFired, true, 'Event should be fired from newly added capability');
            strictEqual(capturedData?.instance, instance, 'Event should contain correct instance');
            strictEqual(capturedData?.data, 'added-capability-data', 'Event should contain correct data');
        });
        test('should handle removing capabilities from existing instances', () => {
            const capability = store.add(new MockCwdDetectionCapability());
            const capabilities = store.add(new TerminalCapabilityStore());
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            const instance = createMockTerminalInstance(5, capabilities);
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventCount = 0;
            store.add(multiplexer.event(() => {
                eventCount++;
            }));
            // Fire event before removing capability
            capability.fireEvent('before-capability-removal');
            strictEqual(eventCount, 1, 'Event should be fired before capability removal');
            // Remove the capability
            capabilities.remove(0 /* TerminalCapability.CwdDetection */); // Fire event after capability removal - should not be received
            capability.fireEvent('after-capability-removal');
            strictEqual(eventCount, 1, 'Event should not be fired after capability removal');
        });
        test('should handle multiple instances with same capability', () => {
            const capability1 = store.add(new MockCwdDetectionCapability());
            const capability2 = store.add(new MockCwdDetectionCapability());
            const capabilities1 = store.add(new TerminalCapabilityStore());
            const capabilities2 = store.add(new TerminalCapabilityStore());
            capabilities1.add(0 /* TerminalCapability.CwdDetection */, capability1);
            capabilities2.add(0 /* TerminalCapability.CwdDetection */, capability2);
            const instance1 = createMockTerminalInstance(6, capabilities1);
            const instance2 = createMockTerminalInstance(7, capabilities2);
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([instance1, instance2], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            const events = [];
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
            capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
            const instance = createMockTerminalInstance(8, capabilities);
            const onAddInstance = testStore.add(new Emitter());
            const onRemoveInstance = testStore.add(new Emitter());
            const multiplexer = testStore.add(createInstanceCapabilityEventMultiplexer([instance], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
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
            const onAddInstance = store.add(new Emitter());
            const onRemoveInstance = store.add(new Emitter());
            const multiplexer = store.add(createInstanceCapabilityEventMultiplexer([], onAddInstance.event, onRemoveInstance.event, 0 /* TerminalCapability.CwdDetection */, (cap) => cap.onDidChangeCwd));
            let eventFired = false;
            store.add(multiplexer.event(() => {
                eventFired = true;
            }));
            // No instances, so no events should be fired initially
            strictEqual(eventFired, false, 'No events should be fired with empty instances array');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFdmVudHMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbEV2ZW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRkFBaUYsQ0FBQztBQUMxSCxPQUFPLEVBQUUsd0NBQXdDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUczRixtQ0FBbUM7QUFDbkMsTUFBTSwwQkFBMEI7SUFBaEM7UUFDVSxTQUFJLDJDQUFtQztRQUN2QyxTQUFJLEdBQWEsRUFBRSxDQUFDO1FBRVosb0JBQWUsR0FBRyxJQUFJLE9BQU8sRUFBVSxDQUFDO1FBQ2hELG1CQUFjLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUM7SUFrQnRELENBQUM7SUFoQkEsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDOUMsQ0FBQztJQUVELFNBQVMsQ0FBQyxHQUFXO1FBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxT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