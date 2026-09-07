/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { CharCode } from '../../../../base/common/charCode.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { isHighSurrogate, isLowSurrogate } from '../../../../base/common/strings.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';

export interface ILargeFileStreamPage {
	readonly value: string;
	readonly isLast: boolean;
}

export class LargeFileStreamReader extends Disposable {

	private readonly listeners = this._register(new DisposableStore());

	private started = false;
	private ended = false;
	private streamError: Error | undefined;
	private remainder = '';
	private pendingRead: {
		readonly targetLength: number;
		readonly chunks: string[];
		length: number;
		readonly resolve: (page: ILargeFileStreamPage) => void;
		readonly reject: (error: Error) => void;
	} | undefined;
	private disposed = false;

	constructor(private readonly stream: ReadableStream<string>) {
		super();
		this._register(toDisposable(() => stream.destroy()));
	}

	readPage(targetLength: number): Promise<ILargeFileStreamPage> {
		if (this.disposed) {
			return Promise.reject(new CancellationError());
		}
		if (this.pendingRead) {
			throw new Error('Cannot read more than one large file page at a time');
		}
		if (this.streamError) {
			return Promise.reject(this.streamError);
		}

		return new Promise<ILargeFileStreamPage>((resolve, reject) => {
			this.pendingRead = { targetLength, chunks: [], length: 0, resolve, reject };
			this.consumeRemainder();

			if (!this.pendingRead) {
				return;
			}
			if (this.ended) {
				this.resolvePendingRead();
			} else if (!this.started) {
				this.started = true;
				this.registerListeners();
			} else {
				this.stream.resume();
			}
		});
	}

	private registerListeners(): void {
		const onError = (error: Error) => {
			this.streamError = error;
			this.pendingRead?.reject(error);
			this.pendingRead = undefined;
			this.stream.destroy();
		};
		const onEnd = () => {
			this.ended = true;
			this.consumeRemainder();
			this.resolvePendingRead();
		};
		const onData = (value: string) => this.acceptData(value);

		this.listeners.add(toDisposable(() => this.stream.removeListener('error', onError)));
		this.stream.on('error', onError);
		this.listeners.add(toDisposable(() => this.stream.removeListener('end', onEnd)));
		this.stream.on('end', onEnd);
		this.listeners.add(toDisposable(() => this.stream.removeListener('data', onData)));
		this.stream.on('data', onData);
	}

	private consumeRemainder(): void {
		if (!this.pendingRead || this.remainder.length === 0) {
			return;
		}

		const remainder = this.remainder;
		this.remainder = '';
		this.acceptData(remainder);
	}

	private acceptData(value: string): void {
		const pendingRead = this.pendingRead;
		if (!pendingRead) {
			this.remainder += value;
			this.stream.pause();
			return;
		}

		if (this.remainder.length > 0) {
			value = this.remainder + value;
			this.remainder = '';
		}

		const remainingLength = pendingRead.targetLength - pendingRead.length;
		const candidateLength = Math.min(value.length, remainingLength);
		let acceptedLength = candidateLength;
		let deferredBoundary = false;
		if (acceptedLength > 0) {
			const lastCodeUnit = value.charCodeAt(acceptedLength - 1);
			if (acceptedLength < value.length) {
				const nextCodeUnit = value.charCodeAt(acceptedLength);
				if (
					(isHighSurrogate(lastCodeUnit) && isLowSurrogate(nextCodeUnit)) ||
					(lastCodeUnit === CharCode.CarriageReturn && nextCodeUnit === CharCode.LineFeed)
				) {
					acceptedLength--;
					deferredBoundary = true;
				}
			} else if (!this.ended && (isHighSurrogate(lastCodeUnit) || lastCodeUnit === CharCode.CarriageReturn)) {
				acceptedLength--;
				deferredBoundary = true;
			}
		}

		if (deferredBoundary && acceptedLength === 0 && pendingRead.length === 0 && candidateLength < value.length) {
			acceptedLength = candidateLength + 1;
			deferredBoundary = false;
		}

		if (acceptedLength > 0) {
			pendingRead.chunks.push(value.substring(0, acceptedLength));
			pendingRead.length += acceptedLength;
		}
		if (acceptedLength < value.length) {
			this.remainder = value.substring(acceptedLength);
		}

		if (pendingRead.length >= pendingRead.targetLength || (deferredBoundary && pendingRead.length > 0)) {
			this.stream.pause();
			this.resolvePendingRead();
		}
	}

