/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { SendRemoteMessageToolReferenceName } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { maxRemoteMessageLength, parseSendRemoteMessageOptions, RemoteSessionMessageRouter } from './remoteSessionMessageRouter.js';
import { assertRemoteSessionCaller } from './remoteSessionSource.js';
import { remoteSessionToolsWhen } from '../common/remoteSessions.js';

export class SendRemoteMessageTool implements IToolImpl {
	private readonly router: RemoteSessionMessageRouter;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.router = instantiationService.createInstance(RemoteSessionMessageRouter);
	}

	getToolData(): IToolData {
		return {
			id: 'vscode_send_remote_message',
			toolReferenceName: SendRemoteMessageToolReferenceName,
			displayName: localize('remoteMessage.displayName', "Send Remote Message"),
			userDescription: localize('remoteMessage.description', "Send a message to a session on a connected agent host"),
			modelDescription: 'Send a message to a known remote session/chat, or reply to the exact originating chat with session "origin". Use send_message for ordinary same-host messaging. Requires an Agent Host originating chat and a target connected to this Agents window. Starts an agent-authored turn with the target chat\'s existing permissions/configuration, or joins its FIFO queue. Returns delivery status, never a response. When assigning work, request a reply; final answers are not forwarded. Normal approval applies. Only claim delivery after "sent" or "queued"; report failures here. Do not retry uncertain delivery or acknowledge messages with no new task or question. Continue independent work or end your turn; do not sleep or poll for replies.',
			source: ToolDataSource.Internal,
			icon: Codicon.send,
			when: remoteSessionToolsWhen,
			runsInWorkspace: false,
			canRequestPreApproval: true,
			canBeReferencedInPrompt: false,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: ['session', 'message'],
				properties: {
					session: { type: 'string', minLength: 1, description: '"origin", or an exact host-qualified session/chat URI or openLink from the remote tools. No bare IDs.' },
					message: { type: 'string', minLength: 1, maxLength: maxRemoteMessageLength },
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation> {
		const options = parseSendRemoteMessageOptions(context.parameters);
		if (!context.chatSessionResource) {
			throw new Error(localize('remoteMessage.missingContext', "Remote messaging requires an originating chat."));
		}
		assertRemoteSessionCaller(context.chatSessionResource);
		const target = await this.router.prepareTarget(context.chatSessionResource, options.session, token);
		const message = new MarkdownString().appendText(localize('remoteMessage.confirmation', "Send this message to {0} on {1}? It will use the target chat's existing permissions and queue behind any active or pending turns.", target.chat, target.host.label));
		message.appendText(`\n\n${options.message}`);
		return {
			invocationMessage: localize('remoteMessage.invocation', "Sending a remote message"),
			pastTenseMessage: localize('remoteMessage.past', "Processed a remote message"),
			confirmationMessages: {
				title: localize('remoteMessage.confirmationTitle', "Send Remote Message"),
				message,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const options = parseSendRemoteMessageOptions(invocation.parameters);
		if (!invocation.context?.sessionResource) {
			throw new Error(localize('remoteMessage.missingContext', "Remote messaging requires an originating chat."));
		}
		assertRemoteSessionCaller(invocation.context.sessionResource);
		const result = await this.router.send(invocation.context.sessionResource, options, invocation.callId, token);
		return {
			content: [{ kind: 'text', value: JSON.stringify(result) }],
			toolResultMessage: result.status === 'queued'
				? localize('remoteMessage.queued', "Queued a message on {0}", result.host.label)
				: localize('remoteMessage.sent', "Sent a message on {0}", result.host.label),
		};
	}
}
