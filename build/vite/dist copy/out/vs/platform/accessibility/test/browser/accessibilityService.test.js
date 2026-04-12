/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { AccessibilityService } from '../../browser/accessibilityService.js';
suite('AccessibilityService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let configurationService;
    let container;
    function createService(config = {}) {
        const instantiationService = store.add(new TestInstantiationService());
        configurationService = new TestConfigurationService({
            'editor.accessibilitySupport': 'off',
            'workbench.reduceMotion': 'off',
            'workbench.reduceTransparency': 'off',
            'accessibility.underlineLinks': false,
            ...config,
        });
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
        container = document.createElement('div');
        instantiationService.stub(ILayoutService, {
            mainContainer: container,
            activeContainer: container,
            getContainer() { return container; },
            onDidLayoutContainer: Event.None,
        });
        return store.add(instantiationService.createInstance(AccessibilityService));
    }
    suite('isTransparencyReduced', () => {
        test('returns false when config is off', () => {
            const service = createService({ 'workbench.reduceTransparency': 'off' });
            assert.strictEqual(service.isTransparencyReduced(), false);
        });
        test('returns true when config is on', () => {
            const service = createService({ 'workbench.reduceTransparency': 'on' });
            assert.strictEqual(service.isTransparencyReduced(), true);
        });
        test('adds CSS class when config is on', () => {
            createService({ 'workbench.reduceTransparency': 'on' });
            assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), true);
        });
        test('does not add CSS class when config is off', () => {
            createService({ 'workbench.reduceTransparency': 'off' });
            assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), false);
        });
        test('fires event and updates class on config change', () => {
            const service = createService({ 'workbench.reduceTransparency': 'off' });
            assert.strictEqual(service.isTransparencyReduced(), false);
            let fired = false;
            store.add(service.onDidChangeReducedTransparency(() => { fired = true; }));
            // Simulate config change
            configurationService.setUserConfiguration('workbench.reduceTransparency', 'on');
            configurationService.onDidChangeConfigurationEmitter.fire({
                affectsConfiguration(id) { return id === 'workbench.reduceTransparency'; },
            });
            assert.strictEqual(fired, true);
            assert.strictEqual(service.isTransparencyReduced(), true);
            assert.strictEqual(container.classList.contains('monaco-reduce-transparency'), true);
        });
    });
    suite('isMotionReduced', () => {
        test('returns false when config is off', () => {
            const service = createService({ 'workbench.reduceMotion': 'off' });
            assert.strictEqual(service.isMotionReduced(), false);
        });
        test('returns true when config is on', () => {
            const service = createService({ 'workbench.reduceMotion': 'on' });
            assert.strictEqual(service.isMotionReduced(), true);
        });
        test('adds CSS classes when config is on', () => {
            createService({ 'workbench.reduceMotion': 'on' });
            assert.strictEqual(container.classList.contains('monaco-reduce-motion'), true);
            assert.strictEqual(container.classList.contains('monaco-enable-motion'), false);
        });
        test('adds CSS classes when config is off', () => {
            createService({ 'workbench.reduceMotion': 'off' });
            assert.strictEqual(container.classList.contains('monaco-reduce-motion'), false);
            assert.strictEqual(container.classList.contains('monaco-enable-motion'), true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJpbGl0eVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9icm93c2VyL2FjY2Vzc2liaWxpdHlTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQTZCLE1BQU0sZ0RBQWdELENBQUM7QUFDbEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTdFLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFDbEMsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUN4RCxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksU0FBc0IsQ0FBQztJQUUzQixTQUFTLGFBQWEsQ0FBQyxTQUFrQyxFQUFFO1FBQzFELE1BQU0sb0JBQW9CLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUV2RSxvQkFBb0IsR0FBRyxJ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