/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { FileType } from '../../../../platform/files/common/files.js';

import { IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService, IChatAgentData } from '../../chat/common/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { IChatProgress, IChatResponseProgressFileTreeData, IChatService } from '../../chat/common/chatService.js';
import { IRemoteCodingAgentsService, IRemoteCodingAgent } from '../common/remoteCodingAgentsService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

interface IDemoStep {
	kind: 'PROGRESS_MESSAGE' | 'ADD_REQUEST' | 'FILE_UPDATE' | 'QUESTION' | 'SESSION_BEGIN' | 'MARKDOWN';
	delay: number;
	text?: string;
	detail?: string;
}

/**
 * Chat provider that creates dynamic chat agents for each registered remote coding agent
 */
export class RemoteCodingAgentsDynamicChatHandler extends Disposable {

	private readonly registeredAgents = new Map<string, any>();

	constructor(
		@IRemoteCodingAgentsService private readonly remoteCodingAgentsService: IRemoteCodingAgentsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
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

		const agentImpl = this.instantiationService.createInstance(RemoteCodingAgentChatImplementation, remoteCodingAgent);
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
		const { displayName } = this.remoteCodingAgent;
		progress([{
			kind: 'progressMessage',
			content: new MarkdownString(localize('remoteCodingAgent.working', '{0} queued your request', displayName))
		}]);
		await new Promise(resolve => setTimeout(resolve, 1000));
		await this.queueDemoStreaming(progress, message, displayName, token, 4);
		return {};
	}

	private async handleNew(request: IChatAgentRequest, message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const { displayName } = this.remoteCodingAgent;

		// Get the chat model for this session so we can add requests over time
		const chatModel = this.chatService.getSession(request.sessionId);
		if (!chatModel) {
			throw new Error(`Chat session ${request.sessionId} not found`);
		}
		await this.queueDemoStreaming(progress, message, displayName, token);
		return {};
	}

	// TODO: DEMO!
	private async queueDemoStreaming(progress: (progress: IChatProgress[]) => void, message: string, displayName: string, token: CancellationToken, start: number = 0): Promise<void> {
		const steps: IDemoStep[] = [
			{ kind: 'PROGRESS_MESSAGE', text: 'Connecting...', delay: 1000 },
			{ kind: 'SESSION_BEGIN', delay: 2000 },
			{ kind: 'PROGRESS_MESSAGE', text: 'Analyzing codebase...', delay: 1000 },
			{ kind: 'PROGRESS_MESSAGE', text: 'Planning implementation...', delay: 3000 },
			{ kind: 'PROGRESS_MESSAGE', text: 'Implementing changes...', delay: 3000 },
			{ kind: 'PROGRESS_MESSAGE', text: 'Finalizing changes...', delay: 3000 },
			{ kind: 'FILE_UPDATE', delay: 2500 },
			{ kind: 'QUESTION', text: 'Run unit tests?', detail: 'This will execute all tests in a GitHub Action and report the results', delay: 5000 },
			{ kind: 'PROGRESS_MESSAGE', text: 'Deploying to Azure', delay: 5000 },
			{ kind: 'MARKDOWN', text: '## Summary\n\n- JoshBot has successfully completed your task\n- Run unit tests\n - Deployed to Azure\n\n Thanks for using JoshBot!', delay: 2000 }
		];

		return new Promise((resolve) => {
			let currentStep = start;

			const executeStep = async () => {
				// Check if we should stop
				if (currentStep >= steps.length || token.isCancellationRequested) {
					resolve(); // Complete the promise
					return;
				}

				const step = steps[currentStep];
				console.log(`Executing step ${currentStep + 1}/${steps.length}: ${step.kind}`);

				try {
					switch (step.kind) {
						case 'SESSION_BEGIN': {
							// Generate a job ID and simulate starting a coding task
							const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
							const title = message;
							// Report the session start
							progress([{
								kind: 'codingAgentSessionBegin',
								agentDisplayName: displayName,
								agentId: this.remoteCodingAgent.id,
								jobId,
								title,
								description: localize('remoteCodingAgent.sessionBegin', '{0} is starting a new session and will alert you when the change is ready', displayName),
							}]);
							break;
						}
						case 'MARKDOWN': {
							// Add a markdown message to the chat
							progress([{
								kind: 'markdownContent',
								content: new MarkdownString(step.text)
							}]);
							break;
						}
						case 'PROGRESS_MESSAGE': {
							// Add progress message directly using the progress function
							progress([{
								kind: 'progressMessage',
								content: new MarkdownString(step.text),
							}]);
							break;
						}
						case 'FILE_UPDATE': {

							progress([{
								kind: 'markdownContent',
								content: new MarkdownString('JoshBot has completed your task by making the following modifications.')
							}]);

							await new Promise(resolve => setTimeout(resolve, 1000));

							// Create a file tree representation of the changes
							const fileTreeData: IChatResponseProgressFileTreeData = {
								label: 'Remote Project Files',
								uri: URI.parse('file:///remote/project'),
								type: FileType.Directory,
								children: [
									{
										label: 'src',
										uri: URI.parse('file:///remote/project/src'),
										type: FileType.Directory,
										children: [
											{
												label: 'package.nls.json',
												uri: URI.parse('file:///remote/project/src/package.nls.json'),
												type: FileType.File
											},
											{
												label: 'utils.js',
												uri: URI.parse('file:///remote/project/src/utils.js'),
												type: FileType.File
											}
										]
									},
									{
										label: 'package.json',
										uri: URI.parse('file:///remote/project/package.json'),
										type: FileType.File
									},
									{
										label: 'README.md',
										uri: URI.parse('file:///remote/project/README.md'),
										type: FileType.File
									}
								]
							};

							// Send the tree data to the chat UI
							progress([{
								kind: 'treeData',
								treeData: fileTreeData
							}]);
							break;
						}
						case 'QUESTION': {
							await new Promise<void>((resolve) => {
								progress([{
									kind: 'elicitation',
									title: step.text || 'title!',
									message: new MarkdownString(step.detail),
									acceptButtonLabel: 'Run Tests',
									rejectButtonLabel: 'Skip Tests',
									state: 'pending',
									accept: async () => {
										// Show running test progress
										progress([
											{
												kind: 'progressMessage',
												content: new MarkdownString('Running test suite')
											}
										]);
										resolve();
									},
									reject: async () => {
										progress([
											{
												kind: 'warning',
												content: new MarkdownString('No tests? ...Ok')
											}
										]);
										resolve();
									},
								}]);
							});
							break;
						}
						default: {
							console.warn(`Unknown step kind: ${step.kind}`);
							break;
						}
					}
				} catch (error) {
					console.error(`Error executing step ${currentStep}:`, error);
				}

				// Move to next step
				currentStep++;

				// Schedule next step if there are more and not cancelled
				if (currentStep < steps.length && !token.isCancellationRequested) {
					const nextStep = steps[currentStep];
					const delay = nextStep.delay || 1000;
					setTimeout(executeStep, delay);
				} else {
					resolve(); // Complete when done
				}
			};

			// Start the first step after initial delay
			if (steps.length > 0 && !token.isCancellationRequested) {
				const firstDelay = steps[0].delay || 1000;
				setTimeout(executeStep, firstDelay);
			} else {
				resolve();
			}
		});
	}
}
