/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import type { IBrowserViewModel } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { canvasIdentityEquals, CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, SessionCanvasUri, type CanvasSource, type CanvasState, type ISessionCanvasReference } from '../../../../services/sessions/common/sessionCanvases.js';
import { ISessionCanvasService, SessionCanvasInput, SessionCanvasSerializer } from '../../common/sessionCanvas.js';
import { SessionCanvasPresentation, validateCanvasPresentationUrl } from '../../common/sessionCanvasPresentation.js';
import { canvasEntry, createCanvasState, TestSessionCanvases } from './sessionCanvasTestUtils.js';

suite('Session canvas presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model(id: string) {
		let disposed = false;
		const willDispose = store.add(new Emitter<void>());
		const value = new class extends mock<IBrowserViewModel>() {
			override readonly id = id;
			override readonly onWillDispose = willDispose.event;
			override dispose(): void {
				if (!disposed) {
					disposed = true;
					willDispose.fire();
				}
			}
		}();
		return { value, disposed: () => disposed };
	}

	function fixture() {
		const canvases = store.add(new TestSessionCanvases());
		const models: ReturnType<typeof model>[] = [];
		const urls: string[] = [];
		const presentation = store.add(new SessionCanvasPresentation(canvases, canvases.entries.get()[0].resource, async url => {
			urls.push(url);
			const next = model(String(models.length));
			models.push(next);
			return next.value;
		}));
		return { canvases, models, urls, presentation };
	}

	test('a late same-state credential renewal cannot replace a newer attachment', async () => {
		const { canvases, presentation, urls, models } = fixture();
		presentation.reload();
		await canvases.completeSource(1, 'http://127.0.0.1:43123/new?credential=new');
		await timeout(0);
		await canvases.completeSource(0, 'http://127.0.0.1:43123/old?credential=old');
		await timeout(0);
		assert.deepStrictEqual({
			urls, status: presentation.status.get(), model: presentation.model.get()?.id, disposed: models.map(model => model.disposed()), effects: canvases.effects,
		}, { urls: ['http://127.0.0.1:43123/new?credential=new'], status: 'attached', model: '0', disposed: [false], effects: [] });
	});

	test('incarnation and revision changes fence old pulls and retire the previous native model', async () => {
		const { canvases, presentation, models, urls } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		const before = createCanvasState();
		canvases.setState({ ...before, revision: 2 });
		canvases.setState({ ...before, revision: 3, identity: { ...before.identity, incarnation: 'incarnation-2' } });
		await canvases.completeSource(2, 'https://fixture.invalid/latest');
		await canvases.completeSource(1, 'https://fixture.invalid/stale');
		await timeout(0);
		assert.deepStrictEqual({ urls, disposed: models.map(model => model.disposed()), status: presentation.status.get() },
			{ urls: ['http://127.0.0.1:43123/canvas', 'https://fixture.invalid/latest'], disposed: [true, false], status: 'attached' });
	});

	test('metadata revisions preserve the live page through entry and full-state catch-up', async () => {
		const { canvases, presentation, models, urls } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		const updated = { ...createCanvasState(), title: 'Updated counter', revision: 2 };
		canvases.entries.set([canvasEntry(updated)], undefined);
		const duringCatchUp = { model: presentation.model.get()?.id, disposed: models[0].disposed(), pulls: canvases.sourceRequests.length };
		canvases.state.set(updated, undefined);
		const duringPull = { model: presentation.model.get()?.id, disposed: models[0].disposed(), pulls: canvases.sourceRequests.length };
		await canvases.completeSource(1);
		await timeout(0);
		assert.deepStrictEqual({ duringCatchUp, duringPull, urls, model: presentation.model.get()?.id, status: presentation.status.get() }, {
			duringCatchUp: { model: '0', disposed: false, pulls: 1 },
			duringPull: { model: '0', disposed: false, pulls: 2 },
			urls: ['http://127.0.0.1:43123/canvas'], model: '0', status: 'attached',
		});
	});

	test('adding, changing and removing an icon does not remount the page or replay an effect', async () => {
		const { canvases, presentation, models, urls } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		const original = createCanvasState();
		const states: CanvasState[] = [
			{ ...original, revision: 2, icon: { src: 'https://fixture.invalid/first.png' } },
			{ ...original, revision: 3, icon: { src: 'https://fixture.invalid/second.png' } },
			{ ...original, revision: 4 },
		];
		for (const state of states) {
			canvases.setState(state);
			await canvases.completeSource(canvases.sourceRequests.length - 1);
			await timeout(0);
		}
		assert.deepStrictEqual({
			urls, model: presentation.model.get()?.id, status: presentation.status.get(),
			disposed: models.map(model => model.disposed()), effects: canvases.effects, pulls: canvases.sourceRequests.length,
		}, {
			urls: ['http://127.0.0.1:43123/canvas'], model: '0', status: 'attached',
			disposed: [false], effects: [], pulls: 4,
		});
	});

	test('explicit reload replaces the page even when the resolved source is unchanged', async () => {
		const { canvases, presentation, models, urls } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		presentation.reload();
		await canvases.completeSource(1);
		await timeout(0);
		assert.deepStrictEqual({ urls, disposed: models.map(model => model.disposed()), model: presentation.model.get()?.id, effects: canvases.effects }, {
			urls: ['http://127.0.0.1:43123/canvas', 'http://127.0.0.1:43123/canvas'], disposed: [true, false], model: '1', effects: [],
		});
	});

	test('explicit reload during metadata catch-up still replaces the page once state agrees', async () => {
		const { canvases, presentation, models } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		const updated = { ...createCanvasState(), revision: 2 };
		canvases.entries.set([canvasEntry(updated)], undefined);
		presentation.reload();
		canvases.state.set(updated, undefined);
		await canvases.completeSource(1);
		await timeout(0);
		assert.deepStrictEqual({ disposed: models.map(model => model.disposed()), model: presentation.model.get()?.id, effects: canvases.effects },
			{ disposed: [true, false], model: '1', effects: [] });
	});

	test('a changed source at the same incarnation replaces the live page', async () => {
		const { canvases, presentation, models, urls } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		canvases.setState({ ...createCanvasState(), revision: 2 });
		await canvases.completeSource(1, 'http://127.0.0.1:43123/replacement');
		await timeout(0);
		assert.deepStrictEqual({ urls, disposed: models.map(model => model.disposed()), model: presentation.model.get()?.id }, {
			urls: ['http://127.0.0.1:43123/canvas', 'http://127.0.0.1:43123/replacement'], disposed: [true, false], model: '1',
		});
	});

	test('a failed metadata source refresh retires the retained page', async () => {
		const { canvases, presentation, models } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		canvases.setState({ ...createCanvasState(), revision: 2 });
		await canvases.sourceRequests[1].result.error(new Error('Source resolution failed'));
		await timeout(0);
		assert.deepStrictEqual({ disposed: models.map(model => model.disposed()), model: presentation.model.get(), status: presentation.status.get() },
			{ disposed: [true], model: undefined, status: 'failed' });
	});

	test('a newer full-state trust withdrawal retires the page before its entry catches up', async () => {
		const { canvases, presentation, models } = fixture();
		await canvases.completeSource(0);
		await timeout(0);
		canvases.state.set({ ...createCanvasState(), revision: 2, trust: { status: CanvasTrustStatus.Blocked } }, undefined);
		assert.deepStrictEqual({ disposed: models.map(model => model.disposed()), model: presentation.model.get(), pulls: canvases.sourceRequests.length },
			{ disposed: [true], model: undefined, pulls: 1 });
	});

	test('disposal during a source pull never creates a native view or sends logical close', async () => {
		const { canvases, presentation, models } = fixture();
		presentation.dispose();
		await canvases.completeSource(0);
		await timeout(0);
		assert.deepStrictEqual({ models: models.length, subscriptions: canvases.subscriptions, effects: canvases.effects }, { models: 0, subscriptions: 0, effects: [] });
	});

	test('a native creation that completes after detach is disposed without attachment', async () => {
		const canvases = store.add(new TestSessionCanvases());
		const pending = new DeferredPromise<IBrowserViewModel>();
		const created = model('pending');
		const presentation = store.add(new SessionCanvasPresentation(canvases, createCanvasState().resource, () => pending.p));
		await canvases.completeSource(0);
		await timeout(0);
		presentation.dispose();
		await pending.complete(created.value);
		await timeout(0);
		assert.deepStrictEqual({ disposed: created.disposed(), model: presentation.model.get(), effects: canvases.effects }, { disposed: true, model: undefined, effects: [] });
	});

	test('source renewal queues native creation rather than accumulating concurrent native requests', async () => {
		const canvases = store.add(new TestSessionCanvases());
		const creations: DeferredPromise<IBrowserViewModel>[] = [];
		const presentation = store.add(new SessionCanvasPresentation(canvases, createCanvasState().resource, async () => {
			const pending = new DeferredPromise<IBrowserViewModel>();
			creations.push(pending);
			return pending.p;
		}));
		await canvases.completeSource(0);
		await timeout(0);
		presentation.reload();
		await canvases.completeSource(1);
		await timeout(0);
		const whilePending = creations.length;
		const first = model('first');
		const second = model('second');
		await creations[0].complete(first.value);
		await timeout(0);
		await creations[1].complete(second.value);
		await timeout(0);
		assert.deepStrictEqual({ whilePending, finalCreations: creations.length, firstDisposed: first.disposed(), model: presentation.model.get()?.id },
			{ whilePending: 1, finalCreations: 2, firstDisposed: true, model: 'second' });
	});

	test('entry and full state must agree before source resolution', async () => {
		const canvases = store.add(new TestSessionCanvases());
		const original = createCanvasState();
		canvases.entries.set([canvasEntry({ ...original, revision: 2 })], undefined);
		const presentation = store.add(new SessionCanvasPresentation(canvases, original.resource, async () => model('matching').value));
		const before = { pulls: canvases.sourceRequests.length, status: presentation.status.get() };
		canvases.state.set({ ...original, revision: 2 }, undefined);
		await canvases.completeSource(0);
		await timeout(0);
		assert.deepStrictEqual({ before, pulls: canvases.sourceRequests.length, status: presentation.status.get() },
			{ before: { pulls: 0, status: 'loading' }, pulls: 1, status: 'attached' });
	});

	test('same-revision full state cannot substitute another source, type, instance, or availability', () => {
		const original = createCanvasState();
		const mismatches: CanvasState[] = [
			{ ...original, identity: { ...original.identity, canvasType: 'another-type' } },
			{ ...original, identity: { ...original.identity, instanceId: 'another-instance' } },
			{ ...original, identity: { ...original.identity, source: { kind: CanvasSourceKind.Extension, extensionId: 'another-extension' } } },
			{ ...original, availability: { status: CanvasAvailabilityStatus.NotLoaded } },
		];
		const results = mismatches.map(state => {
			const canvases = store.add(new TestSessionCanvases());
			canvases.state.set(state, undefined);
			const presentation = store.add(new SessionCanvasPresentation(canvases, original.resource, async () => model('unused').value));
			return { status: presentation.status.get(), pulls: canvases.sourceRequests.length };
		});
		assert.deepStrictEqual(results, mismatches.map(() => ({ status: 'loading', pulls: 0 })));
	});

	test('source-less empty and unsupported states remain distinct from provider loss', async () => {
		const results: string[] = [];
		for (const availability of [CanvasAvailabilityStatus.Empty, CanvasAvailabilityStatus.Unsupported, CanvasAvailabilityStatus.NotLoaded]) {
			const f = fixture();
			await f.canvases.completeSource(0, undefined, { availability, source: undefined });
			await timeout(0);
			results.push(`${f.presentation.status.get()}:${f.models.length}`);
		}
		assert.deepStrictEqual(results, ['empty:0', 'unsupported:0', 'unavailable:0']);
	});

	test('logical identity ignores package names and versions but not the registered source identifier', () => {
		const source: CanvasSource = { kind: CanvasSourceKind.Package, sourceId: 'registered-source', packageName: 'counter', version: '1' };
		const original = { ...createCanvasState().identity, source };
		assert.deepStrictEqual([
			canvasIdentityEquals(original, { ...original, source: { ...original.source, packageName: 'renamed-counter', version: '2' } }),
			canvasIdentityEquals(original, { ...original, source: { ...original.source, sourceId: 'another-source' } }),
		], [true, false]);
	});

	test('disconnection and reconnect generations reject stale sources', async () => {
		const { canvases, presentation, urls } = fixture();
		canvases.availability.set('disconnected', undefined);
		const disconnected = presentation.status.get();
		canvases.generation.set(2, undefined);
		canvases.availability.set('available', undefined);
		await canvases.completeSource(0, 'https://fixture.invalid/old-connection');
		await canvases.completeSource(1, 'https://fixture.invalid/current-connection');
		await timeout(0);
		assert.deepStrictEqual({ disconnected, urls, status: presentation.status.get() },
			{ disconnected: 'unavailable', urls: ['https://fixture.invalid/current-connection'], status: 'attached' });
	});

	test('pending approval, blocked, unavailable and removed members do not create native pages', async () => {
		const { canvases, presentation, models } = fixture();
		const statuses: string[] = [];
		const original = createCanvasState();
		canvases.setState({ ...original, trust: { status: CanvasTrustStatus.Pending } });
		statuses.push(presentation.status.get());
		canvases.setState({ ...original, trust: { status: CanvasTrustStatus.Blocked } });
		statuses.push(presentation.status.get());
		canvases.setState({ ...original, availability: { status: CanvasAvailabilityStatus.NotLoaded } });
		statuses.push(presentation.status.get());
		canvases.entries.set([], undefined);
		statuses.push(presentation.status.get());
		await canvases.completeSource(0);
		await timeout(0);
		assert.deepStrictEqual({ statuses, models: models.length, effects: canvases.effects },
			{ statuses: ['pendingTrust', 'blocked', 'unavailable', 'closed'], models: 0, effects: [] });
	});

	test('manual reload retries a failed state subscription without executing the provider', () => {
		const canvases = store.add(new TestSessionCanvases());
		canvases.stateError.set(new Error('Controlled subscription failure'), undefined);
		const presentation = store.add(new SessionCanvasPresentation(canvases, createCanvasState().resource, async () => model('unused').value));
		presentation.reload();
		assert.deepStrictEqual({ status: presentation.status.get(), subscriptions: canvases.subscriptions, total: canvases.totalSubscriptions, pulls: canvases.sourceRequests.length, effects: canvases.effects },
			{ status: 'failed', subscriptions: 1, total: 2, pulls: 0, effects: [] });
	});

	test('mismatched source identity and expired or malformed expiry hints never mount', async () => {
		const values = [
			{ incarnation: 'different' },
			{ revision: 999 },
			{ source: { url: 'https://fixture.invalid/view', expiresAt: '1970-01-01T00:00:00Z' } },
			{ source: { url: 'https://fixture.invalid/view', expiresAt: 'invalid-date' } },
		];
		const statuses: string[] = [];
		for (const value of values) {
			const { canvases, presentation, models } = fixture();
			await canvases.completeSource(0, undefined, value);
			await timeout(0);
			statuses.push(`${presentation.status.get()}:${models.length}`);
		}
		assert.deepStrictEqual(statuses, ['unavailable:0', 'unavailable:0', 'unavailable:0', 'unavailable:0']);
	});

	test('source admission accepts HTTP, HTTPS and file without silently limiting unchanged extensions to loopback', () => {
		const values = ['http://127.0.0.1:3000/canvas', 'https://fixture.invalid/canvas', 'file:///workspace/canvas.html'];
		assert.deepStrictEqual(values.map(validateCanvasPresentationUrl), values);
		for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@fixture.invalid/page', 'https:/missing-authority']) {
			assert.throws(() => validateCanvasPresentationUrl(value));
		}
	});
});

