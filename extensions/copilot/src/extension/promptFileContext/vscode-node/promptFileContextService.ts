/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILogService } from '../../../platform/log/common/logService';
import { PromptFileLangageId, PromptHeaderAttributes } from '../../../platform/promptFiles/common/promptsService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable, DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, IObservable } from '../../../util/vs/base/common/observableInternal';

export const promptFileSelector = [PromptFileLangageId.prompt, PromptFileLangageId.instructions, PromptFileLangageId.agent];

export class PromptFileContextContribution extends Disposable {

	private readonly _enableCompletionContext: IObservable<boolean>;
	private registration: Promise<IDisposable> | undefined;

	private models: string[] = ['GPT-4.1', 'GPT-4o'];

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ILanguageContextProviderService private readonly languageContextProviderService: ILanguageContextProviderService,
	) {
		super();
		this._enableCompletionContext = configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.PromptFileContext, experimentationService);
		this._register(autorun(reader => {
			if (this._enableCompletionContext.read(reader)) {
				this.registration = this.register();
			} else if (this.registration) {
				this.registration.then(disposable => disposable.dispose());
				this.registration = undefined;
			}
		}));

	}

	override dispose() {
		super.dispose();
		if (this.registration) {
			this.registration.then(disposable => disposable.dispose());
			this.registration = undefined;
		}
	}

	private async register(): Promise<IDisposable> {
		const disposables = new DisposableStore();
		try {
			const self = this;
			const resolver: Copilot.ContextResolver<Copilot.SupportedContextItem> = {
				async resolve(request: Copilot.ResolveRequest, token: vscode.CancellationToken): Promise<Copilot.SupportedContextItem[]> {
					const [document, position] = self.getDocumentAndPosition(request, token);
					if (document === undefined || position === undefined) {
						return [];
					}
					const tokenBudget = self.getTokenBudget(document);
					if (tokenBudget <= 0) {
						return [];
					}
					return self.getContext(document.languageId);
				}
			};

			this.endpointProvider.getAllChatEndpoints().then(endpoints => {
				const modelNames = new Set<string>();
				for (const endpoint of endpoints) {
					if (endpoint.showInModelPicker) {
						modelNames.add(endpoint.name);
					}
				}
				this.models = [...modelNames.keys()];
			});

			const provider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'promptfile-ai-context-provider',
				selector: promptFileSelector,
				resolver: resolver
			};
			const copilotAPI = await this.getCopilotApi();
			if (copilotAPI) {
				disposables.add(copilotAPI.registerContextProvider(provider));
			}
			disposables.add(this.languageContextProviderService.registerContextProvider(provider, [ProviderTarget.NES, ProviderTarget.Completions]));
		} catch (error) {
			this.logService.error('Error regsistering prompt file context provider:', error);
		}
		return disposables;
	}

	private getContext(languageId: string): Copilot.SupportedContextItem[] {


		switch (languageId) {
			case PromptFileLangageId.prompt: {
				const toolNamesList = this.getToolNames().join(', ');
				return [
					{
						name: 'This is a prompt file. It uses markdown with a YAML front matter header that only supports a limited set of attributes and values. Do not suggest any other attributes',
						value: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.agent, PromptHeaderAttributes.model, PromptHeaderAttributes.tools].join(', '),
					},
					{
						name: '`agent` is optional and must be one of the following values',
						value: `ask, edit or agent`,
					},
					{
						name: '`model` is optional and must be one of the following values',
						value: this.models.join(', '),
					},
					{
						name: '`tools` is optional and must be an array of one or more of the following values. Do not make up any other tool names.',
						value: toolNamesList
					},
					{
						name: 'Here is an example of a prompt file',
						value: [
							``,
							'```md',
							`---`,
							`agent: agent`,
							`description: This prompt is used to generate a new issue template for GitHub repositories.`,
							`model: ${this.models[0] || 'GPT-4.1'}`,
							`tools: [${toolNamesList}]`,
							`---`,
							`Generate a new issue template for a GitHub repository.`,
							'```',
						].join('\n'),
					},
				];
			}
			case PromptFileLangageId.instructions: {
				return [
					{
						name: 'This is a instructions file. It uses markdown with a YAML front matter header that only supports a limited set of attributes and values. Do not suggest any other properties',
						value: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.applyTo].join(', ')
					},
					{
						name: '`applyTo` is one or more glob patterns that specify which files the instructions apply to',
						value: `**`,
					},
					{
						name: 'Here is an example of an instruction file',
						value: [
							``,
							'```md',
							`---`,
							`description: This file describes the TypeScript code style for the project.`,
							`applyTo: **/*.ts, **/*.js`,
							`---`,
							`For private fields, start the field name with an underscore (_).`,
							'```',
						].join('\n'),
					},
				];
			}
			case PromptFileLangageId.agent: {
				const toolNamesList = this.getToolNames().join(', ');
				return [
					{
						name: 'This is a custom agent file. It uses markdown with a YAML front matter header that only supports a limited set of attributes and values. Do not suggest any other attributes',
						value: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.target, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.handOffs].join(', '),
					},
					{
						name: '`model` is optional and must be one of the following values',
						value: this.models.join(', '),
					},
					{
						name: '`tools` is optional and must be an array of one or more of the following values. Do not make up any other tool names.',
						value: `[${toolNamesList}]`,
					},
					{
						name: '`target` is optional and must be one of the following values',
						value: `vscode, github-copilot`,
					},
					{
						name: '`handoffs` is optional and is a sequence of mappings with `label`, `agent`, `prompt`, `send`, and `model` properties. The `model` property uses the format `Model Name (vendor)` (e.g., `GPT-4.1 (copilot)`)',
						value: [
							`handoffs:`,
							`  - label: Start Implementation`,
							`    agent: agent`,
							`    prompt: Implement the plan`,
							`    send: true`,
							`    model: GPT-4.1 (copilot)`,
						].join('\n'),
					},
					{
						name: 'Here is an example of a custom agent file',
						value: [
							``,
							'```md',
							`---`,
							`description: This custom agent researches and plans new features for VS Code extensions.`,
							`model: GPT-4.1`,
							`tools: [${toolNamesList}]`,
							`handoffs:`,
							`  - label: Start Implementation`,
							`    agent: agent`,
							`    prompt: Implement the plan`,
							`    send: true`,
							`    model: GPT-4.1 (copilot)`,
							`---`,
							`First come up with a plan for the new feature. Write a todo list of tasks to complete the feature.`,
							'```',
						].join('\n'),
					},
				];
			}
			default:
				return [];
		}
	}

	private getToolNames(): string[] {
		return ['execute', 'read', 'edit', 'search', 'web', 'agent', 'todo'];
	}


	private async getCopilotApi(): Promise<Copilot.ContextProviderApiV1 | undefined> {
		const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
		if (copilotExtension === undefined) {
			return undefined;
		}
		this.logService.info('Copilot extension found');
		try {
			const api = await copilotExtension.activate();
			return api.getContextProviderAPI('v1');
		} catch (error) {
			if (error instanceof Error) {
				this.logService.error('Error activating Copilot extension:', error.message);
			} else {
				this.logService.error('Error activating Copilot extension: Unknown error.');
			}
			return undefined;
		}
	}

	public getTokenBudget(document: vscode.TextDocument): number {
		return Math.trunc((8 * 1024) - (document.getText().length / 4) - 256);
	}

	private getDocumentAndPosition(request: Copilot.ResolveRequest, token?: vscode.CancellationToken): [vscode.TextDocument | undefined, vscode.Position | undefined] {
		let document: vscode.TextDocument | undefined;
		if (vscode.window.activeTextEditor?.document.uri.toString() === request.documentContext.uri) {
			document = vscode.window.activeTextEditor.document;
		} else {
			document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === request.documentContext.uri);
		}
		if (document === undefined) {
			return [undefined, undefined];
		}
		const requestPos = request.documentContext.position;
		const position = requestPos !== undefined ? new vscode.Position(requestPos.line, requestPos.character) : document.positionAt(request.documentContext.offset);
		if (document.version > request.documentContext.version) {
			if (!token?.isCancellationRequested) {
			}
			return [undefined, undefined];
		}
		if (document.version < request.documentContext.version) {
			return [undefined, undefined];
		}
		return [document, position];
	}



}
