/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { basename } from '../../../../base/common/resources.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatPromptAttachmentsCollection } from './chatAttachmentModel/chatPromptAttachmentsCollection.js';

export class ChatAttachmentModel extends Disposable {
	/**
	 * Collection on prompt instruction attachments.
	 */
	public readonly promptInstructions: ChatPromptAttachmentsCollection;

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
	) {
		super();

		this.promptInstructions = this._register(
			this.initService.createInstance(ChatPromptAttachmentsCollection),
		).onUpdate(() => {
			this._onDidChangeContext.fire();
		});
	}

	private _attachments = new Map<string, IChatRequestVariableEntry>();
	get attachments(): ReadonlyArray<IChatRequestVariableEntry> {
		return Array.from(this._attachments.values());
	}

	protected _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;

	get size(): number {
		return this._attachments.size;
	}

	get fileAttachments(): URI[] {
		return this.attachments.reduce<URI[]>((acc, file) => {
			if (file.isFile && URI.isUri(file.value)) {
				acc.push(file.value);
			}
			return acc;
		}, []);
	}

	getAttachmentIDs() {
		return new Set(this._attachments.keys());
	}

	clear(): void {
		this._attachments.clear();
		this._onDidChangeContext.fire();
	}

	delete(...variableEntryIds: string[]) {
		for (const variableEntryId of variableEntryIds) {
			this._attachments.delete(variableEntryId);
		}
		this._onDidChangeContext.fire();
	}

	addFile(uri: URI, range?: IRange) {
		this.addContext(this.asVariableEntry(uri, range));
	}

	addFolder(uri: URI) {
		this.addContext({
			value: uri,
			id: uri.toString(),
			name: basename(uri),
			isFile: false,
			isDirectory: true,
		});
	}

	asVariableEntry(uri: URI, range?: IRange): IChatRequestVariableEntry {
		return {
			value: range ? { uri, range } : uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
			isFile: true,
		};
	}

	addContext(...attachments: IChatRequestVariableEntry[]) {
		let hasAdded = false;

		for (const attachment of attachments) {
			if (!this._attachments.has(attachment.id)) {
				this._attachments.set(attachment.id, attachment);
				hasAdded = true;
			}
		}

		if (hasAdded) {
			this._onDidChangeContext.fire();
		}
	}

	clearAndSetContext(...attachments: IChatRequestVariableEntry[]) {
		this.clear();
		this.addContext(...attachments);
	}
}
