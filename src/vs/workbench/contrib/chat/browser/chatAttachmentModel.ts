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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatInstructionAttachmentsModel } from './chatAttachmentModel/chatInstructionAttachmentsModel.js';

export class ChatAttachmentModel extends Disposable {
	/**
	 * Collection on prompt instruction attachments.
	 */
	public readonly promptInstructions: ChatInstructionAttachmentsModel;

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
	) {
		super();

		this.promptInstructions = this._register(
			this.initService.createInstance(ChatInstructionAttachmentsModel),
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

	asVariableEntry(uri: URI, range?: IRange, isMarkedReadonly?: boolean): IChatRequestVariableEntry {
		return {
			value: range ? { uri, range } : uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
			isFile: true,
			isMarkedReadonly,
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
		@IInstantiationService _initService: IInstantiationService,
	) {
		super(_initService);
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

		super.addContext(...otherAttachments, ...newFileAttachments);
	}

	override clear(): void {
		this._excludedFileAttachments.splice(0, this._excludedFileAttachments.length);
		super.clear();
	}
}
