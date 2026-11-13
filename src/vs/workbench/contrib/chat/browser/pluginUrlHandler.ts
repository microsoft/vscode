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
import { CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, getEnabledCustomizationMarketplaceSources } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
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
import { ICustomizationHarnessService, ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider } from '../common/customizationHarnessService.js';
import { isUntitledChatSession } from '../common/model/chatUri.js';
import { IMarketplaceReference, MarketplaceReferenceKind, parseProviderMarketplaceReference } from '../common/plugins/marketplaceReference.js';
import { IAgentSessionsService } from './agentSessions/agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { getProviderMarketplaceSourceId } from './aiCustomization/customizationMarketplaceWorkbenchService.js';
import { isDefaultPluginMarketplace } from './aiCustomization/pluginCustomizationMarketplaceProvider.js';

const awesomeCopilotCatalogIdentityPrefix = 'urn:air:github.com:github:awesome-copilot:';

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
		@ICustomizationMarketplaceService private readonly marketplaceService: ICustomizationMarketplaceService,
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
					? localize('confirmInstallPluginFromSource', "Install Plugin '{1}' from '{0}'?", ref.displayLabel, pluginName)
					: localize('confirmAddMarketplace', "Add Plugin Marketplace '{0}'?", ref.displayLabel),
				detail: pluginName
					? localize('confirmPluginLinkDetail', "An external application wants to install a plugin from this source. Plugins can run code on your machine. Continue only if you initiated this request and trust this source.\n\nSource: {0}", ref.rawValue)
					: localize('confirmMarketplaceLinkDetail', "An external application wants to add this plugin marketplace. Continue only if you initiated this request and trust this source.\n\nSource: {0}", ref.rawValue),
				primaryButton: pluginName
					? localize('installPluginButton', "&&Install")
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
			if (pluginName && !installProvider) {
				throw new Error(localize('pluginLinkHarnessUnavailable', "The selected Copilot Agent Host session does not support marketplace management or plugin installation."));
			}

			if (pluginName && installProvider) {
				const agentFinderPlugin = !ref.ref && isDefaultPluginMarketplace(ref)
					? await this.resolveAgentFinderPlugin(pluginName)
					: undefined;
				if (agentFinderPlugin) {
					await installProvider.install(session.backendResource, agentFinderPlugin, CancellationToken.None);
				} else {
					if (!managementProvider) {
						throw new Error(localize('pluginLinkHarnessUnavailable', "The selected Copilot Agent Host session does not support marketplace management or plugin installation."));
					}
					const marketplace = await this.getOrAddMarketplace(managementProvider, session.backendResource, ref);
					const configuredPlugin = await this.findConfiguredPlugin(managementProvider, session.backendResource, marketplace, pluginName);
					await installProvider.install(session.backendResource, {
						...configuredPlugin,
						sourceId: getProviderMarketplaceSourceId(marketplace.name),
					}, CancellationToken.None);
				}
			} else {
				if (!managementProvider) {
					throw new Error(localize('pluginLinkHarnessUnavailable', "The selected Copilot Agent Host session does not support marketplace management or plugin installation."));
				}
				await this.getOrAddMarketplace(managementProvider, session.backendResource, ref);
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

	private async resolveAgentFinderPlugin(pluginName: string): Promise<ICustomizationMarketplaceResource | undefined> {
		const sourceId = CustomizationMarketplaceSources.AgentFinderPublicFeed.id;
		if (!getEnabledCustomizationMarketplaceSources(this.configurationService, this.marketplaceService.sources).some(source => source.id === sourceId)) {
			return undefined;
		}

		const requestedIdentity = pluginName.toLowerCase();
		const matches = await this.queryAgentFinderPlugins(pluginName, item => {
			const installation = item.installation;
			const catalogIdentity = installation?.kind === 'providerCatalog'
				? installation.catalogIdentity?.toLowerCase()
				: undefined;
			const expectedIdentity = requestedIdentity.startsWith(awesomeCopilotCatalogIdentityPrefix)
				? requestedIdentity
				: `${awesomeCopilotCatalogIdentityPrefix}${requestedIdentity}`;
			return installation?.kind === 'providerCatalog' &&
				installation.resourceKind === 'plugin' &&
				catalogIdentity?.startsWith(awesomeCopilotCatalogIdentityPrefix) === true &&
				catalogIdentity === expectedIdentity;
		});
		if (matches.length === 0 && !requestedIdentity.startsWith('urn:')) {
			matches.push(...await this.getAgentFinderBrowsePlugins(item => {
				const installation = item.installation;
				const reference = installation?.kind === 'providerPlugin' && installation.marketplaceSource
					? parseProviderMarketplaceReference(installation.marketplaceSource)
					: undefined;
				return installation?.kind === 'providerPlugin' &&
					installation.name.toLowerCase() === requestedIdentity &&
					!!reference &&
					isDefaultPluginMarketplace(reference);
			}));
		}

		if (matches.length === 0) {
			throw new Error(localize('pluginLinkAgentFinderPluginNotFound', "The plugin '{0}' was not found in the GitHub Feed.", pluginName));
		}
		if (matches.length > 1) {
			throw new Error(localize('pluginLinkAgentFinderPluginAmbiguous', "Multiple GitHub Feed plugins matched '{0}'.", pluginName));
		}
		return matches[0];
	}

	private async getAgentFinderBrowsePlugins(
		predicate: (item: ICustomizationMarketplaceResource) => boolean,
	): Promise<ICustomizationMarketplaceResource[]> {
		const result = await this.marketplaceService.getBrowseSections?.({
			sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id],
		}, CancellationToken.None);
		if (result?.error) {
			throw new Error(result.error);
		}

		const matches = new Map<string, ICustomizationMarketplaceResource>();
		for (const section of result?.sections ?? []) {
			for (const item of section.items) {
				if (predicate(item)) {
					matches.set(getCustomizationMarketplaceResourceKey(item), item);
				}
			}
		}
		return [...matches.values()];
	}

	private async queryAgentFinderPlugins(
		query: string,
		predicate: (item: ICustomizationMarketplaceResource) => boolean,
	): Promise<ICustomizationMarketplaceResource[]> {
		const matches: ICustomizationMarketplaceResource[] = [];
		let cursor: ICustomizationMarketplaceCursor | undefined;
		do {
			const page = await this.marketplaceService.query({
				sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id],
				mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				query,
				pageSize: 50,
				cursor,
			}, CancellationToken.None);
			if (page.sourceErrors?.length) {
				throw new Error(page.sourceErrors.map(error => error.message).join('\n'));
			}
			matches.push(...page.items.filter(predicate));
			cursor = page.nextCursor;
		} while (matches.length < 2 && cursor);
		return matches;
	}

	private async getOrAddMarketplace(
		managementProvider: ICustomizationMarketplaceManagementProvider,
		sessionResource: URI,
		ref: IMarketplaceReference,
	): Promise<ICustomizationMarketplaceInfo> {
		const marketplaces = await managementProvider.list(sessionResource);
		return marketplaces.find(marketplace => parseProviderMarketplaceReference(marketplace.source)?.canonicalId === ref.canonicalId)
			?? managementProvider.add(sessionResource, ref.rawValue);
	}

	private async findConfiguredPlugin(
		managementProvider: ICustomizationMarketplaceManagementProvider,
		sessionResource: URI,
		marketplace: ICustomizationMarketplaceInfo,
		pluginName: string,
	): Promise<ICustomizationMarketplaceResource> {
		let cursor: string | undefined;
		const seenCursors = new Set<string>();
		while (true) {
			const page = await managementProvider.queryMarketplace(sessionResource, marketplace, { query: pluginName, cursor }, CancellationToken.None);
			const plugin = page.items.find(item => item.installation?.kind === 'providerPlugin' && item.installation.name === pluginName);
			if (plugin) {
				return {
					...plugin,
					sourceId: getProviderMarketplaceSourceId(marketplace.name),
				};
			}
			if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
				throw new Error(localize('pluginLinkPluginNotFound', "Marketplace '{0}' was added, but plugin '{1}' was not found. No plugin was installed.", marketplace.name, pluginName));
			}
			cursor = page.nextCursor;
			seenCursors.add(cursor);
		}
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
		return (decoded && parseProviderMarketplaceReference(decoded)) || parseProviderMarketplaceReference(raw);
	}
}
