/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, ISettableObservable, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AnnotatedStringEdit, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CombineStreamedChanges, DiffService, EditSourceData, IDocumentWithAnnotatedEdits, MinimizeEditsProcessor } from '../../browser/helpers/documentWithAnnotatedEdits.js';

suite('Documents with Annotated Edits', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('collapses streamed chat edits into one diff', () => runWithFakedTimers({}, async () => {
		const context = setup('');
		const source = chatEdit();
		await timeout(0);

		context.document.apply(StringEdit.insert(0, 'a'), source);
		await timeout(500);
		context.document.apply(StringEdit.insert(1, 'b'), source);
		await timeout(1100);

		assert.deepStrictEqual(context.changes, [{
			value: 'ab',
			source: 'ai/chat/sidebar',
			replacements: [{ start: 0, endExclusive: 0, newText: 'ab' }],
		}]);
		context.disposables.dispose();
	}));

	test('preserves ordering when a user edit interrupts streamed chat edits', () => runWithFakedTimers({}, async () => {
		const context = setup('');
		await timeout(0);

		context.document.apply(StringEdit.insert(0, 'a'), chatEdit());
		await timeout(500);
		context.document.apply(StringEdit.insert(1, 'U'), EditSources.cursor({ kind: 'type' }));
		await timeout(1100);

		assert.deepStrictEqual(context.changes, [
			{
				value: 'a',
				source: 'ai/chat/sidebar',
				replacements: [{ start: 0, endExclusive: 0, newText: 'a' }],
			},
			{
				value: 'aU',
				source: 'user',
				replacements: [{ start: 1, endExclusive: 1, newText: 'U' }],
			},
		]);
		context.disposables.dispose();
	}));

	test('minimizes common prefixes and suffixes', () => {
		const disposables = new DisposableStore();
		const document = disposables.add(new TestSourceDocument('hello world'));
		const minimized = disposables.add(new MinimizeEditsProcessor(document));
		const changes: Array<{ value: string; replacements: Array<{ start: number; endExclusive: number; newText: string }> }> = [];
		disposables.add(runOnChange(minimized.value, (value, _previous, edits) => {
			const edit = AnnotatedStringEdit.compose(edits.map(change => change.edit));
			changes.push({
				value: value.value,
				replacements: edit.replacements.map(replacement => ({
					start: replacement.replaceRange.start,
					endExclusive: replacement.replaceRange.endExclusive,
					newText: replacement.newText,
				})),
			});
		}));

		document.apply(StringEdit.replace(OffsetRange.ofLength(11), 'hello brave world'), chatEdit());

		assert.deepStrictEqual(changes, [{
			value: 'hello brave world',
			replacements: [{ start: 5, endExclusive: 5, newText: ' brave' }],
		}]);
		disposables.dispose();
	});
});

function setup(initialValue: string) {
	const disposables = new DisposableStore();
	const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
	instantiationService.stubInstance(DiffService, {
		computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced'),
	});
	const document = disposables.add(new TestSourceDocument(initialValue));
	const combined = disposables.add(instantiationService.createInstance(CombineStreamedChanges<EditSourceData>, document));
	const changes: Array<{ value: string; source: string; replacements: Array<{ start: number; endExclusive: number; newText: string }> }> = [];
	disposables.add(runOnChange(combined.value, (value, _previous, edits) => {
		const edit = AnnotatedStringEdit.compose(edits.map(change => change.edit));
		changes.push({
			value: value.value,
			source: edit.replacements[0]?.data.source.toString(),
			replacements: edit.replacements.map(replacement => ({
				start: replacement.replaceRange.start,
				endExclusive: replacement.replaceRange.endExclusive,
				newText: replacement.newText,
			})),
		});
	}));
	return { disposables, document, changes };
}

class TestSourceDocument extends Disposable implements IDocumentWithAnnotatedEdits<EditSourceData> {
	private readonly _value: ISettableObservable<StringText, { edit: AnnotatedStringEdit<EditSourceData> }>;
	readonly value: IObservableWithChange<StringText, { edit: AnnotatedStringEdit<EditSourceData> }>;

	constructor(initialValue: string) {
		super();
		this.value = this._value = observableValue(this, new StringText(initialValue));
	}

	apply(edit: StringEdit, source: TextModelEditSource): void {
		const data = new EditSourceData(source);
		this._value.set(edit.applyOnText(this._value.get()), undefined, { edit: edit.mapData(() => data) });
	}

	waitForQueue(): Promise<void> {
		return Promise.resolve();
	}
}

function chatEdit(): TextModelEditSource {
	return EditSources.chatApplyEdits({
		modelId: undefined,
		sessionId: 'session-1',
		requestId: 'request-1',
		languageId: 'typescript',
		mode: 'agent',
		extensionId: undefined,
		codeBlockSuggestionId: undefined,
	});
}
