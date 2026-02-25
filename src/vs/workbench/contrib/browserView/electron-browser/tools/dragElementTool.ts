/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const DragElementToolData: IToolData = {
	id: 'drag_element',
	toolReferenceName: 'dragElement',
	displayName: localize('dragElementTool.displayName', 'Drag Element'),
	userDescription: localize('dragElementTool.userDescription', 'Drag an element over another element'),
	modelDescription: 'Drag an element over another element in a browser page.',
	icon: Codicon.move,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or ${OpenPageToolId}.`
			},
			fromSelector: {
				type: 'string',
				description: 'Playwright selector of the element to drag.'
			},
			fromRef: {
				type: 'string',
				description: 'Element reference of the element to drag. One of "fromSelector" or "fromRef" must be provided.'
			},
			toSelector: {
				type: 'string',
				description: 'Playwright selector of the element to drop onto.'
			},
			toRef: {
				type: 'string',
				description: 'Element reference of the element to drop onto. One of "toSelector" or "toRef" must be provided.'
			},
		},
		required: ['pageId'],
	},
};

interface IDragElementToolParams {
	pageId: string;
	fromSelector?: string;
	fromRef?: string;
	toSelector?: string;
	toRef?: string;
}

export class DragElementTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('browser.drag.invocation', "Dragging element in browser"),
			pastTenseMessage: localize('browser.drag.past', "Dragged element in browser"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IDragElementToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let fromSelector = params.fromSelector;
		if (params.fromRef) {
			fromSelector = `aria-ref=${params.fromRef}`;
		}
		if (!fromSelector) {
			return errorResult('Either a "fromSelector" or "fromRef" parameter is required for the source element.');
		}

		let toSelector = params.toSelector;
		if (params.toRef) {
			toSelector = `aria-ref=${params.toRef}`;
		}
		if (!toSelector) {
			return errorResult('Either a "toSelector" or "toRef" parameter is required for the target element.');
		}

		return playwrightInvoke(this.playwrightService, params.pageId, (page, from, to) => page.dragAndDrop(from, to), fromSelector, toSelector);
	}
}
