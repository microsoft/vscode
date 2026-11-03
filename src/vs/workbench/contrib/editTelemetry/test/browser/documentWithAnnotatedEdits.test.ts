/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, ISettableObservable, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AnnotatedStringEdit, StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { computeStringDiffWithMetadata } from '../../../../../editor/common/services/editorWebWorker.js';
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

	test('diffs disk reloads without counting unchanged text between hunks', async () => {
		const context = setup('aaa\nuntouched\nzzz');
		try {
			await timeout(0);
			context.document.apply(StringEdit.replace(OffsetRange.ofLength(17), 'AAA\nuntouched\nZZZ'), EditSources.reloadFromDisk());
			await context.combined.waitForQueue();

			assert.deepStrictEqual(context.changes, [{
				value: 'AAA\nuntouched\nZZZ',
				source: 'external',
				replacements: [
					{ start: 0, endExclusive: 3, newText: 'AAA' },
					{ start: 14, endExclusive: 17, newText: 'ZZZ' },
				],
			}]);
		} finally {
			context.disposables.dispose();
		}
	});

	test('keeps consecutive reload snapshots separate and orders subsequent user edits', async () => {
		const context = setup('aaa\nmiddle\nzzz');
		try {
			await timeout(0);
			context.document.apply(StringEdit.replace(OffsetRange.ofLength(14), 'AAA\nmiddle\nzzz'), EditSources.reloadFromDisk());
			context.document.apply(StringEdit.replace(OffsetRange.ofLength(14), 'AAA\nmiddle\nZZZ'), EditSources.reloadFromDisk());
			context.document.apply(StringEdit.insert(4, 'user '), EditSources.cursor({ kind: 'type' }));
			await context.combined.waitForQueue();

			assert.deepStrictEqual(context.changes, [
				{
					value: 'AAA\nmiddle\nzzz',
					source: 'external',
					replacements: [{ start: 0, endExclusive: 3, newText: 'AAA' }],
				},
				{
					value: 'AAA\nmiddle\nZZZ',
					source: 'external',
					replacements: [{ start: 11, endExclusive: 14, newText: 'ZZZ' }],
				},
				{
					value: 'AAA\nuser middle\nZZZ',
					source: 'user',
					replacements: [{ start: 4, endExclusive: 4, newText: 'user ' }],
				},
			]);
		} finally {
			context.disposables.dispose();
		}
	});

	test('preserves UTF-16 offsets and whitespace changes in CRLF reloads', async () => {
		const before = 'const first = 1;\r\n// \u{1f600}\r\nconst last = 2;';
		const after = '\tconst first = 1;\r\n// \u{1f600}\r\nconst last = 3;';
		const context = setup(before);
		try {
			await timeout(0);
			context.document.apply(StringEdit.replace(OffsetRange.ofLength(before.length), after), EditSources.reloadFromDisk());
			await context.combined.waitForQueue();

			assert.deepStrictEqual(context.changes, [{
				value: after,
				source: 'external',
				replacements: [
					{ start: 0, endExclusive: 0, newText: '\t' },
					{ start: before.indexOf('2'), endExclusive: before.indexOf('2') + 1, newText: '3' },
				],
			}]);
		} finally {
			context.disposables.dispose();
		}
	});

	test('queue barriers capture synchronous edits and run before post-boundary changes', async () => {
		const started = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const context = setup('aaa\nzzz', async (original, modified) => {
			started.complete();
			await release.p;
			return computeStringDiffWithMetadata(original, modified, { maxComputationTimeMs: 500 }, 'advanced');
		});
		try {
			context.document.apply(StringEdit.replace(OffsetRange.ofLength(7), 'AAA\nZZZ'), EditSources.reloadFromDisk());
			await started.p;
			context.document.apply(StringEdit.insert(4, 'user'), EditSources.cursor({ kind: 'type' }));
			let boundaryValue: string | undefined;
			const drained = context.combined.waitForQueue(() => {
				boundaryValue = context.combined.value.get().value;
			});
			context.document.apply(StringEdit.insert(8, 'later'), EditSources.cursor({ kind: 'type' }));
			release.complete();
			await drained;
			await context.combined.waitForQueue();

			assert.deepStrictEqual({
				boundaryValue,
				publishedValues: context.changes.map(change => change.value),
			}, {
				boundaryValue: 'AAA\nuserZZZ',
				publishedValues: ['AAA\nZZZ', 'AAA\nuserZZZ', 'AAA\nuserlaterZZZ'],
			});
		} finally {
			release.complete();
			context.disposables.dispose();
		}
	});

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

function setup(initialValue: string, computeDiff: DiffService['computeDiff'] = async (original, modified) => computeStringDiffWithMetadata(original, modified, { maxComputationTimeMs: 500 }, 'advanced')) {
	const disposables = new DisposableStore();
	const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
	instantiationService.stubInstance(DiffService, { computeDiff });
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
	return { disposables, document, combined, changes };
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

	waitForQueue(onDrained?: () => void | Promise<void>): Promise<void> {
		return Promise.resolve(onDrained?.());
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
