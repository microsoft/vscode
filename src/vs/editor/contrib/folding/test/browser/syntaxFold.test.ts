/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ITextModel } from '../../../../common/model.js';
import { FoldingContext, FoldingRange, FoldingRangeKind, FoldingRangeProvider, ProviderResult } from '../../../../common/languages.js';
import { SyntaxRangeProvider } from '../../browser/syntaxRangeProvider.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { FoldingController, FoldingLimitReporter } from '../../browser/folding.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IndentRangeProvider } from '../../browser/indentRangeProvider.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { FoldingRegions, FoldSource, MAX_FOLDING_REGIONS } from '../../browser/foldingRanges.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';

interface IndentRange {
	start: number;
	end: number;
}

class TestFoldingRangeProvider implements FoldingRangeProvider {
	constructor(private model: ITextModel, private ranges: IndentRange[]) {
	}

	provideFoldingRanges(model: ITextModel, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRange[]> {
		if (model === this.model) {
			return this.ranges;
		}
		return null;
	}
}

suite('Syntax folding', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function r(start: number, end: number): IndentRange {
		return { start, end };
	}

	test('Secondary provider preserves indentation folding #265661', async () => {
		const model = createTextModel('block\n  first\n  second\nend\nregion\ncontent\nend region');
		const languageConfigurationService = new TestLanguageConfigurationService();
		const limit: FoldingLimitReporter = { limit: 5000, update: () => { } };
		const provider = new class extends TestFoldingRangeProvider {
			readonly isSecondary = true;
		}(model, [r(5, 7)]);
		const rangeProvider = new SyntaxRangeProvider(model, [provider], () => { }, limit, new IndentRangeProvider(model, languageConfigurationService, limit));
		try {
			const ranges = await rangeProvider.compute(CancellationToken.None);
			const actual = ranges ? Array.from({ length: ranges.length }, (_, i) => r(ranges.getStartLineNumber(i), ranges.getEndLineNumber(i))) : [];
			assert.deepStrictEqual(actual, [r(1, 3), r(5, 7)]);
		} finally {
			rangeProvider.dispose();
			languageConfigurationService.dispose();
			model.dispose();
		}
	});

	function getRanges(ranges: FoldingRegions | null): IndentRange[] {
		return ranges ? Array.from({ length: ranges.length }, (_, i) => r(ranges.getStartLineNumber(i), ranges.getEndLineNumber(i))) : [];
	}

	function createRangeProvider(providers: FoldingRangeProvider[], limit: FoldingLimitReporter = { limit: 5000, update: () => { } }, text = 'block\n  first\n  second\nend\nregion\ncontent\nend region\nlast') {
		const model = disposables.add(createTextModel(text));
		const configurationService = disposables.add(new TestLanguageConfigurationService());
		const rangeProvider = disposables.add(new SyntaxRangeProvider(model, providers, () => { }, limit, new IndentRangeProvider(model, configurationService, limit)));
		return { model, rangeProvider };
	}

	for (const isSecondary of [undefined, false, true]) {
		for (const ranges of [undefined, null, [], [r(5, 7)]]) {
			test(`Indentation fallback with isSecondary=${isSecondary} and ranges=${JSON.stringify(ranges)}`, async () => {
				const { rangeProvider } = createRangeProvider([{ isSecondary, provideFoldingRanges: () => ranges }]);
				const expected = !ranges ? [r(1, 3)] : isSecondary ? [r(1, 3), ...ranges] : ranges;
				assert.deepStrictEqual(getRanges(await rangeProvider.compute(CancellationToken.None)), expected);
			});
		}
	}

	for (const primaryResult of [null, [], [r(2, 3)]]) {
		test(`Primary provider suppresses indentation with result=${JSON.stringify(primaryResult)}`, async () => {
			const { rangeProvider } = createRangeProvider([
				{ isSecondary: true, provideFoldingRanges: () => [r(5, 7)] },
				{ provideFoldingRanges: () => primaryResult }
			]);
			assert.deepStrictEqual(getRanges(await rangeProvider.compute(CancellationToken.None)), [...(primaryResult ?? []), r(5, 7)]);
		});
	}

	for (const { name, text, ranges, expected } of [
		{ name: 'same start', text: 'block\n  first\n  second\nend', ranges: [r(1, 2)], expected: [r(1, 2)] },
		{ name: 'custom range crosses an earlier indentation range', text: 'block\n  first\n  second\nend\nlast', ranges: [r(2, 5)], expected: [r(2, 5)] },
		{ name: 'indentation range crosses an earlier custom range', text: 'first\nblock\n  second\n  third\nlast', ranges: [r(1, 3)], expected: [r(1, 3)] },
		{ name: 'indentation contains custom range', text: 'block\n  first\n  second\n  third\nend', ranges: [r(2, 3)], expected: [r(1, 4), r(2, 3)] },
		{ name: 'custom range contains indentation', text: 'first\nblock\n  second\n  third\nlast', ranges: [r(1, 5)], expected: [r(1, 5), r(2, 4)] }
	]) {
		test(`Secondary folding resolves ${name}`, async () => {
			const { rangeProvider } = createRangeProvider([{ isSecondary: true, provideFoldingRanges: () => ranges }], undefined, text);
			const result = await rangeProvider.compute(CancellationToken.None);
			assert.deepStrictEqual({
				ranges: getRanges(result),
				sources: result ? Array.from({ length: result.length }, (_, i) => result.getSource(i)) : []
			}, { ranges: expected, sources: expected.map(() => FoldSource.provider) });
		});
	}

	test('Secondary folding ignores invalid custom ranges', async () => {
		const { rangeProvider } = createRangeProvider([
			{ isSecondary: true, provideFoldingRanges: () => [r(0, 2), r(-1, 3), r(2, 2), r(2, 500), r(2.5, 3), r(5, 7)] }
		]);
		assert.deepStrictEqual(getRanges(await rangeProvider.compute(CancellationToken.None)), [r(1, 3), r(5, 7)]);
	});

	test('Rejected crossing custom ranges do not suppress valid indentation', async () => {
		const { rangeProvider } = createRangeProvider([
			{ isSecondary: true, provideFoldingRanges: () => [r(1, 10), r(3, 12)] }
		], undefined, 'first\nblock\n  child\n  child\n  child\n  child\nend\nline\nline\nline\nline\nlast');
		assert.deepStrictEqual(getRanges(await rangeProvider.compute(CancellationToken.None)), [r(1, 10), r(2, 6)]);
	});

	for (const source of ['syntax', 'indentation'] as const) {
		test(`Secondary folding counts all ${source} ranges before applying the combined limit`, async () => {
			const count = MAX_FOLDING_REGIONS + 1;
			const reports: Array<{ computed: number; limited: number | false }> = [];
			const customRanges = source === 'syntax' ? Array.from({ length: count }, (_, i) => r(i * 2 + 1, i * 2 + 2)) : [r(1, 2)];
			const { rangeProvider } = createRangeProvider([
				{ isSecondary: true, provideFoldingRanges: () => customRanges }
			], { limit: 10, update: (computed, limited) => reports.push({ computed, limited }) }, (source === 'syntax' ? 'line\nline\n' : 'block\n  child\n').repeat(count));
			assert.deepStrictEqual({ ranges: getRanges(await rangeProvider.compute(CancellationToken.None)), reports }, {
				ranges: Array.from({ length: 10 }, (_, i) => r(i * 2 + 1, i * 2 + 2)), reports: [{ computed: count, limited: 10 }]
			});
		});
	}

	test('Secondary providers preserve kinds and provider priority', async () => {
		const { rangeProvider } = createRangeProvider([
			{ isSecondary: true, provideFoldingRanges: () => [{ start: 5, end: 7, kind: FoldingRangeKind.Region }] },
			{ isSecondary: true, provideFoldingRanges: () => [{ start: 5, end: 6, kind: FoldingRangeKind.Comment }] }
		]);
		const result = await rangeProvider.compute(CancellationToken.None);
		assert.deepStrictEqual({ ranges: getRanges(result), kinds: result ? Array.from({ length: result.length }, (_, i) => result.getType(i)) : [] }, {
			ranges: [r(1, 3), r(5, 7)], kinds: [undefined, 'region']
		});
	});

	for (const limit of [0, 1, 2, 3, 4]) {
		test(`Secondary folding applies combined limit ${limit} after deduplication`, async () => {
			const reports: Array<{ computed: number; limited: number | false }> = [];
			const { rangeProvider } = createRangeProvider([
				{ isSecondary: true, provideFoldingRanges: () => [r(1, 3), r(5, 7)] }
			], { limit, update: (computed, limited) => reports.push({ computed, limited }) }, 'block\n  first\n  second\nend\nregion\ncontent\nend region\nblock\n  last');
			const result = await rangeProvider.compute(CancellationToken.None);
			assert.deepStrictEqual({ ranges: getRanges(result), reports }, {
				ranges: [r(1, 3), r(5, 7), r(8, 9)].slice(0, limit),
				reports: [{ computed: 3, limited: limit < 3 ? limit : false }]
			});
		});
	}

	for (const failure of ['throw', 'reject'] as const) {
		for (const isSecondary of [false, true]) {
			test(`A provider that ${failure}s does not discard other folding ranges (secondary=${isSecondary})`, async () => {
				const error = new Error('Expected provider failure');
				const errors: Error[] = [];
				const previousHandler = errorHandler.getUnexpectedErrorHandler();
				setUnexpectedErrorHandler(value => errors.push(value));
				try {
					const { rangeProvider } = createRangeProvider([
						{ isSecondary, provideFoldingRanges: () => { if (failure === 'throw') { throw error; } return Promise.reject(error); } },
						{ isSecondary: true, provideFoldingRanges: () => [r(5, 7)] }
					]);
					assert.deepStrictEqual({ ranges: getRanges(await rangeProvider.compute(CancellationToken.None)), errors }, {
						ranges: isSecondary ? [r(1, 3), r(5, 7)] : [r(5, 7)], errors: [error]
					});
				} finally {
					setUnexpectedErrorHandler(previousHandler);
				}
			});
		}
	}

	for (const disposeModel of [false, true]) {
		test(`Secondary folding discards results after ${disposeModel ? 'model disposal' : 'cancellation'}`, async () => {
			const pending = new DeferredPromise<FoldingRange[]>();
			const { model, rangeProvider } = createRangeProvider([{ isSecondary: true, provideFoldingRanges: () => pending.p }]);
			const cancellation = disposables.add(new CancellationTokenSource());
			const result = rangeProvider.compute(cancellation.token);
			if (disposeModel) {
				model.dispose();
			} else {
				cancellation.cancel();
			}
			await pending.complete([r(5, 7)]);
			assert.strictEqual(await result, null);
		});
	}

	for (const strategy of ['auto', 'indentation'] as const) {
		test(`Secondary folding works in a rendered editor with strategy=${strategy}`, async () => {
			const container = document.createElement('div');
			container.style.width = '600px';
			container.style.height = '300px';
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const instantiationService = createCodeEditorServices(disposables);
			const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
				folding: true, foldingStrategy: strategy, showFoldingControls: 'always', minimap: { enabled: false }, dimension: { width: 600, height: 300 }
			}, { contributions: [] }));
			const model = disposables.add(createTextModel('block\n  first\n  second\nend\nregion\ncontent\nend region\nlast'));
			const languageFeatures = instantiationService.get(ILanguageFeaturesService);
			const changes = disposables.add(new Emitter<FoldingRangeProvider>());
			let customRanges = [r(5, 7)];
			const provider: FoldingRangeProvider = {
				isSecondary: true, onDidChange: changes.event, provideFoldingRanges: () => customRanges
			};
			const registration = disposables.add(languageFeatures.foldingRangeProvider.register('*', provider));
			const controller = disposables.add(instantiationService.createInstance(FoldingController, editor));
			editor.setModel(model);
			const foldingModel = await controller.getFoldingModel();
			assert.ok(foldingModel);
			const before = editor.getTopForLineNumber(8);
			foldingModel.toggleCollapseState(Array.from({ length: foldingModel.regions.length }, (_, i) => foldingModel.regions.toRegion(i)));
			editor.render(true);
			assert.deepStrictEqual({
				ranges: getRanges(foldingModel.regions),
				hiddenLines: (before - editor.getTopForLineNumber(8)) / editor.getOption(EditorOption.lineHeight),
				renderedLines: container.querySelectorAll('.view-line').length
			}, { ranges: strategy === 'auto' ? [r(1, 3), r(5, 7)] : [r(1, 3)], hiddenLines: strategy === 'auto' ? 4 : 2, renderedLines: strategy === 'auto' ? 4 : 6 });
			foldingModel.toggleCollapseState(Array.from({ length: foldingModel.regions.length }, (_, i) => foldingModel.regions.toRegion(i)));
			const primary = disposables.add(languageFeatures.foldingRangeProvider.register('*', { provideFoldingRanges: () => [] }));
			const withPrimary = getRanges((await controller.getFoldingModel())!.regions);
			primary.dispose();
			const withoutPrimary = getRanges((await controller.getFoldingModel())!.regions);
			customRanges = [r(5, 6)];
			changes.fire(provider);
			const afterChange = getRanges((await controller.getFoldingModel())!.regions);
			registration.dispose();
			const afterRemoval = getRanges((await controller.getFoldingModel())!.regions);
			assert.deepStrictEqual({ withPrimary, withoutPrimary, afterChange, afterRemoval }, strategy === 'auto' ? {
				withPrimary: [r(5, 7)], withoutPrimary: [r(1, 3), r(5, 7)], afterChange: [r(1, 3), r(5, 6)], afterRemoval: [r(1, 3)]
			} : { withPrimary: [r(1, 3)], withoutPrimary: [r(1, 3)], afterChange: [r(1, 3)], afterRemoval: [r(1, 3)] });
		});
	}

	test('Limit by nesting level', async () => {
		const lines = [
			/* 1*/	'{',
			/* 2*/	'  A',
			/* 3*/	'  {',
			/* 4*/	'    {',
			/* 5*/	'      B',
			/* 6*/	'    }',
			/* 7*/	'    {',
			/* 8*/	'      A',
			/* 9*/	'      {',
			/* 10*/	'         A',
			/* 11*/	'      }',
			/* 12*/	'      {',
			/* 13*/	'        {',
			/* 14*/	'          {',
			/* 15*/	'             A',
			/* 16*/	'          }',
			/* 17*/	'        }',
			/* 18*/	'      }',
			/* 19*/	'    }',
			/* 20*/	'  }',
			/* 21*/	'}',
			/* 22*/	'{',
			/* 23*/	'  A',
			/* 24*/	'}',
		];

		const r1 = r(1, 20);  //0
		const r2 = r(3, 19);  //1
		const r3 = r(4, 5);   //2
		const r4 = r(7, 18);  //2
		const r5 = r(9, 10);  //3
		const r6 = r(12, 17); //4
		const r7 = r(13, 16); //5
		const r8 = r(14, 15); //6
		const r9 = r(22, 23); //0

		const model = createTextModel(lines.join('\n'));
		const ranges = [r1, r2, r3, r4, r5, r6, r7, r8, r9];
		const providers = [new TestFoldingRangeProvider(model, ranges)];

		async function assertLimit(maxEntries: number, expectedRanges: IndentRange[], message: string) {
			let reported: number | false = false;
			const foldingRangesLimit: FoldingLimitReporter = { limit: maxEntries, update: (computed, limited) => reported = limited };
			const syntaxRangeProvider = new SyntaxRangeProvider(model, providers, () => { }, foldingRangesLimit, undefined);
			try {
				const indentRanges = await syntaxRangeProvider.compute(CancellationToken.None);
				const actual: IndentRange[] = [];
				if (indentRanges) {
					for (let i = 0; i < indentRanges.length; i++) {
						actual.push({ start: indentRanges.getStartLineNumber(i), end: indentRanges.getEndLineNumber(i) });
					}
					assert.equal(reported, 9 <= maxEntries ? false : maxEntries, 'limited');
				}
				assert.deepStrictEqual(actual, expectedRanges, message);
			} finally {
				syntaxRangeProvider.dispose();
			}

		}

		await assertLimit(1000, [r1, r2, r3, r4, r5, r6, r7, r8, r9], '1000');
		await assertLimit(9, [r1, r2, r3, r4, r5, r6, r7, r8, r9], '9');
		await assertLimit(8, [r1, r2, r3, r4, r5, r6, r7, r9], '8');
		await assertLimit(7, [r1, r2, r3, r4, r5, r6, r9], '7');
		await assertLimit(6, [r1, r2, r3, r4, r5, r9], '6');
		await assertLimit(5, [r1, r2, r3, r4, r9], '5');
		await assertLimit(4, [r1, r2, r3, r9], '4');
		await assertLimit(3, [r1, r2, r9], '3');
		await assertLimit(2, [r1, r9], '2');
		await assertLimit(1, [r1], '1');
		await assertLimit(0, [], '0');

		model.dispose();
	});
});
