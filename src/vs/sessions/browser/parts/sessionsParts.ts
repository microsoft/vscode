/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { addDisposableListener, EventType, getClientArea, IDimension, isAncestorOfActiveElement, trackFocus } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionsPart } from './sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from './sessionView.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../services/sessions/common/session.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ISessionGridSlot, ISessionsPartHeightConstraints, ISessionsPartService, IToggleMaximizeSessionEvent, IWindowSessionViewHost, SessionGridRequest } from '../../services/sessions/browser/sessionsPartService.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';

/**
 * Owns the lifecycle of the {@link SessionsPart}. Selects the mobile vs. desktop
 * variant based on viewport width at construction time. Registered as an eager
 * singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 *
 * The part is a passive renderer: the {@link ISessionsService} drives the
 * grid via {@link updateVisibleSessions}/{@link focusSession} and listens to
 * {@link onDidFocusSession}. The part observes neither the model nor the view.
 */
export class SessionsParts extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: SessionsPart;

	private readonly _windowViews = new Map<SessionView, IWindowSessionViewHost>();

	private readonly _onDidFocusWindowSession = this._register(new Emitter<IActiveSession>());
	readonly onDidFocusWindowSession: Event<IActiveSession> = this._onDidFocusWindowSession.event;

	private readonly _onDidToggleMaximizeSession = this._register(new Emitter<IToggleMaximizeSessionEvent>());
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent> = this._onDidToggleMaximizeSession.event;

	get onDidFocusSession(): Event<string | undefined> {
		return this._mainPart.onDidFocusSession;
	}

	get shownChatCount() {
		return this._mainPart.shownChatCount;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const { width } = getClientArea(mainWindow.document.body);
		const isPhoneLayout = width < 640;

		this._mainPart = this._register(instantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart));
	}

	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		this._mainPart.updateVisibleSessions(visible, active, slots, request);
	}

	getGridLayout() { return this._mainPart.getGridLayout(); }
	getSessionAtPosition(index: number) { return this._mainPart.getSessionAtPosition(index); }
	getNeighborSession(sessionId: string | undefined, direction: Direction) { return this._mainPart.getNeighborSession(sessionId, direction); }
	getSessionPlacement(sessionId: string) { return this._mainPart.getSessionPlacement(sessionId); }
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void { this._mainPart.resizeSession(sessionId, direction, amount); }
	get onDidInteractWithGrid(): Event<void> { return this._mainPart.onDidInteractWithGrid; }

	setContentVisible(visible: boolean): void {
		this._mainPart.setContentVisible(visible);
	}

	get onDidLayout(): Event<IDimension> { return this._mainPart.onDidLayout; }

	get chromeHeight(): number { return this._mainPart.chromeHeight; }

	setHeightConstraints(constraints: ISessionsPartHeightConstraints | undefined, height?: number): void {
		this._mainPart.setHeightConstraints(constraints, height);
	}

	toggleMaximizeSession(session: IActiveSession | undefined): void {
		if (!session) {
			this._mainPart.toggleMaximizeSession(undefined);
			return;
		}
		const maximized = this._mainPart.toggleMaximizeSession(session.sessionId);
		if (maximized !== undefined) {
			this._onDidToggleMaximizeSession.fire({ session, maximized });
		}
	}

	registerWindowSessionView(view: SessionView, host: IWindowSessionViewHost): IDisposable {
		const store = new DisposableStore();
		this._windowViews.set(view, host);
		store.add(toDisposable(() => this._windowViews.delete(view)));
		const fireFocus = () => {
			const session = view.getSession();
			if (session) {
				this._onDidFocusWindowSession.fire(session);
			}
		};
		store.add(trackFocus(view.element)).onDidFocus(fireFocus, undefined, store);
		store.add(addDisposableListener(view.element, EventType.POINTER_DOWN, fireFocus, true));
		return store;
	}

	private _getWindowView(predicate: (session: IActiveSession) => boolean): SessionView | undefined {
		for (const view of this._windowViews.keys()) {
			const session = view.getSession();
			if (session && predicate(session)) {
				return view;
			}
		}
		return undefined;
	}

	focusSession(session: IActiveSession | undefined): void {
		const windowView = session && this._getWindowView(candidate => candidate === session);
		if (windowView) {
			this._windowViews.get(windowView)?.focus();
			return;
		}
		this._mainPart.focusSession(session?.sessionId, session?.scopedChatResource);
	}

	getSessionView(session: string | ISession | undefined): SessionView | undefined {
		if (typeof session === 'object') {
			// A session shown in a window of its own: the view of that window, not the main window's view of another chat
			// of its session.
			const windowView = this._getWindowView(candidate => candidate === session);
			if (windowView) {
				return windowView;
			}
		}
		const sessionId = typeof session === 'object' ? session.sessionId : session;
		return this._mainPart.getSessionView(sessionId)
			?? (sessionId !== undefined ? this._getWindowView(candidate => candidate.sessionId === sessionId) : undefined);
	}

	getFocusedSessionView(): SessionView | undefined {
		return this._mainPart.getFocusedSessionView()
			?? [...this._windowViews.keys()].find(view => isAncestorOfActiveElement(view.element));
	}

	getProgressIndicator(): IProgressIndicator {
		return this._mainPart.getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
