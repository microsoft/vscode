/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ChatExternalPathConfirmationContribution } from '../../../chat/common/tools/builtinTools/chatExternalPathConfirmation.js';
import { ILanguageModelToolConfirmationActions } from '../../../chat/common/tools/languageModelToolsConfirmationService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, errorResult, getSessionId } from './browserToolHelpers.js';
import { BrowserChatToolReferenceName } from '../../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const HandleDialogBrowserToolId = 'handle_dialog';

export const HandleDialogBrowserToolData: IToolData = {
	id: HandleDialogBrowserToolId,
	toolReferenceName: BrowserChatToolReferenceName.HandleDialog,
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
				description: 'Absolute paths of files to select, or an empty array to dismiss. Required for file chooser dialogs.'
			},
		},
		required: ['pageId'],
	},
};

interface IHandleDialogBrowserToolParams {
	pageId: string;
	acceptModal?: boolean;
	promptText?: string;
	selectFiles?: string[];
}

function validateParameters(params: IHandleDialogBrowserToolParams): string | undefined {
	if (!params?.pageId || typeof params.pageId !== 'string') {
		return `No page ID provided. Use '${OpenPageToolId}' first.`;
	}

	if (params.selectFiles !== undefined && (params.acceptModal !== undefined || params.promptText !== undefined)) {
		return `Invalid parameters. 'selectFiles' cannot be used with 'acceptModal' or 'promptText'.`;
	}

	if (!Array.isArray(params.selectFiles) && (params.acceptModal === undefined || params.acceptModal === null)) {
		return `Invalid parameters. Either 'selectFiles' or 'acceptModal' must be provided.`;
	}

	if (Array.isArray(params.selectFiles) && params.selectFiles.some(path => typeof path !== 'string' || !isAbsolute(path))) {
		return `Invalid parameters. 'selectFiles' must contain only nonempty absolute file paths.`;
	}

	return undefined;
}

export class HandleDialogBrowserToolConfirmationContribution extends ChatExternalPathConfirmationContribution {
	constructor(@ILabelService labelService: ILabelService) {
		super(ref => {
			const params = ref.parameters as IHandleDialogBrowserToolParams;
			return !validateParameters(params) && Array.isArray(params.selectFiles) ? params.selectFiles.map(path => ({ path, isDirectory: false })) : undefined;
		}, labelService);
	}

	protected override getSessionApprovalLabels(folderCount: number): Pick<ILanguageModelToolConfirmationActions, 'label' | 'detail'> {
		return {
			label: folderCount === 1
				? localize('browser.handleDialog.allowFolderSession', "Allow Uploads from This Folder in This Session")
				: localize('browser.handleDialog.allowFoldersSession', "Allow Uploads from These Folders in This Session"),
			detail: folderCount === 1
				? localize('browser.handleDialog.allowFolderSessionDetail', "Allow files from this folder to be uploaded to browser pages without further confirmation in this chat session.")
				: localize('browser.handleDialog.allowFoldersSessionDetail', "Allow files from these folders to be uploaded to browser pages without further confirmation in this chat session."),
		};
	}
}

export class HandleDialogBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const params = context.parameters as IHandleDialogBrowserToolParams;
		const validationError = validateParameters(params);
		if (validationError) {
			throw new Error(validationError);
		}
		const link = createBrowserPageLink(params.pageId);
		const confirmationMessages = Array.isArray(params.selectFiles) && params.selectFiles.length
			? {
				title: params.selectFiles.length === 1
					? localize('browser.handleDialog.uploadConfirmationTitle', "Upload File?")
					: localize('browser.handleDialog.uploadConfirmationTitlePlural', "Upload Files?"),
				message: this._getUploadConfirmationMessage(params.selectFiles, link),
				allowAutoConfirm: true,
			}
			: undefined;
		return {
			invocationMessage: new MarkdownString(localize('browser.handleDialog.invocation', "Handling dialog in {0}", link)),
			pastTenseMessage: new MarkdownString(localize('browser.handleDialog.past', "Handled dialog in {0}", link)),
			confirmationMessages,
		};
	}

	private _getUploadConfirmationMessage(files: readonly string[], link: string): MarkdownString {
		const message = new MarkdownString(files.length === 1
			? localize('browser.handleDialog.uploadConfirmationMessage', "Allow this file to be uploaded to {0}?", link)
			: localize('browser.handleDialog.uploadConfirmationMessagePlural', "Allow these files to be uploaded to {0}?", link));
		for (const file of files) {
			message.appendMarkdown('\n\n- ');
			message.appendText(file);
		}
		return message;
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IHandleDialogBrowserToolParams;
		const validationError = validateParameters(params);
		if (validationError) {
			return errorResult(validationError);
		}
		const sessionId = getSessionId(invocation);

		try {
			let result;
			if (params.selectFiles !== undefined) {
				result = await this.playwrightService.replyToFileChooser(sessionId, params.pageId, params.selectFiles);
			} else {
				result = await this.playwrightService.replyToDialog(sessionId, params.pageId, params.acceptModal!, params.promptText);
			}
			return { content: [{ kind: 'text', value: result.summary }] };
		} catch (e) {
			return errorResult(e instanceof Error ? e.message : String(e));
		}
	}
}