suite('Session canvas logical references', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const reference: ISessionCanvasReference = {
		providerId: 'local-agent-host', session: URI.parse('agent-host-copilotcli:/one'),
		chat: URI.parse('agent-host-copilotcli:/one#peer/one'), canvas: URI.parse('ahp-canvas:/one'),
	};

	test('references distinguish providers, sessions, chats and canvases', () => {
		const values = [
			reference, { ...reference, providerId: 'other-provider' }, { ...reference, session: URI.parse('agent-host-copilotcli:/two') },
			{ ...reference, chat: URI.parse('agent-host-copilotcli:/one#peer/two') }, { ...reference, canvas: URI.parse('ahp-canvas:/two') },
		];
		const resources = values.map(SessionCanvasUri.create);
		assert.deepStrictEqual({ distinct: new Set(resources.map(resource => resource.toString())).size, parsed: resources.map(SessionCanvasUri.parse) }, { distinct: values.length, parsed: values });
	});

	test('serialization and restoration retain only references and never source/effect state', async () => {
		const resource = SessionCanvasUri.create(reference);
		const input = store.add(new SessionCanvasInput(resource));
		const service = new class extends mock<ISessionCanvasService>() {
			override getInput(resource: URI) { return store.add(new SessionCanvasInput(resource)); }
		}();
		const serializer = new SessionCanvasSerializer(service);
		const instantiation = store.add(new TestInstantiationService());
		const serialized = serializer.serialize(input)!;
		const restored = serializer.deserialize(instantiation, serialized);
		await restored?.resolve();
		assert.deepStrictEqual({ serialized: JSON.parse(serialized), descriptor: restored?.toUntyped(), type: restored?.typeId },
			{ serialized: { version: 1, resource: resource.toString() }, descriptor: { resource, options: { override: SessionCanvasInput.EDITOR_ID } }, type: SessionCanvasInput.ID });
	});

	test('malformed references and presentation URLs cannot masquerade as durable canvas keys', () => {
		for (const value of ['https://fixture.invalid/?token=secret', 'ahp-canvas:/one?token=secret', 'ahp-canvas://authority/one']) {
			assert.throws(() => SessionCanvasUri.create({ ...reference, canvas: URI.parse(value) }));
		}
		const resource = SessionCanvasUri.create(reference);
		assert.deepStrictEqual([
			SessionCanvasUri.parse(resource.with({ query: 'secret' })), SessionCanvasUri.parse(resource.with({ authority: 'other' })),
			SessionCanvasUri.parse(URI.parse('vscode-session-canvas:/invalid')),
		], [undefined, undefined, undefined]);
	});
});
