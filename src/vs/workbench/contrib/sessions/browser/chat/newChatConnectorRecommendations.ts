/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { autorun } from '../../../../../base/common/observable.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { IChatTip, IChatTipProvider, IChatTipService } from '../../../chat/browser/chatTipService.js';
import { ICustomizationMarketplaceInstallService } from '../../../chat/common/customizationMarketplaceInstallService.js';
import { findMatchingConnectorRecommendationIds } from '../../../chat/common/connectorRecommendations.js';
import { getConnectorMcpServerNames, getMatchingInstalledMcpPlugins, getMatchingInstalledMcpServers } from '../../../chat/common/connectorUpgrade.js';
import { IAgentPluginService } from '../../../chat/common/plugins/agentPluginService.js';
import { ICopilotConnectorsService } from '../../../chat/browser/aiCustomization/copilotConnectorsService.js';
import { IMcpWorkbenchService } from '../../../mcp/common/mcpTypes.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../../common/chatConstants.js';
import { isPhoneLayout } from '../../../../browser/parts/sessions/mobileLayout.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';

interface IConnectorRecommendation {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: URI;
	readonly mcpServerNames: readonly string[];
}

export class NewChatConnectorRecommendations extends Disposable implements IChatTipProvider {

	private static readonly _tipIdPrefix = 'connectorRecommendation.';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _recommendations = new Map<string, IConnectorRecommendation>();
	private readonly _recommendationUrls = new Map<string, readonly string[]>();
	private readonly _dismissed = new Set<string>();
	private _recommendationId: string | undefined;
	private _matchKey = '';
	private _suppressedMatchKey = '';
	private _availableRecommendationIds: readonly string[] = [];
	private _tipStateKey = '';
	private _tip: IChatTip | undefined;
	private _connectorInventoryLoading = false;

