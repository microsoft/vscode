/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { autorun, derived, observableFromEvent, observableSignal, observableSignalFromEvent, type IObservable, type IReader } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { extUri, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { AgentHostCanvasJson, IAgentHostCanvasActionParams, IAgentHostCanvasInstance, IAgentHostCanvasOpenParams } from '../../../../platform/agentHost/common/agentHostCanvases.js';
import { AgentHostLocalCanvasesSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { getGlobalConfigurationValue } from '../../../../platform/agentHost/common/agentHostConfigurationSync.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { BrowserViewStorageScope } from '../../../../platform/browserView/common/browserView.js';
import { tryCreateAppPolicyForOrigin } from '../../../../platform/browserView/common/browserAppPolicy.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IBrowserViewWorkbenchService, type IBrowserViewResolvedPageSource } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus, type IChat, type ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService, type IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { isLoopbackCanvasUrl, SessionCanvasSource, type ISessionCanvasIdentity, type ISessionCanvases } from '../../../services/sessions/common/sessionCanvases.js';

export interface ISessionCanvasTarget {
	readonly session: ISession;
	readonly chat: IChat;
	readonly canvases: ISessionCanvases;
}

export interface ISessionCanvasService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	getTarget(session: URI, chat: URI): ISessionCanvasTarget;
	open(target: ISessionCanvasTarget, params: IAgentHostCanvasOpenParams): Promise<URI>;
	reveal(target: ISessionCanvasTarget, instanceId: string): Promise<URI>;
	invokeAction(target: ISessionCanvasTarget, params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson>;
	refresh(target: ISessionCanvasTarget): Promise<void>;
	reload(target: ISessionCanvasTarget): Promise<void>;
	close(target: ISessionCanvasTarget, instanceId: string): Promise<void>;
}

export const ISessionCanvasService = createDecorator<ISessionCanvasService>('sessionCanvasService');

interface ICanvasEditorRebind {
	readonly endpoint: string;
	readonly result: DeferredPromise<void>;
	started: boolean;
}

interface ICanvasPendingPresentation extends IDisposable {
	readonly target: ISessionCanvasTarget;
	readonly generation: number;
	readonly navigation: CanvasNavigation | undefined;
	started: boolean;
}

/** A canvas operation may reveal its result only while its navigation intent is current. */
class CanvasNavigation extends Disposable {
	private readonly cancellation = this._register(new CancellationTokenSource());
	private readonly navigationListener = this._register(new MutableDisposable());
	readonly token = this.cancellation.token;
	private readonly initialSession: IActiveSession | undefined;
	private readonly initialChat: URI | undefined;
	private destination: ISessionCanvasTarget | undefined;
	private destinationInitialChat: URI | undefined;
	private reachedDestination = false;
	private reachedChat = false;

	constructor(
		private readonly sessionsService: ISessionsService,
		enabled: IObservable<boolean>,
	) {
		super();
		const activeSession = sessionsService.activeSession;
		this.initialSession = activeSession.get();
		this.initialChat = this.initialSession?.activeChat.get().resource;
		this.observeNavigation();
		this._register(autorun(reader => {
			const active = activeSession.read(reader);
			const chat = active?.activeChat.read(reader).resource;
			if (!enabled.read(reader)) {
				this.cancellation.cancel();
			} else if (this.destination && active?.providerId === this.destination.session.providerId && isEqual(active.resource, this.destination.session.resource)
				&& (isEqual(chat, this.destination.chat.resource) || (!this.reachedDestination && !this.destinationInitialChat) || (!this.reachedChat && isEqual(chat, this.destinationInitialChat)))) {
				this.destinationInitialChat ??= chat;
				this.reachedDestination = true;
				this.reachedChat ||= isEqual(chat, this.destination.chat.resource);
			} else if (this.reachedDestination || active?.providerId !== this.initialSession?.providerId
				|| !isEqual(active?.resource, this.initialSession?.resource) || !isEqual(chat, this.initialChat)) {
				this.cancellation.cancel();
			}
		}));
	}

	private observeNavigation(): void {
		const token = this.sessionsService.captureNavigation();
		this.navigationListener.value = token.onCancellationRequested(() => this.cancellation.cancel());
		if (token.isCancellationRequested) {
			this.cancellation.cancel();
		}
	}

	check(): void {
		if (this.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	async openChat(target: ISessionCanvasTarget): Promise<void> {
		this.check();
		this.destination = target;
		this.destinationInitialChat = this.sessionsService.visibleSessions.get().find(session => isEqual(session?.resource, target.session.resource))?.activeChat.get().resource;
		this.navigationListener.clear();
		let opening: Promise<void>;
		try {
			opening = this.sessionsService.openChat(target.session, target.chat.resource, { preserveFocus: true });
		} finally {
			this.observeNavigation();
		}
		await opening;
		this.check();
		const active = this.sessionsService.activeSession.get();
		if (!this.destination || !isEqual(active?.resource, this.destination.session.resource) || !isEqual(active?.activeChat.get().resource, this.destination.chat.resource)) {
			throw new CancellationError();
		}
		this.reachedDestination = true;
		this.reachedChat = true;
	}

	override dispose(): void {
		this.cancellation.cancel();
		super.dispose();
	}
}

export class SessionCanvasService extends Disposable implements ISessionCanvasService {
	declare readonly _serviceBrand: undefined;

	private readonly resolvedEndpoints = new ResourceMap<string>();
	private readonly knownInstances = new WeakMap<ISessionCanvases, Set<string>>();
	private readonly observedCollections = new WeakMap<ISessionCanvases, number>();
	private readonly discoveredCollections = new WeakMap<ISessionCanvases, number>();
	private readonly pendingPresentations = this._register(new DisposableMap<string, ICanvasPendingPresentation>());
	private readonly notifications = this._register(new DisposableMap<string, DisposableStore>());
	private readonly filterChanged = this._register(new Emitter<void>());
	private readonly inputObservers = this._register(new DisposableMap<BrowserEditorInput, DisposableStore>());
	private readonly inputChanged = observableSignal(this);
	private readonly pendingRebinds = new Map<BrowserEditorInput, ICanvasEditorRebind>();
	private readonly attemptedEndpoints = new WeakMap<BrowserEditorInput, string>();

	readonly enabled: IObservable<boolean>;

	constructor(
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IBrowserViewWorkbenchService private readonly browserService: IBrowserViewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const settingsEnabled = observableFromEvent(this, configurationService.onDidChangeConfiguration, () =>
			getGlobalConfigurationValue<boolean>(configurationService, AgentHostLocalCanvasesSettingId) === true
			&& getGlobalConfigurationValue<boolean>(configurationService, ChatAIDisabledSettingId) !== true);
		this.enabled = derived(this, reader => !isWeb && settingsEnabled.read(reader) && !entitlementService.sentimentObs.read(reader).hidden);
		const sessionsChanged = observableSignalFromEvent(this, managementService.onDidChangeSessions);
		const browsersChanged = observableSignalFromEvent(this, browserService.onDidChangeBrowserViews);
		const visibleEditorsChanged = observableSignalFromEvent(this, editorService.onDidVisibleEditorsChange);
		this._register(browserService.registerPageSourceResolver(SessionCanvasSource.scheme, this));
		this._register(toDisposable(() => {
			for (const input of this.pendingRebinds.keys()) {
				this.cancelRebind(input);
			}
		}));
		this._register(browserService.registerContextualFilter({
			include: (input, context) => {
				if (input.source?.scheme !== SessionCanvasSource.scheme) {
					return true;
				}
				const identity = SessionCanvasSource.parse(input.source);
				const active = this.sessionsService.activeSession.get();
				const chat = context.activeSessionId ? URI.parse(context.activeSessionId) : active?.activeChat.get().resource;
				return !!identity && this.enabled.get() && isEqual(identity.chat, chat);
			},
			onDidChange: this.filterChanged.event,
		}));
		this._register(autorun(reader => {
			if (this._store.isDisposed) {
				return;
			}
			const enabled = this.enabled.read(reader);
			const active = sessionsService.activeSession.read(reader);
			active?.activeChat.read(reader);
			this.filterChanged.fire();
			if (!enabled) {
				return;
			}
			for (const session of sessionsService.visibleSessions.read(reader)) {
				const chat = session?.activeChat.read(reader);
				const canvases = chat?.canvases;
				const generation = canvases?.connectionGeneration.read(reader);
				if (canvases && generation !== undefined && this.discoveredCollections.get(canvases) !== generation && chat.status.read(reader) !== SessionStatus.Untitled) {
					this.discoveredCollections.set(canvases, generation);
					// Discovery reads current runtime state; it never opens a logical canvas.
					void canvases.refresh().catch(() => { /* The collection exposes the error for retry. */ });
				}
			}
		}));
		this._register(autorun(reader => {
			if (this._store.isDisposed) {
				return;
			}
			sessionsChanged.read(reader);
			browsersChanged.read(reader);
			visibleEditorsChanged.read(reader);
			this.inputChanged.read(reader);
			const enabled = this.enabled.read(reader);
			const currentEndpoints = new ResourceMap<string>();
			const liveInstances = new Set<string>();
			const supportedTargets = new ResourceMap<ISessionCanvasTarget>();
			const sessions = new ResourceMap<ISession>(managementService.getSessions().map((session): [URI, ISession] => [session.resource, session]));
			for (const session of sessionsService.visibleSessions.read(reader)) {
				if (session) {
					sessions.set(session.resource, session);
				}
			}
			for (const session of sessions.values()) {
				for (const chat of session.chats.read(reader)) {
					const canvases = chat.canvases;
					if (!canvases) {
						continue;
					}
					const state = canvases.state.read(reader);
					const generation = canvases.connectionGeneration.read(reader);
					const available = enabled && state.supported && this.isTargetAvailable(session, chat, reader);
					if (available) {
						supportedTargets.set(chat.resource, { session, chat, canvases });
					}
					const firstObservation = this.observedCollections.get(canvases) !== generation;
					if (state.supported && state.loaded !== false && !canvases.loading.read(reader)) {
						this.observedCollections.set(canvases, generation);
					}
					for (const instance of state.instances) {
						const source = SessionCanvasSource.create(this.identity({ session, chat, canvases }, instance));
						const key = extUri.getComparisonKey(source);
						liveInstances.add(key);
						if (available && instance.availability === 'ready' && isLoopbackCanvasUrl(instance.url)) {
							currentEndpoints.set(source, instance.url);
						}
						const known = this.knownInstances.get(canvases) ?? new Set<string>();
						this.knownInstances.set(canvases, known);
						if (!known.has(key)) {
							known.add(key);
							if (available && !firstObservation) {
								const target = { session, chat, canvases };
								const navigation = this.isActiveTarget(target, reader) ? new CanvasNavigation(this.sessionsService, this.enabled) : undefined;
								this.pendingPresentations.set(key, {
									target, generation, navigation, started: false,
									dispose: () => navigation?.dispose(),
								});
							}
						}
						const presentation = this.pendingPresentations.get(key);
						if (presentation && !presentation.started && presentation.target.canvases === canvases && presentation.generation === generation
							&& available && instance.availability === 'ready' && isLoopbackCanvasUrl(instance.url)) {
							presentation.started = true;
							if (presentation.navigation && !presentation.navigation.token.isCancellationRequested) {
								void this.revealNewCanvas(key, instance, presentation);
							} else {
								this.notifyNewCanvas(presentation.target, instance);
								this.pendingPresentations.deleteAndDispose(key);
							}
						}
					}
				}
			}
			for (const key of this.pendingPresentations.keys()) {
				const presentation = this.pendingPresentations.get(key)!;
				const current = supportedTargets.get(presentation.target.chat.resource);
				if (!enabled || !liveInstances.has(key) || current?.canvases !== presentation.target.canvases
					|| current.canvases.connectionGeneration.read(reader) !== presentation.generation) {
					this.pendingPresentations.deleteAndDispose(key);
				}
			}
			const inputs = [...browserService.getKnownBrowserViews().values()].filter(input => {
				const source = input.source;
				const identity = source && SessionCanvasSource.parse(source);
				const target = identity && supportedTargets.get(identity.chat);
				if (source && identity && target && target.canvases.hostId === identity.hostId
					&& target.session.providerId === identity.providerId && isEqual(target.session.resource, identity.session)
					&& !liveInstances.has(extUri.getComparisonKey(SessionCanvasSource.create(identity)))) {
					this.resolvedEndpoints.delete(source);
					input.dispose(true);
					return false;
				}
				return !input.isDisposed();
			});
			this.observeInputs(inputs);
			const inputSources = new ResourceSet(inputs.flatMap(input => input.source ? [input.source] : []));
			for (const [source, endpoint] of this.resolvedEndpoints) {
				if (!inputSources.has(source)) {
					this.resolvedEndpoints.delete(source);
					continue;
				}
				if (currentEndpoints.get(source) !== endpoint) {
					this.resolvedEndpoints.delete(source);
					for (const input of browserService.getKnownBrowserViews().values()) {
						if (isEqual(input.source, source)) {
							input.invalidateSource(this.unavailableError());
						}
					}
				}
			}
			for (const key of this.notifications.keys()) {
				if (!enabled || !liveInstances.has(key)) {
					this.notifications.deleteAndDispose(key);
				}
			}
			for (const input of inputs) {
				if (!enabled && input.source?.scheme === SessionCanvasSource.scheme) {
					this.cancelRebind(input, false);
					const error = this.unavailableError();
					if (input.model || input.resolveError?.message !== error.message) {
						input.invalidateSource(error);
					}
				}
				const endpoint = input.source && currentEndpoints.get(input.source);
				if (!endpoint || !editorService.visibleEditors.includes(input)) {
					this.attemptedEndpoints.delete(input);
					this.cancelRebind(input);
					continue;
				}
				const pending = this.pendingRebinds.get(input);
				if (pending && pending.endpoint !== endpoint) {
					this.cancelRebind(input);
				}
				if (input.resolveError && !input.requiresExplicitSourceRetry && this.attemptedEndpoints.get(input) !== endpoint) {
					void this.rebindVisibleInput(input, endpoint).catch(() => { /* The browser pane retains the error for explicit retry. */ });
				}
			}
		}));
	}

	getTarget(sessionResource: URI, chatResource: URI): ISessionCanvasTarget {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!this.enabled.get()) {
			throw this.unavailableError();
		}
		const active = this.sessionsService.activeSession.get();
		const session = active && isEqual(active.resource, sessionResource) ? active : this.managementService.getSession(sessionResource);
		const chat = session?.chats.get().find(chat => isEqual(chat.resource, chatResource));
		if (!session || !chat || !this.isTargetAvailable(session, chat, undefined) || !chat.canvases) {
			throw new Error(localize('canvas.targetUnavailable', "Select a live, opted-in local chat with AI features enabled to use canvases."));
		}
		return { session, chat, canvases: chat.canvases };
	}

	private unavailableError(): Error {
		if (isWeb) {
			return new Error(localize('canvas.desktopRequired', "Local canvases are only available in the desktop Agents window."));
		}
		return new Error(this.enabled.get()
			? localize('canvas.endpointExpired', "This canvas is unavailable. Refresh Canvases or retry after restarting its provider.")
			: localize('canvas.disabled', "Local canvases are disabled. Enable the local canvases preview and AI features in Settings before retrying."));
	}

	private isTargetAvailable(session: ISession, chat: IChat, reader: IReader | undefined): boolean {
		return !session.isArchived.read(reader)
			&& chat.interactivity.read(reader) === ChatInteractivity.Full;
	}

	private identity(target: ISessionCanvasTarget, instance: Pick<IAgentHostCanvasInstance, 'extensionId' | 'canvasId' | 'instanceId'>): ISessionCanvasIdentity {
		return {
			hostId: target.canvases.hostId,
			providerId: target.session.providerId,
			session: target.session.resource,
			chat: target.chat.resource,
			extensionId: instance.extensionId,
			canvasId: instance.canvasId,
			instanceId: instance.instanceId,
		};
	}

	private currentTarget(target: ISessionCanvasTarget): ISessionCanvasTarget {
		const current = this.getTarget(target.session.resource, target.chat.resource);
		if (current.canvases !== target.canvases) {
			throw new CancellationError();
		}
		return current;
	}

	private isActiveTarget(target: ISessionCanvasTarget, reader: IReader | undefined): boolean {
		const active = this.sessionsService.activeSession.read(reader);
		return !!active && active.providerId === target.session.providerId && isEqual(active.resource, target.session.resource)
			&& isEqual(active.activeChat.read(reader).resource, target.chat.resource)
			&& this.sessionsService.visibleSessions.read(reader).some(session => session?.sessionId === active.sessionId);
	}

	private requireActiveTarget(target: ISessionCanvasTarget): void {
		this.currentTarget(target);
		if (!this.isActiveTarget(target, undefined)) {
			throw new CancellationError();
		}
	}

	async resolve(source: URI, token: CancellationToken): Promise<IBrowserViewResolvedPageSource> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const identity = SessionCanvasSource.parse(source);
		if (!identity) {
			throw new Error(localize('canvas.invalidSource', "This canvas source is not valid."));
		}
		const target = this.getTarget(identity.session, identity.chat);
		if (identity.hostId !== target.canvases.hostId || identity.providerId !== target.session.providerId) {
			throw new Error(localize('canvas.wrongHost', "This canvas belongs to a different provider."));
		}
		await raceCancellationError(target.canvases.refresh(), token);
		const current = this.currentTarget(target);
		const state = current.canvases.state.get();
		const instance = state.instances.find(instance => instance.instanceId === identity.instanceId
			&& instance.extensionId === identity.extensionId && instance.canvasId === identity.canvasId);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!state.supported || instance?.availability !== 'ready' || !isLoopbackCanvasUrl(instance.url)) {
			throw new Error(localize('canvas.pageUnavailable', "This canvas has no live local endpoint. Refresh Canvases or restart its provider, then retry."));
		}
		this.resolvedEndpoints.set(source, instance.url);
		return {
			initialUrl: instance.url,
			owner: { type: 'user' },
			session: { scope: BrowserViewStorageScope.Ephemeral },
			// A canvas is a source-backed local custom app: confine it to its
			// own served origin so it cannot silently navigate (via a link,
			// redirect, or compromised script) into an unrelated site while
			// still being addressed by this same canvas source. External
			// links are not opted into a user-mediated escape hatch here;
			// nothing in the canvas manifest currently requests one.
			appPolicy: tryCreateAppPolicyForOrigin(instance.url),
		};
	}

	async open(target: ISessionCanvasTarget, params: IAgentHostCanvasOpenParams): Promise<URI> {
		this.currentTarget(target);
		const navigation = new CanvasNavigation(this.sessionsService, this.enabled);
		try {
			const wasUntitled = target.chat.status.get() === SessionStatus.Untitled;
			const known = this.knownInstances.get(target.canvases) ?? new Set<string>();
			known.add(extUri.getComparisonKey(SessionCanvasSource.create(this.identity(target, params))));
			this.knownInstances.set(target.canvases, known);
			const instance = await this.currentTarget(target).canvases.open(params);
			navigation.check();
			const current = this.getTarget(target.session.resource, target.chat.resource);
			if (current.canvases !== target.canvases) {
				// A first open graduates the draft into its retained session before presenting the page.
				if (!wasUntitled || current.session.providerId !== target.session.providerId || current.canvases.hostId !== target.canvases.hostId) {
					throw new CancellationError();
				}
				const state = await current.canvases.refresh();
				navigation.check();
				if (!state.instances.some(value => value.instanceId === instance.instanceId && value.extensionId === instance.extensionId && value.canvasId === instance.canvasId)) {
					throw new CancellationError();
				}
			}
			return await this.revealWithNavigation(current, instance.instanceId, navigation);
		} finally {
			navigation.dispose();
		}
	}

	async reveal(target: ISessionCanvasTarget, instanceId: string): Promise<URI> {
		this.currentTarget(target);
		const navigation = new CanvasNavigation(this.sessionsService, this.enabled);
		try {
			return await this.revealWithNavigation(target, instanceId, navigation);
		} finally {
			navigation.dispose();
		}
	}

	private async revealWithNavigation(target: ISessionCanvasTarget, instanceId: string, navigation: CanvasNavigation, preserveFocus = false): Promise<URI> {
		navigation.check();
		await this.currentTarget(target).canvases.refresh();
		navigation.check();
		const current = this.currentTarget(target);
		const state = current.canvases.state.get();
		const instance = state.supported ? state.instances.find(instance => instance.instanceId === instanceId) : undefined;
		if (!instance) {
			throw new Error(localize('canvas.missingInstance', "This canvas instance no longer exists. Open a new canvas from the catalog."));
		}
		const source = SessionCanvasSource.create(this.identity(current, instance));
		if (!preserveFocus) {
			await navigation.openChat(current);
		}
		this.requireActiveTarget(current);
		const existing = [...this.browserService.getKnownBrowserViews().values()].find(input => isEqual(input.source, source));
		const input = this.browserService.getOrCreateLazy({
			id: existing?.id ?? generateUuid(),
			source,
			title: localize('canvas.editorTitle', "Canvas"),
		});
		try {
			navigation.check();
			this.requireActiveTarget(current);
		} catch (error) {
			if (!existing) {
				input.dispose(true);
			}
			throw error;
		}
		const editor = await this.editorService.openEditor(input, { pinned: true, revealIfOpened: true, preserveFocus: true });
		navigation.check();
		this.requireActiveTarget(current);
		if (input.resolveError && instance.availability === 'ready') {
			await input.resolve();
			navigation.check();
			this.requireActiveTarget(current);
		}
		if (!preserveFocus) {
			editor?.focus();
		}
		return source;
	}

	async refresh(target: ISessionCanvasTarget): Promise<void> {
		await this.currentTarget(target).canvases.refresh();
		await this.retryVisible(target);
	}

	async reload(target: ISessionCanvasTarget): Promise<void> {
		await this.currentTarget(target).canvases.reload();
		await this.retryVisible(target);
	}

	async close(target: ISessionCanvasTarget, instanceId: string): Promise<void> {
		await this.currentTarget(target).canvases.close(instanceId);
		for (const input of this.browserService.getKnownBrowserViews().values()) {
			const identity = input.source && SessionCanvasSource.parse(input.source);
			if (identity?.instanceId === instanceId && isEqual(identity.session, target.session.resource) && isEqual(identity.chat, target.chat.resource)) {
				input.dispose(true);
			}
		}
	}

	async invokeAction(target: ISessionCanvasTarget, params: IAgentHostCanvasActionParams): Promise<AgentHostCanvasJson> {
		return this.currentTarget(target).canvases.invokeAction(params);
	}

	private async retryVisible(target: ISessionCanvasTarget): Promise<void> {
		this.currentTarget(target);
		for (const editor of this.editorService.visibleEditors) {
			if (!(editor instanceof BrowserEditorInput) || !editor.source || (!editor.resolveError && !this.pendingRebinds.has(editor))) {
				continue;
			}
			const identity = SessionCanvasSource.parse(editor.source);
			if (identity && isEqual(identity.session, target.session.resource) && isEqual(identity.chat, target.chat.resource)) {
				const endpoint = this.readyEndpoint(editor.source);
				if (endpoint) {
					await this.rebindVisibleInput(editor, endpoint);
				}
			}
		}
	}

	private observeInputs(inputs: readonly BrowserEditorInput[]): void {
		for (const input of this.inputObservers.keys()) {
			if (!inputs.includes(input)) {
				this.cancelRebind(input);
				this.attemptedEndpoints.delete(input);
				this.inputObservers.deleteAndDispose(input);
			}
		}
		for (const input of inputs) {
			if (input.source?.scheme !== SessionCanvasSource.scheme || input.isDisposed() || this.inputObservers.has(input)) {
				continue;
			}
			const store = new DisposableStore();
			this.inputObservers.set(input, store);
			store.add(input.onDidChangeResolveError(() => this.inputChanged.trigger(undefined)));
			store.add(Event.once(input.onWillDispose)(() => {
				this.cancelRebind(input, false);
				this.attemptedEndpoints.delete(input);
				this.inputObservers.deleteAndDispose(input);
			}));
		}
	}

	private readyEndpoint(source: URI): string | undefined {
		const identity = SessionCanvasSource.parse(source);
		if (!identity) {
			return undefined;
		}
		let target: ISessionCanvasTarget;
		try {
			target = this.getTarget(identity.session, identity.chat);
		} catch {
			return undefined;
		}
		if (target.canvases.hostId !== identity.hostId || target.session.providerId !== identity.providerId) {
			return undefined;
		}
		const state = target.canvases.state.get();
		const instance = state.instances.find(instance => instance.instanceId === identity.instanceId
			&& instance.extensionId === identity.extensionId && instance.canvasId === identity.canvasId);
		return state.supported && instance?.availability === 'ready' && isLoopbackCanvasUrl(instance.url) ? instance.url : undefined;
	}

	private rebindVisibleInput(input: BrowserEditorInput, endpoint: string): Promise<void> {
		const pending = this.pendingRebinds.get(input);
		if (pending?.endpoint === endpoint) {
			return pending.result.p;
		}
		this.cancelRebind(input);
		const attempt: ICanvasEditorRebind = { endpoint, result: new DeferredPromise<void>(), started: false };
		this.pendingRebinds.set(input, attempt);
		this.attemptedEndpoints.set(input, endpoint);
		void this.runRebind(input, attempt);
		return attempt.result.p;
	}

	private async runRebind(input: BrowserEditorInput, attempt: ICanvasEditorRebind): Promise<void> {
		try {
			// Let the resolution that emitted the error finish retiring before retrying it.
			await Promise.resolve();
			if (this._store.isDisposed || input.isDisposed() || this.pendingRebinds.get(input) !== attempt
				|| !this.editorService.visibleEditors.includes(input) || !input.source
				|| this.readyEndpoint(input.source) !== attempt.endpoint) {
				throw new CancellationError();
			}
			attempt.started = true;
			await input.resolve();
			if (!attempt.result.isSettled) {
				void attempt.result.complete();
			}
		} catch (error) {
			if (!attempt.result.isSettled) {
				void attempt.result.error(error);
			}
		} finally {
			if (this.pendingRebinds.get(input) === attempt) {
				this.pendingRebinds.delete(input);
			}
		}
	}

	private cancelRebind(input: BrowserEditorInput, invalidate = true): void {
		const attempt = this.pendingRebinds.get(input);
		if (!attempt) {
			return;
		}
		this.pendingRebinds.delete(input);
		void attempt.result.cancel();
		if (invalidate && attempt.started && !input.isDisposed() && !input.model) {
			input.invalidateSource(new Error(localize('canvas.recoveryInterrupted', "Canvas recovery was interrupted. Retry when the editor is visible and the canvas is available.")));
		}
	}

	private async revealNewCanvas(key: string, instance: IAgentHostCanvasInstance, presentation: ICanvasPendingPresentation): Promise<void> {
		try {
			if (presentation.navigation) {
				await this.revealWithNavigation(presentation.target, instance.instanceId, presentation.navigation, true);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error instanceof Error ? error : localize('canvas.revealFailed', "The canvas could not be opened."));
			}
		} finally {
			if (this.pendingPresentations.get(key) === presentation) {
				this.pendingPresentations.deleteAndDispose(key);
			}
		}
	}

	private notifyNewCanvas(target: ISessionCanvasTarget, instance: IAgentHostCanvasInstance): void {
		const source = SessionCanvasSource.create(this.identity(target, instance));
		const key = extUri.getComparisonKey(source);
		const store = new DisposableStore();
		this.notifications.set(key, store);
		const handle = this.notificationService.prompt(Severity.Info, localize('canvas.newInstance', "A new canvas is available in {0}.", target.chat.title.get()), [{
			label: localize('canvas.revealNew', "Open Canvas"),
			run: async () => {
				try {
					await this.reveal(target, instance.instanceId);
				} catch (error) {
					this.notificationService.error(error instanceof Error ? error : localize('canvas.revealFailed', "The canvas could not be opened."));
				}
			},
		}]);
		store.add(Event.once(handle.onDidClose)(() => this.notifications.deleteAndDispose(key)));
		store.add(toDisposable(() => handle.close()));
	}
}
