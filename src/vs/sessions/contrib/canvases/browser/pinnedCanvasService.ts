/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, ITransaction, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getCanvasInputResource, getCanvasReferenceKey, ICanvas, ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CanvasesPinnedToSidebarContext, IPinnedCanvas, IPinnedCanvasIdentity, IPinnedCanvasService, MAX_PINNED_CANVASES, PINNED_CANVAS_PAGE_ID, PinnedCanvasState, PinnedCanvasTarget } from './pinnedCanvases.js';

const PINNED_CANVASES_STORAGE_KEY = 'sessions.pinnedCanvases';

interface IStoredPinnedCanvas {
	readonly providerId: string;
	readonly session: string;
	readonly chat: string;
	readonly extensionId: string;
	readonly canvasId: string;
	readonly instanceId: string;
	readonly title: string;
}

interface IStoredPinnedCanvases {
	readonly version: 1;
	readonly pins: readonly IStoredPinnedCanvas[];
	readonly selected?: string;
}

function getPinnedCanvasId(identity: IPinnedCanvasIdentity): string {
	return JSON.stringify([identity.providerId, identity.session.toString(), identity.chat.toString(), identity.extensionId, identity.canvasId, identity.instanceId]);
}

function isPinnedCanvas(target: PinnedCanvasTarget): target is IPinnedCanvas {
	return hasKey(target, { identity: true });
}

class PinnedCanvas extends Disposable implements IPinnedCanvas {

	readonly id: string;
	private readonly boundResource = observableValue<URI | undefined>(this, undefined);
	private readonly liveCanvas = observableValue<IObservable<ICanvas | undefined> | undefined>(this, undefined);
	private readonly liveReference = this._register(new MutableDisposable<IReference<IObservable<ICanvas | undefined>>>());
	/** Whether the known membership of the owning chat lacks this canvas. */
	private readonly missing = observableValue(this, false);
	private readonly _reconnecting = observableValue(this, false);
	readonly reconnecting: IObservable<boolean> = this._reconnecting;
	/** The chat membership observed while reconnecting, so the canvas is found again without showing its chat. */
	private readonly membershipReference = this._register(new MutableDisposable<IReference<IObservable<readonly ICanvas[] | undefined>>>());
	private membershipSession: ISession | undefined;
	readonly lastTitle;
	readonly reference: IObservable<ICanvasReference | undefined>;
	readonly canvas: IObservable<ICanvas | undefined>;
	readonly title: IObservable<string>;
	readonly state: IObservable<PinnedCanvasState>;

	constructor(
		readonly identity: IPinnedCanvasIdentity,
		title: string,
		readonly chatTitle: IObservable<string | undefined>,
	) {
		super();
		this.id = getPinnedCanvasId(identity);
		this.lastTitle = observableValue(this, title);
		this.reference = derived(this, reader => {
			const canvas = this.boundResource.read(reader);
			return canvas && { providerId: identity.providerId, session: identity.session, chat: identity.chat, canvas };
		});
		this.canvas = derived(this, reader => this.boundResource.read(reader) ? this.liveCanvas.read(reader)?.read(reader) : undefined);
		this.title = derived(this, reader => {
			const canvas = this.canvas.read(reader);
			return canvas?.instanceId !== undefined ? canvas.title : this.lastTitle.read(reader);
		});
		this.state = derived(this, reader => {
			if (!this.boundResource.read(reader)) {
				return this.missing.read(reader) ? PinnedCanvasState.Unavailable : PinnedCanvasState.Pending;
			}
			const canvas = this.canvas.read(reader);
			return canvas?.instanceId !== undefined && canvas.source !== undefined ? PinnedCanvasState.Live : PinnedCanvasState.Pending;
		});
	}

	/** The session object the live observation was made through; a provider can replace it. */
	private boundSession: ISession | undefined;
	/** The last live canvas resource, kept while the observation is suspended so it can resume. */
	private lastResource: URI | undefined;
	/** The canvas lifetime this pin was bound to last, kept after its chat drops the canvas. */
	private lastBound: URI | undefined;
	/** The session object that last listed this pin's chat, so the chat leaving that list is a deletion. */
	private listedBy: ISession | undefined;

