/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

/** How long an open waits for the session it opens to be known, such as while its provider loads its sessions. */
export const SESSION_OPEN_WAIT_TIMEOUT = 5_000;

/**
 * The session of `sessionResource` once its provider knows it, also outside its listing scope; `undefined` once `token` is
 * cancelled, such as by a later open, or `timeout` passes. Providers, such as the agent host's, load their sessions
 * asynchronously: the session can appear as a provider registers or as its sessions change.
 */
export function waitForSession(sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService, sessionResource: URI, token: CancellationToken, timeout?: number): Promise<ISession | undefined> {
	const existing = sessionsManagementService.getSession(sessionResource);
	if (existing) {
		return Promise.resolve(existing);
	}
	return new Promise<ISession | undefined>(resolve => {
		const disposables = new DisposableStore();
		let resolved = false;
		const finish = (session: ISession | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve(session);
		};
		const tryFind = () => {
			if (token.isCancellationRequested) {
				finish(undefined);
				return;
			}
			const session = sessionsManagementService.getSession(sessionResource);
			if (session) {
				finish(session);
			}
		};

		disposables.add(token.onCancellationRequested(() => finish(undefined)));
		disposables.add(sessionsProvidersService.onDidChangeProviders(() => tryFind()));
		disposables.add(sessionsManagementService.onDidChangeSessions(() => tryFind()));
		// Also a change of a session outside a provider's listing scope, which `onDidChangeSessions` does not report: only a
		// change of the session waited for is looked up, and an empty change, by which a provider asks to read every session again
		disposables.add(sessionsManagementService.onDidChangeSession(changes => {
			if (changes.length === 0 || changes.some(change => change.kind !== 'removed' && isSessionResource(change.session, sessionResource))) {
				tryFind();
			}
		}));
		if (timeout !== undefined) {
			disposables.add(disposableTimeout(() => finish(undefined), timeout));
		}
		// The session can be known between the first check and the listeners above
		tryFind();
	});
}

function isSessionResource(session: ISession, resource: URI): boolean {
	return isEqual(session.resource, resource) || !!session.previousIdentities?.some(previous => isEqual(previous.resource, resource));
}

/** Waits until `session` is loaded; `false` when `token` is cancelled first. */
export async function waitForSessionToLoad(session: ISession, token: CancellationToken): Promise<boolean> {
	if (!session.loading.get()) {
		return true;
	}
	if (token.isCancellationRequested) {
		return false;
	}
	await new Promise<void>(resolve => {
		const disposables = new DisposableStore();
		let resolved = false;
		const finish = () => {
			if (resolved) {
				return;
			}
			resolved = true;
			disposables.dispose();
			resolve();
		};
		disposables.add(token.onCancellationRequested(finish));
		disposables.add(autorun(reader => {
			if (!session.loading.read(reader)) {
				finish();
			}
		}));
	});
	return !token.isCancellationRequested;
}

/** Prepares `session` to open with its provider, such as to connect a Dev Container session it knows only from its cache. */
export async function prepareSessionForOpen(sessionsProvidersService: ISessionsProvidersService, session: ISession): Promise<void> {
	await sessionsProvidersService.getProvider(session.providerId, session.sessionId)?.prepareSessionForOpen?.(session, 'open');
}

/**
 * The session that opening `sessionResource` opens, prepared to open: the resource its provider redirects it to, such as
 * of a session it adopted, once its provider knows it. `undefined` when `token` is cancelled meanwhile, such as by a later
 * open, or the session is not known within {@link SESSION_OPEN_WAIT_TIMEOUT}.
 */
export async function resolveSessionForOpen(sessionsManagementService: ISessionsManagementService, sessionsProvidersService: ISessionsProvidersService, sessionResource: URI, token: CancellationToken): Promise<ISession | undefined> {
	const resolved = await sessionsManagementService.resolveSessionResource(sessionResource, 'open');
	const session = token.isCancellationRequested ? undefined : await waitForSession(sessionsManagementService, sessionsProvidersService, resolved, token, SESSION_OPEN_WAIT_TIMEOUT);
	if (!session || token.isCancellationRequested) {
		return undefined;
	}
	await prepareSessionForOpen(sessionsProvidersService, session);
	return token.isCancellationRequested ? undefined : session;
}

/**
 * The latest open of its owner: starting one cancels the one under way, and so does disposing it, so that an open
 * neither waits nor shows its session once a later one started or its owner is gone.
 */
export class LatestSessionOpen extends Disposable {

	private _source: CancellationTokenSource | undefined;

	/** Cancels the open under way, if any, and starts another; once disposed, the open it starts is cancelled. */
	start(): CancellationToken {
		this._source?.dispose(true);
		if (this._store.isDisposed) {
			this._source = undefined;
			return CancellationToken.Cancelled;
		}
		this._source = new CancellationTokenSource();
		return this._source.token;
	}

	override dispose(): void {
		this._source?.dispose(true);
		this._source = undefined;
		super.dispose();
	}
}
