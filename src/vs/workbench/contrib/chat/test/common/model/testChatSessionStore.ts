/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { cloneChatData, retainChatBinaryReferences } from '../../../common/model/chatSessionResources.js';
import { ChatStorageOwner, IChatOwnedStorageData, IChatSessionStore } from '../../../common/model/chatSessionStore.js';

export class TestChatSessionStore extends mock<IChatSessionStore>() {
	override readonly onDidInvalidateOwnedData = Event.None;
	private readonly data = new Map<ChatStorageOwner, IChatOwnedStorageData[ChatStorageOwner]>();

	override async readOwnedData<K extends ChatStorageOwner>(owner: K): Promise<IReference<IChatOwnedStorageData[K]> | undefined> {
		const value = this.data.get(owner) as IChatOwnedStorageData[K] | undefined;
		return value === undefined ? undefined : Object.assign(retainChatBinaryReferences(value), { object: cloneChatData(value) });
	}

	override async writeOwnedData<K extends ChatStorageOwner>(owner: K, value: IChatOwnedStorageData[K]): Promise<IReference<IChatOwnedStorageData[K]>> {
		const snapshot = cloneChatData(value);
		this.data.set(owner, snapshot);
		return Object.assign(retainChatBinaryReferences(snapshot), { object: snapshot });
	}
}