	get boundCanvas(): URI | undefined {
		return this.boundResource.read(undefined);
	}

	/**
	 * The canvas lifetime this pin was bound to last. A chat can drop a canvas before closing it
	 * completes, which unbinds the pin, so a completed close is matched against this instead.
	 */
	get lastBoundCanvas(): URI | undefined {
		return this.lastBound;
	}

	isBoundTo(session: ISession): boolean {
		return this.boundSession === session;
	}

	markListedBy(session: ISession): void {
		this.listedBy = session;
	}

	wasListedBy(session: ISession): boolean {
		return this.listedBy === session;
	}

	/** The canvas to resume observing through a replaced or returning session. */
	get resumableCanvas(): URI | undefined {
		return this.lastResource;
	}

	bind(session: ISession, resource: URI, live: IReference<IObservable<ICanvas | undefined>> | undefined, tx: ITransaction | undefined): void {
		this.boundSession = session;
		this.lastResource = resource;
		this.lastBound = resource;
		this.liveReference.value = live;
		this.liveCanvas.set(live?.object, tx);
		this.boundResource.set(resource, tx);
		this.missing.set(false, tx);
	}

	/** Drops the live observation, which lets its session be released, but remembers the canvas to resume it. */
	suspend(tx: ITransaction | undefined): void {
		this.boundSession = undefined;
		this.liveReference.clear();
		this.liveCanvas.set(undefined, tx);
		this.boundResource.set(undefined, tx);
		this.missing.set(false, tx);
	}

	/** Forgets the live canvas, which its chat no longer lists when `missing`. */
	unbind(missing: boolean, tx: ITransaction | undefined): void {
		this.suspend(tx);
		this.lastResource = undefined;
		this.missing.set(missing, tx);
	}

	setPresent(tx: ITransaction | undefined): void {
		this.missing.set(false, tx);
	}

	/** Asks to find the live canvas again through its chat's membership, without showing the chat. */
	requestReconnect(tx: ITransaction | undefined): void {
		this._reconnecting.set(true, tx);
	}

	/**
	 * The membership of the pin's chat observed for reconnecting, acquired through `observe`
	 * for `session` on first use. Ends reconnecting when the provider cannot observe it.
	 */
	observeMembership(session: ISession, observe: () => IReference<IObservable<readonly ICanvas[] | undefined>> | undefined): IObservable<readonly ICanvas[] | undefined> | undefined {
		if (this.membershipSession !== session || !this.membershipReference.value) {
			this.membershipSession = session;
			this.membershipReference.value = observe();
			if (!this.membershipReference.value) {
				this.endReconnect(undefined);
			}
		}
		return this.membershipReference.value?.object;
	}

	/** Drops the observed membership, keeping the request until the session returns. */
	releaseMembership(): void {
		this.membershipSession = undefined;
		this.membershipReference.clear();
	}

	endReconnect(tx: ITransaction | undefined): void {
		this.releaseMembership();
		this._reconnecting.set(false, tx);
	}
}

