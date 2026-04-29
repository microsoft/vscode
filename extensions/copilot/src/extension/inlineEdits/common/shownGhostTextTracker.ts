/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface GhostTextShowContext {
	readonly cursorLine: number;
	readonly cursorCharacter: number;
	readonly documentVersion: number;
}

/**
 * Maximum number of tracked entries per document before eviction.
 * When exceeded, the oldest half of entries are dropped to bound memory.
 */
const MAX_ENTRIES_PER_DOCUMENT = 200;

/**
 * Tracks ghost text (inline suggestion, NOT inline edit) suggestions that have been
 * shown to the user, and determines whether a suggestion should be filtered out
 * based on prior user interactions.
 *
 * Rules:
 * - If a ghost text suggestion was shown and explicitly rejected → never show it again.
 * - If a ghost text suggestion was shown and ignored → do not show it again unless
 *   it would still be ghost text AND the cursor is at the same position AND the
 *   document contents are the same (tracked via document version).
 */
export class ShownGhostTextTracker {
	/** Edit keys of suggestions that were shown as ghost text and explicitly rejected. */
	private readonly _rejected = new Map<string, Set<string>>();

	/** Edit keys of suggestions that were shown as ghost text and ignored, with their show-time context. */
	private readonly _ignored = new Map<string, Map<string, GhostTextShowContext>>();

	public recordRejected(docUri: string, editKey: string): void {
		let docSet = this._rejected.get(docUri);
		if (!docSet) {
			docSet = new Set();
			this._rejected.set(docUri, docSet);
		}
		docSet.add(editKey);
		this._evictIfNeeded(docUri);

		// Rejection is stronger than ignore — remove from ignored if present
		this._ignored.get(docUri)?.delete(editKey);
	}

	public recordIgnored(docUri: string, editKey: string, context: GhostTextShowContext): void {
		// Do not downgrade a rejection to an ignore
		if (this._rejected.get(docUri)?.has(editKey)) {
			return;
		}
		let docMap = this._ignored.get(docUri);
		if (!docMap) {
			docMap = new Map();
			this._ignored.set(docUri, docMap);
		}
		docMap.set(editKey, context);
		this._evictIfNeeded(docUri);
	}

	public clearTracking(docUri: string, editKey: string): void {
		this._rejected.get(docUri)?.delete(editKey);
		this._ignored.get(docUri)?.delete(editKey);
	}

	/** Removes all tracking data for a document (e.g., on document close). */
	public clearDocument(docUri: string): void {
		this._rejected.delete(docUri);
		this._ignored.delete(docUri);
	}

	/**
	 * Determines whether a suggestion should be filtered out based on prior interactions.
	 *
	 * @param docUri - The document URI.
	 * @param editKey - The edit identity key (range + insertText).
	 * @param isGhostText - Whether the suggestion would be rendered as ghost text (not inline edit).
	 * @param cursorLine - Current cursor line.
	 * @param cursorCharacter - Current cursor character.
	 * @param documentVersion - Current document version.
	 * @returns `true` if the suggestion should be filtered out.
	 */
	public shouldFilter(
		docUri: string,
		editKey: string,
		isGhostText: boolean,
		cursorLine: number,
		cursorCharacter: number,
		documentVersion: number,
	): boolean {
		// Rejected ghost text is always filtered — never show again
		if (this._rejected.get(docUri)?.has(editKey)) {
			return true;
		}

		const ignoredCtx = this._ignored.get(docUri)?.get(editKey);
		if (!ignoredCtx) {
			return false; // not tracked
		}

		// Ignored ghost text: allow re-show only if ghost text + same position + same doc version
		if (
			isGhostText
			&& ignoredCtx.cursorLine === cursorLine
			&& ignoredCtx.cursorCharacter === cursorCharacter
			&& ignoredCtx.documentVersion === documentVersion
		) {
			return false; // same context → allow
		}

		return true; // different context or would be inline edit → filter
	}

	/**
	 * Evicts the oldest half of entries for a document when the combined
	 * rejected + ignored count exceeds {@link MAX_ENTRIES_PER_DOCUMENT}.
	 */
	private _evictIfNeeded(docUri: string): void {
		const rejectedSet = this._rejected.get(docUri);
		const ignoredMap = this._ignored.get(docUri);
		const total = (rejectedSet?.size ?? 0) + (ignoredMap?.size ?? 0);
		if (total <= MAX_ENTRIES_PER_DOCUMENT) {
			return;
		}

		const halfToKeep = Math.floor(MAX_ENTRIES_PER_DOCUMENT / 2);

		// Evict oldest entries from rejected (Set preserves insertion order)
		if (rejectedSet && rejectedSet.size > halfToKeep) {
			const toRemove = rejectedSet.size - halfToKeep;
			let removed = 0;
			for (const key of rejectedSet) {
				if (removed >= toRemove) {
					break;
				}
				rejectedSet.delete(key);
				removed++;
			}
		}

		// Evict oldest entries from ignored (Map preserves insertion order)
		if (ignoredMap && ignoredMap.size > halfToKeep) {
			const toRemove = ignoredMap.size - halfToKeep;
			let removed = 0;
			for (const key of ignoredMap.keys()) {
				if (removed >= toRemove) {
					break;
				}
				ignoredMap.delete(key);
				removed++;
			}
		}
	}
}

/**
 * Computes a deterministic edit key from a range and insert text.
 * Used to identify "the same suggestion" across provide/show/endOfLife calls.
 */
export function computeGhostTextEditKey(
	startLine: number,
	startCharacter: number,
	endLine: number,
	endCharacter: number,
	insertText: string,
): string {
	return `${startLine}:${startCharacter}-${endLine}:${endCharacter}|${insertText}`;
}
