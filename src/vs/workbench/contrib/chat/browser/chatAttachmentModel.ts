/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';

export class ChatAttachmentModel extends Disposable {
	private _attachments = new Map<string, IChatRequestVariableEntry>();
	get attachments(): ReadonlyArray<IChatRequestVariableEntry> {
		return Array.from(this._attachments.values());
	}

	private _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	get size(): number {
		return this._attachments.size;
	}

	getAttachmentIDs() {
		return new Set(this._attachments.keys());
	}

	clear(): void {
		this._attachments.clear();
		this._onDidChangeContext.fire();
	}

	delete(variableEntryId: string) {
		this._attachments.delete(variableEntryId);
		this._onDidChangeContext.fire();
	}

	addFile(uri: URI, range?: IRange) {
		this.addContext(this.asVariableEntry(uri, range));
	}

	asVariableEntry(uri: URI, range?: IRange) {
		return {
			value: uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
			isFile: true,
			isDynamic: true
		};
	}

	addContext(...attachments: IChatRequestVariableEntry[]) {
		for (const attachment of attachments) {
			if (!this._attachments.has(attachment.id)) {
				this._attachments.set(attachment.id, attachment);
			}
		}

		this._onDidChangeContext.fire();
	}

	clearAndSetContext(...attachments: IChatRequestVariableEntry[]) {
		this.clear();
		this.addContext(...attachments);
	}
}
