/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';
import * as encoding from 'vs/base/node/encoding';
import * as strings from 'vs/base/common/strings';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Queue } from 'vs/base/common/async';
import { Edit } from 'vs/base/common/jsonFormatter';
import { IReference } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IJSONEditingService, IJSONValue, JSONEditingError, JSONEditingErrorCode } from 'vs/workbench/services/configuration/common/jsonEditing';

export class JSONEditingService implements IJSONEditingService {

	public _serviceBrand: any;

	private queue: Queue<void>;

	constructor(
		@IFileService private fileService: IFileService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@ITextFileService private textFileService: ITextFileService
	) {
		this.queue = new Queue<void>();
	}

	write(resource: URI, value: IJSONValue, save: boolean): TPromise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(resource, value, save)); // queue up writes to prevent race conditions
	}

	private doWriteConfiguration(resource: URI, value: IJSONValue, save: boolean): TPromise<void> {
		return this.resolveAndValidate(resource, save)
			.then(reference => this.writeToBuffer(reference.object.textEditorModel, value));
	}

	private writeToBuffer(model: editorCommon.IModel, value: IJSONValue): TPromise<any> {
		const edit = this.getEdits(model, value)[0];
		if (this.applyEditsToBuffer(edit, model)) {
			return this.textFileService.save(model.uri);
		}
		return TPromise.as(null);
	}

	private applyEditsToBuffer(edit: Edit, model: editorCommon.IModel): boolean {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let currentText = model.getValueInRange(range);
		if (edit.content !== currentText) {
			const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
			model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			return true;
		}
		return false;
	}

	private getEdits(model: editorCommon.IModel, configurationValue: IJSONValue): Edit[] {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const { key, value } = configurationValue;

		// Without key, the entire settings file is being replaced, so we just use JSON.stringify
		if (!key) {
			const content = JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
			return [{
				content,
				length: content.length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), [key], value, { tabSize, insertSpaces, eol });
	}

	private resolveModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		return this.fileService.existsFile(resource)
			.then(exists => {
				const result = exists ? TPromise.as(null) : this.fileService.updateContent(resource, '{}', { encoding: encoding.UTF8 });
				return result.then(() => this.textModelResolverService.createModelReference(resource));
			});
	}

	private hasParseErrors(model: editorCommon.IModel): boolean {
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors, { allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private resolveAndValidate(resource: URI, checkDirty: boolean): TPromise<IReference<ITextEditorModel>> {
		return this.resolveModelReference(resource)
			.then(reference => {
				const model = reference.object.textEditorModel;

				if (this.hasParseErrors(model)) {
					return this.wrapError<IReference<ITextEditorModel>>(JSONEditingErrorCode.ERROR_INVALID_FILE);
				}

				// Target cannot be dirty if not writing into buffer
				if (checkDirty && this.textFileService.isDirty(resource)) {
					return this.wrapError<IReference<ITextEditorModel>>(JSONEditingErrorCode.ERROR_FILE_DIRTY);
				}
				return reference;
			});
	}

	private wrapError<T>(code: JSONEditingErrorCode): TPromise<T> {
		const message = this.toErrorMessage(code);
		return TPromise.wrapError<T>(new JSONEditingError(message, code));
	}

	private toErrorMessage(error: JSONEditingErrorCode): string {
		switch (error) {
			// User issues
			case JSONEditingErrorCode.ERROR_INVALID_FILE: {
				return nls.localize('errorInvalidFile', "Unable to write into the file. Please open the file to correct errors/warnings in the file and try again.");
			};
			case JSONEditingErrorCode.ERROR_FILE_DIRTY: {
				return nls.localize('errorFileDirty', "Unable to write into the file because the file is dirty. Please save the file and try again.");
			};
		}
	}
}