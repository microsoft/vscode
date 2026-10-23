/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISessionsService } from './sessionsService.js';

function isSession(value: unknown): value is IActiveSession {
	const candidate = value as Partial<IActiveSession> | undefined;
	return !!candidate && typeof candidate === 'object' && typeof candidate.sessionId === 'string' && candidate.resource instanceof URI;
}

/**
 * Resolves the session a session action operates on from the argument the
 * action was invoked with: a session, a `{ session }` context, or the resource
 * of the active session. Without an argument the action falls back to the
 * active session, which is what keybindings and the command palette provide.
 */
export function resolveSessionActionTarget(accessor: ServicesAccessor, arg?: unknown): IActiveSession | undefined {
	if (isSession(arg)) {
		return arg;
	}
	const activeSession = accessor.get(ISessionsService).activeSession.get();
	if (arg instanceof URI) {
		return activeSession?.resource.toString() === arg.toString() ? activeSession : undefined;
	}
	if (arg && typeof arg === 'object' && hasKey(arg as { readonly session?: IActiveSession }, { session: true })) {
		return (arg as { readonly session: IActiveSession | undefined }).session;
	}
	return activeSession;
}
