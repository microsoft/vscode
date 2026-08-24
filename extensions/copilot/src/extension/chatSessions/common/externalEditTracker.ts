/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { isEqualOrParent } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Tracks ongoing external edit operations for agent tools.
 * Manages the lifecycle of external edits by coordinating with VS Code's
 * externalEdit API to ensure proper tracking and attribution of file changes.
 */
export class ExternalEditTracker {
	private _ongoingEdits = new Map<string, { complete: () => void; onDidComplete: Thenable<string> }>();

	/**
	 * Creates a new ExternalEditTracker.
	 * @param ignoreDirectories Optional list of directory URIs to ignore when tracking edits
	 */
	constructor(
		private readonly ignoreDirectories: URI[] = []
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

		return new Promise(proceedWithEdit => {
			const deferred = new DeferredPromise<void>();
			let cancelListen: IDisposable | undefined;

			// Handle cancellation if token provided
			if (token) {
				cancelListen = token.onCancellationRequested(() => {
					this._ongoingEdits.delete(editKey);
					deferred.complete();
				});
			}

			const onDidComplete = stream.externalEdit(filteredUris, async () => {
				proceedWithEdit();
				await deferred.p;
				cancelListen?.dispose();
			});

			this._ongoingEdits.set(editKey, {
				onDidComplete,
				complete: () => deferred.complete()
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
			ongoingEdit.complete();
			return await ongoingEdit.onDidComplete;
		}
	}
}
