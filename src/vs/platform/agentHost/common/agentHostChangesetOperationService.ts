/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ChangesetKind } from './changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from './state/protocol/channels-changeset/commands.js';
import type { ChangesetOperation, ISessionGitHubState, ISessionGitState, URI } from './state/sessionState.js';

export const IAgentHostChangesetOperationService = createDecorator<IAgentHostChangesetOperationService>('agentHostChangesetOperationService');

/**
 * Server-side handler for a changeset operation advertised via
 * `changeset/operationsChanged`.
 *
 * The agent service validates the request shape (changeset exists, operation id
 * known, target scope matches) before invoking the handler; the handler is only
 * responsible for executing the operation.
 */
export interface IChangesetOperationHandler {
	/**
	 * Executes a previously advertised changeset operation.
	 *
	 * The handler receives the original protocol params so it can inspect the
	 * changeset channel and optional target. Validation that the operation exists
	 * on the changeset and supports the requested target scope happens before this
	 * method is called.
	 */
	invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult>;
}

/**
 * Context used by changeset operation contributions to decide which operations
 * to advertise for a session changeset.
 *
 * Keep this interface intentionally small. Add new fields here only when a
 * contribution genuinely needs them to compute operation availability. Likely
 * future additions include the concrete changeset URI, the session state, the
 * changeset state, or the working directory URI.
 */
export interface IChangesetOperationContext {
	/** String form of the session URI that owns the changeset. */
	readonly sessionKey: string;
	/** Expanded changeset URI whose operations are being computed. */
	readonly changesetUri: URI;
	/** Well-known changeset kind for {@link changesetUri}. */
	readonly changesetKind: ChangesetKind;
	/** Current git metadata for the session used to compute operation availability. */
	readonly gitState?: ISessionGitState;
	/** Current GitHub metadata for the session used to compute operation availability. */
	readonly gitHubState?: ISessionGitHubState;
}

/**
 * Registration surface handed to changeset operation contributions.
 *
 * Contributions use this object to install operation handlers and request a
 * refresh when external state changes which operations should be advertised.
 */
export interface IChangesetOperationRegistry {
	/**
	 * Registers the server-side handler for one {@link ChangesetOperation.id}.
	 * The returned disposable removes only this registration.
	 */
	registerChangesetOperationHandler(operationId: string, handler: IChangesetOperationHandler): IDisposable;
	/**
	 * Notifies the contribution service that advertised operations for all static
	 * changesets in `sessionKey` should be recomputed from current session state.
	 */
	onDidChangeOperations(sessionKey: string): void;
	/**
	 * Recomputes the session's git metadata and then refreshes advertised
	 * operations if that metadata can be resolved.
	 */
	refreshSessionGitState(sessionKey: string): Promise<void>;
}

/**
 * Provider of changeset operations for one feature area.
 *
 * A contribution owns the decision about which operations are available for a
 * changeset and registers the handlers that execute those operations.
 */
export interface IChangesetOperationContribution extends IDisposable {
	/**
	 * Registers every operation handler owned by this contribution. Called once
	 * when the contribution is added to the service.
	 */
	registerHandlers(registry: IChangesetOperationRegistry): IDisposable;
	/**
	 * Returns operations that should be advertised for the given changeset, or
	 * `undefined` when this contribution has nothing to offer in the context.
	 */
	getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined;
}

/**
 * Coordinates changeset operation contributions, advertised operation state,
 * and client-triggered invocation.
 */
export interface IAgentHostChangesetOperationService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Adds a contribution and registers its handlers. Disposing the returned value
	 * unregisters the handlers and disposes the contribution.
	 */
	registerContribution(contribution: IChangesetOperationContribution): IDisposable;
	/**
	 * Recomputes and publishes operations for the changesets for a given
	 * session. If `gitState` is not provided, the current git state will
	 * be used.
	 */
	updateOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): void;

	/**
	* Returns the operations that should be advertised for the given changeset, or
	* `undefined` when no operations are available.
	*/
	getOperations(sessionKey: string, changeset?: string, gitState?: ISessionGitState, gitHubState?: ISessionGitHubState): readonly ChangesetOperation[] | undefined;

	/**
	 * Invokes an advertised operation after validating the changeset, operation id,
	 * and requested target scope.
	 */
	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult>;
}
