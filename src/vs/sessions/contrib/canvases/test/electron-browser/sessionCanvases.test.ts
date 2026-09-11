/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, type ISettableObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { unsupportedAgentHostCanvasState, type AgentHostCanvasJson, type IAgentHostCanvasInstance, type IAgentHostCanvasState } from '../../../../../platform/agentHost/common/agentHostCanvases.js';
import { BrowserViewStorageScope } from '../../../../../platform/browserView/common/browserView.js';
import { AgentHostLocalCanvasesSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, NoOpNotification } from '../../../../../platform/notification/common/notification.js';
import { QuickInputHideReason, type IQuickInputHideEvent, type IQuickInputService, type IQuickPick, type IQuickPickDidAcceptEvent, type IQuickPickItem, type QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import type { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import type { ITextDiffEditorPane } from '../../../../../workbench/common/editor.js';
import { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import type { IBrowserViewModel, IBrowserViewPageSourceResolver, IBrowserViewResolvedPageSource, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import type { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import type { IEditorService, IVisibleEditorsChangeEvent } from '../../../../../workbench/services/editor/common/editorService.js';
import type { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import type { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus, type IChat } from '../../../../services/sessions/common/session.js';
import { isLoopbackCanvasUrl, SessionCanvasSource, unavailableSessionCanvasState, type ISessionCanvasIdentity, type ISessionCanvases } from '../../../../services/sessions/common/sessionCanvases.js';
import type { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionCanvasActions } from '../../browser/sessionCanvasActions.js';
import { SessionCanvasService } from '../../browser/sessionCanvasService.js';

suite('Session Canvases', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const instance: IAgentHostCanvasInstance = {
		extensionId: 'user:test', canvasId: 'counter', instanceId: 'one',
		availability: 'ready', url: 'http://localhost:41000/?token=old',
	};
	const liveState: IAgentHostCanvasState = {
		supported: true,
		catalog: [{ extensionId: instance.extensionId, canvasId: instance.canvasId, displayName: 'Counter', description: '', actions: [{ name: 'increment' }] }],
		instances: [instance],
	};

	function fixture(quickInputService: IQuickInputService = upcastPartial<IQuickInputService>({}), initialState = liveState) {
		const calls: { operation: string; chat: string; input?: AgentHostCanvasJson }[] = [];
		const statuses = new Map<string, ISettableObservable<SessionStatus>>();
		function collection(chat: string) {
			const state = observableValue('canvasState', initialState);
			const generation = observableValue('canvasGeneration', 0);
			const loading = observableValue('canvasLoading', false);
			const error = observableValue<Error | undefined>('canvasError', undefined);
			let live = initialState;
			let actionError: Error | undefined;
			const canvases: ISessionCanvases = {
				hostId: 'local', state, connectionGeneration: generation, loading, error,
				refresh: async () => { calls.push({ operation: 'get', chat }); state.set(live, undefined); return live; },
				open: async params => {
					calls.push({ operation: 'open', chat, input: params.input });
					const opened: IAgentHostCanvasInstance = { ...params, availability: 'ready', url: 'http://localhost:42000/' };
					live = { ...live, instances: [...live.instances, opened] };
					state.set(live, undefined);
					return opened;
				},
				invokeAction: async params => {
					calls.push({ operation: params.actionName, chat, input: params.input });
					if (actionError) {
						throw actionError;
					}
					return { result: { count: 3 } };
				},
				close: async instanceId => {
					calls.push({ operation: 'close', chat });
					live = { ...live, instances: live.instances.filter(instance => instance.instanceId !== instanceId) };
					state.set(live, undefined);
				},
				reload: async () => { calls.push({ operation: 'reload', chat }); },
			};
			return {
				canvases,
				state,
				generation,
				loading,
				error,
				setLive: (next: IAgentHostCanvasState) => { live = next; },
				publish: (next: IAgentHostCanvasState) => { live = next; state.set(next, undefined); },
				failAction: (error: Error) => { actionError = error; },
			};
		}
		const main = collection('main');
		const peer = collection('peer');
		const other = collection('other');
		function chat(resource: string, canvases: ISessionCanvases): IChat {
			const status = observableValue<SessionStatus>('chatStatus', SessionStatus.Completed);
			statuses.set(resource, status);
			return upcastPartial<IChat>({
				resource: URI.parse(resource), title: constObservable(resource), canvases,
				status, interactivity: constObservable(ChatInteractivity.Full),
			});
		}
		const mainChat = chat('agent-host-copilot:/one', main.canvases);
		const peerChat = chat('agent-host-copilot:/one#peer', peer.canvases);
		const otherChat = chat('agent-host-copilot:/two', other.canvases);
		const firstActiveChat = observableValue('firstActiveChat', peerChat);
		const secondActiveChat = observableValue('secondActiveChat', otherChat);
		const first = upcastPartial<IActiveSession>({
			sessionId: 'first', providerId: 'local-agent-host', resource: mainChat.resource,
			chats: constObservable([mainChat, peerChat]), mainChat: constObservable(mainChat), activeChat: firstActiveChat, isArchived: constObservable(false),
		});
		const second = upcastPartial<IActiveSession>({
			sessionId: 'second', providerId: 'local-agent-host', resource: otherChat.resource,
			chats: constObservable([otherChat]), mainChat: constObservable(otherChat), activeChat: secondActiveChat, isArchived: constObservable(false),
		});
		const sessions = [first, second];
		const active = observableValue<IActiveSession | undefined>('active', second);
		const visible = observableValue<readonly IActiveSession[]>('visible', []);
		const preservedFocusRequests: boolean[] = [];
		let navigate: (() => Promise<void>) | undefined;
		let sessionTraversals = 0;
		function activate(session: IActiveSession, chat: IChat): void {
			(session === first ? firstActiveChat : secondActiveChat).set(chat, undefined);
			active.set(session, undefined);
			visible.set([session], undefined);
		}
		const sentiment = observableValue<IChatSentiment>('sentiment', { hidden: false });
		const browserChanged = store.add(new Emitter<void>());
		const sourceUnregistered = store.add(new Emitter<string>());
		const visibleEditorsChanged = store.add(new Emitter<IVisibleEditorsChangeEvent>());
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const inputs = new Map<string, BrowserEditorInput>();
		let visibleEditors: BrowserEditorInput[] = [];
		const invalidations: string[] = [];
		const editorsOpened: object[] = [];
		const editorsFocused: object[] = [];
		let openEditor: (() => Promise<void>) | undefined;
		const notifications: string[] = [];
		const closedNotifications: string[] = [];
		const resolveCalls: { id: string; result: Promise<IBrowserViewModel> }[] = [];
		const modelRequests: { id: string; token: CancellationToken; source: IBrowserViewResolvedPageSource | undefined }[] = [];
		const modelRequested = store.add(new Emitter<void>());
		let resolveModel: ((source: IBrowserViewResolvedPageSource | undefined) => Promise<IBrowserViewModel>) | undefined;
		function createModel(url: string): IBrowserViewModel {
			const disposing = store.add(new Emitter<void>());
			let disposed = false;
			return store.add(upcastPartial<IBrowserViewModel>({
				url, onWillDispose: disposing.event, onDidClose: Event.None,
				onDidChangeTitle: Event.None, onDidChangeFavicon: Event.None,
				onDidChangeLoadingState: Event.None, onDidNavigate: Event.None,
				dispose: () => {
					if (!disposed) {
						disposed = true;
						disposing.fire();
					}
				},
			}));
		}
		let resolver: IBrowserViewPageSourceResolver | undefined;
		const browser: IBrowserViewWorkbenchService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: browserChanged.event,
			onDidUnregisterPageSourceResolver: sourceUnregistered.event,
			getKnownBrowserViews: () => inputs,
			registerPageSourceResolver: (scheme, registered) => {
				resolver = registered;
				return toDisposable(() => { resolver = undefined; sourceUnregistered.fire(scheme); });
			},
			resolvePageSource: (source, token) => {
				if (!resolver) {
					throw new Error('No source resolver');
				}
				return resolver.resolve(source, token);
			},
			registerContextualFilter: () => Disposable.None,
			getOrCreateLazy: data => {
				let input = inputs.get(data.id);
				if (!input) {
					input = store.add(new class extends BrowserEditorInput {
						override invalidateSource(error: Error): void {
							invalidations.push(data.id);
							super.invalidateSource(error);
						}
						override resolve(): Promise<IBrowserViewModel> {
							const result = super.resolve();
							resolveCalls.push({ id: data.id, result });
							return result;
						}
					}(data, async (token, source) => {
						modelRequests.push({ id: data.id, token, source });
						modelRequested.fire();
						return resolveModel ? resolveModel(source) : createModel(source?.initialUrl ?? '');
					}, upcastPartial<IThemeService>({}), NullTelemetryService, browser));
					store.add(Event.once(input.onWillDispose)(() => { inputs.delete(data.id); browserChanged.fire(); }));
					inputs.set(data.id, input);
					browserChanged.fire();
				}
				return input;
			},
		});
		const management = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: sessionsChanged.event, getSessions: () => { sessionTraversals++; return sessions; },
			getSession: resource => sessions.find(session => isEqual(session.resource, resource)),
		});
		const navigation = store.add(new MutableDisposable<CancellationTokenSource>());
		function startNavigation(): CancellationToken {
			navigation.value?.cancel();
			navigation.value = new CancellationTokenSource();
			return navigation.value.token;
		}
		startNavigation();
		const views = upcastPartial<ISessionsService>({
			activeSession: active, visibleSessions: visible,
			captureNavigation: () => navigation.value!.token,
			openChat: async (session, chatUri, options) => {
				startNavigation();
				preservedFocusRequests.push(!!options?.preserveFocus);
				if (navigate) {
					await navigate();
					return;
				}
				const selectedSession = sessions.find(candidate => isEqual(candidate.resource, session.resource));
				const selectedChat = selectedSession?.chats.get().find(chat => isEqual(chat.resource, chatUri));
				if (selectedSession && selectedChat) {
					activate(selectedSession, selectedChat);
				}
			},
		});
		const editorService = upcastPartial<IEditorService>({
			get visibleEditors() { return visibleEditors; },
			onDidVisibleEditorsChange: visibleEditorsChanged.event,
			openEditor: async input => {
				editorsOpened.push(input);
				await openEditor?.();
				return upcastPartial<ITextDiffEditorPane>({ focus: () => editorsFocused.push(input) });
			},
		});
		const notificationService = upcastPartial<INotificationService>({
			prompt: (_severity, message) => {
				notifications.push(message);
				const closed = store.add(new Emitter<void>());
				let isClosed = false;
				return new class extends NoOpNotification {
					override readonly onDidClose = closed.event;
					override close(): void {
						if (!isClosed) {
							isClosed = true;
							closedNotifications.push(message);
							closed.fire();
						}
					}
				}();
			},
			info: () => { }, error: () => { },
		});
		const configuration = new TestConfigurationService({ [AgentHostLocalCanvasesSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const service = store.add(new SessionCanvasService(management, views, browser, editorService, upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }), notificationService, configuration));
		const actions = new SessionCanvasActions(service, upcastPartial<ISessionContext>({ session: constObservable(first) }), quickInputService, notificationService);
		const identity: ISessionCanvasIdentity = {
			hostId: main.canvases.hostId, providerId: first.providerId, session: first.resource, chat: mainChat.resource,
			extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: instance.instanceId,
		};
		return {
			service, actions, main, peer, other, first, second, mainChat, peerChat, active, visible, sentiment, configuration,
			browser, inputs, browserChanged, invalidations, editorsOpened, editorsFocused, notifications, closedNotifications,
			calls, resolveCalls, modelRequests, modelRequested, createModel,
			statuses, activate, startNavigation, preservedFocusRequests,
			setNavigation: (value: typeof navigate) => { navigate = value; },
			setEditorOpen: (value: typeof openEditor) => { openEditor = value; },
			getSessionTraversals: () => sessionTraversals,
			source: SessionCanvasSource.create(identity), identity, getResolver: () => resolver,
			showEditors: (editors: BrowserEditorInput[]) => { visibleEditors = editors; visibleEditorsChanged.fire({ isExplicit: true }); },
			setModelResolver: (value: typeof resolveModel) => { resolveModel = value; },
			removeSession: (session: IActiveSession) => {
				sessions.splice(sessions.indexOf(session), 1);
				sessionsChanged.fire({ added: [], removed: [session], changed: [] });
			},
		};
	}

	function quickInputFixture() {
		const shown = new DeferredPromise<void>();
		let visible = false;
		let itemWrites = 0;
		let secondaryPicks = 0;
		let activeLabels: () => string[] = () => [];
		let selectedLabels: () => string[] = () => [];
		let busy: () => boolean = () => false;
		let labels: () => string[] = () => [];
		let placeholder: () => string | undefined = () => undefined;
		let choose: (description: string) => void = () => { throw new Error('Picker not created'); };
		let accept: () => void = () => { throw new Error('Picker not created'); };
		let hide: () => void = () => { throw new Error('Picker not created'); };
		const service = new class extends mock<IQuickInputService>() {
			override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T>;
			override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: true }> | IQuickPick<T> {
				const accepted = store.add(new Emitter<IQuickPickDidAcceptEvent>());
				const hidden = store.add(new Emitter<IQuickInputHideEvent>());
				let items: readonly QuickPickInput<T>[] = [];
				let active: readonly T[] = [];
				let selected: readonly T[] = [];
				const picker: IQuickPick<T, { useSeparators: true }> = upcastPartial<IQuickPick<T, { useSeparators: true }>>({
					get items() { return items; },
					set items(value) {
						itemWrites++;
						items = value;
						const first = items.find((item): item is T => item.type !== 'separator');
						active = selected = first ? [first] : [];
					},
					get activeItems() { return active; },
					set activeItems(value) { active = value; },
					get selectedItems() { return selected; },
					set selectedItems(value) { selected = value; },
					onDidAccept: accepted.event,
					onDidHide: hidden.event,
					show: () => { visible = true; void shown.complete(); },
					hide: () => {
						if (visible) {
							visible = false;
							hidden.fire({ reason: QuickInputHideReason.Gesture });
						}
					},
					dispose: () => { accepted.dispose(); hidden.dispose(); },
				});
				activeLabels = () => active.map(item => item.description ?? item.label);
				selectedLabels = () => selected.map(item => item.description ?? item.label);
				busy = () => picker.busy;
				labels = () => items.filter((item): item is T => item.type !== 'separator').map(item => item.label);
				placeholder = () => picker.placeholder;
				choose = description => {
					const item = items.find((item): item is T => item.type !== 'separator' && item.description === description);
					assert.ok(item);
					active = selected = [item];
				};
				accept = () => accepted.fire({ inBackground: false });
				hide = () => picker.hide();
				return picker;
			}
			override async pick(): Promise<undefined> {
				secondaryPicks++;
				return undefined;
			}
		};
		return {
			service, shown,
			choose: (description: string) => choose(description),
			accept: () => accept(),
			hide: () => hide(),
			labels: () => labels(),
			placeholder: () => placeholder(),
			snapshot: () => ({ active: activeLabels(), selected: selectedLabels(), busy: busy(), visible, itemWrites, secondaryPicks }),
		};
	}

	test('source identity preserves host, provider, owning chat and instance, never endpoint or input', () => {
		const f = fixture();
		const peer = SessionCanvasSource.create({ ...f.identity, chat: f.peerChat.resource });
		const anotherHost = SessionCanvasSource.create({ ...f.identity, hostId: 'another-host' });
		const restored = SessionCanvasSource.parse(URI.parse(f.source.toString()));
		assert.deepStrictEqual({
			roundTrip: restored && { ...restored, session: restored.session.toString(), chat: restored.chat.toString() },
			distinct: new Set([f.source.toString(), peer.toString(), anotherHost.toString()]).size,
			containsEndpoint: f.source.toString().includes('token') || f.source.toString().includes('localhost'),
			invalid: SessionCanvasSource.parse(f.source.with({ query: 'url=http://localhost' })),
		}, { roundTrip: { ...f.identity, session: f.identity.session.toString(), chat: f.identity.chat.toString() }, distinct: 3, containsEndpoint: false, invalid: undefined });
	});

	test('allows only exact loopback HTTP endpoints as initial URLs', () => {
		const urls = [
			'http://localhost:1234/', 'https://127.0.0.1:1234/?token=abc', 'http://[::1]:1234/',
			'http://localhost.evil.test/', 'http://127.0.0.1.evil.test/', 'http://localhost@evil.test/',
			'file:///reviewed.html', 'data:text/html,hello', 'http://127.1/', 'http://localhost\\@evil.test/',
		];
		assert.deepStrictEqual(urls.map(isLoopbackCanvasUrl), [true, true, true, false, false, false, false, false, false, false]);
	});

	test('restoration resolves a fresh live endpoint without SDK open or editor presentation', async () => {
		const f = fixture();
		f.main.setLive({ ...liveState, instances: [{ ...instance, url: 'http://127.0.0.1:42000/?token=fresh' }] });
		const result = await f.getResolver()!.resolve(f.source, CancellationToken.None);
		assert.deepStrictEqual({ result, calls: f.calls, editors: f.editorsOpened }, {
			result: { initialUrl: 'http://127.0.0.1:42000/?token=fresh', owner: { type: 'user' }, session: { scope: BrowserViewStorageScope.Ephemeral }, appPolicy: { allowedOrigin: 'http://127.0.0.1:42000', allowExternalLinks: undefined } },
			calls: [{ operation: 'get', chat: 'main' }], editors: [],
		});
	});

	test('explicit reveal reuses the source editor and activates its owning chat without SDK open', async () => {
		const f = fixture();
		const existing = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source, title: 'Canvas' });
		const target = f.service.getTarget(f.first.resource, f.mainChat.resource);
		await f.service.reveal(target, 'one');
		await f.service.reveal(target, 'one');
		assert.deepStrictEqual({
			editorReuse: f.editorsOpened.map(input => input === existing),
			activeSession: f.active.get()?.sessionId,
			activeChat: f.active.get()?.activeChat.get() === f.mainChat,
			preservedFocusRequests: f.preservedFocusRequests,
			mutations: f.calls.filter(call => call.operation !== 'get'),
			knownEditorCount: f.inputs.size,
		}, { editorReuse: [true, true], activeSession: 'first', activeChat: true, preservedFocusRequests: [true, true], mutations: [], knownEditorCount: 1 });
	});

	test('explicit open admits an untitled chat without sending a preparatory message', async () => {
		const f = fixture();
		f.statuses.get(f.mainChat.resource.toString())!.set(SessionStatus.Untitled, undefined);
		f.activate(f.first, f.mainChat);
		f.removeSession(f.first);
		const target = f.service.getTarget(f.first.resource, f.mainChat.resource);
		await f.service.open(target, { extensionId: 'user:test', canvasId: 'counter', instanceId: 'canvas-first', input: { documentId: 'first' } });
		assert.deepStrictEqual(f.calls.filter(call => call.operation !== 'get'), [
			{ operation: 'open', chat: 'main', input: { documentId: 'first' } },
		]);
	});

	test('preview off withdraws presentation and rejects effects even with a cached supported capability', async () => {
		const f = fixture();
		await f.configuration.setUserConfiguration(AgentHostLocalCanvasesSettingId, false);
		f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: section => section === AgentHostLocalCanvasesSettingId,
		}));
		assert.strictEqual(f.service.enabled.get(), false);
		assert.throws(() => f.service.getTarget(f.first.resource, f.mainChat.resource));
		assert.deepStrictEqual(f.calls, []);
	});

	test('AI-disable withdraws effects even when the Agents window entitlement remains visible', async () => {
		const f = fixture();
		await f.configuration.setUserConfiguration('chat.disableAIFeatures', true);
		f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: section => section === 'chat.disableAIFeatures',
		}));
		assert.throws(() => f.service.getTarget(f.first.resource, f.mainChat.resource));
		assert.deepStrictEqual({ enabled: f.service.enabled.get(), calls: f.calls }, { enabled: false, calls: [] });
	});

	for (const gate of ['preview', 'AI-setting', 'AI-entitlement'] as const) {
		for (const initialState of ['live', 'unavailable'] as const) {
			test(`${gate} disablement replaces ${initialState} canvas errors with truthful re-enable guidance`, async () => {
				const f = fixture();
				const input = f.browser.getOrCreateLazy({ id: 'disabled-canvas', source: f.source, title: 'Canvas' });
				if (initialState === 'live') {
					await input.resolve();
				} else {
					input.invalidateSource(new Error('This canvas is unavailable. Refresh Canvases or retry after restarting its provider.'));
				}
				if (gate === 'AI-entitlement') {
					f.sentiment.set({ hidden: true }, undefined);
				} else {
					const setting = gate === 'preview' ? AgentHostLocalCanvasesSettingId : 'chat.disableAIFeatures';
					await f.configuration.setUserConfiguration(setting, gate !== 'preview');
					f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === setting }));
				}
				await assert.rejects(f.service.resolve(f.source, CancellationToken.None), /Enable the local canvases preview and AI features in Settings/);
				assert.deepStrictEqual({
					error: input.resolveError?.message,
					hasModel: !!input.model,
					source: input.source,
					logicalInstances: f.main.state.get().instances,
					effects: f.calls.filter(call => call.operation !== 'get'),
				}, {
					error: 'Local canvases are disabled. Enable the local canvases preview and AI features in Settings before retrying.',
					hasModel: false, source: f.source, logicalInstances: [instance], effects: [],
				});
			});
		}
	}

	test('workspace overrides cannot negate a global canvas or AI gate', async () => {
		const enabled: boolean[] = [];
		for (const settings of [
			{ [AgentHostLocalCanvasesSettingId]: false, 'chat.disableAIFeatures': false },
			{ [AgentHostLocalCanvasesSettingId]: true, 'chat.disableAIFeatures': true },
		]) {
			const f = fixture();
			await f.configuration.setUserConfiguration('chat.disableAIFeatures', false);
			const globalConfiguration = new TestConfigurationService(settings);
			store.add(globalConfiguration.onDidChangeConfigurationEmitter);
			f.configuration.inspect = <T>(key: string) => globalConfiguration.inspect<T>(key);
			f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
			enabled.push(f.service.enabled.get());
		}
		assert.deepStrictEqual(enabled, [false, false]);
	});

	test('first open reveals its instance after the draft graduates to a new canvas facade', async () => {
		const f = fixture();
		f.statuses.get(f.mainChat.resource.toString())!.set(SessionStatus.Untitled, undefined);
		f.activate(f.first, f.mainChat);
		const retainedChat: IChat = { ...f.mainChat, status: constObservable(SessionStatus.Completed), canvases: { ...f.main.canvases } };
		const retainedSession: IActiveSession = { ...f.first, chats: constObservable([retainedChat]), activeChat: constObservable(retainedChat) };
		const revealRetainedSession = async () => {
			f.active.set(retainedSession, undefined);
			f.visible.set([retainedSession], undefined);
		};
		f.setNavigation(revealRetainedSession);
		const open = f.main.canvases.open;
		f.main.canvases.open = async params => {
			const result = await open(params);
			await revealRetainedSession();
			return result;
		};
		await f.service.open(f.service.getTarget(f.first.resource, f.mainChat.resource), {
			extensionId: 'user:test', canvasId: 'counter', instanceId: 'retained-first',
		});
		assert.deepStrictEqual({
			effects: f.calls.filter(call => call.operation !== 'get').map(call => call.operation),
			editors: f.editorsOpened.length,
		}, { effects: ['open'], editors: 1 });
	});

	for (const operation of ['open', 'open-refresh', 'reveal'] as const) {
		for (const supersededBy of ['session', 'chat', 'new-session', 'round-trip', 'pending-navigation'] as const) {
			test(`${operation} preserves ${supersededBy} navigation during provider work before calling openChat`, async () => {
				const f = fixture();
				f.activate(f.first, f.mainChat);
				const started = new DeferredPromise<void>();
				const released = new DeferredPromise<void>();
				const open = f.main.canvases.open;
				const refresh = f.main.canvases.refresh;
				if (operation === 'open') {
					f.main.canvases.open = async params => {
						const instance = await open(params);
						void started.complete();
						await released.p;
						return instance;
					};
				} else {
					f.main.canvases.refresh = async () => {
						void started.complete();
						await released.p;
						return refresh();
					};
				}
				const target = f.service.getTarget(f.first.resource, f.mainChat.resource);
				const result = operation === 'reveal' ? f.service.reveal(target, 'one')
					: f.service.open(target, { extensionId: 'user:test', canvasId: 'counter', instanceId: 'created-before-navigation' });
				const rejected = assert.rejects(result, isCancellationError);
				await started.p;
				let pendingNavigation: CancellationToken | undefined;
				switch (supersededBy) {
					case 'session': f.activate(f.second, f.second.activeChat.get()); break;
					case 'chat': f.activate(f.first, f.peerChat); break;
					case 'new-session': f.active.set(undefined, undefined); f.visible.set([], undefined); break;
					case 'round-trip':
						f.activate(f.second, f.second.activeChat.get());
						f.activate(f.first, f.mainChat);
						break;
					case 'pending-navigation': pendingNavigation = f.startNavigation(); break;
				}
				const selected = f.active.get();
				const selectedChat = selected?.activeChat.get();
				await released.complete();
				await rejected;
				assert.deepStrictEqual({
					keptNavigation: f.active.get() === selected && f.active.get()?.activeChat.get() === selectedChat,
					openChatCalls: f.preservedFocusRequests,
					pendingNavigationCancelled: pendingNavigation?.isCancellationRequested ?? false,
					editors: f.editorsOpened,
					logicalInstanceRetained: f.main.state.get().instances.some(instance => instance.instanceId === 'created-before-navigation'),
					effects: f.calls.filter(call => call.operation !== 'get').map(call => call.operation),
				}, {
					keptNavigation: true, openChatCalls: [], pendingNavigationCancelled: false, editors: [],
					logicalInstanceRetained: operation !== 'reveal', effects: operation !== 'reveal' ? ['open'] : [],
				});
			});
		}
	}

	test('first-open graduation refresh cannot navigate back over a newer session', async () => {
		const f = fixture();
		f.statuses.get(f.mainChat.resource.toString())!.set(SessionStatus.Untitled, undefined);
		f.activate(f.first, f.mainChat);
		const started = new DeferredPromise<void>();
		const released = new DeferredPromise<void>();
		const retainedCanvases: ISessionCanvases = {
			...f.main.canvases,
			refresh: async () => {
				void started.complete();
				await released.p;
				return f.main.state.get();
			},
		};
		const retainedChat: IChat = { ...f.mainChat, status: constObservable(SessionStatus.Completed), canvases: retainedCanvases };
		const retainedSession: IActiveSession = { ...f.first, chats: constObservable([retainedChat]), activeChat: constObservable(retainedChat) };
		const open = f.main.canvases.open;
		f.main.canvases.open = async params => {
			const instance = await open(params);
			f.active.set(retainedSession, undefined);
			f.visible.set([retainedSession], undefined);
			return instance;
		};
		const result = f.service.open(f.service.getTarget(f.first.resource, f.mainChat.resource), { extensionId: 'user:test', canvasId: 'counter', instanceId: 'retained-first' });
		const rejected = assert.rejects(result, isCancellationError);
		await started.p;
		f.activate(f.second, f.second.activeChat.get());
		await released.complete();
		await rejected;
		assert.deepStrictEqual({
			active: f.active.get()?.sessionId,
			openChatCalls: f.preservedFocusRequests,
			editors: f.editorsOpened,
			logicalInstanceRetained: f.main.state.get().instances.some(instance => instance.instanceId === 'retained-first'),
		}, { active: 'second', openChatCalls: [], editors: [], logicalInstanceRetained: true });
	});

	for (const supersededBy of ['session', 'chat'] as const) {
		test(`reveal does not create or present a browser after ${supersededBy} navigation supersedes openChat`, async () => {
			const f = fixture();
			const navigationStarted = new DeferredPromise<void>();
			const navigationFinished = new DeferredPromise<void>();
			f.setNavigation(async () => {
				void navigationStarted.complete();
				await navigationFinished.p;
			});
			const result = f.service.reveal(f.service.getTarget(f.first.resource, f.mainChat.resource), 'one');
			const rejected = assert.rejects(result, isCancellationError);
			await navigationStarted.p;
			f.activate(supersededBy === 'session' ? f.second : f.first, supersededBy === 'session' ? f.second.activeChat.get() : f.peerChat);
			await navigationFinished.complete();
			await rejected;
			assert.deepStrictEqual({
				browserViews: f.inputs.size, editors: f.editorsOpened,
				preservedFocusRequests: f.preservedFocusRequests,
				mutations: f.calls.filter(call => call.operation !== 'get'),
			}, { browserViews: 0, editors: [], preservedFocusRequests: [true], mutations: [] });
		});
	}

	for (const stage of ['editor', 'source'] as const) {
		test(`reveal does not focus its editor when navigation changes during ${stage} resolution`, async () => {
			const f = fixture();
			f.activate(f.first, f.mainChat);
			const started = new DeferredPromise<void>();
			const released = new DeferredPromise<void>();
			if (stage === 'editor') {
				f.setEditorOpen(async () => {
					void started.complete();
					await released.p;
				});
			} else {
				const input = f.browser.getOrCreateLazy({ id: 'recovering', source: f.source, title: 'Canvas' });
				input.invalidateSource(new Error('Endpoint unavailable'));
				f.setModelResolver(async source => {
					void started.complete();
					await released.p;
					return f.createModel(source?.initialUrl ?? '');
				});
			}
			const result = f.service.reveal(f.service.getTarget(f.first.resource, f.mainChat.resource), 'one');
			const rejected = assert.rejects(result, isCancellationError);
			await started.p;
			f.activate(f.second, f.second.activeChat.get());
			await released.complete();
			await rejected;
			assert.deepStrictEqual({
				active: f.active.get()?.sessionId, focused: f.editorsFocused, logicalInstances: f.main.state.get().instances,
			}, { active: 'second', focused: [], logicalInstances: [instance] });
		});
	}

	test('picker loading and error updates do not rebuild items or change the active canvas', async () => {
		const picker = quickInputFixture();
		const f = fixture(picker.service);
		f.main.publish({ ...liveState, instances: [instance, { ...instance, instanceId: 'two' }] });
		const managing = f.actions.run('manage', { sessionResource: f.first.resource.toString(), chatResource: f.mainChat.resource.toString() });
		await picker.shown.p;
		picker.choose('two');
		const before = picker.snapshot().itemWrites;
		f.main.loading.set(true, undefined);
		f.main.error.set(new Error('Temporary read failure'), undefined);
		f.main.loading.set(false, undefined);
		f.main.error.set(undefined, undefined);
		const after = picker.snapshot();
		picker.hide();
		await managing;
		assert.deepStrictEqual({ itemUpdates: after.itemWrites - before, active: after.active, selected: after.selected, busy: after.busy }, {
			itemUpdates: 0, active: ['two'], selected: ['two'], busy: false,
		});
	});

	for (const gate of ['preview', 'AI'] as const) {
		test(`an open manager withdraws unavailable commands when ${gate} is disabled`, async () => {
			const picker = quickInputFixture();
			const f = fixture(picker.service);
			const result = f.actions.run('manage', { sessionResource: f.first.resource.toString(), chatResource: f.mainChat.resource.toString() });
			await picker.shown.p;
			if (gate === 'preview') {
				await f.configuration.setUserConfiguration(AgentHostLocalCanvasesSettingId, false);
				f.configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
			} else {
				f.sentiment.set({ hidden: true }, undefined);
			}
			const disabled = { choices: picker.labels(), busy: picker.snapshot().busy, guidance: picker.placeholder() };
			picker.hide();
			await result;
			assert.deepStrictEqual(disabled, {
				choices: [], busy: false, guidance: 'Local canvases are disabled. Enable the local canvases preview and AI features in Settings before retrying.',
			});
		});
	}

	test('picker list updates preserve logical selection and do not choose a replacement for a removed canvas', async () => {
		const picker = quickInputFixture();
		const f = fixture(picker.service);
		const two: IAgentHostCanvasInstance = { ...instance, instanceId: 'two' };
		const zero: IAgentHostCanvasInstance = { ...instance, instanceId: 'zero' };
		f.main.publish({ ...liveState, instances: [instance, two] });
		const managing = f.actions.run('manage', { sessionResource: f.first.resource.toString(), chatResource: f.mainChat.resource.toString() });
		await picker.shown.p;
		picker.choose('two');
		f.main.publish({ ...liveState, instances: [zero, instance, two] });
		const afterInsert = picker.snapshot().active;
		f.main.publish({ ...liveState, instances: [zero, instance] });
		const afterRemoval = picker.snapshot();
		picker.accept();
		f.main.publish({ ...liveState, instances: [instance, zero] });
		const afterNextUpdate = picker.snapshot();
		picker.hide();
		await managing;
		assert.deepStrictEqual({
			afterInsert, afterRemoval: [afterRemoval.active, afterRemoval.selected],
			afterNextUpdate: [afterNextUpdate.active, afterNextUpdate.selected],
			keptOpen: afterNextUpdate.visible, secondaryPicks: afterNextUpdate.secondaryPicks,
		}, { afterInsert: ['two'], afterRemoval: [[], []], afterNextUpdate: [[], []], keptOpen: true, secondaryPicks: 0 });
	});

	test('unsupported canvas collections do not subscribe reconciliation to chat status updates', () => {
		const f = fixture();
		f.main.publish(unsupportedAgentHostCanvasState);
		f.peer.publish(unsupportedAgentHostCanvasState);
		f.other.publish(unsupportedAgentHostCanvasState);
		const before = f.getSessionTraversals();
		for (const status of f.statuses.values()) {
			status.set(SessionStatus.InProgress, undefined);
		}
		assert.strictEqual(f.getSessionTraversals() - before, 0);
	});

	test('endpoint changes invalidate existing editors and explicit retry never reopens the SDK instance', async () => {
		const f = fixture();
		f.browser.getOrCreateLazy({ id: 'canvas', source: f.source, title: 'Canvas' });
		await f.service.resolve(f.source, CancellationToken.None);
		f.main.publish({ ...liveState, instances: [{ extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: instance.instanceId, availability: 'unavailable' }] });
		f.main.setLive({ ...liveState, instances: [{ ...instance, url: 'http://localhost:43000/' }] });
		const recovered = await f.service.resolve(f.source, CancellationToken.None);
		assert.deepStrictEqual({
			invalidations: f.invalidations, recovered: recovered.initialUrl, calls: f.calls.map(call => call.operation), editors: f.editorsOpened,
		}, { invalidations: ['canvas'], recovered: 'http://localhost:43000/', calls: ['get', 'get'], editors: [] });
	});

	test('reload acknowledgment before readiness recovers only the already visible editor when metadata arrives', async () => {
		const f = fixture();
		const visible = f.browser.getOrCreateLazy({ id: 'visible', source: f.source });
		const hidden = f.browser.getOrCreateLazy({ id: 'hidden', source: f.source });
		await visible.resolve();
		await hidden.resolve();
		f.showEditors([visible]);
		f.main.canvases.reload = async () => {
			f.calls.push({ operation: 'reload', chat: 'main' });
			f.main.publish(unavailableSessionCanvasState(liveState));
		};

		await f.service.reload(f.service.getTarget(f.first.resource, f.mainChat.resource));
		const requestsAtAcknowledgment = f.modelRequests.length;
		const attached = Event.toPromise(visible.onDidResolveModel);
		f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:46000/' }] });
		await attached;

		assert.deepStrictEqual({
			requestsAtAcknowledgment,
			pages: f.modelRequests.map(request => [request.id, request.source?.initialUrl]),
			visible: visible.model?.url,
			hidden: hidden.model?.url,
			active: f.active.get()?.sessionId,
			editorsOpened: f.editorsOpened,
			mutations: f.calls.filter(call => call.operation !== 'get'),
		}, {
			requestsAtAcknowledgment: 2,
			pages: [['visible', instance.url], ['hidden', instance.url], ['visible', 'http://localhost:46000/']],
			visible: 'http://localhost:46000/', hidden: undefined, active: 'second', editorsOpened: [],
			mutations: [{ operation: 'reload', chat: 'main' }],
		});
	});

	test('a failed automatic rebind is attempted once per endpoint and remains explicitly retryable', async () => {
		const f = fixture();
		const input = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
		await input.resolve();
		f.showEditors([input]);
		f.main.publish(unavailableSessionCanvasState(liveState));
		const failure = new Error('Native page creation failed');
		f.setModelResolver(async () => { throw failure; });
		const requested = Event.toPromise(f.modelRequested.event);
		const ready: IAgentHostCanvasState = { ...liveState, instances: [{ ...instance, url: 'http://localhost:47000/' }] };
		f.main.publish(ready);
		await requested;
		await assert.rejects(f.resolveCalls.at(-1)!.result, error => error === failure);
		f.browserChanged.fire();
		f.main.publish({ ...ready });
		const failedAttempts = f.modelRequests.length;
		const retainedError = input.resolveError;

		f.setModelResolver(undefined);
		await f.service.refresh(f.service.getTarget(f.first.resource, f.mainChat.resource));
		assert.deepStrictEqual({
			failedAttempts, retainedError,
			requestsAfterRetry: f.modelRequests.length,
			recovered: input.model?.url,
			editorsOpened: f.editorsOpened,
			mutations: f.calls.filter(call => call.operation !== 'get'),
		}, { failedAttempts: 2, retainedError: failure, requestsAfterRetry: 3, recovered: 'http://localhost:47000/', editorsOpened: [], mutations: [] });
	});

	test('a new endpoint cancels an in-flight rebind and a late old model cannot replace the new page', async () => {
		const f = fixture();
		const input = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
		await input.resolve();
		f.showEditors([input]);
		f.main.publish(unavailableSessionCanvasState(liveState));
		const oldModel = new DeferredPromise<IBrowserViewModel>();
		f.setModelResolver(async source => source?.initialUrl === 'http://localhost:48000/' ? oldModel.p : f.createModel(source!.initialUrl));
		const oldRequested = Event.toPromise(f.modelRequested.event);
		f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:48000/' }] });
		await oldRequested;
		const retiredResolution = f.resolveCalls.at(-1)!.result;
		const oldToken = f.modelRequests.at(-1)!.token;

		const attached = Event.toPromise(input.onDidResolveModel);
		f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:49000/' }] });
		await attached;
		await assert.rejects(retiredResolution);
		const lateModel = f.createModel('http://localhost:48000/');
		const disposed = Event.toPromise(lateModel.onWillDispose);
		await oldModel.complete(lateModel);
		await disposed;
		f.browserChanged.fire();
		assert.deepStrictEqual({
			oldCancelled: oldToken.isCancellationRequested,
			page: input.model?.url,
			error: input.resolveError,
			requests: f.modelRequests.map(request => request.source?.initialUrl),
			editorsOpened: f.editorsOpened,
		}, {
			oldCancelled: true, page: 'http://localhost:49000/', error: undefined,
			requests: [instance.url, 'http://localhost:48000/', 'http://localhost:49000/'], editorsOpened: [],
		});
	});

	for (const interruption of ['hide', 'dispose'] as const) {
		test(`${interruption} interrupts a pending rebind without attaching its late model or reopening a tab`, async () => {
			const f = fixture();
			const input = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
			await input.resolve();
			f.showEditors([input]);
			f.main.publish(unavailableSessionCanvasState(liveState));
			const model = new DeferredPromise<IBrowserViewModel>();
			f.setModelResolver(() => model.p);
			const requested = Event.toPromise(f.modelRequested.event);
			f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:50000/' }] });
			await requested;
			const pending = f.resolveCalls.at(-1)!.result;
			const token = f.modelRequests.at(-1)!.token;

			if (interruption === 'hide') {
				f.showEditors([]);
			} else {
				f.service.dispose();
			}
			await assert.rejects(pending);
			const lateModel = f.createModel('http://localhost:50000/');
			const disposed = Event.toPromise(lateModel.onWillDispose);
			await model.complete(lateModel);
			await disposed;
			f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:51000/' }] });
			assert.deepStrictEqual({
				cancelled: token.isCancellationRequested, model: input.model,
				requests: f.modelRequests.length, editorsOpened: f.editorsOpened,
				instances: f.main.canvases.state.get().instances.length,
				mutations: f.calls.filter(call => call.operation !== 'get'),
			}, { cancelled: true, model: undefined, requests: 2, editorsOpened: [], instances: 1, mutations: [] });
		});
	}

	test('closing a tab hides it; endpoint updates do not reopen it or close the logical instance', async () => {
		const f = fixture();
		const input = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
		await f.service.resolve(f.source, CancellationToken.None);
		input.dispose();
		f.main.publish({ ...liveState, instances: [{ ...instance, url: 'http://localhost:44000/' }] });
		assert.deepStrictEqual({ instances: f.main.canvases.state.get().instances.length, editors: f.editorsOpened, calls: f.calls }, {
			instances: 1, editors: [], calls: [{ operation: 'get', chat: 'main' }],
		});
	});

	test('unsupported sessions and disabled AI cannot resolve sources', async () => {
		const f = fixture();
		f.main.setLive(unsupportedAgentHostCanvasState);
		await assert.rejects(f.service.resolve(f.source, CancellationToken.None), /no live local endpoint/);
		f.sentiment.set({ hidden: true }, undefined);
		await assert.rejects(f.service.resolve(f.source, CancellationToken.None), /Enable the local canvases preview and AI features in Settings/);
		assert.deepStrictEqual({ calls: f.calls, editors: f.editorsOpened }, { calls: [{ operation: 'get', chat: 'main' }], editors: [] });
	});

	test('visible chats rediscover support after a connection change without opening editors', () => {
		const f = fixture();
		f.visible.set([f.first], undefined);
		f.peer.generation.set(1, undefined);
		assert.deepStrictEqual({ calls: f.calls, editors: f.editorsOpened }, {
			calls: [{ operation: 'get', chat: 'peer' }, { operation: 'get', chat: 'peer' }], editors: [],
		});
	});

	test('source host and owning chat must match an existing local target', async () => {
		const f = fixture();
		await assert.rejects(f.service.resolve(SessionCanvasSource.create({ ...f.identity, hostId: 'another-host' }), CancellationToken.None), /different provider/);
		await assert.rejects(f.service.resolve(SessionCanvasSource.create({ ...f.identity, chat: f.second.activeChat.get().resource }), CancellationToken.None), /Select a live/);
		assert.deepStrictEqual(f.calls, []);
	});

	test('scoped toolbar actions target their own session and chat rather than the global active session', async () => {
		const f = fixture();
		await f.actions.run('getState', f.first);
		await f.actions.run('getState');
		assert.deepStrictEqual(f.calls, [{ operation: 'get', chat: 'peer' }, { operation: 'get', chat: 'peer' }]);
	});

	test('programmatic actions validate the same target and propagate provider errors', async () => {
		const f = fixture();
		const args = { sessionResource: f.first.resource.toString(), chatResource: f.peerChat.resource.toString(), instanceId: 'one', actionName: 'increment', input: { amount: 3 } };
		const result = await f.actions.run('invokeAction', args);
		const failure = new Error('Action failed in the provider');
		f.peer.failAction(failure);
		await assert.rejects(f.actions.run('invokeAction', args), error => error === failure);
		await assert.rejects(f.actions.run('invokeAction', { ...args, sessionResource: f.second.resource.toString() }), /Select a live/);
		await assert.rejects(f.actions.run('invokeAction', { ...args, input: Number.NaN }), /valid JSON/);
		assert.deepStrictEqual({ result, mutations: f.calls.filter(call => call.operation !== 'get') }, {
			result: { result: { count: 3 } },
			mutations: [
				{ operation: 'increment', chat: 'peer', input: { amount: 3 } },
				{ operation: 'increment', chat: 'peer', input: { amount: 3 } },
			],
		});
	});

	test('disposing the contribution unregisters its resolver without closing logical instances', () => {
		const f = fixture();
		f.service.dispose();
		assert.deepStrictEqual({ registered: !!f.getResolver(), mutations: f.calls }, { registered: false, mutations: [] });
	});

	test('new agent-created identities notify once, while restoration and availability changes never steal focus', () => {
		const f = fixture();
		f.main.publish({ ...liveState, instances: [instance, { ...instance, instanceId: 'new' }] });
		f.main.publish({ ...liveState, instances: [instance, { extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: 'new', availability: 'unavailable' }] });
		f.main.publish({ ...liveState, instances: [instance, { ...instance, instanceId: 'new', url: 'http://localhost:45000/' }] });
		assert.deepStrictEqual({ notifications: f.notifications.length, editors: f.editorsOpened }, { notifications: 1, editors: [] });
	});

	for (const initiallyReady of [true, false]) {
		test(`a new active-chat canvas is revealed once ${initiallyReady ? 'immediately' : 'its endpoint becomes ready'}, without moving keyboard focus`, async () => {
			const f = fixture();
			f.activate(f.first, f.mainChat);
			const created = { ...instance, instanceId: 'new' };
			const opened = { ...liveState, instances: [instance, created] };
			f.main.publish(initiallyReady ? opened : unavailableSessionCanvasState(opened));
			if (!initiallyReady) {
				assert.strictEqual(f.editorsOpened.length, 0);
				f.main.publish({ ...liveState, instances: [instance, created] });
			}
			await timeout(0);
			f.main.publish({ ...liveState, instances: [instance, { ...created, url: 'http://localhost:45000/' }] });
			await timeout(0);
			assert.deepStrictEqual({
				opened: f.editorsOpened.length,
				focused: f.editorsFocused.length,
				notifications: f.notifications.length,
				mutations: f.calls.filter(call => call.operation !== 'get'),
			}, { opened: 1, focused: 0, notifications: 0, mutations: [] });
		});
	}

	test('a background canvas first observed without an endpoint notifies when ready and never navigates', async () => {
		const f = fixture();
		const created = { ...instance, instanceId: 'new' };
		f.main.publish(unavailableSessionCanvasState({ ...liveState, instances: [instance, created] }));
		const beforeReady = f.notifications.length;
		f.main.publish({ ...liveState, instances: [instance, created] });
		await timeout(0);
		f.activate(f.first, f.mainChat);
		await timeout(0);
		assert.deepStrictEqual({ beforeReady, notifications: f.notifications.length, editors: f.editorsOpened }, {
			beforeReady: 0, notifications: 1, editors: [],
		});
	});

	test('a new canvas does not reveal after the user navigates away and back while its endpoint is pending', async () => {
		const f = fixture();
		f.activate(f.first, f.mainChat);
		const created = { ...instance, instanceId: 'new' };
		f.main.publish(unavailableSessionCanvasState({ ...liveState, instances: [instance, created] }));
		f.startNavigation();
		f.activate(f.second, f.second.activeChat.get());
		f.activate(f.first, f.mainChat);
		f.main.publish({ ...liveState, instances: [instance, created] });
		await timeout(0);
		assert.deepStrictEqual({ notifications: f.notifications.length, editors: f.editorsOpened }, {
			notifications: 1, editors: [],
		});
	});

	test('incomplete initial snapshots and restored instances do not reveal when their endpoints load', async () => {
		const f = fixture(undefined, { ...liveState, loaded: false, instances: [] });
		f.activate(f.first, f.mainChat);
		f.main.publish({ ...unavailableSessionCanvasState(liveState), loaded: false });
		f.main.publish({ ...liveState, loaded: true });
		await timeout(0);
		assert.deepStrictEqual({ notifications: f.notifications, editors: f.editorsOpened }, {
			notifications: [], editors: [],
		});
	});

	test('a pending agent-created canvas is not revealed after a connection generation changes', async () => {
		const f = fixture();
		f.activate(f.first, f.mainChat);
		const created = { ...instance, instanceId: 'new' };
		f.main.publish(unavailableSessionCanvasState({ ...liveState, instances: [instance, created] }));
		f.main.generation.set(1, undefined);
		f.main.publish({ ...liveState, instances: [instance, created] });
		await timeout(0);
		assert.deepStrictEqual({ notifications: f.notifications, editors: f.editorsOpened }, {
			notifications: [], editors: [],
		});
	});

	test('a pending agent-created canvas is cancelled on contribution disposal', async () => {
		const f = fixture();
		f.activate(f.first, f.mainChat);
		const refreshed = new DeferredPromise<IAgentHostCanvasState>();
		f.main.canvases.refresh = () => refreshed.p;
		const created = { ...instance, instanceId: 'new' };
		f.main.publish({ ...liveState, instances: [instance, created] });
		f.service.dispose();
		await refreshed.complete({ ...liveState, instances: [instance, created] });
		await timeout(0);
		assert.deepStrictEqual({ notifications: f.notifications, editors: f.editorsOpened }, {
			notifications: [], editors: [],
		});
	});

	test('explicit UI opening does not also schedule an automatic reveal', async () => {
		const f = fixture();
		f.activate(f.first, f.mainChat);
		await f.service.open(f.service.getTarget(f.first.resource, f.mainChat.resource), {
			extensionId: instance.extensionId, canvasId: instance.canvasId, instanceId: 'ui-open',
		});
		await timeout(0);
		assert.deepStrictEqual({
			opened: f.editorsOpened.length, focused: f.editorsFocused.length, notifications: f.notifications.length,
			mutations: f.calls.filter(call => call.operation !== 'get'),
		}, { opened: 1, focused: 1, notifications: 0, mutations: [{ operation: 'open', chat: 'main', input: undefined }] });
	});

	test('closed instances and removed sessions retire their notifications even when no view was opened', () => {
		const f = fixture();
		f.main.publish({ ...liveState, instances: [instance, { ...instance, instanceId: 'closed' }] });
		f.main.publish(liveState);
		const closedWithoutView = f.closedNotifications.length;
		f.main.publish({ ...liveState, instances: [instance, { ...instance, instanceId: 'removed' }] });
		f.removeSession(f.first);
		assert.deepStrictEqual({
			closedWithoutView, closedAfterRemoval: f.closedNotifications.length,
			notifications: f.notifications.length, browserViews: f.inputs.size, editorsOpened: f.editorsOpened,
		}, { closedWithoutView: 1, closedAfterRemoval: 2, notifications: 2, browserViews: 0, editorsOpened: [] });
	});

	test('authoritative instance removal closes only its source editors without a second SDK close', async () => {
		const f = fixture();
		const main = f.browser.getOrCreateLazy({ id: 'main', source: f.source });
		const copy = f.browser.getOrCreateLazy({ id: 'copy', source: f.source });
		const peerSource = SessionCanvasSource.create({ ...f.identity, chat: f.peerChat.resource });
		const peer = f.browser.getOrCreateLazy({ id: 'peer', source: peerSource });
		f.browser.getOrCreateLazy({ id: 'ordinary' });
		await main.resolve();
		await copy.resolve();
		await peer.resolve();
		f.main.publish({ ...liveState, instances: [] });
		assert.deepStrictEqual({
			disposed: [main.isDisposed(), copy.isDisposed(), peer.isDisposed()],
			remaining: [...f.inputs.keys()],
			peerPage: peer.model?.url,
			mutations: f.calls.filter(call => call.operation !== 'get'),
		}, { disposed: [true, true, false], remaining: ['peer', 'ordinary'], peerPage: instance.url, mutations: [] });
	});

	test('unsupported snapshots, connection loss and failed refresh retain recoverable source editors', async () => {
		const f = fixture();
		const input = f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
		await input.resolve();
		f.showEditors([input]);
		f.main.publish(unsupportedAgentHostCanvasState);
		const afterUnsupported = input.isDisposed();
		f.main.publish(unavailableSessionCanvasState(liveState));
		const afterConnectionLoss = input.isDisposed();
		f.main.canvases.refresh = async () => { throw new Error('Refresh failed'); };
		await assert.rejects(f.service.refresh(f.service.getTarget(f.first.resource, f.mainChat.resource)), /Refresh failed/);
		assert.deepStrictEqual({
			disposed: [afterUnsupported, afterConnectionLoss, input.isDisposed()],
			known: f.inputs.get('canvas') === input,
			logicalInstances: f.main.canvases.state.get().instances.map(instance => [instance.instanceId, instance.availability]),
			mutations: f.calls.filter(call => call.operation !== 'get'),
		}, { disposed: [false, false, false], known: true, logicalInstances: [['one', 'unavailable']], mutations: [] });
	});

	test('explicit close removes the logical instance and its source editor only', async () => {
		const f = fixture();
		f.browser.getOrCreateLazy({ id: 'canvas', source: f.source });
		f.browser.getOrCreateLazy({ id: 'ordinary' });
		await f.service.close(f.service.getTarget(f.first.resource, f.mainChat.resource), 'one');
		assert.deepStrictEqual({
			instances: f.main.canvases.state.get().instances, inputs: [...f.inputs.keys()], calls: f.calls,
		}, { instances: [], inputs: ['ordinary'], calls: [{ operation: 'close', chat: 'main' }] });
	});
});
