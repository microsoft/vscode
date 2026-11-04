/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

/*
 * Session context keys that can be bound for any session on any context key
 * service. This module has no registration side effects, so hosts (title bars,
 * views) can import it without pulling in the actions that consume the keys.
 */

export const hasWorktreeAndRepositoryContextKey = new RawContextKey<boolean>('agentSessionHasWorktreeAndRepository', false, {
	type: 'boolean',
	description: localize('agentSessionHasWorktreeAndRepository', "True when the active agent session has both a worktree and a parent repository.")
});

export const IsAgentHostSession = new RawContextKey<boolean>('sessions.isAgentHostSession', false);

/** Binds {@link hasWorktreeAndRepositoryContextKey} on `contextKeyService` to the workspace of `session`. */
export function bindHasWorktreeAndRepositoryContextKey(contextKeyService: IContextKeyService, session: IObservable<IActiveSession | undefined>): IDisposable {
	return bindContextKey(hasWorktreeAndRepositoryContextKey, contextKeyService, reader => !!session.read(reader)?.workspace.read(reader)?.folders[0]?.gitRepository?.workTreeUri);
}

/** Binds {@link IsAgentHostSession} on `contextKeyService` to whether `session` is provided by an agent-host provider. */
export function bindIsAgentHostSessionContextKey(contextKeyService: IContextKeyService, session: IObservable<IActiveSession | undefined>, sessionsProvidersService: ISessionsProvidersService): IDisposable {
	return bindContextKey(IsAgentHostSession, contextKeyService, reader => {
		const value = session.read(reader);
		const provider = value && sessionsProvidersService.getProvider(value.providerId);
		return !!provider && isAgentHostProvider(provider);
	});
}
