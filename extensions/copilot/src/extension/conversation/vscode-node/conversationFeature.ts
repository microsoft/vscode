/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatAgentService, terminalAgentName } from '../../../platform/chat/common/chatAgents';
import { IConversationOptions } from '../../../platform/chat/common/conversationOptions';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DevContainerConfigGeneratorArguments, IDevContainerConfigurationService } from '../../../platform/devcontainer/common/devContainerConfigurationService';
import { ICombinedEmbeddingIndex } from '../../../platform/embeddings/common/vscodeIndex';
import { FEEDBACK_URL } from '../../../platform/endpoint/common/domainService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitCommitMessageService } from '../../../platform/git/common/gitCommitMessageService';
import { ILogService } from '../../../platform/log/common/logService';
import { ISettingsEditorSearchService } from '../../../platform/settingsEditor/common/settingsEditorSearchService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ChatExtGlobalPerfMark, markChatExtGlobal } from '../../../util/common/performance';
import { isUri } from '../../../util/common/types';
import { DeferredPromise, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore, IDisposable, combinedDisposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { byokLanguageModelProviderNames } from '../../byok/vscode-node/byokContribution';
import { ContributionCollection, IExtensionContribution } from '../../common/contributions';
import { vscodeNodeChatContributions, vscodeNodeChatSignedInContributions } from '../../extension/vscode-node/contributions';
import { IMergeConflictService } from '../../git/common/mergeConflictService';
import { registerInlineChatCommands } from '../../inlineChat/vscode-node/inlineChatCommands';
import { INewWorkspacePreviewContentManager } from '../../intents/node/newIntent';
import { FindInFilesArgs } from '../../intents/node/searchIntent';
import { TerminalExplainIntent } from '../../intents/node/terminalExplainIntent';
import { ILinkifyService } from '../../linkify/common/linkifyService';
import { registerLinkCommands } from '../../linkify/vscode-node/commands';
import { InlineCodeSymbolLinkifier } from '../../linkify/vscode-node/inlineCodeSymbolLinkifier';
import { NotebookCellLinkifier } from '../../linkify/vscode-node/notebookCellLinkifier';
import { SymbolLinkifier } from '../../linkify/vscode-node/symbolLinkifier';
import { IntentDetector } from '../../prompt/node/intentDetector';
import { SemanticSearchTextSearchProvider } from '../../workspaceSemanticSearch/node/semanticSearchTextSearchProvider';
import { GitHubPullRequestProviders } from '../node/githubPullRequestProviders';
import { startFeedbackCollection } from './feedbackCollection';
import { registerNewWorkspaceIntentCommand } from './newWorkspaceFollowup';
import { generateTerminalFixes, setLastCommandMatchResult } from './terminalFixGenerator';

const BYOK_LANGUAGE_MODEL_AVAILABILITY_TIMEOUT = 5000;

/**
 * Class that checks if users are allowed to use the conversation feature,
 * and registers the relevant providers if they are.
 */
export class ConversationFeature implements IExtensionContribution {
	/** Disposables that exist for the lifetime of this object */
	private readonly _disposables = new DisposableStore();
	/** Disposables that are cleared whenever feature enablement is toggled */
	private readonly _activatedDisposables = new DisposableStore();
	/** Disposables that are cleared whenever signed-in feature enablement is toggled */
	private readonly _signedInDisposables = new DisposableStore();
	/** Whether the conversation feature is currently enabled for Copilot auth or BYOK models. */
	public _enabled;
	/** The feature is marked as active the first time it is enabled. */
	private _activated;
	private _signedInContributionsRegistered = false;
	private _hasByokLanguageModels = false;
	private _byokLanguageModelAvailabilityCheck = 0;
	private _disposed = false;

	/** Whether or not the search provider has been registered */
	private _searchProviderRegistered = false;
	/** Whether or not the settings search provider has been registered */
	private _settingsSearchProviderRegistered = false;

	readonly id = 'conversationFeature';
	readonly activationBlocker?: Promise<void>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConversationOptions private conversationOptions: IConversationOptions,
		@IChatAgentService private chatAgentService: IChatAgentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICombinedEmbeddingIndex private readonly embeddingIndex: ICombinedEmbeddingIndex,
		@IDevContainerConfigurationService private readonly devContainerConfigurationService: IDevContainerConfigurationService,
		@IGitCommitMessageService private readonly gitCommitMessageService: IGitCommitMessageService,
		@IMergeConflictService private readonly mergeConflictService: IMergeConflictService,
		@ILinkifyService private readonly linkifyService: ILinkifyService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@INewWorkspacePreviewContentManager private readonly newWorkspacePreviewContentManager: INewWorkspacePreviewContentManager,
		@ISettingsEditorSearchService private readonly settingsEditorSearchService: ISettingsEditorSearchService,
	) {
		this._enabled = false;
		this._activated = false;

		const activationBlockerDeferred = new DeferredPromise<void>();
		this.activationBlocker = activationBlockerDeferred.p;

		this._disposables.add(vscode.lm.onDidChangeChatModels(() => {
			void this.updateByokLanguageModelAvailability();
		}));

		if (authenticationService.copilotToken) {
			this.logService.info(`ConversationFeature: Copilot token already available`);
		} else {
			markChatExtGlobal(ChatExtGlobalPerfMark.WillWaitForCopilotToken);
			this.logService.info(`ConversationFeature: Waiting for copilot token or BYOK model to activate conversation feature`);
		}
		this.updateFeatureEnablement();
		void Promise.resolve().then(() => {
			if (this._disposed) {
				return;
			}
			return this.updateByokLanguageModelAvailability();
		}).finally(() => activationBlockerDeferred.complete());

		this._disposables.add(authenticationService.onDidAuthenticationChange(async () => {
			const hasSession = !!authenticationService.copilotToken;
			this.logService.info(`ConversationFeature: onDidAuthenticationChange has token: ${hasSession}`);
			if (hasSession) {
				markChatExtGlobal(ChatExtGlobalPerfMark.DidWaitForCopilotToken);
			}
			this.updateFeatureEnablement();

			activationBlockerDeferred.complete();
		}));
	}

	get enabled() {
		return this._enabled;
	}

	set enabled(value: boolean) {
		if (value && !this.activated) {
			this.activated = true;
		}
		this._enabled = value;

		// Set context value that is used to show/hide th sidebar icon
		vscode.commands.executeCommand('setContext', 'github.copilot.interactiveSession.disabled', !value);
	}

	get activated() {
		return this._activated;
	}

	set activated(value: boolean) {
		if (this._activated === value) {
			return;
		}
		this._activated = value;

		if (!value) {
			this.logService.info('ConversationFeature: Deactivating contributions');
			this._signedInDisposables.clear();
			this._signedInContributionsRegistered = false;
			this._searchProviderRegistered = false;
			this._settingsSearchProviderRegistered = false;
			this._activatedDisposables.clear();
		} else {
			this.logService.info('ConversationFeature: Activating contributions');
			const options: IConversationOptions = this.conversationOptions;

			this._activatedDisposables.add(this.registerParticipants(options));
			this._activatedDisposables.add(this.instantiationService.createInstance(ContributionCollection, vscodeNodeChatContributions));
			this.updateSignedInFeatures();
		}
	}

	dispose(): void {
		this._disposed = true;
		this._activated = false;
		this._signedInDisposables.dispose();
		this._activatedDisposables.dispose();
		this._disposables?.dispose();
	}

	public [Symbol.dispose]() { this.dispose(); }

	private registerParticipants(options: IConversationOptions): IDisposable {
		return this.chatAgentService.register(options);
	}

	private registerSearchProvider(): IDisposable | undefined {
		if (this._searchProviderRegistered) {
			return;
		} else {
			this._searchProviderRegistered = true;

			if (!this.authenticationService.copilotToken || this.authenticationService.copilotToken.isNoAuthUser) {
				this.logService.debug('ConversationFeature: Skipping search provider registration - no Copilot token available');
				return;
			}

			return vscode.workspace.registerAITextSearchProvider('file', this.instantiationService.createInstance(SemanticSearchTextSearchProvider));
		}
	}

	private registerSettingsSearchProvider(): IDisposable | undefined {
		if (this._settingsSearchProviderRegistered) {
			return;
		}
		if (!this.authenticationService.copilotToken) {
			this.logService.debug('ConversationFeature: Skipping settings search provider registration - no Copilot token available');
			return;
		}

		this._settingsSearchProviderRegistered = true;
		return vscode.ai.registerSettingsSearchProvider(this.settingsEditorSearchService);
	}

	private registerProviders(): IDisposable {
		const disposables = new DisposableStore();
		try {
			const detectionProvider = this.registerParticipantDetectionProvider();
			if (detectionProvider) {
				disposables.add(detectionProvider);
			}

			const searchDisposable = this.registerSearchProvider();
			if (searchDisposable) {
				disposables.add(searchDisposable);
			}

			const settingsSearchDisposable = this.registerSettingsSearchProvider();
			if (settingsSearchDisposable) {
				disposables.add(settingsSearchDisposable);
			}
		} catch (err) {
			this.logService.error(err, 'Registration of interactive providers failed');
		}
		return disposables;
	}

	private registerParticipantDetectionProvider() {
		if ('registerChatParticipantDetectionProvider' in vscode.chat) {
			const provider = this.instantiationService.createInstance(IntentDetector);
			return vscode.chat.registerChatParticipantDetectionProvider(provider);
		}
	}

	private registerCommands(options: IConversationOptions): IDisposable {
		const disposables = new DisposableStore();

		[
			vscode.commands.registerCommand('github.copilot.interactiveSession.feedback', async () => {
				return vscode.env.openExternal(vscode.Uri.parse(FEEDBACK_URL));
			}),
			vscode.commands.registerCommand('github.copilot.chat.compact', () => vscode.commands.executeCommand('workbench.action.chat.open', { query: '/compact' })),
			vscode.commands.registerCommand('github.copilot.terminal.explainTerminalLastCommand', async () => this.triggerTerminalChat({ query: `/${TerminalExplainIntent.intentName} #terminalLastCommand` })),
			vscode.commands.registerCommand('github.copilot.terminal.fixTerminalLastCommand', async () => generateTerminalFixes(this.instantiationService)),
			vscode.commands.registerCommand('github.copilot.terminal.generateCommitMessage', async () => {
				const workspaceFolders = vscode.workspace.workspaceFolders;

				if (!workspaceFolders?.length) {
					return;
				}
				const uri = workspaceFolders.length === 1 ? workspaceFolders[0].uri : await vscode.window.showWorkspaceFolderPick().then(folder => folder?.uri);
				if (!uri) {
					return;
				}

				const repository = await this.gitCommitMessageService.getRepository(uri);
				if (!repository) {
					return;
				}

				const commitMessage = await this.gitCommitMessageService.generateCommitMessage(repository, CancellationToken.None);
				if (commitMessage) {
					// Sanitize the message by escaping double quotes, backslashes, and $ characters
					const sanitizedMessage = commitMessage.replace(/"/g, '\\"').replace(/\\/g, '\\\\').replace(/\$/g, '\\$'); // CodeQL [SM02383] Backslashes are escaped as part of the second replace.
					const message = `git commit -m "${sanitizedMessage}"`;
					vscode.window.activeTerminal?.sendText(message, false);
				}
			}),
			vscode.commands.registerCommand('github.copilot.git.generateCommitMessage', async (rootUri: vscode.Uri | undefined, _: unknown, cancellationToken: vscode.CancellationToken | undefined) => {
				const repository = await this.gitCommitMessageService.getRepository(rootUri);
				if (!repository) {
					return;
				}

				const commitMessage = await this.gitCommitMessageService.generateCommitMessage(repository, cancellationToken);
				if (commitMessage) {
					repository.inputBox.value = commitMessage;
				}
			}),
			vscode.commands.registerCommand('github.copilot.git.resolveMergeConflicts', async (...resourceStates: (vscode.Uri | vscode.SourceControlResourceState)[]) => {
				const resources = resourceStates.filter(r => !!r).map(r => isUri(r) ? r : r.resourceUri);
				await this.mergeConflictService.resolveMergeConflicts(resources, undefined);
			}),
			vscode.commands.registerCommand('github.copilot.devcontainer.generateDevContainerConfig', async (args: DevContainerConfigGeneratorArguments, cancellationToken?: vscode.CancellationToken) => {
				if (cancellationToken) {
					return this.devContainerConfigurationService.generateConfiguration(args, cancellationToken);
				}

				const tokenSource = new vscode.CancellationTokenSource();
				try {
					return this.devContainerConfigurationService.generateConfiguration(args, tokenSource.token);
				} finally {
					tokenSource.dispose();
				}
			}),
			vscode.commands.registerCommand('github.copilot.chat.openUserPreferences', async () => {
				const uri = URI.joinPath(this.extensionContext.globalStorageUri, 'copilotUserPreferences.md');
				return vscode.commands.executeCommand('vscode.open', uri);
			}),
			this.instantiationService.invokeFunction(startFeedbackCollection),
			registerLinkCommands(this.telemetryService),
			this.linkifyService.registerGlobalLinkifier({
				create: () => this.instantiationService.createInstance(InlineCodeSymbolLinkifier)
			}),
			this.linkifyService.registerGlobalLinkifier({
				create: () => this.instantiationService.createInstance(SymbolLinkifier)
			}),
			this.linkifyService.registerGlobalLinkifier({
				create: () => disposables.add(this.instantiationService.createInstance(NotebookCellLinkifier))
			}),
			this.instantiationService.invokeFunction(registerInlineChatCommands),
			this.registerTerminalQuickFixProviders(),
			registerNewWorkspaceIntentCommand(this.newWorkspacePreviewContentManager, this.logService, options),
			registerGitHubPullRequestTitleAndDescriptionProvider(this.instantiationService),
			registerSearchIntentCommand(),
		].forEach(d => disposables.add(d));
		return disposables;
	}

	private async triggerTerminalChat(options: { query: string; isPartialQuery?: boolean }) {
		const chatLocation = this.configurationService.getConfig(ConfigKey.TerminalChatLocation);
		let commandId: string;
		switch (chatLocation) {
			case 'quickChat':
				commandId = 'workbench.action.quickchat.toggle';
				options.query = `@${terminalAgentName} ` + options.query;
				break;
			case 'terminal':
				commandId = 'workbench.action.terminal.chat.start';
				// HACK: Currently @terminal is hardcoded in core
				break;
			case 'chatView':
			default:
				commandId = 'workbench.action.chat.open';
				options.query = `@${terminalAgentName} ` + options.query;
				break;
		}
		await vscode.commands.executeCommand(commandId, options);
	}

	private registerRelatedInformationProviders(): IDisposable {
		const disposables = new DisposableStore();
		[
			vscode.ai.registerRelatedInformationProvider(
				vscode.RelatedInformationType.CommandInformation,
				this.embeddingIndex.commandIdIndex
			),
			vscode.ai.registerRelatedInformationProvider(
				vscode.RelatedInformationType.SettingInformation,
				this.embeddingIndex.settingsIndex
			)
		].forEach(d => disposables.add(d));
		return disposables;
	}

	private updateFeatureEnablement(): void {
		const chatEnabled = this.authenticationService.copilotToken !== undefined || this._hasByokLanguageModels;
		if (this.authenticationService.copilotToken) {
			this.logService.info(`copilot token sku: ${this.authenticationService.copilotToken.sku ?? ''}`);
		}
		this.enabled = chatEnabled;
		if (!chatEnabled) {
			this.activated = false;
		}
		this.updateSignedInFeatures();
	}

	private updateSignedInFeatures(): void {
		if (!this.activated) {
			return;
		}

		if (!this.authenticationService.copilotToken) {
			if (this._signedInContributionsRegistered) {
				this.logService.info('ConversationFeature: Deactivating signed-in contributions');
				this._signedInDisposables.clear();
				this._signedInContributionsRegistered = false;
				this._searchProviderRegistered = false;
				this._settingsSearchProviderRegistered = false;
			}
			return;
		}

		if (this._signedInContributionsRegistered) {
			return;
		}

		this.logService.info('ConversationFeature: Activating signed-in contributions');
		const options: IConversationOptions = this.conversationOptions;
		this._signedInDisposables.add(this.registerProviders());
		this._signedInDisposables.add(this.registerCommands(options));
		this._signedInDisposables.add(this.registerRelatedInformationProviders());
		this._signedInDisposables.add(this.instantiationService.createInstance(ContributionCollection, vscodeNodeChatSignedInContributions));
		this._signedInContributionsRegistered = true;
	}

	private async updateByokLanguageModelAvailability(): Promise<void> {
		const check = ++this._byokLanguageModelAvailabilityCheck;
		const results = await Promise.all(byokLanguageModelProviderNames.map(vendor => this.hasByokLanguageModels(vendor)));
		const hasByokLanguageModels = results.some(Boolean);

		if (this._disposed || check !== this._byokLanguageModelAvailabilityCheck) {
			return;
		}

		this._hasByokLanguageModels = hasByokLanguageModels;
		this.updateFeatureEnablement();
	}

	private async hasByokLanguageModels(vendor: string): Promise<boolean> {
		try {
			const models = await raceTimeout(Promise.resolve(vscode.lm.selectChatModels({ vendor })), BYOK_LANGUAGE_MODEL_AVAILABILITY_TIMEOUT, () => {
				this.logService.debug(`ConversationFeature: Timed out checking BYOK models for provider ${vendor}`);
			});
			return !!models?.length;
		} catch (error) {
			this.logService.debug(`ConversationFeature: Failed to check BYOK models for provider ${vendor}: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	private registerTerminalQuickFixProviders() {
		const isEnabled = () => this.enabled;
		return combinedDisposable(
			vscode.window.registerTerminalQuickFixProvider('copilot-chat.fixWithCopilot', {
				provideTerminalQuickFixes(commandMatchResult, token) {
					if (!isEnabled() || commandMatchResult.commandLine.endsWith('^C')) {
						return [];
					}
					setLastCommandMatchResult(commandMatchResult);
					return [
						{
							command: 'github.copilot.terminal.fixTerminalLastCommand',
							title: vscode.l10n.t('Fix using Copilot')
						},
						{
							command: 'github.copilot.terminal.explainTerminalLastCommand',
							title: vscode.l10n.t('Explain using Copilot')
						}
					];
				}
			}),
			vscode.window.registerTerminalQuickFixProvider('copilot-chat.generateCommitMessage', {
				provideTerminalQuickFixes: (commandMatchResult, token) => {
					return this.enabled ? [{
						command: 'github.copilot.terminal.generateCommitMessage',
						title: vscode.l10n.t('Generate Commit Message')
					}] : [];
				},
			})
		);
	}
}

function registerSearchIntentCommand(): IDisposable {
	return vscode.commands.registerCommand('github.copilot.executeSearch', async (arg: FindInFilesArgs) => {
		const show = arg.filesToExclude.length > 0 || arg.filesToInclude.length > 0;
		vscode.commands.executeCommand('workbench.view.search.focus').then(() =>
			vscode.commands.executeCommand('workbench.action.search.toggleQueryDetails', { show })
		);
		vscode.commands.executeCommand('workbench.action.findInFiles', arg);
	});
}

function registerGitHubPullRequestTitleAndDescriptionProvider(instantiationService: IInstantiationService): IDisposable {
	return instantiationService.createInstance(GitHubPullRequestProviders);
}
