/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
const SYNC_STORAGE_KEY_PREFIX = 'customizationSync.';
/**
 * Persisted sync selection provider that tracks which local customization
 * URIs the user has selected for syncing to a particular agent host agent.
 *
 * Stores `{ uri, type }` pairs so the resolution layer can classify
 * entries as plugins or individual prompt files without re-scanning.
 */
export class AgentCustomizationSyncProvider extends Disposable {
    constructor(harnessId, _storageService) {
        super();
        this._storageService = _storageService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._storageKey = SYNC_STORAGE_KEY_PREFIX + harnessId;
        // Load persisted selections, supporting both old (string[]) and new (ISyncEntry[]) formats
        const stored = this._storageService.get(this._storageKey, 0 /* StorageScope.PROFILE */);
        this._entries = new Map();
        if (stored) {
            let parsed;
            try {
                parsed = JSON.parse(stored);
            }
            catch {
                // ignored
            }
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (typeof item === 'string') {
                        // Legacy format: bare URI string
                        this._entries.set(item, { uri: item });
                    }
                    else if (item && typeof item.uri === 'string') {
                        this._entries.set(item.uri, item);
                    }
                }
            }
        }
    }
    getSelectedUris() {
        return [...this._entries.keys()].map(u => URI.parse(u));
    }
    /**
     * Returns the selected entries with their prompt types.
     * Used by the customization resolution layer to classify files.
     */
    getSelectedEntries() {
        return [...this._entries.values()].map(e => ({
            uri: URI.parse(e.uri),
            type: e.type,
        }));
    }
    setSelectedUris(uris) {
        this._entries = new Map(uris.map(u => [u.toString(), { uri: u.toString() }]));
        this._persist();
        this._onDidChange.fire();
    }
    isSelected(uri) {
        return this._entries.has(uri.toString());
    }
    toggleUri(uri, type) {
        const key = uri.toString();
        if (this._entries.has(key)) {
            this._entries.delete(key);
        }
        else {
            this._entries.set(key, { uri: key, type });
        }
        this._persist();
        this._onDidChange.fire();
    }
    _persist() {
        this._storageService.store(this._storageKey, JSON.stringify([...this._entries.values()]), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50Q3VzdG9taXphdGlvblN5bmNQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUszRCxNQUFNLHVCQUF1QixHQUFHLG9CQUFvQixDQUFDO0FBV3JEOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTyw4QkFBK0IsU0FBUSxVQUFVO0lBTzdELFlBQ0MsU0FBaUIsRUFDQSxlQUFnQztRQUVqRCxLQUFLLEVBQUUsQ0FBQztRQUZTLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQVJqQyxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELGdCQUFXLEdBQWdCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBVTNELElBQUksQ0FBQyxXQUFXLEdBQUcsdUJBQXVCLEdBQUcsU0FBUyxDQUFDO1FBRXZELDJGQUEyRjtRQUMzRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVywrQkFBdUIsQ0FBQztRQUNoRixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDMUIsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLElBQUksTUFBMkMsQ0FBQztZQUNoRCxJQUFJLENBQUM7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