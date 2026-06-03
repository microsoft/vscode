/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { ChangesetKind } from './changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from './state/protocol/channels-changeset/commands.js';
import type { ChangesetOperation, ISessionGitState, URI } from './state/sessionState.js';

/**
 * Server-side handler for a changeset operation advertised via
 * `changeset/operationsChanged`.
 *
 * The agent service validates the request shape (changeset exists, operation id
 * known, target scope matches) before invoking the handler; the handler is only
 * responsible for executing the operation.
 */
export interface IChangesetOperationHandler {
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
	/** Current git metadata for the session. This is enough for the PR operations today. */
	readonly gitState: ISessionGitState;
}

export interface IChangesetOperationRegistry {
	registerChangesetOperationHandler(operationId: string, handler: IChangesetOperationHandler): IDisposable;
	onDidChangeOperations(sessionKey: string): void;
	refreshSessionGitState(sessionKey: string): Promise<void>;
}

export interface IChangesetOperationContribution extends IDisposable {
	registerHandlers(registry: IChangesetOperationRegistry): IDisposable;
	getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined;
}

export interface IChangesetOperationContributionService extends IDisposable {
	registerContribution(contribution: IChangesetOperationContribution): IDisposable;
	getOperations(context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined;
	refreshOperationsFromCurrentState(sessionKey: string): void;
	updateOperations(sessionKey: string, gitState: ISessionGitState): void;
	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult>;
}
