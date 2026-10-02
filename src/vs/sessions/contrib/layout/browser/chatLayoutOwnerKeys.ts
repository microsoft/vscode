/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatLayoutOwner, getChatLayoutOwnerAfterReplacement } from '../../../common/chatLayout.js';
import { ISession } from '../../../services/sessions/common/session.js';

const CHAT_LAYOUT_OWNER_KEY_SCHEME = 'vscode-chat-layout-owner';

export class ChatLayoutOwnerKeyRegistry {

	private readonly _keysBySession = new ResourceMap<ResourceMap<URI>>();

	resolveKey(owner: IChatLayoutOwner, mainChatResource: URI): URI {
		if (isEqual(owner.chatResource, mainChatResource)) {
			return owner.sessionResource;
		}
		let bySession = this._keysBySession.get(owner.sessionResource);
		const existing = bySession?.get(owner.chatResource);
		if (existing) {
			return existing;
		}
		const key = URI.from({
			scheme: CHAT_LAYOUT_OWNER_KEY_SCHEME,
			path: `/${encodeURIComponent(owner.sessionResource.toString())}/${encodeURIComponent(owner.chatResource.toString())}`,
		});
		if (!bySession) {
			bySession = new ResourceMap<URI>();
			this._keysBySession.set(owner.sessionResource, bySession);
		}
		bySession.set(owner.chatResource, key);
		return key;
	}

	forgetChat(sessionResource: URI, chatResource: URI): URI | undefined {
		const bySession = this._keysBySession.get(sessionResource);
		const key = bySession?.get(chatResource);
		if (!key) {
			return undefined;
		}
		bySession!.delete(chatResource);
		if (bySession!.size === 0) {
			this._keysBySession.delete(sessionResource);
		}
		return key;
	}

	forgetSession(sessionResource: URI): readonly URI[] {
		const bySession = this._keysBySession.get(sessionResource);
		if (!bySession) {
			return [];
		}
		const keys: URI[] = [];
		bySession.forEach(key => keys.push(key));
		this._keysBySession.delete(sessionResource);
		return keys;
	}

	remapSession(replacement: { readonly from: ISession; readonly to: ISession }): readonly { readonly oldKey: URI; readonly newKey: URI }[] {
		const bySession = this._keysBySession.get(replacement.from.resource);
		if (!bySession) {
			return [];
		}
		const entries: [URI, URI][] = [];
		bySession.forEach((key, chatResource) => entries.push([chatResource, key]));
		this._keysBySession.delete(replacement.from.resource);

		const result: { oldKey: URI; newKey: URI }[] = [];
		for (const [chatResource, oldKey] of entries) {
			const newOwner = getChatLayoutOwnerAfterReplacement(
				{ sessionResource: replacement.from.resource, chatResource },
				replacement
			);
			const newKey = this.resolveKey(newOwner, replacement.to.mainChat.get().resource);
			result.push({ oldKey, newKey });
		}
		return result;
	}
}
