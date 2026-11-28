/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { getMediaOrTextMime, Mimes } from '../../../../../base/common/mime.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize } from '../../../../../nls.js';
import { ByteSize, FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ILanguageModelIgnoredFilesService } from '../ignoredFiles.js';
import { IChatRequestVariableEntry, OmittedState } from './chatVariableEntries.js';

// Leave room for base64 expansion and the rest of the message on the cloud relay.
const maxSnapshotBytes = 16 * ByteSize.MB;

export class ChatFileAttachmentSnapshots {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ILanguageModelIgnoredFilesService private readonly ignoredFilesService: ILanguageModelIgnoredFilesService,
	) { }

	async prepare(entries: readonly IChatRequestVariableEntry[], token: CancellationToken): Promise<IChatRequestVariableEntry[]> {
		const result: IChatRequestVariableEntry[] = [];
		let remaining = maxSnapshotBytes;
		for (const entry of entries) {
			const uri = entry.kind === 'file' ? IChatRequestVariableEntry.toUri(entry) : undefined;
			if (entry.kind !== 'file' || (!entry.snapshot && uri?.scheme !== Schemas.file)) {
				result.push(entry);
				continue;
			}
			try {
				if (entry.omittedState === OmittedState.Full || (uri && await this.ignoredFilesService.fileIsIgnored(uri, token))) {
					throw new Error(localize('chat.fileSnapshot.excluded', "This file is excluded from chat context."));
				}
				if (entry.snapshot) {
					const data = entry.snapshot.data;
					remaining -= data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
					if (remaining < 0) {
						throw this.tooLarge();
					}
					result.push(entry);
					continue;
				}
				if (!uri) {
					throw new Error(localize('chat.fileSnapshot.noResource', "The file location is no longer available."));
				}
				const selection = isLocation(entry.value) ? entry.value.range : undefined;
				const model = this.textFileService.files.get(uri);
				let bytes: VSBuffer;
				if (selection) {
					const textModel = model?.textEditorModel ?? (await this.textFileService.files.resolve(uri)).textEditorModel;
					if (!textModel) {
						throw new Error(localize('chat.fileSnapshot.noSelection', "The selected text is no longer available."));
					}
					bytes = this.textSnapshot(textModel, selection, remaining);
				} else if (model?.isDirty()) {
					bytes = this.textSnapshot(model.textEditorModel, undefined, remaining);
				} else {
					bytes = (await this.fileService.readFile(uri, { limits: { size: remaining } }, token)).value;
				}
				if (bytes.byteLength > remaining) {
					throw this.tooLarge();
				}
				remaining -= bytes.byteLength;
				result.push({ ...entry, snapshot: { data: encodeBase64(bytes), contentType: selection ? Mimes.text : getMediaOrTextMime(uri.path) ?? Mimes.binary, ...(selection ? { selection } : {}) } });
			} catch (error) {
				if (isCancellationError(error)) {
					throw error;
				}
				const cause = error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE ? this.tooLarge() : error;
				throw new Error(localize('chat.fileSnapshot.failed', "Could not attach {0}: {1}", entry.name, toErrorMessage(cause)));
			}
		}
		return result;
	}

	private textSnapshot(model: ITextModel, range: IRange | undefined, remaining: number): VSBuffer {
		if ((range ? model.getValueLengthInRange(range) : model.getValueLength()) > remaining) {
			throw this.tooLarge();
		}
		return VSBuffer.fromString(range ? model.getValueInRange(range) : model.getValue());
	}

	private tooLarge(): Error {
		return new Error(localize('chat.fileSnapshot.tooLarge', "Device file attachments must total no more than {0} MB per message.", maxSnapshotBytes / ByteSize.MB));
	}
}
