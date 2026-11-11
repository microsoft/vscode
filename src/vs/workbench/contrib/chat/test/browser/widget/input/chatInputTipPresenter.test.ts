/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { CommandService } from '../../../../../../services/commands/common/commandService.js';
import { IsSessionsWindowContext } from '../../../../../../common/contextkeys.js';
import { TIP_CATALOG } from '../../../../browser/chatTipCatalog.js';
import { IChatTip, IChatTipService } from '../../../../browser/chatTipService.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../browser/widget/input/chatInputNoticeHost.js';
import { ChatInputTipPresenter } from '../../../../browser/widget/input/chatInputTipPresenter.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('ChatInputTipPresenter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const TIP: IChatTip = { id: 'tip.test', content: { value: 'A tip' } } as IChatTip;

	function createPresenter(store: DisposableStore, noticeHost: ChatInputNoticeHost, options?: { isEligible?: () => boolean; tip?: IChatTip; contextKeyService?: IContextKeyService; getTip?: () => IChatTip | undefined }) {
		let welcomeTipCalls = 0;
		let focusInputCalls = 0;
		let tip = options?.tip ?? TIP;
		const onDidChangeTip = store.add(new Emitter<void>());
		const instantiationService = workbenchInstantiationService(undefined, store) as TestInstantiationService;
		if (options?.contextKeyService) {
			instantiationService.stub(IContextKeyService, options.contextKeyService);
		}
		instantiationService.stub(IChatTipService, {
			getWelcomeTip: () => { welcomeTipCalls++; return options?.getTip ? options.getTip() : tip; },
			onDidChangeTip: onDidChangeTip.event,
			onDidDismissTip: () => toDisposable(() => { }),
			onDidNavigateTip: () => toDisposable(() => { }),
			onDidHideTip: () => toDisposable(() => { }),
			onDidDisableTips: () => toDisposable(() => { }),
			hasMultipleTips: () => false,
		} as Partial<IChatTipService>);

		const container = dom.$('.chat-getting-started-tip-container');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const presenter = instantiationService.createInstance(
			ChatInputTipPresenter,
			{ container, isEligible: options?.isEligible ?? (() => true), focusInput: () => { focusInputCalls++; } },
			noticeHost,
		);
		return {
			presenter,
			container,
			showing: () => container.childElementCount > 0,
			// The slot only docks to the input while it is showing something, so the
			// stack knows whose corners to square without inspecting descendants.
			docked: () => container.classList.contains('chat-input-stack-docked'),
			welcomeTipCalls: () => welcomeTipCalls,
			focusInputCalls: () => focusInputCalls,
			setTip(value: IChatTip) {
				tip = value;
				onDidChangeTip.fire();
			},
		};
	}

	test('shows a tip, yields the space to a notification, and takes it back', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, showing, docked } = createPresenter(store, noticeHost);
		store.add(presenter);

		const initially = { showing: showing(), docked: docked() };
		// A notification owns the space outright; the tip must come off screen and
		// then return on its own once the notification goes away.
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });
		const underNotification = { showing: showing(), docked: docked() };
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);

		assert.deepStrictEqual(
			{ initially, underNotification, after: { showing: showing(), docked: docked() } },
			{
				initially: { showing: true, docked: true },
				underNotification: { showing: false, docked: false },
				after: { showing: true, docked: true }
			});
	});

	test('evaluates the tip once per render', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		// `getWelcomeTip` persists rotation state and reports the tip as shown, so
		// rendering must never ask for it twice for a single appearance.
		const { presenter, welcomeTipCalls } = createPresenter(store, noticeHost);
		store.add(presenter);

		assert.strictEqual(welcomeTipCalls(), 1);
	});

	test('keeps replacement tip arrows clickable after disposing the previous presenter', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ICommandService, store.add(instantiationService.createInstance(CommandService)));
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		const onDidNavigateTip = store.add(new Emitter<IChatTip>());
		const tips = [
			{ id: 'tip.first', content: new MarkdownString('First tip') },
			{ id: 'tip.second', content: new MarkdownString('Second tip') },
		];
		let index = 0;
		const navigate = () => {
			index = 1 - index;
			onDidNavigateTip.fire(tips[index]);
			return tips[index];
		};
		instantiationService.stub(IChatTipService, {
			getWelcomeTip: () => tips[index],
			hasMultipleTips: () => true,
			navigateToNextTip: navigate,
			navigateToPreviousTip: navigate,
			onDidNavigateTip: onDidNavigateTip.event,
			onDidChangeTip: Event.None,
			onDidDismissTip: Event.None,
			onDidHideTip: Event.None,
			onDidDisableTips: Event.None,
		});
		const create = () => {
			const container = dom.append(document.body, dom.$('.chat-getting-started-tip-container'));
			store.add(toDisposable(() => container.remove()));
			const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
			const presenter = store.add(instantiationService.createInstance(ChatInputTipPresenter, {
				container,
				isEligible: () => true,
				focusInput: () => { },
			}, noticeHost));
			return { presenter, container };
		};
		const previous = create();
		const replacement = create();
		previous.presenter.dispose();
		await timeout(100);

		const navigation = [];
		for (const label of ['Next tip', 'Previous tip']) {
			const arrow = replacement.container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
			assert.ok(arrow);
			arrow.click();
			await Promise.resolve();
			navigation.push(replacement.container.querySelector('.rendered-markdown')?.textContent);
		}

		assert.deepStrictEqual({
			navigation,
			visible: !!replacement.presenter.current,
		}, {
			navigation: ['Second tip', 'First tip'],
			visible: true,
		});
	});

	test('refreshes the background send tip when its setting changes without moving focus for unrelated changes', async () => {
		const store = disposables.add(new DisposableStore());
		const key = ChatConfiguration.SendInBackgroundTipEnabled;
		const configuration = new TestConfigurationService({ [key]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const contextKeyService = store.add(new ContextKeyService(configuration));
		contextKeyService.createKey(IsSessionsWindowContext.key, true);
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		contextKeyService.createKey('sessionIsCreated', false);
		const definition = TIP_CATALOG.find(tip => tip.id === 'tip.sendInBackground');
		assert.ok(definition?.when);
		const when = definition.when;
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const fixture = createPresenter(store, noticeHost, {
			contextKeyService,
			getTip: () => contextKeyService.contextMatchesRules(when)
				? { id: definition.id, content: new MarkdownString('[Customize the shortcut](https://example.com)') }
				: undefined,
		});
		store.add(fixture.presenter);

		async function updateConfiguration(setting: string, value: boolean): Promise<void> {
			await configuration.setUserConfiguration(setting, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([setting]),
			}));
		}

		const showing = [fixture.showing()];
		fixture.container.querySelector('a')?.focus();
		await updateConfiguration('editor.wordWrap', true);
		const callsAfterUnrelatedChange = fixture.welcomeTipCalls();
		const focusedAfterUnrelatedChange = fixture.presenter.current?.hasFocus();
		await updateConfiguration(key, false);
		showing.push(fixture.showing());
		await updateConfiguration(key, true);
		showing.push(fixture.showing());
		await updateConfiguration(key, false);
		showing.push(fixture.showing());

		assert.deepStrictEqual({
			showing,
			callsAfterUnrelatedChange,
			focusedAfterUnrelatedChange,
			focusInputCalls: fixture.focusInputCalls(),
		}, {
			showing: [true, false, true, false],
			callsAfterUnrelatedChange: 1,
			focusedAfterUnrelatedChange: true,
			focusInputCalls: 1,
		});
	});

	test('replaces the rendered tip when a contextual provider changes', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const fixture = createPresenter(store, noticeHost);
		store.add(fixture.presenter);

		fixture.setTip({
			id: 'connectorRecommendation.linear',
			content: { value: 'A connector tip' },
			icon: URI.parse('https://example.com/linear.png'),
		} as IChatTip);

		assert.deepStrictEqual({
			text: fixture.container.textContent,
			icon: fixture.container.querySelector<HTMLImageElement>('.chat-tip-icon')?.outerHTML,
			welcomeTipCalls: fixture.welcomeTipCalls(),
			focusable: noticeHost.hasFocusableNotice(),
		}, {
			text: 'A connector tip',
			icon: '<img class="chat-tip-icon" src="https://example.com/linear.png" alt="" aria-hidden="true">',
			welcomeTipCalls: 2,
			focusable: true,
		});
	});

	test('preserves focus when replacing a focused contextual tip', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const fixture = createPresenter(store, noticeHost, {
			tip: { id: 'tip.enable', content: new MarkdownString('[Enable](https://example.com/enable)') },
		});
		store.add(fixture.presenter);
		const enableLink = fixture.container.querySelector<HTMLAnchorElement>('a');
		assert.ok(enableLink);
		enableLink.focus();

		fixture.setTip({
			id: 'tip.enabled',
			content: new MarkdownString('[Manage Shortcut](https://example.com/manage)'),
		});

		assert.deepStrictEqual({
			text: fixture.container.textContent,
			tipHasFocus: fixture.presenter.current?.hasFocus(),
			focusInputCalls: fixture.focusInputCalls(),
		}, {
			text: 'Manage Shortcut',
			tipHasFocus: true,
			focusInputCalls: 0,
		});
	});

	test('renders nothing and holds no space while the surface is ineligible', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, showing, welcomeTipCalls } = createPresenter(store, noticeHost, { isEligible: () => false });
		store.add(presenter);

		assert.deepStrictEqual(
			{ showing: showing(), welcomeTipCalls: welcomeTipCalls(), focusable: noticeHost.hasFocusableNotice() },
			{ showing: false, welcomeTipCalls: 0, focusable: false });
	});

	test('disposing takes the tip down and releases the space', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const { presenter, container, showing } = createPresenter(store, noticeHost);

		const shownBeforeDispose = showing();
		presenter.dispose();

		assert.deepStrictEqual(
			{ shownBeforeDispose, nodesAfterDispose: container.childElementCount, focusable: noticeHost.hasFocusableNotice() },
			{ shownBeforeDispose: true, nodesAfterDispose: 0, focusable: false });
	});
});
