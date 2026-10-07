/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SideBarVisibleContext } from '../../../workbench/common/contextkeys.js';
import { ACCOUNTS_AVATAR_SETTING, IAuthenticationService } from '../../../workbench/services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatDashboardService } from '../../browser/chatDashboardService.js';
import { ExperimentalMobileTitlebarPart } from '../../browser/mobile/experimentalMobileTitlebarPart.js';
import { MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID } from '../../browser/parts/mobile/contributions/mobileChangesView.js';
import { MobileTitlebarPart } from '../../browser/parts/mobile/mobileTitlebarPart.js';
import { IsNewChatSessionContext } from '../../common/contextkeys.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionFileChange } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

function query<T extends HTMLElement>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	assert.ok(element, selector);
	return element;
}

async function createHarness(store: Pick<DisposableStore, 'add'>, ctor: typeof MobileTitlebarPart) {
	const container = dom.append(mainWindow.document.body, dom.$('div'));
	store.add(toDisposable(() => container.remove()));
	const instantiationService = store.add(new TestInstantiationService());
	const configurationService = new TestConfigurationService({ [ACCOUNTS_AVATAR_SETTING]: false });
	store.add(configurationService.onDidChangeConfigurationEmitter);
	instantiationService.stub(IConfigurationService, configurationService);
	const contextKeyService = store.add(new ContextKeyService(configurationService));
	instantiationService.stub(IContextKeyService, contextKeyService);
	const isNewChat = IsNewChatSessionContext.bindTo(contextKeyService);
	const sidebarVisible = SideBarVisibleContext.bindTo(contextKeyService);
	isNewChat.set(true);
	sidebarVisible.set(false);

	const title = observableValue('title', 'First session');
	const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
	const chat = new class extends mock<IChat>() {
		override readonly changes = changes;
	}();
	const session = new class extends mock<IActiveSession>() {
		override readonly title = title;
		override readonly activeChat = constObservable(chat);
	}();
	const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
	instantiationService.stub(ISessionsService, { activeSession });
	instantiationService.stub(IDefaultAccountService, {
		onDidChangeDefaultAccount: Event.None,
		getDefaultAccount: async () => null,
	});
	instantiationService.stub(IAuthenticationService, {
		onDidChangeSessions: Event.None,
		getSessions: async () => [{ id: 'test-session', accessToken: '', scopes: [], account: { id: 'test-account', label: 'Test Account' } }],
	});
	instantiationService.stub(IChatEntitlementService, {
		onDidChangeEntitlement: Event.None,
		onDidChangeSentiment: Event.None,
		onDidChangeQuotaExceeded: Event.None,
		onDidChangeQuotaRemaining: Event.None,
		entitlement: ChatEntitlement.Pro,
		sentiment: {},
		quotas: {},
	});
	let dashboardDisposals = 0;
	instantiationService.stub(IChatDashboardService, {
		createDashboardElement: dashboardStore => {
			dashboardStore.add(toDisposable(() => dashboardDisposals++));
			return dom.$('div', undefined, 'Account status');
		},
	});
	const commands: string[] = [];
	instantiationService.stub(ICommandService, {
		executeCommand: async id => { commands.push(id); return undefined; },
	});
	const actions = ['First', 'Last', 'Disabled'].map(label => instantiationService.createInstance(MenuItemAction, {
		id: `test.${label}`,
		title: label,
		precondition: label === 'Disabled' ? ContextKeyExpr.false() : undefined,
	}, undefined, undefined, undefined, undefined));
	instantiationService.stub(IMenuService, {
		createMenu: () => ({
			onDidChange: Event.None,
			getActions: () => [['navigation', actions]],
			dispose: () => { },
		}),
	});
	let itemCount = 0;
	let toolbarFocusCount = 0;
	const menuChanged = store.add(new Emitter<MenuWorkbenchToolBar>());
	const toolbar = new class extends mock<MenuWorkbenchToolBar>() {
		override getItemsLength(): number { return itemCount; }
		override get onDidChangeMenuItems(): Event<this> { return Event.map(menuChanged.event, () => this); }
		override focus(): void { toolbarFocusCount++; }
		override dispose(): void { }
	}();
	instantiationService.stubInstance(MenuWorkbenchToolBar, toolbar);

	const bar = store.add(instantiationService.createInstance(ctor, container));
	await timeout(0);
	return {
		bar, container, title, changes, session, activeSession, isNewChat, sidebarVisible, commands,
		getDashboardDisposals: () => dashboardDisposals,
		getToolbarFocusCount: () => toolbarFocusCount,
		setToolbarItems: (count: number) => { itemCount = count; menuChanged.fire(toolbar); },
	};
}