export class PinnedCanvasService extends Disposable implements IPinnedCanvasService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;
	readonly entries: IObservable<readonly IPinnedCanvas[]>;
	readonly selected: IObservable<IPinnedCanvas | undefined>;

	private readonly pins = observableValue<readonly PinnedCanvas[]>(this, []);
	private readonly selectedId = observableValue<string | undefined>(this, undefined);
	private readonly sessionsChanged: IObservable<void>;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.enabled = observableFromEvent(this, Event.any(
			entitlementService.onDidChangeSentiment,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)),
		), () => !entitlementService.sentiment.hidden && configurationService.getValue<boolean>(CanvasesEnabledSettingId) === true);
		this.entries = derived(this, reader => this.enabled.read(reader) ? this.pins.read(reader) : []);
		this.selected = derived(this, reader => {
			const id = this.selectedId.read(reader);
			return id === undefined ? undefined : this.entries.read(reader).find(entry => entry.id === id);
		});
		this.sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);

		this.load();
		this._register(toDisposable(() => {
			for (const pin of this.pins.get()) {
				pin.dispose();
			}
		}));

		// A chat can be archived, or deleted from another window, without a catalog event, so the
		// owners' state itself is watched. This also removes restored pins whose owners went away.
		this._register(autorun(reader => {
			this.sessionsChanged.read(reader);
			const gone = this.pins.read(reader).filter(pin => this.isOwnerGone(pin, reader));
			for (const pin of gone) {
				this.unpin(pin);
			}
		}));

		// Bind each pin to its live canvas, rebinding by instance ID when its chat republishes it.
		this._register(autorun(reader => {
			const enabled = this.enabled.read(reader);
			this.sessionsChanged.read(reader);
			for (const pin of this.pins.read(reader)) {
				if (enabled) {
					this.reconcile(pin, reader);
				} else {
					// Keep a reconnect request for when canvases are enabled again, but hold no subscription meanwhile.
					if (pin.boundCanvas) {
						pin.suspend(undefined);
					}
					pin.releaseMembership();
				}
			}
		}));

		const pinnedResources = CanvasesPinnedToSidebarContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			pinnedResources.set(this.entries.read(reader).flatMap(entry => {
				const reference = entry.reference.read(reader);
				return reference ? [getCanvasInputResource(reference).toString()] : [];
			}));
		}));

		// Remember live titles so a pin that has not reconnected yet keeps its name.
		this._register(autorun(reader => {
			let changed = false;
			for (const pin of this.pins.read(reader)) {
				const canvas = pin.canvas.read(reader);
				if (canvas?.instanceId !== undefined && canvas.title !== pin.lastTitle.read(undefined)) {
					pin.lastTitle.set(canvas.title, undefined);
					changed = true;
				}
			}
			if (changed) {
				this.save();
			}
		}));

		const announcedStates = new Map<string, PinnedCanvasState>();
		this._register(autorun(reader => {
			const ids = new Set<string>();
			for (const entry of this.entries.read(reader)) {
				ids.add(entry.id);
				const state = entry.state.read(reader);
				const previous = announcedStates.get(entry.id);
				announcedStates.set(entry.id, state);
				if (previous !== undefined && previous !== state && state === PinnedCanvasState.Unavailable) {
					status(localize('pinnedCanvas.unavailableStatus', "Canvas {0} is no longer available.", entry.title.read(undefined)));
				}
			}
			for (const id of [...announcedStates.keys()]) {
				if (!ids.has(id)) {
					announcedStates.delete(id);
				}
			}
		}));

		// The canvas page shows the pin its opening names, which Back and Forward pass back,
		// and closes when that pin goes away.
		this._register(autorun(reader => {
			const open = this.customViewService.activeCustomViewOpen.read(reader);
			if (open?.descriptor.id !== PINNED_CANVAS_PAGE_ID) {
				return;
			}
			const pinId = open.state ?? this.selectedId.read(reader);
			const pin = this.entries.read(reader).find(candidate => candidate.id === pinId);
			if (!pin) {
				this.customViewService.hideCustomView();
				return;
			}
			if (this.selectedId.read(undefined) !== pin.id) {
				this.selectedId.set(pin.id, undefined);
				this.save();
			}
		}));

		// A provider reports a session removed only once it is gone. One that hides its sessions, for
		// example while it reconnects, reports no removal, so their pins wait for them to return.
		this._register(sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				// A replaced session object is reported removed while a session with its resource remains.
				if (!this.sessionsManagementService.getSession(session.resource)) {
					this.removeWhere(identity => ownsSession(identity, session));
				}
			}
		}));
		this._register(sessionsManagementService.onDidArchiveSession(session => this.removeWhere(identity => ownsSession(identity, session))));
		this._register(sessionsManagementService.onDidDeleteSession(session => this.removeWhere(identity => ownsSession(identity, session))));
		this._register(sessionsManagementService.onDidDeleteChat(({ session, chatResource }) => this.removeWhere(identity => ownsSession(identity, session) && isEqual(identity.chat, chatResource))));
		this._register(sessionsManagementService.onDidCloseCanvas(({ session, chatResource, canvasResource }) => {
			for (const pin of this.pins.get()) {
				if (ownsSession(pin.identity, session) && isEqual(pin.identity.chat, chatResource) && isEqual(pin.lastBoundCanvas, canvasResource)) {
					this.unpin(pin);
				}
			}
		}));
	}

	getEntry(target: PinnedCanvasTarget, reader?: IReader): IPinnedCanvas | undefined {
		const entries = this.entries.read(reader);
		if (isPinnedCanvas(target)) {
			return entries.find(entry => entry.id === target.id);
		}
		const key = getCanvasReferenceKey(target);
		return entries.find(entry => {
			const reference = entry.reference.read(reader);
			return !!reference && getCanvasReferenceKey(reference) === key;
		});
	}

	isPinned(reference: ICanvasReference, reader?: IReader): boolean {
		return this.getEntry(reference, reader) !== undefined;
	}

	isShown(reference: ICanvasReference, reader?: IReader): boolean {
		if (this.customViewService.activeCustomView.read(reader)?.id !== PINNED_CANVAS_PAGE_ID) {
			return false;
		}
		const shown = this.selected.read(reader)?.reference.read(reader);
		return !!shown && getCanvasReferenceKey(shown) === getCanvasReferenceKey(reference);
	}

	getTrackedCanvas(reference: ICanvasReference, reader?: IReader): ICanvas | undefined {
		return this.getEntry(reference, reader)?.canvas.read(reader);
	}

	pin(reference: ICanvasReference): boolean {
		if (!this.enabled.get()) {
			return false;
		}
		if (this.isPinned(reference)) {
			return true;
		}
		const session = this.sessionsManagementService.getSession(reference.session);
		const chat = session?.chats.get().find(candidate => isEqual(candidate.resource, reference.chat));
		const canvas = chat?.canvases?.get()?.find(candidate => isEqual(candidate.resource, reference.canvas));
		if (!session || !chat || canvas?.instanceId === undefined) {
			this.notificationService.info(localize('pinnedCanvas.notReady', "This canvas can be added to the sidebar once it has finished opening."));
			return false;
		}
		const identity: IPinnedCanvasIdentity = {
			providerId: reference.providerId,
			session: reference.session,
			chat: reference.chat,
			extensionId: canvas.extensionId ?? '',
			canvasId: canvas.canvasId ?? '',
			instanceId: canvas.instanceId,
		};
		const id = getPinnedCanvasId(identity);
		const existing = this.pins.get().find(pin => pin.id === id);
		if (existing) {
			// Reconnect a pin that was restored before its chat republished the canvas.
			existing.bind(session, reference.canvas, this.sessionsManagementService.observeCanvas(session, chat.resource, reference.canvas), undefined);
			return true;
		}
		if (this.pins.get().length >= MAX_PINNED_CANVASES) {
			this.notificationService.info(localize('pinnedCanvas.limit', "You can add up to {0} canvases to the sidebar. Remove one from the sidebar to add another.", MAX_PINNED_CANVASES));
			return false;
		}
		const pin = this.createPin(identity, canvas.title);
		pin.bind(session, reference.canvas, this.sessionsManagementService.observeCanvas(session, chat.resource, reference.canvas), undefined);
		this.pins.set([...this.pins.get(), pin], undefined);
		this.save();
		status(localize('pinnedCanvas.added', "Added canvas {0} to the sidebar.", canvas.title));
		return true;
	}

	unpin(target: PinnedCanvasTarget): void {
		const id = isPinnedCanvas(target) ? target.id : this.getEntry(target)?.id;
		const pin = this.pins.get().find(candidate => candidate.id === id);
		if (!pin) {
			return;
		}
		transaction(tx => {
			this.pins.set(this.pins.get().filter(candidate => candidate !== pin), tx);
			if (this.selectedId.get() === pin.id) {
				this.selectedId.set(undefined, tx);
			}
		});
		pin.dispose();
		this.save();
		status(localize('pinnedCanvas.removed', "Removed canvas {0} from the sidebar.", pin.title.get()));
	}

	async show(target: PinnedCanvasTarget): Promise<void> {
		const pin = this.getPin(target);
		if (!pin) {
			return;
		}
		transaction(tx => {
			this.selectedId.set(pin.id, tx);
			this.reconnectPin(pin, tx);
		});
		this.save();
		this.customViewService.showCustomView(PINNED_CANVAS_PAGE_ID, { state: pin.id });
	}

	reconnect(target: PinnedCanvasTarget): void {
		const pin = this.getPin(target);
		if (pin) {
			this.reconnectPin(pin, undefined);
		}
	}

	private reconnectPin(pin: PinnedCanvas, tx: ITransaction | undefined): void {
		if (pin.state.get() !== PinnedCanvasState.Live) {
			pin.requestReconnect(tx);
		}
	}

	private getPin(target: PinnedCanvasTarget): PinnedCanvas | undefined {
		const id = this.getEntry(target)?.id;
		return id === undefined ? undefined : this.pins.get().find(pin => pin.id === id);
	}

	async goToChat(target: PinnedCanvasTarget): Promise<void> {
		const entry = this.getEntry(target);
		if (!entry) {
			return;
		}
		const session = this.sessionsManagementService.getSession(entry.identity.session);
		if (!session || !session.chats.get().some(chat => isEqual(chat.resource, entry.identity.chat))) {
			this.notificationService.info(localize('pinnedCanvas.chatUnavailable', "The chat that owns canvas {0} is not available.", entry.title.get()));
			return;
		}
		await this.sessionsService.openChat(session, entry.identity.chat);
	}

	async closeCanvas(target: PinnedCanvasTarget): Promise<void> {
		const entry = this.getEntry(target);
		const reference = entry?.reference.get();
		const canvas = entry?.canvas.get();
		const session = reference && this.sessionsManagementService.getSession(reference.session);
		const chat = session?.chats.get().find(candidate => isEqual(candidate.resource, reference?.chat));
		if (!entry || !session || !chat || !canvas) {
			return;
		}
		try {
			// A completed close reports the canvas closed, which removes the pin unless it has moved on to another canvas meanwhile.
			await this.sessionsManagementService.closeCanvas(session, chat, canvas);
		} catch (error) {
			this.notificationService.error(localize('pinnedCanvas.closeFailed', "Could not close canvas {0}: {1}", entry.title.get(), toErrorMessage(error)));
		}
	}

	private reconcile(pin: PinnedCanvas, reader: IReader): void {
		const session = this.sessionsManagementService.getSession(pin.identity.session);
		const chat = session?.chats.read(reader).find(candidate => isEqual(candidate.resource, pin.identity.chat));
		if (!session || !chat) {
			// The observations would outlive their provider, so drop them until the session returns.
			if (pin.boundCanvas) {
				pin.suspend(undefined);
			}
			pin.releaseMembership();
			return;
		}
		const resumable = pin.resumableCanvas;
		if (!pin.isBoundTo(session) && resumable) {
			pin.bind(session, resumable, this.sessionsManagementService.observeCanvas(session, chat.resource, resumable), undefined);
		}
		// A chat publishes its canvases only while it is shown; a reconnecting pin observes them directly.
		let membership = chat.canvases?.read(reader);
		if (membership !== undefined) {
			pin.releaseMembership();
		} else if (pin.reconnecting.read(reader)) {
			membership = pin.observeMembership(session, () => this.sessionsManagementService.observeChatCanvases(session, chat.resource))?.read(reader);
		}
		if (membership === undefined) {
			return;
		}
		const bound = pin.boundCanvas;
		if (bound && membership.some(canvas => isEqual(canvas.resource, bound))) {
			transaction(tx => {
				pin.setPresent(tx);
				pin.endReconnect(tx);
			});
			return;
		}
		const { instanceId, extensionId, canvasId } = pin.identity;
		const match = membership.find(canvas => canvas.instanceId === instanceId
			&& (!canvas.extensionId || !extensionId || canvas.extensionId === extensionId)
			&& (!canvas.canvasId || !canvasId || canvas.canvasId === canvasId));
		if (match) {
			const live = this.sessionsManagementService.observeCanvas(session, chat.resource, match.resource);
			transaction(tx => {
				pin.bind(session, match.resource, live, tx);
				pin.endReconnect(tx);
			});
			return;
		}
		if (membership.every(canvas => canvas.instanceId !== undefined)) {
			transaction(tx => {
				pin.unbind(true, tx);
				pin.endReconnect(tx);
			});
		}
	}

	private removeWhere(owns: (identity: IPinnedCanvasIdentity) => boolean): void {
		for (const pin of this.pins.get()) {
			if (owns(pin.identity)) {
				this.unpin(pin);
			}
		}
	}

	/**
	 * Whether a pin's owner is gone for good: its session or chat is archived, or its session no
	 * longer lists a chat it listed before. A session missing from the catalog may only be hidden,
	 * and a chat its session has not listed yet may not be discovered yet, so neither counts.
	 */
	private isOwnerGone(pin: PinnedCanvas, reader: IReader): boolean {
		const session = this.sessionsManagementService.getSession(pin.identity.session);
		if (!session || !ownsSession(pin.identity, session)) {
			return false;
		}
		if (session.isArchived.read(reader)) {
			return true;
		}
		const chat = session.chats.read(reader).find(candidate => isEqual(candidate.resource, pin.identity.chat));
		if (!chat) {
			return pin.wasListedBy(session);
		}
		pin.markListedBy(session);
		return chat.isArchived.read(reader);
	}

	private createPin(identity: IPinnedCanvasIdentity, title: string): PinnedCanvas {
		const chatTitle = derived(this, reader => {
			this.sessionsChanged.read(reader);
			const session = this.sessionsManagementService.getSession(identity.session);
			return session?.chats.read(reader).find(chat => isEqual(chat.resource, identity.chat))?.title.read(reader);
		});
		return new PinnedCanvas(identity, title, chatTitle);
	}

	private load(): void {
		const raw = this.storageService.get(PINNED_CANVASES_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const stored = JSON.parse(raw) as IStoredPinnedCanvases;
			if (stored.version !== 1 || !Array.isArray(stored.pins)) {
				return;
			}
			const pins: PinnedCanvas[] = [];
			for (const value of stored.pins.slice(0, MAX_PINNED_CANVASES)) {
				if (typeof value?.providerId !== 'string' || typeof value.session !== 'string' || typeof value.chat !== 'string' || typeof value.instanceId !== 'string') {
					continue;
				}
				const identity: IPinnedCanvasIdentity = {
					providerId: value.providerId,
					session: URI.parse(value.session),
					chat: URI.parse(value.chat),
					extensionId: typeof value.extensionId === 'string' ? value.extensionId : '',
					canvasId: typeof value.canvasId === 'string' ? value.canvasId : '',
					instanceId: value.instanceId,
				};
				if (!pins.some(pin => pin.id === getPinnedCanvasId(identity))) {
					pins.push(this.createPin(identity, typeof value.title === 'string' ? value.title : value.instanceId));
				}
			}
			transaction(tx => {
				this.pins.set(pins, tx);
				this.selectedId.set(typeof stored.selected === 'string' && pins.some(pin => pin.id === stored.selected) ? stored.selected : undefined, tx);
			});
		} catch (error) {
			this.logService.warn('[PinnedCanvasService] Ignoring invalid pinned canvases', error);
		}
	}

	/** Persists only identities and titles: live canvas resources and source URLs do not survive a restart. */
	private save(): void {
		const pins = this.pins.get();
		if (pins.length === 0) {
			this.storageService.remove(PINNED_CANVASES_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const stored: IStoredPinnedCanvases = {
			version: 1,
			pins: pins.map(pin => ({
				providerId: pin.identity.providerId,
				session: pin.identity.session.toString(),
				chat: pin.identity.chat.toString(),
				extensionId: pin.identity.extensionId,
				canvasId: pin.identity.canvasId,
				instanceId: pin.identity.instanceId,
				title: pin.lastTitle.get(),
			})),
			selected: this.selectedId.get(),
		};
		this.storageService.store(PINNED_CANVASES_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

function ownsSession(identity: IPinnedCanvasIdentity, session: ISession): boolean {
	return identity.providerId === session.providerId && isEqual(identity.session, session.resource);
}
