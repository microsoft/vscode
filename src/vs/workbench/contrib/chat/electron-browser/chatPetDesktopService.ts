/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { BroadcastDataChannel } from '../../../../base/browser/broadcast.js';
import * as dom from '../../../../base/browser/dom.js';
import { Menu } from '../../../../base/browser/ui/menu/menu.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { IntervalTimer, RunOnceScheduler } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IReaderWithStore, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeDisplayLayout, INativeHostService } from '../../../../platform/native/common/native.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultMenuStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatWidgetService } from '../browser/chat.js';
import { IChatPetHostOptions, IChatPetHostRegistration, IChatPetHostService } from '../browser/chatPetHostService.js';
import { IChatPetActivity, IChatPetService } from '../browser/chatPetService.js';
import { ChatPetWidget, IChatPetDesktopHost } from '../browser/widget/chatPetWidget.js';
import { IChatInputWindowService } from '../common/chatInputWindow.js';

const CHAT_PET_PEER_STALE_DURATION = 15_000;
const CHAT_PET_PEER_HEARTBEAT_INTERVAL = 5_000;
const CHAT_PET_DESKTOP_WINDOW_SIZE = 256;
const CHAT_PET_DESKTOP_MENU_WIDTH = 420;
const CHAT_PET_DESKTOP_MENU_HEIGHT = 520;
const CHAT_PET_DESKTOP_POSITION_STORAGE_KEY = 'chat.vscodePet.desktopPosition';

interface IChatPetWireHost {
	readonly id: string;
	readonly visible: boolean;
	readonly preferred: boolean;
	readonly recency: number;
	readonly hasInput: boolean;
	readonly sessionResource?: string;
	readonly screenBounds?: IRectangle;
}

interface IChatPetWireActivity {
	readonly hasActiveRequest: boolean;
	readonly needsInput: boolean;
	readonly recency: number;
	readonly sessionResource: string;
}

interface IChatPetWireRecentSession {
	readonly recency: number;
	readonly sessionResource: string;
}

interface IChatPetWireState {
	readonly type: 'state';
	readonly instanceId: string;
	readonly updatedAt: number;
	readonly focusOrder: number;
	readonly mainFocused: boolean;
	readonly documentVisible: boolean;
	readonly enabled: boolean;
	readonly hosts: readonly IChatPetWireHost[];
	readonly activity?: IChatPetWireActivity;
	readonly recentSession?: IChatPetWireRecentSession;
	readonly completionToken?: string;
	readonly completionAt: number;
	readonly scale: number;
	readonly scaleUpdatedAt: number;
}

interface IChatPetWireBye {
	readonly type: 'bye';
	readonly instanceId: string;
}

interface IChatPetWireCommand {
	readonly type: 'command';
	readonly instanceId: string;
	readonly targetInstanceId: string;
	readonly command: 'goToChat' | 'openRecentInput';
	readonly sessionResource: string;
	readonly petBounds?: IRectangle;
}

type ChatPetWireMessage = IChatPetWireState | IChatPetWireBye | IChatPetWireCommand;

interface ISelectedChatPetState {
	readonly ownerInstanceId?: string;
	readonly host?: IChatPetWireHost & { readonly instanceId: string };
	readonly activity: IChatPetActivity;
	readonly targetInstanceId?: string;
	readonly recentSession?: IChatPetWireRecentSession & { readonly instanceId: string };
}

class NativeChatPetHostRegistration extends Disposable implements IChatPetHostRegistration {

	readonly visible = observableValue(this, false);
	readonly activity = observableValue<IChatPetActivity | undefined>(this, undefined);
	readonly id = generateUuid();
	recency = Date.now();

	private _preferred = false;
	private _sessionResource: string | undefined;

	constructor(
		readonly options: IChatPetHostOptions,
		private readonly onDidChange: (registration: NativeChatPetHostRegistration, sessionResourceChanged: boolean) => void,
		private readonly onDispose: (registration: NativeChatPetHostRegistration) => void,
	) {
		super();
		this._register(autorun(reader => {
			const preferred = options.hostPreferred.read(reader);
			const sessionResource = options.model.read(reader)?.sessionResource.toString();
			options.hostVisible.read(reader);
			options.hasInput.read(reader);
			const sessionResourceChanged = sessionResource !== this._sessionResource;
			if ((preferred && !this._preferred) || (preferred && sessionResourceChanged)) {
				this.recency = Date.now();
			}
			this._preferred = preferred;
			this._sessionResource = sessionResource;
			this.onDidChange(this, sessionResourceChanged);
		}));
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this.onDispose(this);
		super.dispose();
	}

	toWireHost(): IChatPetWireHost {
		return {
			id: this.id,
			visible: this.options.hostVisible.get(),
			preferred: this.options.hostPreferred.get(),
			recency: this.recency,
			hasInput: this.options.hasInput.get(),
			sessionResource: this.options.model.get()?.sessionResource.toString(),
			screenBounds: this.options.getScreenBounds(),
		};
	}

	setSelected(visible: boolean, activity: IChatPetActivity | undefined): void {
		this.visible.set(visible, undefined);
		this.activity.set(activity, undefined);
	}
}

export class DesktopChatPetService extends Disposable implements IChatPetHostService {

	declare readonly _serviceBrand: undefined;

