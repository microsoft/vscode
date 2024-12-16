/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IIdentifiedSingleEditOperation, ITextModel, IValidEditOperation, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { IEditObserver } from './inlineChatStrategies.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IntervalTimer, AsyncIterableSource } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getNWords } from '../../chat/common/chatWordCounter.js';



// --- async edit

export interface AsyncTextEdit {
	readonly range: IRange;
	readonly newText: AsyncIterable<string>;
}

export async function performAsyncTextEdit(model: ITextModel, edit: AsyncTextEdit, progress?: IProgress<IValidEditOperation[]>, obs?: IEditObserver) {

	const [id] = model.deltaDecorations([], [{
		range: edit.range,
		options: {
			description: 'asyncTextEdit',
			stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
		}
	}]);

	let first = true;
	for await (const part of edit.newText) {

		if (model.isDisposed()) {
			break;
		}

		const range = model.getDecorationRange(id);
		if (!range) {
			throw new Error('FAILED to perform async replace edit because the anchor decoration was removed');
		}

		const edit = first
			? EditOperation.replace(range, part) // first edit needs to override the "anchor"
			: EditOperation.insert(range.getEndPosition(), part);
		obs?.start();
		model.pushEditOperations(null, [edit], (undoEdits) => {
			progress?.report(undoEdits);
			return null;
		});
		obs?.stop();
		first = false;
	}
}

export function asProgressiveEdit(interval: IntervalTimer, edit: IIdentifiedSingleEditOperation, wordsPerSec: number, token: CancellationToken): AsyncTextEdit {

	wordsPerSec = Math.max(30, wordsPerSec);

	const stream = new AsyncIterableSource<string>();
	let newText = edit.text ?? '';

	interval.cancelAndSet(() => {
		if (token.isCancellationRequested) {
			return;
		}
		const r = getNWords(newText, 1);
		stream.emitOne(r.value);
		newText = newText.substring(r.value.length);
		if (r.isFullString) {
			interval.cancel();
			stream.resolve();
			d.dispose();
		}

	}, 1000 / wordsPerSec);

	// cancel ASAP
	const d = token.onCancellationRequested(() => {
		interval.cancel();
		stream.resolve();
		d.dispose();
	});

	return {
		range: edit.range,
		newText: stream.asyncIterable
	};
}
