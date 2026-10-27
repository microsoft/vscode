/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IReader } from '../../../../base/common/observable.js';
import { hasKey } from '../../../../base/common/types.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISessionsService } from './sessionsService.js';

function isSession(value: unknown): value is IActiveSession {
	const candidate = value as Partial<IActiveSession> | undefined;
	return !!candidate && typeof candidate === 'object' && typeof candidate.sessionId === 'string' && candidate.resource instanceof URI;
}

/**
 * Finds the session shown for `resource`: the active session first, then the
 * other visible sessions. The one place to extend when more hosts show sessions.
 */
export function findSessionByResource(sessionsService: ISessionsService, resource: URI, reader?: IReader): IActiveSession | undefined {
	const key = resource.toString();
	return [sessionsService.activeSession.read(reader), sessionsService.mainWindowActiveSession.read(reader), ...sessionsService.windowSessions.read(reader), ...sessionsService.visibleSessions.read(reader)].find(session => session?.resource.toString() === key);
}

/**
 * Resolves the session a session action operates on from the argument the
 * action was invoked with: a session, a `{ session }` context, or the resource
 * of a visible session. Without an argument the action falls back to the
 * active session, which is what keybindings and the command palette provide.
 * An argument that names a session which cannot be resolved never falls back
 * to the active session: the result is `undefined` and the action must no-op.
 */
export function resolveSessionActionTarget(accessor: ServicesAccessor, arg?: unknown): IActiveSession | undefined {
	if (isSession(arg)) {
		return arg;
	}
	const sessionsService = accessor.get(ISessionsService);
	const activeSession = sessionsService.activeSession.get();
	let session: IActiveSession | undefined;
	if (arg instanceof URI) {
		session = findSessionByResource(sessionsService, arg);
	} else if (arg && typeof arg === 'object' && hasKey(arg as { readonly session?: IActiveSession }, { session: true })) {
		session = (arg as { readonly session: IActiveSession | undefined }).session;
	} else {
		return activeSession;
	}
	if (!session) {
		accessor.get(ILogService).trace('[sessionActionTarget] the session argument did not resolve to a session, the action does nothing');
	}
	return session;
}
