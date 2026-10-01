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

/**
 * Resolves the opaque {@link URI} key used to index the existing session-keyed
 * layout maps ({@link ResourceMap}) for a chat-layout owner. The session's main
 * chat is always keyed by the session resource itself — so the main chat
 * transparently inherits whatever legacy per-session state already exists —
 * while every other chat gets a distinct, stable synthetic key, keeping a
 * single flat map shape for both the disabled (session-keyed) and enabled
 * (chat-keyed) presentations.
 *
 * This flat-key shape (rather than a nested `ResourceMap<ResourceMap<V>>` keyed
 * directly by `(sessionResource, chatResource)`, as used by
 * `changesViewService.ts`'s in-memory selection store) is a deliberate reuse of
 * the pre-existing, already-persisted session-keyed maps in
 * {@link baseSessionLayoutController.ts} (`_workingSets`,
 * `_viewStateBySession`, `_editorPartHiddenBySession`, `_panelViewBySession`):
 * restructuring those to a nested shape would be an unrelated, out-of-scope
 * rewrite of code and storage formats that predate chat-specific layout. The
 * synthetic key is a pure, deterministic function of `(sessionResource,
 * chatResource)` (see {@link resolveKey}) — not random — so it regenerates
 * identically across reloads without needing the resolver's own in-memory
 * cache to be persisted; only the *consumers* of the key
 * ({@link DesktopOwnerCompositionStore} and the base controller's maps)
 * persist state against it. No provider resource is ever reconstructed from
 * the synthetic key: it is write-only (derived from, never parsed back into,
 * session/chat resources) and is forgotten/remapped by direct reference via
 * {@link forgetChat}/{@link forgetSession}/{@link remapSession} rather than by
 * decoding its path.
 */
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

	/** Forgets a single non-main chat's key (confirmed per-chat deletion). Returns the forgotten key, if any. */
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

	/** Forgets every non-main chat key owned by a session (archive/removal). Returns the forgotten keys. */
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

	/**
	 * Remaps every non-main chat key owned by `replacement.from` onto
	 * `replacement.to` (main-draft graduation), using the same owner-replacement
	 * rule as the foundation's {@link getChatLayoutOwnerAfterReplacement}.
	 * Unrelated peers are left untouched.
	 */
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
