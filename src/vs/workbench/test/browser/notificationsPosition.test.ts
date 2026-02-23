/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from '../../../platform/window/common/window.js';
import { NotificationsPosition, NotificationsSettings } from '../../common/notifications.js';
import { Codicon } from '../../../base/common/codicons.js';
import { hideIcon, hideUpIcon } from '../../browser/parts/notifications/notificationsActions.js';

suite('Notifications Position', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Configuration', () => {

		test('defaults to bottom-right when no configuration is set', () => {
			const configurationService = new TestConfigurationService();
			const position = configurationService.getValue<NotificationsPosition>(NotificationsSettings.NOTIFICATIONS_POSITION) ?? NotificationsPosition.BOTTOM_RIGHT;
			assert.strictEqual(position, NotificationsPosition.BOTTOM_RIGHT);
		});

		test('returns bottom-left when configured', async () => {
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_LEFT);
			const position = configurationService.getValue<NotificationsPosition>(NotificationsSettings.NOTIFICATIONS_POSITION);
			assert.strictEqual(position, NotificationsPosition.BOTTOM_LEFT);
		});

		test('returns top-right when configured', async () => {
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.TOP_RIGHT);
			const position = configurationService.getValue<NotificationsPosition>(NotificationsSettings.NOTIFICATIONS_POSITION);
			assert.strictEqual(position, NotificationsPosition.TOP_RIGHT);
		});

		test('returns bottom-right when configured', async () => {
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_RIGHT);
			const position = configurationService.getValue<NotificationsPosition>(NotificationsSettings.NOTIFICATIONS_POSITION);
			assert.strictEqual(position, NotificationsPosition.BOTTOM_RIGHT);
		});
	});

	suite('Status Bar Alignment', () => {

		function getDesiredAlignment(position: NotificationsPosition): 'left' | 'right' | 'hidden' {
			switch (position) {
				case NotificationsPosition.BOTTOM_LEFT:
					return 'left';
				case NotificationsPosition.TOP_RIGHT:
					return 'hidden'; // bell is in titlebar instead
				case NotificationsPosition.BOTTOM_RIGHT:
				default:
					return 'right';
			}
		}

		test('bottom-right position aligns bell to right', () => {
			assert.strictEqual(getDesiredAlignment(NotificationsPosition.BOTTOM_RIGHT), 'right');
		});

		test('bottom-left position aligns bell to left', () => {
			assert.strictEqual(getDesiredAlignment(NotificationsPosition.BOTTOM_LEFT), 'left');
		});

		test('top-right position hides status bar bell', () => {
			assert.strictEqual(getDesiredAlignment(NotificationsPosition.TOP_RIGHT), 'hidden');
		});
	});

	suite('Top Offset for Top-Right', () => {

		function computeTopOffset(position: NotificationsPosition, titleBarVisible: boolean): number | undefined {
			if (position !== NotificationsPosition.TOP_RIGHT) {
				return undefined;
			}
			let topOffset = 7;
			if (titleBarVisible) {
				topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
			}
			return topOffset;
		}

		test('bottom-right has no top offset', () => {
			assert.strictEqual(computeTopOffset(NotificationsPosition.BOTTOM_RIGHT, true), undefined);
		});

		test('bottom-left has no top offset', () => {
			assert.strictEqual(computeTopOffset(NotificationsPosition.BOTTOM_LEFT, true), undefined);
		});

		test('top-right without titlebar has 7px offset', () => {
			assert.strictEqual(computeTopOffset(NotificationsPosition.TOP_RIGHT, false), 7);
		});

		test('top-right with titlebar has 42px offset', () => {
			assert.strictEqual(computeTopOffset(NotificationsPosition.TOP_RIGHT, true), 42);
		});
	});

	suite('NotificationsPosition Enum Values', () => {

		test('enum values match expected strings', () => {
			assert.strictEqual(NotificationsPosition.BOTTOM_RIGHT, 'bottom-right');
			assert.strictEqual(NotificationsPosition.BOTTOM_LEFT, 'bottom-left');
			assert.strictEqual(NotificationsPosition.TOP_RIGHT, 'top-right');
		});

		test('setting key is correct', () => {
			assert.strictEqual(NotificationsSettings.NOTIFICATIONS_POSITION, 'workbench.notifications.position');
		});

		test('button setting key is correct', () => {
			assert.strictEqual(NotificationsSettings.NOTIFICATIONS_BUTTON, 'workbench.notifications.showInTitleBar');
		});
	});

	suite('Hide Notifications Icon', () => {

		function getHideIcon(position: NotificationsPosition) {
			return position === NotificationsPosition.TOP_RIGHT ? hideUpIcon : hideIcon;
		}

		test('bottom-right uses chevron down icon', () => {
			assert.strictEqual(getHideIcon(NotificationsPosition.BOTTOM_RIGHT).id, hideIcon.id);
		});

		test('bottom-left uses chevron down icon', () => {
			assert.strictEqual(getHideIcon(NotificationsPosition.BOTTOM_LEFT).id, hideIcon.id);
		});

		test('top-right uses chevron up icon', () => {
			assert.strictEqual(getHideIcon(NotificationsPosition.TOP_RIGHT).id, hideUpIcon.id);
		});

		test('hide icon defaults use correct codicons', () => {
			assert.strictEqual(Codicon.chevronDown.id, 'chevron-down');
			assert.strictEqual(Codicon.chevronUp.id, 'chevron-up');
		});
	});
});
