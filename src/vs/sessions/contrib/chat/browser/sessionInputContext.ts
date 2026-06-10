/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const ISessionInputContext = createDecorator<ISessionInputContext>('sessionInputContext');

/**
 * Publishes the session that a chat input toolbar — and the pickers
 * contributed into it — should act upon.
 *
 * Pickers contributed through {@link IActionViewItemService} are constructed
 * by a factory that only receives the scoped instantiation service of the
 * toolbar that hosts them. Rather than self-resolving the window's active
 * session (which is wrong when several inputs are visible), the factory reads
 * this service from that scoped instantiation service and threads the
 * resulting {@link session} observable into the picker's constructor.
 *
 * The global default ({@link ActiveSessionInputContext}) reports the window's
 * active session, so toolbars outside a {@link NewChatInputWidget} scope (e.g.
 * the running-session chat input) keep working unchanged. A
 * {@link NewChatInputWidget} overrides this service in its own scoped
 * instantiation service with a {@link SessionInputContext} bound to that
 * widget's session.
 */
export interface ISessionInputContext {
	readonly _serviceBrand: undefined;

	/** The session the hosting chat input acts upon. */
	readonly session: IObservable<IActiveSession | undefined>;
}

/**
 * A {@link ISessionInputContext} bound to an explicit session observable.
 * Supplied by a {@link NewChatInputWidget} via a scoped service collection so
 * its toolbars' pickers target the widget's session.
 */
export class SessionInputContext implements ISessionInputContext {

	declare readonly _serviceBrand: undefined;

	constructor(readonly session: IObservable<IActiveSession | undefined>) { }
}

/**
 * Global fallback used outside a {@link NewChatInputWidget} scope. Reports the
 * window's active session.
 */
class ActiveSessionInputContext implements ISessionInputContext {

	declare readonly _serviceBrand: undefined;

	readonly session: IObservable<IActiveSession | undefined>;

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		this.session = sessionsManagementService.activeSession;
	}
}

registerSingleton(ISessionInputContext, ActiveSessionInputContext, InstantiationType.Delayed);
