/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { ClickAnimation } from '../../../base/browser/ui/animations/animations.js';
import { ActionRunner } from '../../../base/common/actions.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
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
	const accessibilitySignalService = new class extends mock<IAccessibilitySignalService>() {
		override async playSignal(): Promise<void> { }
	}();

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

	function createArchiveActionViewItem(run: () => Promise<void>): MenuEntryActionViewItem {
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
					await run();
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
		viewItem.actionRunner = disposables.add(new ActionRunner());
		viewItem.element = dom.$('button');
		return viewItem;
	}

	test('uses confetti for archive actions when enabled', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const expected = Object.create(MenuEntryActionViewItem.prototype) as MenuEntryActionViewItem;
		instantiationService.stubInstance<MenuEntryActionViewItem>(MenuEntryActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, configurationService, accessibilitySignalService);

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
		const provider = createSessionActionViewItemProvider(instantiationService, new TestConfigurationService(), accessibilitySignalService);

		assert.strictEqual(provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}), expected);
	});

	test('resolves configured archive animation when clicked', async () => {
		const configurationService = new TestConfigurationService();
		const playedSignals: AccessibilitySignal[] = [];
		const options = getSessionArchiveActionViewItemOptions({ icon: true }, configurationService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal(signal: AccessibilitySignal): Promise<void> {
				playedSignals.push(signal);
			}
		}());
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, false);
		const disabled = options.onClickAnimation;
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const enabled = options.onClickAnimation;
		options.onDidTriggerClickAnimation?.();

		assert.deepStrictEqual({
			disabled,
			enabled,
			playedSignals,
		}, {
			disabled: undefined,
			enabled: ClickAnimation.Confetti,
			playedSignals: [AccessibilitySignal.confetti],
		});
	});

	test('animates archive actions only after successful completion', async () => {
		const success = new DeferredPromise<void>();
		const successfulViewItem = createArchiveActionViewItem(() => success.p);
		const successfulClick = successfulViewItem.onClick(new MouseEvent('click'));
		const animationBeforeSuccess = document.body.querySelector('.animation-overlay');
		await success.complete();
		await successfulClick;
		const animationAfterSuccess = document.body.querySelector('.animation-overlay');
		animationAfterSuccess?.remove();

		const failure = new DeferredPromise<void>();
		const failingViewItem = createArchiveActionViewItem(() => failure.p);
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

	test('keeps confetti at the original button position when archiving disposes the view item', async () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const row = dom.append(workbench, dom.$('div'));
		const completion = new DeferredPromise<void>();
		const viewItem = createArchiveActionViewItem(() => {
			viewItem.dispose();
			row.remove();
			return completion.p;
		});
		const button = viewItem.element!;
		button.style.cssText = 'position: fixed; left: 120px; top: 80px; width: 48px; height: 24px; box-sizing: border-box;';
		row.appendChild(button);

		const click = viewItem.onClick(new MouseEvent('click'));
		const animationBeforeCompletion = document.querySelector('.animation-overlay');
		await completion.complete();
		await click;

		const overlay = document.querySelector<HTMLElement>('.animation-overlay');
		disposables.add(toDisposable(() => overlay?.remove()));
		const particle = overlay?.querySelector<HTMLElement>('.animation-confetti-particle');
		assert.deepStrictEqual({
			animationBeforeCompletion,
			element: viewItem.element,
			buttonConnected: button.isConnected,
			bounds: overlay && [overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height],
			particleOrigin: particle && [particle.style.left, particle.style.top],
			inheritsWorkbenchTheme: overlay?.parentElement === workbench,
		}, {
			animationBeforeCompletion: null,
			element: undefined,
			buttonConnected: false,
			bounds: ['120px', '80px', '48px', '24px'],
			particleOrigin: ['24px', '12px'],
			inheritsWorkbenchTheme: true,
		});
	});

	test('does not animate when archiving fails after disposing the view item', async () => {
		const failure = new DeferredPromise<void>();
		const viewItem = createArchiveActionViewItem(() => {
			viewItem.dispose();
			return failure.p;
		});
		const click = viewItem.onClick(new MouseEvent('click'));
		await failure.error(new Error('Archive failed'));
		await click;

		assert.deepStrictEqual({
			element: viewItem.element,
			animation: document.querySelector('.animation-overlay'),
		}, {
			element: undefined,
			animation: null,
		});
	});
});
