/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';

import { IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService, IChatAgentData } from '../../chat/common/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { IChatProgress } from '../../chat/common/chatService.js';
import { IRemoteCodingAgentsService, IRemoteCodingAgent } from '../common/remoteCodingAgentsService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';



/**
 * Chat provider that creates dynamic chat agents for each registered remote coding agent
 */
export class RemoteCodingAgentsDynamicChatHandler extends Disposable {

	private readonly registeredAgents = new Map<string, any>();

	constructor(
		@IRemoteCodingAgentsService private readonly remoteCodingAgentsService: IRemoteCodingAgentsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();
		console.log('RemoteCodingAgentsDynamicChatHandler: Initializing...');
		this.setupAgentRegistration();
		console.log('RemoteCodingAgentsDynamicChatHandler: Initialization complete');
	}

	private setupAgentRegistration(): void {
		// Register existing agents
		const existingAgents = this.remoteCodingAgentsService.getRegisteredAgents();
		for (const agent of existingAgents) {
			this.registerDynamicChatAgent(agent);
		}

		// Listen for new agents being registered
		this._register(this.remoteCodingAgentsService.onDidRegisterAgent(agent => {
			this.registerDynamicChatAgent(agent);
		}));
	}

	private registerDynamicChatAgent(remoteCodingAgent: IRemoteCodingAgent): void {
		const agentId = remoteCodingAgent.id;

		// Don't register twice
		if (this.registeredAgents.has(agentId)) {
			console.log(`RemoteCodingAgentsChatProvider: Agent ${agentId} already registered`);
			return;
		}

		console.log(`RemoteCodingAgentsChatProvider: Registering dynamic chat agent: ${agentId}`);

		const agentData: IChatAgentData = {
			id: agentId,
			name: agentId,
			fullName: remoteCodingAgent.displayName,
			description: remoteCodingAgent.description || localize('remoteCodingAgent.defaultDescription', 'Remote coding agent: {0}', remoteCodingAgent.displayName),
			isDefault: false,
			isCore: false,
			isDynamic: true,
			isCodingAgent: true, // TODO: Influences chat UI (eg: locks chat to participant, hides UX elements, etc...)
			slashCommands: [],
			locations: [ChatAgentLocation.Panel],
			modes: [ChatModeKind.Agent, ChatModeKind.Ask],
			disambiguation: [],

			metadata: {
				themeIcon: Codicon.robot,
				isSticky: true,
			},
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: nullExtensionDescription.name,
			extensionPublisherId: nullExtensionDescription.publisher
		};

		const agentImpl = new RemoteCodingAgentChatImplementation(remoteCodingAgent);
		const disposable = this.chatAgentService.registerDynamicAgent(agentData, agentImpl);

		this.registeredAgents.set(agentId, disposable);
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
class RemoteCodingAgentChatImplementation extends Disposable implements IChatAgentImplementation {

	constructor(
		private readonly remoteCodingAgent: IRemoteCodingAgent,
		// @IRemoteCodingAgentsService readonly remoteCodingAgentService: IRemoteCodingAgentsService (TODO:)
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const message = request.message.trim();
		try {
			return this.handle(message, progress, token);
		} catch (error) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(localize('remoteCodingAgent.error', 'Error: {0}', error instanceof Error ? error.message : String(error)))
			}]);
			return { errorDetails: { message: String(error) } };
		}
	}

	private async handle(message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const { displayName } = this.remoteCodingAgent;

		progress([{
			kind: 'markdownContent',
			content: new MarkdownString(localize('remoteCodingAgent.welcome', 'I am **{0}**, a coding agent at your service.', displayName))
		}]);

		// Generate a job ID and simulate starting a coding task
		const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const title = `Implement: ${message}`;
		const description = `Working on your request: "${message}"`;

		// Report the session start
		progress([{
			kind: 'codingAgentSessionBegin',
			agentDisplayName: displayName,
			agentId: this.remoteCodingAgent.id,
			jobId,
			title,
			description
		}]);

		this.doDemoStreaming(progress, token);

		return {};
	}

	// TODO: DEMO!
	private doDemoStreaming(progress: (progress: IChatProgress[]) => void, token: CancellationToken): void {
		const steps = [
			{ kind: 'PROGRESS_MESSAGE', text: 'Analyzing codebase...', delay: 1000 },
			{ kind: 'FILE_UPDATE', delay: 1500, uri: 'file:///path/to/file1.js', changeType: 'modified', preview: 'function foo() { ... }' },
		];

		let currentStep = 0;
		// eslint-disable-next-line no-restricted-globals
		const interval = setInterval(() => {
			if (currentStep >= steps.length || token.isCancellationRequested) {
				// eslint-disable-next-line no-restricted-globals
				clearInterval(interval);
				return;
			}

			const step = steps[currentStep];
			currentStep++;

			switch (step.kind) {
				case 'PROGRESS_MESSAGE':
					progress([{
						kind: 'progressMessage',
						content: new MarkdownString(step.text)
					}]);
					break;

				case 'FILE_UPDATE':
					progress([{
						kind: 'textEdit',
						uri: URI.parse(step.uri!),
						edits: [{
							range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
							text: step.preview || ''
						}]
					}]);
					break;
			}
		});
	}
}
