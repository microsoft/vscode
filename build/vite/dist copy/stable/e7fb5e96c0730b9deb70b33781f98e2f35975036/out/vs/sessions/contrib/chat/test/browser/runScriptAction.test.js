/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
// Side-effect import to trigger module-level menu registrations.
// Only import runScriptAction which registers the Run dropdown submenu;
// avoid chat.contribution.js and sessionsTerminalContribution.js which
// bootstrap heavy workbench contributions and leak disposables from
// KeybindingsRegistry in this lightweight test context.
import '../../browser/runScriptAction.js';
const titleBarSessionMenu = MenuId.for('SessionsTitleBarSessionMenu');
suite('RunScriptContribution', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('contributes run dropdown to TitleBarSessionMenu', () => {
        const items = MenuRegistry.getMenuItems(titleBarSessionMenu);
        const runAction = items.find(item => isISubmenuItem(item) && item.submenu.id === 'AgentSessionsRunScriptDropdown');
        assert.ok(runAction, 'run dropdown should be contributed to TitleBarSessionMenu');
        assert.strictEqual(runAction.order, 8);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU2NyaXB0QWN0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3J1blNjcmlwdEFjdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV6RyxpRUFBaUU7QUFDakUsd0VBQXdFO0FBQ3hFLHVFQUF1RTtBQUN2RSxvRUFBb0U7QUFDcEUsd0RBQXdEO0FBQ3hELE9BQU8sa0NBQWtDLENBQUM7QUFFMUMsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFFdEUsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUVuQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7UUFDNUQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTdELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssZ0NBQWdDLENBQUMsQ0FBQztRQUVuSCxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSwyREFBMkQsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=