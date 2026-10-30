/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { AICustomizationManagementCommands } from '../common/aiCustomizationWorkspaceService.js';
import { IChatSessionsService, INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../common/chatSessionsService.js';
import { ChatConfiguration } from '../common/constants.js';
import { ICustomizationHarnessService } from '../common/customizationHarnessService.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../common/model/chatUri.js';
import { IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReference, parseMarketplaceReferences, parseProviderMarketplaceReference } from '../common/plugins/marketplaceReference.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IAgentHostNewSessionFolderService } from './agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { getProviderMarketplaceSourceId } from './aiCustomization/customizationMarketplaceWorkbenchService.js';

type PluginLinkTarget = IQuickPickItem & (
	| { readonly id: 'vscode' }
	| { readonly id: 'copilot'; readonly resource: URI }
	| { readonly id: 'manual' }
);

/** Handles confirmed marketplace links for an explicitly selected installation owner on this machine. */
export class PluginUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.pluginUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly provisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostNewSessionFolderService private readonly newSessionFolderService: IAgentHostNewSessionFolderService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== 'chat-plugin' || (uri.path !== '/install' && uri.path !== '/add-marketplace')) {
			return false;
		}

		try {
			this.checkEnabled();

			const params = new URLSearchParams(uri.query);
			const sourceKey = uri.path === '/install' ? 'source' : 'ref';
			const source = params.get(sourceKey);
			const ref = source && this.parseReference(source);
			if (!ref || params.getAll(sourceKey).length !== 1 || ref.kind === MarketplaceReferenceKind.LocalFileUri) {
				throw new Error(localize('invalidPluginLinkSource', "The plugin link must specify a valid remote marketplace source."));
			}
			const pluginName = uri.path === '/install' ? params.get('plugin') : undefined;
			if (uri.path === '/install' && (!pluginName || params.getAll('plugin').length !== 1 || /[@\u0000-\u001f\u007f]/.test(pluginName))) {
				throw new Error(localize('invalidPluginLinkName', "The plugin link must specify a plugin name."));
			}
			const requestedHarness = params.get('harness');
			if (requestedHarness !== null && (params.getAll('harness').length !== 1 || (requestedHarness !== 'copilot' && requestedHarness !== 'vscode'))) {
				throw new Error(localize('invalidPluginLinkHarness', "The plugin link's harness must be specified once, as 'copilot' or 'vscode'."));
			}

			await this.hostService.focus(mainWindow);
			if (isWeb || this.environmentService.remoteAuthority) {
				await this.showManualInstructions(ref, pluginName ?? undefined, localize('pluginLinkLocalOnly', "Plugin links can only change installations on this machine. Open the link in a local VS Code window, or install manually in Copilot on the intended machine."));
				return true;
			}
			const target = await this.selectTarget(ref, pluginName ?? undefined, requestedHarness ?? undefined);
			if (!target) {
				return true;
			}
			if (target.id === 'manual') {
				await this.showManualInstructions(ref, pluginName ?? undefined);
				return true;
			}
			const { confirmed } = await this.dialogService.confirm({
				type: 'warning',
				message: pluginName
					? localize('confirmAddMarketplaceAndPlugin', "Install Plugin '{0}' for {1} on This Machine?", pluginName, target.label)
					: localize('confirmAddMarketplace', "Add Plugin Marketplace for {0} on This Machine?", target.label),
				detail: pluginName
					? localize('confirmMarketplacePluginLinkDetail', "An external application wants to add this marketplace and install a plugin. Plugins can run code on your machine. Continue only if you initiated this request and trust this source.\n\nSource: {0}\n\nInstallation owner: {1}\n{2}", ref.rawValue, target.label, target.detail ?? '')
					: localize('confirmMarketplaceLinkDetail', "An external application wants to add this plugin marketplace. Continue only if you initiated this request and trust this source.\n\nSource: {0}\n\nInstallation owner: {1}\n{2}", ref.rawValue, target.label, target.detail ?? ''),
				primaryButton: pluginName
					? localize('addMarketplaceAndInstallButton', "&&Add Marketplace and Install")
					: localize('addMarketplaceButton', "&&Add Marketplace"),
				custom: { icon: Codicon.shield },
			});
			if (!confirmed) {
				return true;
			}
			this.checkEnabled();
			if (target.id === 'vscode') {
				await this.installForVSCode(ref, pluginName ?? undefined);
				return true;
			}

			const session = await this.resolveSession(target.resource);
			if (!session) {
				return true;
			}
			const descriptor = this.harnessService.getDescriptorForSession(session.resource);
			const managementProvider = descriptor?.marketplaceManagementProvider;
			const installProvider = descriptor?.marketplaceInstallProvider;
			if (!managementProvider || (pluginName && !installProvider)) {
				throw new Error(localize('pluginLinkHarnessUnavailable', "The selected Copilot Agent Host session does not support marketplace management or plugin installation."));
			}

			this.checkEnabled();
			const marketplaces = await managementProvider.list(session.backendResource);
			const existingMarketplace = marketplaces.find(marketplace => parseProviderMarketplaceReference(marketplace.source)?.canonicalId === ref.canonicalId);
			this.checkEnabled();
			const marketplace = existingMarketplace ?? await managementProvider.add(session.backendResource, ref.rawValue);
			if (pluginName && installProvider) {
				let cursor: string | undefined;
				const seenCursors = new Set<string>();
				while (true) {
					const page = await managementProvider.queryMarketplace(session.backendResource, marketplace, { query: pluginName, cursor }, CancellationToken.None);
					const plugin = page.items.find(item => item.installation?.kind === 'providerPlugin' && item.installation.name === pluginName);
					if (plugin) {
						this.checkEnabled();
						await installProvider.install(session.backendResource, {
							...plugin,
							sourceId: getProviderMarketplaceSourceId(marketplace.name),
						}, CancellationToken.None);
						break;
					}
					if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
						throw new Error(localize('pluginLinkPluginNotFound', "Marketplace '{0}' was added, but plugin '{1}' was not found. No plugin was installed.", marketplace.name, pluginName));
					}
					cursor = page.nextCursor;
					seenCursors.add(cursor);
				}
			}

			await this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
				showDiscover: true,
				sessionResource: session.resource,
				searchQuery: pluginName ?? '',
			});
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('[PluginUrlHandler] Failed to handle plugin link', error);
				this.notificationService.error(localize('pluginLinkFailed', "Unable to complete the plugin link: {0}", error instanceof Error ? error.message : String(error)));
			}
		}
		return true;
	}

	private checkEnabled(): void {
		if (this.entitlementService.sentiment.hidden || this.entitlementService.sentiment.disabledInWorkspace ||
			this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
			throw new Error(localize('pluginLinksDisabled', "Plugin links are unavailable because chat or plugins are disabled."));
		}
	}

	private async selectTarget(reference: IMarketplaceReference, pluginName: string | undefined, requestedHarness: 'copilot' | 'vscode' | undefined): Promise<PluginLinkTarget | undefined> {
		const resource = this.harnessService.activeSessionResource.get();
		const targets: PluginLinkTarget[] = [{
			id: 'vscode',
			label: localize('pluginLinkVSCode', "VS Code"),
			description: localize('pluginLinkThisMachine', "This machine"),
			detail: localize('pluginLinkVSCodeDetail', "VS Code-managed shared plugins. Availability depends on each harness; this is not a native Claude or Codex installation."),
		}];
		if (await this.chatSessionsService.canResolveChatSession(SessionType.AgentHostCopilot)) {
			targets.push({
				id: 'copilot',
				label: localize('pluginLinkCopilot', "Copilot"),
				description: localize('pluginLinkThisMachine', "This machine"),
				detail: localize('pluginLinkCopilotDetail', "Copilot-managed user installation. This does not install the plugin for other harnesses."),
				resource,
			});
		}
		if (requestedHarness && !targets.some(target => target.id === requestedHarness)) {
			await this.showManualInstructions(reference, pluginName, localize('pluginLinkRequestedHarnessUnavailable', "The requested Copilot installation target is unavailable in this window. Open the link in a local window with Copilot Agent Host available, or install manually."));
			return undefined;
		}
		targets.push({
			id: 'manual',
			label: localize('pluginLinkManual', "Manual Installation Instructions"),
			detail: localize('pluginLinkManualDetail', "View and copy Copilot /plugin commands for the intended machine. Does not install anything."),
		});
		return this.quickInputService.pick(targets, {
			title: localize('pluginLinkSelectTarget', "Choose Plugin Installation Target"),
			placeHolder: localize('pluginLinkSelectTargetPlaceholder', "Choose which installation on this machine to change"),
			matchOnDetail: true,
			activeItem: targets.find(target => target.id === (requestedHarness ?? (resource.scheme === SessionType.AgentHostCopilot ? 'copilot' : 'vscode'))),
		});
	}

	private async showManualInstructions(reference: IMarketplaceReference, pluginName: string | undefined, reason?: string): Promise<void> {
		const commands = [
			`/plugin marketplace add ${reference.rawValue}`,
			'/plugin marketplace list',
			...(pluginName ? [`/plugin install ${pluginName}@<marketplace-name>`] : []),
		].join('\n');
		await this.dialogService.prompt<void>({
			type: 'info',
			message: localize('pluginLinkManualTitle', "Install Manually in Copilot"),
			detail: [
				...(reason ? [reason] : []),
				localize('pluginLinkManualInstructions', "Run these commands in a Copilot session on the intended machine. For installation, replace <marketplace-name> with the registered marketplace name shown by the list command, not the repository name. These are Copilot commands, not native Claude or Codex installation instructions. Trust and managed policies still apply."),
				commands,
			].join('\n\n'),
			buttons: [{
				label: localize('pluginLinkCopyCommands', "&&Copy Commands"),
				run: () => this.clipboardService.writeText(commands),
			}],
			cancelButton: true,
		});
	}

	private async installForVSCode(reference: IMarketplaceReference, pluginName: string | undefined): Promise<void> {
		if (pluginName) {
			const result = await this.pluginInstallService.installPluginFromSource(reference.rawValue, { plugin: pluginName });
			if (!result.success) {
				if (result.message) {
					throw new Error(result.message);
				}
				return;
			}
		} else {
			if (!await this.pluginInstallService.ensureMarketplaceTrusted(reference)) {
				return;
			}
			this.checkEnabled();
			const configured = this.configurationService.inspect<readonly (string | object)[]>(ChatConfiguration.PluginMarketplaces).userValue ?? [];
			if (!parseMarketplaceReferences(configured).some(value => value.canonicalId === reference.canonicalId)) {
				await this.configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...configured, reference.rawValue], ConfigurationTarget.USER);
			}
		}
		if (this.environmentService.isSessionsWindow) {
			this.notificationService.info(localize('pluginLinkVSCodeComplete', "The plugin link was completed for VS Code-managed shared plugins on this machine, not a harness-native installation."));
		} else {
			await this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
				showDiscover: true,
				sessionResource: LocalChatSessionUri.getNewSessionUri(),
				searchQuery: pluginName ?? '',
			});
		}
	}

	private async resolveSession(resource: URI): Promise<{ resource: URI; backendResource: URI } | undefined> {
		if (resource.scheme === SessionType.AgentHostCopilot) {
			const provisional = this.provisionalSessionService.get(resource);
			if (provisional) {
				return { resource, backendResource: provisional };
			}
			if (!isUntitledChatSession(resource)) {
				return { resource, backendResource: resource };
			}
		}

		const { confirmed } = await this.dialogService.confirm({
			type: 'question',
			message: localize('createPluginLinkSession', "Create a Copilot Agent Host Session for This Link?"),
			detail: localize('createPluginLinkSessionDetail', "The selected installation target requires a local Copilot Agent Host session. No active Copilot session is available."),
			primaryButton: localize('createPluginLinkSessionButton', "&&Create Session"),
		});
		if (!confirmed) {
			return undefined;
		}
		const options: INewSessionInAgentsWindowOptions = { noWorkspace: true, agentHostProvider: COPILOT_CLI_AGENT_PROVIDER_ID };
		const created = this.environmentService.isSessionsWindow
			? await this.commandService.executeCommand<URI | undefined>(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, options)
			: await this.commandService.executeCommand<URI | undefined>(`workbench.action.chat.openNewSessionEditor.${SessionType.AgentHostCopilot}`);
		if (!URI.isUri(created) || created.scheme !== SessionType.AgentHostCopilot) {
			throw new Error(localize('pluginLinkSessionCreationFailed', "Could not create a Copilot Agent Host session for this link."));
		}
		resource = created;
		if (this.environmentService.isSessionsWindow) {
			// Agents-window drafts already own their backend session; do not create a second provisional one.
			return { resource, backendResource: resource };
		}
		const backendResource = await this.provisionalSessionService.getOrCreate(resource, COPILOT_CLI_AGENT_PROVIDER_ID, this.newSessionFolderService.resolveNewSessionPrimary(resource));
		if (!backendResource) {
			throw new Error(localize('pluginLinkSessionCreationFailed', "Could not create a Copilot Agent Host session for this link."));
		}
		return { resource, backendResource };
	}

	private parseReference(raw: string) {
		let decoded: string | undefined;
		try {
			decoded = decodeBase64(raw).toString();
		} catch {
			// Marketplace references also support plain-text owner/repo and Git URLs.
		}
		return (decoded && parseMarketplaceReference(decoded)) || parseMarketplaceReference(raw);
	}
}
