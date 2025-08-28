/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IURLHandler, IURLService, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { showChatView } from './chat.js';
import { ChatModeKind } from '../common/constants.js';
import { IChatModeService } from '../common/chatModes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';

// URL format: code-oss:chat-message?prompt=Hello%20World&mode=agent
export class ChatMessageUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.chatMessageUrlHandler';
	private static readonly MAX_PROMPT_LENGTH = 10000; // characters

	constructor(
		@IURLService urlService: IURLService,
		@IViewsService private readonly viewsService: IViewsService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		// Only handle our specific path
		if (uri.path !== 'chat-message') {
			return false;
		}

		try {
			const searchParams = new URLSearchParams(uri.query);
			const promptText = searchParams.get('prompt');
			const modeParam = searchParams.get('mode');

			if (!promptText) {
				this.logService.error('[ChatMessageUrlHandler] No prompt parameter provided');
				return true;
			}

			// Decode and validate prompt text
			const decodedPrompt = decodeURIComponent(promptText);

			// Length validation
			if (decodedPrompt.length > ChatMessageUrlHandler.MAX_PROMPT_LENGTH) {
				this.logService.error('[ChatMessageUrlHandler] Prompt too long');
				this.notificationService.error(
					localize('promptTooLong', 'Prompt text is too long (max {0} characters)',
						ChatMessageUrlHandler.MAX_PROMPT_LENGTH)
				);
				return true;
			}

			// Mode validation - use chat mode service to validate modes (supports both builtin and custom modes)
			let requestedMode = ChatModeKind.Agent; // default
			if (modeParam) {
				const mode = this.chatModeService.findModeById(modeParam) ?? this.chatModeService.findModeByName(modeParam);
				if (mode) {
					requestedMode = mode.id as ChatModeKind;
				} else {
					this.logService.warn(`[ChatMessageUrlHandler] Unknown chat mode: ${modeParam}, using default 'agent' mode`);
				}
			}

			// Focus window first
			await this.hostService.focus(mainWindow);

			// Show confirmation dialog unless the URL is explicitly trusted
			if (!options?.trusted && await this.shouldBlockChatMessage(decodedPrompt)) {
				return true;
			}

			// Proceed with opening chat
			const mode = this.chatModeService.findModeById(requestedMode);
			const chatWidget = await showChatView(this.viewsService);

			if (chatWidget) {
				if (mode) {
					chatWidget.input.setChatMode(mode.id);
				}
				await chatWidget.waitForReady();
				chatWidget.setInput(decodedPrompt);
				chatWidget.focusInput();
			}

			return true;
		} catch (error) {
			this.logService.error(`[ChatMessageUrlHandler] Error handling chat message URL ${uri.toString()}`, error);
			return true;
		}
	}

	private async shouldBlockChatMessage(messageText: string): Promise<boolean> {
		// Truncate preview for display
		const previewText = messageText.length > 200
			? messageText.substring(0, 200) + '...'
			: messageText;

		const detail = new MarkdownString('', { supportHtml: true });
		detail.appendMarkdown(localize('confirmChatMessageDetail', "This will insert the following text into chat:\n\n"));
		detail.appendMarkdown(`\`\`\`\n${previewText}\n\`\`\``);
		detail.appendMarkdown(localize('confirmChatMessageSecurity',
			"\n\nIf you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'."));

		const { confirmed } = await this.dialogService.confirm({
			type: 'info',
			primaryButton: localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
			cancelButton: localize('noButton', "No"),
			message: localize('confirmChatMessage', "An external application wants to insert text into chat. Do you want to continue?"),
			custom: {
				markdownDetails: [{
					markdown: detail
				}]
			}
		});

		return !confirmed;
	}
}
