/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IFileWorkingCopyModel, IFileWorkingCopyModelContentChangedEvent, IFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { newWriteableBufferStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';

export class TestFileWorkingCopyModel extends Disposable implements IFileWorkingCopyModel {

	private readonly _onDidChangeContent = this._register(new Emitter<IFileWorkingCopyModelContentChangedEvent>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(readonly resource: URI, public contents: string) {
		super();
	}

	fireContentChangeEvent(event: IFileWorkingCopyModelContentChangedEvent): void {
		this._onDidChangeContent.fire(event);
	}

	updateContents(newContents: string): void {
		this.contents = newContents;
		this.versionId++;

		this._onDidChangeContent.fire({ isRedoing: false, isUndoing: false });
	}

	async snapshot(token: CancellationToken): Promise<VSBufferReadableStream> {
		const stream = newWriteableBufferStream();
		stream.end(VSBuffer.fromString(this.contents));

		return stream;
	}

	async update(contents: VSBufferReadableStream, token: CancellationToken): Promise<void> {
		this.contents = (await streamToBuffer(contents)).toString();
	}

	versionId = 0;

	getAlternativeVersionId(): number {
		return this.versionId;
	}

	pushStackElement(): void { }

	dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}

export class TestFileWorkingCopyModelFactory implements IFileWorkingCopyModelFactory<TestFileWorkingCopyModel> {

	async createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<TestFileWorkingCopyModel> {
		return new TestFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
	}
}

suite('FileWorkingCopy', () => {


});
