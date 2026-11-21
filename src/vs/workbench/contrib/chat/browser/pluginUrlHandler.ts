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
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceCursor, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources, getEnabledCustomizationMarketplaceSources } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
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
import { SessionType } from '../common/chatSessionsService.js';
import { ChatConfiguration } from '../common/constants.js';
import { ICustomizationHarnessService } from '../common/customizationHarnessService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { DEFAULT_PLUGIN_MARKETPLACE, IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReferences, parseProviderMarketplaceReference, readConfiguredMarketplaces } from '../common/plugins/marketplaceReference.js';
import { isDefaultPluginMarketplace } from './aiCustomization/pluginCustomizationMarketplaceProvider.js';

const awesomeCopilotCatalogIdentityPrefix = 'urn:air:github.com:github:awesome-copilot:';
const defaultPluginMarketplaceReference = parseProviderMarketplaceReference(DEFAULT_PLUGIN_MARKETPLACE)!;

type PluginLinkHarness = 'copilot' | 'vscode';

interface IPluginLinkHarnessPick extends IQuickPickItem {
	readonly harness: PluginLinkHarness;
}

/** Handles external marketplace and plugin installation links after explicit owner selection and consent. */
export class PluginUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.pluginUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
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
			this.ensureLinksEnabled();

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
			const hint = params.get('harness');
			if (params.getAll('harness').length > 1 || (hint !== null && hint !== 'copilot' && hint !== 'vscode')) {
				throw new Error(localize('invalidPluginLinkHarness', "The plugin link must specify at most one harness: 'copilot' or 'vscode'."));
			}
			if (isWeb || this.environmentService.remoteAuthority) {
				throw new Error(localize('pluginLinkLocalWindowRequired', "Open this plugin link in a local VS Code desktop window. Plugin links do not install into a remote workspace or web environment."));
			}

			await this.hostService.focus(mainWindow);
			const harness = hint ?? await this.selectHarness();
			if (!harness) {
				return true;
			}
			const owner = harness === 'copilot'
				? localize('copilotPluginLinkOwner', "Copilot's user installation on this machine")
				: localize('vscodePluginLinkOwner', "VS Code's shared plugin installation on this machine");
			const { confirmed } = await this.dialogService.confirm({
				type: 'warning',
				message: pluginName
					? localize('confirmInstallPluginFromSource', "Install Plugin '{1}' from '{0}'?", ref.displayLabel, pluginName)
					: localize('confirmAddMarketplace', "Add Plugin Marketplace '{0}'?", ref.displayLabel),
				detail: pluginName
					? localize('confirmPluginLinkDetail', "An external application wants to install a plugin from this source into {0}. Plugins can run code on your machine. Continue only if you initiated this request and trust this source. This does not trust or run code from your workspace.\n\nSource: {1}", owner, ref.rawValue)
					: localize('confirmMarketplaceLinkDetail', "An external application wants to add this plugin marketplace to {0}. Continue only if you initiated this request and trust this source.\n\nSource: {1}", owner, ref.rawValue),
				primaryButton: pluginName
					? localize('installPluginButton', "&&Install")
					: localize('addMarketplaceButton', "&&Add Marketplace"),
				custom: { icon: Codicon.shield },
			});
			if (!confirmed) {
				return true;
			}
			this.ensureLinksEnabled();

			if (harness === 'copilot') {
				await this.installForCopilot(ref, pluginName ?? undefined);
			} else if (!await this.installForVSCode(ref, pluginName ?? undefined)) {
				return true;
			}

			await this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
				showDiscover: true,
				sessionType: harness === 'copilot' ? SessionType.AgentHostCopilot : SessionType.Local,
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

	private ensureLinksEnabled(): void {
		if (this.entitlementService.sentiment.hidden || this.entitlementService.sentiment.disabledInWorkspace ||
			this.configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) !== true) {
			throw new Error(localize('pluginLinksDisabled', "Plugin links are unavailable because chat or plugins are disabled."));
		}
	}

	private async selectHarness(): Promise<PluginLinkHarness | undefined> {
		const picks: IPluginLinkHarnessPick[] = [{
			harness: 'copilot',
			label: localize('pluginLinkCopilot', "Copilot"),
			description: localize('pluginLinkCopilotDescription', "Native Copilot plugins on this machine"),
			detail: localize('pluginLinkCopilotDetail', "No chat session is required. Does not install for Claude or Codex."),
		}, {
			harness: 'vscode',
			label: localize('pluginLinkVSCode', "VS Code"),
			description: localize('pluginLinkVSCodeDescription', "VS Code-managed shared plugins on this machine"),
			detail: localize('pluginLinkVSCodeDetail', "Available to compatible harnesses through VS Code. Does not install into native Claude or Codex inventories."),
		}];
		const picked = await this.quickInputService.pick(picks, {
			title: localize('pluginLinkSelectHarness', "Choose Where to Install Plugins"),
			placeHolder: localize('pluginLinkSelectHarnessPlaceholder', "Select the owner of this marketplace and plugin installation"),
			activeItem: picks[0],
			matchOnDescription: true,
			matchOnDetail: true,
		});
		return picked?.harness;
	}

	private async installForCopilot(ref: IMarketplaceReference, pluginName: string | undefined): Promise<void> {
		const agentFinderPlugin = pluginName && !ref.ref && isDefaultPluginMarketplace(ref)
			? await this.resolveAgentFinderPlugin(pluginName)
			: undefined;
		if (agentFinderPlugin) {
			const sessionResource = this.harnessService.getSessionResourceForHarness(SessionType.AgentHostCopilot);
			const installProvider = this.harnessService.getDescriptorForSession(sessionResource)?.marketplaceInstallProvider;
			if (!installProvider) {
				throw new Error(localize('pluginLinkHarnessUnavailable', "Copilot plugin installation is unavailable in this window."));
			}
			await installProvider.install(sessionResource, agentFinderPlugin, CancellationToken.None);
			return;
		}
		if (!this.agentHostService.listPluginMarketplaces || !this.agentHostService.addPluginMarketplace ||
			(pluginName && (!this.agentHostService.browsePluginMarketplace || !this.agentHostService.installPlugin))) {
			throw new Error(localize('pluginLinkCopilotUnavailable', "Copilot plugin installation is unavailable in this window. Select VS Code explicitly to use its shared plugin installer."));
		}
		const provider = COPILOT_CLI_AGENT_PROVIDER_ID;
		const marketplaces = await this.agentHostService.listPluginMarketplaces(provider);
		let marketplace = marketplaces.find(marketplace => {
			const source = parseProviderMarketplaceReference(marketplace.source);
			// The built-in source description omits the standard published marketplace branch.
			return source?.canonicalId === ref.canonicalId ||
				marketplace.isDefault && !marketplace.managed && !!source && !source.ref && isDefaultPluginMarketplace(source) &&
				ref.canonicalId === defaultPluginMarketplaceReference.canonicalId;
		});
		if (!marketplace) {
			const managementProvider = this.harnessService.getDescriptorForSession(
				this.harnessService.getSessionResourceForHarness(SessionType.AgentHostCopilot),
			)?.marketplaceManagementProvider;
			if (!managementProvider) {
				throw new Error(localize('pluginLinkMarketplaceManagementUnavailable', "Copilot marketplace management is unavailable in this window."));
			}
			marketplace = await managementProvider.add(undefined, ref.rawValue);
		}
		if (pluginName) {
			const plugins = await this.agentHostService.browsePluginMarketplace!(provider, undefined, marketplace.name);
			if (!plugins.some(plugin => plugin.name === pluginName)) {
				throw new Error(localize('pluginLinkPluginNotFound', "Marketplace '{0}' was added, but plugin '{1}' was not found. No plugin was installed.", marketplace.name, pluginName));
			}
			await this.agentHostService.installPlugin!(provider, { source: `${pluginName}@${marketplace.name}` });
		}
	}

	private async installForVSCode(ref: IMarketplaceReference, pluginName: string | undefined): Promise<boolean> {
		if (pluginName) {
			const result = await this.pluginInstallService.installPluginFromSource(ref.rawValue, { plugin: pluginName });
			if (!result.success) {
				if (result.message) {
					throw new Error(result.message);
				}
				return false;
			}
		} else {
			if (!await this.pluginInstallService.ensureMarketplaceTrusted(ref)) {
				return false;
			}
			const { userValues, effectiveValues } = readConfiguredMarketplaces(this.configurationService);
			if (!parseMarketplaceReferences(effectiveValues).some(existing => existing.canonicalId === ref.canonicalId)) {
				await this.configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...userValues, ref.rawValue], ConfigurationTarget.USER);
			}
		}
		return true;
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
