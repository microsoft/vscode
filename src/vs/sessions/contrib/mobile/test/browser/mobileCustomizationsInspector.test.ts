/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider, IHarnessDescriptor, SessionCustomizationInventory } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { SessionTypeAuthRequirement } from '../../../../../workbench/services/sessions/common/session.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { MobileCustomizationsInspector } from '../../browser/mobileCustomizationsInspector.js';

suite('MobileCustomizationsInspector', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const item: ICustomizationItem = { name: 'Reviewer', type: 'agent', source: 'builtin', uri: URI.parse('agent-builtin:/reviewer'), extensionId: undefined, pluginUri: undefined };

	function open(itemProvider?: ICustomizationItemProvider, harnessId?: string) {
		const session = createTestSession('selected').session;
		const descriptors = observableValue<readonly IHarnessDescriptor[]>('descriptors', [{ id: harnessId ?? session.resource.scheme, label: 'Host', icon: Codicon.remote, itemProvider }]);
		const services = workbenchInstantiationService(undefined, store);
		const providers = store.add(services.createInstance(SessionsProvidersService));
		services.stub(ISessionsProvidersService, providers);
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		services.stub(ILayoutService, { mainContainer: container });
		services.stub(ICustomizationHarnessService, { availableHarnesses: descriptors });
		const closed = services.createInstance(MobileCustomizationsInspector).open(session);
		const pages = () => [...container.querySelectorAll<HTMLElement>('.mobile-navigation-page:not(.closing)')];
		const back = () => pages().at(-1)?.querySelector<HTMLButtonElement>('button[aria-label="Back"]')?.click();
		return { session, providers, container, pages, back, closed, message: () => pages().at(-1)?.querySelector('[role=status]')?.textContent };
	}

	const managementOnly: ICustomizationItemProvider = {
		onDidChange: Event.None,
		provideChatSessionCustomizations: () => assert.fail('The inspector must not read the management inventory'),
	};

	test('routes a catalog row to its own attached harness but passes the original public resource', async () => {
		const requested: string[] = [];
		const harnessId = 'remote-environment-b';
		const view = open({
			...managementOnly,
			observeSessionCustomizations: resource => {
				requested.push(resource.toString());
				return constObservable({ kind: 'ready', items: [item] });
			},
		}, harnessId);
		try {
			const unattached = view.message();
			const runtime = upcastPartial<ISessionsProvider>({
				sessionTypes: [{ id: view.session.sessionType, chatSessionType: harnessId, icon: Codicon.remote, label: 'Runtime', authRequirement: SessionTypeAuthRequirement.None }],
				onDidChangeSessionTypes: Event.None,
			});
			store.add(view.providers.registerProvider(upcastPartial<ISessionsProvider>({
				id: view.session.providerId, sessionTypes: [], onDidChangeSessionTypes: Event.None,
				getSessionProvider: sessionId => sessionId === view.session.sessionId ? runtime : undefined,
			})));
			assert.deepStrictEqual({ unattached, requested, row: view.pages()[0].querySelector('.mobile-customizations-labels > span')?.textContent }, {
				unattached: 'This session doesn\'t provide customization details.', requested: [view.session.resource.toString()], row: 'Reviewer',
			});
		} finally {
			view.back();
			await view.closed;
		}
	});

	test('observes the selected session once, keeps Back focus across live updates, and releases it on close', async () => {
		const inventory = observableValue<SessionCustomizationInventory>('inventory', { kind: 'loading' });
		const requests: string[] = [];
		let released = false;
		const view = open({
			...managementOnly,
			observeSessionCustomizations: (uri, reader) => {
				requests.push(uri.toString());
				reader.store.add(toDisposable(() => released = true));
				return inventory;
			},
		});
		try {
			const loading = view.message();
			inventory.set({ kind: 'ready', items: [item] }, undefined);
			const row = view.pages()[0].querySelector<HTMLButtonElement>('.mobile-customizations-row')!;
			row.click();
			const detail = view.message();
			inventory.set({ kind: 'ready', items: [{ ...item, name: 'Updated reviewer' }] }, undefined);
			const updatedRow = view.pages()[0].querySelector<HTMLButtonElement>('.mobile-customizations-row')!;
			const detailPage = view.pages()[1];
			const childrenChanged = dom.sharedMutationObserver.observe(view.container, store.add(new DisposableStore()), { childList: true });
			const detailClosed = Event.toPromise(Event.filter(childrenChanged, () => !detailPage.isConnected));
			view.back();
			await detailClosed;
			assert.deepStrictEqual({ loading, requests, detail, focusRestored: dom.getActiveElement() === updatedRow }, {
				loading: 'Loading customizations…', requests: [view.session.resource.toString()],
				detail: 'This provider doesn\'t share source text for this item.', focusRestored: true,
			});
		} finally {
			while (view.pages().length) {
				view.back();
			}
			await view.closed;
		}
		assert.ok(released);
	});

	test('Accessible View refreshes when the list and source finish loading', async () => {
		const inventory = observableValue<SessionCustomizationInventory>('inventory', { kind: 'loading' });
		const view = open({ ...managementOnly, observeSessionCustomizations: () => inventory });
		try {
			const list = store.add(MobileCustomizationsInspector.getAccessibleProvider(AccessibleViewType.View)!);
			const listChanged = Event.toPromise(list.onDidChangeContent!);
			const loadingList = list.provideContent().includes('Loading customizations');
			inventory.set({ kind: 'ready', items: [{ ...item, uri: URI.file('/repo/reviewer.agent.md') }] }, undefined);
			await listChanged;
			const loadedList = list.provideContent().includes(item.name);
			view.pages()[0].querySelector<HTMLButtonElement>('.mobile-customizations-row')!.click();
			const reader = store.add(MobileCustomizationsInspector.getAccessibleProvider(AccessibleViewType.View)!);
			const sourceChanged = Event.toPromise(reader.onDidChangeContent!);
			const loadingSource = reader.provideContent().includes('Loading source');
			await sourceChanged;
			const article = view.pages()[1].querySelector('article')?.textContent;
			assert.deepStrictEqual({ loadingList, loadedList, loadingSource, loadedSource: !!article && reader.provideContent().includes(article) }, {
				loadingList: true, loadedList: true, loadingSource: true, loadedSource: true,
			});
		} finally {
			while (view.pages().length) {
				view.back();
			}
			await view.closed;
		}
	});

	test('closing accessibility overlays restores the refreshed row or Back if the row disappeared', async () => {
		const inventory = observableValue<SessionCustomizationInventory>('inventory', { kind: 'ready', items: [item] });
		const view = open({ ...managementOnly, observeSessionCustomizations: () => inventory });
		const outside = dom.append(view.container, dom.$('button'));
		const row = () => view.pages()[0].querySelector<HTMLButtonElement>('.mobile-customizations-row')!;
		try {
			row().focus();
			const help = store.add(MobileCustomizationsInspector.getAccessibleProvider(AccessibleViewType.Help)!);
			outside.focus();
			inventory.set({ kind: 'ready', items: [{ ...item, name: 'Updated reviewer' }] }, undefined);
			help.onClose();
			const restoredRow = dom.getActiveElement() === row();

			const reader = store.add(MobileCustomizationsInspector.getAccessibleProvider(AccessibleViewType.View)!);
			outside.focus();
			inventory.set({ kind: 'ready', items: [] }, undefined);
			reader.onClose();
			assert.deepStrictEqual({ restoredRow, restoredBack: dom.getActiveElement() === view.pages()[0].querySelector('[aria-label="Back"]') }, {
				restoredRow: true, restoredBack: true,
			});
		} finally {
			view.back();
			await view.closed;
		}
	});

	test('distinguishes unavailable, failed, incomplete and confirmed empty inventories', async () => {
		const inventory = observableValue<SessionCustomizationInventory>('inventory', { kind: 'unavailable' });
		const view = open({
			...managementOnly,
			observeSessionCustomizations: () => inventory,
		});
		try {
			const unavailable = view.message();
			inventory.set({ kind: 'error', error: new Error('Offline') }, undefined);
			const failed = view.message();
			inventory.set({ kind: 'ready', incomplete: true, items: [item] }, undefined);
			const incomplete = [view.message(), view.pages()[0].querySelector('.mobile-customizations-labels > span')?.textContent];
			inventory.set({ kind: 'ready', items: [] }, undefined);
			assert.deepStrictEqual([unavailable, failed, incomplete, view.message()], ['Customization details are unavailable.', 'Couldn\'t load customizations.', ['The host hasn\'t reported a complete list.', 'Reviewer'], 'No instructions, skills, or agents reported.']);
		} finally {
			view.back();
			await view.closed;
		}
	});

	test('a management-only provider never supplies an exact-session inventory', async () => {
		const view = open(managementOnly);
		try {
			assert.strictEqual(view.message(), 'This session doesn\'t provide customization details.');
		} finally {
			view.back();
			await view.closed;
		}
	});
});
