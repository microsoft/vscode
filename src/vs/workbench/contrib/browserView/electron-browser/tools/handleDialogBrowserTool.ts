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

export const HandleDialogBrowserToolData: IToolData = {
	id: 'handle_dialog',
	toolReferenceName: 'handleDialog',
	displayName: localize('handleDialogBrowserTool.displayName', 'Handle Dialog'),
	userDescription: localize('handleDialogBrowserTool.userDescription', 'Respond to a dialog in a browser page'),
	modelDescription: 'Respond to a pending dialog (alert, confirm, prompt) or file chooser dialog on a browser page.',
	icon: Codicon.comment,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or ${OpenPageToolId}.`
			},
			accept: {
				type: 'boolean',
				description: 'Whether to accept (true) or dismiss (false) the dialog.'
			},
			promptText: {
				type: 'string',
				description: 'Text to enter into a prompt dialog. Only applicable for prompt dialogs.'
			},
			files: {
				type: 'array',
				items: { type: 'string' },
				description: 'Absolute paths of files to select. Required for file chooser dialogs.'
			},
		},
		required: ['pageId', 'accept'],
	},
};

interface IHandleDialogBrowserToolParams {
	pageId: string;
	accept: boolean;
	promptText?: string;
	files?: string[];
}

export class HandleDialogBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('browser.handleDialog.invocation', "Handling browser dialog"),
			pastTenseMessage: localize('browser.handleDialog.past', "Handled browser dialog"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IHandleDialogBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		try {
			let result;
			if (params.files !== undefined) {
				result = await this.playwrightService.replyToFileChooser(params.pageId, params.accept ? params.files : []);
			} else {
				result = await this.playwrightService.replyToDialog(params.pageId, params.accept, params.promptText);
			}
			return { content: [{ kind: 'text', value: result.summary }] };
		} catch (e) {
			return errorResult(e instanceof Error ? e.message : String(e));
		}
	}
}
