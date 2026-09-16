/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event, Relay } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewFaviconChangeEvent, IBrowserViewLoadingEvent, IBrowserViewNavigationEvent, IBrowserViewService, IBrowserViewState, IBrowserViewTitleChangeEvent } from '../../../../../platform/browserView/common/browserView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../../common/browserEditorInput.js';
import { BrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';

suite('BrowserViewModel initial state handoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const childUrl = 'http://localhost/popup-child';
	const childTitle = 'Browser Smoke Popup Child';

	function createPopup(delaySubscriptions = false) {
		const trace: string[] = [];
		const navigation = store.add(new Emitter<IBrowserViewNavigationEvent>());
		const title = store.add(new Emitter<IBrowserViewTitleChangeEvent>());
		const loading = store.add(new Emitter<IBrowserViewLoadingEvent>());
		const favicon = store.add(new Emitter<IBrowserViewFaviconChangeEvent>());
		const navigationRelay = store.add(new Relay<IBrowserViewNavigationEvent>());
		const titleRelay = store.add(new Relay<IBrowserViewTitleChangeEvent>());
		const loadingRelay = store.add(new Relay<IBrowserViewLoadingEvent>());
		const faviconRelay = store.add(new Relay<IBrowserViewFaviconChangeEvent>());
		const close = store.add(new Emitter<void>());
		const snapshot = new DeferredPromise<IBrowserViewState>();
		const errors: (string | Error)[] = [];
		const errorLogged = new DeferredPromise<void>();
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(message);
				void errorLogged.complete();
			}
		};
		const connectSubscriptions = () => {
			navigationRelay.input = navigation.event;
			titleRelay.input = title.event;
			loadingRelay.input = loading.event;
			faviconRelay.input = favicon.event;
		};
		if (!delaySubscriptions) {
			connectSubscriptions();
		}
		const initialState: IBrowserViewState = {
			navigationStateVersion: 0,
			url: '',
			title: '',
			canGoBack: false,
			canGoForward: false,
			loading: true,
			focused: false,
			visible: false,
			isDevToolsOpen: false,
			lastScreenshot: undefined,
			lastFavicon: undefined,
			lastError: undefined,
			certificateError: undefined,
			storageScope: BrowserViewStorageScope.Ephemeral,
			storageKeys: {},
			permissions: { origins: {} },
			browserZoomIndex: browserZoomDefaultIndex,
			elementSelectionState: { active: false, options: {} },
			isRemoteSession: false,
			isAreaSelectionActive: false,
			device: undefined,
			audiences: [],
		};
		let state = initialState;
		const destroyed: string[] = [];
		const service = upcastPartial<IBrowserViewService>({
			onDynamicDidNavigate: id => (listener, thisArgs, disposables) => {
				trace.push(`subscribe navigation ${id}`);
				return navigationRelay.event(listener, thisArgs, disposables);
			},
			onDynamicDidChangeTitle: id => (listener, thisArgs, disposables) => {
				trace.push(`subscribe title ${id}`);
				return titleRelay.event(listener, thisArgs, disposables);
			},
			onDynamicDidChangeLoadingState: () => loadingRelay.event,
			onDynamicDidClose: () => close.event,
			onDynamicDidChangePermissions: () => Event.None,
			onDynamicDidChangeDevToolsState: () => Event.None,
			onDynamicDidChangeFavicon: () => faviconRelay.event,
			onDynamicDidChangeOwner: () => Event.None,
			onDynamicDidChangeFocus: () => Event.None,
			onDynamicDidChangeVisibility: () => Event.None,
			onDynamicDidChangeDeviceEmulation: () => Event.None,
			onDynamicDidChangeElementSelectionState: () => Event.None,
			onDynamicDidChangeAreaSelectionActive: () => Event.None,
			onDynamicDidChangeAudiences: () => Event.None,
			onDynamicDidChangeRemoteStatus: () => Event.None,
			getState: async () => assert.fail('Reconciliation must not request screenshots or session data'),
			getNavigationState: id => {
				trace.push(`snapshot requested ${id}`);
				return snapshot.p;
			},
			setBrowserZoomIndex: async () => { },
			destroyBrowserView: async id => { destroyed.push(id); },
			loadURL: async () => { assert.fail('Adopting a popup must not navigate it again'); },
		});
		const workbenchService = upcastPartial<IBrowserViewWorkbenchService>({
			isSharingAvailable: false,
			onDidChangeSharingAvailable: Event.None,
		});

		const setTitle = (pageTitle: string) => {
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, title: pageTitle };
			trace.push(`native title ${pageTitle}`);
			title.fire({ navigationStateVersion: state.navigationStateVersion, title: pageTitle });
		};
		const commit = (url = childUrl, pageTitle = childTitle) => {
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, canGoBack: !!state.url, url, title: '', lastFavicon: undefined };
			trace.push(`native navigation ${url}`);
			navigation.fire(state);
			setTitle(pageTitle);
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, loading: false };
			loading.fire({ navigationStateVersion: state.navigationStateVersion, loading: false });
		};

		const adopt = (creationState = initialState, presentation: Pick<IBrowserEditorInputData, 'title' | 'favicon'> = {}) => {
			trace.push('create model child');
			const model = store.add(new BrowserViewModel(
				'child', { windowId: 1 }, { type: 'user' }, undefined, creationState, service, workbenchService,
				NullTelemetryService, upcastPartial<IDialogService>({}), upcastPartial<IStorageService>({}),
				upcastPartial<IBrowserZoomService>({ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None }),
				upcastPartial<IAgentNetworkFilterService>({ onDidChange: Event.None }),
				logService,
			));
			trace.push('create editor child');
			const input = store.add(new BrowserEditorInput(
				{ id: 'child', url: childUrl, ...presentation }, async () => model,
				upcastPartial<IThemeService>({}), upcastPartial<IInstantiationService>({}), NullTelemetryService, workbenchService,
			));
			input.model = model;
			store.add(input.onDidChangeLabel(() => trace.push(`label ${input.getName()}`)));
			return { model, input };
		};

		return { trace, initialState, get state() { return state; }, snapshot, commit, setTitle, adopt, connectSubscriptions, navigation, title, loading, favicon, close, destroyed, errors, errorLogged };
	}

	test('reconciles a popup that finished loading before model subscription', async () => {
		const popup = createPopup();
		popup.commit();
		const { model, input } = popup.adopt();
		await popup.snapshot.complete(popup.state);
		const resolved = await input.resolve();

		assert.deepStrictEqual({
			id: input.id,
			sameModel: resolved === model,
			nativeUrl: popup.state.url,
			nativeTitle: popup.state.title,
			modelUrl: model.url,
			modelTitle: model.title,
			loading: model.loading,
			label: input.getName(),
			subscribedBeforeSnapshot: popup.trace.indexOf('subscribe title child') < popup.trace.indexOf('snapshot requested child'),
		}, {
			id: 'child',
			sameModel: true,
			nativeUrl: childUrl,
			nativeTitle: childTitle,
			modelUrl: childUrl,
			modelTitle: childTitle,
			loading: false,
			label: childTitle,
			subscribedBeforeSnapshot: true,
		}, JSON.stringify(popup.trace));
	});

	test('recovers updates while remote subscription delivery is delayed', async () => {
		const popup = createPopup(true);
		const { model, input } = popup.adopt();
		popup.commit();
		popup.connectSubscriptions();
		await popup.snapshot.complete(popup.state);

		assert.deepStrictEqual({ url: model.url, title: model.title, loading: model.loading, label: input.getName() }, {
			url: childUrl,
			title: childTitle,
			loading: false,
			label: childTitle,
		});
	});

	test('does not report a new navigation for an unchanged snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt(popup.state);
		const navigations: string[] = [];
		store.add(model.onDidNavigate(event => navigations.push(event.url)));
		await popup.snapshot.complete(popup.state);

		assert.deepStrictEqual({ title: model.title, navigations }, { title: childTitle, navigations: [] });
	});

	test('only emits a title change for a title-only snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model, input } = popup.adopt(popup.state);
		const events: string[] = [];
		store.add(model.onDidNavigate(() => events.push('navigation')));
		store.add(model.onDidChangeTitle(() => events.push('title')));
		store.add(model.onDidChangeFavicon(() => events.push('favicon')));
		store.add(model.onDidChangeLoadingState(() => events.push('loading')));
		await popup.snapshot.complete({ ...popup.state, navigationStateVersion: popup.state.navigationStateVersion + 1, title: 'Updated title' });

		assert.deepStrictEqual({ title: model.title, label: input.getName(), events }, {
			title: 'Updated title', label: 'Updated title', events: ['title'],
		});
	});

	test('only emits a favicon change for a favicon-only snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt(popup.state);
		const events: string[] = [];
		store.add(model.onDidNavigate(() => events.push('navigation')));
		store.add(model.onDidChangeTitle(() => events.push('title')));
		store.add(model.onDidChangeFavicon(() => events.push('favicon')));
		store.add(model.onDidChangeLoadingState(() => events.push('loading')));
		await popup.snapshot.complete({ ...popup.state, navigationStateVersion: popup.state.navigationStateVersion + 1, lastFavicon: 'data:image/png;base64,aWNvbg==' });

		assert.deepStrictEqual({ favicon: model.favicon, events }, {
			favicon: 'data:image/png;base64,aWNvbg==', events: ['favicon'],
		});
	});

	test('a title-only snapshot can clear restored presentation without navigation', async () => {
		const popup = createPopup();
		popup.commit();
		const { model, input } = popup.adopt(popup.state, { title: childTitle });
		const navigations: string[] = [];
		store.add(model.onDidNavigate(event => navigations.push(event.url)));
		await popup.snapshot.complete({ ...popup.state, title: '' });

		assert.deepStrictEqual({ modelTitle: model.title, label: input.getName(), navigations }, {
			modelTitle: '', label: 'localhost', navigations: [],
		});
	});

	test('a favicon-only snapshot can clear restored presentation without navigation', async () => {
		const popup = createPopup();
		popup.commit();
		const favicon = 'data:image/png;base64,aWNvbg==';
		const { model, input } = popup.adopt({ ...popup.state, lastFavicon: favicon }, { favicon });
		const navigations: string[] = [];
		store.add(model.onDidNavigate(event => navigations.push(event.url)));
		await popup.snapshot.complete(popup.state);

		assert.deepStrictEqual({ modelIcon: model.favicon, editorIcon: input.favicon, navigations }, {
			modelIcon: undefined, editorIcon: undefined, navigations: [],
		});
	});

	test('does not emit loading changes for an unchanged snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt(popup.state);
		const loading: IBrowserViewLoadingEvent[] = [];
		store.add(model.onDidChangeLoadingState(event => loading.push(event)));
		await popup.snapshot.complete(popup.state);

		assert.deepStrictEqual({ loading: model.loading, events: loading }, { loading: false, events: [] });
	});

	test('advances the version of an unchanged loading snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt(popup.state);
		const loading: boolean[] = [];
		store.add(model.onDidChangeLoadingState(event => loading.push(event.loading)));
		const snapshot = { ...popup.state, navigationStateVersion: popup.state.navigationStateVersion + 2 };
		await popup.snapshot.complete(snapshot);
		popup.loading.fire({ navigationStateVersion: snapshot.navigationStateVersion - 1, loading: true });

		assert.deepStrictEqual({ loading: model.loading, events: loading }, { loading: false, events: [] });
	});

	test('emits loading changes for changed snapshot errors and subsequent native events', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt(popup.state);
		const loading: IBrowserViewLoadingEvent[] = [];
		store.add(model.onDidChangeLoadingState(event => loading.push(event)));
		const snapshot = { ...popup.state, lastError: { url: childUrl, errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED' } };
		await popup.snapshot.complete(snapshot);
		const nativeEvent = { navigationStateVersion: snapshot.navigationStateVersion + 1, loading: false, error: snapshot.lastError };
		popup.loading.fire(nativeEvent);

		assert.deepStrictEqual(loading, [
			{ navigationStateVersion: snapshot.navigationStateVersion, loading: false, error: snapshot.lastError },
			nativeEvent,
		]);
	});

	test('logs an initial snapshot failure', async () => {
		const popup = createPopup();
		popup.adopt();
		await popup.snapshot.error(new Error('Snapshot unavailable'));
		await popup.errorLogged.p;

		assert.deepStrictEqual(popup.errors, ['[BrowserViewModel] Failed to synchronize initial navigation state.']);
	});

	for (const snapshotFirst of [false, true]) {
		test(`preserves later navigation when the snapshot arrives ${snapshotFirst ? 'before' : 'after'} the events`, async () => {
			const popup = createPopup();
			popup.commit();
			const snapshot = popup.state;
			const { model, input } = popup.adopt();
			const labels: string[] = [];
			store.add(input.onDidChangeLabel(() => labels.push(input.getName())));

			if (snapshotFirst) {
				await popup.snapshot.complete(snapshot);
			}
			popup.commit('http://later.example/child', 'Later child');
			labels.length = 0;
			if (!snapshotFirst) {
				await popup.snapshot.complete(snapshot);
			}

			assert.deepStrictEqual({
				url: model.url,
				title: model.title,
				canGoBack: model.canGoBack,
				loading: model.loading,
				label: input.getName(),
				staleLabels: labels.filter(label => label !== 'Later child'),
			}, {
				url: 'http://later.example/child',
				title: 'Later child',
				canGoBack: true,
				loading: false,
				label: 'Later child',
				staleLabels: [],
			}, JSON.stringify(popup.trace));
		});
	}

	test('recovers missed navigation without overwriting a newer title event', async () => {
		const popup = createPopup();
		popup.commit();
		const snapshot = popup.state;
		const { model, input } = popup.adopt();
		popup.setTitle('Updated child title');
		await popup.snapshot.complete(snapshot);

		assert.deepStrictEqual({ url: model.url, title: model.title, label: input.getName() }, {
			url: childUrl,
			title: 'Updated child title',
			label: 'Updated child title',
		}, JSON.stringify(popup.trace));
	});

	test('ignores older events delivered after a newer snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const olderState = popup.state;
		popup.commit('http://later.example/child', 'Later child');
		const { model, input } = popup.adopt();
		await popup.snapshot.complete(popup.state);
		popup.navigation.fire(olderState);
		popup.title.fire({ navigationStateVersion: olderState.navigationStateVersion, title: 'Stale title' });
		popup.loading.fire({ navigationStateVersion: olderState.navigationStateVersion, loading: true });
		popup.favicon.fire({ navigationStateVersion: olderState.navigationStateVersion, favicon: 'https://old.example/icon.png' });

		assert.deepStrictEqual({ url: model.url, title: model.title, loading: model.loading, favicon: model.favicon, label: input.getName() }, {
			url: 'http://later.example/child',
			title: 'Later child',
			loading: false,
			favicon: undefined,
			label: 'Later child',
		});
	});

	test('does not replace a newer favicon while recovering missed navigation', async () => {
		const popup = createPopup();
		popup.commit();
		const snapshot = popup.state;
		const { model } = popup.adopt();
		popup.favicon.fire({ navigationStateVersion: snapshot.navigationStateVersion + 1, favicon: 'https://new.example/icon.png' });
		await popup.snapshot.complete(snapshot);

		assert.deepStrictEqual({ url: model.url, favicon: model.favicon }, {
			url: childUrl,
			favicon: 'https://new.example/icon.png',
		});
	});

	test('does not replay a loading event already included in the snapshot', async () => {
		const popup = createPopup();
		popup.commit();
		const { model } = popup.adopt();
		const snapshot = { ...popup.state, loading: true };
		await popup.snapshot.complete(snapshot);

		// An aborted load can report false while a competing native navigation is still loading.
		popup.loading.fire({ navigationStateVersion: snapshot.navigationStateVersion, loading: false });

		assert.deepStrictEqual({ title: model.title, loading: model.loading }, { title: childTitle, loading: true });
	});

	for (const closeNative of [true, false]) {
		test(`preserves ${closeNative ? 'native child' : 'editor'} closure coupling during a pending snapshot`, async () => {
			const popup = createPopup();
			const { model, input } = popup.adopt();
			const resolved = await Promise.all([input.resolve(), input.resolve()]);
			if (closeNative) {
				popup.close.fire();
			} else {
				input.dispose();
			}
			popup.commit();
			await popup.snapshot.complete(popup.state);

			assert.deepStrictEqual({
				resolvedSameModel: resolved.every(candidate => candidate === model),
				editorDisposed: input.isDisposed(),
				modelDetached: input.model === undefined,
				destroyed: popup.destroyed,
				lateTitleApplied: model.title !== '',
			}, {
				resolvedSameModel: true,
				editorDisposed: true,
				modelDetached: true,
				destroyed: ['child'],
				lateTitleApplied: false,
			});
		});
	}
});
