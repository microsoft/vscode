/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel, ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewCommandId, BrowserViewStorageScope, canReuseBrowserView, IBrowserViewCreatedEvent, IBrowserViewCreateOptions, IBrowserViewInfo, IBrowserViewNavigationEvent, IBrowserViewService } from '../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkspaceTrustEnablementService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { BrowserEditorInput, BrowserEditorSerializer } from '../../common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewResolvedPageSource, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { BrowserEditor } from '../../electron-browser/browserEditor.js';
import '../../electron-browser/features/browserAutoReloadFeatures.js';
import { BrowserNavigationFeatures } from '../../electron-browser/features/browserNavigationFeatures.js';
import '../../electron-browser/features/browserEditorErrorFeatures.js';

/**
 * `IBrowserAutoReloadService`'s decorator is not exported from
 * `browserAutoReloadFeatures.js` (it's an internal implementation detail of that
 * out-of-scope feature module). `createDecorator` caches identifiers by their
 * string id, so re-declaring it here with the same id ('browserAutoReloadService')
 * returns the exact same `ServiceIdentifier` the real contribution depends on,
 * letting this test stub it without modifying that module.
 */
interface IMinimalBrowserAutoReloadServiceForTest {
	readonly onDidChangeState: Event<void>;
	isEnabled(id: string): boolean;
	setEnabled(id: string, enabled: boolean): void;
}
const IBrowserAutoReloadServiceForTest = createDecorator<IMinimalBrowserAutoReloadServiceForTest>('browserAutoReloadService');

