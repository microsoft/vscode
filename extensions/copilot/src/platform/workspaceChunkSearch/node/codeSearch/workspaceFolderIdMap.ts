/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Memento } from 'vscode';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { basenameOrAuthority } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';

const maxPrefixLength = 8;

interface StoredIdMap {
	/** Maps folder URI string -> assigned id */
	readonly entries: ReadonlyArray<{ readonly uri: string; readonly id: string }>;
}

/**
 * Generates short, unique, persistent ids for workspace folder URIs.
 */
export class WorkspaceFolderIdMap {

	private static readonly _storageKey = 'workspaceFolderIds';

	private readonly _idByUri = new ResourceMap<string>();
	private readonly _usedIds = new Set<string>();

	constructor(
		private readonly _workspaceState: Memento,
	) {
		this._loadFromStorage();
	}

	getIdForFolder(folderRoot: URI): string {
		const existing = this._idByUri.get(folderRoot);
		if (existing) {
			return existing;
		}

		const id = this._generateUniqueId(folderRoot);
		this._idByUri.set(folderRoot, id);
		this._usedIds.add(id);
		this._saveToStorage();
		return id;
	}

	getFolderForId(id: string): URI | undefined {
		for (const [uri, assignedId] of this._idByUri) {
			if (assignedId === id) {
				return uri;
			}
		}
		return undefined;
	}

	private _generateUniqueId(folderRoot: URI): string {
		const name = basenameOrAuthority(folderRoot);
		const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
		const base = sanitized.slice(0, maxPrefixLength) || 'ws';

		if (base.length <= maxPrefixLength && !this._usedIds.has(base)) {
			return base;
		}

		// Resolve collision by appending a numeric suffix
		for (let i = 0; ; i++) {
			const suffix = String(i);
			const candidate = base.slice(0, maxPrefixLength - suffix.length) + suffix;
			if (!this._usedIds.has(candidate)) {
				return candidate;
			}
		}
	}

	private _loadFromStorage(): void {
		const stored = this._workspaceState.get<StoredIdMap>(WorkspaceFolderIdMap._storageKey);
		if (!stored?.entries) {
			return;
		}
		for (const { uri, id } of stored.entries) {
			try {
				this._idByUri.set(URI.parse(uri), id);
				this._usedIds.add(id);
			} catch {
				// Ignore invalid URIs
			}
		}
	}

	private _saveToStorage(): void {
		const data: StoredIdMap = {
			entries: [...this._idByUri].map(([uri, id]) => ({ uri: uri.toString(), id })),
		};
		this._workspaceState.update(WorkspaceFolderIdMap._storageKey, data);
	}
}
