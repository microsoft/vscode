/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatCustomConfirmationWidget } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatToolAuthenticationSubPart extends BaseChatToolInvocationSubPart {
	readonly domNode: HTMLElement;
	readonly codeblocks = [];

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentHostCustomizationService customizationService: IAgentHostCustomizationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super(toolInvocation);
		const state = toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
			throw new Error('Tool authentication state is missing');
		}

		const widget = this._register(instantiationService.createInstance(
			ChatCustomConfirmationWidget<() => Promise<void>>,
			context,
			{
				title: localize('chat.toolAuthentication.title', "MCP authentication required"),
				icon: Codicon.mcp,
				subtitle: state.server.name,
				buttons: [
					{
						label: localize('chat.toolAuthentication.authenticate', "Authenticate"),
						data: async () => {
							await customizationService.authenticateMcpServer(context.element.sessionResource, state.server.id);
						},
					},
					{
						label: localize('chat.toolAuthentication.cancel', "Cancel"),
						data: async () => {
							state.cancel();
						},
						isSecondary: true,
					},
				],
				message: localize('chat.toolAuthentication.message', "The MCP server {0} requires authentication to continue this tool call.", state.server.name),
				toolbarData: {
					arg: toolInvocation,
					partType: 'chatToolAuthentication',
					partSource: toolInvocation.source.type,
				},
			},
		));
		this._register(widget.onDidClick(async ({ button, isTouchClick }) => {
			await button.data();
			if (!isTouchClick) {
				chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
			}
		}));
		this.domNode = widget.domNode;
	}
}
