/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, isHTMLElement } from '../../../../../base/browser/dom.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ArtifactSnapshot, IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { ArtifactIntegrationPresentation } from '../../browser/artifactIntegrationPresentation.js';

suite('Artifact Integration Presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const instantiation = store.add(new TestInstantiationService());
		const hovers = new Map<HTMLElement, IDelayedHoverOptions | (() => IDelayedHoverOptions)>();
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(target: HTMLElement, options: IDelayedHoverOptions | (() => IDelayedHoverOptions)) {
				hovers.set(target, options);
				return toDisposable(() => hovers.delete(target));
			}
		}());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: string | Error): void { throw new Error(String(error)); }
		}());
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() { }());
		instantiation.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		const snapshot = observableValue<ArtifactSnapshot>('artifact', {
			authority: { id: 'client', targetHost: 'host', location: 'client' }, session: 'session',
			artifact: { id: 'artifact', label: 'Original', resource: 'https://example.test' }, mainIntegrationId: 'test', runs: [],
			contributions: [{
				integrationId: 'test', label: 'Test',
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} }, options: [],
				actions: [{ id: 'analyse', label: 'Analyse', iconId: 'search', kind: 'prompt' }],
				view: {
					availability: { kind: 'available' }, main: { icon: { id: 'link' }, label: '<img src=x>', detailsId: 'main' },
					sections: [{ id: 'status', icon: { id: 'check' }, label: 'Ready', detailsId: 'status' }],
					stateActions: [{ id: 'analyse', enabled: true }], generalActions: [], automationAvailability: [],
				},
			}],
		});
		let opened = 0;
		let closed = 0;
		let resourceOpens = 0;
		let chat = 'invoking-chat';
		const invokedChats: string[] = [];
		const model: IArtifactModel = {
			snapshot,
			configure: async () => { },
			cancel: async () => { },
			reconcile: async () => { },
			getRuns: async () => ({ runs: [] }),
			invoke: async (_integration, actionId, destination, requestId) => {
				invokedChats.push(destination);
				return { id: requestId, requestId, bindingId: 'binding', actionId, actionKind: 'prompt', actionConsent: 'consent', source: 'manual', state: 'queued', createdAt: 0, updatedAt: 0, reason: 'Analyse', chat: destination, dispatched: false };
			},
			acquireDetails: async () => {
				opened++;
				const lifetime = toDisposable(() => closed++);
				return {
					details: constObservable({ title: 'Plain <b>details</b>', availability: { kind: 'available' as const }, links: [], items: [], completeness: 'complete' as const }),
					dispose: () => lifetime.dispose(),
				};
			},
		};
		const presentation = store.add(instantiation.createInstance(ArtifactIntegrationPresentation, model, () => chat));
		const base: IChatPillEntry = { id: 'artifact', label: 'Original', open: () => { resourceOpens++; } };
		const entry = derived(reader => presentation.decorate(base, reader));
		const container = $('.test-artifact-pill');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const item = entry.get().inlinePill!.createActionViewItem!({});
		assert.ok(item);
		store.add(item);
		item.render(container);
		return { presentation, snapshot, base, entry, container, item, hovers, counts: () => ({ opened, closed, resourceOpens }), invokedChats, setChat: (value: string) => { chat = value; } };
	}

	test('structured parts are separate labeled controls and provider text is never HTML', () => {
		const f = fixture();
		assert.deepStrictEqual({
			labels: [...f.container.querySelectorAll<HTMLElement>('[role="button"]')].map(element => element.textContent),
			images: f.container.querySelectorAll('img').length,
			details: f.counts().opened,
		}, { labels: ['<img src=x>', 'Ready', 'Actions'], images: 0, details: 0 });
	});

	test('detail leases are lazy, survive unrelated state updates, and close with the surface', async () => {
		const f = fixture();
		const main = f.container.querySelector<HTMLElement>('.chat-pill-button')!;
		const factory = f.hovers.get(main);
		assert.strictEqual(typeof factory, 'function');
		const hover = typeof factory === 'function' ? factory() : undefined;
		assert.ok(hover && isHTMLElement(hover.content));
		assert.deepStrictEqual(f.counts(), { opened: 0, closed: 0, resourceOpens: 0 });
		hover.onDidShow?.();
		await Promise.resolve();
		main.focus();
		f.snapshot.set({ ...f.snapshot.get(), artifact: { ...f.snapshot.get().artifact, label: 'Updated' } }, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({ opened: f.counts().opened, focused: mainWindow.document.activeElement === main, markup: hover.content.querySelectorAll('b').length }, { opened: 1, focused: true, markup: 0 });
		hover.onDidHide?.();
		assert.deepStrictEqual(f.counts(), { opened: 1, closed: 1, resourceOpens: 0 });
	});

	test('resource opening remains separate from background action dispatch', async () => {
		const f = fixture();
		f.container.querySelector<HTMLElement>('.chat-pill-button')!.click();
		const invoking = f.presentation.invoke('test', 'analyse');
		f.setChat('another-chat');
		await invoking;
		assert.deepStrictEqual({ opens: f.counts().resourceOpens, chats: f.invokedChats }, { opens: 1, chats: ['invoking-chat'] });
	});

	test('a provider section named main does not replace the main details control', () => {
		const f = fixture();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, sections: contribution.view.sections.map(section => ({ ...section, id: 'main' })) },
			})),
		}, undefined);
		const factory = f.hovers.get(f.container.querySelector<HTMLElement>('.chat-pill-button')!);
		assert.ok(typeof factory === 'function');
		const hover = factory();
		assert.ok(isHTMLElement(hover.content));
		assert.deepStrictEqual(
			[...hover.content.querySelectorAll<HTMLElement>('[aria-label="Details"] [role="button"]')].map(element => element.textContent),
			['<img src=x>', 'Ready'],
		);
	});

	test('removing the focused action keeps focus in the details panel', () => {
		const f = fixture();
		const factory = f.hovers.get(f.container.querySelector<HTMLElement>('.chat-pill-button')!);
		assert.ok(typeof factory === 'function');
		const hover = factory();
		assert.ok(isHTMLElement(hover.content));
		f.container.appendChild(hover.content);
		const action = hover.content.querySelector<HTMLElement>('[aria-label="Actions"] [role="button"]')!;
		action.focus();
		f.snapshot.set({
			...f.snapshot.get(),
			contributions: f.snapshot.get().contributions.map(contribution => ({
				...contribution, view: { ...contribution.view, stateActions: [] },
			})),
		}, undefined);
		assert.deepStrictEqual({
			focused: mainWindow.document.activeElement === hover.content,
			oldActionConnected: action.isConnected,
		}, { focused: true, oldActionConnected: false });
	});

	test('live updates preserve the action bar tab-stop policy', () => {
		const f = fixture();
		f.item.setFocusable(false);
		f.snapshot.set({ ...f.snapshot.get(), artifact: { ...f.snapshot.get().artifact, label: 'Updated' } }, undefined);
		assert.deepStrictEqual(
			[...f.container.querySelectorAll<HTMLElement>('.artifact-pill-sections [role="button"]')].map(element => element.tabIndex),
			[-1, -1],
		);
	});

	test('an empty registry leaves the existing entry unchanged', () => {
		const f = fixture();
		f.snapshot.set({ ...f.snapshot.get(), contributions: [], mainIntegrationId: undefined }, undefined);
		assert.strictEqual(f.entry.get(), f.base);
	});
});
