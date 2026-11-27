/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DisposableStore, disposeOnReturn } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEditorOptions } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { IBackgroundTokenizationStore, TokenizationRegistry } from '../../../common/languages.js';
import { NullState, nullTokenize, nullTokenizeEncoded } from '../../../common/languages/nullTokenize.js';
import { IModelDeltaDecoration } from '../../../common/model.js';
import { AnnotationsUpdate } from '../../../common/model/tokens/annotations.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { createModelServices, instantiateTextModel } from '../../common/testTextModel.js';
import { Random } from '../../common/core/random.js';
import { testViewModel, testViewModelOfModel } from './testViewModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../common/viewModel/inlineDecorations.js';

suite('ViewModelDecorations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('getDecorationsViewportData', () => {
		const text = [
			'hello world, this is a buffer that will be wrapped'
		];
		const opts: IEditorOptions = {
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 13
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
			assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
			assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
			assert.strictEqual(viewModel.getLineContent(4), 'will be ');
			assert.strictEqual(viewModel.getLineContent(5), 'wrapped');

			model.changeDecorations((accessor) => {
				const createOpts = (id: string) => {
					return {
						description: 'test',
						className: id,
						inlineClassName: 'i-' + id,
						beforeContentClassName: 'b-' + id,
						afterContentClassName: 'a-' + id
					};
				};

				// VIEWPORT will be (1,14) -> (1,36)

				// completely before viewport
				accessor.addDecoration(new Range(1, 2, 1, 3), createOpts('dec1'));
				// starts before viewport, ends at viewport start
				accessor.addDecoration(new Range(1, 2, 1, 14), createOpts('dec2'));
				// starts before viewport, ends inside viewport
				accessor.addDecoration(new Range(1, 2, 1, 15), createOpts('dec3'));
				// starts before viewport, ends at viewport end
				accessor.addDecoration(new Range(1, 2, 1, 36), createOpts('dec4'));
				// starts before viewport, ends after viewport
				accessor.addDecoration(new Range(1, 2, 1, 51), createOpts('dec5'));

				// starts at viewport start, ends at viewport start (will not be visible on view line 2)
				accessor.addDecoration(new Range(1, 14, 1, 14), createOpts('dec6'));
				// starts at viewport start, ends inside viewport
				accessor.addDecoration(new Range(1, 14, 1, 16), createOpts('dec7'));
				// starts at viewport start, ends at viewport end
				accessor.addDecoration(new Range(1, 14, 1, 36), createOpts('dec8'));
				// starts at viewport start, ends after viewport
				accessor.addDecoration(new Range(1, 14, 1, 51), createOpts('dec9'));

				// starts inside viewport, ends inside viewport
				accessor.addDecoration(new Range(1, 16, 1, 18), createOpts('dec10'));
				// starts inside viewport, ends at viewport end
				accessor.addDecoration(new Range(1, 16, 1, 36), createOpts('dec11'));
				// starts inside viewport, ends after viewport
				accessor.addDecoration(new Range(1, 16, 1, 51), createOpts('dec12'));

				// starts at viewport end, ends at viewport end
				accessor.addDecoration(new Range(1, 36, 1, 36), createOpts('dec13'));
				// starts at viewport end, ends after viewport
				accessor.addDecoration(new Range(1, 36, 1, 51), createOpts('dec14'));

				// starts after viewport, ends after viewport
				accessor.addDecoration(new Range(1, 40, 1, 51), createOpts('dec15'));
			});

			const actualDecorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			).map((dec) => {
				return dec.options.className;
			}).filter(Boolean);

			assert.deepStrictEqual(actualDecorations, [
				'dec1',
				'dec2',
				'dec3',
				'dec4',
				'dec5',
				'dec6',
				'dec7',
				'dec8',
				'dec9',
				'dec10',
				'dec11',
				'dec12',
				'dec13',
				'dec14',
			]);

			const inlineDecorations1 = viewModel.getViewportViewLineRenderingData(
				new Range(1, viewModel.getLineMinColumn(1), 2, viewModel.getLineMaxColumn(2)),
				1
			).inlineDecorations;

			// view line 1: (1,1 -> 1,14)
			assert.deepStrictEqual(inlineDecorations1, [
				new InlineDecoration(new Range(1, 2, 1, 3), 'i-dec1', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec1', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 3, 1, 3), 'a-dec1', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 1, 14), 'i-dec2', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec2', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 14, 1, 14), 'a-dec2', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 2, 2), 'i-dec3', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec3', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec4', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec5', InlineDecorationType.Before),
			]);

			const inlineDecorations2 = viewModel.getViewportViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;

			// view line 2: (1,14 -> 1,24)
			assert.deepStrictEqual(inlineDecorations2, [
				new InlineDecoration(new Range(1, 2, 2, 2), 'i-dec3', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 2, 2, 2), 'a-dec3', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', InlineDecorationType.Regular),
				new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'i-dec6', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec6', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 1, 2, 1), 'a-dec6', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 2, 3), 'i-dec7', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec7', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 2, 3), 'a-dec7', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec8', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec9', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 2, 5), 'i-dec10', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec10', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 5, 2, 5), 'a-dec10', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec11', InlineDecorationType.Before),
				new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec12', InlineDecorationType.Before),
			]);

			const inlineDecorations3 = viewModel.getViewportViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;

			// view line 3 (24 -> 36)
			assert.deepStrictEqual(inlineDecorations3, [
				new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec4', InlineDecorationType.After),
				new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec8', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', InlineDecorationType.Regular),
				new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', InlineDecorationType.Regular),
				new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec11', InlineDecorationType.After),
				new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', InlineDecorationType.Regular),
			]);
		});
	});

	test('issue #17208: Problem scrolling in 1.8.0', () => {
		const text = [
			'hello world, this is a buffer that will be wrapped'
		];
		const opts: IEditorOptions = {
			wordWrap: 'wordWrapColumn',
			wordWrapColumn: 13
		};
		testViewModel(text, opts, (viewModel, model) => {
			assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
			assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
			assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
			assert.strictEqual(viewModel.getLineContent(4), 'will be ');
			assert.strictEqual(viewModel.getLineContent(5), 'wrapped');

			model.changeDecorations((accessor) => {
				accessor.addDecoration(
					new Range(1, 50, 1, 51),
					{
						description: 'test',
						beforeContentClassName: 'dec1'
					}
				);
			});

			const decorations = viewModel.getDecorationsInViewport(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))
			).filter(x => Boolean(x.options.beforeContentClassName));
			assert.deepStrictEqual(decorations, []);

			const inlineDecorations1 = viewModel.getViewportViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				2
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations1, []);

			const inlineDecorations2 = viewModel.getViewportViewLineRenderingData(
				new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)),
				3
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations2, []);
		});
	});

	test('issue #37401: Allow both before and after decorations on empty line', () => {
		const text = [
			''
		];
		testViewModel(text, {}, (viewModel, model) => {

			model.changeDecorations((accessor) => {
				accessor.addDecoration(
					new Range(1, 1, 1, 1),
					{
						description: 'test',
						beforeContentClassName: 'before1',
						afterContentClassName: 'after1'
					}
				);
			});

			const inlineDecorations = viewModel.getViewportViewLineRenderingData(
				new Range(1, 1, 1, 1),
				1
			).inlineDecorations;
			assert.deepStrictEqual(inlineDecorations, [
				new InlineDecoration(new Range(1, 1, 1, 1), 'before1', InlineDecorationType.Before),
				new InlineDecoration(new Range(1, 1, 1, 1), 'after1', InlineDecorationType.After)
			]);
		});
	});

	test('scrolling reads the model decorations of a wider range once, an edit reads exactly the viewport', () => {
		const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		testViewModel(text, {}, (viewModel, model) => {
			const getDecorationsInRange = sinon.spy(model, 'getDecorationsInRange');
			const readRangesForViewport = (startLineNumber: number, endLineNumber: number) => {
				getDecorationsInRange.resetHistory();
				viewModel.getDecorationsInViewport(new Range(startLineNumber, viewModel.getLineMinColumn(startLineNumber), endLineNumber, viewModel.getLineMaxColumn(endLineNumber)));
				return getDecorationsInRange.getCalls().map(call => Range.lift(call.args[0]).toString());
			};

			const readRanges = [
				readRangesForViewport(1, 10),
				readRangesForViewport(2, 11),
				readRangesForViewport(5, 14),
				readRangesForViewport(12, 21),
				readRangesForViewport(13, 22),
			];
			model.applyEdits([{ range: new Range(15, 1, 15, 1), text: 'x' }]);
			readRanges.push(
				readRangesForViewport(13, 22),
				readRangesForViewport(14, 23),
				readRangesForViewport(60, 69),
				readRangesForViewport(61, 70),
			);

			assert.deepStrictEqual(readRanges, [
				['[1,1 -> 10,8]'],
				['[1,1 -> 21,8]'],
				[],
				[],
				['[3,1 -> 32,8]'],
				['[13,1 -> 22,8]'],
				['[4,1 -> 33,8]'],
				['[60,1 -> 69,8]'],
				['[51,1 -> 80,8]'],
			]);
		});
	});

	test('a viewport read while an edit is being reported is not answered from decorations read before the edit', () => {
		const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		testViewModel(text, {}, (viewModel, model) => {
			const viewport = (startLineNumber: number, endLineNumber: number) => new Range(startLineNumber, viewModel.getLineMinColumn(startLineNumber), endLineNumber, viewModel.getLineMaxColumn(endLineNumber));
			model.deltaDecorations([], [{ range: new Range(25, 1, 25, 5), options: { description: 'test', className: 'moved' } }]);
			viewModel.getDecorationsInViewport(viewport(1, 10));
			viewModel.getDecorationsInViewport(viewport(2, 11));

			// Content change listeners run before the model reports that the edit moved the decorations.
			let classNames: (string | null | undefined)[] = [];
			const listener = model.onDidChangeContent(() => {
				classNames = viewModel.getDecorationsInViewport(viewport(3, 12)).map(decoration => decoration.options.className);
			});
			model.applyEdits([{ range: new Range(1, 1, 16, 1), text: '' }]);
			listener.dispose();

			assert.deepStrictEqual(classNames, ['moved']);
		});
	});

	test('the decorations of a viewport equal those read for exactly that viewport', () => {
		for (let seed = 0; seed < 100; seed++) {
			disposeOnReturn(store => assertViewportDecorationsWhileScrolling(store, seed));
		}
	});
});

