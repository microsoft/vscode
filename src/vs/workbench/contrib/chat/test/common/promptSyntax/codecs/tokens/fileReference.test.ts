/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from '../../../../../../../../base/common/numbers.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../../base/common/types.js';
import { BaseToken } from '../../../../../common/promptSyntax/codecs/base/baseToken.js';
import { PromptToken } from '../../../../../common/promptSyntax/codecs/tokens/promptToken.js';
import { FileReference } from '../../../../../common/promptSyntax/codecs/tokens/fileReference.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { PromptVariable, PromptVariableWithData } from '../../../../../common/promptSyntax/codecs/tokens/promptVariable.js';

suite('FileReference', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('linkRange', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const path = `/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.txt`;
		const columnEndNumber = columnStartNumber + path.length;

		const range = new Range(
			lineNumber,
			columnStartNumber,
			lineNumber,
			columnEndNumber,
		);
		const fileReference = new FileReference(range, path);
		const { linkRange } = fileReference;

		assertDefined(
			linkRange,
			'The link range must be defined.',
		);

		const expectedLinkRange = new Range(
			lineNumber,
			columnStartNumber + '#file:'.length,
			lineNumber,
			columnStartNumber + path.length,
		);
		assert(
			expectedLinkRange.equalsRange(linkRange),
			`Expected link range to be ${expectedLinkRange}, got ${linkRange}.`,
		);
	});

	test('path', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const link = `/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.txt`;
		const columnEndNumber = columnStartNumber + link.length;

		const range = new Range(
			lineNumber,
			columnStartNumber,
			lineNumber,
			columnEndNumber,
		);
		const fileReference = new FileReference(range, link);

		assert.strictEqual(
			fileReference.path,
			link,
			'Must return the correct link path.',
		);
	});

	test('extends `PromptVariableWithData` and others', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const link = `/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.txt`;
		const columnEndNumber = columnStartNumber + link.length;

		const range = new Range(
			lineNumber,
			columnStartNumber,
			lineNumber,
			columnEndNumber,
		);
		const fileReference = new FileReference(range, link);

		assert(
			fileReference instanceof PromptVariableWithData,
			'Must extend `PromptVariableWithData`.',
		);

		assert(
			fileReference instanceof PromptVariable,
			'Must extend `PromptVariable`.',
		);

		assert(
			fileReference instanceof PromptToken,
			'Must extend `PromptToken`.',
		);

		assert(
			fileReference instanceof BaseToken,
			'Must extend `BaseToken`.',
		);
	});
});
