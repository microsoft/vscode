/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatWidget } from '../chat.js';
import { ChatWidget, IChatWidgetContrib } from '../chatWidget.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';
import { Iterable } from '../../../../../base/common/iterator.js';

export class ChatContextAttachments extends Disposable implements IChatWidgetContrib {

	private _attachedContext = new Set<IChatRequestVariableEntry>();

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

	setContext(overwriteAll: boolean, ...attachments: IChatRequestVariableEntry[]) {
		if (overwriteAll) {
			this._attachedContext.clear();
		}

		const toAttach = attachments.filter(a => !this.hasMatchingAttachment(a));
		for (const attachment of toAttach) {
			this._attachedContext.add(attachment);
		}

		this.widget.setContext(overwriteAll, ...toAttach);
	}

	private _removeContext(attachments: IChatRequestVariableEntry[]) {
		if (attachments.length) {
			attachments.forEach(this._attachedContext.delete, this._attachedContext);
		}
	}

	private _clearAttachedContext() {
		this._attachedContext.clear();
	}

	private hasMatchingAttachment(attachment: IChatRequestVariableEntry) {
		return Iterable.some(this._attachedContext, existing => {
			if (existing.id !== attachment.id) {
				return false;
			}

			if (existing.isFile && attachment.isFile) {
				if (!existing.range && !attachment.range) {
					return true;
				}

				if (existing.range && attachment.range) {
					return existing.range.start === attachment.range.start && existing.range.endExclusive === attachment.range.endExclusive;
				}

				return false;
			}

			return false;
		});
	}
}

ChatWidget.CONTRIBS.push(ChatContextAttachments);
