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
		return this.attachments.filter(file => file.kind === 'file' && URI.isUri(file.value))
			.map(file => file.value as URI);
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