	constructor(
		private readonly options: {
			readonly getInputValue: () => string;
			readonly onDidChangeInputValue: Event<void>;
		},
		private readonly random: () => number = Math.random,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService productService: IProductService,
		@IChatTipService chatTipService: IChatTipService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@ICustomizationMarketplaceInstallService private readonly customizationMarketplaceInstallService: ICustomizationMarketplaceInstallService,
		@ICopilotConnectorsService private readonly copilotConnectorsService: ICopilotConnectorsService,
	) {
		super();
		if (isConfigurationValueFromDefault(this.configurationService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
			logSettingExperimentTrigger(telemetryService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING);
		}

		for (const [id, recommendation] of Object.entries(productService.connectorRecommendations ?? {})) {
			this._recommendations.set(id, {
				id,
				name: recommendation.name,
				description: recommendation.description,
				icon: URI.parse(recommendation.iconUrl),
				mcpServerNames: getConnectorMcpServerNames(id, recommendation.name, recommendation.mcpServerNames),
			});
			this._recommendationUrls.set(id, recommendation.urls ?? []);
		}

		this._register(chatTipService.registerTipProvider(this));
		this._register(this.options.onDidChangeInputValue(() => this.update()));
		this._register(this.layoutService.onDidLayoutMainContainer(() => this.update()));
		this._register(this.mcpWorkbenchService.onChange(() => this.update()));
		this._register(this.mcpWorkbenchService.onReset(() => this.update()));
		this._register(this.customizationMarketplaceInstallService.onDidChange(() => this.update()));
		this._register(this.copilotConnectorsService.onDidChange(() => this.update()));
		this._register(this.copilotConnectorsService.onDidChangeAccount(() => this.update()));
		this._register(autorun(reader => {
			for (const plugin of this.agentPluginService.plugins.read(reader)) {
				plugin.mcpServerDefinitions.read(reader);
			}
			this.update();
		}));
		void this.mcpWorkbenchService.whenInitialLocalMcpServersLoaded.then(() => {
			if (!this._store.isDisposed) {
				this.update();
			}
		});
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)
				|| event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)
				|| event.affectsConfiguration(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
				this.update();
			}
		}));
		this.update();
	}

	provideTip(): IChatTip | undefined {
		return this._tip;
	}

	hasMultipleTips(): boolean {
		return !!this._tip && this._availableRecommendationIds.length > 1;
	}

	navigateTip(direction: 1 | -1): IChatTip | undefined {
		if (!this._tip || this._availableRecommendationIds.length < 2 || !this._recommendationId) {
			return undefined;
		}
		const currentIndex = this._availableRecommendationIds.indexOf(this._recommendationId);
		if (currentIndex === -1) {
			return undefined;
		}
		const nextIndex = (currentIndex + direction + this._availableRecommendationIds.length) % this._availableRecommendationIds.length;
		this._recommendationId = this._availableRecommendationIds[nextIndex];
		this._tip = this.createTip(this._recommendations.get(this._recommendationId)!);
		return this._tip;
	}

	dismissTip(tipId: string): void {
		if (!tipId.startsWith(NewChatConnectorRecommendations._tipIdPrefix)) {
			return;
		}
		const connectorId = tipId.slice(NewChatConnectorRecommendations._tipIdPrefix.length);
		this._dismissed.add(connectorId);
		this._suppressedMatchKey = this._matchKey;
		this._recommendationId = undefined;
		this.update();
	}

	private update(): void {
		const enabled = !isPhoneLayout(this.layoutService)
			&& this._recommendations.size > 0
			&& this.configurationService.getValue<boolean>(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING) === true
			&& this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true
			&& this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true;
		const matching = enabled
			? findMatchingConnectorRecommendationIds(this.options.getInputValue(), this._recommendationUrls)
			: new Set<string>();
		const inventoryReady = matching.size === 0 || this.copilotConnectorsService.connectionStateKnown;
		if (!inventoryReady) {
			this.ensureConnectorInventory();
		}
		const recommendationId = inventoryReady ? this.getRecommendationId(matching) : undefined;
		const recommendation = recommendationId ? this._recommendations.get(recommendationId) : undefined;
		const isUpgrade = recommendation ? this.isUpgrade(recommendation) : false;
		const tip = recommendation ? this.createTip(recommendation, isUpgrade) : undefined;
		const tipStateKey = `${tip?.id ?? ''}\0${isUpgrade}\0${this._availableRecommendationIds.join('\0')}`;
		if (tipStateKey === this._tipStateKey) {
			return;
		}
		this._tipStateKey = tipStateKey;
		this._tip = tip;
		this._onDidChange.fire();
	}

	private ensureConnectorInventory(): void {
		if (this._connectorInventoryLoading) {
			return;
		}
		this._connectorInventoryLoading = true;
		void this.copilotConnectorsService.getConnectors(CancellationToken.None).finally(() => {
			this._connectorInventoryLoading = false;
			if (!this._store.isDisposed && this.copilotConnectorsService.connectionStateKnown) {
				this.update();
			}
		});
	}

	private getRecommendationId(matching: ReadonlySet<string>): string | undefined {
		const available = [...this._recommendations.keys()].filter(id =>
			matching.has(id)
			&& !this._dismissed.has(id)
			&& !this.isConnectorInstalled(this._recommendations.get(id)!)
			&& !this.hasMatchingMcpPlugin(this._recommendations.get(id)!)
		);
		this._availableRecommendationIds = available;
		const matchKey = [...matching].sort().join('\0');
		if (matchKey !== this._matchKey) {
			this._matchKey = matchKey;
			this._suppressedMatchKey = '';
			this._recommendationId = undefined;
		}
		if (!matchKey || this._suppressedMatchKey === matchKey) {
			return undefined;
		}
		if (!this._recommendationId || !available.includes(this._recommendationId)) {
			this._recommendationId = available.length > 0 ? available[Math.floor(this.random() * available.length)] : undefined;
		}
		return this._recommendationId;
	}

	private isUpgrade(recommendation: IConnectorRecommendation): boolean {
		return getMatchingInstalledMcpServers(this.mcpWorkbenchService.local, recommendation.mcpServerNames).length > 0;
	}

	private hasMatchingMcpPlugin(recommendation: IConnectorRecommendation): boolean {
		return getMatchingInstalledMcpPlugins(this.agentPluginService.plugins.get(), recommendation.mcpServerNames).length > 0;
	}

	private isConnectorInstalled(recommendation: IConnectorRecommendation): boolean {
		return this.customizationMarketplaceInstallService.installations.get().installations.some(installation =>
			installation.state.kind === 'installed'
			&& installation.state.target.kind === 'copilotConnector'
			&& (
				installation.state.target.name === recommendation.id
				|| installation.resource.displayName === recommendation.name
			)
		);
	}

	private createTip(recommendation: IConnectorRecommendation, isUpgrade = this.isUpgrade(recommendation)): IChatTip {
		const commandArgs = encodeURIComponent(JSON.stringify([{
			connectorName: recommendation.id,
			connectorDisplayName: recommendation.name,
			...(isUpgrade
				? { connectorId: recommendation.id, mcpServerNames: recommendation.mcpServerNames }
				: {
					section: AICustomizationManagementSection.McpServers,
					sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
				}),
		}]));
		const command = isUpgrade ? AICustomizationManagementCommands.UpgradeToConnector : AICustomizationManagementCommands.OpenMarketplace;
		const content = new MarkdownString('', {
			isTrusted: { enabledCommands: [command] },
		});
		content.appendMarkdown(localize('newSession.connectorRecommendations.tipPrefix', "**Tip:** "));
		if (isUpgrade) {
			content.appendText(localize('newSession.connectorRecommendations.upgradeDescription', "Get managed {0} authentication across Copilot surfaces. ", recommendation.name));
		}
		content.appendLink(
			`command:${command}?${commandArgs}`,
			isUpgrade
				? localize('newSession.connectorRecommendations.upgrade', "Upgrade to the {0} Connector.", recommendation.name)
				: recommendation.description
		);
		return {
			id: `${NewChatConnectorRecommendations._tipIdPrefix}${recommendation.id}`,
			content,
			enabledCommands: [command],
			icon: recommendation.icon,
		};
	}
}

function isConfigurationValueFromDefault(configurationService: IConfigurationService, setting: string): boolean {
	const inspected = configurationService.inspect<boolean>(setting);
	return inspected.applicationValue === undefined
		&& inspected.userValue === undefined
		&& inspected.userLocalValue === undefined
		&& inspected.userRemoteValue === undefined
		&& inspected.workspaceValue === undefined
		&& inspected.workspaceFolderValue === undefined
		&& inspected.memoryValue === undefined
		&& inspected.policyValue === undefined;
}
