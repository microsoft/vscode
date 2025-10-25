/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITextModel } from '../../../../common/model.js';
import { FoldingContext, FoldingRange, FoldingRangeProvider, ProviderResult } from '../../../../common/languages.js';
import { SyntaxRangeProvider } from '../../browser/syntaxRangeProvider.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { FoldingLimitReporter } from '../../browser/folding.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

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
	ensureNoDisposablesAreLeakedInTestSuite();

	function r(start: number, end: number): IndentRange {
		return { start, end };
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
