/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { HoverService } from '../../browser/hoverService.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { IMarkdownRendererService } from '../../../markdown/browser/markdownRenderer.js';
suite('HoverService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let hoverService;
    let fixture;
    let instantiationService;
    setup(() => {
        fixture = document.createElement('div');
        mainWindow.document.body.appendChild(fixture);
        store.add(toDisposable(() => fixture.remove()));
        instantiationService = store.add(new TestInstantiationService());
        const configurationService = new TestConfigurationService();
        configurationService.setUserConfiguration('workbench.hover.delay', 0);
        configurationService.setUserConfiguration('workbench.hover.reducedDelay', 0);
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IContextMenuService, {
            onDidShowContextMenu: Event.None
        });
        instantiationService.stub(IKeybindingService, {
            mightProducePrintableCharacter() { return false; },
            softDispatch() { return NoMatchingKb; },
            resolveKeyboardEvent() {
                return {
                    getLabel() { return ''; },
                    getAriaLabel() { return ''; },
                    getElectronAccelerator() { return null; },
                    getUserSettingsLabel() { return null; },
                    isWYSIWYG() { return false; },
                    hasMultipleChords() { return false; },
                    getDispatchChords() { return [null]; },
                    getSingleModifierDispatchChords() { return []; },
                    getChords() { return []; }
                };
            }
        });
        instantiationService.stub(ILayoutService, {
            activeContainer: fixture,
            mainContainer: fixture,
            getContainer() { return fixture; },
            onDidLayoutContainer: Event.None
        });
        instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
        instantiationService.stub(IMarkdownRendererService, {
            render() { return { element: document.createElement('div'), dispose() { } }; },
            setDefaultCodeBlockRenderer() { }
        });
        hoverService = store.add(instantiationService.createInstance(HoverService));
    });
    // #region Helper functions
    function createTarget() {
        const target = document.createElement('div');
        target.style.width = '100px';
        target.style.height = '100px';
        fixture.appendChild(target);
        return target;
    }
    function showHover(content, target, options) {
        const hover = hoverService.showInstantHover({
            content,
            target: target ?? createTarget(),
            ...options
        });
        assert.ok(hover, `Hover with content "${content}" should be created`);
        return hover;
    }
    function asHoverWidget(hover) {
        return hover;
    }
    /**
     * Checks if a hover's DOM node is present in the document.
     */
    function isInDOM(hover) {
        return mainWindow.document.body.contains(asHoverWidget(hover).domNode);
    }
    /**
     * Asserts that a hover is in the DOM.
     */
    function assertInDOM(hover, message) {
        assert.ok(isInDOM(hover), message ?? 'Hover should be in the DOM');
    }
    /**
     * Asserts that a hover is NOT in the DOM.
     */
    function assertNotInDOM(hover, message) {
        assert.ok(!isInDOM(hover), message ?? 'Hover should not be in the DOM');
    }
    /**
     * Creates a nested hover by appending a target element inside the parent hover's DOM.
     */
    function createNestedHover(parentHover, content) {
        const nestedTarget = document.createElement('div');
        asHoverWidget(parentHover).domNode.appendChild(nestedTarget);
        return showHover(content, nestedTarget);
    }
    /**
     * Creates a chain of nested hovers up to the specified depth.
     * Returns the array of hovers from outermost to innermost.
     */
    function createHoverChain(depth) {
        const hovers = [];
        let currentTarget = createTarget();
        for (let i = 0; i < depth; i++) {
            const hover = hoverService.showInstantHover({
                content: `Hover ${i + 1}`,
                target: currentTarget
            });
            if (!hover) {
                break;
            }
            hovers.push(asHoverWidget(hover));
            currentTarget = document.createElement('div');
            asHoverWidget(hover).domNode.appendChild(currentTarget);
        }
        return hovers;
    }
    function disposeHovers(hovers) {
        for (const h of [...hovers].reverse()) {
            h?.dispose();
        }
    }
    // #endregion
    suite('showInstantHover', () => {
        test('should not show hover with empty content', () => {
            const target = createTarget();
            const hover = hoverService.showInstantHover({
                content: '',
                target
            });
            assert.strictEqual(hover, undefined, 'Hover should not be created for empty content');
        });
        test('should call onDidShow callback when hover is shown', () => {
            const target = createTarget();
            let didShowCalled = false;
            const hover = hoverService.showInstantHover({
                content: 'Test',
                target,
                onDidShow: () => { didShowCalled = true; }
            });
            assert.ok(didShowCalled, 'onDidShow should be called');
            assert.ok(hover);
            assertInDOM(hover, 'Hover should be in DOM after showing');
            hover.dispose();
            assertNotInDOM(hover, 'Hover should be removed from DOM after dispose');
        });
        test('should deduplicate hovers by id', () => {
            const target = createTarget();
            const hover1 = hoverService.showInstantHover({
                content: 'Same content',
                target,
                id: 'same-id'
            });
            const hover2 = hoverService.showInstantHover({
                content: 'Same content',
                target,
                id: 'same-id'
            });
            assert.ok(hover1, 'First hover should be created');
            assertInDOM(hover1, 'First hover should be in DOM');
            assert.strictEqual(hover2, undefined, 'Second hover with same id should not be created');
            // Different id should create new hover
            const hover3 = hoverService.showInstantHover({
                content: 'Content 3',
                target,
                id: 'different-id'
            });
            assert.ok(hover3, 'Hover with different id should be created');
            assertInDOM(hover3, 'Third hover should be in DOM');
            hover1?.dispose();
            hover3?.dispose();
        });
        test('should apply additional classes to hover DOM', () => {
            const hover = showHover('Test', undefined, {
                additionalClasses: ['custom-class-1', 'custom-class-2']
            });
            const domNode = asHoverWidget(hover).domNode;
            assertInDOM(hover, 'Hover should be in DOM');
            assert.ok(domNode.classList.contains('custom-class-1'), 'Should have custom-class-1');
            assert.ok(domNode.classList.contains('custom-class-2'), 'Should have custom-class-2');
            hover.dispose();
            assertNotInDOM(hover, 'Hover should be removed from DOM after dispose');
        });
    });
    suite('hideHover', () => {
        test('should hide non-locked hover', () => {
            const hover = showHover('Test');
            assertInDOM(hover, 'Hover should be in DOM initially');
            hoverService.hideHover();
            assert.strictEqual(hover.isDisposed, true, 'Hover should be disposed after hideHover');
            assertNotInDOM(hover, 'Hover should be removed from DOM after hideHover');
        });
        test('should not hide locked hover without force flag', () => {
            const hover = showHover('Test', undefined, {
                persistence: { sticky: true }
            });
            assertInDOM(hover, 'Locked hover should be in DOM');
            hoverService.hideHover();
            assert.strictEqual(hover.isDisposed, false, 'Locked hover should not be disposed without force');
            assertInDOM(hover, 'Locked hover should remain in DOM');
            hoverService.hideHover(true);
            assert.strictEqual(hover.isDisposed, true, 'Locked hover should be disposed with force=true');
            assertNotInDOM(hover, 'Locked hover should be removed from DOM with force');
        });
    });
    suite('nested hovers', () => {
        test('should keep parent hover visible when nested hover is created', () => {
            const parentHover = showHover('Parent');
            assertInDOM(parentHover, 'Parent hover should be in DOM');
            const nestedHover = createNestedHover(parentHover, 'Nested');
            assertInDOM(nestedHover, 'Nested hover should be in DOM');
            assertInDOM(parentHover, 'Parent hover should still be in DOM after nested hover created');
            assert.strictEqual(parentHover.isDisposed, false, 'Parent hover should remain visible');
            assert.strictEqual(nestedHover.isDisposed, false, 'Nested hover should be visible');
            nestedHover.dispose();
            assertNotInDOM(nestedHover, 'Nested hover should be removed from DOM after dispose');
            assertInDOM(parentHover, 'Parent hover should remain in DOM after nested is disposed');
            parentHover.dispose();
            assertNotInDOM(parentHover, 'Parent hover should be removed from DOM after dispose');
        });
        test('should dispose nested hover when parent is disposed', () => {
            const parentHover = showHover('Parent');
            const nestedHover = createNestedHover(parentHover, 'Nested');
            assertInDOM(parentHover, 'Parent hover should be in DOM');
            assertInDOM(nestedHover, 'Nested hover should be in DOM');
            parentHover.dispose();
            assert.strictEqual(nestedHover.isDisposed, true, 'Nested hover should be disposed when parent is disposed');
            assertNotInDOM(parentHover, 'Parent hover should be removed from DOM');
            assertNotInDOM(nestedHover, 'Nested hover should be removed from DOM when parent is disposed');
        });
        test('should dispose entire hover chain when root is disposed', () => {
            const hovers = createHoverChain(3);
            assert.strictEqual(hovers.length, 3, 'Should create 3 hovers');
            // Verify all hovers are in DOM
            for (let i = 0; i < hovers.length; i++) {
                assert.ok(mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be in DOM`);
            }
            // Dispose the root hover
            hovers[0].dispose();
            // All hovers in the chain should be disposed and removed from DOM
            for (let i = 0; i < hovers.length; i++) {
                assert.strictEqual(hovers[i].isDisposed, true, `Hover ${i + 1} should be disposed`);
                assert.ok(!mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be removed from DOM`);
            }
        });
        test('should dispose only nested hovers when middle hover is disposed', () => {
            const hovers = createHoverChain(3);
            assert.strictEqual(hovers.length, 3, 'Should create 3 hovers');
            // Verify all hovers are in DOM
            for (const h of hovers) {
                assert.ok(mainWindow.document.body.contains(h.domNode), 'All hovers should be in DOM initially');
            }
            // Dispose the middle hover
            hovers[1].dispose();
            assert.strictEqual(hovers[0].isDisposed, false, 'Root hover should remain');
            assert.ok(mainWindow.document.body.contains(hovers[0].domNode), 'Root hover should remain in DOM');
            assert.strictEqual(hovers[1].isDisposed, true, 'Middle hover should be disposed');
            assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), 'Middle hover should be removed from DOM');
            assert.strictEqual(hovers[2].isDisposed, true, 'Innermost hover should be disposed');
            assert.ok(!mainWindow.document.body.contains(hovers[2].domNode), 'Innermost hover should be removed from DOM');
            hovers[0].dispose();
        });
        test('should enforce maximum nesting depth', () => {
            // Create hovers up to the max depth (3)
            const hovers = createHoverChain(3);
            assert.strictEqual(hovers.length, 3, 'Should create exactly 3 hovers (max depth)');
            // Verify all 3 hovers are in DOM
            for (const h of hovers) {
                assert.ok(mainWindow.document.body.contains(h.domNode), 'Hover should be in DOM');
            }
            // Try to create a 4th nested hover - should fail
            const nestedTarget = document.createElement('div');
            hovers[2].domNode.appendChild(nestedTarget);
            const fourthHover = hoverService.showInstantHover({
                content: 'Hover 4',
                target: nestedTarget
            });
            assert.strictEqual(fourthHover, undefined, 'Fourth hover should not be created due to max nesting depth');
            disposeHovers(hovers);
        });
        test('should allow new hover chain after disposing previous chain', () => {
            // Create and dispose a chain
            const firstChain = createHoverChain(3);
            for (const h of firstChain) {
                assert.ok(mainWindow.document.body.contains(h.domNode), 'First chain hover should be in DOM');
            }
            disposeHovers(firstChain);
            for (const h of firstChain) {
                assert.ok(!mainWindow.document.body.contains(h.domNode), 'First chain hover should be removed from DOM');
            }
            // Should be able to create a new chain
            const secondChain = createHoverChain(3);
            assert.strictEqual(secondChain.length, 3, 'Should create new chain after disposing previous');
            for (const h of secondChain) {
                assert.ok(mainWindow.document.body.contains(h.domNode), 'Second chain hover should be in DOM');
            }
            disposeHovers(secondChain);
        });
        test('hideHover should close innermost hover first', () => {
            const hovers = createHoverChain(2);
            // Verify both are in DOM
            assert.ok(mainWindow.document.body.contains(hovers[0].domNode), 'Outer hover should be in DOM');
            assert.ok(mainWindow.document.body.contains(hovers[1].domNode), 'Inner hover should be in DOM');
            hoverService.hideHover();
            // Innermost hover should be disposed and removed from DOM
            assert.strictEqual(hovers[1].isDisposed, true, 'Innermost hover should be disposed');
            assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), 'Innermost hover should be removed from DOM');
            assert.strictEqual(hovers[0].isDisposed, false, 'Outer hover should remain');
            assert.ok(mainWindow.document.body.contains(hovers[0].domNode), 'Outer hover should remain in DOM');
            hoverService.hideHover();
            assert.strictEqual(hovers[0].isDisposed, true, 'Outer hover should be disposed on second call');
            assert.ok(!mainWindow.document.body.contains(hovers[0].domNode), 'Outer hover should be removed from DOM');
        });
    });
    suite('setupDelayedHover', () => {
        test('should evaluate function options on mouseover', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const target = createTarget();
            let callCount = 0;
            const disposable = hoverService.setupDelayedHover(target, () => {
                callCount++;
                return { content: `Call ${callCount}` };
            });
            // First mouseover
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            assert.strictEqual(callCount, 1, 'Options function should be called on first mouseover');
            await timeout(0);
            hoverService.hideHover(true);
            // Second mouseover should call function again
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            assert.strictEqual(callCount, 2, 'Options function should be called on second mouseover');
            await timeout(0);
            disposable.dispose();
            hoverService.hideHover(true);
        }));
        test('should use reduced delay when reducedDelay is true', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const target = createTarget();
            // Configure reducedDelay to 150ms for this test
            instantiationService.get(IConfigurationService).setUserConfiguration('workbench.hover.reducedDelay', 150);
            const disposable = hoverService.setupDelayedHover(target, { content: 'Reduced delay' }, { reducedDelay: true });
            // Trigger mouseover
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            // Hover should not be visible before delay
            await timeout(75);
            const hoversBefore = mainWindow.document.querySelectorAll('.monaco-hover');
            assert.strictEqual(hoversBefore.length, 0, 'Hover should not be visible before delay completes');
            // Hover should be visible after delay
            await timeout(150);
            const hoversAfter = mainWindow.document.querySelectorAll('.monaco-hover');
            assert.strictEqual(hoversAfter.length, 1, 'Hover should be visible after reduced delay');
            disposable.dispose();
            hoverService.hideHover(true);
        }));
    });
    suite('setupManagedHover', () => {
        test('should use native title attribute when showNativeHover is true', () => {
            const target = createTarget();
            const hover = hoverService.setupManagedHover({ showHover: () => undefined, delay: 0, showNativeHover: true }, target, 'Native hover content');
            assert.strictEqual(target.getAttribute('title'), 'Native hover content');
            hover.dispose();
            assert.strictEqual(target.getAttribute('title'), null, 'Title should be removed on dispose');
        });
        test('should update content dynamically', async () => {
            const target = createTarget();
            const hover = hoverService.setupManagedHover({ showHover: () => undefined, delay: 0, showNativeHover: true }, target, 'Initial');
            assert.strictEqual(target.getAttribute('title'), 'Initial');
            await hover.update('Updated');
            assert.strictEqual(target.getAttribute('title'), 'Updated');
            await hover.update('Final');
            assert.strictEqual(target.getAttribute('title'), 'Final');
            hover.dispose();
        });
    });
    suite('showDelayedHover', () => {
        test('should reject hover when current hover is locked and target is outside', () => {
            const lockedHover = showHover('Locked', undefined, {
                persistence: { sticky: true }
            });
            assertInDOM(lockedHover, 'Locked hover should be in DOM');
            const otherTarget = createTarget();
            const rejectedHover = hoverService.showDelayedHover({
                content: 'Should not show',
                target: otherTarget
            }, {});
            assert.strictEqual(rejectedHover, undefined, 'Should reject hover when locked hover exists');
            assertInDOM(lockedHover, 'Locked hover should remain in DOM after rejection');
            lockedHover.dispose();
            assertNotInDOM(lockedHover, 'Locked hover should be removed from DOM after dispose');
        });
        test('should use reduced delay when reducedDelay is true', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const target = createTarget();
            const reducedDelay = 100;
            // Configure reducedDelay setting for this test
            instantiationService.get(IConfigurationService).setUserConfiguration('workbench.hover.reducedDelay', reducedDelay);
            const hover = hoverService.showDelayedHover({
                content: 'Reduced delay hover',
                target
            }, { reducedDelay: true });
            assert.ok(hover, 'Hover should be created');
            assertNotInDOM(hover, 'Hover should not be visible immediately');
            // Wait less than reduced delay - hover should still not be visible
            await timeout(reducedDelay / 2);
            assertNotInDOM(hover, 'Hover should not be visible before delay completes');
            // Wait for full delay - hover should now be visible
            await timeout(reducedDelay);
            assertInDOM(hover, 'Hover should be visible after reduced delay');
            hover.dispose();
        }));
        test('should use default delay when custom delay is undefined', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
            const target = createTarget();
            // Default delay is set to 0 in test setup
            const hover = hoverService.showDelayedHover({
                content: 'Default delay hover',
                target
            }, {});
            assert.ok(hover, 'Hover should be created');
            // Since default delay is 0 in tests, hover should appear after minimal timeout
            await timeout(0);
            assertInDOM(hover, 'Hover should be visible with default delay');
            hover.dispose();
        }));
    });
    suite('hover locking', () => {
        test('isLocked should be settable on hover widget', () => {
            const hover = showHover('Test');
            const widget = asHoverWidget(hover);
            assertInDOM(hover, 'Hover should be in DOM');
            assert.strictEqual(widget.isLocked, false, 'Should not be locked initially');
            widget.isLocked = true;
            assert.strictEqual(widget.isLocked, true, 'Should be locked after setting');
            assertInDOM(hover, 'Hover should remain in DOM after locking');
            widget.isLocked = false;
            assert.strictEqual(widget.isLocked, false, 'Should be unlocked after unsetting');
            hover.dispose();
            assertNotInDOM(hover, 'Hover should be removed from DOM after dispose');
        });
        test('sticky option should set isLocked to true', () => {
            const hover = showHover('Test', undefined, {
                persistence: { sticky: true }
            });
            assertInDOM(hover, 'Sticky hover should be in DOM');
            assert.strictEqual(asHoverWidget(hover).isLocked, true, 'Should be locked when sticky');
            hover.dispose();
            assertNotInDOM(hover, 'Sticky hover should be removed from DOM after dispose');
        });
    });
    suite('showAndFocusLastHover', () => {
        test('should recreate last disposed hover', () => {
            const target = createTarget();
            const hover = hoverService.showInstantHover({
                content: 'Remember me',
                target
            });
            assert.ok(hover);
            assertInDOM(hover, 'Initial hover should be in DOM');
            hover.dispose();
            assertNotInDOM(hover, 'Hover should be removed from DOM after dispose');
            // Should recreate the hover - verify a new hover is shown
            hoverService.showAndFocusLastHover();
            // Verify there is a hover in the DOM (it's a new hover instance)
            const hoverElements = mainWindow.document.querySelectorAll('.monaco-hover');
            assert.ok(hoverElements.length > 0, 'A hover should be recreated and in the DOM');
            // Clean up
            hoverService.hideHover(true);
            // Verify cleanup
            const remainingHovers = mainWindow.document.querySelectorAll('.monaco-hover');
            assert.strictEqual(remainingHovers.length, 0, 'No hovers should remain in DOM after cleanup');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9ob3Zlci90ZXN0L2Jyb3dzZXIvaG92ZXJTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR3pGLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzFCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsSUFBSSxZQUEwQixDQUFDO0lBQy9CLElBQUksT0FBb0IsQ0FBQztJQUN6QixJQUFJLG9CQUE4QyxDQUFDO0lBRW5ELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixPQUFPLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVoRCxvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQzVELG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLDhCQUE4QixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRXZFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtZQUM5QyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsSUFBSTtTQUNoQyxDQUFDLENBQUM7UUFFSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUU7WUFDN0MsOEJBQThCLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xELFlBQVksS0FBSyxPQUFPLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDdkMsb0JBQW9CO2dCQUNuQixPQUFPO29CQUNOLFFBQVEsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3pCLFlBQVksS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzdCLHNCQUFzQixLQUFLLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekMsb0JBQW9CLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN2QyxTQUFTLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUM3QixpQkFBaUIsS0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ3JDLGlCQUFpQixLQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3RDLCtCQUErQixLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDaEQsU0FBUyxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztpQkFDMUIsQ0FBQztZQUNILENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFO1lBQ3pDLGVBQWUsRUFBRSxPQUFPO1lBQ3hCLGFBQWEsRUFBRSxPQUFPO1lBQ3RCLFlBQVksS0FBSyxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbEMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLElBQUk7U0FDaEMsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRWpGLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRTtZQUNuRCxNQUFNLEtBQUssT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFLE9BQU8sS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUUsMkJBQTJCLEtBQUssQ0FBQztTQUNqQyxDQUFDLENBQUM7UUFFSCxZQUFZLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUM3RSxDQUFDLENBQUMsQ0FBQztJQUVILDJCQUEyQjtJQUUzQixTQUFTLFlBQVk7UUFDcEIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFDN0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO1FBQzlCLE9BQU8sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUIsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsU0FBUyxTQUFTLENBQUMsT0FBZSxFQUFFLE1BQW9CLEVBQUUsT0FBc0U7UUFDL0gsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDO1lBQzNDLE9BQU87WUFDUCxNQUFNLEVBQUUsTUFBTSxJQUFJLFlBQVksRUFBRTtZQUNoQyxHQUFHLE9BQU87U0FDVixDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSx1QkFBdUIsT0FBTyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELFNBQVMsYUFBYSxDQUFDLEtBQW1CO1FBQ3pDLE9BQU8sS0FBb0IsQ0FBQztJQUM3QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLE9BQU8sQ0FBQyxLQUFtQjtRQUNuQyxPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsU0FBUyxXQUFXLENBQUMsS0FBbUIsRUFBRSxPQUFnQjtRQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxPQUFPLElBQUksNEJBQTRCLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLGNBQWMsQ0FBQyxLQUFtQixFQUFFLE9BQWdCO1FBQzVELE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsT0FBTyxJQUFJLGdDQUFnQyxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxXQUF5QixFQUFFLE9BQWU7UUFDcEUsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuRCxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM3RCxPQUFPLFNBQVMsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVEOzs7T0FHRztJQUNILFNBQVMsZ0JBQWdCLENBQUMsS0FBYTtRQUN0QyxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFDO1FBQ2pDLElBQUksYUFBYSxHQUFnQixZQUFZLEVBQUUsQ0FBQztRQUVoRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEMsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQyxPQUFPLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUN6QixNQUFNLEVBQUUsYUFBYTthQUNyQixDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1osTUFBTTtZQUNQLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLGFBQWEsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzlDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxTQUFTLGFBQWEsQ0FBQyxNQUFxQjtRQUMzQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNkLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYTtJQUViLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtZQUNyRCxNQUFNLE1BQU0sR0FBRyxZQUFZLEVBQUUsQ0FBQztZQUM5QixNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzNDLE9BQU8sRUFBRSxFQUFFO2dCQUNYLE1BQU07YUFDTixDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsK0NBQStDLENBQUMsQ0FBQztRQUN2RixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxNQUFNLEdBQUcsWUFBWSxFQUFFLENBQUM7WUFDOUIsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDO1lBRTFCLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0MsT0FBTyxFQUFFLE1BQU07Z0JBQ2YsTUFBTTtnQkFDTixTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsYUFBYSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDMUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztZQUUzRCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEIsY0FBYyxDQUFDLEtBQUssRUFBRSxnREFBZ0QsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtZQUM1QyxNQUFNLE1BQU0sR0FBRyxZQUFZLEVBQUUsQ0FBQztZQUU5QixNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzVDLE9BQU8sRUFBRSxjQUFjO2dCQUN2QixNQUFNO2dCQUNOLEVBQUUsRUFBRSxTQUFTO2FBQ2IsQ0FBQyxDQUFDO1lBRUgsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDO2dCQUM1QyxPQUFPLEVBQUUsY0FBYztnQkFDdkIsTUFBTTtnQkFDTixFQUFFLEVBQUUsU0FBUzthQUNiLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLCtCQUErQixDQUFDLENBQUM7WUFDbkQsV0FBVyxDQUFDLE1BQU0sRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxpREFBaUQsQ0FBQyxDQUFDO1lBRXpGLHVDQUF1QztZQUN2QyxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzVDLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixNQUFNO2dCQUNOLEVBQUUsRUFBRSxjQUFjO2FBQ2xCLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLDJDQUEyQyxDQUFDLENBQUM7WUFDL0QsV0FBVyxDQUFDLE1BQU0sRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBRXBELE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUNsQixNQUFNLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDbkIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFO2dCQUMxQyxpQkFBaUIsRUFBRSxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDO2FBQ3ZELENBQUMsQ0FBQztZQUVILE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDN0MsV0FBVyxDQUFDLEtBQUssRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBQ3RGLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBRXRGLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNoQixjQUFjLENBQUMsS0FBSyxFQUFFLGdEQUFnRCxDQUFDLENBQUM7UUFDekUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztZQUV2RCxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUM7WUFFekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1lBQ3ZGLGNBQWMsQ0FBQyxLQUFLLEVBQUUsa0RBQWtELENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDNUQsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUU7Z0JBQzFDLFdBQVcsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7YUFDN0IsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxDQUFDLEtBQUssRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBRXBELFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLG1EQUFtRCxDQUFDLENBQUM7WUFDakcsV0FBVyxDQUFDLEtBQUssRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBRXhELFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxpREFBaUQsQ0FBQyxDQUFDO1lBQzlGLGNBQWMsQ0FBQyxLQUFLLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDM0IsSUFBSSxDQUFDLCtEQUErRCxFQUFFLEdBQUcsRUFBRTtZQUMxRSxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEMsV0FBVyxDQUFDLFdBQVcsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBRTFELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM3RCxXQUFXLENBQUMsV0FBVyxFQUFFLCtCQUErQixDQUFDLENBQUM7WUFDMUQsV0FBVyxDQUFDLFdBQVcsRUFBRSxnRUFBZ0UsQ0FBQyxDQUFDO1lBRTNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztZQUN4RixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7WUFFcEYsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLGNBQWMsQ0FBQyxXQUFXLEVBQUUsdURBQXVELENBQUMsQ0FBQztZQUNyRixXQUFXLENBQUMsV0FBVyxFQUFFLDREQUE0RCxDQUFDLENBQUM7WUFFdkYsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLGNBQWMsQ0FBQyxXQUFXLEVBQUUsdURBQXVELENBQUMsQ0FBQztRQUN0RixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxREFBcUQsRUFBRSxHQUFHLEVBQUU7WUFDaEUsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUU3RCxXQUFXLENBQUMsV0FBVyxFQUFFLCtCQUErQixDQUFDLENBQUM7WUFDMUQsV0FBVyxDQUFDLFdBQVcsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBRTFELFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUV0QixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLHlEQUF5RCxDQUFDLENBQUM7WUFDNUcsY0FBYyxDQUFDLFdBQVcsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDO1lBQ3ZFLGNBQWMsQ0FBQyxXQUFXLEVBQUUsaUVBQWlFLENBQUMsQ0FBQztRQUNoRyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxHQUFHLEVBQUU7WUFDcEUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBRS9ELCtCQUErQjtZQUMvQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4QyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQ3BHLENBQUM7WUFFRCx5QkFBeUI7WUFDekIsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRXBCLGtFQUFrRTtZQUNsRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDcEYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQy9HLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUU7WUFDNUUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBRS9ELCtCQUErQjtZQUMvQixLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztZQUNsRyxDQUFDO1lBRUQsMkJBQTJCO1lBQzNCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVwQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDNUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFFbkcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBQ2xGLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLHlDQUF5QyxDQUFDLENBQUM7WUFFNUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1lBQ3JGLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7WUFFL0csTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNqRCx3Q0FBd0M7WUFDeEMsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1lBRW5GLGlDQUFpQztZQUNqQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUNuRixDQUFDO1lBRUQsaURBQWlEO1lBQ2pELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDNUMsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDO2dCQUNqRCxPQUFPLEVBQUUsU0FBUztnQkFDbEIsTUFBTSxFQUFFLFlBQVk7YUFDcEIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLDZEQUE2RCxDQUFDLENBQUM7WUFFMUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLEdBQUcsRUFBRTtZQUN4RSw2QkFBNkI7WUFDN0IsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsS0FBSyxNQUFNLENBQUMsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLG9DQUFvQyxDQUFDLENBQUM7WUFDL0YsQ0FBQztZQUNELGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMxQixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUM1QixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO1lBQzFHLENBQUM7WUFFRCx1Q0FBdUM7WUFDdkMsTUFBTSxXQUFXLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxrREFBa0QsQ0FBQyxDQUFDO1lBQzlGLEtBQUssTUFBTSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1lBQ2hHLENBQUM7WUFFRCxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDNUIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRW5DLHlCQUF5QjtZQUN6QixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsOEJBQThCLENBQUMsQ0FBQztZQUNoRyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsOEJBQThCLENBQUMsQ0FBQztZQUVoRyxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUM7WUFFekIsMERBQTBEO1lBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztZQUNyRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1lBQy9HLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztZQUM3RSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztZQUVwRyxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUM7WUFFekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLElBQUksRUFBRSwrQ0FBK0MsQ0FBQyxDQUFDO1lBQ2hHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLHdDQUF3QyxDQUFDLENBQUM7UUFDNUcsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7UUFDL0IsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2xILE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO1lBQzlCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztZQUVsQixNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtnQkFDOUQsU0FBUyxFQUFFLENBQUM7Z0JBQ1osT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLFNBQVMsRUFBRSxFQUFFLENBQUM7WUFDekMsQ0FBQyxDQUFDLENBQUM7WUFFSCxrQkFBa0I7WUFDbEIsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxzREFBc0QsQ0FBQyxDQUFDO1lBRXpGLE1BQU0sT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFN0IsOENBQThDO1lBQzlDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxVQUFVLENBQUMsV0FBVyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsdURBQXVELENBQUMsQ0FBQztZQUUxRixNQUFNLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckIsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZILE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO1lBRTlCLGdEQUFnRDtZQUMvQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQThCLENBQUMsb0JBQW9CLENBQUMsOEJBQThCLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFFeEksTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRWhILG9CQUFvQjtZQUNwQixNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLFdBQVcsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFckUsMkNBQTJDO1lBQzNDLE1BQU0sT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xCLE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxvREFBb0QsQ0FBQyxDQUFDO1lBRWpHLHNDQUFzQztZQUN0QyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQixNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztZQUV6RixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckIsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQy9CLElBQUksQ0FBQyxnRUFBZ0UsRUFBRSxHQUFHLEVBQUU7WUFDM0UsTUFBTSxNQUFNLEdBQUcsWUFBWSxFQUFFLENBQUM7WUFDOUIsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUMzQyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLEVBQy9ELE1BQU0sRUFDTixzQkFBc0IsQ0FDdEIsQ0FBQztZQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBRXpFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUVoQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLG9DQUFvQyxDQUFDLENBQUM7UUFDOUYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEQsTUFBTSxNQUFNLEdBQUcsWUFBWSxFQUFFLENBQUM7WUFDOUIsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUMzQyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLEVBQy9ELE1BQU0sRUFDTixTQUFTLENBQ1QsQ0FBQztZQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUU1RCxNQUFNLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRTVELE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM1QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFMUQsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQyx3RUFBd0UsRUFBRSxHQUFHLEVBQUU7WUFDbkYsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUU7Z0JBQ2xELFdBQVcsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7YUFDN0IsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxDQUFDLFdBQVcsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDO1lBRTFELE1BQU0sV0FBVyxHQUFHLFlBQVksRUFBRSxDQUFDO1lBQ25DLE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDbkQsT0FBTyxFQUFFLGlCQUFpQjtnQkFDMUIsTUFBTSxFQUFFLFdBQVc7YUFDbkIsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUVQLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO1lBQzdGLFdBQVcsQ0FBQyxXQUFXLEVBQUUsbURBQW1ELENBQUMsQ0FBQztZQUU5RSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsY0FBYyxDQUFDLFdBQVcsRUFBRSx1REFBdUQsQ0FBQyxDQUFDO1FBQ3RGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZILE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO1lBQzlCLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQztZQUV6QiwrQ0FBK0M7WUFDOUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUE4QixDQUFDLG9CQUFvQixDQUFDLDhCQUE4QixFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRWpKLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDM0MsT0FBTyxFQUFFLHFCQUFxQjtnQkFDOUIsTUFBTTthQUNOLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUUzQixNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1lBQzVDLGNBQWMsQ0FBQyxLQUFLLEVBQUUseUNBQXlDLENBQUMsQ0FBQztZQUVqRSxtRUFBbUU7WUFDbkUsTUFBTSxPQUFPLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztZQUU1RSxvREFBb0Q7WUFDcEQsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDNUIsV0FBVyxDQUFDLEtBQUssRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO1lBRWxFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVILE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO1lBQzlCLDBDQUEwQztZQUMxQyxNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzNDLE9BQU8sRUFBRSxxQkFBcUI7Z0JBQzlCLE1BQU07YUFDTixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRVAsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUU1QywrRUFBK0U7WUFDL0UsTUFBTSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakIsV0FBVyxDQUFDLEtBQUssRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1lBRWpFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMzQixJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsV0FBVyxDQUFDLEtBQUssRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBRTdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztZQUU3RSxNQUFNLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztZQUN2QixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLGdDQUFnQyxDQUFDLENBQUM7WUFDNUUsV0FBVyxDQUFDLEtBQUssRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1lBRS9ELE1BQU0sQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztZQUVqRixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEIsY0FBYyxDQUFDLEtBQUssRUFBRSxnREFBZ0QsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtZQUN0RCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRTtnQkFDMUMsV0FBVyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTthQUM3QixDQUFDLENBQUM7WUFDSCxXQUFXLENBQUMsS0FBSyxFQUFFLCtCQUErQixDQUFDLENBQUM7WUFFcEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBRXhGLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNoQixjQUFjLENBQUMsS0FBSyxFQUFFLHVEQUF1RCxDQUFDLENBQUM7UUFDaEYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbkMsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtZQUNoRCxNQUFNLE1BQU0sR0FBRyxZQUFZLEVBQUUsQ0FBQztZQUM5QixNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzNDLE9BQU8sRUFBRSxhQUFhO2dCQUN0QixNQUFNO2FBQ04sQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQixXQUFXLENBQUMsS0FBSyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7WUFFckQsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2hCLGNBQWMsQ0FBQyxLQUFLLEVBQUUsZ0RBQWdELENBQUMsQ0FBQztZQUV4RSwwREFBMEQ7WUFDMUQsWUFBWSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFFckMsaUVBQWlFO1lBQ2pFLE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDNUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1lBRWxGLFdBQVc7WUFDWCxZQUFZLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTdCLGlCQUFpQjtZQUNqQixNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUMvRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==