	private readonly _instanceId = generateUuid();
	private readonly _channel = this._register(new BroadcastDataChannel<ChatPetWireMessage>('vscode-chat-pet'));
	private readonly _heartbeat = this._register(new IntervalTimer());
	private readonly _hosts = new Set<NativeChatPetHostRegistration>();
	private readonly _hostVersion = observableValue(this, 0);
	private readonly _activityVersion = observableValue(this, 0);
	private readonly _peerVersion = observableValue(this, 0);
	private readonly _peers = new Map<string, IChatPetWireState>();
	private readonly _sessionRecency = new Map<string, number>();
	private readonly _desktopWindow = this._register(new MutableDisposable<IAuxiliaryWindow>());
	private readonly _desktopMenuWindow = this._register(new MutableDisposable<IAuxiliaryWindow>());
	private readonly _desktopWindowDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _desktopMenuWindowDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _desktopActivity = observableValue<IChatPetActivity | undefined>(this, undefined);
	private readonly _desktopVisible = observableValue(this, false);
	private readonly _desktopSupport = observableValue<'unknown' | 'supported' | 'unsupported'>(this, 'unknown');
	private readonly _displayVersion = observableValue(this, 0);
	private readonly _storeDesktopPositionScheduler = this._register(new RunOnceScheduler(() => this._storeDesktopPosition(), 200));
	private _focusOrder = Date.now();
	private _completionSequence = 0;
	private _completionToken: string | undefined;
	private _completionAt = 0;
	private _lastScale: number | undefined;
	private _scaleUpdatedAt = 0;
	private _applyingRemoteScale = false;
	private _ownState: IChatPetWireState | undefined;
	private _ownStateComparisonKey: string | undefined;
	private _selectedState: ISelectedChatPetState | undefined;
	private _desktopDesiredVisible = false;
	private _desktopOpenOperation: Promise<void> | undefined;
	private _desktopBounds: IRectangle | undefined;
	private _displays: readonly INativeDisplayLayout[] = [];
	private _desktopRoot: HTMLElement | undefined;
	private _desktopPlatform: HTMLElement | undefined;
	private _desktopInteractiveElements: readonly HTMLElement[] = [];
	private _desktopInteractiveBounds: IRectangle | undefined;
	private _desktopMouseEventsIgnored: boolean | undefined;
	private _desktopPointerInteraction = false;
	private _desktopMenuGeneration = 0;
	private _desktopMenuOnHide: (() => void) | undefined;

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatService private readonly chatService: IChatService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IHostService private readonly hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IChatInputWindowService private readonly chatInputWindowService: IChatInputWindowService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.logService.trace('[chatPetDesktop] initialized');

