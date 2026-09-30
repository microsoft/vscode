/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { getActiveWindow, getClientArea, getWindow, getWindowId, onWillUnregisterWindow } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionsPart } from './sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from './sessionView.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ISessionDragHandlers, ISessionGridPlacement, ISessionGridSlot, ISessionPartCloseEvent, ISessionsPartService, IToggleMaximizeSessionEvent, MAIN_SESSIONS_PART, SessionGridRequest } from '../../services/sessions/browser/sessionsPartService.js';
import { Direction, ISerializedGrid } from '../../../base/browser/ui/grid/grid.js';
import { IAuxiliaryWindowOpenOptions } from '../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { ILifecycleService } from '../../../workbench/services/lifecycle/common/lifecycle.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { SessionsAuxiliaryWindowsSupportedContext } from '../../common/contextkeys.js';
import { IChatGroupsTransferState } from './chatGroupsView.js';
import { SessionDragController } from './sessionDragController.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { AuxiliarySessionsPart } from './auxiliarySessionsPart.js';
import { isPhoneLayout } from './mobile/mobileLayout.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';

/** Registers Sessions parts and coordinates presentation handoffs; membership belongs to SessionsService. */
export class SessionsParts extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: SessionsPart;
	private readonly _auxiliaryParts = new Map<string, AuxiliarySessionsPart>();
	private readonly _auxiliaryDisposables = this._register(new DisposableMap<string, DisposableStore>());
	private _closeHandler: ((partId: string) => void) | undefined;
	private readonly _dragController = this._register(new MutableDisposable<SessionDragController>());
	private readonly _windowOrder: number[] = [mainWindow.vscodeWindowId];
	private readonly _onDidFocusSession = this._register(new Emitter<string | undefined>());
	readonly onDidFocusSession = this._onDidFocusSession.event;
	private readonly _onDidInteractWithGrid = this._register(new Emitter<string>());
	readonly onDidInteractWithGrid = this._onDidInteractWithGrid.event;
	private readonly _onDidCloseAuxiliaryPart = this._register(new Emitter<ISessionPartCloseEvent>());
	readonly onDidCloseAuxiliaryPart = this._onDidCloseAuxiliaryPart.event;

	private readonly _onDidToggleMaximizeSession = this._register(new Emitter<IToggleMaximizeSessionEvent>());
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent> = this._onDidToggleMaximizeSession.event;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IHostService hostService: IHostService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
	) {
		super();
		SessionsAuxiliaryWindowsSupportedContext.bindTo(contextKeyService).set(true);

		const { width } = getClientArea(mainWindow.document.body);
		const phone = width < 640;

		this._mainPart = this._register(instantiationService.createInstance(phone ? MobileSessionsPart : SessionsPart, MAIN_SESSIONS_PART));
		this._register(this._mainPart.onDidFocusSession(id => this._onDidFocusSession.fire(id)));
		this._register(this._mainPart.onDidInteractWithGrid(() => this._onDidInteractWithGrid.fire(MAIN_SESSIONS_PART)));
		this._register(lifecycleService.onBeforeShutdown(() => this.flushState()));
		this._register(Event.once(lifecycleService.onDidShutdown)(() => this._auxiliaryDisposables.clearAndDisposeAll()));
		this._register(hostService.onDidChangeActiveWindow(windowId => {
			const index = this._windowOrder.indexOf(windowId);
			if (index >= 0) {
				this._windowOrder.splice(index, 1);
			}
			this._windowOrder.unshift(windowId);
		}));
		this._register(onWillUnregisterWindow(window => {
			const index = this._windowOrder.indexOf(window.vscodeWindowId);
			if (index >= 0) {
				this._windowOrder.splice(index, 1);
			}
		}));
	}

	flushState(): void {
		for (const part of this.getParts()) {
			part.flushState();
		}
	}

	getParts(): readonly SessionsPart[] {
		return [this._mainPart, ...[...this._auxiliaryParts.values()].flatMap(entry => entry.part ? [entry.part] : [])];
	}

	getPart(partId: string): SessionsPart | undefined {
		return partId === MAIN_SESSIONS_PART ? this._mainPart : this._auxiliaryParts.get(partId)?.part;
	}

	getPartForWindow(targetWindow: Window): SessionsPart | undefined {
		return targetWindow === mainWindow ? this._mainPart : [...this._auxiliaryParts.values()].find(entry => entry.window?.window.vscodeWindowId === getWindowId(targetWindow))?.part;
	}

	setAuxiliaryWindowCloseHandler(handler: (partId: string) => void): void {
		this._closeHandler = handler;
	}

	setSessionDragHandlers(handlers: ISessionDragHandlers): void {
		this._dragController.value = new SessionDragController(source => this.getDragParts(source), handlers);
	}

	private getDragParts(source: Window): readonly SessionsPart[] {
		const parts = this.getParts().filter(part => {
			const container = part.getContainer();
			return !!container && getWindow(container).document.visibilityState !== 'hidden';
		});
		const alwaysOnTop = (part: SessionsPart) => this.getAuxiliaryWindowState(part.partId)?.alwaysOnTop === true;
		const rank = (part: SessionsPart) => {
			const index = this._windowOrder.indexOf(getWindow(part.getContainer()!).vscodeWindowId);
			return index < 0 ? Number.MAX_SAFE_INTEGER : index;
		};
		return parts.sort((a, b) => Number(alwaysOnTop(b)) - Number(alwaysOnTop(a))
			|| Number(getWindow(b.getContainer()!) === source) - Number(getWindow(a.getContainer()!) === source)
			|| rank(a) - rank(b));
	}

	startSessionDrag(event: PointerEvent, element: HTMLElement, session: IActiveSession): void {
		if (getWindow(element) === mainWindow && isPhoneLayout(this.layoutService)) {
			return;
		}
		this._dragController.value?.start(event, element, session);
	}

	async createAuxiliaryPart(options?: IAuxiliaryWindowOpenOptions, partId = generateUuid()): Promise<SessionsPart> {
		if (partId === MAIN_SESSIONS_PART || this._auxiliaryParts.has(partId)) {
			throw new Error(`Sessions part '${partId}' already exists`);
		}
		const disposables = new DisposableStore();
		this._auxiliaryDisposables.set(partId, disposables);
		try {
			const host = disposables.add(this.instantiationService.createInstance(AuxiliarySessionsPart, partId, () => this._closeHandler?.(partId)));
			this._auxiliaryParts.set(partId, host);
			disposables.add(toDisposable(() => {
				this._auxiliaryParts.delete(partId);
			}));
			disposables.add(host.onDidFocusSession(id => this._onDidFocusSession.fire(id)));
			disposables.add(host.onDidInteractWithGrid(() => this._onDidInteractWithGrid.fire(partId)));
			disposables.add(Event.once(host.onDidClose)(event => {
				this._auxiliaryDisposables.deleteAndDispose(partId);
				this._onDidCloseAuxiliaryPart.fire(event);
			}));
			return await host.create(options);
		} catch (error) {
			this._auxiliaryDisposables.deleteAndDispose(partId);
			throw error;
		}
	}

	getAuxiliaryWindowState(partId: string): IAuxiliaryWindowOpenOptions | undefined {
		return this._auxiliaryParts.get(partId)?.window?.createState();
	}

	closeAuxiliaryPart(partId: string): void {
		this._auxiliaryParts.get(partId)?.close();
	}

	transferSessions(sessions: readonly IActiveSession[], targetPartId: string, commit: () => void): void {
		const target = this.getPart(targetPartId);
		if (!target) {
			throw new Error(`Sessions part '${targetPartId}' is not available`);
		}
		const entries: { source: SessionsPart; session: IActiveSession; id: string; state: IChatGroupsTransferState; placement?: ISessionGridPlacement }[] = [];
		const layouts = new Map<SessionsPart, ISerializedGrid>();
		const captured = new DisposableStore();
		const released = new Set<string>();
		const restored = new Set<string>();
		try {
			for (const session of sessions) {
				const source = this.getPartForSession(session.sessionId);
				if (!source || source === target) {
					continue;
				}
				const { id, state, placement } = source.captureSessionState(session.sessionId);
				captured.add(state);
				entries.push({ source, session, id, state, placement });
				const layout = source.getGridLayout();
				if (layout) {
					layouts.set(source, layout);
				}
			}
			for (const entry of entries) {
				entry.source.releaseSessionView(entry.session.sessionId);
				released.add(entry.id);
			}
			for (const entry of entries) {
				target.restoreSessionView(entry.id, entry.session, entry.state.acquire());
				restored.add(entry.id);
			}
			commit();
		} catch (error) {
			for (const entry of entries) {
				if (restored.has(entry.id)) {
					target.releaseSessionView(entry.session.sessionId);
				}
				if (released.has(entry.id)) {
					entry.source.restoreSessionView(entry.id, entry.session, entry.state.acquire(), entry.placement);
				}
			}
			for (const [part, layout] of layouts) {
				part.restoreGridLayout(layout);
			}
			throw error;
		} finally {
			captured.dispose();
		}
	}

	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest, partId = MAIN_SESSIONS_PART): void {
		const part = this.getPart(partId);
		if (!part) {
			throw new Error(`Sessions part '${partId}' is not available`);
		}
		part.updateVisibleSessions(visible, active, slots, request);
	}

	private getPartForSession(sessionId: string | undefined): SessionsPart | undefined {
		return this.getParts().find(part => part.getSessionView(sessionId));
	}

	getGridLayout(partId = MAIN_SESSIONS_PART) { return this.getPart(partId)?.getGridLayout(); }
	getNeighborSession(sessionId: string | undefined, direction: Direction) { return this.getPartForSession(sessionId)?.getNeighborSession(sessionId, direction); }
	getSessionPlacement(sessionId: string) { return this.getPartForSession(sessionId)?.getSessionPlacement(sessionId); }
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void { this.getPartForSession(sessionId)?.resizeSession(sessionId, direction, amount); }

	setContentVisible(visible: boolean): void {
		this._mainPart.setContentVisible(visible);
	}

	toggleMaximizeSession(session: IActiveSession | undefined): void {
		if (!session) {
			this.getPartForSession(undefined)?.toggleMaximizeSession(undefined);
			return;
		}
		const maximized = this.getPartForSession(session.sessionId)?.toggleMaximizeSession(session.sessionId);
		if (maximized !== undefined) {
			this._onDidToggleMaximizeSession.fire({ session, maximized });
		}
	}

	focusSession(session: IActiveSession | undefined): void {
		const part = this.getPartForSession(session?.sessionId);
		const container = part?.getContainer();
		if (container) {
			getWindow(container).focus();
		}
		part?.focusSession(session?.sessionId);
	}

	getSessionView(sessionId: string | undefined): SessionView | undefined {
		return this.getPartForSession(sessionId)?.getSessionView(sessionId);
	}

	getFocusedSessionView(): SessionView | undefined {
		return this.getPartForWindow(getActiveWindow())?.getFocusedSessionView();
	}

	getProgressIndicator(): IProgressIndicator {
		return (this.getPartForWindow(getActiveWindow()) ?? this._mainPart).getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
