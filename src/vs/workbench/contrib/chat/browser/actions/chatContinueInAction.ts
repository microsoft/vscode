/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { h } from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isAbsolute } from '../../../../../base/common/path.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IsSessionsWindowContext, ResourceContextKey } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IChatAgentService } from '../../common/participants/chatAgents.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { ChatModel } from '../../common/model/chatModel.js';
import { ChatRequestParser } from '../../common/requestParser/chatRequestParser.js';
import { ChatSendResult, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { ctxHasEditorModification } from '../chatEditing/chatEditingEditorContextKeys.js';
import { CHAT_SETUP_ACTION_ID } from './chatActions.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/**
 * Extracts the "owner/repo" name-with-owner from a git remote URL.
 * Supports HTTPS (https://github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git) formats.
 */
function extractNwoFromRemoteUrl(remoteUrl: string): string | undefined {
	const match = remoteUrl.match(/(?:github\.com)[/:](?<owner>[^/]+)\/(?<repo>[^/.]+)/);
	if (match?.groups) {
		return `${match.groups.owner}/${match.groups.repo}`;
	}
	return undefined;
}

/**
 * Resolves GitHub NWO from a local git repository path by reading `.git/config`.
 * Handles both regular repos and git worktrees.
 */
async function resolveGitRemoteNwo(repoPath: string, fileService: IFileService): Promise<string | undefined> {
	try {
		const gitPath = `${repoPath}/.git`;
		const gitUri = URI.file(gitPath);

		let configUri: URI;
		try {
			const stat = await fileService.stat(gitUri);
			if (stat.isDirectory) {
				// Regular git repo
				configUri = URI.file(`${gitPath}/config`);
			} else {
				// Git worktree — .git is a file with "gitdir: <path>"
				const gitFile = await fileService.readFile(gitUri);
				const gitDir = gitFile.value.toString().trim().replace(/^gitdir:\s*/, '');
				// Resolve relative paths
				const resolvedGitDir = gitDir.startsWith('/')
					? gitDir
					: `${repoPath}/${gitDir}`;
				// The config is in the common dir (parent of worktree git dirs)
				// e.g., gitdir points to /repo/.git/worktrees/name, config is at /repo/.git/config
				const commonDir = resolvedGitDir.replace(/\/worktrees\/[^/]+$/, '');
				configUri = URI.file(`${commonDir}/config`);
			}
		} catch {
			// .git doesn't exist
			return undefined;
		}

		const content = await fileService.readFile(configUri);
		const configText = content.value.toString();

		// Parse remote "origin" URL from git config
		const remoteMatch = configText.match(/\[remote\s+"origin"\][^[]*url\s*=\s*(.+)/m);
		if (remoteMatch?.[1]) {
			return extractNwoFromRemoteUrl(remoteMatch[1].trim());
		}
	} catch {
		// File not found or not readable
	}
	return undefined;
}

export const enum ActionLocation {
	ChatWidget = 'chatWidget',
	Editor = 'editor'
}

export class ContinueChatInSessionAction extends Action2 {

	static readonly ID = 'workbench.action.chat.continueChatInSession';

	constructor() {
		super({
			id: ContinueChatInSessionAction.ID,
			title: localize2('continueChatInSession', "Continue Chat in..."),
			tooltip: localize('continueChatInSession', "Continue Chat in..."),
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate(),
				ChatContextKeys.remoteJobCreating.negate(),
				ChatContextKeys.hasCanDelegateProviders,
			),
			menu: [{
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 3.4,
				when: ContextKeyExpr.and(
					ChatContextKeys.lockedToCodingAgent.negate(),
					ChatContextKeys.hasCanDelegateProviders,
				),
			},
			{
				id: MenuId.EditorContent,
				group: 'continueIn',
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled),
					ContextKeyExpr.equals(ResourceContextKey.LangId.key, PROMPT_LANGUAGE_ID),
					ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
					ctxHasEditorModification.negate(),
					ChatContextKeys.hasCanDelegateProviders,
				),
			}
			]
		});
	}

	override async run(): Promise<void> {
		// Handled by a custom action item
	}
}
export class ChatContinueInSessionActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly location: ActionLocation,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(action, {
			actionProvider: ChatContinueInSessionActionItem.actionProvider(chatSessionsService, instantiationService, location),
			actionBarActions: ChatContinueInSessionActionItem.getActionBarActions(openerService),
			reporter: { id: 'ChatContinueInSession', name: 'ChatContinueInSession', includeOptions: true },
		}, actionWidgetService, keybindingService, contextKeyService, telemetryService);
	}

	protected static getActionBarActions(openerService: IOpenerService) {
		const learnMoreUrl = 'https://aka.ms/vscode-continue-chat-in';
		return [{
			id: 'workbench.action.chat.continueChatInSession.learnMore',
			label: localize('chat.learnMore', "Learn More"),
			tooltip: localize('chat.learnMore', "Learn More"),
			class: undefined,
			enabled: true,
			run: async () => {
				await openerService.open(URI.parse(learnMoreUrl));
			}
		}];
	}

	private static actionProvider(chatSessionsService: IChatSessionsService, instantiationService: IInstantiationService, location: ActionLocation): IActionWidgetDropdownActionProvider {
		return {
			getActions: () => {
				const actions: IActionWidgetDropdownAction[] = [];
				const contributions = chatSessionsService.getAllChatSessionContributions();

				// Continue in Background
				const backgroundContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Background);
				if (backgroundContrib && backgroundContrib.canDelegate) {
					actions.push(this.toAction(AgentSessionProviders.Background, backgroundContrib, instantiationService, location));
				}

				// Continue in Cloud
				const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
				if (cloudContrib && cloudContrib.canDelegate) {
					actions.push(this.toAction(AgentSessionProviders.Cloud, cloudContrib, instantiationService, location));
				}

				// Offer actions to enter setup if we have no contributions
				if (actions.length === 0) {
					actions.push(this.toSetupAction(AgentSessionProviders.Background, instantiationService));
					actions.push(this.toSetupAction(AgentSessionProviders.Cloud, instantiationService));
				}

				return actions;
			}
		};
	}

	private static toAction(provider: AgentSessionProviders, contrib: IChatSessionsExtensionPoint, instantiationService: IInstantiationService, location: ActionLocation): IActionWidgetDropdownAction {
		return {
			id: contrib.type,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			description: `@${contrib.name}`,
			label: getAgentSessionProviderName(provider),
			tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			category: { label: localize('continueIn', "Continue In"), order: 0, showHeader: true },
			run: () => instantiationService.invokeFunction(accessor => {
				if (location === ActionLocation.Editor) {
					return new CreateRemoteAgentJobFromEditorAction().run(accessor, contrib);
				}
				return new CreateRemoteAgentJobAction().run(accessor, contrib);
			})
		};
	}

	private static toSetupAction(provider: AgentSessionProviders, instantiationService: IInstantiationService): IActionWidgetDropdownAction {
		return {
			id: provider,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			label: getAgentSessionProviderName(provider),
			tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			category: { label: localize('continueIn', "Continue In"), order: 0, showHeader: true },
			run: () => instantiationService.invokeFunction(accessor => {
				const commandService = accessor.get(ICommandService);
				return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
			})
		};
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		if (this.location === ActionLocation.Editor) {
			const view = h('span.action-widget-delegate-label', [
				h('span', { className: ThemeIcon.asClassName(Codicon.forward) }),
				h('span', [localize('continueInEllipsis', "Continue in...")])
			]);
			element.appendChild(view.root);
			return null;
		} else {
			const icon = this.contextKeyService.contextMatchesRules(ChatContextKeys.remoteJobCreating) ? Codicon.sync : Codicon.forward;
			element.classList.add(...ThemeIcon.asClassNameArray(icon));
			return super.renderLabel(element);
		}
	}
}

