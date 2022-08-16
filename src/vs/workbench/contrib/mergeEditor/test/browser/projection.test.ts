/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { TextModelProjection } from 'vs/workbench/contrib/mergeEditor/browser/model/textModelProjection';

suite('TextModelProjection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Basic', () => {
		const source = createTextModel(`
1 this.container.appendChild(this.labelContainer);
2
3 // Beak Container
4 this.beakContainer = document.createElement('div');
<<<<<<< .\input1.ts
this.beakContainer.className = 'status-bar-item-beak-container';
=======
this.beakContainer.className = 'status-bar-beak-container';

// Add to parent
>>>>>>> .\input2.ts
5 this.container.appendChild(this.beakContainer);
6
7 this.update(entry);
`);
		const target = createTextModel('');

		const projection = TextModelProjection.createForTargetDocument(source, { blockToRemoveStartLinePrefix: '<<<<<<<', blockToRemoveEndLinePrefix: '>>>>>>>' }, target);

		assert.deepStrictEqual(target.getValue(), `
1 this.container.appendChild(this.labelContainer);
2
3 // Beak Container
4 this.beakContainer = document.createElement('div');
䷅
5 this.container.appendChild(this.beakContainer);
6
7 this.update(entry);
`);

		const transformer = projection.createMonotonousReverseTransformer();
		const lineNumbers = target.getLinesContent().map((l, idx) => idx + 1);
		const transformedLineNumbers = lineNumbers.map(n => transformer.transform(new Position(n, 1)));

		assert.deepStrictEqual(transformedLineNumbers.map(l => l.lineNumber), [
			1,
			2,
			3,
			4,
			5,
			6,
			13,
			14,
			15,
			16,
		]);

		projection.dispose();
		source.dispose();
		target.dispose();
	});
});
