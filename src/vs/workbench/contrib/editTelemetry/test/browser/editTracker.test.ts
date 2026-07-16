/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { AnnotatedStringEdit, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditKeySourceData, EditSourceData, IDocumentWithAnnotatedEdits } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker } from '../../browser/telemetry/editTracker.js';

suite('DocumentEditSourceTracker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores an initial external edit', () => {
		const document = disposables.add(new TestAnnotatedDocument('initial'));
		const tracker = disposables.add(new DocumentEditSourceTracker(document, undefined));

		document.apply(StringEdit.replace(OffsetRange.ofLength(7), 'external'), EditSources.reloadFromDisk());

		assert.deepStrictEqual(snapshot(tracker), []);
	});

	test('applies queued external edits before the next attributed edit', () => {
		const document = disposables.add(new TestAnnotatedDocument(''));
		const tracker = disposables.add(new DocumentEditSourceTracker(document, undefined));
		const ai = chatEditSource('gpt-5', 'request-1');
		const user = EditSources.cursor({ kind: 'type' });

		document.apply(StringEdit.insert(0, 'abcdef'), ai);
		document.apply(StringEdit.delete(new OffsetRange(2, 4)), EditSources.reloadFromDisk());

		assert.deepStrictEqual(snapshot(tracker), [{
			key: ai.toKey(1),
			delta: 6,
			retained: 6,
			requestId: 'request-1',
		}]);

		document.apply(StringEdit.insert(4, 'X'), user);

		assert.deepStrictEqual(snapshot(tracker), [
			{
				key: ai.toKey(1),
				delta: 6,
				retained: 4,
				requestId: 'request-1',
			},
			{
				key: 'source:cursor-kind:type',
				delta: 1,
				retained: 1,
				requestId: undefined,
			},
			{
				key: 'source:reloadFromDisk',
				delta: 0,
				retained: 0,
				requestId: undefined,
			},
		]);
	});

	test('joins level-one keys but keeps distinct model ids separate', () => {
		const document = disposables.add(new TestAnnotatedDocument(''));
		const tracker = disposables.add(new DocumentEditSourceTracker(document, undefined));
		const gptFirst = chatEditSource('gpt-5', 'request-1');
		const gptSecond = chatEditSource('gpt-5', 'request-2');
		const claude = chatEditSource('claude-sonnet', 'request-3');

		document.apply(StringEdit.insert(0, 'one'), gptFirst);
		document.apply(StringEdit.insert(3, 'two'), gptSecond);
		document.apply(StringEdit.insert(6, 'three'), claude);

		assert.deepStrictEqual(snapshot(tracker), [
			{
				key: claude.toKey(1),
				delta: 5,
				retained: 5,
				requestId: 'request-3',
			},
			{
				key: gptFirst.toKey(1),
				delta: 6,
				retained: 6,
				requestId: 'request-1',
			},
		]);
		assert.strictEqual(gptFirst.toKey(1), gptSecond.toKey(1));
	});
});

class TestAnnotatedDocument extends Disposable implements IDocumentWithAnnotatedEdits<EditKeySourceData> {
	private readonly _value: ISettableObservable<StringText, { edit: AnnotatedStringEdit<EditKeySourceData> }>;
	readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<EditKeySourceData> }>;

	constructor(initialValue: string) {
		super();
		this.value = this._value = observableValue(this, new StringText(initialValue));
	}

	apply(edit: StringEdit, source: TextModelEditSource): void {
		const data = new EditSourceData(source).toEditSourceData();
		this._value.set(edit.applyOnText(this._value.get()), undefined, { edit: edit.mapData(() => data) });
	}

	waitForQueue(): Promise<void> {
		return Promise.resolve();
	}
}

function chatEditSource(modelId: string, requestId: string): TextModelEditSource {
	return EditSources.chatApplyEdits({
		modelId,
		sessionId: 'session-1',
		requestId,
		languageId: 'typescript',
		mode: 'agent',
		extensionId: undefined,
		codeBlockSuggestionId: undefined,
	});
}

function snapshot(tracker: DocumentEditSourceTracker): Array<{ key: string; delta: number; retained: number; requestId: string | undefined }> {
	const retained = new Map<string, number>();
	for (const range of tracker.getTrackedRanges()) {
		retained.set(range.sourceKey, (retained.get(range.sourceKey) ?? 0) + range.range.length);
	}
	return tracker.getAllKeys().map(key => ({
		key,
		delta: tracker.getTotalInsertedCharactersCount(key),
		retained: retained.get(key) ?? 0,
		requestId: tracker.getRepresentative(key)?.props.$$requestId,
	})).sort((a, b) => a.key.localeCompare(b.key));
}
