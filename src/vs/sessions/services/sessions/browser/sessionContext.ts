/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISessionsService } from './sessionsService.js';

export const ISessionContext = createDecorator<ISessionContext>('sessionContext');

/**
 * Publishes the session that a scoped UI surface — a session view or a chat
 * input — and the toolbars and contributed action view items hosted within it
 * should act upon.
 *
 * Action view items and pickers contributed through {@link IActionViewItemService}
 * are built by a factory that only receives the scoped instantiation service of
 * the hosting toolbar. Rather than self-resolving the window's active session
 * (which is wrong when several views/inputs are visible at once), the factory
 * reads this service from that scoped instantiation service to obtain the
 * correct per-surface session.
 *
 * The global default ({@link ActiveSessionContext}) reports the window's active
 * session, so surfaces outside a scoped override keep working unchanged. A
 * scoped surface (e.g. a `SessionView` or a `NewChatInputWidget`) overrides this
 * service in its own scoped instantiation service with a {@link SessionContext}
 * bound to that surface's session.
 */
export interface ISessionContext {
	readonly _serviceBrand: undefined;

	/** The session the hosting surface acts upon. */
	readonly session: IObservable<IActiveSession | undefined>;
}

/**
 * A {@link ISessionContext} bound to an explicit session observable. Supplied by
 * a scoped surface via a scoped service collection so its toolbars' action view
 * items and pickers target that surface's session.
 */
export class SessionContext implements ISessionContext {

	declare readonly _serviceBrand: undefined;

	constructor(readonly session: IObservable<IActiveSession | undefined>) { }
}

/**
 * Global fallback used outside a scoped surface. Reports the window's active
 * session.
 */
class ActiveSessionContext implements ISessionContext {

	declare readonly _serviceBrand: undefined;

	readonly session: IObservable<IActiveSession | undefined>;

	constructor(
		@ISessionsService sessionsService: ISessionsService,
	) {
		this.session = sessionsService.activeSession;
	}
}

registerSingleton(ISessionContext, ActiveSessionContext, InstantiationType.Delayed);
