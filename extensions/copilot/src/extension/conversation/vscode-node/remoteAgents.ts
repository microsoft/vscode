/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RequestType } from '@vscode/copilot-api';
import { Raw } from '@vscode/prompt-tsx';
import { ChatCompletionItem, ChatContext, ChatPromptReference, ChatRequest, ChatRequestTurn, ChatResponseMarkdownPart, ChatResponseReferencePart, ChatResponseTurn, ChatResponseWarningPart, ChatVariableLevel, Disposable, DynamicChatParticipantProps, Location, MarkdownString, Position, Progress, Range, TextDocument, TextEditor, ThemeIcon, chat, commands, l10n } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ICAPIClientService, } from '../../../platform/endpoint/common/capiClient';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { RemoteAgentChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitService, getGitHubRepoInfoFromContext, toGithubNwo } from '../../../platform/git/common/gitService';
import { IGithubRepositoryService } from '../../../platform/github/common/githubService';
import { HAS_IGNORED_FILES_MESSAGE, IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { ICopilotReference } from '../../../platform/networking/common/fetch';
import { Response } from '../../../platform/networking/common/fetcherService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { DeferredPromise } from '../../../util/vs/base/common/async';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseReferencePart2, Uri } from '../../../vscodeTypes';
import { ICopilotChatResult, ICopilotChatResultIn } from '../../prompt/common/conversation';
import { IPromptVariablesService } from '../../prompt/node/promptVariablesService';
import { IUserFeedbackService } from './userActions';

interface IAgent {
	name: string;
	avatar_url: string;
	owner_login: string;
	owner_avatar_url: string;
	description: string;
	slug: string;
	editor_context: boolean;
}

interface IAgentsResponse {
	agents: IAgent[];
}

const agentRegistrations = new Map<string, Disposable>();

const GITHUB_PLATFORM_AGENT_NAME = 'github';
const GITHUB_PLATFORM_AGENT_ID = 'platform';
const GITHUB_PLATFORM_AGENT_SKILLS: { [key: string]: string } = {
	web: 'bing-search',
};

type IPlatformReference = IFileReference | ISelectionReference | IGitHubRepositoryReference;

interface IFileReference {
	type: 'client.file';
	data: {
		language: string;
		content: string;
	};
	is_implicit: boolean;
	id: string;
}

interface ISelectionReference {
	type: 'client.selection';
	data: {
		start: { line: number; col: number };
		end: { line: number; col: number };
		content: string;
	};
	is_implicit: boolean;
	id: string;
}

interface IGitHubRepositoryReference {
	type: 'github.repository';
	data: {
		type: 'repository';
		name: string; // name of the repository
		ownerLogin: string; // owner of the repository
		id: number;
	};
	id: string; // e.g. "microsoft/vscode"
}

export class RemoteAgentContribution implements IDisposable {
	private disposables = new DisposableStore();
	private refreshRemoteAgentsP: Promise<void> | undefined;
	private enabledSkillsPromise: Promise<Set<string>> | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IPromptVariablesService private readonly promptVariablesService: IPromptVariablesService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IGitService private readonly gitService: IGitService,
		@IGithubRepositoryService private readonly githubRepositoryService: IGithubRepositoryService,
		@IVSCodeExtensionContext private readonly vscodeExtensionContext: IVSCodeExtensionContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IUserFeedbackService private readonly userFeedbackService: IUserFeedbackService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuthenticationChatUpgradeService private readonly authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
	) {
		this.disposables.add(new Disposable(() => agentRegistrations.forEach(agent => agent.dispose())));

		this.refreshRemoteAgents();
		// Refresh remote agents whenever auth changes, e.g. in case the user was initially not signed in
		this.disposables.add(this.authenticationService.onDidAccessTokenChange(() => {
			this.refreshRemoteAgents();
		}));
	}

	dispose() {
		this.disposables.dispose();
	}

	private async refreshRemoteAgents(): Promise<void> {
		if (!this.refreshRemoteAgentsP) {
			this.refreshRemoteAgentsP = this._doRefreshRemoteAgents();
		}

		return this.refreshRemoteAgentsP.finally(() => this.refreshRemoteAgentsP = undefined);
	}

	private async _doRefreshRemoteAgents(): Promise<void> {
		const existingAgents = new Set(agentRegistrations.keys());

		try {
			const authToken = this.authenticationService.anyGitHubSession?.accessToken;
			if (!authToken) {
				// We have to silently wait for auth to become available so we can fetch remote agents
				this.logService.warn('Unable to fetch remote agents because user is not signed in.');
				return;
			}
			try {
				// First try to register the default platform agent
				if (!existingAgents.delete(GITHUB_PLATFORM_AGENT_ID)) { // Don't reregister it
					this.logService.info('Registering default platform agent...');
					agentRegistrations.set(GITHUB_PLATFORM_AGENT_ID, this.registerAgent(null));
				}
			} catch (ex) {
				this.logService.info(`Encountered error while registering platform agent: ${JSON.stringify(ex)}`);
			}
			const response = await this.capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			}, { type: RequestType.RemoteAgent });
			const text = await response.text();
			let newAgents: IAgent[];
			try {
				newAgents = (<IAgentsResponse>JSON.parse(text)).agents;
				if (!Array.isArray(newAgents)) {
					throw new Error(`Expected 'agents' to be an array`);
				}
			} catch (e) {
				if (!text.includes('access denied')) {
					this.logService.warn(`Invalid remote agent response: ${text} (${e})`);
				}
				return;
			}

			for (const agent of newAgents) {
				if (!existingAgents.delete(agent.slug)) {
					// only register if we haven't seen them yet
					agentRegistrations.set(agent.slug, this.registerAgent(agent));
				}
			}
		} catch (e) {
			this.logService.error(e, 'Failed to load remote copilot agents');
		}

		for (const item of existingAgents) {
			agentRegistrations.get(item)!.dispose();
			agentRegistrations.delete(item);
		}
	}

	private checkAuthorized(agent: string) {
		if (agent === GITHUB_PLATFORM_AGENT_NAME) {
			return true;
		}
		const key = `copilot.agent.${agent}.authorized`;
		return this.vscodeExtensionContext.globalState.get<boolean>(key, false) || this.vscodeExtensionContext.workspaceState.get<boolean>(key, false);
	}

	private async setAuthorized(agent: string, isGlobal = false) {
		const memento = isGlobal ? this.vscodeExtensionContext.globalState : this.vscodeExtensionContext.workspaceState;
		await memento.update(`copilot.agent.${agent}.authorized`, true);
	}

	private registerAgent(agentData: IAgent | null): Disposable {
		const store = new DisposableStore();
		const participantId = `github.copilot-dynamic.${agentData?.slug ?? GITHUB_PLATFORM_AGENT_ID}`;
		const slug = agentData?.slug ?? GITHUB_PLATFORM_AGENT_NAME;
		const description = agentData?.description ?? l10n.t("Get answers grounded in web search and code search");
		const dynamicProps: DynamicChatParticipantProps = {
			name: slug,
			description,
			publisherName: agentData?.owner_login ?? 'GitHub',
			fullName: agentData?.name ?? 'GitHub',
		};
		let hasShownImplicitContextAuthorizationForSession = false;
		const agent = store.add(chat.createDynamicChatParticipant(participantId, dynamicProps, async (request, context, responseStream, token): Promise<ICopilotChatResult> => {
			const sessionId = getOrCreateSessionId(context);
			const responseId = generateUuid();
			// This isn't used anywhere but is needed to fix the IChatResult shape which the remote agents follow
			const modelMessageId = generateUuid();
			const metadata: ICopilotChatResult['metadata'] & Record<string, unknown> = {
				sessionId,
				modelMessageId,
				responseId,
				agentId: participantId,
				command: request.command,
			};

			let accessToken: string | undefined;
			if (request.acceptedConfirmationData) {
				for (const data of request.acceptedConfirmationData) {
					if (data?.url) {
						// Store that the user has authorized the agent
						await this.setAuthorized(slug, request.prompt.startsWith(l10n.t('Authorize for all workspaces')));
						await commands.executeCommand('vscode.open', Uri.parse(data.url));
						responseStream.markdown(l10n.t('Please complete authorization in your browser and resend your question.'));
						return { metadata } satisfies ICopilotChatResult;
					} else if (data?.hasAcknowledgedImplicitReferences) {
						// Store that the user has acknowledged implicit references
						await this.setAuthorized(slug, request.prompt.startsWith(l10n.t('Allow for All Workspaces')));
						responseStream.markdown(l10n.t('Your preference has been saved.'));
						return { metadata } satisfies ICopilotChatResult;
						// This property is set by the confirmation in the Upgrade service
					} else if (data?.authPermissionPrompted) {
						request = await this.authenticationChatUpgradeService.handleConfirmationRequest(responseStream, request, context.history);
						metadata.command = request.command;
						accessToken = (await this.authenticationService.getGitHubSession('permissive', { silent: true }))?.accessToken;
						if (!accessToken) {
							responseStream.markdown(l10n.t('The additional permissions are required for this feature.'));
							return { metadata } satisfies ICopilotChatResult;
						}
					}
				}
			}

			// Slugless means it's the platform agent
			if (!agentData?.slug) {
				accessToken = this.authenticationService.permissiveGitHubSession?.accessToken;
				if (!accessToken) {
					if (this.authenticationService.isMinimalMode) {
						responseStream.markdown(l10n.t('Minimal mode is enabled. You will need to change `github.copilot.advanced.authPermissions` to `default` to use this feature.'));
						responseStream.button({
							title: l10n.t('Open Settings (JSON)'),
							command: 'workbench.action.openSettingsJson',
							arguments: [{ revealSetting: { key: 'github.copilot.advanced.authPermissions' } }]
						});
					} else {
						// Otherwise, show the permissive session upgrade prompt because it's required
						this.authenticationChatUpgradeService.showPermissiveSessionUpgradeInChat(
							responseStream,
							request,
							l10n.t('`@github` requires access to your repositories on GitHub for handling requests.')
						);
					}
					return { metadata } satisfies ICopilotChatResult;
				}
			}

			// Use the basic access token as a fallback
			if (!accessToken) {
				accessToken = this.authenticationService.anyGitHubSession?.accessToken;
			}

			try {
				const selectedEndpoint = await this.endpointProvider.getChatEndpoint(request);
				// Converts the selected endpoint to a remote agent endpoint so we can request the model the user selected to the agent
				const endpoint = this.instantiationService.createInstance(RemoteAgentChatEndpoint, {
					model_picker_enabled: false,
					is_chat_default: false,
					vendor: selectedEndpoint.modelProvider,
					billing: selectedEndpoint.isPremium && selectedEndpoint.multiplier ? { is_premium: selectedEndpoint.isPremium, multiplier: selectedEndpoint.multiplier, restricted_to: selectedEndpoint.restrictedToSkus } : undefined,
					is_chat_fallback: false,
					capabilities: {
						supports: { tool_calls: selectedEndpoint.supportsToolCalls, vision: selectedEndpoint.supportsVision, streaming: true },
						type: 'chat',
						tokenizer: selectedEndpoint.tokenizer,
						family: selectedEndpoint.family,
					},
					id: selectedEndpoint.model,
					name: selectedEndpoint.name,
					version: selectedEndpoint.version,
				}, agentData ? { type: RequestType.RemoteAgentChat, slug: agentData.slug } : { type: RequestType.RemoteAgentChat });

				// This flattens the docs agent's variables and ignores other variable values for now
				const resolved = await this.promptVariablesService.resolveVariablesInPrompt(request.prompt, request.references);

				// Collect copilot skills and references to be sent in the request
				const copilotReferences = [];
				const { copilot_skills } = await this.resolveCopilotSkills(slug, request);

				let hasIgnoredFiles = false;
				try {
					const result = await this.prepareClientPlatformReferences([...request.references], slug);
					hasIgnoredFiles = result.hasIgnoredFiles;

					if (result.clientReferences) {
						copilotReferences.push(...result.clientReferences);
					}
					for (const ref of result.vscodeReferences) {
						responseStream.reference(ref);
					}
				} catch (ex) {
					if (ex instanceof Error && ex.message.includes('File seems to be binary and cannot be opened as text')) {
						responseStream.markdown(l10n.t("Sorry, binary files are not currently supported."));
						return { metadata } satisfies ICopilotChatResult;
					} else {
						return {
							errorDetails: { message: (ex.message) },
							metadata
						};
					}
				}

				// Note: the platform agent will deal with token counting for us
				const reportedReferences = new Map<string, ICopilotReference>();
				const agentReferences: ICopilotReference[] = [];
				const confirmations = prepareConfirmations(request);
				let reportedProgress: Progress<ChatResponseWarningPart | ChatResponseReferencePart2> | undefined = undefined;
				let pendingProgress: { resolvedMessage: string; deferred: DeferredPromise<string> } | undefined;
				let hadCopilotErrorsOrConfirmations = false;

				const response = await endpoint.makeChatRequest(
					'remoteAgent',
					[
						...prepareRemoteAgentHistory(participantId, context),
						{
							role: Raw.ChatRole.User,
							content: (request.acceptedConfirmationData?.length || request.rejectedConfirmationData?.length)
								? []
								: [{ type: Raw.ChatCompletionContentPartKind.Text, text: resolved.message }],
							...(copilotReferences.length ? { copilot_references: copilotReferences } : undefined),
							...(confirmations?.length ? { copilot_confirmations: confirmations } : undefined),
						}
					],
					async (result, _, delta) => {
						if (delta.copilotReferences) {

							const processReference = (reference: ICopilotReference, parentReference?: ICopilotReference) => {
								const url = 'url' in reference ? reference.url : 'url' in reference.data ? reference.data.url : 'html_url' in reference.data ? reference.data.html_url : undefined;
								if (url && typeof url === 'string') {
									if (!reportedReferences.has(url)) {
										let icon: ChatResponseReferencePart['iconPath'] = undefined;
										const parsed = new URL(url);
										if (parsed.hostname === 'github.com') {
											icon = new ThemeIcon('github');
										} else {
											icon = new ThemeIcon('globe');
										}
										if (reportedProgress) {
											reportedProgress?.report(new ChatResponseReferencePart(Uri.parse(url), icon));
										} else {
											responseStream.reference(Uri.parse(url), icon);
										}

										// Keep track of the parent reference and not the individual URL used, as this will be sent again in history
										reportedReferences.set(url, parentReference ?? reference);
									}
								} else if (reference.metadata) {
									const icon = reference.metadata.display_icon ? Uri.parse(reference.metadata.display_icon) : new ThemeIcon('globe');
									const value = reference.metadata.display_url ? Uri.parse(reference.metadata.display_url) : reference.metadata.display_name;
									if (reportedProgress) {
										reportedProgress.report(new ChatResponseReferencePart2(value, icon));
									} else {
										responseStream.reference2(value, icon);
									}
									reportedReferences.set(reference.metadata.display_url ?? reference.metadata.display_name, parentReference ?? reference);
								}
							};

							// Report web references
							for (const reference of delta.copilotReferences) {
								if (Array.isArray(reference.data.results)) {
									reference.data.results.forEach((r) => {
										processReference(r, reference);
									});
								} else if (reference.data.type === 'github.agent') {
									agentReferences.push(reference);
								} else if (reference.type === 'github.text') {
									continue;
								} else if ('html_url' in reference.data || 'url' in reference.data && typeof reference.data.url === 'string' || reference.metadata) {
									processReference(reference);
								}
							}
						}

						const reportProgress = (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>, resolvedMessage: string) => {
							pendingProgress?.deferred.complete(pendingProgress.resolvedMessage);
							reportedProgress = progress;
							const deferred = new DeferredPromise<string>();
							pendingProgress = { deferred, resolvedMessage };
							return deferred.p;
						};

						if (delta._deprecatedCopilotFunctionCalls) {
							for (const call of delta._deprecatedCopilotFunctionCalls) {
								switch (call.name) {
									case 'bing-search': {
										try {
											const data: { query: string } = JSON.parse(call.arguments);
											responseStream.progress(l10n.t('Searching Bing for "{0}"...', data.query), async (progress) => reportProgress(progress, l10n.t('Bing search results for "{0}"', data.query)));
										} catch (ex) { }
										break;
									}
									case 'codesearch': {
										try {
											const data: { query: string; scopingQuery: string } = JSON.parse(call.arguments);
											responseStream.progress(l10n.t('Searching {0} for "{1}"...', data.scopingQuery, data.query), async (progress) =>
												reportProgress(progress, l10n.t('Code search results for "{0}" in {1}', data.query, data.scopingQuery)));
										} catch (ex) { }
										break;
									}
								}
							}
						}

						if (delta.copilotErrors && typeof responseStream.warning === 'function') {
							hadCopilotErrorsOrConfirmations = true;
							for (const error of delta.copilotErrors) {
								if (reportedProgress) {
									reportedProgress?.report(new ChatResponseWarningPart(error.message));
								} else {
									responseStream.warning(error.message);
								}
							}
						}

						if (delta.copilotConfirmation) {
							hadCopilotErrorsOrConfirmations = true;
							const confirm = delta.copilotConfirmation;
							responseStream.confirmation(confirm.title, confirm.message, confirm.confirmation);
						}

						if (delta.text) {
							pendingProgress?.deferred.complete(pendingProgress.resolvedMessage);
							const md = new MarkdownString(delta.text);
							md.supportHtml = true;
							responseStream.markdown(md);
						}
						return undefined;
					},
					token,
					ChatLocation.Panel,
					undefined,
					{
						secretKey: accessToken,
						copilot_thread_id: sessionId,
						...(copilot_skills ? { copilot_skills } : undefined)
					},
					true,
					{
						messageSource: `serverAgent.${agentData?.slug ?? GITHUB_PLATFORM_AGENT_ID}`,
					}
				);

				metadata['copilot_references'] = [...new Set(reportedReferences.values()).values(), ...agentReferences];
				if (response.type === ChatFetchResponseType.Success && hasIgnoredFiles) {
					responseStream.markdown(HAS_IGNORED_FILES_MESSAGE);
				}

				if (response.type !== ChatFetchResponseType.Success) {
					this.logService.warn(`Bad response from remote agent "${slug}": ${response.type} ${response.reason}`);
					if (response.reason.includes('400 no docs found')) {
						return {
							errorDetails: { message: 'No docs found' },
							metadata
						};
					} else if (response.type === ChatFetchResponseType.AgentUnauthorized) {
						const url = new URL(response.authorizationUrl);
						const editorContext = agentData?.editor_context ? l10n.t('**@{0}** will read your active file and selection.', slug) : '';
						responseStream.confirmation(
							l10n.t('Authorize agent'),
							editorContext + '\n' +
							l10n.t({
								message: 'Please authorize usage of **@{0}** on {1} and resend your question. [Learn more]({2}).',
								args: [slug, url.hostname, 'https://aka.ms/vscode-github-chat-extension-editor-context'],
								comment: [`{Locked=']({'}`]
							}),
							{ url: response.authorizationUrl },
							[l10n.t("Authorize"), l10n.t('Authorize for All Workspaces')]
						);
						return { metadata, nextQuestion: { prompt: request.prompt, participant: participantId, command: request.command } } satisfies ICopilotChatResult;
					} else if (response.type === ChatFetchResponseType.AgentFailedDependency) {
						return {
							errorDetails: { message: l10n.t('Sorry, an error occurred: {0}', response.reason) },
							metadata
						};
					} else if (response.type !== ChatFetchResponseType.Unknown || !hadCopilotErrorsOrConfirmations) {
						return {
							errorDetails: { message: response.reason },
							metadata
						};
					}
				}

				// Ask the user to authorize implicit context
				if (!this.checkAuthorized(slug) && agentData?.editor_context && !hasShownImplicitContextAuthorizationForSession) {
					responseStream.confirmation(
						l10n.t('Grant access to editor context'),
						l10n.t({
							message: '**@{0}** would like to read your active file and selection. [Learn More]({1})',
							args: [slug, 'https://aka.ms/vscode-github-chat-extension-editor-context'],
							comment: [`{Locked=']({'}`]
						}),
						{ hasAcknowledgedImplicitReferences: true },
						[l10n.t("Allow"), l10n.t("Allow for All Workspaces")]
					);
					hasShownImplicitContextAuthorizationForSession = true;
				}

				return { metadata } satisfies ICopilotChatResult;
			} catch (e) {
				this.logService.error(`/agents/${slug} failed: ${e}`);
				return { metadata };
			}
		}));
		agent.iconPath = agentData ? Uri.parse(agentData.avatar_url) : new ThemeIcon('github');

		if (slug === GITHUB_PLATFORM_AGENT_NAME) {
			agent.participantVariableProvider = {
				triggerCharacters: ['#'],
				provider: {
					provideCompletionItems: async (query, token) => {
						const items = await this.getPlatformAgentSkills();
						return items.map<ChatCompletionItem>(i => {
							const item = new ChatCompletionItem(`copilot.${i.name}`, '#' + i.name, [{ value: i.insertText, level: ChatVariableLevel.Full, description: i.description }]);
							item.command = i.command;
							item.detail = i.description;
							return item;
						});
					},
				}
			};
		}

		store.add(
			agent.onDidReceiveFeedback(e => this.userFeedbackService.handleFeedback(e, participantId)));

		return store;
	}

	private async prepareClientPlatformReferences(variables: ChatPromptReference[], slug: string) {
		const clientReferences: IPlatformReference[] = [];
		const vscodeReferences: ({
			variableName: string;
			value?: Uri | Location | undefined;
		} | Location | Uri)[] = [];
		let hasIgnoredFiles = false;
		let hasSentImplicitSelectionReference = false;

		const redactFileContents = async (document: TextDocument, range?: Range) => {
			const filename = path.basename(document.uri.toString());
			let content = document.getText(range);
			if (await this.ignoreService.isCopilotIgnored(document.uri)) {
				hasIgnoredFiles = true;
				content = 'content-exclusion';
			} else if (filename.startsWith('.')) {
				content = 'hidden-file'; // e.g. .env
			} else if (Buffer.byteLength(content, 'utf8') > 1024 ** 3) {
				content = 'file-too-large'; // exceeds 1GB
			}
			return content;
		};

		const getImplicitContextId = async (uri: Uri) => {
			// The ID of the file should be relative to the root of the repository if we're in a repository
			// falling back to a workspace folder-relative path if we're not in a repository
			// and finally falling back to the file basename e.g. if it's an untracked file that doesn't belong to the open workspace or repo
			const repository = await this.gitService.getRepository(uri);
			const baseUri = repository ? repository.rootUri.toString() : this.workspaceService.getWorkspaceFolder(uri)?.toString();
			return baseUri ? path.relative(baseUri, uri.toString()) : path.basename(uri.path);
		};

		const addFileReference = async (document: TextDocument, variableName?: string, isImplicit?: boolean) => {
			clientReferences.push({
				type: 'client.file',
				data: {
					language: document.languageId,
					content: await redactFileContents(document)
				},
				is_implicit: Boolean(isImplicit),
				id: await getImplicitContextId(document.uri)
			});

			vscodeReferences.push(variableName
				? { variableName, value: document.uri }
				: document.uri
			);
		};

		const addSelectionReference = async (activeTextEditor: TextEditor, variableName?: string, reportReference = false, isImplicit?: boolean) => {
			const selectionStart = activeTextEditor.selection.start.line;
			const selection = activeTextEditor.selection.isEmpty ? new Range(new Position(selectionStart, 0), new Position(selectionStart + 1, 0)) : activeTextEditor.selection;

			clientReferences.push({
				type: 'client.selection',
				data: {
					start: { line: selection.start.line, col: selection.start.character },
					end: { line: selection.end.line, col: selection.end.character },
					content: await redactFileContents(activeTextEditor.document, selection)
				},
				is_implicit: Boolean(isImplicit),
				id: await getImplicitContextId(activeTextEditor.document.uri)
			});

			if (reportReference) {
				vscodeReferences.push(variableName
					? { variableName, value: new Location(activeTextEditor.document.uri, selection) }
					: new Location(activeTextEditor.document.uri, selection)
				);
			}
		};

		// Check whether we can send file and selection data implicitly
		if (this.checkAuthorized(slug)) {
			const { activeTextEditor } = this.tabsAndEditorsService;
			if (activeTextEditor && variables.find(v => v.id.startsWith('vscode.implicit'))) {
				await addFileReference(activeTextEditor.document, undefined, true);
				await addSelectionReference(activeTextEditor, undefined, undefined, true);
				hasSentImplicitSelectionReference = true;
			}
		}

		for (const variable of variables) {
			if (URI.isUri(variable.value)) {
				const textDocument = await this.workspaceService.openTextDocument(variable.value);
				await addFileReference(textDocument, variable.name);
			} else if (variable.name === 'selection') {
				const { activeTextEditor } = this.tabsAndEditorsService;
				if (!activeTextEditor) {
					throw new Error(l10n.t({ message: 'Please open a text editor to use the `#selection` variable.', comment: '{Locked=\'`#selection`\'}' }));
				}
				if (!hasSentImplicitSelectionReference) {
					await addSelectionReference(activeTextEditor, variable.name, true);
				}
			} else if (variable.name === 'editor' && this.tabsAndEditorsService.activeTextEditor) {
				await addFileReference(this.tabsAndEditorsService.activeTextEditor.document, variable.name);
			}
		}

		// Always send the open GitHub repositories
		if (!this.gitService.isInitialized) {
			await this.gitService.initialize();
		}
		const repositories = this.gitService.repositories;
		for (const repository of repositories) {
			const repoId = getGitHubRepoInfoFromContext(repository)?.id;
			if (!repoId) {
				continue; // Not a GitHub repository
			}

			try {
				const repo = await this.githubRepositoryService.getRepositoryInfo(repoId.org, repoId.repo);
				clientReferences.push({
					type: 'github.repository',
					id: toGithubNwo(repoId),
					data: {
						type: 'repository',
						name: repoId.repo,
						ownerLogin: repoId.org,
						id: repo.id
					}
				});
			} catch (ex) {
				if (ex instanceof Error && ex.message.includes('Failed to fetch repository info')) {
					// TODO display a merged confirmation to reauthorize with the repo scope
					// For now, raise a reauth badge so the user has a way out of this state
					void this.authenticationService.getGitHubSession('permissive', { silent: true });
				}
				this.logService.error(ex, 'Failed to fetch info about current GitHub repository');
			}
		}

		return { clientReferences, vscodeReferences, hasIgnoredFiles };
	}

	private async listEnabledSkills(authToken: string) {
		if (!this.enabledSkillsPromise) {
			this.enabledSkillsPromise = this.capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.ListSkills })
				.then(response => response.json())
				.then((json) => json?.['skills'].reduce((acc: Set<string>, skill: { slug: string }) => acc.add(skill.slug), new Set()));
		}
		return this.enabledSkillsPromise;
	}

	private async resolveCopilotSkills(agent: string, request: ChatRequest): Promise<{ copilot_skills: string[] }> {
		if (agent === GITHUB_PLATFORM_AGENT_NAME) {
			const skills = new Set<string>();
			for (const variable of request.references) {
				if (GITHUB_PLATFORM_AGENT_SKILLS[variable.name]) {
					skills.add(GITHUB_PLATFORM_AGENT_SKILLS[variable.name]);
				}
			}
			return { copilot_skills: [...skills] };
		}

		return { copilot_skills: [] };
	}

	private async getPlatformAgentSkills() {
		const authToken = this.authenticationService.anyGitHubSession?.accessToken;
		if (!authToken) {
			return [];
		}

		// Register platform agent-specific native skills
		const skills = await this.listEnabledSkills(authToken);

		return [
			{ name: 'web', insertText: `#web`, description: 'Search Bing for real-time context', kind: 'bing-search', command: undefined },
		].filter((skill) => skills.has(skill.kind));
	}
}

