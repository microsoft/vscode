/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../../platform/window/common/window.js';
import { Codicon } from '../../../base/common/codicons.js';
import { hideIcon, hideUpIcon, getNotificationExpandIcon, getNotificationCollapseIcon } from '../../browser/parts/notifications/notificationsActions.js';
suite('Notifications Position', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('Configuration', () => {
        test('defaults to bottom-right when no configuration is set', () => {
            const configurationService = new TestConfigurationService();
            const position = configurationService.getValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */) ?? "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */;
            assert.strictEqual(position, "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */);
        });
        test('returns bottom-left when configured', async () => {
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */);
            const position = configurationService.getValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */);
            assert.strictEqual(position, "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */);
        });
        test('returns top-right when configured', async () => {
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "top-right" /* NotificationsPosition.TOP_RIGHT */);
            const position = configurationService.getValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */);
            assert.strictEqual(position, "top-right" /* NotificationsPosition.TOP_RIGHT */);
        });
        test('returns bottom-right when configured', async () => {
            const configurationService = new TestConfigurationService();
            await configurationService.setUserConfiguration("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */);
            const position = configurationService.getValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */);
            assert.strictEqual(position, "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */);
        });
    });
    suite('Status Bar Alignment', () => {
        function getDesiredAlignment(position) {
            switch (position) {
                case "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */:
                    return 'left';
                case "top-right" /* NotificationsPosition.TOP_RIGHT */:
                    return 'hidden'; // bell is in titlebar instead
                case "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */:
                default:
                    return 'right';
            }
        }
        test('bottom-right position aligns bell to right', () => {
            assert.strictEqual(getDesiredAlignment("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */), 'right');
        });
        test('bottom-left position aligns bell to left', () => {
            assert.strictEqual(getDesiredAlignment("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */), 'left');
        });
        test('top-right position hides status bar bell', () => {
            assert.strictEqual(getDesiredAlignment("top-right" /* NotificationsPosition.TOP_RIGHT */), 'hidden');
        });
    });
    suite('Top Offset for Top-Right', () => {
        function computeTopOffset(position, titleBarVisible) {
            if (position !== "top-right" /* NotificationsPosition.TOP_RIGHT */) {
                return undefined;
            }
            let topOffset = 7;
            if (titleBarVisible) {
                topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
            }
            return topOffset;
        }
        test('bottom-right has no top offset', () => {
            assert.strictEqual(computeTopOffset("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */, true), undefined);
        });
        test('bottom-left has no top offset', () => {
            assert.strictEqual(computeTopOffset("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */, true), undefined);
        });
        test('top-right without titlebar has 7px offset', () => {
            assert.strictEqual(computeTopOffset("top-right" /* NotificationsPosition.TOP_RIGHT */, false), 7);
        });
        test('top-right with titlebar has 42px offset', () => {
            assert.strictEqual(computeTopOffset("top-right" /* NotificationsPosition.TOP_RIGHT */, true), 42);
        });
    });
    suite('NotificationsPosition Enum Values', () => {
        test('enum values match expected strings', () => {
            assert.strictEqual("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */, 'bottom-right');
            assert.strictEqual("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */, 'bottom-left');
            assert.strictEqual("top-right" /* NotificationsPosition.TOP_RIGHT */, 'top-right');
        });
        test('setting key is correct', () => {
            assert.strictEqual("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, 'workbench.notifications.position');
        });
        test('button setting key is correct', () => {
            assert.strictEqual("workbench.notifications.showInTitleBar" /* NotificationsSettings.NOTIFICATIONS_BUTTON */, 'workbench.notifications.showInTitleBar');
        });
    });
    suite('Hide Notifications Icon', () => {
        function getHideIcon(position) {
            return position === "top-right" /* NotificationsPosition.TOP_RIGHT */ ? hideUpIcon : hideIcon;
        }
        test('bottom-right uses chevron down icon', () => {
            assert.strictEqual(getHideIcon("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */).id, hideIcon.id);
        });
        test('bottom-left uses chevron down icon', () => {
            assert.strictEqual(getHideIcon("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */).id, hideIcon.id);
        });
        test('top-right uses chevron up icon', () => {
            assert.strictEqual(getHideIcon("top-right" /* NotificationsPosition.TOP_RIGHT */).id, hideUpIcon.id);
        });
        test('hide icon defaults use correct codicons', () => {
            assert.strictEqual(Codicon.chevronDown.id, 'chevron-down');
            assert.strictEqual(Codicon.chevronUp.id, 'chevron-up');
        });
    });
    suite('Expand/Collapse Notification Icons', () => {
        test('bottom-right expand uses notifications-expand icon', () => {
            assert.strictEqual(getNotificationExpandIcon("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */).id, 'notifications-expand');
        });
        test('bottom-left expand uses notifications-expand icon', () => {
            assert.strictEqual(getNotificationExpandIcon("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */).id, 'notifications-expand');
        });
        test('top-right expand uses notifications-expand-down icon', () => {
            assert.strictEqual(getNotificationExpandIcon("top-right" /* NotificationsPosition.TOP_RIGHT */).id, 'notifications-expand-down');
        });
        test('bottom-right collapse uses notifications-collapse icon', () => {
            assert.strictEqual(getNotificationCollapseIcon("bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */).id, 'notifications-collapse');
        });
        test('bottom-left collapse uses notifications-collapse icon', () => {
            assert.strictEqual(getNotificationCollapseIcon("bottom-left" /* NotificationsPosition.BOTTOM_LEFT */).id, 'notifications-collapse');
        });
        test('top-right collapse uses notifications-collapse-up icon', () => {
            assert.strictEqual(getNotificationCollapseIcon("top-right" /* NotificationsPosition.TOP_RIGHT */).id, 'notifications-collapse-up');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc1Bvc2l0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL25vdGlmaWNhdGlvbnNQb3NpdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNuSCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUzRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUseUJBQXlCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUV6SixLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO0lBRXBDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFFM0IsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsRUFBRTtZQUNsRSxNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztZQUM1RCxNQUFNLFFBQVEsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLHVGQUFxRSwyREFBc0MsQ0FBQztZQUMxSixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsMERBQXFDLENBQUM7UUFDbEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7WUFDNUQsTUFBTSxv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