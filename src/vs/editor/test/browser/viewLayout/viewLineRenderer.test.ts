/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextDirection } from '../../../common/model.js';
import { RenderLineInput, renderViewLine2 as renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { TestLineToken, TestLineTokens } from '../../common/core/testLineToken.js';

const ttPolicy = createTrustedTypesPolicy('viewLineRendererTest', { createHTML: value => value });

suite('viewLineRenderer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('centers a glyph in an exact two-cell box even when the glyph is wider', () => {
		const lineContent = '擦';
		const output = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			false,
			false,
			0,
			new TestLineTokens([new TestLineToken(lineContent.length, 0)]),
			[],
			4,
			0,
			20,
			20,
			20,
			-1,
			'none',
			false,
			false,
			null,
			null,
			14,
			false,
			true
		));

		const document = getActiveDocument();
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.fontFamily = 'sans-serif';
		container.style.fontSize = '100px';
		container.style.whiteSpace = 'pre';
		container.innerHTML = (ttPolicy?.createHTML(output.html) ?? output.html) as string;
		document.body.appendChild(container);

		try {
			const part = container.querySelector<HTMLElement>('[data-fullwidth="true"]')!;
			const glyphRange = document.createRange();
			glyphRange.selectNodeContents(part);
			const partRect = part.getBoundingClientRect();
			const glyphRect = glyphRange.getBoundingClientRect();
			glyphRange.detach();

			assert.ok(Math.abs(partRect.width - 40) < 0.01, `expected a 40px box, got ${partRect.width}px`);
			assert.ok(
				Math.abs((partRect.left + partRect.right) / 2 - (glyphRect.left + glyphRect.right) / 2) < 0.51,
				'expected the overflowing glyph to remain centered'
			);
		} finally {
			container.remove();
		}
	});

	test('preserves logical CJK order in an explicitly RTL line', () => {
		const lineContent = '擦字';
		const output = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			false,
			false,
			0,
			new TestLineTokens([new TestLineToken(lineContent.length, 0)]),
			[],
			4,
			0,
			20,
			20,
			20,
			-1,
			'none',
			false,
			false,
			null,
			TextDirection.RTL,
			14,
			false,
			true
		));

		const document = getActiveDocument();
		const container = document.createElement('div');
		container.dir = 'rtl';
		container.style.position = 'absolute';
		container.style.width = '400px';
		container.innerHTML = (ttPolicy?.createHTML(output.html) ?? output.html) as string;
		document.body.appendChild(container);

		try {
			const parts = container.querySelectorAll<HTMLElement>('[data-fullwidth="true"]');
			assert.strictEqual(parts.length, 2);
			assert.ok(parts[0].getBoundingClientRect().left < parts[1].getBoundingClientRect().left);
		} finally {
			container.remove();
		}
	});
});