/**
 * Scrolls, edits, decorates and folds a random model with brackets and font tokens, and checks that the decorations of
 * every viewport equal those that a second view model of the model, with the same hidden lines, reads for exactly that
 * viewport.
 */
function assertViewportDecorationsWhileScrolling(store: DisposableStore, seed: number): void {
	const rng = Random.create(seed);
	const languageId = 'testLanguage';
	const instantiationService = createModelServices(store);
	const languageService = instantiationService.get(ILanguageService);
	store.add(languageService.registerLanguage({ id: languageId }));
	store.add(instantiationService.get(ILanguageConfigurationService).register(languageId, { brackets: [['{', '}'], ['(', ')']] }));
	// A tokenizer only to get the store through which tokenizers report font tokens.
	let backgroundTokenizationStore: IBackgroundTokenizationStore | undefined;
	const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
	store.add(TokenizationRegistry.register(languageId, {
		getInitialState: () => NullState,
		tokenize: (_line, _hasEOL, state) => nullTokenize(languageId, state),
		tokenizeEncoded: (_line, _hasEOL, state) => nullTokenizeEncoded(encodedLanguageId, state),
		createBackgroundTokenizer: (_textModel, tokenizationStore) => {
			backgroundTokenizationStore = tokenizationStore;
			return { dispose: () => { }, requestTokens: () => { } };
		},
	}));
	const text = rng.nextMultiLineString(rng.nextIntRange(10, 60), new OffsetRange(0, 30), rng.stringGenerator('ab  {}()'));
	const model = store.add(instantiateTextModel(instantiationService, text, languageId));
	const options: IEditorOptions = rng.nextIntRange(0, 3) === 0 ? {} : { wordWrap: 'wordWrapColumn', wordWrapColumn: rng.nextIntRange(4, 20) };

	testViewModelOfModel(model, options, viewModel => testViewModelOfModel(model, options, (referenceViewModel, _model, referenceConfiguration) => {
		// What the view reads for a viewport: its decorations and the rendering data of its lines. Each view model has
		// its own tracked ranges (for its cursors and its viewport), which render nothing, so they're left out.
		const readViewport = (fromViewModel: ViewModel, viewport: Range) => ({
			decorations: fromViewModel.getDecorationsInViewport(viewport).filter(decoration => !decoration.options.description.startsWith('tracked-range')),
			lines: Array.from({ length: viewport.endLineNumber - viewport.startLineNumber + 1 }, (_, i) => fromViewModel.getViewportViewLineRenderingData(viewport, viewport.startLineNumber + i)),
		});
		const readExactlyViewport = (viewport: Range) => {
			// Changing how validation decorations render (to the same effect) makes the reference view model forget
			// the decorations it read, so that it reads those of exactly this viewport.
			referenceConfiguration.updateOptions({ renderValidationDecorations: 'on' });
			referenceConfiguration.updateOptions({ renderValidationDecorations: 'editable' });
			return readViewport(referenceViewModel, viewport);
		};

		const randomPosition = () => {
			const lineNumber = rng.nextIntRange(1, model.getLineCount() + 1);
			return new Position(lineNumber, rng.nextIntRange(1, model.getLineMaxColumn(lineNumber) + 1));
		};
		const randomRange = () => {
			const start = randomPosition();
			switch (rng.nextIntRange(0, 4)) {
				case 0: return Range.fromPositions(start);
				case 1: return new Range(start.lineNumber, 1, Math.min(model.getLineCount(), start.lineNumber + rng.nextIntRange(1, 4)), 1);
				default: return Range.fromPositions(start, randomPosition());
			}
		};
		let decorationCount = 0;
		const randomDecoration = (): IModelDeltaDecoration => {
			const name = `d${decorationCount++}`;
			const range = randomRange();
			switch (rng.nextIntRange(0, 7)) {
				case 0: return { range, options: { description: 'test', className: name } };
				case 1: return { range, options: { description: 'test', inlineClassName: name } };
				case 2: return { range, options: { description: 'test', beforeContentClassName: name, afterContentClassName: name } };
				case 3: return { range, options: { description: 'test', isWholeLine: true, inlineClassName: name } };
				case 4: return { range, options: { description: 'test', inlineClassName: name, affectsFont: true } };
				case 5: return { range, options: { description: 'test', after: { content: 'xy', inlineClassName: name } } };
				default: return { range, options: { description: 'test', glyphMarginClassName: name } };
			}
		};
		const decorationIds = model.deltaDecorations([], Array.from({ length: rng.nextIntRange(0, 30) }, randomDecoration));

		const viewportLineCount = rng.nextIntRange(2, 12);
		let viewportStartLineNumber = 1;
		for (let step = 0; step < 50; step++) {
			switch (rng.nextIntRange(0, 11)) {
				case 0:
					model.applyEdits([{ range: randomRange(), text: rng.nextString(rng.nextIntRange(0, 4), rng.stringGenerator('a {}()\n')) }]);
					break;
				case 1:
					if (decorationIds.length > 0 && rng.nextIntRange(0, 2) === 0) {
						model.deltaDecorations(decorationIds.splice(rng.nextIntRange(0, decorationIds.length), 1), []);
					} else {
						decorationIds.push(...model.deltaDecorations([], [randomDecoration()]));
					}
					break;
				case 2: {
					const startLineNumber = rng.nextIntRange(1, model.getLineCount() + 1);
					const hiddenAreas = rng.nextIntRange(0, 2) === 0 ? [] : [new Range(startLineNumber, 1, Math.min(model.getLineCount(), startLineNumber + rng.nextIntRange(0, 5)), 1)];
					viewModel.setHiddenAreas(hiddenAreas);
					referenceViewModel.setHiddenAreas(hiddenAreas);
					break;
				}
				case 3: {
					// A font token, sometimes up to the start of the next line (as typing Enter at its end leaves it).
					const lineNumber = rng.nextIntRange(1, model.getLineCount() + 1);
					const lineStart = model.getOffsetAt(new Position(lineNumber, 1));
					const lineEnd = model.getOffsetAt(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
					const start = rng.nextIntRange(lineStart, lineEnd + 1);
					const toNextLine = (lineNumber < model.getLineCount() && (start === lineEnd || rng.nextIntRange(0, 2) === 0));
					if (toNextLine || start < lineEnd) {
						const end = toNextLine ? model.getOffsetAt(new Position(lineNumber + 1, 1)) : rng.nextIntRange(start + 1, lineEnd + 1);
						const annotation = rng.nextIntRange(0, 4) === 0 ? undefined : rng.nextIntRange(0, 2) === 0 ? { fontSizeMultiplier: 1.5 } : { lineHeightMultiplier: 1.5 };
						backgroundTokenizationStore!.setFontInfo(AnnotationsUpdate.create([{ range: new OffsetRange(start, end), annotation }]));
					}
					break;
				}
				case 4:
					viewportStartLineNumber = rng.nextIntRange(1, viewModel.getLineCount() + 1);
					break;
				default:
					viewportStartLineNumber += rng.nextIntRange(-3, 4);
					break;
			}

			const lineCount = viewModel.getLineCount();
			viewportStartLineNumber = Math.max(1, Math.min(viewportStartLineNumber, lineCount - viewportLineCount + 1));
			const viewportEndLineNumber = Math.min(lineCount, viewportStartLineNumber + viewportLineCount - 1);
			const viewport = new Range(viewportStartLineNumber, viewModel.getLineMinColumn(viewportStartLineNumber), viewportEndLineNumber, viewModel.getLineMaxColumn(viewportEndLineNumber));
			const actual = readViewport(viewModel, viewport);
			assert.deepStrictEqual(actual, readExactlyViewport(viewport), `seed ${seed}, step ${step}, viewport ${viewport}`);
		}
	}));
}
