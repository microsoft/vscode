/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { bufferToStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelContentChangedEvent, IUntitledFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelContentChangedEvent, IStoredFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';

export class TextAreaEditorStoredFileWorkingCopyModelFactory implements IStoredFileWorkingCopyModelFactory<TextAreaEditorStoredFileWorkingCopyModel> {

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) { }

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TextAreaEditorStoredFileWorkingCopyModel> {
		const value = (await streamToBuffer(contents)).toString();

		return this.instantiationService.createInstance(TextAreaEditorStoredFileWorkingCopyModel, resource, value);
	}
}

export class TextAreaEditorUntitledFileWorkingCopyModelFactory implements IUntitledFileWorkingCopyModelFactory<TextAreaEditorUntitledFileWorkingCopyModel> {

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) { }

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TextAreaEditorUntitledFileWorkingCopyModel> {
		const value = (await streamToBuffer(contents)).toString();

		return this.instantiationService.createInstance(TextAreaEditorUntitledFileWorkingCopyModel, resource, value);
	}
}

export abstract class TextAreaEditorFileWorkingCopyModel extends EditorModel implements IFileWorkingCopyModel {

	abstract readonly onDidChangeContent: Event<unknown>;

	private value: string;

	private _versionId = 0;

	get versionId() { return this._versionId; }

	constructor(
		readonly resource: URI,
		contents: string
	) {
		super();

		this.value = contents;
	}

	getValue(): string {
		return this.value;
	}

	async snapshot(token: CancellationToken): Promise<VSBufferReadableStream> {
		return bufferToStream(VSBuffer.fromString(this.value));
	}

	async update(contents: VSBufferReadableStream, token: CancellationToken): Promise<void> {
		const buffer = await streamToBuffer(contents);

		if (token.isCancellationRequested) {
			return;
		}

		this.doUpdate(buffer.toString());
	}

	protected doUpdate(contents: string): void {
		if (this.value === contents) {
			return; // already up to date
		}

		this.value = contents;

		this._versionId++;

		this.fireDidChangeContentEvent();
	}

	protected abstract fireDidChangeContentEvent(): void;
}

export class TextAreaEditorStoredFileWorkingCopyModel extends TextAreaEditorFileWorkingCopyModel implements IStoredFileWorkingCopyModel {

	private readonly _onDidChangeContent = this._register(new Emitter<IStoredFileWorkingCopyModelContentChangedEvent>());
	onDidChangeContent = this._onDidChangeContent.event;

	protected fireDidChangeContentEvent(): void {
		this._onDidChangeContent.fire({ isRedoing: false, isUndoing: false });
	}

	pushStackElement(): void { }
}

export class TextAreaEditorUntitledFileWorkingCopyModel extends TextAreaEditorFileWorkingCopyModel implements IUntitledFileWorkingCopyModel {

	private readonly _onDidChangeContent = this._register(new Emitter<IUntitledFileWorkingCopyModelContentChangedEvent>());
	onDidChangeContent = this._onDidChangeContent.event;

	protected fireDidChangeContentEvent(): void {
		this._onDidChangeContent.fire({ isEmpty: this.getValue().length === 0 });
	}
}
