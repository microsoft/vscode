/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { SendRemoteMessageToolReferenceName } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { maxRemoteMessageLength, parseSendRemoteMessageOptions, RemoteSessionMessageRouter } from './remoteSessionMessageRouter.js';
import { assertRemoteSessionCaller } from './remoteSessionSource.js';

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
			modelDescription: 'Send a message to the exact originating chat of a remote session, or to a known host-qualified session or chat. Use session "origin" to reply to the chat that created this remote session; use the session, chat, or openLink returned by create_remote_session for follow-ups. Use send_message for ordinary same-host messaging. Requires an Agent Host originating chat; other chat providers are not supported. If this session has an origin, report results or blockers before ending each delegated task, including follow-ups, even if no reply was explicitly requested, unless explicitly instructed not to report back. Your normal final answer is not forwarded. When assigning follow-up work, ask the child to send its results back. The target host must remain connected in this Agents window. The agent-authored message starts a new turn using the target chat\'s existing permissions and configuration, or joins its FIFO queue behind active and pending turns. Returns only confirmed sent or queued status, never a response. Does not open, focus, reconnect, or elevate the target. Normal tool approval applies. Only claim delivery after "sent" or "queued"; otherwise report the failure in this chat. Do not send acknowledgement-only replies to messages with no new task or question. After sending, continue independent work or end your turn. Do not retry uncertain delivery or repeat a send to poll. Do not sleep or poll for replies.',
			source: ToolDataSource.Internal,
			icon: Codicon.send,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
			runsInWorkspace: false,
			canRequestPreApproval: true,
			canBeReferencedInPrompt: false,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: ['session', 'message'],
				properties: {
					session: { type: 'string', minLength: 1, description: '"origin", or an exact host-qualified session/chat URI or openLink returned by the remote session tools. Bare backend IDs are not supported.' },
					message: { type: 'string', minLength: 1, maxLength: maxRemoteMessageLength, description: 'Message to send. Delivery starts a new turn asynchronously; it does not return the reply.' },
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
			content: [{ kind: 'text', value: JSON.stringify(result, undefined, 2) }],
			toolResultMessage: result.status === 'queued'
				? localize('remoteMessage.queued', "Queued a message on {0}", result.host.label)
				: localize('remoteMessage.sent', "Sent a message on {0}", result.host.label),
		};
	}
}
