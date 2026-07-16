/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { DeferredPromise, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isEqualOrParent } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { ILogger } from '../../../platform/log/common/logService';

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
 * A single tracked external edit for one file, awaiting core's externalEdit acknowledgment.
 */
interface IOngoingEdit {
	complete: () => void;
	onDidComplete: Thenable<string>;
	dispose: () => void;
}

/**
 * Tracks ongoing external edit operations for agent tools.
 * Manages the lifecycle of external edits by coordinating with VS Code's
 * externalEdit API to ensure proper tracking and attribution of file changes.
 */
export class ExternalEditTracker {
	// A single edit key (e.g. one tool call) can track multiple files, each of which requires its
	// own externalEdit acknowledgment from core. They must be stored as a list — keying by editKey
	// alone and overwriting would strand the earlier file's deferred, so its core externalEdit
	// callback never returns and the per-resource streaming-edit lock in core leaks forever, wedging
	// every future edit to that file (see https://github.com/microsoft/vscode/issues/320292).
	private _ongoingEdits = new Map<string, IOngoingEdit[]>();

	/**
	 * Creates a new ExternalEditTracker.
	 * @param ignoreDirectories Optional list of directory URIs to ignore when tracking edits
	 * @param acknowledgmentTimeoutMs Maximum time to wait for core to acknowledge an external edit before proceeding anyway
	 * @param logService Optional logger used to diagnose lost/missing core acknowledgments
	 */
	constructor(
		private readonly ignoreDirectories: URI[] = [],
		private readonly acknowledgmentTimeoutMs: number = EXTERNAL_EDIT_ACK_TIMEOUT_MS,
		private readonly logService?: ILogger,
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
			const timer = setTimeout(() => {
				// The timeout firing means core never invoked the externalEdit proceed callback within
				// the deadline (see https://github.com/microsoft/vscode/issues/320292). Log an error with
				// enough detail to correlate with the core-side externalEdit trace next time it happens.
				this.logService?.error(`[ExternalEditTracker] Core did not acknowledge external edit ${editKey} (${filteredUris.length} file(s)) within ${this.acknowledgmentTimeoutMs}ms; proceeding without attribution`);
				settle();
			}, this.acknowledgmentTimeoutMs);
			const settle = () => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				proceedWithEdit();
			};

			// Listener must outlive the permission gate: a cancel after ack/timeout but before completeEdit is what releases this file's deferred and entry.
			const entry: IOngoingEdit = {
				onDidComplete: undefined!,
				complete: () => deferred.complete(),
				dispose: () => cancellationListener?.dispose(),
			};

			const removeEntry = () => {
				const entries = this._ongoingEdits.get(editKey);
				if (!entries) {
					return;
				}
				const index = entries.indexOf(entry);
				if (index !== -1) {
					entries.splice(index, 1);
				}
				if (entries.length === 0) {
					this._ongoingEdits.delete(editKey);
				}
			};

			const cancellationListener = token?.onCancellationRequested(() => {
				removeEntry();
				cancellationListener?.dispose();
				deferred.complete();
				settle();
			});

			entry.onDidComplete = stream.externalEdit(filteredUris, async () => {
				settle();
				await deferred.p;
			});

			const entries = this._ongoingEdits.get(editKey);
			if (entries) {
				entries.push(entry);
			} else {
				this._ongoingEdits.set(editKey, [entry]);
			}
		});
	}

	/**
	 * Completes tracking of an external edit operation.
	 *
	 * A single edit key may cover multiple files (one entry per tracked file); all of them are
	 * completed and awaited so every file's core acknowledgment resolves and its streaming-edit lock
	 * is released. Returns the first defined edit id for attribution, preserving the previous
	 * single-file return contract.
	 *
	 * @param editKey Unique identifier for the edit operation to complete
	 * @returns Promise that resolves when VS Code has finished tracking the edit
	 */
	public async completeEdit(editKey: string): Promise<string | undefined> {
		const ongoingEdits = this._ongoingEdits.get(editKey);
		if (!ongoingEdits || ongoingEdits.length === 0) {
			return;
		}
		this._ongoingEdits.delete(editKey);
		const results = await Promise.all(ongoingEdits.map(async ongoingEdit => {
			ongoingEdit.dispose();
			ongoingEdit.complete();
			// Bound the wait so a stalled core acknowledgment cannot block request finalization.
			const result = await raceTimeout(Promise.resolve(ongoingEdit.onDidComplete), this.acknowledgmentTimeoutMs);
			if (result === undefined) {
				this.logService?.warn(`[ExternalEditTracker] Core did not confirm completion of external edit ${editKey} within ${this.acknowledgmentTimeoutMs}ms`);
			}
			return result;
		}));
		return results.find(result => result !== undefined);
	}
}