const NEW_CHAT_SESSION_ACTION_ID = 'workbench.action.chat.openNewSessionEditor';

export class CreateRemoteAgentJobAction {
	constructor() { }

	private openUntitledEditor(commandService: ICommandService, continuationTarget: IChatSessionsExtensionPoint) {
		commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
	}

	/**
	 * Extracts the GitHub "owner/repo" NWO from the source session by checking
	 * multiple data sources: chat model repoData, session metadata, and session options.
	 */
	private async extractRepoNwoFromSession(agentSessionsService: IAgentSessionsService, chatSessionsService: IChatSessionsService, fileService: IFileService, sessionResource: URI, chatModel: ChatModel): Promise<string | undefined> {
		// 1. Try chat model's repoData (populated when local git repo exists)
		const repoData = chatModel.repoData;
		if (repoData?.remoteUrl) {
			const nwo = extractNwoFromRemoteUrl(repoData.remoteUrl);
			if (nwo) {
				return nwo;
			}
		}

		// 2. Try agent session metadata (populated by session providers)
		const agentSession = agentSessionsService.getSession(sessionResource);
		if (agentSession?.metadata) {
			const metadata = agentSession.metadata;

			// Cloud sessions set name/owner in metadata
			const owner = metadata.owner as string | undefined;
			const name = metadata.name as string | undefined;
			if (owner && name) {
				return `${owner}/${name}`;
			}

			// Background sessions may set repositoryNwo directly
			const repositoryNwo = metadata.repositoryNwo as string | undefined;
			if (repositoryNwo?.includes('/')) {
				return repositoryNwo;
			}

			// Background sessions may set repositoryUrl
			const repositoryUrl = metadata.repositoryUrl as string | undefined;
			if (repositoryUrl) {
				const nwo = extractNwoFromRemoteUrl(repositoryUrl);
				if (nwo) {
					return nwo;
				}
			}

			// Background sessions set workingDirectoryPath — resolve git remote from it
			const workingDir = (metadata.workingDirectoryPath ?? metadata.repositoryPath ?? metadata.worktreePath) as string | undefined;
			if (workingDir) {
				const nwo = await resolveGitRemoteNwo(workingDir, fileService);
				if (nwo) {
					return nwo;
				}
			}
		}

		// 3. Try session options (repository picker selection)
		// Cloud sessions use 'repositories', sessions window uses 'repository'
		for (const optionId of ['repositories', 'repository']) {
			const repoOption = chatSessionsService.getSessionOption(sessionResource, optionId);
			if (repoOption) {
				const optionValue = typeof repoOption === 'string' ? repoOption : (repoOption as { id: string }).id;
				if (optionValue) {
					// Check if it's already a "owner/repo" NWO (exactly two segments)
					const segments = optionValue.split('/').filter(Boolean);
					if (segments.length === 2) {
						return optionValue;
					}
					// Try extracting NWO from a URL
					const nwo = extractNwoFromRemoteUrl(optionValue);
					if (nwo) {
						return nwo;
					}
					// Try parsing as URI (e.g. github-remote-file://github/owner/repo/...)
					try {
						const uri = URI.parse(optionValue);
						if (uri.authority === 'github') {
							const parts = uri.path.split('/').filter(Boolean);
							if (parts.length >= 2) {
								return `${parts[0]}/${parts[1]}`;
							}
						}
					} catch { /* ignore */ }
					// Local filesystem path — resolve git remote
					if (isAbsolute(optionValue)) {
						const nwoFromGit = await resolveGitRemoteNwo(optionValue, fileService);
						if (nwoFromGit) {
							return nwoFromGit;
						}
					}
				}
			}
		}

		return undefined;
	}

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint, _widget?: IChatWidget) {
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);
		const widgetService = accessor.get(IChatWidgetService);
		const chatAgentService = accessor.get(IChatAgentService);
		const chatService = accessor.get(IChatService);
		const editorService = accessor.get(IEditorService);
		const agentSessionsService = accessor.get(IAgentSessionsService);
		const chatSessionsService = accessor.get(IChatSessionsService);
		const fileService = accessor.get(IFileService);

		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const widget = _widget ?? widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return this.openUntitledEditor(commandService, continuationTarget);
			}

			// todo@connor4312: remove 'as' cast
			const chatModel = widget.viewModel.model as ChatModel;
			if (!chatModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					return this.openUntitledEditor(commandService, continuationTarget);
				}
				userPrompt = 'implement this.';
			}

			const attachedContext = widget.input.getAttachedAndImplicitContext(sessionResource);
			widget.input.acceptInput(true);

			// For inline editor mode, add selection or cursor information
			if (widget.location === ChatAgentLocation.EditorInline) {
				const activeEditor = editorService.activeTextEditorControl;
				if (activeEditor) {
					const model = activeEditor.getModel();
					let activeEditorUri: URI | undefined = undefined;
					if (model && isITextModel(model)) {
						activeEditorUri = model.uri as URI;
					}
					const selection = activeEditor.getSelection();
					if (activeEditorUri && selection) {
						attachedContext.add({
							kind: 'file',
							id: 'vscode.implicit.selection',
							name: basename(activeEditorUri),
							value: {
								uri: activeEditorUri,
								range: selection
							},
						});
					}
				}
			}

			const continuationTargetType = continuationTarget.type;

			// When source and target session types differ in the sessions window,
			// open a new session of the target type with the prompt and context
			// instead of sending to the current (incompatible) session resource.
			const isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService);
			const sourceProvider = getAgentSessionProvider(sessionResource);
			if (isSessionsWindow && sourceProvider && sourceProvider !== continuationTargetType) {
				const isSidebar = isIChatViewViewContext(widget.viewContext);
				const actionId = isSidebar
					? `workbench.action.chat.openNewSessionSidebar.${continuationTargetType}`
					: `${NEW_CHAT_SESSION_ACTION_ID}.${continuationTargetType}`;

				// Build conversation transcript from the source session to preserve context.
				// Truncate to avoid exceeding token limits of the target model.
				const maxTranscriptLength = 20_000;
				let transcript = chatRequests.map(req => {
					const userMsg = `User: ${req.message.text}`;
					const respMsg = req.response?.response ? `Assistant: ${req.response.response.getMarkdown()}` : '';
					return respMsg ? `${userMsg}\n${respMsg}` : userMsg;
				}).join('\n\n');
				if (transcript.length > maxTranscriptLength) {
					transcript = transcript.substring(transcript.length - maxTranscriptLength);
				}

				const delegationPrompt = transcript
					? `The following is the conversation history from a previous ${getAgentSessionProviderName(sourceProvider)} session. Continue working on it.\n\n${transcript}\n\nUser: ${userPrompt}`
					: userPrompt;

				// Extract repository info from the source session to pass to the target session
				const initialSessionOptions: { optionId: string; value: string }[] = [];
				const repoNwo = await this.extractRepoNwoFromSession(agentSessionsService, chatSessionsService, fileService, sessionResource, chatModel);
				if (repoNwo) {
					initialSessionOptions.push({ optionId: 'repositories', value: repoNwo });
				}

				await commandService.executeCommand(actionId, {
					prompt: delegationPrompt,
					attachedContext: attachedContext.asArray(),
					initialSessionOptions: initialSessionOptions.length > 0 ? initialSessionOptions : undefined,
				});
				return;
			}

			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const instantiationService = accessor.get(IInstantiationService);
			const requestParser = instantiationService.createInstance(ChatRequestParser);

			// Add the request to the model first
			const parsedRequest = requestParser.parseChatRequest(sessionResource, userPrompt, ChatAgentLocation.Chat);
			const addedRequest = chatModel.addRequest(
				parsedRequest,
				{ variables: attachedContext.asArray() },
				0,
				undefined,
				defaultAgent
			);

			await chatService.removeRequest(sessionResource, addedRequest.id);
			const sendResult = await chatService.sendRequest(sessionResource, userPrompt, {
				agentIdSilent: continuationTargetType,
				attachedContext: attachedContext.asArray(),
				userSelectedModelId: widget.input.currentLanguageModel,
				...widget.getModeRequestOptions()
			});

			if (ChatSendResult.isSent(sendResult)) {
				await widget.handleDelegationExitIfNeeded(defaultAgent, sendResult.data.agent);
			}
		} catch (e) {
			console.error('[Delegation] Error creating remote coding agent job', e);
			throw e;
		} finally {
			remoteJobCreatingKey.set(false);
		}
	}
}

class CreateRemoteAgentJobFromEditorAction {
	constructor() { }

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint) {

		try {
			const editorService = accessor.get(IEditorService);
			const activeEditor = editorService.activeTextEditorControl;
			const commandService = accessor.get(ICommandService);

			if (!activeEditor) {
				return;
			}
			const model = activeEditor.getModel();
			if (!model || !isITextModel(model)) {
				return;
			}
			const uri = model.uri;
			const attachedContext = [toPromptFileVariableEntry(uri, PromptFileVariableKind.PromptFile, undefined, false, [])];
			const prompt = `Follow instructions in [${basename(uri)}](${uri.toString()}).`;
			await commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`, { prompt, attachedContext });
		} catch (e) {
			console.error('Error creating remote agent job from editor', e);
			throw e;
		}
	}
}

export class ContinueChatInSessionActionRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.continueChatInSessionActionRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const disposable = actionViewItemService.register(MenuId.EditorContent, ContinueChatInSessionAction.ID, (action, options, instantiationService2) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChatContinueInSessionActionItem, action, ActionLocation.Editor);
		});
		markAsSingleton(disposable);
	}
}
