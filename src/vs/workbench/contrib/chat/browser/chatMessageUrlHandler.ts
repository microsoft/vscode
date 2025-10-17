/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IURLHandler, IURLService, IOpenURLOptions } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { showChatView } from './chat.js';
import { ChatModeKind } from '../common/constants.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { InvisibleCharacters, removeAnsiEscapeCodes, AmbiguousCharacters } from '../../../../base/common/strings.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../browser/actions/chatActions.js';

const PREVIEW_MESSAGE_CHAR_LENGTH = 200;
const MAX_PROMPT_CHAR_LENGTH = 10000;

// URL format: code-oss:chat-message?prompt=Hello%20World&mode=agent
export class ChatMessageUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.chatMessageUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		if (uri.path !== 'chat-message') {
			return false;
		}

		const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('copilotWorkspaceTrust', "Copilot is currently only supported in trusted workspaces.")
		});

		if (!trusted) {
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

			const decodedPrompt = this.sanitizePromptText(decodeURIComponent(promptText));

			if (!decodedPrompt) {
				this.logService.error('[ChatMessageUrlHandler] Empty prompt after cleaning');
				return true;
			}

			if (decodedPrompt.length > MAX_PROMPT_CHAR_LENGTH) {
				this.logService.error('[ChatMessageUrlHandler] Prompt too long');
				this.notificationService.error(
					localize('promptTooLong', 'Prompt text is too long (max {0} characters)', MAX_PROMPT_CHAR_LENGTH)
				);
				return true;
			}

			const opts: IChatViewOpenOptions = {
				query: decodedPrompt,
				mode: modeParam ?? ChatModeKind.Agent,
				isPartialQuery: true
			};

			if (await this.shouldBlockChatMessage(decodedPrompt)) {
				return true;
			}

			const chatWidget = await showChatView(this.viewsService);
			if (!chatWidget) {
				return true;
			}

			await chatWidget.waitForReady();

			await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
			await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);

			return true;
		} catch (error) {
			this.logService.error(`[ChatMessageUrlHandler] Error handling chat message URL ${uri.toString()}`, error);
			return true;
		}
	}

	private async shouldBlockChatMessage(messageText: string): Promise<boolean> {
		const previewText = messageText.length > PREVIEW_MESSAGE_CHAR_LENGTH
			? messageText.substring(0, PREVIEW_MESSAGE_CHAR_LENGTH) + '...'
			: messageText;

		const markdown = new MarkdownString([
			localize('confirmChatMessageDetail', "This will insert the following text into chat:\n\n"),
			`\n${previewText}\n`,
			localize('confirmChatMessageSecurity',
				"\n\nIf you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should not continue.")
		].join(''), { supportHtml: true });

		const { confirmed } = await this.dialogService.confirm({
			type: 'info',
			primaryButton: localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
			cancelButton: localize('noButton', "No"),
			message: localize('confirmChatMessage', "An external application wants to insert text into chat. Do you want to continue?"),
			custom: {
				markdownDetails: [{ markdown }]
			}
		});

		return !confirmed;
	}

	/**
	 * Cleans prompt text by removing invisible characters, control sequences, and normalizing whitespace.
	 * Uses VS Code's existing utilities for comprehensive and consistent text sanitization.
	 * Also removes potentially deceptive URLs (homograph attacks) for security.
	 */
	private sanitizePromptText(text: string): string {
		// First remove ANSI escape sequences (terminal control codes)
		text = removeAnsiEscapeCodes(text);

		// Remove invisible characters using the comprehensive VS Code utility
		let cleanText = '';
		for (let i = 0; i < text.length; i++) {
			const codePoint = text.codePointAt(i);
			if (codePoint !== undefined) {
				// Keep the character if it's not invisible (except for regular spaces)
				if (!InvisibleCharacters.isInvisibleCharacter(codePoint) || codePoint === 32 /* space */) {
					cleanText += String.fromCodePoint(codePoint);
					// Skip the next character if this was a surrogate pair
					if (codePoint > 0xFFFF) {
						i++;
					}
				}
			}
		}

		// Check for potentially deceptive URLs (homograph attacks)
		cleanText = this.detectAndWarnAboutSuspiciousUrls(cleanText);

		// Normalize multiple whitespace to single spaces and trim
		return cleanText.replace(/\s+/g, ' ').trim();
	}

	/**
	 * Detects URLs with potentially deceptive characters (homograph attacks) and removes them.
	 * Replaces suspicious URLs with a warning message for security.
	 */
	private detectAndWarnAboutSuspiciousUrls(text: string): string {
		// Simple URL detection regex - not perfect but catches common patterns
		const urlRegex = /https?:\/\/[^\s<>'"]+/gi;
		const urls = text.match(urlRegex);

		if (!urls) {
			return text;
		}

		const ambiguousChars = AmbiguousCharacters.getInstance(new Set(['en'])); // Use English as base locale
		let modifiedText = text;

		for (const url of urls) {
			// Check the domain part for ambiguous characters
			const domainMatch = url.match(/(https?:\/\/)([^\/\s<>'"]+)(.*)/);
			if (domainMatch) {
				const [, , domain] = domainMatch;
				let urlIsSuspicious = false;

				// Check each character in the domain for ambiguity
				for (let i = 0; i < domain.length; i++) {
					const codePoint = domain.codePointAt(i);
					if (codePoint !== undefined && ambiguousChars.isAmbiguous(codePoint)) {
						urlIsSuspicious = true;
						break;
					}
				}

				// Replace suspicious URL with warning message
				if (urlIsSuspicious) {
					const warningText = `[SUSPICIOUS URL REMOVED]`;
					modifiedText = modifiedText.replace(url, warningText);
					this.logService.warn(`[ChatMessageUrlHandler] Removed potentially deceptive URL: ${url}`);
				}
			}
		}

		return modifiedText;
	}
}
