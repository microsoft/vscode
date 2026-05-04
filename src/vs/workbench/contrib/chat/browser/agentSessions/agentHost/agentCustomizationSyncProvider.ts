/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';

const SYNC_STORAGE_KEY_PREFIX = 'customizationSync.disabled.';

/**
 * Per-harness sync provider that tracks which local customization URIs the
 * user has explicitly **disabled** for syncing to a particular agent host.
 *
 * Auto-sync semantics: every local customization is synced by default.
 * The persisted set captures only the user's opt-outs.
 */
export class AgentCustomizationSyncProvider extends Disposable implements ICustomizationSyncProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _storageKey: string;
	private _disabled: Set<string>;

	constructor(
		harnessId: string,
		private readonly _storageService: IStorageService,
	) {
		super();
		this._storageKey = SYNC_STORAGE_KEY_PREFIX + harnessId;
		this._disabled = this._load();
	}

	isDisabled(uri: URI): boolean {
		return this._disabled.has(uri.toString());
	}

	setDisabled(uri: URI, disabled: boolean): void {
		const key = uri.toString();
		const had = this._disabled.has(key);
		if (disabled && !had) {
			this._disabled.add(key);
		} else if (!disabled && had) {
			this._disabled.delete(key);
		} else {
			return;
		}
		this._persist();
		this._onDidChange.fire();
	}

	private _load(): Set<string> {
		const stored = this._storageService.get(this._storageKey, StorageScope.PROFILE);
		if (!stored) {
			return new Set();
		}
		try {
			const parsed = JSON.parse(stored) as unknown;
			if (Array.isArray(parsed)) {
				return new Set(parsed.filter((v): v is string => typeof v === 'string'));
			}
		} catch {
			// fall through
		}
		return new Set();
	}

	private _persist(): void {
		this._storageService.store(
			this._storageKey,
			JSON.stringify([...this._disabled]),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}
}
