/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const ClickCoordinateBrowserToolData: IToolData = {
	id: 'click_coordinates',
	toolReferenceName: 'clickCoordinates',
	displayName: localize('clickCoordinateBrowserTool.displayName', 'Click Coordinates'),
	userDescription: localize('clickCoordinateBrowserTool.userDescription', 'Click at viewport-relative coordinates in a browser page'),
	modelDescription: 'Click at viewport-relative coordinates in a browser page. Coordinates are measured from the top-left corner of the visible viewport, not the page origin.',
	icon: Codicon.cursor,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: 'The browser page ID, acquired from context or the open tool.'
			},
			x: {
				type: 'number',
				minimum: 0,
				description: 'Horizontal coordinate in CSS pixels from the left edge of the visible viewport.'
			},
			y: {
				type: 'number',
				minimum: 0,
				description: 'Vertical coordinate in CSS pixels from the top edge of the visible viewport.'
			},
			dblClick: {
				type: 'boolean',
				description: 'Set to true for double clicks. Default is false.'
			},
			button: {
				type: 'string',
				enum: ['left', 'right', 'middle'],
				description: 'Mouse button to click with. Default is "left".'
			},
		},
		required: ['pageId', 'x', 'y']
	},
};

interface IClickCoordinateBrowserToolParams {
	pageId: string;
	x: number;
	y: number;
	dblClick?: boolean;
	button?: 'left' | 'right' | 'middle';
}

export class ClickCoordinateBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = _context.parameters as IClickCoordinateBrowserToolParams;
		const link = createBrowserPageLink(params.pageId);
		const coordinateLabel = `(${params.x}, ${params.y})`;
		return {
			invocationMessage: params.button === 'right'
				? new MarkdownString(localize('browser.clickCoordinates.invocation.right', 'Right-clicking {0} in {1}', coordinateLabel, link))
				: params.button === 'middle'
					? new MarkdownString(localize('browser.clickCoordinates.invocation.middle', 'Middle-clicking {0} in {1}', coordinateLabel, link))
					: params.dblClick
						? new MarkdownString(localize('browser.clickCoordinates.invocation.double', 'Double-clicking {0} in {1}', coordinateLabel, link))
						: new MarkdownString(localize('browser.clickCoordinates.invocation', 'Clicking {0} in {1}', coordinateLabel, link)),
			pastTenseMessage: params.button === 'right'
				? new MarkdownString(localize('browser.clickCoordinates.past.right', 'Right-clicked {0} in {1}', coordinateLabel, link))
				: params.button === 'middle'
					? new MarkdownString(localize('browser.clickCoordinates.past.middle', 'Middle-clicked {0} in {1}', coordinateLabel, link))
					: params.dblClick
						? new MarkdownString(localize('browser.clickCoordinates.past.double', 'Double-clicked {0} in {1}', coordinateLabel, link))
						: new MarkdownString(localize('browser.clickCoordinates.past', 'Clicked {0} in {1}', coordinateLabel, link)),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IClickCoordinateBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		if (!Number.isFinite(params.x) || !Number.isFinite(params.y)) {
			return errorResult('Both "x" and "y" must be finite viewport coordinates.');
		}

		const button = params.button ?? 'left';
		const clickCount = params.dblClick ? 2 : 1;

		return playwrightInvoke(this.playwrightService, params.pageId, (page, x, y, btn, count) => page.mouse.click(x, y, { button: btn, clickCount: count }), params.x, params.y, button, clickCount);
	}
}