/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';

const SYNC_STORAGE_KEY_PREFIX = 'customizationSync.';

/**
 * A sync selection entry: URI + optional prompt type for individual files.
 * Plugin URIs have no type (they are synced as whole directories).
 */
interface ISyncEntry {
	readonly uri: string;
	readonly type?: PromptsType;
}

/**
 * Persisted sync selection provider that tracks which local customization
 * URIs the user has selected for syncing to a particular agent host agent.
 *
 * Stores `{ uri, type }` pairs so the resolution layer can classify
 * entries as plugins or individual prompt files without re-scanning.
 */
export class AgentCustomizationSyncProvider extends Disposable implements ICustomizationSyncProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _storageKey: string;
	private _entries: Map<string, ISyncEntry>;

	constructor(
		harnessId: string,
		private readonly _storageService: IStorageService,
	) {
		super();
		this._storageKey = SYNC_STORAGE_KEY_PREFIX + harnessId;

		// Load persisted selections, supporting both old (string[]) and new (ISyncEntry[]) formats
		const stored = this._storageService.get(this._storageKey, StorageScope.PROFILE);
		this._entries = new Map();
		if (stored) {
			let parsed: (string | ISyncEntry)[] | undefined;
			try {
				parsed = JSON.parse(stored) as (string | ISyncEntry)[];
			} catch {
				// ignored
			}

			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (typeof item === 'string') {
						// Legacy format: bare URI string
						this._entries.set(item, { uri: item });
					} else if (item && typeof item.uri === 'string') {
						this._entries.set(item.uri, item);
					}
				}
			}
		}
	}

	getSelectedUris(): readonly URI[] {
		return [...this._entries.keys()].map(u => URI.parse(u));
	}

	/**
	 * Returns the selected entries with their prompt types.
	 * Used by the customization resolution layer to classify files.
	 */
	getSelectedEntries(): readonly { uri: URI; type?: PromptsType }[] {
		return [...this._entries.values()].map(e => ({
			uri: URI.parse(e.uri),
			type: e.type,
		}));
	}

	setSelectedUris(uris: readonly URI[]): void {
		this._entries = new Map(uris.map(u => [u.toString(), { uri: u.toString() }]));
		this._persist();
		this._onDidChange.fire();
	}

	isSelected(uri: URI): boolean {
		return this._entries.has(uri.toString());
	}

	toggleUri(uri: URI, type?: PromptsType): void {
		const key = uri.toString();
		if (this._entries.has(key)) {
			this._entries.delete(key);
		} else {
			this._entries.set(key, { uri: key, type });
		}
		this._persist();
		this._onDidChange.fire();
	}

	private _persist(): void {
		this._storageService.store(
			this._storageKey,
			JSON.stringify([...this._entries.values()]),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}
}
