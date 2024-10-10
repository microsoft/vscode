/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { generateFocusedWindowScreenshot } from '../../../../platform/screenshot/browser/screenshot.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';

export class ChatAttachmentModel extends Disposable {
	constructor(
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
	) {
		super();
	}
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
		this.addContext({
			value: uri,
			id: uri.toString() + (range?.toString() ?? ''),
			name: basename(uri),
			isFile: true,
			isDynamic: true
		});
	}

	addContext(...attachments: IChatRequestVariableEntry[]) {
		for (const attachment of attachments) {
			if (!this._attachments.has(attachment.id)) {
				this._attachments.set(attachment.id, attachment);
			}
		}

		this._onDidChangeContext.fire();
	}

	async attachScreenshot(): Promise<void> {
		this.clear();
		const screenshot = await generateFocusedWindowScreenshot(this._fileService, this._environmentService);
		if (!screenshot) {
			return;
		}
		this.addContext(screenshot);
	}

	clearAndSetContext(...attachments: IChatRequestVariableEntry[]) {
		this.clear();
		this.addContext(...attachments);
	}
}
