/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_TASK_SCHEME } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { CLOUD_SANDBOX_INPUT_PLACEHOLDER } from './cloudSandboxConnectionCustomization.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';

interface ITaskSessionRouting {
	open(resource: URI, token: CancellationToken): Promise<IChatSession>;
	prepareRequest(resource: URI, token: CancellationToken): Promise<{ readonly sessionType: string; readonly reference: IDisposable }>;
	handler(resource: URI): IChatSessionContentProvider | undefined;
	runtimeResource(resource: URI): URI | undefined;
	completionTriggerCharacters(): Promise<readonly string[]>;
	readonly onDidChangeCompletionTriggerCharacters: Event<void>;
}

/** Keeps task conversation addresses independent of their eventual host connection. */
export class CloudSandboxTaskSessionRegistration extends Disposable {
	constructor(
		routing: ITaskSessionRouting,
		@IChatSessionsService sessionsService: IChatSessionsService,
		@IChatAgentService agentService: IChatAgentService,
		@IAgentHostSessionWorkingDirectoryResolver directoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
	) {
		super();
		const resolutionChanged = observableSignalFromEvent(this, connectionsService.onDidChangeSessionResolution);
		this._register(directoryResolver.registerResolver(CLOUD_SANDBOX_TASK_SCHEME, resource => {
			const runtime = routing.runtimeResource(resource);
			return runtime ? directoryResolver.resolveRequested(runtime) : undefined;
		}, resource => {
			const runtime = routing.runtimeResource(resource);
			return !!runtime && directoryResolver.isNewSession(runtime);
		}));
		this._register(sessionsService.registerChatSessionContribution({
			type: CLOUD_SANDBOX_TASK_SCHEME,
			name: localize('cloudTask.name', "Cloud"),
			displayName: localize('cloudTask.name', "Cloud"),
			description: localize('cloudTask.description', "Continue a cloud conversation."),
			inputPlaceholder: CLOUD_SANDBOX_INPUT_PLACEHOLDER,
			sessionListGroup: SessionType.CopilotCloud,
			hideFromSessionTypePicker: true,
			when: ChatContextKeys.enabled.key,
			icon: '$(cloud)',
			canDelegate: false,
			requiresCopilotSignIn: true,
			supportsDelegation: false,
			requiresCustomModels: true,
			modelSessionType: (resource, reader) => {
				resolutionChanged.read(reader);
				return routing.runtimeResource(resource)?.scheme;
			},
			supportsAutoModel: true,
			agentHostProviderId: CLOUD_SANDBOX_AGENT_PROVIDER,
			capabilities: { supportsCheckpoints: true, supportsPromptAttachments: true, supportsImageAttachments: true },
		}));
		this._register(sessionsService.registerChatSessionContentProvider(CLOUD_SANDBOX_TASK_SCHEME, {
			provideChatSessionContent: (resource, token) => routing.open(resource, token),
			resolveChatResponseUri: (resource, href, kind) => routing.handler(resource)?.resolveChatResponseUri?.(resource, href, kind) ?? href,
			provideChatInputCompletions: async (resource, params, token) => routing.handler(resource)?.provideChatInputCompletions?.(resource, params, token),
			provideChatInputCompletionTriggerCharacters: () => routing.completionTriggerCharacters(),
			onDidChangeChatInputCompletionTriggerCharacters: routing.onDidChangeCompletionTriggerCharacters,
			updateChatSessionMetadata: (resource, metadata) => routing.handler(resource)?.updateChatSessionMetadata?.(resource, metadata) ?? false,
		}));
		this._register(agentService.registerDynamicAgent({
			id: CLOUD_SANDBOX_TASK_SCHEME,
			name: CLOUD_SANDBOX_TASK_SCHEME,
			fullName: localize('cloudTask.name', "Cloud"),
			description: localize('cloudTask.description', "Continue a cloud conversation."),
			extensionId: new ExtensionIdentifier('vscode.cloud-sandbox'),
			extensionVersion: undefined,
			extensionPublisherId: 'vscode',
			extensionDisplayName: localize('cloudTask.name', "Cloud"),
			isDefault: false, isDynamic: true, isCore: true,
			metadata: { themeIcon: Codicon.cloud },
			slashCommands: [], locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Agent, ChatModeKind.Ask], disambiguation: [],
		}, {
			invoke: async (request, progress, history, token) => {
				const { sessionType, reference } = await routing.prepareRequest(request.sessionResource, token);
				try {
					return await agentService.invokeAgent(sessionType, request, progress, history, token);
				} finally {
					reference.dispose();
				}
			},
		}));
	}
}