function prepareConfirmations(request: ChatRequest) {
	const confirmations = [
		...(request.acceptedConfirmationData?.map(c => ({ state: 'accepted', confirmation: c })) ?? []),
		...(request.rejectedConfirmationData?.map(c => ({ state: 'dismissed', confirmation: c })) ?? []),
	];

	return confirmations;
}

function prepareRemoteAgentHistory(agentId: string, context: ChatContext): Raw.ChatMessage[] {

	const result: Raw.ChatMessage[] = [];

	for (const h of context.history) {

		if (h.participant !== agentId) {
			continue;
		}

		if (h instanceof ChatRequestTurn) {
			result.push({
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: h.prompt }],
			});
		}

		if (h instanceof ChatResponseTurn) {
			const copilot_references = h.result.metadata?.['copilot_references'];
			const content = h.response.map(r => {
				if (r instanceof ChatResponseMarkdownPart) {
					return r.value.value;
				} else if ('content' in r) {
					return r.content;
				} else {
					return null;
				}
			}).filter(r => !!r).join('');
			result.push({
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: content }],
				...(copilot_references ? { copilot_references } : undefined)
			});
		}
	}

	return result;
}

function getOrCreateSessionId(context: ChatContext): string {
	let sessionId: string | undefined;
	for (const h of context.history) {
		if (h instanceof ChatResponseTurn) {
			const maybeSessionId = (h.result as ICopilotChatResultIn).metadata?.sessionId;
			if (typeof maybeSessionId === 'string') {
				sessionId = maybeSessionId;
				break;
			}
		}
	}

	return sessionId ?? generateUuid();
}
