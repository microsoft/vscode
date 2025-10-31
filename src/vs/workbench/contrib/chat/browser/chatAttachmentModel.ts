/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { basename } from '../../../../base/common/resources.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChatRequestFileEntry, IChatRequestVariableEntry, isPromptFileVariableEntry } from '../common/chatVariableEntries.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { Schemas } from '../../../../base/common/network.js';
import { IChatAttachmentResolveService } from './chatAttachmentResolveService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { equals } from '../../../../base/common/objects.js';
import { Iterable } from '../../../../base/common/iterator.js';

export interface IChatAttachmentChangeEvent {
	readonly deleted: readonly string[];
	readonly added: readonly IChatRequestVariableEntry[];
	readonly updated: readonly IChatRequestVariableEntry[];
}

export class ChatAttachmentModel extends Disposable {

	private readonly _attachments = new Map<string, IChatRequestVariableEntry>();

	private _onDidChange = this._register(new Emitter<IChatAttachmentChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ISharedWebContentExtractorService private readonly webContentExtractorService: ISharedWebContentExtractorService,
		@IChatAttachmentResolveService private readonly chatAttachmentResolveService: IChatAttachmentResolveService,
	) {
		super();
	}

	get attachments(): ReadonlyArray<IChatRequestVariableEntry> {
		return Array.from(this._attachments.values());
	}

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

	async addFile(uri: URI, range?: IRange) {
		if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(uri.path)) {
			const context = await this.asImageVariableEntry(uri);
			if (context) {
				this.addContext(context);
			}
			return;
		} else {
			this.addContext(this.asFileVariableEntry(uri, range));
		}
	}

	addFolder(uri: URI) {
		this.addContext({
			kind: 'directory',
			value: uri,
			id: uri.toString(),
			name: basename(uri),
		});
	}

	clear(clearStickyAttachments: boolean = false): void {
		if (clearStickyAttachments) {
			const deleted = Array.from(this._attachments.keys());
			this._attachments.clear();
			this._onDidChange.fire({ deleted, added: [], updated: [] });
		} else {
			const deleted: string[] = [];
			const allIds = Array.from(this._attachments.keys());
			for (const id of allIds) {
				const entry = this._attachments.get(id);
				if (entry && !isPromptFileVariableEntry(entry)) {
					this._attachments.delete(id);
					deleted.push(id);
				}
			}
			this._onDidChange.fire({ deleted, added: [], updated: [] });
		}
	}

	addContext(...attachments: IChatRequestVariableEntry[]) {
		attachments = attachments.filter(attachment => !this._attachments.has(attachment.id));
		this.updateContext(Iterable.empty(), attachments);
	}

	clearAndSetContext(...attachments: IChatRequestVariableEntry[]) {
		this.updateContext(Array.from(this._attachments.keys()), attachments);
	}

	delete(...variableEntryIds: string[]) {
		this.updateContext(variableEntryIds, Iterable.empty());
	}

	updateContext(toDelete: Iterable<string>, upsert: Iterable<IChatRequestVariableEntry>) {
		const deleted: string[] = [];
		const added: IChatRequestVariableEntry[] = [];
		const updated: IChatRequestVariableEntry[] = [];

		for (const id of toDelete) {
			const item = this._attachments.get(id);
			if (item) {
				this._attachments.delete(id);
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

	// ---- create utils

	asFileVariableEntry(uri: URI, range?: IRange): IChatRequestFileEntry {
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
			return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri);
		} else if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
			const extractedImages = await this.webContentExtractorService.readImage(uri, CancellationToken.None);
			if (extractedImages) {
				return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri, extractedImages);
			}
		}

		return undefined;
	}

}
