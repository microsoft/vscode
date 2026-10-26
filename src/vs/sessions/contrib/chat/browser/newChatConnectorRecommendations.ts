/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IChatTip, IChatTipProvider, IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { findMatchingConnectorRecommendationIds } from '../../../../workbench/contrib/chat/common/connectorRecommendations.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../common/constants.js';

interface IConnectorRecommendation {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: URI;
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
	) {
		super();
		if (isConfigurationValueFromDefault(this.configurationService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
			logSettingExperimentTrigger(telemetryService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING);
		}

		for (const [id, recommendation] of Object.entries(productService.connectorRecommendations ?? {})) {
			this._recommendations.set(id, { id, name: recommendation.name, description: recommendation.description, icon: URI.parse(recommendation.iconUrl) });
			this._recommendationUrls.set(id, recommendation.urls ?? []);
		}

		this._register(chatTipService.registerTipProvider(this));
		this._register(this.options.onDidChangeInputValue(() => this.update()));
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
		const enabled = this._recommendations.size > 0
			&& this.configurationService.getValue<boolean>(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING) === true
			&& this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) === true
			&& this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) === true;
		const matching = enabled
			? findMatchingConnectorRecommendationIds(this.options.getInputValue(), this._recommendationUrls)
			: new Set<string>();
		const recommendationId = this.getRecommendationId(matching);
		const tip = recommendationId ? this.createTip(this._recommendations.get(recommendationId)!) : undefined;
		const tipStateKey = `${tip?.id ?? ''}\0${this._availableRecommendationIds.join('\0')}`;
		if (tipStateKey === this._tipStateKey) {
			return;
		}
		this._tipStateKey = tipStateKey;
		this._tip = tip;
		this._onDidChange.fire();
	}

	private getRecommendationId(matching: ReadonlySet<string>): string | undefined {
		const available = [...this._recommendations.keys()].filter(id => matching.has(id) && !this._dismissed.has(id));
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

	private createTip(recommendation: IConnectorRecommendation): IChatTip {
		const commandArgs = encodeURIComponent(JSON.stringify([{
			section: AICustomizationManagementSection.McpServers,
			sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
			connectorName: recommendation.id,
			connectorDisplayName: recommendation.name,
		}]));
		const content = new MarkdownString('', {
			isTrusted: { enabledCommands: [AICustomizationManagementCommands.OpenMarketplace] },
		});
		content.appendMarkdown(localize('newSession.connectorRecommendations.tipPrefix', "**Tip:** "));
		content.appendLink(`command:${AICustomizationManagementCommands.OpenMarketplace}?${commandArgs}`, recommendation.description);
		return {
			id: `${NewChatConnectorRecommendations._tipIdPrefix}${recommendation.id}`,
			content,
			enabledCommands: [AICustomizationManagementCommands.OpenMarketplace],
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
