/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { isProposedApiEnabled, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { IChatSessionDynamicAgentHandler, IChatSessionsExtensionPoint, IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionsExtensionPoint[]>({
	extensionPoint: 'chatSessions',
	jsonSchema: {
		description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					description: localize('chatSessionsExtPoint.id', 'A unique identifier for this item.'),
					type: 'string',
				},
				name: {
					description: localize('chatSessionsExtPoint.name', 'Name shown in the chat widget. (eg: @agent)'),
					type: 'string',
				},
				displayName: {
					description: localize('chatSessionsExtPoint.displayName', 'A longer name for this item which is used for display in menus.'),
					type: 'string',
				},
				description: {
					description: localize('chatSessionsExtPoint.description', 'Description of the chat session for use in menus and tooltips.'),
					type: 'string'
				},
				when: {
					description: localize('chatSessionsExtPoint.when', 'Condition which must be true to show this item.'),
					type: 'string'
				}
			},
			required: ['id', 'name', 'displayName', 'description'],
		}
	}
});

export class ChatSessionsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		extensionPoint.setHandler(extensions => {
			for (const ext of extensions) {
				if (!isProposedApiEnabled(ext.description, 'chatSessionsProvider')) {
					continue;
				}
				if (!Array.isArray(ext.value)) {
					continue;
				}
				for (const contribution of ext.value) {
					const c: IChatSessionsExtensionPoint = {
						id: contribution.id,
						name: contribution.name,
						displayName: contribution.displayName,
						description: contribution.description,
						when: contribution.when,
					};
					this.logService.info(`Registering chat session from extension contribution: ${c.displayName} (id='${c.id}' name='${c.name}')`);
					this.chatSessionsService.registerContribution(c);
				}
			}
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ChatSessionsContribution, LifecyclePhase.Restored);

/**
 * Chat provider that creates dynamic chat agents for each registered coding agent
 */
export class ChatSessionDynamicAgentHandler extends Disposable implements IChatSessionDynamicAgentHandler {

	private readonly registeredAgents = new Map<string, IDisposable>();

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

	}

	registerDynamicChatAgent(extPoint: IChatSessionsExtensionPoint): void {
		const { id, name, displayName, description } = extPoint;
		if (this.registeredAgents.has(id)) {
			console.log(`Agent ${id} already registered`);
			return;
		}

		console.log(`Registering dynamic coding agent: ${id}`);

		const agentData: IChatAgentData = {
			id,
			name,
			fullName: displayName,
			description: description,
			isDefault: false,
			isCore: false,
			isDynamic: true,
			isCodingAgent: true, // TODO: Influences chat UI (eg: locks chat to participant, hides UX elements, etc...)
			slashCommands: [],
			locations: [ChatAgentLocation.Panel],
			modes: [ChatModeKind.Agent, ChatModeKind.Ask],
			disambiguation: [],
			metadata: {
				themeIcon: Codicon.sendToRemoteAgent,
				isSticky: true,
			},
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: nullExtensionDescription.name,
			extensionPublisherId: nullExtensionDescription.publisher,
		};

		const agentImpl = this.instantiationService.createInstance(CodingAgentChatImplementation, extPoint);
		const disposable = this.chatAgentService.registerDynamicAgent(agentData, agentImpl);
		this.registeredAgents.set(id, disposable);
		this._register(disposable);
	}

	override dispose(): void {
		super.dispose();
		this.registeredAgents.clear();
	}
}

/**
 * Implementation for individual remote coding agent chat functionality
 */
class CodingAgentChatImplementation extends Disposable implements IChatAgentImplementation {

	constructor(
		private readonly chatSession: IChatSessionsExtensionPoint,
		@IChatService private readonly chatService: IChatService
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const message = request.message.trim();
		try {
			if (history.length === 0) {
				return this.handleNew(request, message, progress, token);
			} else {
				return this.handleExisting(request, message, progress, token);
			}
		} catch (error) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(localize('remoteCodingAgent.error', 'Error: {0}', error instanceof Error ? error.message : String(error)))
			}]);
			return { errorDetails: { message: String(error) } };
		}
	}

	private async handleExisting(request: IChatAgentRequest, message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const { displayName } = this.chatSession;
		progress([{
			kind: 'progressMessage',
			content: new MarkdownString(localize('chatAgent.working', '{0} queued your request', displayName))
		}]);
		await new Promise(resolve => setTimeout(resolve, 1000));
		return {};
	}

	private async handleNew(request: IChatAgentRequest, message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {

		// Get the chat model for this session so we can add requests over time
		const chatModel = this.chatService.getSession(request.sessionId);
		if (!chatModel) {
			throw new Error(`Chat session ${request.sessionId} not found`);
		}
		return {};
	}
}
