/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { ClickAnimation } from '../../../base/browser/ui/animations/animations.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { MenuEntryActionViewItem } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../platform/chat/common/sessionArchiveActions.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { createSessionActionViewItemProvider, getSessionArchiveActionViewItemOptions } from '../../browser/sessionActionViewItem.js';

suite('SessionActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createMenuItemAction(id: string): MenuItemAction {
		return new MenuItemAction(
			{ id, title: id },
			undefined,
			undefined,
			undefined,
			undefined,
			new class extends mock<IContextKeyService>() {
				override contextMatchesRules(): boolean { return true; }
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand(): Promise<undefined> { return undefined; }
			}(),
		);
	}

	function createArchiveActionViewItem(completion: Promise<void>): MenuEntryActionViewItem {
		const action = new MenuItemAction(
			{ id: ARCHIVE_SESSION_COMMAND_ID, title: ARCHIVE_SESSION_COMMAND_ID },
			undefined,
			undefined,
			undefined,
			undefined,
			new class extends mock<IContextKeyService>() {
				override contextMatchesRules(): boolean { return true; }
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand<R = unknown>(): Promise<R | undefined> {
					await completion;
					return undefined;
				}
			}(),
		);
		const viewItem = disposables.add(new MenuEntryActionViewItem(
			action,
			{ onClickAnimation: ClickAnimation.Confetti },
			new class extends mock<IKeybindingService>() { }(),
			new TestNotificationService(),
			new class extends mock<IContextKeyService>() { }(),
			new TestThemeService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}(),
		));
		viewItem.element = dom.$('button');
		return viewItem;
	}

	test('uses confetti for archive actions when enabled', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const expected = Object.create(MenuEntryActionViewItem.prototype) as MenuEntryActionViewItem;
		instantiationService.stubInstance<MenuEntryActionViewItem>(MenuEntryActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, configurationService);

		assert.deepStrictEqual({
			archive: provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}),
			other: provider(createMenuItemAction('sessions.other'), {}),
		}, {
			archive: expected,
			other: undefined,
		});
	});

	test('uses an archive action view item when disabled', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const expected = Object.create(MenuEntryActionViewItem.prototype) as MenuEntryActionViewItem;
		instantiationService.stubInstance<MenuEntryActionViewItem>(MenuEntryActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, new TestConfigurationService());

		assert.strictEqual(provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}), expected);
	});

	test('resolves configured archive animation when clicked', async () => {
		const configurationService = new TestConfigurationService();
		const options = getSessionArchiveActionViewItemOptions({ icon: true }, configurationService);
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, false);
		const disabled = options.onClickAnimation;
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const enabled = options.onClickAnimation;

		assert.deepStrictEqual({
			disabled,
			enabled,
		}, {
			disabled: undefined,
			enabled: ClickAnimation.Confetti,
		});
	});

	test('animates archive actions only after successful completion', async () => {
		const success = new DeferredPromise<void>();
		const successfulViewItem = createArchiveActionViewItem(success.p);
		const successfulClick = successfulViewItem.onClick(new MouseEvent('click'));
		const animationBeforeSuccess = document.body.querySelector('.animation-overlay');
		await success.complete();
		await successfulClick;
		const animationAfterSuccess = document.body.querySelector('.animation-overlay');
		animationAfterSuccess?.remove();

		const failure = new DeferredPromise<void>();
		const failingViewItem = createArchiveActionViewItem(failure.p);
		const failingClick = failingViewItem.onClick(new MouseEvent('click'));
		await failure.error(new Error('Archive failed'));
		await failingClick;

		assert.deepStrictEqual({
			animationBeforeSuccess,
			animationAfterSuccess: !!animationAfterSuccess,
			animationAfterFailure: document.body.querySelector('.animation-overlay'),
		}, {
			animationBeforeSuccess: null,
			animationAfterSuccess: true,
			animationAfterFailure: null,
		});
	});
});
