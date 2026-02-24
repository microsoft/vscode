/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';
import { ReadBrowserToolData } from './readBrowserTool.js';

export const ScreenshotBrowserToolData: IToolData = {
	id: 'screenshot_page',
	toolReferenceName: 'screenshotPage',
	displayName: localize('screenshotBrowserTool.displayName', 'Screenshot Page'),
	userDescription: localize('screenshotBrowserTool.userDescription', 'Capture a screenshot of a browser page'),
	modelDescription: `Capture a screenshot of the current browser page. You can't perform actions based on the screenshot; use ${ReadBrowserToolData.id} for actions.`,
	icon: Codicon.deviceCamera,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID to capture, acquired from context or ${OpenPageToolId}.`
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of an element to capture. If omitted, captures the whole page.'
			},
			ref: {
				type: 'string',
				description: 'Element reference to capture. If omitted, captures the whole page.'
			},
			fullPage: {
				type: 'boolean',
				description: 'Set to true to capture the full scrollable page instead of just the viewport. Incompatible with selector/ref.'
			},
		},
		required: ['pageId'],
	},
};

interface IScreenshotBrowserToolParams {
	pageId: string;
	selector?: string;
	ref?: string;
	fullPage?: boolean;
}

export class ScreenshotBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('browser.screenshot.invocation', "Capturing browser screenshot"),
			pastTenseMessage: localize('browser.screenshot.past', "Captured browser screenshot"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IScreenshotBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let selector = params.selector;
		if (params.ref) {
			selector = `aria-ref=${params.ref}`;
		}

		const screenshot = await this.playwrightService.captureScreenshot(params.pageId, selector, params.fullPage);

		return {
			content: [
				{
					kind: 'data',
					value: {
						mimeType: 'image/jpeg',
						data: screenshot,
					},
				},
			],
		};
	}
}
