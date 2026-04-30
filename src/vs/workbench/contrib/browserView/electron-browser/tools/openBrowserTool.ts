/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatQuestion, IChatQuestionAnswers, IChatService, IChatSingleSelectAnswer } from '../../../chat/common/chatService/chatService.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../chat/common/constants.js';
import { ChatQuestionCarouselData } from '../../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatRequestModel } from '../../../chat/common/model/chatModel.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { createBrowserPageLink, findExistingPagesByHost, getExistingPagesResult } from './browserToolHelpers.js';

export const OpenPageToolId = 'open_browser_page';

export const OpenBrowserToolData: IToolData = {
	id: OpenPageToolId,
	toolReferenceName: 'openBrowserPage',
	displayName: localize('openBrowserTool.displayName', 'Open Browser Page'),
	userDescription: localize('openBrowserTool.userDescription', 'Open a URL in the integrated browser'),
	modelDescription: `Open a new browser page in the integrated browser at the given URL.
May prompt the user to share a page if there is a similar one already open, unless "forceNew" is true.
Returns a page ID that must be used with other browser tools to interact with the page, as well as an accessibility snapshot of the page.

Important: Prefer to reuse existing pages whenever possible and only call this tool if you do not already have access to a tab you can reuse.`,
	icon: Codicon.openInProduct,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The URL to open in the browser. Must be an absolute URI with a scheme such as file:, http:, or https:. For local files, use the canonical absolute form, for example file:///path/to/file.'
			},
			forceNew: {
				type: 'boolean',
				description: 'Whether to force opening a new page even if a page with the same host already exists. Default is false.'
			}
		},
		$comment: 'If you omit "url", the user will be prompted to share an existing page instead. Use this if there are unshared pages that the user may be interested in sharing with you.'
	},
};

export interface IOpenBrowserToolParams {
	url?: string;
	forceNew?: boolean;
}

const DECLINE_OPTION_ID = '__decline__';

