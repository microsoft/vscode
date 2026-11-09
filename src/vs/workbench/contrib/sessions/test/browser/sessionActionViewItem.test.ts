/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ClickAnimation } from '../../../../../base/browser/ui/animations/animations.js';
import { ActionRunner } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IMenuEntryActionViewItemOptions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationHandle, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_SESSION_GROUP_COMMAND_ID } from '../../common/sessionCommands.js';
import { createSessionActionViewItemProvider, getSessionArchiveActionViewItemOptions, SessionArchiveActionViewItem } from '../../browser/sessionActionViewItem.js';

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

	function createArchiveActionViewItem(run: () => Promise<void>, options: IMenuEntryActionViewItemOptions = { onClickAnimation: ClickAnimation.Confetti }, notificationService = new TestNotificationService(), reducedMotion = false): SessionArchiveActionViewItem {
		const action = new MenuItemAction(
			{ id: ARCHIVE_SESSION_COMMAND_ID, title: 'Mark as Done', icon: Codicon.check },
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
		const viewItem = disposables.add(new SessionArchiveActionViewItem(
			action,
			options,
			new TestExperimentTriggerTelemetryService(),
			new MockKeybindingService(),
			notificationService,
			new class extends mock<IContextKeyService>() { }(),
			new TestThemeService(),
			new class extends mock<IContextMenuService>() { }(),
			new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return reducedMotion; }
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
		const expected = Object.create(SessionArchiveActionViewItem.prototype) as SessionArchiveActionViewItem;
		instantiationService.stubInstance<SessionArchiveActionViewItem>(SessionArchiveActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, configurationService);

		assert.deepStrictEqual({
			archive: provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}),
			archiveGroup: provider(createMenuItemAction(ARCHIVE_SESSION_GROUP_COMMAND_ID), {}),
			other: provider(createMenuItemAction('sessions.other'), {}),
		}, {
			archive: expected,
			archiveGroup: expected,
			other: undefined,
		});
	});

	test('uses an archive action view item when disabled', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const expected = Object.create(SessionArchiveActionViewItem.prototype) as SessionArchiveActionViewItem;
		instantiationService.stubInstance<SessionArchiveActionViewItem>(SessionArchiveActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, new TestConfigurationService());

		assert.deepStrictEqual([
			provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}),
			provider(createMenuItemAction(ARCHIVE_SESSION_GROUP_COMMAND_ID), {}),
		], [expected, expected]);
	});

	for (const reducedMotion of [false, true]) {
		test(`reports the confetti experiment trigger when Mark as Done is clicked without confetti${reducedMotion ? ', except with reduced motion' : ''}`, async () => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const viewItem = disposables.add(new SessionArchiveActionViewItem(
				createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID),
				getSessionArchiveActionViewItemOptions({}, new TestConfigurationService({ [SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: false })),
				telemetryService,
				new MockKeybindingService(),
				new TestNotificationService(),
				new class extends mock<IContextKeyService>() { }(),
				new TestThemeService(),
				new class extends mock<IContextMenuService>() { }(),
				new class extends TestAccessibilityService {
					override isMotionReduced(): boolean { return reducedMotion; }
				}(),
			));
			viewItem.actionRunner = disposables.add(new ActionRunner());
			viewItem.element = dom.$('button');

			const beforeClick = [...telemetryService.triggers];
			await viewItem.onClick(new MouseEvent('click'));

			assert.deepStrictEqual({ beforeClick, afterClick: telemetryService.triggers }, {
				beforeClick: [],
				afterClick: reducedMotion ? [] : [`config.${SESSIONS_MARK_AS_DONE_CONFETTI_SETTING}`],
			});
		});
	}

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

	for (const reducedMotion of [false, true]) {
		test(`acknowledges pointer and keyboard archive immediately without allowing repeated input (${reducedMotion ? 'reduced' : 'full'} motion)`, async () => {
			for (const input of ['pointer', 'keyboard']) {
				const completion = new DeferredPromise<void>();
				let calls = 0;
				const viewItem = createArchiveActionViewItem(async () => {
					calls++;
					await completion.p;
				}, { onClickAnimation: ClickAnimation.Confetti }, undefined, reducedMotion);
				const container = dom.append(document.body, dom.$('div'));
				disposables.add(toDisposable(() => container.remove()));
				container.classList.toggle('monaco-reduce-motion', reducedMotion);
				const actionBar = disposables.add(new ActionBar(container, {
					actionRunner: viewItem.actionRunner,
					actionViewItemProvider: () => viewItem,
				}));
				actionBar.push(viewItem.action);
				actionBar.focus(0);
				const label = container.querySelector<HTMLElement>('.action-label')!;
				const keyboard = () => {
					for (const type of ['keydown', 'keyup']) {
						actionBar.getContainer().dispatchEvent(new KeyboardEvent(type, { keyCode: 13, bubbles: true }));
					}
				};
				const finished = Event.toPromise(viewItem.actionRunner.onDidRun);
				const click = input === 'pointer' ? viewItem.onClick(new MouseEvent('click')) : keyboard();
				await viewItem.onClick(new MouseEvent('click'));
				keyboard();

				assert.deepStrictEqual({
					calls,
					busy: label.getAttribute('aria-busy'),
					disabled: label.getAttribute('aria-disabled'),
					label: label.getAttribute('aria-label'),
					spinner: !!label.querySelector('.codicon-loading.codicon-modifier-spin'),
					buttonSpinning: label.classList.contains('codicon-modifier-spin'),
					focused: document.activeElement === label,
					connected: label.isConnected,
					animation: document.querySelector('.animation-overlay'),
				}, {
					calls: 1,
					busy: 'true',
					disabled: 'true',
					label: 'Mark as Done (in progress)',
					spinner: true,
					buttonSpinning: false,
					focused: true,
					connected: true,
					animation: null,
				});
				await completion.complete();
				await finished;
				await click;
				const overlay = document.querySelector('.animation-overlay');
				const animated = !!overlay;
				overlay?.remove();

				assert.deepStrictEqual({
					busy: label.getAttribute('aria-busy'),
					disabled: label.getAttribute('aria-disabled'),
					label: label.getAttribute('aria-label'),
					spinner: !!label.querySelector('.codicon-loading'),
					check: label.classList.contains('codicon-check'),
					focused: document.activeElement === label,
					animated,
				}, {
					busy: 'false',
					disabled: null,
					label: 'Mark as Done',
					spinner: false,
					check: true,
					focused: true,
					animated: input === 'pointer' && !reducedMotion,
				});
			}
		});
	}

	test('restores the archive action on failure and permits retry without celebrating', async () => {
		const failure = new DeferredPromise<void>();
		const errors: NotificationMessage[] = [];
		let calls = 0;
		const viewItem = createArchiveActionViewItem(async () => {
			if (++calls === 1) {
				await failure.p;
			}
		}, { onClickAnimation: ClickAnimation.Confetti }, new class extends TestNotificationService {
			override error(error: NotificationMessage): INotificationHandle {
				errors.push(error);
				return super.error(error);
			}
		}());
		const container = dom.append(document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		viewItem.render(container);
		viewItem.focus();
		const label = container.querySelector<HTMLElement>('.action-label')!;
		const click = viewItem.onClick(new MouseEvent('click'));
		const error = new Error('Archive failed');
		await failure.error(error);
		await click;
		const failedState = {
			busy: label.getAttribute('aria-busy'),
			enabled: viewItem.isEnabled(),
			focused: document.activeElement === label,
			check: label.classList.contains('codicon-check'),
			animation: document.querySelector('.animation-overlay'),
		};
		await viewItem.onClick(new MouseEvent('click'));
		document.querySelector('.animation-overlay')?.remove();
		assert.deepStrictEqual({ failedState, errors, calls }, {
			failedState: { busy: 'false', enabled: true, focused: true, check: true, animation: null },
			errors: [error],
			calls: 2,
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

	for (const confirmed of [false, true]) {
		test(`checks animation eligibility against the original context after disposal (${confirmed})`, async () => {
			const context = { confirmed };
			const configurationService = new TestConfigurationService({ [SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: true });
			let checkedContext: unknown;
			const viewItem = createArchiveActionViewItem(async () => {
				viewItem.dispose();
				viewItem.setActionContext(undefined);
			}, getSessionArchiveActionViewItemOptions({}, configurationService, value => {
				checkedContext = value;
				return value === context && confirmed;
			}));
			viewItem.setActionContext(context);
			await viewItem.onClick(new MouseEvent('click'));
			const overlay = document.body.querySelector('.animation-overlay');
			overlay?.remove();

			assert.deepStrictEqual({ context: checkedContext, animated: !!overlay }, { context, animated: confirmed });
		});
	}

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

		const animations = overlay?.getAnimations({ subtree: true }) ?? [];
		const finished = Promise.all(animations.map(animation => animation.finished));
		animations.forEach(animation => animation.finish());
		await finished;
		await Promise.resolve();

		assert.deepStrictEqual({
			overlayConnected: overlay?.isConnected,
			animationsReleased: animations.every(animation => animation.playState === 'idle'),
		}, {
			overlayConnected: false,
			animationsReleased: true,
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
