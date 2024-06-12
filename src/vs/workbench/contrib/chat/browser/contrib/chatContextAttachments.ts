/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatRequestVariableEntry } from 'vs/workbench/contrib/chat/common/chatModel';

export class ChatContextAttachments extends Disposable implements IChatWidgetContrib {

	private _attachedContext = new Set<IChatRequestVariableEntry>();

	public static readonly ID = 'chatContextAttachments';

	get id() {
		return ChatContextAttachments.ID;
	}

	constructor(readonly widget: IChatWidget) {
		super();

		this._register(this.widget.onDidDeleteContext((e) => {
			this._removeContext(e);
		}));

		this._register(this.widget.onDidSubmitAgent(() => {
			this._clearAttachedContext();
		}));
	}

	getInputState?() {
		return [...this._attachedContext.values()];
	}

	setInputState?(s: any): void {
		if (!Array.isArray(s)) {
			return;
		}

		this.widget.setContext(true, ...s);
	}

	getContext() {
		return new Set([...this._attachedContext.values()].map((v) => v.id));
	}

	setContext(overwrite: boolean, ...attachments: IChatRequestVariableEntry[]) {
		if (overwrite) {
			this._attachedContext.clear();
		}
		for (const attachment of attachments) {
			this._attachedContext.add(attachment);
		}

		this.widget.setContext(overwrite, ...attachments);
	}

	private _removeContext(attachment: IChatRequestVariableEntry) {
		this._attachedContext.delete(attachment);
	}

	private _clearAttachedContext() {
		this._attachedContext.clear();
	}
}

ChatWidget.CONTRIBS.push(ChatContextAttachments);
