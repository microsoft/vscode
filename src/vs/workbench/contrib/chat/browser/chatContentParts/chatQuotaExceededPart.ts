/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, textLinkForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IChatResponseViewModel } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

/**
 * Once the sign up button is clicked, and the retry button has been shown, it should be shown every time.
 */
let shouldShowRetryButton = false;

/**
 * Once the 'retry' button is clicked, the wait warning should be shown every time.
 */
let shouldShowWaitWarning = false;

export class ChatQuotaExceededPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		element: IChatResponseViewModel,
		renderer: MarkdownRenderer,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const errorDetails = element.errorDetails;
		assertType(!!errorDetails, 'errorDetails');

		this.domNode = $('.chat-quota-error-widget');
		const icon = dom.append(this.domNode, $('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));

		const messageContainer = dom.append(this.domNode, $('.chat-quota-error-message'));
		const markdownContent = renderer.render(new MarkdownString(errorDetails.message));
		dom.append(messageContainer, markdownContent.element);

		const button1 = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
		button1.label = localize('upgradeToCopilotPro', "Upgrade to Copilot Pro");
		button1.element.classList.add('chat-quota-error-button');

		let hasAddedWaitWarning = false;
		const addWaitWarningIfNeeded = () => {
			if (!shouldShowWaitWarning || hasAddedWaitWarning) {
				return;
			}

			hasAddedWaitWarning = true;
			dom.append(messageContainer, $('.chat-quota-wait-warning', undefined, localize('waitWarning', "Signing up may take a few minutes to take effect.")));
		};

		let hasAddedRetryButton = false;
		const addRetryButtonIfNeeded = () => {
			if (!shouldShowRetryButton || hasAddedRetryButton) {
				return;
			}

			hasAddedRetryButton = true;
			const button2 = this._register(new Button(messageContainer, {
				buttonBackground: undefined,
				buttonForeground: asCssVariable(textLinkForeground)
			}));
			button2.element.classList.add('chat-quota-error-secondary-button');
			button2.label = localize('signedUpClickToContinue', "Signed up? Click to retry.");
			this._onDidChangeHeight.fire();
			this._register(button2.onDidClick(() => {
				const widget = chatWidgetService.getWidgetBySessionId(element.sessionId);
				if (!widget) {
					return;
				}

				widget.rerunLastRequest();

				shouldShowWaitWarning = true;
				addWaitWarningIfNeeded();
			}));
		};

		this._register(button1.onDidClick(async () => {
			const commandId = 'workbench.action.chat.upgradePlan';
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'chat-response' });
			await commandService.executeCommand(commandId);

			shouldShowRetryButton = true;
			addRetryButtonIfNeeded();
		}));

		addRetryButtonIfNeeded();
		addWaitWarningIfNeeded();
	}

	hasSameContent(other: unknown): boolean {
		// Not currently used
		return true;
	}
}
