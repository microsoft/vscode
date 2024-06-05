/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IObservable, derivedHandleChanges } from 'vs/base/common/observable';
import { testingClearObservableNamingCache } from 'vs/base/common/observableInternal/debugName';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { obsCodeEditor } from 'vs/editor/browser/observableUtilities';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';

suite('CodeEditorWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function withTestFixture(cb: (args: { editor: ICodeEditor; viewModel: ViewModel; log: Log; derived: IObservable<string> }) => void) {
		withEditorSetupTestFixture(undefined, cb);
	}

	function withEditorSetupTestFixture(
		preSetupCallback: ((editor: ICodeEditor, disposables: DisposableStore) => void) | undefined,
		cb: (args: { editor: ICodeEditor; viewModel: ViewModel; log: Log; derived: IObservable<string> }) => void,
	) {
		testingClearObservableNamingCache();
		withTestCodeEditor('hello world', {}, (editor, viewModel) => {

			const disposables = new DisposableStore();

			preSetupCallback?.(editor, disposables);

			const obsEditor = obsCodeEditor(editor);

			const log = new Log();

			const derived = derivedHandleChanges({
				createEmptyChangeSummary: () => undefined,
				handleChange: (context, changeSummary) => {
					const formattedChange = JSON.stringify(
						context.change,
						(key, value) => {
							if (value instanceof Range) {
								return value.toString();
							}
							if (value === false || Array.isArray(value) && value.length === 0) { return undefined; }
							return value;
						}
					);
					log.log(`handle change ${context.changedObservable.toString()} ${formattedChange}`);
					return true;
				},
			}, reader => {
				const versionId = obsEditor.versionId.read(reader);
				const selection = obsEditor.selections.read(reader)?.map(s => s.toString()).join(', ');
				obsEditor.onDidType.read(reader);

				const str = `running derived -> selection: ${selection}, value: ${versionId}`;
				log.log(str);
				return str;
			});

			derived.recomputeInitiallyAndOnChange(disposables);

			assert.deepStrictEqual(log.getAndClearEntries(), (["running derived -> selection: [1,1 -> 1,1], value: 1"]));

			cb({ editor, viewModel, log, derived });

			disposables.dispose();
		});
	}

	test('setPosition', () => withTestFixture(({ editor, log }) => {
		editor.setPosition(new Position(1, 2));

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'handle change ObservableCodeEditor._selections: [1,2 -> 1,2] {"selection":"[1,2 -> 1,2]","modelVersionId":1,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"api","reason":0}',
			"running derived -> selection: [1,2 -> 1,2], value: 1",
		]);
	}));

	test('keyboard.type', () => withTestFixture(({ editor, log }) => {
		editor.trigger('keyboard', 'type', { text: 'abc' });

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'handle change ObservableCodeEditor.onDidType "abc"',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3}',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4}',
			'handle change ObservableCodeEditor._selections: [1,4 -> 1,4] {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
			"running derived -> selection: [1,4 -> 1,4], value: 4",
		]);
	}));

	test('keyboard.type and set position', () => withTestFixture(({ editor, log }) => {
		editor.trigger('keyboard', 'type', { text: 'abc' });

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'handle change ObservableCodeEditor.onDidType "abc"',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3}',
			'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4}',
			'handle change ObservableCodeEditor._selections: [1,4 -> 1,4] {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
			"running derived -> selection: [1,4 -> 1,4], value: 4",
		]);

		editor.setPosition(new Position(1, 5), 'test');

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'handle change ObservableCodeEditor._selections: [1,5 -> 1,5] {"selection":"[1,5 -> 1,5]","modelVersionId":4,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":4,"source":"test","reason":0}',
			"running derived -> selection: [1,5 -> 1,5], value: 4",
		]);
	}));

	test('listener interaction', () => {
		let derived: IObservable<string, unknown>;
		let log: Log;
		let force = false;
		withEditorSetupTestFixture(
			(editor, disposables) => {
				disposables.add(editor.onDidChangeModelContent(() => {
					if (force) {
						log.log('>>> before forceUpdate');
						obsCodeEditor(editor).forceUpdate();
					}
					log.log('>>> before get');
					derived.get();
					log.log('<<< after get');
				}));
			},
			(args) => {
				const editor = args.editor;
				derived = args.derived;
				log = args.log;

				editor.trigger("keyboard", "type", { text: "a" });
				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before get",
					"<<< after get",
					'handle change ObservableCodeEditor.onDidType "a"',
					'handle change ObservableCodeEditor._versionId: 2 {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
					'handle change ObservableCodeEditor._selections: [1,2 -> 1,2] {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
					"running derived -> selection: [1,2 -> 1,2], value: 2",
				]);

				editor.executeEdits(undefined, [
					{ range: new Range(1, 1, 1, 1), text: "x" },
				]);

				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before get",
					"<<< after get",
					'handle change ObservableCodeEditor._versionId: 3 {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"x","rangeOffset":0}],"eol":"\\n","versionId":3}',
					'handle change ObservableCodeEditor._selections: [1,3 -> 1,3] {"selection":"[1,3 -> 1,3]","modelVersionId":3,"oldSelections":["[1,2 -> 1,2]"],"oldModelVersionId":3,"source":"modelChange","reason":2}',
					"running derived -> selection: [1,3 -> 1,3], value: 3",
				]);

				force = true;

				editor.trigger("keyboard", "type", { text: "a" });

				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before forceUpdate",
					">>> before get",
					"handle change ObservableCodeEditor._versionId: 4 undefined",
					"running derived -> selection: [1,4 -> 1,4], value: 4",
					"<<< after get",
					'handle change ObservableCodeEditor.onDidType "a"',
					'handle change ObservableCodeEditor._versionId: 4 {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"a","rangeOffset":2}],"eol":"\\n","versionId":4}',
					'handle change ObservableCodeEditor._selections: [1,4 -> 1,4] {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,3 -> 1,3]"],"oldModelVersionId":3,"source":"keyboard","reason":0}',
					"running derived -> selection: [1,4 -> 1,4], value: 4",
				]);

				editor.executeEdits(undefined, [
					{ range: new Range(1, 1, 1, 1), text: "x" },
				]);

				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before forceUpdate",
					">>> before get",
					"handle change ObservableCodeEditor._versionId: 5 undefined",
					"running derived -> selection: [1,5 -> 1,5], value: 5",
					"<<< after get",
					'handle change ObservableCodeEditor._versionId: 5 {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"x","rangeOffset":0}],"eol":"\\n","versionId":5}',
					'handle change ObservableCodeEditor._selections: [1,5 -> 1,5] {"selection":"[1,5 -> 1,5]","modelVersionId":5,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":5,"source":"modelChange","reason":2}',
					"running derived -> selection: [1,5 -> 1,5], value: 5",
				]);

			}
		);
	});
});

class Log {
	private readonly entries: string[] = [];
	public log(message: string): void {
		this.entries.push(message);
	}

	public getAndClearEntries(): string[] {
		const entries = [...this.entries];
		this.entries.length = 0;
		return entries;
	}
}
