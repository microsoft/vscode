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
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, textLinkForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatErrorDetailsPart, IChatRendererContent, IChatResponseViewModel } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

/**
 * Once the sign up button is clicked, and the retry
 * button has been shown, it should be shown every time.
 */
let shouldShowRetryButton = false;

/**
 * Once the 'retry' button is clicked, the wait warning
 * should be shown every time.
 */
let shouldShowWaitWarning = false;

export class ChatQuotaExceededPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		element: IChatResponseViewModel,
		private readonly content: IChatErrorDetailsPart,
		renderer: IMarkdownRenderer,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService
	) {
		super();

		const errorDetails = element.errorDetails;
		assertType(!!errorDetails, 'errorDetails');

		this.domNode = $('.chat-quota-error-widget');
		const icon = dom.append(this.domNode, $('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));

		const messageContainer = dom.append(this.domNode, $('.chat-quota-error-message'));
		const markdownContent = this._register(renderer.render(new MarkdownString(errorDetails.message)));
		dom.append(messageContainer, markdownContent.element);

		let primaryButtonLabel: string | undefined;
		switch (chatEntitlementService.entitlement) {
			case ChatEntitlement.Pro:
			case ChatEntitlement.ProPlus:
				primaryButtonLabel = localize('enableAdditionalUsage', "Manage Paid Premium Requests");
				break;
			case ChatEntitlement.Free:
				primaryButtonLabel = localize('upgradeToCopilotPro', "Upgrade to GitHub Copilot Pro");
				break;
		}

		let hasAddedWaitWarning = false;
		const addWaitWarningIfNeeded = () => {
			if (!shouldShowWaitWarning || hasAddedWaitWarning) {
				return;
			}

			hasAddedWaitWarning = true;
			dom.append(messageContainer, $('.chat-quota-wait-warning', undefined, localize('waitWarning', "Changes may take a few minutes to take effect.")));
		};

		let hasAddedRetryButton = false;
		const addRetryButtonIfNeeded = () => {
			if (!shouldShowRetryButton || hasAddedRetryButton) {
				return;
			}

			hasAddedRetryButton = true;
			const retryButton = this._register(new Button(messageContainer, {
				buttonBackground: undefined,
				buttonForeground: asCssVariable(textLinkForeground)
			}));
			retryButton.element.classList.add('chat-quota-error-secondary-button');
			retryButton.label = localize('clickToContinue', "Click to Retry");

			this._onDidChangeHeight.fire();

			this._register(retryButton.onDidClick(() => {
				const widget = chatWidgetService.getWidgetBySessionResource(element.sessionResource);
				if (!widget) {
					return;
				}

				widget.rerunLastRequest();

				shouldShowWaitWarning = true;
				addWaitWarningIfNeeded();
			}));
		};

		if (primaryButtonLabel) {
			const primaryButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
			primaryButton.label = primaryButtonLabel;
			primaryButton.element.classList.add('chat-quota-error-button');

			this._register(primaryButton.onDidClick(async () => {
				const commandId = chatEntitlementService.entitlement === ChatEntitlement.Free ? 'workbench.action.chat.upgradePlan' : 'workbench.action.chat.manageOverages';
				telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'chat-response' });
				await commandService.executeCommand(commandId);

				shouldShowRetryButton = true;
				addRetryButtonIfNeeded();
			}));
		}

		addRetryButtonIfNeeded();
		addWaitWarningIfNeeded();
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.content.kind && !!other.errorDetails.isQuotaExceeded;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