		this._register(this._channel.onDidReceiveData(message => this._onDidReceiveMessage(message)));
		this._register(this.chatService.onDidSubmitRequest(event => this._touchSession(event.chatSessionResource.toString())));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this._touchActivity()));
		this._register(this.nativeHostService.onDidChangeDisplay(() => {
			void this._refreshDisplays();
		}));
		void this._resolveDesktopSupport();
		void this._refreshDisplays();

		const onFocus = () => {
			this._focusOrder = Date.now();
			for (const host of this._hosts) {
				if (host.options.hostPreferred.get()) {
					host.recency = this._focusOrder;
				}
			}
			this._touchHosts();
		};
		const onVisibilityChange = () => this._touchActivity();
		mainWindow.addEventListener('focus', onFocus);
		mainWindow.addEventListener('blur', onVisibilityChange);
		mainWindow.document.addEventListener('visibilitychange', onVisibilityChange);
		this._register(toDisposable(() => {
			mainWindow.removeEventListener('focus', onFocus);
			mainWindow.removeEventListener('blur', onVisibilityChange);
			mainWindow.document.removeEventListener('visibilitychange', onVisibilityChange);
		}));

		this._register(autorun(reader => this._recompute(reader)));
		this._heartbeat.cancelAndSet(() => {
			if (this._prunePeers()) {
				this._touchPeers();
			}
			this._publishOwnState();
		}, CHAT_PET_PEER_HEARTBEAT_INTERVAL);

		this._register(Event.once(Event.fromDOMEventEmitter(mainWindow, 'beforeunload'))(() => {
			this._channel.postData({ type: 'bye', instanceId: this._instanceId });
		}));
	}

	registerHost(options: IChatPetHostOptions): IChatPetHostRegistration {
		const registration = new NativeChatPetHostRegistration(
			options,
			(host, sessionResourceChanged) => {
				if (sessionResourceChanged && host.options.hostPreferred.get()) {
					const resource = host.options.model.get()?.sessionResource.toString();
					if (resource) {
						this._touchSession(resource);
					}
				} else {
					this._touchHosts();
				}
			},
			host => {
				this._hosts.delete(host);
				this._touchHosts();
			},
		);
		this._hosts.add(registration);
		this._touchHosts();
		return registration;
	}

	private _recompute(reader: IReaderWithStore): void {
		this._hostVersion.read(reader);
		this._activityVersion.read(reader);
		this._peerVersion.read(reader);
		this._displayVersion.read(reader);
		const enabled = this.chatPetService.enabled.read(reader) && !this.chatEntitlementService.sentiment.hidden;
		const scale = this.chatPetService.scale.read(reader);
		if (this._lastScale === undefined) {
			this._lastScale = scale;
		} else if (scale !== this._lastScale) {
			this._lastScale = scale;
			if (!this._applyingRemoteScale) {
				this._scaleUpdatedAt = Date.now();
			}
		}
		this._resizeDesktopWindow(scale);
		const desktopSupported = this._desktopSupport.read(reader) === 'supported';
		const activity = this._computeLocalActivity(reader);
		const recentSession = this._getRecentSession();
		const ownState: IChatPetWireState = {
			type: 'state',
			instanceId: this._instanceId,
			updatedAt: Date.now(),
			focusOrder: this._focusOrder,
			mainFocused: mainWindow.document.hasFocus(),
			documentVisible: !mainWindow.document.hidden,
			enabled: enabled && desktopSupported,
			hosts: Array.from(this._hosts, host => host.toWireHost()),
			activity,
			recentSession,
			completionToken: this._completionToken,
			completionAt: this._completionAt,
			scale,
			scaleUpdatedAt: this._scaleUpdatedAt,
		};
		this._ownState = ownState;
		if (!desktopSupported) {
			for (const host of this._hosts) {
				host.setSelected(enabled && host.options.hostPreferred.get(), undefined);
			}
			this._setDesktopPetVisible(false, {
				hasActiveRequest: false,
				needsInput: false,
				hasInput: false,
			});
			this._publishOwnStateIfChanged(ownState);
			return;
		}
		this._selectedState = selectChatPetState([ownState, ...this._peers.values()]);
		this._applySelectedState(this._selectedState);
		this._publishOwnStateIfChanged(ownState);
	}

	private _publishOwnStateIfChanged(state: IChatPetWireState): void {
		const comparisonKey = getChatPetWireStateComparisonKey(state);
		if (comparisonKey === this._ownStateComparisonKey) {
			return;
		}
		this._ownStateComparisonKey = comparisonKey;
		this._channel.postData(state);
	}

	private _computeLocalActivity(reader: IReaderWithStore): IChatPetWireActivity | undefined {
		let selected: IChatPetWireActivity | undefined;
		for (const model of this.chatService.chatModels.read(reader)) {
			const lastRequest = model.lastRequestObs.read(reader);
			const response = lastRequest?.response;
			const needsInput = !!response?.isPendingConfirmation.read(reader);
			const hasActiveRequest = model.hasActiveRequest.read(reader);
			if (response) {
				reader.store.add(response.onDidChange(event => {
					if (event.reason === 'completedRequest' && !response.isCanceled) {
						this._completionToken = `${this._instanceId}:${++this._completionSequence}`;
						this._completionAt = Date.now();
						this._touchSession(model.sessionResource.toString());
					}
				}));
			}
			if (!needsInput && !hasActiveRequest) {
				continue;
			}
			const sessionResource = model.sessionResource.toString();
			const candidate: IChatPetWireActivity = {
				hasActiveRequest,
				needsInput,
				recency: this._sessionRecency.get(sessionResource) ?? 0,
				sessionResource,
			};
			if (!selected || compareActivity(candidate, selected) > 0) {
				selected = candidate;
			}
		}
		return selected;
	}

	private _getRecentSession(): IChatPetWireRecentSession | undefined {
		let selected: IChatPetWireRecentSession | undefined;
		for (const [sessionResource, recency] of this._sessionRecency) {
			if (!selected || recency > selected.recency || (recency === selected.recency && sessionResource > selected.sessionResource)) {
				selected = { sessionResource, recency };
			}
		}
		return selected;
	}

	private _applySelectedState(selected: ISelectedChatPetState): void {
		for (const host of this._hosts) {
			const visible = selected.host?.instanceId === this._instanceId && selected.host.id === host.id;
			host.setSelected(visible, visible ? selected.activity : undefined);
		}
		this._setDesktopPetVisible(selected.ownerInstanceId === this._instanceId && !selected.host, selected.activity);
	}

	protected _setDesktopPetVisible(visible: boolean, activity: IChatPetActivity): void {
		this.logService.trace(`[chatPetDesktop] desktop visibility=${visible}`);
		if (!equalsChatPetActivity(this._desktopActivity.get(), activity)) {
			this._desktopActivity.set(activity, undefined);
		}
		this._desktopDesiredVisible = visible;
		if (!visible) {
			if (!this._desktopVisible.get()) {
				return;
			}
			this._desktopVisible.set(false, undefined);
			const auxiliaryWindow = this._desktopWindow.value;
			if (auxiliaryWindow && !auxiliaryWindow.window.closed) {
				void this.nativeHostService.hideWindow({ targetWindowId: auxiliaryWindow.window.vscodeWindowId });
			}
			return;
		}
		const auxiliaryWindow = this._desktopWindow.value;
		if (auxiliaryWindow && !auxiliaryWindow.window.closed) {
			if (!this._desktopVisible.get()) {
				void this.nativeHostService.showWindow({ targetWindowId: auxiliaryWindow.window.vscodeWindowId, inactive: true });
			}
			this._desktopVisible.set(true, undefined);
			return;
		}
		this._desktopWindow.clear();
		this._desktopWindowDisposables.clear();
		this._ensureDesktopWindow();
	}

	private _ensureDesktopWindow(): void {
		if (!this._desktopDesiredVisible || this._desktopWindow.value || this._desktopOpenOperation || this._store.isDisposed) {
			return;
		}
		const operation = this._openDesktopWindow();
		this._desktopOpenOperation = operation;
		void operation.then(undefined, error => {
			this.logService.error('[chatPetDesktop] Failed to open desktop pet window', error);
		}).finally(() => {
			if (this._desktopOpenOperation === operation) {
				this._desktopOpenOperation = undefined;
				this._ensureDesktopWindow();
			}
		});
	}

	private async _openDesktopWindow(): Promise<void> {
		const bounds = await this._resolveDesktopBounds();
		if (!this._desktopDesiredVisible || this._store.isDisposed) {
			return;
		}
		const auxiliaryWindow = await this.auxiliaryWindowService.open({
			bounds,
			alwaysOnTop: true,
			frameless: true,
			transparent: true,
			disableFullscreen: true,
			nativeTitlebar: false,
			notResizable: true,
			noBackgroundThrottling: true,
			backgroundColor: '#00000000',
			zoomLevel: 0,
			show: 'inactive',
			alwaysOnTopLevel: isMacintosh ? 'screen-saver' : undefined,
			focusable: false,
			nonActivatingPanel: isMacintosh,
			parentless: true,
			skipTaskbar: true,
			visibleOnAllWorkspaces: !isWindows,
			visibleOnFullScreen: !isWindows,
		});
		if (!this._desktopDesiredVisible || this._store.isDisposed) {
			auxiliaryWindow.dispose();
			return;
		}
		await auxiliaryWindow.whenStylesHaveLoaded;
		if (!this._desktopDesiredVisible || this._store.isDisposed) {
			auxiliaryWindow.dispose();
			return;
		}

		this._desktopBounds = bounds;
		this._desktopWindow.value = auxiliaryWindow;
		const disposables = new DisposableStore();
		this._desktopWindowDisposables.value = disposables;
		disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
			if (this._desktopWindow.value !== auxiliaryWindow) {
				return;
			}
			this._desktopWindow.clear();
			this._desktopWindowDisposables.clear();
			this._desktopVisible.set(false, undefined);
			this._desktopBounds = undefined;
			this._desktopInteractiveBounds = undefined;
			this._desktopMouseEventsIgnored = undefined;
			this._desktopPointerInteraction = false;
			this._ensureDesktopWindow();
		}));
		auxiliaryWindow.window.document.title = localize('chatPet.desktopWindowTitle', "VS Code Pet");
		auxiliaryWindow.window.document.body.style.backgroundColor = 'transparent';
		auxiliaryWindow.window.document.body.style.margin = '0';
		auxiliaryWindow.window.document.body.style.overflow = 'hidden';
		auxiliaryWindow.container.style.backgroundColor = 'transparent';
		auxiliaryWindow.container.style.overflow = 'hidden';

		const root = dom.append(auxiliaryWindow.container, dom.$('.chat-pet-desktop-host'));
		this._desktopRoot = root;
		root.style.width = `${bounds.width}px`;
		root.style.height = `${bounds.height}px`;
		const platform = dom.append(root, dom.$('.chat-pet-desktop-platform'));
		this._desktopPlatform = platform;
		platform.style.top = `${bounds.height / 2 + 24}px`;
		platform.style.right = '4px';
		disposables.add(toDisposable(() => {
			this._desktopRoot = undefined;
			this._desktopPlatform = undefined;
			this._desktopInteractiveElements = [];
		}));
		const desktopHost: IChatPetDesktopHost = {
			canMove: () => this._desktopDesiredVisible && !this.chatInputWindowService.isOpen,
			moveBy: (deltaX, deltaY) => this._moveDesktopWindow(deltaX, deltaY),
			finishMove: () => this._finishDesktopMove(),
			showContextMenu: (event, actions, onHide) => {
				void this._showDesktopContextMenu(event, actions, onHide);
			},
			setInteractiveElements: elements => this._desktopInteractiveElements = elements,
			getContextMenuActions: store => this._getDesktopContextMenuActions(store),
		};
		const petWidget = disposables.add(this.instantiationService.createInstance(
			ChatPetWidget,
			root,
			platform,
			root,
			constObservable(undefined),
			constObservable(false),
			this._desktopActivity,
			desktopHost,
			this._desktopVisible,
			Event.None,
		));
		petWidget.setPlatformTopProvider(() => platform.getBoundingClientRect().top);
		this._configureDesktopHitTesting(auxiliaryWindow, root, disposables);
		this._desktopVisible.set(true, undefined);
	}

	private _configureDesktopHitTesting(auxiliaryWindow: IAuxiliaryWindow, root: HTMLElement, disposables: DisposableStore): void {
		const targetWindow = auxiliaryWindow.window;
		const updateScheduler = disposables.add(new dom.AnimationFrameScheduler(root, () => {
			const bounds = getChatPetInteractiveBounds(root, this._desktopInteractiveElements);
			const boundsChanged = !equalsRectangle(this._desktopInteractiveBounds, bounds);
			this._desktopInteractiveBounds = bounds;
			if (isLinux && bounds) {
				void this.nativeHostService.setWindowShape([bounds], { targetWindowId: targetWindow.vscodeWindowId }).catch(error => {
					this.logService.error('[chatPetDesktop] Failed to update desktop pet window shape', error);
				});
			} else if (boundsChanged) {
				void this._refreshDesktopMouseHitTest(auxiliaryWindow).catch(error => {
					this.logService.error('[chatPetDesktop] Failed to refresh desktop pet mouse hit testing', error);
				});
			}
		}));
		const mutationObserver = new targetWindow.MutationObserver(() => updateScheduler.schedule());
		mutationObserver.observe(root, { attributes: true, childList: true, subtree: true });
		disposables.add(toDisposable(() => mutationObserver.disconnect()));
		const resizeObserver = new dom.DisposableResizeObserver('DesktopChatPetService.hitTesting', () => updateScheduler.schedule(), targetWindow);
		disposables.add(resizeObserver);
		disposables.add(resizeObserver.observe(root));
		for (const element of this._desktopInteractiveElements) {
			disposables.add(resizeObserver.observe(element));
		}
		if (!isLinux) {
			void this._refreshDesktopMouseHitTest(auxiliaryWindow);
			disposables.add(dom.addDisposableListener(targetWindow.document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
				if (this._desktopPointerInteraction) {
					this._setDesktopMouseEventsIgnored(auxiliaryWindow, false);
					return;
				}
				const bounds = this._desktopInteractiveBounds;
				const interactive = !!bounds && containsPoint(bounds, event.clientX, event.clientY);
				this._setDesktopMouseEventsIgnored(auxiliaryWindow, !interactive);
			}));
		}
		updateScheduler.schedule();
	}

	private async _refreshDesktopMouseHitTest(auxiliaryWindow: IAuxiliaryWindow): Promise<void> {
		const cursor = await this.hostService.getCursorScreenPoint();
		if (this._desktopWindow.value !== auxiliaryWindow || this._desktopPointerInteraction) {
			return;
		}
		const windowBounds = this._desktopBounds;
		const interactiveBounds = this._desktopInteractiveBounds;
		const interactive = !!cursor && !!windowBounds && !!interactiveBounds
			&& containsPoint(interactiveBounds, cursor.point.x - windowBounds.x, cursor.point.y - windowBounds.y);
		this._setDesktopMouseEventsIgnored(auxiliaryWindow, !interactive);
	}

	private _setDesktopMouseEventsIgnored(auxiliaryWindow: IAuxiliaryWindow, ignored: boolean): void {
		if (this._desktopWindow.value !== auxiliaryWindow || this._desktopMouseEventsIgnored === ignored) {
			return;
		}
		this._desktopMouseEventsIgnored = ignored;
		void this.nativeHostService.setWindowIgnoreMouseEvents(ignored, {
			targetWindowId: auxiliaryWindow.window.vscodeWindowId,
			forward: ignored,
		}).catch(error => {
			this.logService.error('[chatPetDesktop] Failed to update desktop pet mouse hit testing', error);
		});
	}

	private async _resolveDesktopBounds(): Promise<IRectangle> {
		const scale = Math.max(0.5, this.chatPetService.scale.get());
		const size = Math.ceil(CHAT_PET_DESKTOP_WINDOW_SIZE * scale);
		const stored = this.storageService.getObject<{ readonly x: number; readonly y: number }>(CHAT_PET_DESKTOP_POSITION_STORAGE_KEY, StorageScope.APPLICATION);
		const cursor = await this.hostService.getCursorScreenPoint();
		const fallbackDisplay = cursor?.display ?? {
			x: mainWindow.screenX,
			y: mainWindow.screenY,
			width: mainWindow.screen.width,
			height: mainWindow.screen.height,
		};
		const preferred = {
			x: stored?.x ?? fallbackDisplay.x + fallbackDisplay.width - size - 32,
			y: stored?.y ?? fallbackDisplay.y + fallbackDisplay.height - size - 32,
			width: size,
			height: size,
		};
		return clampRectangleToDisplays(preferred, this._displays.map(display => display.bounds), fallbackDisplay);
	}

	private _moveDesktopWindow(deltaX: number, deltaY: number): void {
		const auxiliaryWindow = this._desktopWindow.value;
		const bounds = this._desktopBounds;
		if (!auxiliaryWindow || !bounds) {
			return;
		}
		this._desktopPointerInteraction = true;
		this._setDesktopMouseEventsIgnored(auxiliaryWindow, false);
		const nextBounds = {
			...bounds,
			x: bounds.x + deltaX,
			y: bounds.y + deltaY,
		};
		this._desktopBounds = nextBounds;
		void auxiliaryWindow.setBounds(nextBounds);
		this._storeDesktopPositionScheduler.schedule();
	}

	private _finishDesktopMove(): void {
		const auxiliaryWindow = this._desktopWindow.value;
		const bounds = this._desktopBounds;
		if (!auxiliaryWindow || !bounds) {
			return;
		}
		this._desktopPointerInteraction = false;
		const clampedBounds = clampRectangleToDisplays(bounds, this._displays.map(display => display.bounds), bounds);
		this._desktopBounds = clampedBounds;
		void auxiliaryWindow.setBounds(clampedBounds);
		this._storeDesktopPositionScheduler.schedule();
		void this._refreshDesktopMouseHitTest(auxiliaryWindow).catch(error => {
			this.logService.error('[chatPetDesktop] Failed to refresh desktop pet mouse hit testing', error);
		});
	}

	private _resizeDesktopWindow(scale: number): void {
		const auxiliaryWindow = this._desktopWindow.value;
		const bounds = this._desktopBounds;
		if (!auxiliaryWindow || !bounds) {
			return;
		}
		const size = Math.ceil(CHAT_PET_DESKTOP_WINDOW_SIZE * Math.max(0.5, scale));
		if (bounds.width === size && bounds.height === size) {
			return;
		}
		const resizedBounds = {
			x: bounds.x + (bounds.width - size) / 2,
			y: bounds.y + (bounds.height - size) / 2,
			width: size,
			height: size,
		};
		this._desktopBounds = clampRectangleToDisplays(resizedBounds, this._displays.map(display => display.bounds), resizedBounds);
		this._desktopRoot?.style.setProperty('width', `${size}px`);
		this._desktopRoot?.style.setProperty('height', `${size}px`);
		this._desktopPlatform?.style.setProperty('top', `${size / 2 + 24 * scale}px`);
		this._desktopPlatform?.style.setProperty('right', `${Math.max(4, 34 * scale - 28)}px`);
		void auxiliaryWindow.setBounds(this._desktopBounds);
		this._storeDesktopPositionScheduler.schedule();
	}

	private _storeDesktopPosition(): void {
		if (!this._desktopBounds) {
			return;
		}
		this.storageService.store(CHAT_PET_DESKTOP_POSITION_STORAGE_KEY, JSON.stringify({
			x: this._desktopBounds.x,
			y: this._desktopBounds.y,
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _getDesktopContextMenuActions(store: DisposableStore): readonly IAction[] {
		const selectedSessionResource = this._selectedState?.activity.sessionResource ?? this._selectedState?.recentSession?.sessionResource;
		const recentSessionResource = this._selectedState?.recentSession?.sessionResource;
		const recentSessionInstanceId = this._selectedState?.recentSession?.instanceId;
		const selectedSessionInstanceId = this._selectedState?.targetInstanceId;
		const dictateInNewChat = store.add(new Action(
			'chat.pet.desktop.dictateInNewChat',
			localize('chatPet.desktop.dictateInNewChat', "Dictate in New Chat…"),
			undefined,
			!!this._desktopBounds,
			async () => {
				if (this._desktopBounds) {
					await this.chatInputWindowService.openPetInput({ kind: 'new' }, this._desktopBounds);
				}
			},
		));
		const dictateInRecentChat = store.add(new Action(
			'chat.pet.desktop.dictateInRecentChat',
			localize('chatPet.desktop.dictateInRecentChat', "Dictate in Most Recent Chat…"),
			undefined,
			!!recentSessionResource && !!this._desktopBounds,
			async () => {
				if (recentSessionResource && this._desktopBounds) {
					if (recentSessionInstanceId && recentSessionInstanceId !== this._instanceId) {
						this._channel.postData({
							type: 'command',
							instanceId: this._instanceId,
							targetInstanceId: recentSessionInstanceId,
							command: 'openRecentInput',
							sessionResource: recentSessionResource,
							petBounds: this._desktopBounds,
						});
					} else {
						await this.chatInputWindowService.openPetInput({ kind: 'session', sessionResource: URI.parse(recentSessionResource) }, this._desktopBounds);
					}
				}
			},
		));
		const goToChat = store.add(new Action(
			'chat.pet.desktop.goToChat',
			localize('chatPet.desktop.goToChat', "Go to Chat"),
			undefined,
			!!selectedSessionResource,
			async () => {
				if (!selectedSessionResource) {
					return;
				}
				if (selectedSessionInstanceId && selectedSessionInstanceId !== this._instanceId) {
					this._channel.postData({
						type: 'command',
						instanceId: this._instanceId,
						targetInstanceId: selectedSessionInstanceId,
						command: 'goToChat',
						sessionResource: selectedSessionResource,
					});
				} else {
					await this.chatWidgetService.openSession(URI.parse(selectedSessionResource));
					await this.hostService.focus(mainWindow);
				}
			},
		));
		const hidePet = store.add(new Action(
			'chat.pet.desktop.hide',
			localize('chatPet.desktop.hide', "Hide Pet"),
			undefined,
			true,
			() => {
				this.chatPetService.toggle();
			},
		));
		return [dictateInNewChat, dictateInRecentChat, goToChat, hidePet];
	}

	private async _showDesktopContextMenu(event: MouseEvent, actions: readonly IAction[], onHide: () => void): Promise<void> {
		this._finishDesktopContextMenu();
		const generation = this._desktopMenuGeneration;
		this._desktopMenuOnHide = onHide;
		const screenX = (this._desktopBounds?.x ?? event.screenX - event.clientX) + event.clientX;
		const screenY = (this._desktopBounds?.y ?? event.screenY - event.clientY) + event.clientY;
		const fallbackDisplay = {
			x: screenX - CHAT_PET_DESKTOP_MENU_WIDTH / 2,
			y: screenY - CHAT_PET_DESKTOP_MENU_HEIGHT / 2,
			width: CHAT_PET_DESKTOP_MENU_WIDTH,
			height: CHAT_PET_DESKTOP_MENU_HEIGHT,
		};
		const display = findNearestDisplay(screenX, screenY, this._displays.map(candidate => candidate.workArea), fallbackDisplay);
		const bounds = clampRectangleToDisplay({
			x: screenX,
			y: screenY,
			width: CHAT_PET_DESKTOP_MENU_WIDTH,
			height: CHAT_PET_DESKTOP_MENU_HEIGHT,
		}, display);
		let menuWindow: IAuxiliaryWindow | undefined;
		try {
			menuWindow = await this.auxiliaryWindowService.open({
				bounds,
				alwaysOnTop: true,
				alwaysOnTopLevel: isMacintosh ? 'screen-saver' : undefined,
				frameless: true,
				transparent: true,
				disableFullscreen: true,
				nativeTitlebar: false,
				notResizable: true,
				noBackgroundThrottling: true,
				backgroundColor: '#00000000',
				zoomLevel: 0,
				show: 'hidden',
				nonActivatingPanel: isMacintosh,
				parentless: true,
				skipTaskbar: true,
				visibleOnAllWorkspaces: !isWindows,
				visibleOnFullScreen: !isWindows,
			});
			await menuWindow.whenStylesHaveLoaded;
		} catch (error) {
			menuWindow?.dispose();
			this.logService.error('[chatPetDesktop] Failed to open desktop pet menu', error);
			if (generation === this._desktopMenuGeneration) {
				this._finishDesktopContextMenu();
			}
			return;
		}
		if (generation !== this._desktopMenuGeneration || !this._desktopDesiredVisible || this._store.isDisposed) {
			menuWindow.dispose();
			return;
		}
		menuWindow.window.document.title = localize('chatPet.desktopMenuWindowTitle', "VS Code Pet Menu");
		menuWindow.window.document.body.style.backgroundColor = 'transparent';
		menuWindow.window.document.body.style.margin = '0';
		menuWindow.window.document.body.style.overflow = 'hidden';
		menuWindow.container.style.backgroundColor = 'transparent';
		this._desktopMenuWindow.value = menuWindow;
		const disposables = new DisposableStore();
		this._desktopMenuWindowDisposables.value = disposables;
		disposables.add(Event.once(menuWindow.onUnload)(() => {
			if (this._desktopMenuWindow.value === menuWindow) {
				this._finishDesktopContextMenu();
			}
		}));
		const shadowHost = dom.append(menuWindow.container, dom.$('.chat-pet-desktop-menu-shadow-host'));
		const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
		const menuHost = menuWindow.window.document.createElement('div');
		menuHost.classList.add('chat-pet-desktop-menu-host');
		shadowRoot.appendChild(menuHost);
		menuHost.style.position = 'absolute';
		menuHost.style.left = '0';
		menuHost.style.top = '0';
		menuHost.style.display = 'inline-block';
		menuHost.style.width = 'max-content';
		menuHost.style.padding = '8px';
		menuHost.style.boxSizing = 'border-box';
		const menu = disposables.add(new Menu(menuHost, actions, {
			ariaLabel: localize('chatPet.desktopMenuAriaLabel', "VS Code Pet Actions"),
		}, defaultMenuStyles));
		disposables.add(menu.onDidCancel(() => this._finishDesktopContextMenu()));
		disposables.add(menu.onDidBlur(() => this._finishDesktopContextMenu()));
		disposables.add(dom.addDisposableListener(menuWindow.window, dom.EventType.BLUR, () => this._finishDesktopContextMenu()));
		disposables.add(menu.onDidRun(event => {
			if (event.error && !isCancellationError(event.error)) {
				this.notificationService.error(event.error);
			}
			this._finishDesktopContextMenu();
		}));
		const menuWidth = Math.ceil(menuHost.scrollWidth);
		const menuHeight = Math.ceil(menuHost.scrollHeight);
		const placedBounds = placeRectangleAtPoint(screenX, screenY, menuWidth, menuHeight, display);
		try {
			await menuWindow.setBounds(placedBounds);
			if (generation !== this._desktopMenuGeneration || this._desktopMenuWindow.value !== menuWindow) {
				return;
			}
			if (isLinux) {
				await this.nativeHostService.setWindowShape([{ x: 0, y: 0, width: menuWidth, height: menuHeight }], { targetWindowId: menuWindow.window.vscodeWindowId });
			}
			await this.nativeHostService.showWindow({ targetWindowId: menuWindow.window.vscodeWindowId, inactive: true });
		} catch (error) {
			this.logService.error('[chatPetDesktop] Failed to place desktop pet menu', error);
			if (generation === this._desktopMenuGeneration) {
				this._finishDesktopContextMenu();
			}
		}
	}

	private _finishDesktopContextMenu(): void {
		this._desktopMenuGeneration++;
		const onHide = this._desktopMenuOnHide;
		this._desktopMenuOnHide = undefined;
		this._desktopMenuWindowDisposables.clear();
		this._desktopMenuWindow.clear();
		onHide?.();
	}

	private async _resolveDesktopSupport(): Promise<void> {
		const displayProtocol = isLinux ? await this.nativeHostService.getLinuxDisplayProtocol() : undefined;
		const supported = !isLinux || displayProtocol === 'x11' || displayProtocol === 'xwayland';
		this._desktopSupport.set(supported ? 'supported' : 'unsupported', undefined);
	}

	private async _refreshDisplays(): Promise<void> {
		this._displays = await this.nativeHostService.getDisplays();
		this._displayVersion.set(this._displayVersion.get() + 1, undefined);
		if (this._desktopBounds && this._desktopWindow.value) {
			this._finishDesktopMove();
		}
	}

	private _onDidReceiveMessage(message: ChatPetWireMessage): void {
		if (!message || message.instanceId === this._instanceId) {
			return;
		}
		if (message.type === 'command') {
			if (message.targetInstanceId === this._instanceId) {
				void this._handleCommand(message).catch(error => this.logService.error('[chatPetDesktop] Command failed', error));
			}
			return;
		}
		if (message.type === 'bye') {
			if (this._peers.delete(message.instanceId)) {
				this._touchPeers();
			}

			return;
		}
		if (!isChatPetWireState(message)) {
			return;
		}
		if (message.scaleUpdatedAt > this._scaleUpdatedAt && message.scale !== this.chatPetService.scale.get()) {
			this._scaleUpdatedAt = message.scaleUpdatedAt;
			this._applyingRemoteScale = true;
			try {
				this.chatPetService.setScale(message.scale);
			} finally {
				this._applyingRemoteScale = false;
			}
		}
		const previousState = this._peers.get(message.instanceId);
		this._peers.set(message.instanceId, message);
		const peersChanged = !previousState || getChatPetWireStateComparisonKey(previousState) !== getChatPetWireStateComparisonKey(message);
		if (this._prunePeers() || peersChanged) {
			this._touchPeers();
		}
	}

	private async _handleCommand(message: IChatPetWireCommand): Promise<void> {
		const sessionResource = URI.parse(message.sessionResource);
		if (message.command === 'goToChat') {
			await this.chatWidgetService.openSession(sessionResource);
			await this.hostService.focus(mainWindow);
		} else if (message.petBounds) {
			await this.chatInputWindowService.openPetInput({ kind: 'session', sessionResource }, message.petBounds);
		}
	}

	private _prunePeers(): boolean {
		const staleBefore = Date.now() - CHAT_PET_PEER_STALE_DURATION;
		let changed = false;
		for (const [instanceId, state] of this._peers) {
			if (state.updatedAt < staleBefore) {
				this._peers.delete(instanceId);
				changed = true;
			}
		}
		return changed;
	}

	private _publishOwnState(): void {
		if (this._ownState) {
			this._channel.postData({ ...this._ownState, updatedAt: Date.now() });
		}
	}

	private _touchSession(sessionResource: string): void {
		this._sessionRecency.set(sessionResource, Date.now());
		this._touchActivity();
	}

	private _touchHosts(): void {
		this._hostVersion.set(this._hostVersion.get() + 1, undefined);
	}

	private _touchActivity(): void {
		this._activityVersion.set(this._activityVersion.get() + 1, undefined);
	}

	private _touchPeers(): void {
		this._peerVersion.set(this._peerVersion.get() + 1, undefined);
	}
}

export function selectChatPetState(states: readonly IChatPetWireState[]): ISelectedChatPetState {
	const enabledStates = states.filter(state => state.enabled);
	let selectedActivity: (IChatPetWireActivity & { readonly instanceId: string }) | undefined;
	let completionToken: string | undefined;
	let completionAt = 0;
	let recentSession: (IChatPetWireRecentSession & { readonly instanceId: string }) | undefined;
	const hosts: Array<IChatPetWireHost & { readonly instanceId: string }> = [];
	for (const state of enabledStates) {
		if (state.activity) {
			const candidate = { ...state.activity, instanceId: state.instanceId };
			if (!selectedActivity || compareActivity(candidate, selectedActivity) > 0) {
				selectedActivity = candidate;
			}
		}
		if (state.completionToken && state.completionAt > completionAt) {
			completionToken = state.completionToken;
			completionAt = state.completionAt;
		}
		if (state.recentSession) {
			const candidate = { ...state.recentSession, instanceId: state.instanceId };
			if (!recentSession || candidate.recency > recentSession.recency || (candidate.recency === recentSession.recency && candidate.instanceId > recentSession.instanceId)) {
				recentSession = candidate;
			}
		}
		if (state.documentVisible) {
			hosts.push(...state.hosts.filter(host => host.visible).map(host => ({ ...host, instanceId: state.instanceId })));
		}
	}

	const hasFocusedWorkbench = enabledStates.some(state => state.mainFocused);
	let selectedHost: IChatPetWireHost & { readonly instanceId: string } | undefined;
	if (hasFocusedWorkbench) {
		const matchingHosts = selectedActivity
			? hosts.filter(host => host.sessionResource === selectedActivity?.sessionResource)
			: [];
		selectedHost = selectMostRecentHost(matchingHosts) ?? selectMostRecentHost(hosts);
	}
	const owner = selectedHost
		? enabledStates.find(state => state.instanceId === selectedHost?.instanceId)
		: enabledStates.reduce<IChatPetWireState | undefined>((current, state) => {
			if (!current || state.focusOrder > current.focusOrder || (state.focusOrder === current.focusOrder && state.instanceId > current.instanceId)) {
				return state;
			}
			return current;
		}, undefined);
	const activity: IChatPetActivity = {
		hasActiveRequest: selectedActivity?.hasActiveRequest ?? false,
		needsInput: selectedActivity?.needsInput ?? false,
		hasInput: selectedActivity ? false : selectedHost?.hasInput ?? false,
		completionToken,
		sessionResource: selectedActivity?.sessionResource,
	};
	return {
		ownerInstanceId: owner?.instanceId,
		host: selectedHost,
		activity,
		targetInstanceId: selectedActivity?.instanceId ?? recentSession?.instanceId,
		recentSession,
	};
}

function selectMostRecentHost(hosts: readonly (IChatPetWireHost & { readonly instanceId: string })[]): (IChatPetWireHost & { readonly instanceId: string }) | undefined {
	return hosts.reduce<(IChatPetWireHost & { readonly instanceId: string }) | undefined>((current, host) => {
		if (!current || host.recency > current.recency || (host.recency === current.recency && host.id > current.id)) {
			return host;
		}
		return current;
	}, undefined);
}

function compareActivity(left: IChatPetWireActivity, right: IChatPetWireActivity): number {
	const leftPriority = left.needsInput ? 2 : left.hasActiveRequest ? 1 : 0;
	const rightPriority = right.needsInput ? 2 : right.hasActiveRequest ? 1 : 0;
	return leftPriority - rightPriority || left.recency - right.recency || left.sessionResource.localeCompare(right.sessionResource);
}

function isChatPetWireState(message: ChatPetWireMessage): message is IChatPetWireState {
	return message.type === 'state'
		&& typeof message.updatedAt === 'number'
		&& typeof message.focusOrder === 'number'
		&& typeof message.mainFocused === 'boolean'
		&& typeof message.documentVisible === 'boolean'
		&& typeof message.enabled === 'boolean'
		&& typeof message.scale === 'number'
		&& typeof message.scaleUpdatedAt === 'number'
		&& Array.isArray(message.hosts);
}

export function getChatPetWireStateComparisonKey(state: IChatPetWireState): string {
	const { updatedAt: _updatedAt, ...comparableState } = state;
	return JSON.stringify(comparableState);
}

function equalsChatPetActivity(left: IChatPetActivity | undefined, right: IChatPetActivity | undefined): boolean {
	return left?.hasActiveRequest === right?.hasActiveRequest
		&& left?.needsInput === right?.needsInput
		&& left?.hasInput === right?.hasInput
		&& left?.completionToken === right?.completionToken
		&& left?.sessionResource === right?.sessionResource;
}

function equalsRectangle(left: IRectangle | undefined, right: IRectangle | undefined): boolean {
	return left?.x === right?.x
		&& left?.y === right?.y
		&& left?.width === right?.width
		&& left?.height === right?.height;
}

function getChatPetInteractiveBounds(root: HTMLElement, elements: readonly HTMLElement[]): IRectangle | undefined {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const element of elements) {
		if (element.classList.contains('hidden')) {
			continue;
		}
		const bounds = element.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) {
			continue;
		}
		left = Math.min(left, bounds.left);
		top = Math.min(top, bounds.top);
		right = Math.max(right, bounds.right);
		bottom = Math.max(bottom, bounds.bottom);
	}

	if (!Number.isFinite(left)) {
		return undefined;
	}
	return clampRectangleToDisplay({
		x: Math.floor(left),
		y: Math.floor(top),
		width: Math.ceil(right) - Math.floor(left),
		height: Math.ceil(bottom) - Math.floor(top),
	}, {
		x: 0,
		y: 0,
		width: root.ownerDocument.documentElement.clientWidth,
		height: root.ownerDocument.documentElement.clientHeight,
	});
}

function containsPoint(bounds: IRectangle, x: number, y: number): boolean {
	return x >= bounds.x
		&& x <= bounds.x + bounds.width
		&& y >= bounds.y
		&& y <= bounds.y + bounds.height;
}

export function clampRectangleToDisplay(rectangle: IRectangle, display: IRectangle): IRectangle {
	return {
		...rectangle,
		x: Math.min(Math.max(rectangle.x, display.x), display.x + Math.max(0, display.width - rectangle.width)),
		y: Math.min(Math.max(rectangle.y, display.y), display.y + Math.max(0, display.height - rectangle.height)),
	};
}

export function placeRectangleAtPoint(anchorX: number, anchorY: number, width: number, height: number, display: IRectangle): IRectangle {
	const margin = 4;
	const displayRight = display.x + display.width;
	const displayBottom = display.y + display.height;
	const x = anchorX + margin + width <= displayRight ? anchorX + margin : anchorX - width - margin;
	const y = anchorY + margin + height <= displayBottom ? anchorY + margin : anchorY - height - margin;
	return clampRectangleToDisplay({ x, y, width, height }, display);
}

export function clampRectangleToDisplays(rectangle: IRectangle, displays: readonly IRectangle[], fallbackDisplay: IRectangle): IRectangle {
	if (!displays.length) {
		return clampRectangleToDisplay(rectangle, fallbackDisplay);
	}
	const centerX = rectangle.x + rectangle.width / 2;
	const centerY = rectangle.y + rectangle.height / 2;
	const display = displays.find(candidate =>
		centerX >= candidate.x
		&& centerX <= candidate.x + candidate.width
		&& centerY >= candidate.y
		&& centerY <= candidate.y + candidate.height
	) ?? displays.reduce((nearest, candidate) => {
		const nearestDistance = distanceToRectangle(centerX, centerY, nearest);
		const candidateDistance = distanceToRectangle(centerX, centerY, candidate);
		return candidateDistance < nearestDistance ? candidate : nearest;
	});
	return clampRectangleToDisplay(rectangle, display);
}

function findNearestDisplay(x: number, y: number, displays: readonly IRectangle[], fallbackDisplay: IRectangle): IRectangle {
	if (!displays.length) {
		return fallbackDisplay;
	}
	return displays.find(display =>
		x >= display.x
		&& x <= display.x + display.width
		&& y >= display.y
		&& y <= display.y + display.height
	) ?? displays.reduce((nearest, display) =>
		distanceToRectangle(x, y, display) < distanceToRectangle(x, y, nearest) ? display : nearest
	);
}

function distanceToRectangle(x: number, y: number, rectangle: IRectangle): number {
	const deltaX = Math.max(rectangle.x - x, 0, x - rectangle.x - rectangle.width);
	const deltaY = Math.max(rectangle.y - y, 0, y - rectangle.y - rectangle.height);
	return Math.hypot(deltaX, deltaY);
}
