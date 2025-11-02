/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManagementService } from '../../../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService.js';
import { CancelChatActionId } from '../../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { ChatConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatExtensionsContentPart } from '../chatExtensionsContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ExtensionsInstallConfirmationWidgetSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		if (toolInvocation.toolSpecificData?.kind !== 'extensions') {
			throw new Error('Tool specific data is missing or not of kind extensions');
		}

		const extensionsContent = toolInvocation.toolSpecificData;
		this.domNode = dom.$('');
		const chatExtensionsContentPart = this._register(instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent));
		this._register(chatExtensionsContentPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		dom.append(this.domNode, chatExtensionsContentPart.domNode);

		if (toolInvocation.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
			const allowLabel = localize('allow', "Allow");
			const allowKeybinding = keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
			const allowTooltip = allowKeybinding ? `${allowLabel} (${allowKeybinding})` : allowLabel;

			const cancelLabel = localize('cancel', "Cancel");
			const cancelKeybinding = keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
			const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;
			const enableAllowButtonEvent = this._register(new Emitter<boolean>());

			const buttons: IChatConfirmationButton<ConfirmedReason>[] = [
				{
					label: allowLabel,
					data: { type: ToolConfirmKind.UserAction },
					tooltip: allowTooltip,
					disabled: true,
					onDidChangeDisablement: enableAllowButtonEvent.event
				},
				{
					label: cancelLabel,
					data: { type: ToolConfirmKind.Denied },
					isSecondary: true,
					tooltip: cancelTooltip
				}
			];

			const confirmWidget = this._register(instantiationService.createInstance(
				ChatConfirmationWidget<ConfirmedReason>,
				context,
				{
					title: toolInvocation.confirmationMessages?.title ?? localize('installExtensions', "Install Extensions"),
					message: toolInvocation.confirmationMessages?.message ?? localize('installExtensionsConfirmation', "Click the Install button on the extension and then press Allow when finished."),
					buttons,
				}
			));
			this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			dom.append(this.domNode, confirmWidget.domNode);
			this._register(confirmWidget.onDidClick(button => {
				IChatToolInvocation.confirmWith(toolInvocation, button.data);
				chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
			}));
			const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(contextKeyService);
			hasToolConfirmationKey.set(true);
			this._register(toDisposable(() => hasToolConfirmationKey.reset()));
			const disposable = this._register(extensionManagementService.onInstallExtension(e => {
				if (extensionsContent.extensions.some(id => areSameExtensions({ id }, e.identifier))) {
					disposable.dispose();
					enableAllowButtonEvent.fire(false);
				}
			}));
		}

	}
}
