/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { describe, expect, it } from 'vitest';
import { StringTextDocument } from '../../../../platform/editing/common/abstractText';
import { getStructureUsingIndentation } from '../../../../platform/parser/node/indentationStructure';
import { Position, Range } from '../../../../vscodeTypes';
import { getAdjustedSelection } from '../inline/adjustSelection';

describe('adjustSelection', () => {

	it('should adjust selection in Swift code', async () => {

		const code = `import Foundation\nimport CoreMotion\n\n`;

		const doc = new StringTextDocument(code);

		const ast = getStructureUsingIndentation(doc, 'swift', undefined);
		const selection = new Range(new Position(3, 0), new Position(3, 0));

		const result = getAdjustedSelection(ast, doc, selection);
		expect(result.adjusted.toString()).toMatchInlineSnapshot(`"[36, 37)"`);
	});
});