export class OpenBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IAgentNetworkFilterService private readonly agentNetworkFilterService: IAgentNetworkFilterService,
		@IChatService private readonly chatService: IChatService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IOpenBrowserToolParams;

		if (!params.url) {
			return {
				invocationMessage: localize('browser.open.prompt.invocation', "Prompting user to share a browser tab"),
				pastTenseMessage: localize('browser.open.prompt.past', "Prompted user to share a browser tab"),
			};
		}

		const parsed = URL.parse(params.url);
		if (!parsed) {
			throw new Error('You must provide a complete, valid URL.');
		}

		params.url = parsed.href; // Ensure URL is in a normalized format

		const uri = URI.parse(params.url);
		if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
			throw new Error(this.agentNetworkFilterService.formatError(uri));
		}

		return {
			invocationMessage: localize('browser.open.invocation', "Opening browser page at {0}", parsed.href),
			pastTenseMessage: localize('browser.open.past', "Opened browser page at {0}", parsed.href),
			confirmationMessages: {
				title: localize('browser.open.confirmTitle', 'Open Browser Page?'),
				message: localize('browser.open.confirmMessage', 'This will open {0} in the integrated browser. The agent will be able to read and interact with its contents.', parsed.href),
				allowAutoConfirm: true,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IOpenBrowserToolParams;

		// If no URL is specified, prompt the user for a page to share.
		if (!params.url) {
			const allPages = [...this.browserViewService.getKnownBrowserViews().values()];
			if (allPages.length === 0) {
				return { content: [{ kind: 'text', value: 'No browser pages are currently open.' }] };
			}

			const shareResult = await this._promptForUnsharedPages(invocation, allPages, params, token);
			if (shareResult) {
				return shareResult;
			} else {
				return { content: [{ kind: 'text', value: 'The user opted not to share an existing page.' }] };
			}
		}

		if (!params.forceNew) {
			// If there are already-shared pages, tell the model to reuse them
			const shared = findExistingPagesByHost(this.browserViewService, params.url, { includeBlank: true, sharingState: BrowserViewSharingState.Shared });
			const alreadyShared = await getExistingPagesResult(this.editorService, shared, { agentNetworkFilterService: this.agentNetworkFilterService });
			if (alreadyShared) {
				return alreadyShared;
			}

			// If there are unshared (but shareable) pages on the same host, prompt user to share one
			const unshared = findExistingPagesByHost(this.browserViewService, params.url, { includeBlank: false, sharingState: BrowserViewSharingState.NotShared });
			if (unshared.length > 0) {
				const shareResult = await this._promptForUnsharedPages(invocation, unshared, params, token);
				if (shareResult) {
					return shareResult;
				}
			}
		}

		return this._openNewPage(params.url);
	}

	/**
	 * Shows a carousel prompting the user to share one of the given unshared
	 * browser pages instead of opening a new page. Returns `undefined` if the
	 * prompt should be skipped or the user chose to open a new page.
	 */
	private async _promptForUnsharedPages(invocation: IToolInvocation, candidateEditors: BrowserEditorInput[], params: IOpenBrowserToolParams, token: CancellationToken): Promise<IToolResult | undefined> {

		const chatSessionResource = invocation.context?.sessionResource;
		const chatRequestId = invocation.chatRequestId;
		const request = this._getRequest(chatSessionResource, chatRequestId);

		if (!request) {
			return undefined; // No chat context — skip prompt, proceed to open
		}

		// In autopilot/auto-reply, don't block — just open the new page
		if (request.modeInfo?.permissionLevel === ChatPermissionLevel.Autopilot || this.configService.getValue<boolean>(ChatConfiguration.AutoReply)) {
			return undefined;
		}

		const carousel = this._buildShareCarousel(candidateEditors, params.url, invocation.chatStreamToolCallId ?? invocation.callId);
		this.chatService.appendProgress(request, carousel);

		const externalAnswerListener = this.chatService.onDidReceiveQuestionCarouselAnswer(event => {
			if (event.resolveId !== carousel.resolveId || carousel.isUsed) {
				return;
			}
			carousel.dismiss(event.answers);
		});

		let answerResult: { answers: IChatQuestionAnswers | undefined } | undefined;
		try {
			answerResult = await raceCancellation(carousel.completion.p, token);
		} catch (error) {
			if (error instanceof CancellationError) {
				carousel.dismiss(undefined);
			}
			throw error;
		} finally {
			externalAnswerListener.dispose();
		}

		if (!answerResult || token.isCancellationRequested) {
			carousel.dismiss(undefined);
			throw new CancellationError();
		}

		// Extract the selected option
		const selectedOptionId = this._extractSelectedOption(answerResult.answers);

		// User skipped/cancelled or chose "Open new page" — fall through to open
		if (!selectedOptionId || selectedOptionId === DECLINE_OPTION_ID) {
			return undefined;
		}

		// User selected an existing tab
		const editor = this.browserViewService.getKnownBrowserViews().get(selectedOptionId);
		if (!editor) {
			this.logService.warn(`[OpenBrowserTool] Selected option '${selectedOptionId}' not found.`);
			return undefined;
		}

		return this._shareExistingPage(editor);
	}

	private _buildShareCarousel(editors: BrowserEditorInput[], url: string | undefined, resolveId: string): ChatQuestionCarouselData {
		const options: IChatQuestion['options'] = [];

		for (const editor of editors) {
			const editorTitle = (editor.title || editor.getName()).replaceAll(' - ', '\u00A0-\u00A0'); // nbsp around hyphens to prevent formatting in the carousel
			const editorUrl = editor.url || 'about:blank';
			const truncatedUrl = editorUrl.length > 40 ? editorUrl.substring(0, 40) + '\u2026' : editorUrl;
			options.push({
				id: editor.id,
				label: localize(
					{ key: 'browser.open.shareExistingOption', comment: ['{Locked=" - "}', '{0} is the editor title', '{1} is the truncated URL'] },
					'Yes, share "{0}" - {1}',
					editorTitle,
					truncatedUrl,
				),
				value: editor.id,
			});
		}

		// Default option: decline sharing
		options.push({
			id: DECLINE_OPTION_ID,
			label: url
				? localize('browser.open.newPageOption', "No, open a new page at {0}", url)
				: localize({ key: 'browser.open.noPagesOption', comment: ['{Locked=" - "}'] }, "No - Do not share any tabs with the agent"),
			value: DECLINE_OPTION_ID,
		});

		const question: IChatQuestion = {
			id: `${resolveId}:0`,
			type: 'singleSelect',
			title: localize('browser.open.shareQuestion.title', "Share Browser Tab"),
			message: localize('browser.open.shareQuestion.message', "Share an existing browser tab?"),
			options,
			defaultValue: DECLINE_OPTION_ID,
			allowFreeformInput: false,
		};

		return new ChatQuestionCarouselData([question], true, resolveId);
	}

	private _extractSelectedOption(answers: IChatQuestionAnswers | undefined): string | undefined {
		if (!answers) {
			return undefined;
		}

		for (const answer of Object.values(answers)) {
			if (typeof answer === 'string') {
				return answer;
			}
			if (typeof answer === 'object' && answer !== null && hasKey(answer, { selectedValue: true })) {
				return (answer as IChatSingleSelectAnswer).selectedValue;
			}
		}

		return undefined;
	}

	private async _openNewPage(url: string): Promise<IToolResult> {
		const { pageId, summary } = await this.playwrightService.openPage(url);
		return this._pageResult(pageId, summary, localize('browser.open.result', "Opened {0}", createBrowserPageLink(pageId)));
	}

	private async _shareExistingPage(editor: BrowserEditorInput): Promise<IToolResult> {
		const model = await editor.resolve();
		if (model.sharingState !== BrowserViewSharingState.Shared) {
			if (!(await model.setSharedWithAgent(true))) {
				return { content: [{ kind: 'text', value: 'The user declined to share the page.' }] };
			}
		}

		const summary = await this.playwrightService.getSummary(editor.id);
		return this._pageResult(editor.id, summary, localize('browser.open.sharedResult', "User shared {0}", createBrowserPageLink(editor.id)));
	}

	private _pageResult(pageId: string, summary: string, resultMessage: string): IToolResult {
		return {
			content: [
				{ kind: 'text', value: `Page ID: ${pageId}\n\nSummary:\n` },
				{ kind: 'text', value: summary },
			],
			toolResultMessage: new MarkdownString(resultMessage),
		};
	}

	private _getRequest(chatSessionResource: URI | undefined, chatRequestId: string | undefined): IChatRequestModel | undefined {
		if (!chatSessionResource) {
			return undefined;
		}

		const model = this.chatService.getSession(chatSessionResource);
		if (!model) {
			return undefined;
		}

		if (chatRequestId) {
			const request = model.getRequests().find(r => r.id === chatRequestId);
			if (request) {
				return request;
			}
		}

		return model.getRequests().at(-1);
	}
}
