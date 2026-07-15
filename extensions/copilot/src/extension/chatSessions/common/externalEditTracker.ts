/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { DeferredPromise, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isEqualOrParent } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Maximum time to wait for VS Code core to acknowledge an external edit before proceeding anyway.
 *
 * Granting a write permission is gated on core invoking the `externalEdit` proceed callback so the
 * edit is attributed correctly in the UI. If core never acknowledges the edit (e.g. the acknowledgment
 * is dropped), that wait must not block the permission response indefinitely — otherwise the whole
 * agent turn hangs with no user action (see https://github.com/microsoft/vscode/issues/320292). Edit
 * attribution is best-effort, so after this timeout we proceed with the already-decided permission.
 */
const EXTERNAL_EDIT_ACK_TIMEOUT_MS = 10_000;

/**
 * Tracks ongoing external edit operations for agent tools.
 * Manages the lifecycle of external edits by coordinating with VS Code's
 * externalEdit API to ensure proper tracking and attribution of file changes.
 */
export class ExternalEditTracker {
	private _ongoingEdits = new Map<string, { complete: () => void; onDidComplete: Thenable<string>; dispose: () => void }>();

	/**
	 * Creates a new ExternalEditTracker.
	 * @param ignoreDirectories Optional list of directory URIs to ignore when tracking edits
	 * @param acknowledgmentTimeoutMs Maximum time to wait for core to acknowledge an external edit before proceeding anyway
	 */
	constructor(
		private readonly ignoreDirectories: URI[] = [],
		private readonly acknowledgmentTimeoutMs: number = EXTERNAL_EDIT_ACK_TIMEOUT_MS,
	) { }

	/**
	 * Starts tracking an external edit operation.
	 *
	 * @param editKey Unique identifier for this edit operation
	 * @param uris URIs that will be affected by the edit
	 * @param stream The chat response stream to call externalEdit on
	 * @param token Optional cancellation token to handle cancellation
	 * @returns Promise that resolves when the edit can proceed, or void if no URIs provided
	 */
	public async trackEdit(
		editKey: string,
		uris: vscode.Uri[],
		stream: vscode.ChatResponseStream,
		token?: CancellationToken
	): Promise<void> {
		// Filter out URIs that are within ignored directories
		const filteredUris = uris.filter(uri => {
			const uriAsURI = URI.isUri(uri) ? uri : URI.from(uri);
			return !this.ignoreDirectories.some(ignoreDir => isEqualOrParent(uriAsURI, ignoreDir));
		});

		if (!filteredUris.length || token?.isCancellationRequested) {
			return;
		}

		return new Promise<void>(proceedWithEdit => {
			const deferred = new DeferredPromise<void>();

			// The permission response is gated on this promise resolving. It must never wait forever
			// on core acknowledging the external edit, so we proceed on whichever happens first: core
			// acknowledges, the request is cancelled, or the safety timeout elapses. Only the timeout
			// is tied to this permission gate — the cancellation listener must outlive it (see below).
			let settled = false;
			const timer = setTimeout(() => settle(), this.acknowledgmentTimeoutMs);
			const settle = () => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				proceedWithEdit();
			};

			// The cancellation listener must live for the full edit lifecycle, not just until the
			// permission gate settles: the request can be cancelled after core acknowledges (or the
			// timeout fires) but before completeEdit runs. A cancelled tool may never emit a completion
			// event, so cancellation is what deletes the map entry and completes the deferred that the
			// externalEdit callback awaits — otherwise both leak forever. It is disposed when it fires
			// or by completeEdit.
			const cancellationListener = token?.onCancellationRequested(() => {
				this._ongoingEdits.delete(editKey);
				cancellationListener?.dispose();
				deferred.complete();
				settle();
			});

			const onDidComplete = stream.externalEdit(filteredUris, async () => {
				settle();
				await deferred.p;
			});

			this._ongoingEdits.set(editKey, {
				onDidComplete,
				complete: () => deferred.complete(),
				dispose: () => cancellationListener?.dispose()
			});
		});
	}

	/**
	 * Completes tracking of an external edit operation.
	 * @param editKey Unique identifier for the edit operation to complete
	 * @returns Promise that resolves when VS Code has finished tracking the edit
	 */
	public async completeEdit(editKey: string): Promise<string | undefined> {
		const ongoingEdit = this._ongoingEdits.get(editKey);
		if (ongoingEdit) {
			this._ongoingEdits.delete(editKey);
			ongoingEdit.dispose();
			ongoingEdit.complete();
			// Bound the wait so a stalled core acknowledgment cannot block request finalization.
			return await raceTimeout(Promise.resolve(ongoingEdit.onDidComplete), this.acknowledgmentTimeoutMs);
		}
	}
}
