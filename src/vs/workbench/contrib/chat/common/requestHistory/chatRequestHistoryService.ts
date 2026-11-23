/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignal } from '../../../../../base/common/observable.js';
import { isObject } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatConfiguration } from '../constants.js';
import { IChatRequestHistoryEntry, IChatRequestHistoryEntryUpdate, IChatRequestHistoryRecord, IChatRequestHistorySearchOptions, IChatRequestHistoryService, MAX_CHAT_REQUEST_HISTORY_ENTRIES, MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH, searchChatRequestHistory } from './chatRequestHistory.js';

/**
 * Each entry has its own application-scoped, machine-target key, so windows recording or removing entries at once never
 * overwrite each other's entries, and the history is shared by all profiles of this machine but never synced.
 */
const ENTRY_KEY_PREFIX = 'chat.requestHistory/';

interface IStoredChatRequestHistoryEntry {
	readonly v: 1;
	readonly prompt: string;
	readonly timestamp: number;
	readonly link: string;
	readonly chatResource: string;
	readonly title?: string;
	readonly host?: string;
	readonly remoteAuthority?: string;
}

export class ChatRequestHistoryService extends Disposable implements IChatRequestHistoryService {

	declare readonly _serviceBrand: undefined;

	private readonly _entries = new Map<string, IChatRequestHistoryEntry>();
	private readonly _changed = observableSignal(this);
	/** Set while this service writes, so it does not reread its own changes. */
	private _writing = false;

	readonly enabled: IObservable<boolean>;
	readonly entries: IObservable<readonly IChatRequestHistoryEntry[]>;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const historyEnabled = observableConfigValue(ChatConfiguration.RequestHistoryEnabled, true, configurationService);
		const aiDisabled = observableConfigValue(ChatAIDisabledSettingId, false, configurationService);
		this.enabled = derived(this, reader => historyEnabled.read(reader) && !aiDisabled.read(reader));
		this.entries = derived(this, reader => {
			this._changed.read(reader);
			return this.enabled.read(reader) ? this._sorted() : [];
		});

		for (const key of this._storageService.keys(StorageScope.APPLICATION)) {
			if (key.startsWith(ENTRY_KEY_PREFIX)) {
				this._read(key);
			}
		}
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._store)(e => {
			if (!this._writing && e.key.startsWith(ENTRY_KEY_PREFIX)) {
				this._read(e.key);
				this._changed.trigger(undefined);
			}
		}));
	}

	record(record: IChatRequestHistoryRecord): void {
		if (!this.enabled.get()) {
			return;
		}
		this._write(() => {
			for (const entry of [...this._entries.values()]) {
				if (entry.link === record.link) {
					this._delete(entry.id);
				}
			}
			this._put({ ...record, id: generateUuid(), prompt: record.prompt.slice(0, MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH) });
			const sorted = this._sorted();
			for (const entry of sorted.slice(MAX_CHAT_REQUEST_HISTORY_ENTRIES)) {
				this._delete(entry.id);
			}
			return true;
		});
	}

	update(select: (entry: IChatRequestHistoryEntry) => IChatRequestHistoryEntryUpdate | undefined): void {
		this._write(() => {
			let changed = false;
			for (const entry of [...this._entries.values()]) {
				const change = select(entry);
				if (change && (Object.keys(change) as (keyof IChatRequestHistoryEntryUpdate)[]).some(key => change[key] !== entry[key])) {
					this._put({ ...entry, ...change });
					changed = true;
				}
			}
			return changed;
		});
	}

	remove(select: (entry: IChatRequestHistoryEntry) => boolean): void {
		this._write(() => {
			let changed = false;
			for (const entry of [...this._entries.values()]) {
				if (select(entry)) {
					this._delete(entry.id);
					changed = true;
				}
			}
			return changed;
		});
	}

	clear(): void {
		this._write(() => {
			for (const key of this._storageService.keys(StorageScope.APPLICATION)) {
				if (key.startsWith(ENTRY_KEY_PREFIX)) {
					this._storageService.remove(key, StorageScope.APPLICATION);
				}
			}
			this._entries.clear();
			return true;
		});
	}

	search(query: string, options?: IChatRequestHistorySearchOptions): readonly IChatRequestHistoryEntry[] {
		return this.enabled.get() ? searchChatRequestHistory([...this._entries.values()], query, options) : [];
	}

	private _sorted(): IChatRequestHistoryEntry[] {
		return [...this._entries.values()].sort((a, b) => b.timestamp - a.timestamp);
	}

	/** Applies `change`, which returns whether it changed any entry, and notifies observers of a change. */
	private _write(change: () => boolean): void {
		let changed: boolean;
		this._writing = true;
		try {
			changed = change();
		} finally {
			this._writing = false;
		}
		if (changed) {
			this._changed.trigger(undefined);
		}
	}

	private _put(entry: IChatRequestHistoryEntry): void {
		const stored: IStoredChatRequestHistoryEntry = {
			v: 1,
			prompt: entry.prompt,
			timestamp: entry.timestamp,
			link: entry.link,
			chatResource: entry.chatResource,
			...(entry.title ? { title: entry.title } : {}),
			...(entry.host ? { host: entry.host } : {}),
			...(entry.remoteAuthority ? { remoteAuthority: entry.remoteAuthority } : {}),
		};
		this._storageService.store(ENTRY_KEY_PREFIX + entry.id, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._entries.set(entry.id, entry);
	}

	private _delete(id: string): void {
		this._storageService.remove(ENTRY_KEY_PREFIX + id, StorageScope.APPLICATION);
		this._entries.delete(id);
	}

	private _read(key: string): void {
		const id = key.slice(ENTRY_KEY_PREFIX.length);
		const entry = parseStoredEntry(id, this._storageService.get(key, StorageScope.APPLICATION));
		if (entry) {
			this._entries.set(id, entry);
		} else {
			this._entries.delete(id);
		}
	}
}

function parseStoredEntry(id: string, raw: string | undefined): IChatRequestHistoryEntry | undefined {
	if (!raw) {
		return undefined;
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!isObject(value)) {
		return undefined;
	}
	const stored = value as Partial<IStoredChatRequestHistoryEntry>;
	if (stored.v !== 1 || typeof stored.prompt !== 'string' || typeof stored.timestamp !== 'number' || typeof stored.link !== 'string' || typeof stored.chatResource !== 'string') {
		return undefined;
	}
	return {
		id,
		prompt: stored.prompt,
		timestamp: stored.timestamp,
		link: stored.link,
		chatResource: stored.chatResource,
		...(typeof stored.title === 'string' ? { title: stored.title } : {}),
		...(typeof stored.host === 'string' ? { host: stored.host } : {}),
		...(typeof stored.remoteAuthority === 'string' ? { remoteAuthority: stored.remoteAuthority } : {}),
	};
}
