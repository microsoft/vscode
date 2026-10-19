/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { type IConfigurationChangeEvent, type IConfigurationOverrides, IConfigurationService, type IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { mcpServerIcon } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { NewChatConnectorRecommendations } from '../../browser/newChatConnectorRecommendations.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../../common/constants.js';

const connectorRecommendations: NonNullable<IProductService['connectorRecommendations']> = {
	linear: { name: 'Linear', description: 'Plan and track product work.', iconUrl: 'https://example.com/linear.png' },
	notion: { name: 'Notion', description: 'Search team knowledge and documentation.', iconUrl: 'https://example.com/notion.png' },
	'workiq-mail': { name: 'WorkIQ', description: 'Bring Microsoft 365 work context into chats.', iconUrl: 'https://example.com/workiq.png' },
};

suite('NewChatConnectorRecommendations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(marketplaceEnabled: boolean, connectorsEnabled: boolean, fromDefault = true, productRecommendations: IProductService['connectorRecommendations'] | null = connectorRecommendations, recommendationsEnabled = connectorsEnabled) {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
				if (!fromDefault) {
					return super.inspect(key, overrides);
				}
				const value = this.getValue<T>(key, overrides);
				return { value, defaultValue: value, overrideIdentifiers: [] };
			}
		}({
			[NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING]: recommendationsEnabled,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: marketplaceEnabled,
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: connectorsEnabled,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const errors: unknown[][] = [];
		const notifications: string[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		let focusCount = 0;
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string, ...args: unknown[]) => {
				commands.push({ id, args });
			},
		});
		instantiationService.stub(ILogService, {
			error: (...args: unknown[]) => errors.push(args),
			warn: (...args: unknown[]) => errors.push(args),
		});
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: string) { notifications.push(message); return undefined; }
		}());
		instantiationService.stub(IProductService, { _serviceBrand: undefined, connectorRecommendations: productRecommendations ?? undefined });
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ITelemetryService, telemetryService);
		const recommendations = store.add(instantiationService.createInstance(NewChatConnectorRecommendations, () => focusCount++));
		document.body.appendChild(recommendations.element);
		return { recommendations, configurationService, commands, errors, notifications, telemetryService, get focusCount() { return focusCount; } };
	}

	test('triggers the recommendation experiment before deciding visibility', () => {
		const triggers = [
			setup(false, false).telemetryService.triggers,
			setup(true, true).telemetryService.triggers,
			setup(true, true, false).telemetryService.triggers,
		];

		assert.deepStrictEqual(triggers, [
			['config.sessions.chat.experimental.connectorRecommendations'],
			['config.sessions.chat.experimental.connectorRecommendations'],
			[],
		]);
	});

	test('requires the dedicated recommendation setting in addition to connector capability', () => {
		const fixture = setup(true, true, true, connectorRecommendations, false);

		assert.deepStrictEqual({
			hidden: fixture.recommendations.element.hidden,
			triggers: fixture.telemetryService.triggers,
		}, {
			hidden: true,
			triggers: ['config.sessions.chat.experimental.connectorRecommendations'],
		});
	});

	test('renders product recommendations and opens the selected connector detail', async () => {
		const fixture = setup(true, true);
		await Promise.resolve();
		await Promise.resolve();
		const cards = [...fixture.recommendations.element.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-card')];
		cards[2].querySelector<HTMLElement>('.new-session-connector-recommendation-card-primary')!.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			hidden: fixture.recommendations.element.hidden,
			role: fixture.recommendations.element.getAttribute('role'),
			names: cards.map(card => card.querySelector('.new-session-connector-recommendation-name')?.textContent),
			descriptions: cards.map(card => card.querySelector('.new-session-connector-recommendation-description')?.textContent),
			icons: cards.map(card => card.querySelector<HTMLImageElement>('img')?.src),
			commands: fixture.commands,
			errors: fixture.errors,
			triggers: fixture.telemetryService.triggers,
		}, {
			hidden: false,
			role: 'group',
			names: ['Linear', 'Notion', 'WorkIQ'],
			descriptions: [
				'Plan and track product work.',
				'Search team knowledge and documentation.',
				'Bring Microsoft 365 work context into chats.',
			],
			icons: ['https://example.com/linear.png', 'https://example.com/notion.png', 'https://example.com/workiq.png'],
			commands: [{
				id: AICustomizationManagementCommands.OpenMarketplace,
				args: [{
					section: AICustomizationManagementSection.McpServers,
					sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
					connectorName: 'workiq-mail',
				}],
			}],
			errors: [],
			triggers: ['config.sessions.chat.experimental.connectorRecommendations'],
		});
	});

	test('tracks enablement and dismisses individual cards for the widget lifetime', async () => {
		const fixture = setup(true, false, true, connectorRecommendations, true);
		assert.strictEqual(fixture.recommendations.element.hidden, true);

		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled;
			}
		}());
		assert.strictEqual(fixture.recommendations.element.hidden, false);

		const cards = [...fixture.recommendations.element.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-card')];
		const dismissButtons = cards.map(card => card.querySelector<HTMLElement>('.new-session-connector-recommendation-dismiss')!);
		dismissButtons[1].click();
		const focusAfterMiddleDismiss = document.activeElement === cards[2].querySelector('.new-session-connector-recommendation-card-primary');
		dismissButtons[2].click();
		const focusAfterLastDismiss = document.activeElement === cards[0].querySelector('.new-session-connector-recommendation-card-primary');
		dismissButtons[0].click();
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === CustomizationMarketplaceConfiguration.MarketplaceEnabled;
			}
		}());

		assert.deepStrictEqual({
			hidden: fixture.recommendations.element.hidden,
			dismissedCards: cards.map(card => card.hidden),
			focusAfterMiddleDismiss,
			focusAfterLastDismiss,
			focusCount: fixture.focusCount,
		}, {
			hidden: true,
			dismissedCards: [true, true, true],
			focusAfterMiddleDismiss: true,
			focusAfterLastDismiss: true,
			focusCount: 1,
		});
	});

	test('uses the MCP server icon when a product image URL is invalid', () => {
		const fixture = setup(true, true, true, {
			linear: { name: 'Linear', description: 'Plan and track product work.', iconUrl: 'data:image/png;base64,invalid' },
			notion: { name: 'Notion', description: 'Search team knowledge and documentation.', iconUrl: '' },
			'workiq-mail': { name: 'WorkIQ', description: 'Bring Microsoft 365 work context into chats.', iconUrl: 'file:///tmp/workiq.png' },
		});
		const fallbackClasses = [...fixture.recommendations.element.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-icon > .codicon')]
			.map(icon => [...icon.classList]);

		assert.deepStrictEqual(fallbackClasses, [
			['codicon', 'codicon-ai-customization-mcp-server'],
			['codicon', 'codicon-ai-customization-mcp-server'],
			['codicon', 'codicon-ai-customization-mcp-server'],
		]);
		assert.strictEqual(mcpServerIcon.id, 'ai-customization-mcp-server');
	});

	test('hides the surface when the product has no recommendations', () => {
		const fixture = setup(true, true, true, null);

		assert.deepStrictEqual({
			hidden: fixture.recommendations.element.hidden,
			cardCount: fixture.recommendations.element.querySelectorAll('.new-session-connector-recommendation-card').length,
		}, {
			hidden: true,
			cardCount: 0,
		});
	});
});
