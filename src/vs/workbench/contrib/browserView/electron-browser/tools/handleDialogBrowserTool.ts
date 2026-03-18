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
	modelDescription: 'Respond to a pending modal (alert, confirm, prompt) or file chooser dialog on a browser page.',
	icon: Codicon.comment,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or the open tool.`
			},
			acceptModal: {
				type: 'boolean',
				description: 'Whether to accept (true) or dismiss (false) a modal dialog.'
			},
			promptText: {
				type: 'string',
				description: 'Text to enter into a prompt dialog.'
			},
			selectFiles: {
				type: 'array',
				items: { type: 'string' },
				description: 'Absolute paths of files to select, or empty to dismiss. Required for file chooser dialogs.'
			},
		},
		required: ['pageId'],
	},
};

interface IHandleDialogBrowserToolParams {
	pageId: string;
	acceptModal: boolean;
	promptText?: string;
	selectFiles?: string[];
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

		if (params.selectFiles !== undefined && (params.acceptModal !== undefined || params.promptText !== undefined)) {
			return errorResult(`Invalid parameters. 'selectFiles' cannot be used with 'acceptModal' or 'promptText'.`);
		}

		if (!Array.isArray(params.selectFiles) && (params.acceptModal === undefined || params.acceptModal === null)) {
			return errorResult(`Invalid parameters. Either 'selectFiles' or 'acceptModal' must be provided.`);
		}

		try {
			let result;
			if (params.selectFiles !== undefined) {
				result = await this.playwrightService.replyToFileChooser(params.pageId, params.selectFiles);
			} else {
				result = await this.playwrightService.replyToDialog(params.pageId, params.acceptModal, params.promptText);
			}
			return { content: [{ kind: 'text', value: result.summary }] };
		} catch (e) {
			return errorResult(e instanceof Error ? e.message : String(e));
		}
	}
}
