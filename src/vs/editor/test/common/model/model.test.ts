/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ModelRawContentChangedEvent, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from 'vs/editor/common/model/textModelEvents';
import { IState, LanguageIdentifier, MetadataConsts, TokenizationRegistry } from 'vs/editor/common/modes';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { NULL_STATE } from 'vs/editor/common/modes/nullMode';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';

// --------- utils

const LINE1 = 'My First Line';
const LINE2 = '\t\tMy Second Line';
const LINE3 = '    Third Line';
const LINE4 = '';
const LINE5 = '1';

suite('Editor Model - Model', () => {

	let thisModel: TextModel;

	setup(() => {
		const text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = createTextModel(text);
	});

	teardown(() => {
		thisModel.dispose();
	});

	// --------- insert text

	test('model getValue', () => {
		assert.strictEqual(thisModel.getValue(), 'My First Line\n\t\tMy Second Line\n    Third Line\n\n1');
	});

	test('model insert empty text', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '')]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'My First Line');
	});

	test('model insert text without newline 1', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'foo ')]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'foo My First Line');
	});

	test('model insert text without newline 2', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' foo')]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'My foo First Line');
	});

	test('model insert text with one newline', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nNo longer')]);
		assert.strictEqual(thisModel.getLineCount(), 6);
		assert.strictEqual(thisModel.getLineContent(1), 'My new line');
		assert.strictEqual(thisModel.getLineContent(2), 'No longer First Line');
	});

	test('model insert text with two newlines', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nOne more line in the middle\nNo longer')]);
		assert.strictEqual(thisModel.getLineCount(), 7);
		assert.strictEqual(thisModel.getLineContent(1), 'My new line');
		assert.strictEqual(thisModel.getLineContent(2), 'One more line in the middle');
		assert.strictEqual(thisModel.getLineContent(3), 'No longer First Line');
	});

	test('model insert text with many newlines', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), '\n\n\n\n')]);
		assert.strictEqual(thisModel.getLineCount(), 9);
		assert.strictEqual(thisModel.getLineContent(1), 'My');
		assert.strictEqual(thisModel.getLineContent(2), '');
		assert.strictEqual(thisModel.getLineContent(3), '');
		assert.strictEqual(thisModel.getLineContent(4), '');
		assert.strictEqual(thisModel.getLineContent(5), ' First Line');
	});


	// --------- insert text eventing

	test('model insert empty text does not trigger eventing', () => {
		thisModel.onDidChangeRawContent((e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '')]);
	});

	test('model insert text without newline eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'foo ')]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, 'foo My First Line')
			],
			2,
			false,
			false
		));
	});

	test('model insert text with one newline eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.insert(new Position(1, 3), ' new line\nNo longer')]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, 'My new line'),
				new ModelRawLinesInserted(2, 2, ['No longer First Line']),
			],
			2,
			false,
			false
		));
	});


	// --------- delete text

	test('model delete empty text', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'My First Line');
	});

	test('model delete text from one line', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'y First Line');
	});

	test('model delete text from one line 2', () => {
		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), 'a')]);
		assert.strictEqual(thisModel.getLineContent(1), 'aMy First Line');

		thisModel.applyEdits([EditOperation.delete(new Range(1, 2, 1, 4))]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), 'a First Line');
	});

	test('model delete all text from a line', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
		assert.strictEqual(thisModel.getLineCount(), 5);
		assert.strictEqual(thisModel.getLineContent(1), '');
	});

	test('model delete text from two lines', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
		assert.strictEqual(thisModel.getLineCount(), 4);
		assert.strictEqual(thisModel.getLineContent(1), 'My Second Line');
	});

	test('model delete text from many lines', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
		assert.strictEqual(thisModel.getLineCount(), 3);
		assert.strictEqual(thisModel.getLineContent(1), 'My Third Line');
	});

	test('model delete everything', () => {
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 5, 2))]);
		assert.strictEqual(thisModel.getLineCount(), 1);
		assert.strictEqual(thisModel.getLineContent(1), '');
	});

	// --------- delete text eventing

	test('model delete empty text does not trigger eventing', () => {
		thisModel.onDidChangeRawContent((e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
	});

	test('model delete text from one line eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, 'y First Line'),
			],
			2,
			false,
			false
		));
	});

	test('model delete all text from a line eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, ''),
			],
			2,
			false,
			false
		));
	});

	test('model delete text from two lines eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, 'My Second Line'),
				new ModelRawLinesDeleted(2, 2),
			],
			2,
			false,
			false
		));
	});

	test('model delete text from many lines eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawLineChanged(1, 'My Third Line'),
				new ModelRawLinesDeleted(2, 3),
			],
			2,
			false,
			false
		));
	});

	// --------- getValueInRange

	test('getValueInRange', () => {
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 1)), '');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 2)), 'M');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 2, 1, 3)), 'y');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 14)), 'My First Line');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 1)), 'My First Line\n');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 2)), 'My First Line\n\t');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 3)), 'My First Line\n\t\t');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 17)), 'My First Line\n\t\tMy Second Line');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 3, 1)), 'My First Line\n\t\tMy Second Line\n');
		assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 4, 1)), 'My First Line\n\t\tMy Second Line\n    Third Line\n');
	});

	// --------- getValueLengthInRange

	test('getValueLengthInRange', () => {
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 1)), ''.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 2)), 'M'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 2, 1, 3)), 'y'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 14)), 'My First Line'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 1)), 'My First Line\n'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 2)), 'My First Line\n\t'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 3)), 'My First Line\n\t\t'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 17)), 'My First Line\n\t\tMy Second Line'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 3, 1)), 'My First Line\n\t\tMy Second Line\n'.length);
		assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 4, 1)), 'My First Line\n\t\tMy Second Line\n    Third Line\n'.length);
	});

	// --------- setValue
	test('setValue eventing', () => {
		let e: ModelRawContentChangedEvent | null = null;
		thisModel.onDidChangeRawContent((_e) => {
			if (e !== null) {
				assert.fail('Unexpected assertion error');
			}
			e = _e;
		});
		thisModel.setValue('new value');
		assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
			[
				new ModelRawFlush()
			],
			2,
			false,
			false
		));
	});

	test('issue #46342: Maintain edit operation order in applyEdits', () => {
		let res = thisModel.applyEdits([
			{ range: new Range(2, 1, 2, 1), text: 'a' },
			{ range: new Range(1, 1, 1, 1), text: 'b' },
		], true);

		assert.deepStrictEqual(res[0].range, new Range(2, 1, 2, 2));
		assert.deepStrictEqual(res[1].range, new Range(1, 1, 1, 2));
	});
});


