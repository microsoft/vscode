/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import { DisposableStore } from "vs/base/common/lifecycle";
import { IObservable, derivedHandleChanges } from "vs/base/common/observable";
import { ensureNoDisposablesAreLeakedInTestSuite } from "vs/base/test/common/utils";
import { ICodeEditor } from "vs/editor/browser/editorBrowser";
import { ObservableCodeEditor, observableCodeEditor } from "vs/editor/browser/observableCodeEditor";
import { Position } from "vs/editor/common/core/position";
import { Range } from "vs/editor/common/core/range";
import { ViewModel } from "vs/editor/common/viewModel/viewModelImpl";
import { withTestCodeEditor } from "vs/editor/test/browser/testCodeEditor";

suite("CodeEditorWidget", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function withTestFixture(
		cb: (args: { editor: ICodeEditor; viewModel: ViewModel; log: Log; derived: IObservable<string>; }) => void
	) {
		withEditorSetupTestFixture(undefined, cb);
	}

	function withEditorSetupTestFixture(
		preSetupCallback:
			| ((editor: ICodeEditor, disposables: DisposableStore) => void)
			| undefined,
		cb: (args: { editor: ICodeEditor; viewModel: ViewModel; log: Log; derived: IObservable<string>; }) => void
	) {
		withTestCodeEditor("hello world", {}, (editor, viewModel) => {
			const disposables = new DisposableStore();
			preSetupCallback?.(editor, disposables);
			const obsEditor = observableCodeEditor(editor);
			const log = new Log();

			const derived = derivedHandleChanges(
				{
					createEmptyChangeSummary: () => undefined,
					handleChange: (context) => {
						const obsName = observableName(context.changedObservable, obsEditor);
						log.log(`handle change: ${obsName} ${formatChange(context.change)}`);
						return true;
					},
				},
				(reader) => {
					const versionId = obsEditor.versionId.read(reader);
					const selection = obsEditor.selections.read(reader)?.map((s) => s.toString()).join(", ");
					obsEditor.onDidType.read(reader);

					const str = `running derived: selection: ${selection}, value: ${versionId}`;
					log.log(str);
					return str;
				}
			);

			derived.recomputeInitiallyAndOnChange(disposables);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"running derived: selection: [1,1 -> 1,1], value: 1",
			]);

			cb({ editor, viewModel, log, derived });

			disposables.dispose();
		});
	}

	test("setPosition", () =>
		withTestFixture(({ editor, log }) => {
			editor.setPosition(new Position(1, 2));

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":1,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"api","reason":0}',
				"running derived: selection: [1,2 -> 1,2], value: 1",
			]);
		}));

	test("keyboard.type", () =>
		withTestFixture(({ editor, log }) => {
			editor.trigger("keyboard", "type", { text: "abc" });

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'handle change: editor.onDidType "abc"',
				'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
				'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3}',
				'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4}',
				'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
				"running derived: selection: [1,4 -> 1,4], value: 4",
			]);
		}));

	test("keyboard.type and set position", () =>
		withTestFixture(({ editor, log }) => {
			editor.trigger("keyboard", "type", { text: "abc" });

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'handle change: editor.onDidType "abc"',
				'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
				'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3}',
				'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4}',
				'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
				"running derived: selection: [1,4 -> 1,4], value: 4",
			]);

			editor.setPosition(new Position(1, 5), "test");

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'handle change: editor.selections {"selection":"[1,5 -> 1,5]","modelVersionId":4,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":4,"source":"test","reason":0}',
				"running derived: selection: [1,5 -> 1,5], value: 4",
			]);
		}));

	test("listener interaction (unforced)", () => {
		let derived: IObservable<string, unknown>;
		let log: Log;
		withEditorSetupTestFixture(
			(editor, disposables) => {
				disposables.add(
					editor.onDidChangeModelContent(() => {
						log.log(">>> before get");
						derived.get();
						log.log("<<< after get");
					})
				);
			},
			(args) => {
				const editor = args.editor;
				derived = args.derived;
				log = args.log;

				editor.trigger("keyboard", "type", { text: "a" });
				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before get",
					"<<< after get",
					'handle change: editor.onDidType "a"',
					'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
					'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
					"running derived: selection: [1,2 -> 1,2], value: 2",
				]);
			}
		);
	});

	test("listener interaction ()", () => {
		let derived: IObservable<string, unknown>;
		let log: Log;
		withEditorSetupTestFixture(
			(editor, disposables) => {
				disposables.add(
					editor.onDidChangeModelContent(() => {
						log.log(">>> before forceUpdate");
						observableCodeEditor(editor).forceUpdate();

						log.log(">>> before get");
						derived.get();
						log.log("<<< after get");
					})
				);
			},
			(args) => {
				const editor = args.editor;
				derived = args.derived;
				log = args.log;

				editor.trigger("keyboard", "type", { text: "a" });

				assert.deepStrictEqual(log.getAndClearEntries(), [
					">>> before forceUpdate",
					">>> before get",
					"handle change: editor.versionId undefined",
					"running derived: selection: [1,2 -> 1,2], value: 2",
					"<<< after get",
					'handle change: editor.onDidType "a"',
					'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2}',
					'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
					"running derived: selection: [1,2 -> 1,2], value: 2",
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

function formatChange(change: unknown) {
	return JSON.stringify(
		change,
		(key, value) => {
			if (value instanceof Range) {
				return value.toString();
			}
			if (
				value === false ||
				(Array.isArray(value) && value.length === 0)
			) {
				return undefined;
			}
			return value;
		}
	);
}

function observableName(obs: IObservable<any>, obsEditor: ObservableCodeEditor): string {
	switch (obs) {
		case obsEditor.selections:
			return "editor.selections";
		case obsEditor.versionId:
			return "editor.versionId";
		case obsEditor.onDidType:
			return "editor.onDidType";
		default:
			return "unknown";
	}
}
