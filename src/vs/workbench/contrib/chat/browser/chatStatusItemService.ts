/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatStatusItemService = createDecorator<IChatStatusItemService>('IChatStatusItemService');

export interface IChatStatusItemService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<IChatStatusItemChangeEvent>;

	setOrUpdateEntry(entry: ChatStatusEntry): void;

	deleteEntry(id: string): void;

	getEntries(): Iterable<ChatStatusEntry>;
}


export interface IChatStatusItemChangeEvent {
	readonly entry: ChatStatusEntry;
}

export type ChatStatusEntry = {
	id: string;
	label: string | { label: string; link: string };
	description: string;
	detail: string | undefined;
};


class ChatStatusItemService implements IChatStatusItemService {
	readonly _serviceBrand: undefined;

	private readonly _entries = new Map<string, ChatStatusEntry>();

	private readonly _onDidChange = new Emitter<IChatStatusItemChangeEvent>();
	readonly onDidChange = this._onDidChange.event;

	setOrUpdateEntry(entry: ChatStatusEntry): void {
		const isUpdate = this._entries.has(entry.id);
		this._entries.set(entry.id, entry);
		if (isUpdate) {
			this._onDidChange.fire({ entry });
		}
	}

	deleteEntry(id: string): void {
		this._entries.delete(id);
	}

	getEntries(): Iterable<ChatStatusEntry> {
		return this._entries.values();
	}
}

registerSingleton(IChatStatusItemService, ChatStatusItemService, InstantiationType.Delayed);
