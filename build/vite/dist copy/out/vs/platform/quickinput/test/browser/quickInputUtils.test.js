/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { quickInputButtonToAction, quickInputButtonsToActionArrays } from '../../browser/quickInputUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('QuickInputUtils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('quickInputButtonToAction', () => {
        test('should convert simple button to action', () => {
            const button = {
                iconPath: { dark: URI.file('/path/to/icon.svg') },
                tooltip: 'Test Tooltip'
            };
            let runCalled = false;
            const action = quickInputButtonToAction(button, 'test-id', () => {
                runCalled = true;
            });
            assert.strictEqual(action.id, 'test-id');
            assert.strictEqual(action.tooltip, 'Test Tooltip');
            assert.strictEqual(action.enabled, true);
            assert.ok(action.class);
            action.run();
            assert.strictEqual(runCalled, true);
        });
        test('should handle button with iconClass', () => {
            const button = {
                iconClass: 'custom-icon-class',
                tooltip: 'Test'
            };
            const action = quickInputButtonToAction(button, 'test-id', () => { });
            assert.ok(action.class?.includes('custom-icon-class'));
        });
        test('should handle alwaysVisible button', () => {
            const button = {
                iconClass: 'icon-class',
                tooltip: 'Test',
                alwaysVisible: true
            };
            const action = quickInputButtonToAction(button, 'test-id', () => { });
            assert.ok(action.class?.includes('always-visible'));
            assert.ok(action.class?.includes('icon-class'));
        });
        test('should handle alwaysVisible without iconClass', () => {
            const button = {
                tooltip: 'Test',
                alwaysVisible: true
            };
            const action = quickInputButtonToAction(button, 'test-id', () => { });
            assert.strictEqual(action.class, 'always-visible');
        });
        test('should handle toggle button', () => {
            const toggle = {
                checked: false
            };
            const button = {
                iconClass: 'toggle-icon',
                tooltip: 'Toggle Test',
                toggle
            };
            let runCalled = false;
            const action = quickInputButtonToAction(button, 'toggle-id', () => {
                runCalled = true;
            });
            assert.strictEqual(action.id, 'toggle-id');
            // For toggle buttons, tooltip is used as label
            assert.strictEqual(action.label, 'Toggle Test');
            assert.strictEqual(action.tooltip, '');
            assert.notStrictEqual(action.checked, undefined);
            // Initial state
            assert.strictEqual(action.checked, false);
            assert.strictEqual(toggle.checked, false);
            // Run the action
            action.run();
            assert.strictEqual(runCalled, true);
            // Toggle state should be flipped
            assert.strictEqual(action.checked, true);
            assert.strictEqual(toggle.checked, true);
        });
        test('should handle toggle button with initial checked state', () => {
            const toggle = {
                checked: true
            };
            const button = {
                iconClass: 'toggle-icon',
                tooltip: 'Toggle Test',
                toggle
            };
            const action = quickInputButtonToAction(button, 'toggle-id', () => { });
            assert.strictEqual(action.checked, true);
            assert.strictEqual(toggle.checked, true);
            // Run should flip the state
            action.run();
            assert.strictEqual(action.checked, false);
            assert.strictEqual(toggle.checked, false);
        });
        test('should use empty string for tooltip when not provided', () => {
            const button = {
                iconClass: 'icon'
            };
            const action = quickInputButtonToAction(button, 'test-id', () => { });
            assert.strictEqual(action.tooltip, '');
        });
        test('should handle button with label', () => {
            const button = {
                iconClass: 'icon',
                tooltip: 'Test',
                label: 'Button Label'
            };
            const action = quickInputButtonToAction(button, 'test-id', () => { });
            // The label property exists on the button but the action's label is initially empty
            assert.strictEqual(action.label, '');
        });
    });
    suite('quickInputButtonsToActionArrays', () => {
        test('should convert empty array', () => {
            const buttons = [];
            const result = quickInputButtonsToActionArrays(buttons, 'prefix', () => { });
            assert.strictEqual(result.primary.length, 0);
            assert.strictEqual(result.secondary.length, 0);
        });
        test('should convert primary buttons', () => {
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Button 1' },
                { iconClass: 'icon2', tooltip: 'Button 2' }
            ];
            const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });
            assert.strictEqual(result.primary.length, 2);
            assert.strictEqual(result.secondary.length, 0);
            assert.strictEqual(result.primary[0].id, 'test-0');
            assert.strictEqual(result.primary[1].id, 'test-1');
        });
        test('should convert secondary buttons', () => {
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Button 1', secondary: true },
                { iconClass: 'icon2', tooltip: 'Button 2', secondary: true }
            ];
            const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });
            assert.strictEqual(result.primary.length, 0);
            assert.strictEqual(result.secondary.length, 2);
            assert.strictEqual(result.secondary[0].id, 'test-0');
            assert.strictEqual(result.secondary[1].id, 'test-1');
        });
        test('should convert mixed primary and secondary buttons', () => {
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Primary 1' },
                { iconClass: 'icon2', tooltip: 'Secondary 1', secondary: true },
                { iconClass: 'icon3', tooltip: 'Primary 2' },
                { iconClass: 'icon4', tooltip: 'Secondary 2', secondary: true }
            ];
            const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });
            assert.strictEqual(result.primary.length, 2);
            assert.strictEqual(result.secondary.length, 2);
            assert.strictEqual(result.primary[0].id, 'test-0');
            assert.strictEqual(result.primary[1].id, 'test-2');
            assert.strictEqual(result.secondary[0].id, 'test-1');
            assert.strictEqual(result.secondary[1].id, 'test-3');
        });
        test('should apply label to actions', () => {
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Button 1', label: 'Label 1' },
                { iconClass: 'icon2', tooltip: 'Button 2' }
            ];
            const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });
            assert.strictEqual(result.primary[0].label, 'Label 1');
            assert.strictEqual(result.primary[1].label, '');
        });
        test('should trigger callback with correct button', () => {
            const button1 = { iconClass: 'icon1', tooltip: 'Button 1' };
            const button2 = { iconClass: 'icon2', tooltip: 'Button 2' };
            const buttons = [button1, button2];
            const triggeredButtons = [];
            const result = quickInputButtonsToActionArrays(buttons, 'test', (button) => {
                triggeredButtons.push(button);
            });
            result.primary[0].run();
            assert.strictEqual(triggeredButtons.length, 1);
            assert.strictEqual(triggeredButtons[0], button1);
            result.primary[1].run();
            assert.strictEqual(triggeredButtons.length, 2);
            assert.strictEqual(triggeredButtons[1], button2);
        });
        test('should handle toggle buttons in arrays', () => {
            const toggle = { checked: false };
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Toggle', toggle },
                { iconClass: 'icon2', tooltip: 'Regular' }
            ];
            const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });
            const toggleAction = result.primary[0];
            assert.strictEqual(toggleAction.checked, false);
            toggleAction.run();
            assert.strictEqual(toggleAction.checked, true);
            assert.strictEqual(toggle.checked, true);
        });
        test('should use correct id prefix', () => {
            const buttons = [
                { iconClass: 'icon1', tooltip: 'Button 1' }
            ];
            const result1 = quickInputButtonsToActionArrays(buttons, 'custom-prefix', () => { });
            assert.strictEqual(result1.primary[0].id, 'custom-prefix-0');
            const result2 = quickInputButtonsToActionArrays(buttons, 'another', () => { });
            assert.strictEqual(result2.primary[0].id, 'another-0');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFV0aWxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L3Rlc3QvYnJvd3Nlci9xdWlja0lucHV0VXRpbHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDN0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7WUFDbkQsTUFBTSxNQUFNLEdBQXNCO2dCQUNqQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO2dCQUNqRCxPQUFPLEVBQUUsY0FBYzthQUN2QixDQUFDO1lBRUYsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO2dCQUMvRCxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFeEIsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO1lBQ2hELE1BQU0sTUFBTSxHQUFzQjtnQkFDakMsU0FBUyxFQUFFLG1CQUFtQjtnQkFDOUIsT0FBTyxFQUFFLE1BQU07YUFDZixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0RSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDL0MsTUFBTSxNQUFNLEdBQXNCO2dCQUNqQyxTQUFTLEVBQUUsWUFBWTtnQkFDdkIsT0FBTyxFQUFFLE1BQU07Z0JBQ2YsYUFBYSxFQUFFLElBQUk7YUFDbkIsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFDcEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLE1BQU0sR0FBc0I7Z0JBQ2pDLE9BQU8sRUFBRSxNQUFNO2dCQUNmLGFBQWEsRUFBRSxJQUFJO2FBQ25CLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3BELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtZQUN4QyxNQUFNLE1BQU0sR0FBRztnQkFDZCxPQUFPLEVBQUUsS0FBSzthQUNkLENBQUM7WUFDRixNQUFNLE1BQU0sR0FBc0I7Z0JBQ2pDLFNBQVMsRUFBRSxhQUFhO2dCQUN4QixPQUFPLEVBQUUsYUFBYTtnQkFDdEIsTUFBTTthQUNOLENBQUM7WUFFRixJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDdEIsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUU7Z0JBQ2pFLFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDbEIsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDM0MsK0NBQStDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRWpELGdCQUFnQjtZQUNoQixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTFDLGlCQUFpQjtZQUNqQixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDYixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUVwQyxpQ0FBaUM7WUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3REFBd0QsRUFBRSxHQUFHLEVBQUU7WUFDbkUsTUFBTSxNQUFNLEdBQUc7Z0JBQ2QsT0FBTyxFQUFFLElBQUk7YUFDYixDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQXNCO2dCQUNqQyxTQUFTLEVBQUUsYUFBYTtnQkFDeEIsT0FBTyxFQUFFLGFBQWE7Z0JBQ3RCLE1BQU07YUFDTixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsd0JBQXdCLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV4RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRXpDLDRCQUE0QjtZQUM1QixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFFYixNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsRUFBRTtZQUNsRSxNQUFNLE1BQU0sR0FBc0I7Z0JBQ2pDLFNBQVMsRUFBRSxNQUFNO2FBQ2pCLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7WUFDNUMsTUFBTSxNQUFNLEdBQXNCO2dCQUNqQyxTQUFTLEVBQUUsTUFBTTtnQkFDakIsT0FBTyxFQUFFLE1BQU07Z0JBQ2YsS0FBSyxFQUFFLGNBQWM7YUFDckIsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdEUsb0ZBQW9GO1lBQ3BGLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtRQUM3QyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1lBQ3ZDLE1BQU0sT0FBTyxHQUF3QixFQUFFLENBQUM7WUFFeEMsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUU3RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1lBQzNDLE1BQU0sT0FBTyxHQUF3QjtnQkFDcEMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUU7Z0JBQzNDLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFO2FBQzNDLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1lBQzdDLE1BQU0sT0FBTyxHQUF3QjtnQkFDcEMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTtnQkFDNUQsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTthQUM1RCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUMvRCxNQUFNLE9BQU8sR0FBd0I7Z0JBQ3BDLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFO2dCQUM1QyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO2dCQUMvRCxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRTtnQkFDNUMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRTthQUMvRCxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDMUMsTUFBTSxPQUFPLEdBQXdCO2dCQUNwQyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO2dCQUM3RCxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRTthQUMzQyxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUzRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sT0FBTyxHQUFzQixFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQy9FLE1BQU0sT0FBTyxHQUFzQixFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQy9FLE1BQU0sT0FBTyxHQUFHLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRW5DLE1BQU0sZ0JBQWdCLEdBQXdCLEVBQUUsQ0FBQztZQUNqRCxNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQzFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDeEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUVqRCxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO1lBQ25ELE1BQU0sTUFBTSxHQUFHLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ2xDLE1BQU0sT0FBTyxHQUF3QjtnQkFDcEMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFO2dCQUNqRCxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRTthQUMxQyxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUzRSxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNoRCxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDbkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxPQUFPLEdBQXdCO2dCQUNwQyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRTthQUMzQyxDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNyRixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFFN0QsTUFBTSxPQUFPLEdBQUcsK0JBQStCLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMvRSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9