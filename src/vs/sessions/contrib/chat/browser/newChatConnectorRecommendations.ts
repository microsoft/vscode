/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatConnectorRecommendations.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button, IButtonOptions } from '../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { mcpServerIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { renderCustomizationMarketplaceIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationPresentation.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../common/constants.js';

interface IConnectorRecommendation {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: URI | undefined;
}

interface IConnectorRecommendationCard {
	readonly definition: IConnectorRecommendation;
	readonly icon: HTMLElement;
	readonly iconDisposables: DisposableStore;
}

const quietButtonStyles: IButtonOptions = {
	...defaultButtonStyles,
	buttonBackground: undefined,
	buttonHoverBackground: undefined,
	buttonForeground: undefined,
	buttonBorder: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
	secondary: true,
};

export class NewChatConnectorRecommendations extends Disposable {

	readonly element = dom.$('.new-session-connector-recommendations');
	private readonly card: IConnectorRecommendationCard | undefined;
	private dismissed = false;

	constructor(
		private readonly focusInput: () => void,
		random: () => number = Math.random,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService productService: IProductService,
		@IThemeService private readonly themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._register(toDisposable(() => this.element.remove()));
		if (isConfigurationValueFromDefault(this.configurationService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
			logSettingExperimentTrigger(telemetryService, NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING);
		}

		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('newSession.connectorRecommendations.ariaLabel', "Recommended connector"));
		const cards = dom.append(this.element, dom.$('.new-session-connector-recommendation-cards'));
		const recommendations = Object.entries(productService.connectorRecommendations ?? {});
		if (recommendations.length > 0) {
			const [id, recommendation] = recommendations[Math.floor(random() * recommendations.length)];
			this.card = this.renderCard(cards, {
				id,
				name: recommendation.name,
				description: recommendation.description,
				icon: parseIconUri(recommendation.iconUrl),
			});
		}

		this.updateVisibility();
		this._register(this.themeService.onDidColorThemeChange(() => {
			if (this.card) {
				this.renderCardIcon(this.card);
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)
				|| event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)
				|| event.affectsConfiguration(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
				this.updateVisibility();
			}
		}));
	}

	private renderCard(container: HTMLElement, definition: IConnectorRecommendation): IConnectorRecommendationCard {
		const ariaLabel = localize('newSession.connectorRecommendations.open', "Review the {0} connector. {1}", definition.name, definition.description);
		const card = dom.append(container, dom.$('.new-session-connector-recommendation-card'));
		card.dataset.connectorId = definition.id;
		const primary = this._register(new Button(card, { ...quietButtonStyles, ariaLabel }));
		this._register(this.hoverService.setupDelayedHover(primary.element, {
			content: localize('newSession.connectorRecommendations.tooltip', "Review the {0} connector in Copilot Connectors", definition.name),
			persistence: { hideOnKeyDown: true },
		}));
		primary.element.classList.add('new-session-connector-recommendation-card-primary');
		const icon = dom.append(primary.element, dom.$('.new-session-connector-recommendation-icon'));
		icon.setAttribute('aria-hidden', 'true');
		dom.append(primary.element, dom.$('.new-session-connector-recommendation-description', undefined, definition.description));
		this._register(primary.onDidClick(() => this.openConnector(definition)));
		const actions = this._register(new ActionBar(dom.append(card, dom.$('.new-session-connector-recommendation-dismiss'))));
		actions.push(this._register(new Action(
			'newSession.connectorRecommendations.dismiss',
			localize('newSession.connectorRecommendations.dismissOne', "Dismiss {0} Connector Recommendation for This Session", definition.name),
			ThemeIcon.asClassName(Codicon.closeCompact),
			true,
			() => {
				this.dismissed = true;
				this.updateVisibility();
				this.focusInput();
			},
		)), { icon: true, label: false });
		const iconDisposables = this._register(new DisposableStore());
		const recommendationCard = { definition, icon, iconDisposables };
		this.renderCardIcon(recommendationCard);
		return recommendationCard;
	}

	private async openConnector(definition: IConnectorRecommendation): Promise<void> {
		try {
			await this.commandService.executeCommand(AICustomizationManagementCommands.OpenMarketplace, {
				section: AICustomizationManagementSection.McpServers,
				sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
				connectorName: definition.id,
			});
		} catch (error) {
			this.logService.error(`Failed to open the ${definition.name} Copilot connector`, error);
			this.notificationService.error(localize('newSession.connectorRecommendations.openError', "Unable to open the {0} connector.", definition.name));
		}
	}

	private updateVisibility(): void {
		this.element.hidden = !this.card
			|| this.dismissed
			|| this.configurationService.getValue<boolean>(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING) !== true
			|| this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) !== true
			|| this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true;
	}

	private renderCardIcon(card: IConnectorRecommendationCard): void {
		card.iconDisposables.clear();
		renderCustomizationMarketplaceIcon(
			card.icon,
			mcpServerIcon,
			card.definition.icon,
			this.themeService.getColorTheme().type,
			card.iconDisposables,
		);
	}
}

function parseIconUri(iconUrl: string): URI | undefined {
	try {
		const icon = URI.parse(iconUrl);
		return icon.scheme === 'https' || icon.scheme === 'data' ? icon : undefined;
	} catch {
		return undefined;
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