suite('BrowserViewWorkbenchService - page sources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const source = URI.parse('test-page:/document/one');
	let fixture: ReturnType<typeof createFixture>;

	setup(() => {
		fixture = createFixture(store);
	});

	function page(initialUrl: string): IBrowserViewResolvedPageSource {
		return { initialUrl, owner: { type: 'user' }, session: { scope: BrowserViewStorageScope.Ephemeral } };
	}

	function createInput(id = 'page'): BrowserEditorInput {
		return store.add(fixture.service.getOrCreateLazy({ id, source, title: 'Document' }));
	}

	function createEditor() {
		const parent = mainWindow.document.body.appendChild($('.browser-editor'));
		store.add(toDisposable(() => parent.remove()));
		const editor = store.add(fixture.instantiationService.createInstance(class extends BrowserEditor {
			override layout(): void { }
		}, new TestEditorGroupView(1)));
		editor.create(parent);
		return { editor, parent };
	}

	test('resolves the stable URI again on restoration and copies without reusing the endpoint', async () => {
		const sources: URI[] = [];
		let endpoint = 'http://localhost:41234/?token=first';
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: async resource => {
				sources.push(resource);
				return page(endpoint);
			}
		}));
		const input = createInput();
		await input.resolve();
		const serializer = new BrowserEditorSerializer();
		const serialized = serializer.serialize(input);
		assert.ok(serialized);
		input.dispose();

		endpoint = 'http://localhost:42345/?token=second';
		const restored = serializer.deserialize(fixture.instantiationService, serialized);
		assert.ok(restored instanceof BrowserEditorInput);
		store.add(restored);
		assert.strictEqual(restored.url, undefined);
		await restored.resolve();

		endpoint = 'http://localhost:43456/?token=third';
		const copied = restored.copy();
		assert.ok(copied instanceof BrowserEditorInput);
		store.add(copied);
		await copied.resolve();

		assert.deepStrictEqual({
			serializedKeys: Object.keys(JSON.parse(serialized)),
			sources: sources.map(resource => resource.toString()),
			copiedSource: copied.source?.toString(),
			independentCopy: copied.id !== restored.id && !copied.matches(restored),
			loads: fixture.loads.map(load => load.url),
			nativeSources: fixture.creations.map(create => URI.revive(create.options.source)?.toString()),
			nativeInitialUrls: fixture.creations.map(create => create.options.initialUrl),
			audiences: fixture.creations.map(create => create.options.initialAudiences),
			sessions: fixture.creations.map(create => create.options.session),
		}, {
			serializedKeys: ['id', 'source', 'title'],
			sources: [source.toString(), source.toString(), source.toString()],
			copiedSource: source.toString(),
			independentCopy: true,
			loads: [
				'http://localhost:41234/?token=first',
				'http://localhost:42345/?token=second',
				'http://localhost:43456/?token=third',
			],
			nativeSources: [source.toString(), source.toString(), source.toString()],
			nativeInitialUrls: [undefined, undefined, undefined],
			audiences: [undefined, undefined, undefined],
			sessions: [page('').session, page('').session, page('').session],
		});
	});

	test('never falls back to a stored URL when the resolver is unavailable', async () => {
		const input = store.add(fixture.service.getOrCreateLazy({
			id: 'unavailable',
			source,
			url: 'http://localhost:41234/?token=stale',
		}));

		await assert.rejects(input.resolve(), /No page source resolver/);
		assert.throws(() => input.navigate('http://localhost:41234/'), /Resolve the page source/);
		assert.deepStrictEqual({
			url: input.url,
			error: input.resolveError?.message,
			creations: fixture.creations,
			loads: fixture.loads,
		}, {
			url: undefined,
			error: 'No page source resolver is available for \'test-page\'.',
			creations: [],
			loads: [],
		});
	});

	test('does not attach a surviving native source before resolution and replaces it with fresh options', async () => {
		const stale = await fixture.native.getOrCreateBrowserView('page', {
			host: { windowId: mainWindow.vscodeWindowId },
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Global },
			source,
			initialUrl: 'http://localhost:41234/?token=stale',
		});
		const input = createInput();
		await assert.rejects(input.resolve(), /No page source resolver/);
		assert.deepStrictEqual({
			model: input.model,
			url: input.url,
			creations: fixture.creations.length,
			loads: fixture.loads,
		}, { model: undefined, url: undefined, creations: 1, loads: [] });

		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		await input.resolve();
		assert.deepStrictEqual({
			replaced: fixture.views.get(input.id) !== stale,
			session: fixture.creations[1].options.session,
			url: input.url,
			loads: fixture.loads,
		}, {
			replaced: true,
			session: { scope: BrowserViewStorageScope.Ephemeral },
			url: 'http://localhost:42345/',
			loads: [{ id: input.id, url: 'http://localhost:42345/' }],
		});
	});

	test('rejects another window native source without destroying or navigating it', async () => {
		const foreign = await fixture.native.getOrCreateBrowserView('page', {
			host: { windowId: mainWindow.vscodeWindowId + 1 },
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Ephemeral },
			source,
		});
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		const input = createInput();
		await assert.rejects(input.resolve(), /different workbench window/);

		assert.deepStrictEqual({
			foreignIntact: fixture.views.get(input.id) === foreign,
			creations: fixture.creations.length,
			destroys: fixture.destroys,
			loads: fixture.loads,
		}, { foreignIntact: true, creations: 1, destroys: [], loads: [] });
	});

	test('resolved options do not replace the stable browser id or source', async () => {
		const resolved = { ...page('http://localhost:42345/'), id: 'another-browser', source: URI.parse('another-page:/document') };
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => resolved }));
		const input = createInput();
		await input.resolve();

		assert.deepStrictEqual({
			id: input.id,
			source: input.source?.toString(),
			nativeId: fixture.creations[0].id,
			nativeSource: URI.revive(fixture.creations[0].options.source)?.toString(),
		}, { id: 'page', source: source.toString(), nativeId: 'page', nativeSource: source.toString() });
	});

	test('propagates resolver failures and permits an explicit retry', async () => {
		const failure = new Error('The document is unavailable.');
		let available = false;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: async () => {
				if (!available) {
					throw failure;
				}
				return page('http://localhost:42345/');
			}
		}));
		const input = createInput();
		await assert.rejects(input.resolve(), error => error === failure);
		assert.strictEqual(input.resolveError, failure);

		available = true;
		await input.resolve();
		assert.deepStrictEqual({ error: input.resolveError, loads: fixture.loads }, {
			error: undefined,
			loads: [{ id: input.id, url: 'http://localhost:42345/' }],
		});
	});

	test('reports a cancelled resolver as an unavailable page rather than a blank browser', async () => {
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: async () => { throw new CancellationError(); }
		}));
		const input = createInput();
		await assert.rejects(input.resolve(), /Page source resolution was cancelled/);
		assert.deepStrictEqual({ model: input.model, creations: fixture.creations }, { model: undefined, creations: [] });
	});

	test('rejects an empty resolved URL without creating a browser', async () => {
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page(' ') }));
		await assert.rejects(createInput().resolve(), /did not provide a URL/);
		assert.deepStrictEqual(fixture.creations, []);
	});

	test('cancels pending resolution when its registration is disposed and ignores late results', async () => {
		const result = new DeferredPromise<IBrowserViewResolvedPageSource>();
		let token = CancellationToken.None;
		const registration = store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: (_resource, cancellation) => {
				token = cancellation;
				return result.p;
			}
		}));
		const input = createInput();
		const pending = input.resolve();
		registration.dispose();
		await assert.rejects(pending, /page source is no longer available/);
		await result.complete(page('http://localhost:41234/'));

		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			inputDisposed: input.isDisposed(),
			model: input.model,
			creations: fixture.creations,
			loads: fixture.loads,
		}, {
			cancelled: true,
			inputDisposed: false,
			model: undefined,
			creations: [],
			loads: [],
		});
	});

	test('cancels pending resolution on input disposal without a late native load', async () => {
		const result = new DeferredPromise<IBrowserViewResolvedPageSource>();
		let token = CancellationToken.None;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: (_resource, cancellation) => {
				token = cancellation;
				return result.p;
			}
		}));
		const input = createInput();
		const pending = input.resolve();
		input.dispose();
		await assert.rejects(pending, isCancellationError);
		await result.complete(page('http://localhost:41234/'));

		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			known: fixture.service.getKnownBrowserViews().size,
			creations: fixture.creations,
			loads: fixture.loads,
		}, { cancelled: true, known: 0, creations: [], loads: [] });
	});

	test('immediate retry starts a new generation and old settlement cannot clear or fail it', async () => {
		const first = new DeferredPromise<IBrowserViewResolvedPageSource>();
		const second = new DeferredPromise<IBrowserViewResolvedPageSource>();
		let calls = 0;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: () => ++calls === 1 ? first.p : second.p,
		}));
		const input = createInput();
		const failure = new Error('The endpoint expired.');
		const oldRequest = input.resolve();
		const oldRejected = assert.rejects(oldRequest, error => error === failure);
		input.invalidateSource(failure);
		const retry = input.resolve();
		await oldRejected;
		await first.error(new Error('Late failure from the old provider.'));
		await timeout(0);
		const coalescedRetry = input.resolve();
		await second.complete(page('http://localhost:42345/'));
		const model = await retry;

		assert.deepStrictEqual({
			calls,
			sameModel: await coalescedRetry === model,
			attached: input.model === model,
			error: input.resolveError,
			loads: fixture.loads,
		}, {
			calls: 2,
			sameModel: true,
			attached: true,
			error: undefined,
			loads: [{ id: input.id, url: 'http://localhost:42345/' }],
		});
	});

	test('disposes a late model result without replacing or failing the newer generation', async () => {
		function createModel(url: string) {
			const onWillDispose = store.add(new Emitter<void>());
			let disposed = false;
			const model = store.add(new class extends mock<IBrowserViewModel>() {
				override readonly url = url;
				override readonly title = '';
				override readonly favicon = undefined;
				override readonly onWillDispose = onWillDispose.event;
				override readonly onDidClose = Event.None;
				override readonly onDidChangeTitle = Event.None;
				override readonly onDidChangeFavicon = Event.None;
				override readonly onDidChangeLoadingState = Event.None;
				override readonly onDidNavigate = Event.None;
				override dispose(): void {
					if (!disposed) {
						disposed = true;
						onWillDispose.fire();
					}
				}
			}());
			return { model, isDisposed: () => disposed };
		}

		const stale = createModel('http://localhost:41234/');
		const current = createModel('http://localhost:42345/');
		const staleResult = new DeferredPromise<IBrowserViewModel>();
		const firstFactoryStarted = new DeferredPromise<void>();
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page(current.model.url) }));
		let calls = 0;
		const input = store.add(fixture.instantiationService.createInstance(BrowserEditorInput, { id: 'page', source }, async () => {
			if (++calls === 1) {
				await firstFactoryStarted.complete();
				return staleResult.p;
			}
			return current.model;
		}));
		const first = input.resolve();
		const failure = new Error('The endpoint expired.');
		const firstRejected = assert.rejects(first, error => error === failure);
		await firstFactoryStarted.p;
		input.invalidateSource(failure);
		await input.resolve();
		await firstRejected;
		const staleDisposed = Event.toPromise(stale.model.onWillDispose);
		await staleResult.complete(stale.model);
		await staleDisposed;

		assert.deepStrictEqual({
			calls,
			attached: input.model === current.model,
			staleDisposed: stale.isDisposed(),
			currentDisposed: current.isDisposed(),
			error: input.resolveError,
		}, { calls: 2, attached: true, staleDisposed: true, currentDisposed: false, error: undefined });
	});

	test('unregister and re-register can resolve immediately without reusing the cancelled attempt', async () => {
		const first = new DeferredPromise<IBrowserViewResolvedPageSource>();
		const registration = store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: () => first.p }));
		const input = createInput();
		const oldRequest = input.resolve();
		const oldRejected = assert.rejects(oldRequest, /page source is no longer available/);
		registration.dispose();
		let calls = 0;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: async () => {
				calls++;
				return page('http://localhost:42345/');
			}
		}));
		const model = await input.resolve();
		await oldRejected;
		await first.complete(page('http://localhost:41234/?token=stale'));

		assert.deepStrictEqual({ calls, attached: input.model === model, error: input.resolveError, url: input.url }, {
			calls: 1,
			attached: true,
			error: undefined,
			url: 'http://localhost:42345/',
		});
	});

	test('service disposal cancels outstanding source requests and rejects new registrations', async () => {
		const result = new DeferredPromise<IBrowserViewResolvedPageSource>();
		let token = CancellationToken.None;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: (_resource, cancellation) => {
				token = cancellation;
				return result.p;
			}
		}));
		const pending = fixture.service.resolvePageSource(source, CancellationToken.None);
		fixture.service.dispose();
		await assert.rejects(pending, /resolver is no longer available/);
		await result.complete(page('http://localhost:41234/'));

		assert.throws(() => fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }), /service is disposed/);
		assert.deepStrictEqual({ cancelled: token.isCancellationRequested, creations: fixture.creations }, { cancelled: true, creations: [] });
	});

	test('destroys a native view that finishes creation after input disposal without loading it', async () => {
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:41234/') }));
		const gate = new DeferredPromise<void>();
		fixture.gates.creation = gate.p;
		const input = createInput();
		const pending = input.resolve();
		const rejected = assert.rejects(pending, isCancellationError);
		await fixture.created.p;
		input.dispose();
		await gate.complete();
		await rejected;

		assert.deepStrictEqual({
			known: fixture.service.getKnownBrowserViews().size,
			nativeViews: fixture.views.size,
			loads: fixture.loads,
		}, { known: 0, nativeViews: 0, loads: [] });
	});

	test('does not load a native view when its resolver is removed during creation', async () => {
		const registration = store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:41234/') }));
		const gate = new DeferredPromise<void>();
		fixture.gates.creation = gate.p;
		const input = createInput();
		const pending = input.resolve();
		const rejected = assert.rejects(pending, /page source is no longer available/);
		await fixture.created.p;
		registration.dispose();
		await gate.complete();
		await rejected;

		assert.deepStrictEqual({
			model: input.model,
			nativeViews: fixture.views.size,
			loads: fixture.loads,
		}, { model: undefined, nativeViews: 0, loads: [] });
	});

	test('late creation cleanup does not destroy a replacement owned by another window', async () => {
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		const gate = new DeferredPromise<void>();
		fixture.gates.creation = gate.p;
		const input = createInput();
		const pending = input.resolve();
		const rejected = assert.rejects(pending, isCancellationError);
		await fixture.created.p;
		const oldView = fixture.views.get(input.id);
		assert.ok(oldView);
		const replacement = { ...oldView, host: { windowId: mainWindow.vscodeWindowId + 1 } };
		fixture.views.set(input.id, replacement);
		input.dispose();
		await gate.complete();
		await rejected;

		assert.deepStrictEqual({
			replacementIntact: fixture.views.get(input.id) === replacement,
			destroys: fixture.destroys,
			loads: fixture.loads,
		}, {
			replacementIntact: true,
			destroys: [{ id: input.id, expectedHostWindowId: mainWindow.vscodeWindowId }],
			loads: [],
		});
	});

	test('finishes cancelled native creation before reopening the same browser identity', async () => {
		let endpoint = 'http://localhost:41234/';
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page(endpoint) }));
		const gate = new DeferredPromise<void>();
		fixture.gates.creation = gate.p;
		const input = createInput();
		const pending = input.resolve();
		const rejected = assert.rejects(pending, isCancellationError);
		await fixture.created.p;
		input.dispose();

		endpoint = 'http://localhost:42345/';
		fixture.gates.creation = undefined;
		const reopened = createInput();
		const reopening = reopened.resolve();
		await timeout(0);
		const creationsBeforeCleanup = fixture.creations.length;
		await gate.complete();
		await rejected;
		await reopening;

		assert.deepStrictEqual({
			creationsBeforeCleanup,
			known: fixture.service.getKnownBrowserViews().get(reopened.id) === reopened,
			nativeView: fixture.views.has(reopened.id),
			loads: fixture.loads,
		}, {
			creationsBeforeCleanup: 1,
			known: true,
			nativeView: true,
			loads: [{ id: reopened.id, url: endpoint }],
		});
	});

	test('immediate retry retains native cleanup sequencing for the same input', async () => {
		let endpoint = 'http://localhost:41234/';
		let calls = 0;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: async () => {
				calls++;
				return page(endpoint);
			}
		}));
		const gate = new DeferredPromise<void>();
		fixture.gates.creation = gate.p;
		const input = createInput();
		const first = input.resolve();
		const failure = new Error('The endpoint expired.');
		const rejected = assert.rejects(first, error => error === failure);
		await fixture.created.p;
		input.invalidateSource(failure);
		endpoint = 'http://localhost:42345/';
		fixture.gates.creation = undefined;
		const retry = input.resolve();
		await timeout(0);
		const beforeCleanup = { calls, creations: fixture.creations.length };
		await gate.complete();
		await rejected;
		const model = await retry;

		assert.deepStrictEqual({
			beforeCleanup,
			attached: input.model === model,
			nativeView: fixture.views.has(input.id),
			error: input.resolveError,
			loads: fixture.loads,
		}, {
			beforeCleanup: { calls: 2, creations: 1 },
			attached: true,
			nativeView: true,
			error: undefined,
			loads: [{ id: input.id, url: endpoint }],
		});
	});

	test('disposal vetoes keep pending page resolution alive', async () => {
		const result = new DeferredPromise<IBrowserViewResolvedPageSource>();
		let token = CancellationToken.None;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, {
			resolve: (_resource, cancellation) => {
				token = cancellation;
				return result.p;
			}
		}));
		const input = createInput();
		const veto = store.add(input.onBeforeDispose(event => event.veto()));
		const pending = input.resolve();
		input.dispose();
		const vetoed = { disposed: input.isDisposed(), cancelled: token.isCancellationRequested };
		veto.dispose();
		await result.complete(page('http://localhost:41234/'));
		await pending;

		assert.deepStrictEqual({ vetoed, loaded: fixture.loads.length }, {
			vetoed: { disposed: false, cancelled: false },
			loaded: 1,
		});
	});

	test('invalidates open pages on unregistration and releases registrations and model subscriptions', async () => {
		const removed: string[] = [];
		store.add(fixture.service.onDidUnregisterPageSourceResolver(scheme => removed.push(scheme)));
		const registration = store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:41234/') }));
		const input = createInput();
		const model = await input.resolve();
		let disposedModels = 0;
		store.add(model.onWillDispose(() => disposedModels++));
		registration.dispose();
		registration.dispose();
		await assert.rejects(input.resolve(), /No page source resolver/);

		const replacement = store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		await input.resolve();
		input.dispose();
		const errorAfterDisposal = input.resolveError;
		replacement.dispose();

		assert.deepStrictEqual({
			removed,
			disposedModels,
			nativeViews: fixture.views.size,
			known: fixture.service.getKnownBrowserViews().size,
			navigationListeners: fixture.navigations.get(input.id)?.hasListeners(),
			errorAfterDisposal,
			errorAfterUnregistration: input.resolveError,
			loads: fixture.loads.map(load => load.url),
		}, {
			removed: [source.scheme, source.scheme],
			disposedModels: 1,
			nativeViews: 0,
			known: 0,
			navigationListeners: false,
			errorAfterDisposal: undefined,
			errorAfterUnregistration: undefined,
			loads: ['http://localhost:41234/', 'http://localhost:42345/'],
		});
	});

	test('does not bind an existing ordinary browser to a different source', () => {
		store.add(fixture.service.getOrCreateLazy({ id: 'existing', url: 'https://example.com' }));
		assert.throws(() => fixture.service.getOrCreateLazy({ id: 'existing', source }), /cannot change its page source/);
	});

	test('invalidates an individual source and resolves a fresh endpoint without affecting other pages', async () => {
		let endpoint = 'http://localhost:41234/';
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page(endpoint) }));
		const input = createInput();
		const other = store.add(fixture.service.getOrCreateLazy({ id: 'other', source: source.with({ path: '/document/two' }) }));
		await input.resolve();
		const otherModel = await other.resolve();
		const failure = new Error('The page endpoint expired.');
		input.invalidateSource(failure);
		const invalidated = { model: input.model, error: input.resolveError, otherUnaffected: other.model === otherModel };

		endpoint = 'http://localhost:42345/';
		await input.resolve();

		assert.deepStrictEqual({ invalidated, url: input.url, error: input.resolveError }, {
			invalidated: { model: undefined, error: failure, otherUnaffected: true },
			url: endpoint,
			error: undefined,
		});
	});

	test('shows an accessible unavailable state and attaches the newly resolved page on retry', async () => {
		const { editor, parent } = createEditor();
		const registration = store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:41234/') }));
		const input = createInput();
		await editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None);
		registration.dispose();
		const unavailable = {
			model: editor.model,
			message: parent.querySelector('[role="alert"] .browser-error-detail')?.textContent,
		};

		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		const model = await input.resolve();
		const retried = {
			attached: editor.model === model,
			url: editor.model?.url,
			errorDisplay: parent.querySelector<HTMLElement>('.browser-error-container')?.style.display,
		};
		editor.clearInput();

		assert.deepStrictEqual({ unavailable, retried, detached: editor.model === undefined }, {
			unavailable: { model: undefined, message: 'The page source is no longer available.' },
			retried: { attached: true, url: 'http://localhost:42345/', errorDisplay: 'none' },
			detached: true,
		});
	});

	test('keeps an initial source failure in the browser pane and attaches a later explicit resolution', async () => {
		const { editor, parent } = createEditor();
		const input = createInput();
		await editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None);
		const initial = {
			inputRetained: editor.input === input,
			model: editor.model,
			message: parent.querySelector('[role="alert"] .browser-error-detail')?.textContent,
		};
		let attachments = 0;
		store.add(editor.onDidChangeModel(event => {
			if (event.model) {
				attachments++;
			}
		}));
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		const model = await input.resolve();

		assert.deepStrictEqual({
			initial,
			attached: editor.model === model,
			attachments,
			errorDisplay: parent.querySelector<HTMLElement>('.browser-error-container')?.style.display,
		}, {
			initial: { inputRetained: true, model: undefined, message: 'No page source resolver is available for \'test-page\'.' },
			attached: true,
			attachments: 1,
			errorDisplay: 'none',
		});
	});

	test('focusing an unavailable source preserves its error instead of opening the new-tab URL picker', async () => {
		const { editor, parent } = createEditor();
		const navigation = editor.getContribution(BrowserNavigationFeatures);
		assert.ok(navigation);
		const picker = stub(navigation, 'openUrlPicker');
		store.add(toDisposable(() => picker.restore()));
		await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
		editor.focus();
		await timeout(0);
		const unavailable = {
			pickerCalls: picker.callCount,
			message: parent.querySelector('[role="alert"] .browser-error-detail')?.textContent,
			pageFocused: editor.browserContainer === mainWindow.document.activeElement,
		};
		const blank = store.add(fixture.service.getOrCreateLazy({ id: 'blank' }));
		await editor.setInput(blank, undefined, { newInGroup: true }, CancellationToken.None);
		editor.focus();
		await timeout(0);
		assert.deepStrictEqual({ unavailable, blankPickerCalls: picker.callCount }, {
			unavailable: { pickerCalls: 0, message: 'No page source resolver is available for \'test-page\'.', pageFocused: true },
			blankPickerCalls: 1,
		});
	});

	for (const commandId of [BrowserViewCommandId.Reload, BrowserViewCommandId.HardReload]) {
		test(`${commandId} retries an initially unavailable source in the existing pane`, async () => {
			const { editor, parent } = createEditor();
			const input = createInput();
			await editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None);
			store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
			const command = CommandsRegistry.getCommand(commandId);
			assert.ok(command);
			await fixture.instantiationService.invokeFunction(accessor => command.handler(accessor, editor));
			assert.deepStrictEqual({
				attached: editor.model === input.model,
				url: editor.model?.url,
				error: input.resolveError,
				errorDisplay: parent.querySelector<HTMLElement>('.browser-error-container')?.style.display,
			}, { attached: true, url: 'http://localhost:42345/', error: undefined, errorDisplay: 'none' });
		});
	}

	test('ordinary URL resolution failures still reject editor opening', async () => {
		const { editor } = createEditor();
		const failure = new Error('Native browser creation failed.');
		const input = store.add(fixture.instantiationService.createInstance(BrowserEditorInput, { id: 'ordinary', url: 'https://example.com/' }, async () => {
			throw failure;
		}));

		await assert.rejects(editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None), error => error === failure);
	});

	test('initializes already-live sources lazily and ignores their delayed close after restoration', async () => {
		const sourceView = createViewInfo('page', {
			...page('http://localhost:41234/?token=stale'),
			host: { windowId: mainWindow.vscodeWindowId },
			source,
		});
		const ordinaryView = createViewInfo('ordinary', {
			...page('https://example.com/'),
			host: { windowId: mainWindow.vscodeWindowId },
		});
		fixture = createFixture(store, [sourceView, ordinaryView]);
		await Event.toPromise(fixture.service.onDidChangeBrowserViews);
		const input = fixture.service.getKnownBrowserViews().get(sourceView.id);
		const ordinaryInput = fixture.service.getKnownBrowserViews().get(ordinaryView.id);
		assert.ok(input);
		assert.ok(ordinaryInput);
		store.add(input);
		store.add(ordinaryInput);
		const initialized = { sourceModel: input.model, sourceUrl: input.url, ordinaryUrl: ordinaryInput.url };
		fixture.gates.deferCloseEvents = true;
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page('http://localhost:42345/') }));
		const model = await input.resolve();
		fixture.flushCloseEvents();

		assert.deepStrictEqual({
			initialized,
			attached: input.model === model,
			disposed: input.isDisposed(),
			url: input.url,
			closedViews: fixture.closedViews.map(view => view.id),
		}, {
			initialized: { sourceModel: undefined, sourceUrl: undefined, ordinaryUrl: 'https://example.com/' },
			attached: true,
			disposed: false,
			url: 'http://localhost:42345/',
			closedViews: [sourceView.id],
		});
	});

	test('delayed close of a retired native generation cannot close its replacement', async () => {
		let endpoint = 'http://localhost:41234/';
		store.add(fixture.service.registerPageSourceResolver(source.scheme, { resolve: async () => page(endpoint) }));
		const input = createInput();
		await input.resolve();
		fixture.gates.deferCloseEvents = true;
		input.invalidateSource(new Error('The provider is unavailable.'));
		endpoint = 'http://localhost:42345/';
		const model = await input.resolve();
		fixture.flushCloseEvents();
		const restored = { attached: input.model === model, disposed: input.isDisposed(), url: input.url };
		await fixture.native.destroyBrowserView(input.id, mainWindow.vscodeWindowId);
		fixture.flushCloseEvents();

		assert.deepStrictEqual({ restored, disposedAfterCurrentClose: input.isDisposed(), nativeViews: fixture.views.size }, {
			restored: { attached: true, disposed: false, url: endpoint },
			disposedAfterCurrentClose: true,
			nativeViews: 0,
		});
	});
});