suite('Sessions - MobileTitlebarPart isolation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const ctor of [MobileTitlebarPart, ExperimentalMobileTitlebarPart]) {
		const experimental = ctor === ExperimentalMobileTitlebarPart;

		test(`${ctor.name} keeps its own title presentation and disposes subscriptions`, async () => {
			const h = await createHarness(store, ctor);
			const titleElement = query<HTMLButtonElement>(h.container, '.mobile-session-title');
			const titles = [titleElement.textContent];
			h.activeSession.set(h.session, undefined);
			titles.push(titleElement.textContent);
			h.isNewChat.set(false);
			titles.push(titleElement.textContent);
			h.sidebarVisible.set(true);
			titles.push(titleElement.textContent);
			h.title.set('Renamed session', undefined);
			titles.push(titleElement.textContent);
			h.sidebarVisible.set(false);
			titles.push(titleElement.textContent);
			h.title.set('', undefined);
			titles.push(titleElement.textContent);
			h.bar.setTitle('Override');
			titles.push(titleElement.textContent);
			h.bar.dispose();
			h.title.set('After disposal', undefined);
			h.isNewChat.set(true);
			h.sidebarVisible.set(true);
			titles.push(titleElement.textContent);

			assert.deepStrictEqual(titles, experimental
				? ['Agents', 'Agents', 'First session', 'Sessions', 'Sessions', 'Renamed session', 'New Session', 'Override', 'Override']
				: ['New Session', 'First session', 'First session', 'First session', 'Renamed session', 'Renamed session', 'New Session', 'Override', 'Override']);
		});

		test(`${ctor.name} preserves the shared toolbar, changes pill and navigation actions`, async () => {
			const h = await createHarness(store, ctor);
			const titleElement = query<HTMLButtonElement>(h.container, '.mobile-session-title');
			const newSession = query<HTMLButtonElement>(h.container, '.mobile-new-session-button');
			const account = query<HTMLButtonElement>(h.container, '.mobile-account-indicator');
			const changes = query<HTMLButtonElement>(h.container, '.mobile-changes-pill');
			let newSessionClicks = 0;
			let titleClicks = 0;
			let sidebarClicks = 0;
			store.add(h.bar.onDidClickNewSession(() => newSessionClicks++));
			store.add(h.bar.onDidClickTitle(() => titleClicks++));
			store.add(h.bar.onDidClickHamburger(() => sidebarClicks++));
			h.activeSession.set(h.session, undefined);
			h.changes.set([{ modifiedUri: URI.file('/test/file.ts'), insertions: 3, deletions: 1 }], undefined);
			h.setToolbarItems(1);
			h.sidebarVisible.set(true);
			h.bar.focus();
			const welcome = {
				showActions: h.bar.element.classList.contains('show-actions'),
				newSession: newSession.style.display, account: account.style.display, changes: changes.style.display,
				toolbarFocusCount: h.getToolbarFocusCount(),
			};
			h.isNewChat.set(false);
			h.bar.focus();
			const inChat = {
				showActions: h.bar.element.classList.contains('show-actions'),
				newSession: newSession.style.display, account: account.style.display, changes: changes.style.display,
				titleFocused: dom.getActiveElement() === titleElement,
				added: query(h.container, '.mobile-changes-pill-added').textContent,
				removed: query(h.container, '.mobile-changes-pill-removed').textContent,
			};
			changes.click();
			newSession.click();
			titleElement.click();
			query<HTMLButtonElement>(h.bar.element, '.mobile-top-bar-button').click();
			h.isNewChat.set(true);
			h.setToolbarItems(0);
			h.bar.focus();
			assert.deepStrictEqual({
				welcome, inChat, newSessionClicks, titleClicks, sidebarClicks, commands: h.commands,
				emptyToolbar: !h.bar.element.classList.contains('show-actions') && dom.getActiveElement() === titleElement,
				changesHidden: changes.style.display,
			}, {
				welcome: { showActions: true, newSession: 'none', account: '', changes: 'none', toolbarFocusCount: 1 },
				inChat: { showActions: false, newSession: '', account: 'none', changes: '', titleFocused: true, added: '+3', removed: '-1' },
				newSessionClicks: 1, titleClicks: 1, sidebarClicks: 1, commands: [MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID],
				emptyToolbar: true, changesHidden: 'none',
			});
		});

		test(`${ctor.name} keeps account presentation defaults and cleans up repeated sheets`, async () => {
			const h = await createHarness(store, ctor);
			const account = query<HTMLButtonElement>(h.container, '.mobile-account-indicator');
			account.focus();
			account.click();
			const sheet = query(h.container, '.mobile-account-sheet');
			const close = query<HTMLButtonElement>(sheet, '.mobile-account-sheet-close');
			const initial = {
				role: sheet.getAttribute('role'), modal: sheet.getAttribute('aria-modal'),
				label: sheet.getAttribute('aria-label'), tabIndex: sheet.getAttribute('tabindex'),
				focus: dom.getActiveElement() === close ? 'close' : dom.getActiveElement() === account ? 'account' : 'other',
				profile: query(sheet, '.mobile-account-sheet-name').textContent,
			};
			close.click();
			const closed = {
				sheetRemoved: !sheet.isConnected,
				accountFocused: dom.getActiveElement() === account,
				dashboardDisposals: h.getDashboardDisposals(),
			};
			account.click();
			account.click();
			account.click();
			h.bar.dispose();
			const staleEscape = new mainWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
			sheet.dispatchEvent(staleEscape);
			assert.deepStrictEqual({
				initial, closed, remaining: h.container.childElementCount,
				dashboardDisposals: h.getDashboardDisposals(), staleEscapeHandled: staleEscape.defaultPrevented,
			}, {
				initial: {
					role: experimental ? 'dialog' : null, modal: experimental ? 'true' : null,
					label: experimental ? 'Account' : null, tabIndex: experimental ? '-1' : null,
					focus: experimental ? 'close' : 'account', profile: 'Test Account',
				},
				closed: { sheetRemoved: true, accountFocused: true, dashboardDisposals: 1 },
				remaining: 0, dashboardDisposals: 3, staleEscapeHandled: false,
			});
		});
	}

	test('experimental account sheet wraps focus past disabled actions and restores it on Escape and action invocation', async () => {
		const h = await createHarness(store, ExperimentalMobileTitlebarPart);
		const account = query<HTMLButtonElement>(h.container, '.mobile-account-indicator');
		account.focus();
		account.click();
		const sheet = query(h.container, '.mobile-account-sheet');
		const close = query<HTMLButtonElement>(sheet, '.mobile-account-sheet-close');
		const lastAction = query<HTMLButtonElement>(sheet, '[aria-label="Last"]');
		const backward = new mainWindow.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
		close.dispatchEvent(backward);
		const wrappedBackward = dom.getActiveElement() === lastAction;
		const forward = new mainWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		lastAction.dispatchEvent(forward);
		const wrappedForward = dom.getActiveElement() === close;
		const escape = new mainWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		close.dispatchEvent(escape);
		const dismissed = !sheet.isConnected && dom.getActiveElement() === account;
		account.click();
		query<HTMLButtonElement>(h.container, '[aria-label="First"]').click();

		assert.deepStrictEqual({
			wrappedBackward, wrappedForward, handled: [backward.defaultPrevented, forward.defaultPrevented, escape.defaultPrevented],
			dismissed, accountFocused: dom.getActiveElement() === account,
			sheetRemoved: !h.container.querySelector('.mobile-account-sheet'),
			commands: h.commands, dashboardDisposals: h.getDashboardDisposals(),
		}, {
			wrappedBackward: true, wrappedForward: true, handled: [true, true, true],
			dismissed: true, accountFocused: true, sheetRemoved: true,
			commands: ['test.First'], dashboardDisposals: 2,
		});
	});
});