// --------- Special Unicode LINE SEPARATOR character
suite('Editor Model - Model Line Separators', () => {

	let thisModel: TextModel;

	setup(() => {
		const text =
			LINE1 + '\u2028' +
			LINE2 + '\n' +
			LINE3 + '\u2028' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = createTextModel(text);
	});

	teardown(() => {
		thisModel.dispose();
	});

	test('model getValue', () => {
		assert.strictEqual(thisModel.getValue(), 'My First Line\u2028\t\tMy Second Line\n    Third Line\u2028\n1');
	});

	test('model lines', () => {
		assert.strictEqual(thisModel.getLineCount(), 3);
	});

	test('Bug 13333:Model should line break on lonely CR too', () => {
		let model = createTextModel('Hello\rWorld!\r\nAnother line');
		assert.strictEqual(model.getLineCount(), 3);
		assert.strictEqual(model.getValue(), 'Hello\r\nWorld!\r\nAnother line');
		model.dispose();
	});
});


// --------- Words

suite('Editor Model - Words', () => {

	const OUTER_LANGUAGE_ID = new LanguageIdentifier('outerMode', 3);
	const INNER_LANGUAGE_ID = new LanguageIdentifier('innerMode', 4);

	class OuterMode extends MockMode {
		constructor() {
			super(OUTER_LANGUAGE_ID);
			this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {}));

			this._register(TokenizationRegistry.register(this.getLanguageIdentifier().language, {
				getInitialState: (): IState => NULL_STATE,
				tokenize: undefined!,
				tokenize2: (line: string, hasEOL: boolean, state: IState): TokenizationResult2 => {
					const tokensArr: number[] = [];
					let prevLanguageId: LanguageIdentifier | undefined = undefined;
					for (let i = 0; i < line.length; i++) {
						const languageId = (line.charAt(i) === 'x' ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID);
						if (prevLanguageId !== languageId) {
							tokensArr.push(i);
							tokensArr.push((languageId.id << MetadataConsts.LANGUAGEID_OFFSET));
						}
						prevLanguageId = languageId;
					}

					const tokens = new Uint32Array(tokensArr.length);
					for (let i = 0; i < tokens.length; i++) {
						tokens[i] = tokensArr[i];
					}
					return new TokenizationResult2(tokens, state);
				}
			}));
		}
	}

	class InnerMode extends MockMode {
		constructor() {
			super(INNER_LANGUAGE_ID);
			this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {}));
		}
	}

	let disposables: Disposable[] = [];

	setup(() => {
		disposables = [];
	});

	teardown(() => {
		dispose(disposables);
		disposables = [];
	});

	test('Get word at position', () => {
		const text = ['This text has some  words. '];
		const thisModel = createTextModel(text.join('\n'));
		disposables.push(thisModel);

		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: 'This', startColumn: 1, endColumn: 5 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: 'text', startColumn: 6, endColumn: 10 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 19)), { word: 'some', startColumn: 15, endColumn: 19 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 20)), null);
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 21)), { word: 'words', startColumn: 21, endColumn: 26 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 26)), { word: 'words', startColumn: 21, endColumn: 26 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 27)), null);
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 28)), null);
	});

	test('getWordAtPosition at embedded language boundaries', () => {
		const outerMode = new OuterMode();
		const innerMode = new InnerMode();
		disposables.push(outerMode, innerMode);

		const model = createTextModel('ab<xx>ab<x>', undefined, outerMode.getLanguageIdentifier());
		disposables.push(model);

		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 1)), { word: 'ab', startColumn: 1, endColumn: 3 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 2)), { word: 'ab', startColumn: 1, endColumn: 3 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 3)), { word: 'ab', startColumn: 1, endColumn: 3 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 4)), { word: 'xx', startColumn: 4, endColumn: 6 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 5)), { word: 'xx', startColumn: 4, endColumn: 6 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 6)), { word: 'xx', startColumn: 4, endColumn: 6 });
		assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 7)), { word: 'ab', startColumn: 7, endColumn: 9 });
	});

	test('issue #61296: VS code freezes when editing CSS file with emoji', () => {
		const MODE_ID = new LanguageIdentifier('testMode', 4);

		const mode = new class extends MockMode {
			constructor() {
				super(MODE_ID);
				this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
					wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g
				}));
			}
		};
		disposables.push(mode);

		const thisModel = createTextModel('.🐷-a-b', undefined, MODE_ID);
		disposables.push(thisModel);

		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: '.', startColumn: 1, endColumn: 2 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: '.', startColumn: 1, endColumn: 2 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 3)), null);
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: '-a-b', startColumn: 4, endColumn: 8 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: '-a-b', startColumn: 4, endColumn: 8 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: '-a-b', startColumn: 4, endColumn: 8 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 7)), { word: '-a-b', startColumn: 4, endColumn: 8 });
		assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 8)), { word: '-a-b', startColumn: 4, endColumn: 8 });
	});
});
