/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IChatEditingService } from '../common/chatEditingService.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';

export class ChatAttachmentModel extends Disposable {
	private _attachments = new Map<string, IChatRequestVariableEntry>();
	get attachments(): ReadonlyArray<IChatRequestVariableEntry> {
		return Array.from(this._attachments.values());
	}

	protected _onDidChangeContext = this._register(new Emitter<void>());
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

	delete(...variableEntryIds: string[]) {
		for (const variableEntryId of variableEntryIds) {
			this._attachments.delete(variableEntryId);
		}
		this._onDidChangeContext.fire();
	}

	addFile(uri: URI, range?: IRange) {
		this.addContext(this.asVariableEntry(uri, range));
	}

	asVariableEntry(uri: URI, range?: IRange): IChatRequestVariableEntry {
		return {
			value: range ? { uri, range } : uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
			isFile: true,
			isDynamic: true
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

export class EditsAttachmentModel extends ChatAttachmentModel {

	private _onFileLimitExceeded = this._register(new Emitter<void>());
	readonly onFileLimitExceeded = this._onFileLimitExceeded.event;

	get fileAttachments() {
		return this.attachments.filter(attachment => attachment.isFile);
	}

	private readonly _excludedFileAttachments: IChatRequestVariableEntry[] = [];
	get excludedFileAttachments(): IChatRequestVariableEntry[] {
		return this._excludedFileAttachments;
	}

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
	) {
		super();
	}

	private isExcludeFileAttachment(fileAttachmentId: string) {
		return this._excludedFileAttachments.some(attachment => attachment.id === fileAttachmentId);
	}

	override addContext(...attachments: IChatRequestVariableEntry[]) {
		const currentAttachmentIds = this.getAttachmentIDs();
		const fileAttachments = attachments.filter(attachment => attachment.isFile);
		const otherAttachments = attachments.filter(attachment => !attachment.isFile);

		// deduplicate file attachments
		const newFileAttachments = [];
		const newFileAttachmentIds = new Set<string>();
		for (const attachment of fileAttachments) {
			if (newFileAttachmentIds.has(attachment.id) || currentAttachmentIds.has(attachment.id)) {
				continue;
			}
			newFileAttachmentIds.add(attachment.id);
			newFileAttachments.push(attachment);
		}

		const availableFileCount = Math.max(0, this._chatEditingService.editingSessionFileLimit - this.fileAttachments.length);
		const fileAttachmentsToBeAdded = newFileAttachments.slice(0, availableFileCount);

		if (newFileAttachments.length > availableFileCount) {
			const attachmentsExceedingSize = newFileAttachments.slice(availableFileCount).filter(attachment => !this.isExcludeFileAttachment(attachment.id));
			this._excludedFileAttachments.push(...attachmentsExceedingSize);
			this._onDidChangeContext.fire();
			this._onFileLimitExceeded.fire();
		}

		super.addContext(...otherAttachments, ...fileAttachmentsToBeAdded);
	}

	override clear(): void {
		this._excludedFileAttachments.splice(0, this._excludedFileAttachments.length);
		super.clear();
	}

	override delete(...variableEntryIds: string[]) {
		for (const variableEntryId of variableEntryIds) {
			const excludedFileIndex = this._excludedFileAttachments.findIndex(attachment => attachment.id === variableEntryId);
			if (excludedFileIndex !== -1) {
				this._excludedFileAttachments.splice(excludedFileIndex, 1);
			}
		}

		super.delete(...variableEntryIds);

		if (this.fileAttachments.length < this._chatEditingService.editingSessionFileLimit) {
			const availableFileCount = Math.max(0, this._chatEditingService.editingSessionFileLimit - this.fileAttachments.length);
			const reAddAttachments = this._excludedFileAttachments.splice(0, availableFileCount);
			super.addContext(...reAddAttachments);
		}
	}
}
