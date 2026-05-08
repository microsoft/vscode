/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * URI scheme used for synthetic pre-image documents backed by
 * {@link WriteSnapshotStore}. Each snapshot is addressed by an opaque id and
 * decoded back to its captured text by `provideTextDocumentContent`.
 */
const SCHEME = 'son-of-anton-snapshot';

interface SnapshotEntry {
	readonly content: string;
	readonly capturedAt: number;
}

/**
 * In-memory store of file pre-images captured at the moment a tool ran.
 *
 * Phase 63 — side-by-side diff for tool writes. When the `write_file` tool
 * succeeds the host passes the file's pre-image content here, gets back an
 * opaque id, and ships that id to the webview alongside the tool-call result.
 * Clicking "View diff" round-trips the id back to the host, which materialises
 * a synthetic `son-of-anton-snapshot:` URI and hands the pair `(snapshotUri,
 * onDiskUri)` to `vscode.diff`.
 *
 * Snapshots are intentionally process-local: they are NOT persisted across
 * reloads (the in-memory `Map` is dropped). On reload, the webview's
 * persisted tool cards no longer carry a snapshot id and the diff button
 * falls back to comparing against `git:HEAD` instead. That degradation is
 * acceptable because the captured-snapshot path is the *better* answer only
 * when the file changed between HEAD and the moment the tool ran — a
 * relatively narrow window.
 *
 * The cap (200 entries) is a soft guard against runaway memory growth in
 * long-lived sessions; the oldest entry is evicted when the cap is hit.
 */
export class WriteSnapshotStore implements vscode.TextDocumentContentProvider {
	public static readonly scheme = SCHEME;

	private readonly snapshots = new Map<string, SnapshotEntry>();
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public readonly onDidChange = this._onDidChange.event;

	/** Maximum number of in-memory snapshots before the oldest is evicted. */
	private static readonly MAX_ENTRIES = 200;

	/**
	 * Stash a pre-image capture and return an opaque id the webview can
	 * round-trip back later. The id is derived from a millisecond timestamp
	 * plus a short random suffix — collisions are exceedingly unlikely
	 * within the 200-entry cap, but the suffix is added defensively so a
	 * tight loop of writes within the same millisecond still produces
	 * unique ids.
	 */
	public capture(content: string): string {
		const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
		this.snapshots.set(id, { content, capturedAt: Date.now() });
		if (this.snapshots.size > WriteSnapshotStore.MAX_ENTRIES) {
			let oldestId: string | undefined;
			let oldestAt = Number.POSITIVE_INFINITY;
			for (const [key, entry] of this.snapshots) {
				if (entry.capturedAt < oldestAt) {
					oldestAt = entry.capturedAt;
					oldestId = key;
				}
			}
			if (oldestId !== undefined) {
				this.snapshots.delete(oldestId);
			}
		}
		return id;
	}

	/**
	 * Build the synthetic URI passed to `vscode.diff` for a captured
	 * snapshot. The URI's path carries the original filename so the diff
	 * editor's tab shows something readable; the snapshot id lives in the
	 * query string and is the only piece used by
	 * `provideTextDocumentContent`.
	 */
	public uriFor(id: string, fileName: string): vscode.Uri {
		// `vscode.Uri.from` accepts a path and query independently and
		// handles encoding for us — safer than building the string by hand
		// when the filename may contain spaces or special characters.
		return vscode.Uri.from({
			scheme: SCHEME,
			path: `/${fileName}`,
			query: `id=${encodeURIComponent(id)}`,
		});
	}

	/**
	 * Resolve the synthetic URI back to its captured content. Returns the
	 * empty string when the id is unknown — VS Code's diff editor tolerates
	 * empty pre-images and will show the entire post-image as additions,
	 * which is the right fallback when a snapshot has been evicted.
	 */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		const params = new URLSearchParams(uri.query);
		const id = params.get('id');
		if (!id) {
			return '';
		}
		return this.snapshots.get(id)?.content ?? '';
	}

	public dispose(): void {
		this._onDidChange.dispose();
		this.snapshots.clear();
	}
}
