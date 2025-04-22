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
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { Schemas } from '../../../../base/common/network.js';
import { resolveImageEditorAttachContext } from './chatAttachmentResolve.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { equals } from '../../../../base/common/objects.js';

export interface IChatAttachmentChangeEvent {
	readonly deleted: readonly string[];
	readonly added: readonly IChatRequestVariableEntry[];
	readonly updated: readonly IChatRequestVariableEntry[];
}

export class ChatAttachmentModel extends Disposable {
	/**
	 * Collection on prompt instruction attachments.
	 */
	public readonly promptInstructions: ChatPromptAttachmentsCollection;

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService,
		@ISharedWebContentExtractorService private readonly webContentExtractorService: ISharedWebContentExtractorService,
	) {
		super();

		this.promptInstructions = this._register(
			this.initService.createInstance(ChatPromptAttachmentsCollection),
		);
	}

	private _attachments = new Map<string, IChatRequestVariableEntry>();
	get attachments(): ReadonlyArray<IChatRequestVariableEntry> {
		return Array.from(this._attachments.values());
	}

	private _onDidChange = this._register(new Emitter<IChatAttachmentChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	get size(): number {
		return this._attachments.size;
	}

	get fileAttachments(): URI[] {
		return this.attachments.filter(file => file.kind === 'file' && URI.isUri(file.value))
			.map(file => file.value as URI);
	}

	getAttachmentIDs() {
		return new Set(this._attachments.keys());
	}

	clear(): void {
		const deleted = Array.from(this._attachments.keys());
		this._attachments.clear();
		this._onDidChange.fire({ deleted, added: [], updated: [] });
	}

	delete(...variableEntryIds: string[]) {
		const deleted: string[] = [];

		for (const variableEntryId of variableEntryIds) {
			if (this._attachments.delete(variableEntryId)) {
				deleted.push(variableEntryId);
			}
		}

		if (deleted.length > 0) {
			this._onDidChange.fire({ deleted, added: [], updated: [] });
		}
	}

	async addFile(uri: URI, range?: IRange) {
		if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(uri.path)) {
			const context = await this.asImageVariableEntry(uri);
			if (context) {
				this.addContext(context);
			}
			return;
		}

		this.addContext(this.asVariableEntry(uri, range));
	}

	addFolder(uri: URI) {
		this.addContext({
			kind: 'directory',
			value: uri,
			id: uri.toString(),
			name: basename(uri),
		});
	}

	asVariableEntry(uri: URI, range?: IRange): IChatRequestVariableEntry {
		return {
			kind: 'file',
			value: range ? { uri, range } : uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
		};
	}

	// Gets an image variable for a given URI, which may be a file or a web URL
	async asImageVariableEntry(uri: URI): Promise<IChatRequestVariableEntry | undefined> {
		if (uri.scheme === Schemas.file && await this.fileService.canHandleResource(uri)) {
			return await resolveImageEditorAttachContext(this.fileService, this.dialogService, uri);
		} else if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
			const extractedImages = await this.webContentExtractorService.readImage(uri, CancellationToken.None);
			if (extractedImages) {
				return await resolveImageEditorAttachContext(this.fileService, this.dialogService, uri, extractedImages);
			}
		}

		return undefined;
	}

	addContext(...attachments: IChatRequestVariableEntry[]) {
		const added: IChatRequestVariableEntry[] = [];

		for (const attachment of attachments) {
			if (!this._attachments.has(attachment.id)) {
				this._attachments.set(attachment.id, attachment);
				added.push(attachment);
			}
		}

		if (added.length > 0) {
			this._onDidChange.fire({ deleted: [], added, updated: [] });
		}
	}

	clearAndSetContext(...attachments: IChatRequestVariableEntry[]) {
		const deleted = Array.from(this._attachments.keys());
		this._attachments.clear();

		const added: IChatRequestVariableEntry[] = [];
		for (const attachment of attachments) {
			this._attachments.set(attachment.id, attachment);
			added.push(attachment);
		}

		if (deleted.length > 0 || added.length > 0) {
			this._onDidChange.fire({ deleted, added, updated: [] });
		}
	}

	updateContent(toDelete: Iterable<string>, upsert: Iterable<IChatRequestVariableEntry>) {
		const deleted: string[] = [];
		const added: IChatRequestVariableEntry[] = [];
		const updated: IChatRequestVariableEntry[] = [];

		for (const id of toDelete) {
			if (this._attachments.delete(id)) {
				deleted.push(id);
			}
		}

		for (const item of upsert) {
			const oldItem = this._attachments.get(item.id);
			if (!oldItem) {
				this._attachments.set(item.id, item);
				added.push(item);
			} else if (!equals(oldItem, item)) {
				this._attachments.set(item.id, item);
				updated.push(item);
			}
		}

		if (deleted.length > 0 || added.length > 0 || updated.length > 0) {
			this._onDidChange.fire({ deleted, added, updated });
		}
	}
}
