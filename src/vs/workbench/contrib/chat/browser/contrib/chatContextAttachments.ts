/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatRequestVariableEntry } from 'vs/workbench/contrib/chat/common/chatModel';

export class ChatContextAttachments extends Disposable implements IChatWidgetContrib {

	private _attachedContext = new Set<IChatRequestVariableEntry>();

	private readonly _onDidChangeInputState = this._register(new Emitter<void>());
	readonly onDidChangeInputState = this._onDidChangeInputState.event;

	public static readonly ID = 'chatContextAttachments';

	get id() {
		return ChatContextAttachments.ID;
	}

	constructor(readonly widget: IChatWidget) {
		super();

		this._register(this.widget.onDidChangeContext((e) => {
			if (e.removed) {
				this._removeContext(e.removed);
			}
		}));

		this._register(this.widget.onDidSubmitAgent(() => {
			this._clearAttachedContext();
		}));
	}

	getInputState(): IChatRequestVariableEntry[] {
		return [...this._attachedContext.values()];
	}

	setInputState(s: any): void {
		if (!Array.isArray(s)) {
			s = [];
		}

		this._attachedContext.clear();
		for (const attachment of s) {
			this._attachedContext.add(attachment);
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
		this._onDidChangeInputState.fire();
	}

	private _removeContext(attachments: IChatRequestVariableEntry[]) {
		if (attachments.length) {
			attachments.forEach(this._attachedContext.delete, this._attachedContext);
			this._onDidChangeInputState.fire();
		}
	}

	private _clearAttachedContext() {
		this._attachedContext.clear();
	}
}

ChatWidget.CONTRIBS.push(ChatContextAttachments);
