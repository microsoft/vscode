/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IReader } from '../../../../base/common/observable.js';
import { IExtUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';

/**
 * Marks the chat that shows to the user read, such as the active chat of the main window or of a chat window: once it
 * shows unread, and again once a turn of it ends while it shows. A chat the user marked unread while it shows stays
 * unread until its next turn ends; once another chat showed, showing it again marks it read.
 */
export class ShownChatReadMarker {

	private _previousChat: URI | undefined;
	private _lastReadRequest: { readonly chat: URI; readonly version: number | undefined } | undefined;

	constructor(
		private readonly _sessionsManagementService: ISessionsManagementService,
		private readonly _extUri: IExtUri,
	) { }

	/** Nothing shows: the chat that shows next marks read as a newly shown one. */
	reset(): void {
		this._previousChat = undefined;
		this._lastReadRequest = undefined;
	}

	/**
	 * `chat` of `session` shows, or nothing while undefined; marks it read when it is unread. `canMark` defers marking it,
	 * such as while another chat of the session is about to show.
	 */
	update(session: ISession, chat: IChat | undefined, reader: IReader, canMark?: (chat: IChat) => boolean): void {
		const mainChat = session.mainChat.read(reader);
		const chatChanged = !chat || !this._previousChat || !this._extUri.isEqual(chat.resource, this._previousChat);
		this._previousChat = chat?.resource;
		if (chatChanged) {
			this._lastReadRequest = undefined;
		}
		if (session.loading.read(reader)) {
			this._lastReadRequest = undefined;
			return;
		}
		if (!chat || chat.isRead.read(reader)) {
			return;
		}
		if (canMark && !canMark(chat)) {
			return;
		}
		const version = (chat.lastTurnEnd?.read(reader) ?? chat.updatedAt.read(reader))?.getTime();
		// Deduplicate stale read-state echoes without suppressing the next completed turn in the shown chat.
		if (this._lastReadRequest
			&& this._extUri.isEqual(this._lastReadRequest.chat, chat.resource)
			&& this._lastReadRequest.version === version) {
			return;
		}
		const readRequest = { chat: chat.resource, version };
		this._lastReadRequest = readRequest;
		const accepted = this._extUri.isEqual(chat.resource, mainChat.resource)
			? this._sessionsManagementService.markRead(session, { preserveExplicitUnread: !chatChanged })
			: this._sessionsManagementService.markChatRead(session, chat, { preserveExplicitUnread: !chatChanged });
		accepted.then(result => {
			if (result === false && this._lastReadRequest === readRequest) {
				this._lastReadRequest = undefined;
			}
		}, error => {
			if (this._lastReadRequest === readRequest) {
				this._lastReadRequest = undefined;
			}
			onUnexpectedError(error);
		});
	}
}
