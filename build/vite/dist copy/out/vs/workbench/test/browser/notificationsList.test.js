/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { NotificationAccessibilityProvider } from '../../browser/parts/notifications/notificationsList.js';
import { NotificationViewItem } from '../../common/notifications.js';
import { Severity, NotificationsFilter } from '../../../platform/notification/common/notification.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
suite('NotificationsList AccessibilityProvider', () => {
    const noFilter = { global: NotificationsFilter.OFF, sources: new Map() };
    let configurationService;
    let keybindingService;
    let accessibilityProvider;
    const createdNotifications = [];
    setup(() => {
        configurationService = new TestConfigurationService();
        keybindingService = new MockKeybindingService();
        accessibilityProvider = new NotificationAccessibilityProvider({}, keybindingService, configurationService);
    });
    teardown(() => {
        // Close all created notifications to prevent disposable leaks
        for (const notification of createdNotifications) {
            notification.close();
        }
        createdNotifications.length = 0;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('getAriaLabel includes severity prefix for Error notifications', () => {
        const notification = NotificationViewItem.create({ severity: Severity.Error, message: 'Something went wrong' }, noFilter);
        createdNotifications.push(notification);
        const ariaLabel = accessibilityProvider.getAriaLabel(notification);
        assert.ok(ariaLabel.startsWith('Error: '), `Expected aria label to start with "Error: ", but got: ${ariaLabel}`);
        assert.ok(ariaLabel.includes('Something went wrong'), 'Expected aria label to include original message');
        assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
    });
    test('getAriaLabel includes severity prefix for Warning notifications', () => {
        const notification = NotificationViewItem.create({ severity: Severity.Warning, message: 'This is a warning' }, noFilter);
        createdNotifications.push(notification);
        const ariaLabel = accessibilityProvider.getAriaLabel(notification);
        assert.ok(ariaLabel.startsWith('Warning: '), `Expected aria label to start with "Warning: ", but got: ${ariaLabel}`);
        assert.ok(ariaLabel.includes('This is a warning'), 'Expected aria label to include original message');
        assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
    });
    test('getAriaLabel includes severity prefix for Info notifications', () => {
        const notification = NotificationViewItem.create({ severity: Severity.Info, message: 'Information message' }, noFilter);
        createdNotifications.push(notification);
        const ariaLabel = accessibilityProvider.getAriaLabel(notification);
        assert.ok(ariaLabel.startsWith('Info: '), `Expected aria label to start with "Info: ", but got: ${ariaLabel}`);
        assert.ok(ariaLabel.includes('Information message'), 'Expected aria label to include original message');
        assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
    });
    test('getAriaLabel includes source when present', () => {
        const notification = NotificationViewItem.create({
            severity: Severity.Error,
            message: 'Error with source',
            source: 'TestExtension'
        }, noFilter);
        createdNotifications.push(notification);
        const ariaLabel = accessibilityProvider.getAriaLabel(notification);
        assert.ok(ariaLabel.startsWith('Error: '), 'Expected aria label to start with severity prefix');
        assert.ok(ariaLabel.includes('Error with source'), 'Expected aria label to include original message');
        assert.ok(ariaLabel.includes('source: TestExtension'), 'Expected aria label to include source information');
        assert.ok(ariaLabel.includes('notification'), 'Expected aria label to include "notification"');
    });
    test('severity prefix consistency', () => {
        // Test that the severity prefixes are consistent with the ARIA alerts
        const errorNotification = NotificationViewItem.create({ severity: Severity.Error, message: 'Error message' }, noFilter);
        const warningNotification = NotificationViewItem.create({ severity: Severity.Warning, message: 'Warning message' }, noFilter);
        const infoNotification = NotificationViewItem.create({ severity: Severity.Info, message: 'Info message' }, noFilter);
        createdNotifications.push(errorNotification, warningNotification, infoNotification);
        const errorLabel = accessibilityProvider.getAriaLabel(errorNotification);
        const warningLabel = accessibilityProvider.getAriaLabel(warningNotification);
        const infoLabel = accessibilityProvider.getAriaLabel(infoNotification);
        // Check that each severity type gets the correct prefix
        assert.ok(errorLabel.includes('Error: Error message'), 'Error notifications should have Error prefix');
        assert.ok(warningLabel.includes('Warning: Warning message'), 'Warning notifications should have Warning prefix');
        assert.ok(infoLabel.includes('Info: Info message'), 'Info notifications should have Info prefix');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0xpc3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvbm90aWZpY2F0aW9uc0xpc3QudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDM0csT0FBTyxFQUFFLG9CQUFvQixFQUErQyxNQUFNLCtCQUErQixDQUFDO0FBQ2xILE9BQU8sRUFBRSxRQUFRLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUd0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNuSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU3RixLQUFLLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO0lBRXJELE1BQU0sUUFBUSxHQUF5QixFQUFFLE1BQU0sRUFBRSxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQztJQUMvRixJQUFJLG9CQUEyQyxDQUFDO0lBQ2hELElBQUksaUJBQXFDLENBQUM7SUFDMUMsSUFBSSxxQkFBd0QsQ0FBQztJQUM3RCxNQUFNLG9CQUFvQixHQUE0QixFQUFFLENBQUM7SUFFekQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUN0RCxpQkFBaUIsR0FBRyxJQUFJLHFCQUFxQixFQUFFLENBQUM7UUFDaEQscUJBQXFCLEdBQUcsSUFBSSxpQ0FBaUMsQ0FBQyxFQUFFLEVB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