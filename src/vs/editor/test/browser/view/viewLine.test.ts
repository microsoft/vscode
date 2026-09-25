/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ViewLine } from '../../../browser/viewParts/viewLines/viewLine.js';
import type { ViewGpuContext } from '../../../browser/gpu/viewGpuContext.js';
import type { ViewLineOptions } from '../../../browser/viewParts/viewLines/viewLineOptions.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { TextDirection } from '../../../common/model.js';
import { ViewLineRenderingData } from '../../../common/viewModel.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { TestLineToken, TestLineTokens } from '../../common/core/testLineToken.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';

function createViewLineOptions(useGpu: boolean): ViewLineOptions {
	return {
		themeType: ColorScheme.LIGHT,
		renderWhitespace: 'none',
		experimentalWhitespaceRendering: 'off',
		renderControlCharacters: false,
		spaceWidth: 10,
		middotWidth: 10,
		wsmiddotWidth: 10,
		useMonospaceOptimizations: false,
		canUseHalfwidthRightwardsArrow: true,
		lineHeight: 18,
		stopRenderingLineAfter: -1,
		fontLigatures: 'off',
		verticalScrollbarSize: 14,
		useGpu,
		equals: (other: ViewLineOptions) => other.useGpu === useGpu,
	};
}

function createViewportData(lineData: ViewLineRenderingData): ViewportData {
	return {
		selections: [],
		getViewLineRenderingData: () => lineData,
	} as unknown as ViewportData;
}

function createViewLineRenderingData(content: string): ViewLineRenderingData {
	const metadata = (1 << MetadataConsts.FOREGROUND_OFFSET) >>> 0;
	const tokens = new TestLineTokens([new TestLineToken(content.length, metadata)]);
	return new ViewLineRenderingData(
		1,
		content.length + 1,
		content,
		false,
		false,
		false,
		tokens,
		[],
		4,
		0,
		TextDirection.LTR,
		false,
	);
}

suite('ViewLine', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('re-renders DOM text when GPU fallback is needed', () => {
		const sentinel = 'SMOKE_RENDER_SENTINEL_VISIBLE_TEXT';
		const content = `const ${sentinel} = 1;`;
		const viewportData = createViewportData(createViewLineRenderingData(content));

		let canRenderOnGpu = false;
		const viewGpuContext = {
			canRender: () => canRenderOnGpu,
		} as unknown as ViewGpuContext;

		const viewLine = new ViewLine(viewGpuContext, createViewLineOptions(true));

		const firstPass = new StringBuilder(1000);
		assert.strictEqual(viewLine.renderLine(1, 0, 18, viewportData, firstPass), true);
		const firstPassHtml = firstPass.build();

		const host = document.createElement('div');
		host.innerHTML = firstPassHtml;
		assert.ok(host.textContent?.includes(sentinel));
		const firstPassDomNode = host.querySelector('.view-line');
		assert.ok(firstPassDomNode);
		viewLine.setDomNode(firstPassDomNode as HTMLElement);

		canRenderOnGpu = true;
		const secondPass = new StringBuilder(1000);
		assert.strictEqual(viewLine.renderLine(1, 0, 18, viewportData, secondPass), false);
		assert.strictEqual(secondPass.build(), '');
		assert.strictEqual(host.querySelector('.view-line'), null);

		canRenderOnGpu = false;
		const thirdPass = new StringBuilder(1000);
		assert.strictEqual(
			viewLine.renderLine(1, 0, 18, viewportData, thirdPass),
			true,
			'DOM fallback should render text after GPU rendering stops',
		);
		const thirdPassHost = document.createElement('div');
		thirdPassHost.innerHTML = thirdPass.build();
		assert.ok(thirdPassHost.textContent?.includes(sentinel));
	});
});
