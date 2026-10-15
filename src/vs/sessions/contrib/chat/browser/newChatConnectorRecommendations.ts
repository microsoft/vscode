/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatConnectorRecommendations.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button, IButtonOptions } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
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
	readonly element: HTMLElement;
	readonly primary: Button;
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
	private readonly cards = new Map<string, IConnectorRecommendationCard>();
	private readonly dismissed = new Set<string>();

	constructor(
		private readonly focusInput: () => void,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
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
		this.element.setAttribute('aria-label', localize('newSession.connectorRecommendations.ariaLabel', "Recommended connectors"));
		const cards = dom.append(this.element, dom.$('.new-session-connector-recommendation-cards'));
		for (const [id, recommendation] of Object.entries(productService.connectorRecommendations ?? {})) {
			this.renderCard(cards, {
				id,
				name: recommendation.name,
				description: recommendation.description,
				icon: parseIconUri(recommendation.iconUrl),
			});
		}

		this.updateVisibility();
		this._register(this.themeService.onDidColorThemeChange(() => this.updateCardIcons()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled)
				|| event.affectsConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled)
				|| event.affectsConfiguration(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING)) {
				this.updateVisibility();
			}
		}));
	}

	private renderCard(container: HTMLElement, definition: IConnectorRecommendation): void {
		const ariaLabel = localize('newSession.connectorRecommendations.open', "Review the {0} connector. {1}", definition.name, definition.description);
		const card = dom.append(container, dom.$('.new-session-connector-recommendation-card'));
		card.dataset.connectorId = definition.id;
		const primary = this._register(new Button(card, { ...quietButtonStyles, ariaLabel }));
		primary.element.classList.add('new-session-connector-recommendation-card-primary');
		const icon = dom.append(primary.element, dom.$('.new-session-connector-recommendation-icon'));
		const content = dom.append(primary.element, dom.$('.new-session-connector-recommendation-content'));
		dom.append(content, dom.$('.new-session-connector-recommendation-name', undefined, definition.name));
		dom.append(content, dom.$('.new-session-connector-recommendation-description', undefined, definition.description));
		this._register(primary.onDidClick(() => this.openConnector(definition)));
		const dismiss = this._register(new Button(card, {
			...quietButtonStyles,
			ariaLabel: localize('newSession.connectorRecommendations.dismissOne', "Dismiss {0} Connector Recommendation for This Session", definition.name),
		}));
		dismiss.element.classList.add('new-session-connector-recommendation-dismiss');
		dismiss.icon = Codicon.close;
		this._register(dismiss.onDidClick(() => this.dismissCard(definition.id)));
		const iconDisposables = this._register(new DisposableStore());
		const recommendationCard = { definition, element: card, primary, icon, iconDisposables };
		this.cards.set(definition.id, recommendationCard);
		this.renderCardIcon(recommendationCard);
	}

	private dismissCard(id: string): void {
		const cards = [...this.cards.values()];
		const dismissedIndex = cards.findIndex(card => card.definition.id === id);
		this.dismissed.add(id);
		this.updateVisibility();
		const nextCard = cards.slice(dismissedIndex + 1).find(card => !this.dismissed.has(card.definition.id));
		const previousCard = cards.slice(0, dismissedIndex).reverse().find(card => !this.dismissed.has(card.definition.id));
		const focusTarget = nextCard ?? previousCard;
		if (focusTarget) {
			focusTarget.primary.focus();
		} else {
			this.focusInput();
		}
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
		for (const card of this.cards.values()) {
			card.element.hidden = this.dismissed.has(card.definition.id);
		}
		this.element.hidden = this.cards.size === 0
			|| this.dismissed.size === this.cards.size
			|| this.configurationService.getValue<boolean>(NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING) !== true
			|| this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.MarketplaceEnabled) !== true
			|| this.configurationService.getValue<boolean>(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled) !== true;
	}

	private updateCardIcons(): void {
		for (const card of this.cards.values()) {
			this.renderCardIcon(card);
		}
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