function createFixture(store: Pick<DisposableStore, 'add'>, initialViews: readonly IBrowserViewInfo[] = []) {
	const instantiationService = workbenchInstantiationService(undefined, store);
	const creations: { id: string; options: IBrowserViewCreateOptions }[] = [];
	const loads: { id: string; url: string }[] = [];
	const destroys: { id: string; expectedHostWindowId: number | undefined }[] = [];
	const views = new Map(initialViews.map(view => [view.id, view]));
	const navigations = new Map<string, Emitter<IBrowserViewNavigationEvent>>();
	const closeEvents = new Map<IBrowserViewInfo, Emitter<void>>();
	const closedViews: IBrowserViewInfo[] = [];
	const pendingCloseEvents: (() => void)[] = [];
	const onDidCreate = store.add(new Emitter<IBrowserViewCreatedEvent>());
	const created = new DeferredPromise<void>();
	const gates: { creation?: Promise<void>; deferCloseEvents?: boolean } = {};

	function closeEvent(view: IBrowserViewInfo): Emitter<void> {
		let emitter = closeEvents.get(view);
		if (!emitter) {
			emitter = store.add(new Emitter<void>());
			closeEvents.set(view, emitter);
		}
		return emitter;
	}

	function closeView(view: IBrowserViewInfo): void {
		views.delete(view.id);
		const event = closeEvent(view);
		const deliver = () => {
			closedViews.push(view);
			event.fire();
		};
		if (gates.deferCloseEvents) {
			pendingCloseEvents.push(deliver);
		} else {
			deliver();
		}
	}

	function flushCloseEvents(): void {
		for (const deliver of pendingCloseEvents.splice(0)) {
			deliver();
		}
	}

	const native = new class extends mock<IBrowserViewService>() {
		override readonly onDidCreateBrowserView = onDidCreate.event;
		override async getBrowserViews(windowId?: number): Promise<IBrowserViewInfo[]> {
			return [...views.values()].filter(view => windowId === undefined || view.host.windowId === windowId);
		}
		override async updateWindowConfiguration(): Promise<void> { }
		override async getOrCreateBrowserView(id: string, options: IBrowserViewCreateOptions): Promise<IBrowserViewInfo> {
			const creation = gates.creation;
			const existing = views.get(id);
			if (existing) {
				if (canReuseBrowserView(existing, options)) {
					return existing;
				}
				closeView(existing);
			}
			creations.push({ id, options });
			const info = createViewInfo(id, options);
			views.set(id, info);
			onDidCreate.fire({ info });
			await created.complete();
			await creation;
			return info;
		}
		override async destroyBrowserView(id: string, expectedHostWindowId?: number): Promise<void> {
			destroys.push({ id, expectedHostWindowId });
			const view = views.get(id);
			if (view && (expectedHostWindowId === undefined || view.host.windowId === expectedHostWindowId)) {
				closeView(view);
			}
		}
		override async loadURL(id: string, url: string): Promise<void> {
			loads.push({ id, url });
			const view = views.get(id);
			assert.ok(view);
			view.state.url = url;
			navigations.get(id)?.fire({ url, title: 'Live page', canGoBack: false, canGoForward: false, certificateError: undefined });
		}
		override async setBrowserZoomIndex(): Promise<void> { }
		override onDynamicDidNavigate(id: string): Event<IBrowserViewNavigationEvent> {
			let event = navigations.get(id);
			if (!event) {
				event = store.add(new Emitter<IBrowserViewNavigationEvent>());
				navigations.set(id, event);
			}
			return event.event;
		}
		override onDynamicDidClose(id: string): Event<void> {
			const view = views.get(id);
			assert.ok(view);
			return closeEvent(view).event;
		}
		override onDynamicDidChangePermissions() { return Event.None; }
		override onDynamicDidChangeLoadingState() { return Event.None; }
		override onDynamicDidChangeDevToolsState() { return Event.None; }
		override onDynamicDidChangeTitle() { return Event.None; }
		override onDynamicDidChangeFavicon() { return Event.None; }
		override onDynamicDidChangeOwner() { return Event.None; }
		override onDynamicDidChangeFocus() { return Event.None; }
		override onDynamicDidChangeVisibility() { return Event.None; }
		override onDynamicDidChangeDeviceEmulation() { return Event.None; }
		override onDynamicDidChangeElementSelectionState() { return Event.None; }
		override onDynamicDidChangeAreaSelectionActive() { return Event.None; }
		override onDynamicDidChangeAudiences() { return Event.None; }
		override onDynamicDidChangeRemoteStatus() { return Event.None; }
	}();
	const server = ProxyChannel.fromService(native, store.add(new DisposableStore()));
	const channel: IChannel = {
		call: (command, arg, token) => server.call(undefined, command, arg, token),
		listen: (event, arg) => server.listen(undefined, event, arg),
	};
	instantiationService.stub(IMainProcessService, { getChannel: () => channel });
	instantiationService.stub(INativeWorkbenchEnvironmentService, { userHome: URI.file('/test/browser-source-home') });
	instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());
	instantiationService.stub(IWorkspaceTrustManagementService, store.add(new class extends TestWorkspaceTrustManagementService {
		override getTrustedUris(): URI[] { return []; }
	}()));
	instantiationService.stub(IAgentNetworkFilterService, {
		isEnabled: () => false,
		isUriAllowed: () => true,
		onDidChange: Event.None,
	});
	instantiationService.stub(IBrowserZoomService, {
		getEffectiveZoomIndex: () => browserZoomDefaultIndex,
		onDidChangeZoom: Event.None,
	});
	// BrowserEditor.createEditor() instantiates every registered BrowserEditorContribution,
	// including BrowserEditorAutoReloadContribution, which requires this service.
	instantiationService.stub(IBrowserAutoReloadServiceForTest, {
		isEnabled: () => false,
		setEnabled: () => { },
		onDidChangeState: Event.None,
	});
	const service = store.add(instantiationService.createInstance(BrowserViewWorkbenchService));
	instantiationService.stub(IBrowserViewWorkbenchService, service);
	return { service, instantiationService, creations, loads, destroys, views, gates, created, navigations, native, closedViews, flushCloseEvents };
}

function createViewInfo(id: string, options: IBrowserViewCreateOptions): IBrowserViewInfo {
	return {
		id,
		source: options.source,
		host: options.host,
		owner: options.owner,
		state: {
			url: options.initialUrl ?? '',
			title: '',
			canGoBack: false,
			canGoForward: false,
			loading: false,
			focused: false,
			visible: false,
			isDevToolsOpen: false,
			lastScreenshot: undefined,
			lastFavicon: undefined,
			lastError: undefined,
			certificateError: undefined,
			storageScope: typeof options.session === 'string' ? BrowserViewStorageScope.Ephemeral : options.session.scope,
			storageKeys: {},
			permissions: { origins: {} },
			browserZoomIndex: browserZoomDefaultIndex,
			elementSelectionState: { active: false, options: {} },
			isRemoteSession: false,
			isAreaSelectionActive: false,
			device: undefined,
			audiences: [],
		}
	};
}
