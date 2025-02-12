/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from '../../../../../../../../base/common/numbers.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { MarkdownLink } from '../../../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { BaseToken } from '../../../../../../../../editor/common/codecs/baseToken.js';
import { MarkdownToken } from '../../../../../../../../editor/common/codecs/markdownCodec/tokens/markdownToken.js';

suite('FileReference', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('`linkRange`', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const caption = `[link-caption-${randomInt(Number.MAX_SAFE_INTEGER)}]`;
		const link = `(/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.md)`;

		const markdownLink = new MarkdownLink(
			lineNumber,
			columnStartNumber,
			caption,
			link,
		);
		const { linkRange } = markdownLink;

		assertDefined(
			linkRange,
			'The link range must be defined.',
		);

		const expectedLinkRange = new Range(
			lineNumber,
			// `+1` for the openning `(` character of the link
			columnStartNumber + caption.length + 1,
			lineNumber,
			// `+1` for the openning `(` character of the link, and
			// `-2` for the enclosing `()` part of the link
			columnStartNumber + caption.length + 1 + link.length - 2,
		);
		assert(
			expectedLinkRange.equalsRange(linkRange),
			`Expected link range to be ${expectedLinkRange}, got ${linkRange}.`,
		);
	});

	test('`path`', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const caption = `[link-caption-${randomInt(Number.MAX_SAFE_INTEGER)}]`;
		const rawLink = `/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.md`;
		const link = `(${rawLink})`;

		const markdownLink = new MarkdownLink(
			lineNumber,
			columnStartNumber,
			caption,
			link,
		);
		const { path } = markdownLink;

		assert.strictEqual(
			path,
			rawLink,
			'Must return the correct link value.',
		);
	});

	test('extends `MarkdownToken`', () => {
		const lineNumber = randomInt(100, 1);
		const columnStartNumber = randomInt(100, 1);
		const caption = `[link-caption-${randomInt(Number.MAX_SAFE_INTEGER)}]`;
		const rawLink = `/temp/test/file-${randomInt(Number.MAX_SAFE_INTEGER)}.md`;
		const link = `(${rawLink})`;

		const markdownLink = new MarkdownLink(
			lineNumber,
			columnStartNumber,
			caption,
			link,
		);

		assert(
			markdownLink instanceof MarkdownToken,
			'Must extend `MarkdownToken`.',
		);

		assert(
			markdownLink instanceof BaseToken,
			'Must extend `BaseToken`.',
		);
	});
});
