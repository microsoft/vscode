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
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IURLHandler, IURLService } from '../../../../platform/url/common/url.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { AICustomizationManagementCommands } from '../common/aiCustomizationWorkspaceService.js';
import { IChatSessionsService, INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../common/chatSessionsService.js';
import { ChatConfiguration } from '../common/constants.js';
import { ICustomizationHarnessService } from '../common/customizationHarnessService.js';
import { isUntitledChatSession } from '../common/model/chatUri.js';
import { MarketplaceReferenceKind, parseMarketplaceReference, parseProviderMarketplaceReference } from '../common/plugins/marketplaceReference.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { getProviderMarketplaceSourceId } from './aiCustomization/customizationMarketplaceWorkbenchService.js';

/**
 * Handles confirmed Copilot Agent Host marketplace links: `/add-marketplace?ref=owner/repo`
 * and `/install?source=owner/repo&plugin=name` under `vscode://chat-plugin`.
 */
export class PluginUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.pluginUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAgentSessionsService private readonly sessionsService: IAgentSessionsService,
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
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (uri.authority !== 'chat-plugin' || (uri.path !== '/install' && uri.path !== '/add-marketplace')) {
			return false;
		}

		try {
			if (this.entitlementService.sentiment.hidden || this.entitlementService.sentiment.disabledInWorkspace ||
				this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
				throw new Error(localize('pluginLinksDisabled', "Plugin links are unavailable because chat or plugins are disabled."));
			}

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

			await this.hostService.focus(mainWindow);
			const { confirmed } = await this.dialogService.confirm({
				type: 'warning',
				message: pluginName
					? localize('confirmAddMarketplaceAndPlugin', "Add Marketplace '{0}' and Install Plugin '{1}'?", ref.displayLabel, pluginName)
					: localize('confirmAddMarketplace', "Add Plugin Marketplace '{0}'?", ref.displayLabel),
				detail: pluginName
					? localize('confirmMarketplacePluginLinkDetail', "An external application wants to add this marketplace and install a plugin. Plugins can run code on your machine. Continue only if you initiated this request and trust this source.\n\nSource: {0}", ref.rawValue)
					: localize('confirmMarketplaceLinkDetail', "An external application wants to add this plugin marketplace. Continue only if you initiated this request and trust this source.\n\nSource: {0}", ref.rawValue),
				primaryButton: pluginName
					? localize('addMarketplaceAndInstallButton', "&&Add Marketplace and Install")
					: localize('addMarketplaceButton', "&&Add Marketplace"),
				custom: { icon: Codicon.shield },
			});
			if (!confirmed) {
				return true;
			}

			const session = await this.resolveSession();
			if (!session) {
				return true;
			}
			const descriptor = this.harnessService.getDescriptorForSession(session.resource);
			const managementProvider = descriptor?.marketplaceManagementProvider;
			const installProvider = descriptor?.marketplaceInstallProvider;
			if (!managementProvider || (pluginName && !installProvider)) {
				throw new Error(localize('pluginLinkHarnessUnavailable', "The selected Copilot Agent Host session does not support marketplace management or plugin installation."));
			}

			const marketplaces = await managementProvider.list(session.backendResource);
			const existingMarketplace = marketplaces.find(marketplace => parseProviderMarketplaceReference(marketplace.source)?.canonicalId === ref.canonicalId);
			const marketplace = existingMarketplace ?? await managementProvider.add(session.backendResource, ref.rawValue);
			if (pluginName && installProvider) {
				let cursor: string | undefined;
				const seenCursors = new Set<string>();
				while (true) {
					const page = await managementProvider.queryMarketplace(session.backendResource, marketplace, { query: pluginName, cursor }, CancellationToken.None);
					const plugin = page.items.find(item => item.installation?.kind === 'providerPlugin' && item.installation.name === pluginName);
					if (plugin) {
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

	private async resolveSession(): Promise<{ resource: URI; backendResource: URI } | undefined> {
		let resource = this.harnessService.activeSessionResource.get();
		if (resource.scheme === SessionType.AgentHostCopilot) {
			const provisional = this.provisionalSessionService.get(resource);
			if (provisional) {
				return { resource, backendResource: provisional };
			}
			if (!isUntitledChatSession(resource)) {
				return { resource, backendResource: resource };
			}
		}

		if (!await this.chatSessionsService.canResolveChatSession(SessionType.AgentHostCopilot)) {
			throw new Error(localize('pluginLinkCopilotUnavailable', "Plugin links require Copilot on the Agent Host."));
		}
		await this.sessionsService.model.resolve(SessionType.AgentHostCopilot, error => { throw error; });
		const existing = this.sessionsService.model.sessions.find(session => session.providerType === SessionType.AgentHostCopilot && !session.isArchived());
		if (existing) {
			return { resource: existing.resource, backendResource: existing.resource };
		}

		const { confirmed } = await this.dialogService.confirm({
			type: 'question',
			message: localize('createPluginLinkSession', "Create a Copilot Agent Host Session for This Link?"),
			detail: localize('createPluginLinkSessionDetail', "Adding a marketplace requires a Copilot Agent Host session. No existing session is available."),
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
