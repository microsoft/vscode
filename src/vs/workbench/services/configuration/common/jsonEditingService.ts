/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import * as json from '../../../../base/common/json.js';
import { setProperty } from '../../../../base/common/jsonEdit.js';
import { Queue } from '../../../../base/common/async.js';
import { Edit } from '../../../../base/common/jsonFormatter.js';
import { IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../editor/common/services/resolverService.js';
import { IJSONEditingService, IJSONValue, JSONEditingError, JSONEditingErrorCode } from './jsonEditing.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';

export class JSONEditingService implements IJSONEditingService {

	public _serviceBrand: undefined;

	private queue: Queue<void>;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		this.queue = new Queue<void>();
	}

	write(resource: URI, values: IJSONValue[]): Promise<void> {
		return Promise.resolve(this.queue.queue(() => this.doWriteConfiguration(resource, values))); // queue up writes to prevent race conditions
	}

	private async doWriteConfiguration(resource: URI, values: IJSONValue[]): Promise<void> {
		const reference = await this.resolveAndValidate(resource, true);
		try {
			await this.writeToBuffer(reference.object.textEditorModel, values);
		} finally {
			reference.dispose();
		}
	}

	private async writeToBuffer(model: ITextModel, values: IJSONValue[]): Promise<URI | undefined> {
		let disposable: IDisposable | undefined;
		try {
			// Optimization: we apply edits to a text model and save it
			// right after. Use the files config service to signal this
			// to the workbench to optimise the UI during this operation.
			// For example, avoids to briefly show dirty indicators.
			disposable = this.filesConfigurationService.enableAutoSaveAfterShortDelay(model.uri);

			let hasEdits: boolean = false;
			for (const value of values) {
				const edit = this.getEdits(model, value)[0];
				hasEdits = (!!edit && this.applyEditsToBuffer(edit, model)) || hasEdits;
			}
			if (hasEdits) {
				return this.textFileService.save(model.uri);
			}
		} finally {
			disposable?.dispose();
		}

		return undefined;
	}

	private applyEditsToBuffer(edit: Edit, model: ITextModel): boolean {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		const currentText = model.getValueInRange(range);
		if (edit.content !== currentText) {
			const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
			model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			return true;
		}
		return false;
	}

	private getEdits(model: ITextModel, configurationValue: IJSONValue): Edit[] {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const { path, value } = configurationValue;

		// With empty path the entire file is being replaced, so we just use JSON.stringify
		if (!path.length) {
			const content = JSON.stringify(value, null, insertSpaces ? ' '.repeat(tabSize) : '\t');
			return [{
				content,
				length: content.length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), path, value, { tabSize, insertSpaces, eol });
	}

	private async resolveModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		const exists = await this.fileService.exists(resource);
		if (!exists) {
			await this.textFileService.write(resource, '{}', { encoding: 'utf8' });
		}
		return this.textModelResolverService.createModelReference(resource);
	}

	private hasParseErrors(model: ITextModel): boolean {
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
		return parseErrors.length > 0;
	}

	private async resolveAndValidate(resource: URI, checkDirty: boolean): Promise<IReference<IResolvedTextEditorModel>> {
		const reference = await this.resolveModelReference(resource);

		const model = reference.object.textEditorModel;

		if (this.hasParseErrors(model)) {
			reference.dispose();
			return this.reject<IReference<IResolvedTextEditorModel>>(JSONEditingErrorCode.ERROR_INVALID_FILE);
		}

		return reference;
	}

	private reject<T>(code: JSONEditingErrorCode): Promise<T> {
		const message = this.toErrorMessage(code);
		return Promise.reject(new JSONEditingError(message, code));
	}

	private toErrorMessage(error: JSONEditingErrorCode): string {
		switch (error) {
			// User issues
			case JSONEditingErrorCode.ERROR_INVALID_FILE: {
				return nls.localize('errorInvalidFile', "Unable to write into the file. Please open the file to correct errors/warnings in the file and try again.");
			}
		}
	}
}

registerSingleton(IJSONEditingService, JSONEditingService, InstantiationType.Delayed);