	private resolvePendingRead(): void {
		const pendingRead = this.pendingRead;
		if (!pendingRead) {
			return;
		}

		this.pendingRead = undefined;
		pendingRead.resolve({
			value: pendingRead.chunks.join(''),
			isLast: this.ended && this.remainder.length === 0
		});
	}

	override dispose(): void {
		this.disposed = true;
		this.pendingRead?.reject(new CancellationError());
		this.pendingRead = undefined;
		super.dispose();
	}
}

export interface ILargeFileEditorModelLoadResult {
	readonly removedLineCount: number;
	readonly isComplete: boolean;
	readonly stoppedAtLongLine: boolean;
}

export class LargeFileEditorModel extends Disposable {

	private loadPromise: Promise<ILargeFileEditorModelLoadResult> | undefined;
	private complete: boolean;
	private stoppedAtLongLine = false;
	private disposed = false;
	private _baseLineNumber = 1;

	get baseLineNumber(): number {
		return this._baseLineNumber;
	}

	get isComplete(): boolean {
		return this.complete || this.stoppedAtLongLine;
	}

	constructor(
		readonly textEditorModel: ITextModel,
		private readonly reader: LargeFileStreamReader,
		initialPageIsLast: boolean,
		private readonly pageLength: number,
		private readonly maximumModelLength: number
	) {
		super();
		this.complete = initialPageIsLast;
		this._register(textEditorModel);
		this._register(reader);
	}

	loadMore(): Promise<ILargeFileEditorModelLoadResult> {
		if (this.complete || this.stoppedAtLongLine) {
			return Promise.resolve({
				removedLineCount: 0,
				isComplete: this.isComplete,
				stoppedAtLongLine: this.stoppedAtLongLine
			});
		}

		if (!this.loadPromise) {
			this.loadPromise = this.doLoadMore().finally(() => this.loadPromise = undefined);
		}

		return this.loadPromise;
	}

	private async doLoadMore(): Promise<ILargeFileEditorModelLoadResult> {
		const page = await this.reader.readPage(this.pageLength);
		if (this.disposed) {
			throw new CancellationError();
		}

		this.complete = page.isLast;
		if (page.value.length > 0) {
			const lastLineNumber = this.textEditorModel.getLineCount();
			const endPosition = new Position(lastLineNumber, this.textEditorModel.getLineMaxColumn(lastLineNumber));
			this.textEditorModel.applyEdits([{ range: Range.fromPositions(endPosition), text: page.value }]);
		}

		const removedLineCount = this.trimModel();
		return {
			removedLineCount,
			isComplete: this.isComplete,
			stoppedAtLongLine: this.stoppedAtLongLine
		};
	}

	private trimModel(): number {
		const modelLength = this.textEditorModel.getValueLength();
		if (modelLength <= this.maximumModelLength) {
			return 0;
		}

		const targetPosition = this.textEditorModel.getPositionAt(modelLength - this.maximumModelLength);
		const firstRetainedLine = targetPosition.column === 1 ? targetPosition.lineNumber : targetPosition.lineNumber + 1;
		if (firstRetainedLine > this.textEditorModel.getLineCount()) {
			this.stoppedAtLongLine = true;
			this.reader.dispose();
			return 0;
		}

		const removedLineCount = firstRetainedLine - 1;
		this.textEditorModel.applyEdits([{
			range: new Range(1, 1, firstRetainedLine, 1),
			text: ''
		}]);
		this._baseLineNumber += removedLineCount;

		return removedLineCount;
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}
