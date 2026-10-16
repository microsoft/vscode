/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { type IConfigurationChangeEvent, type IConfigurationOverrides, IConfigurationService, type IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
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

	function setup(marketplaceEnabled: boolean, connectorsEnabled: boolean, fromDefault = true, productRecommendations: IProductService['connectorRecommendations'] | null = connectorRecommendations, recommendationsEnabled = connectorsEnabled, random = () => 0) {
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
		const hovers: Omit<IHoverOptions, 'target'>[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		let focusCount = 0;
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, {
			setupDelayedHover: (_target: HTMLElement, options: Parameters<IHoverService['setupDelayedHover']>[1]) => {
				hovers.push(typeof options === 'function' ? options() : options);
				return Disposable.None;
			},
		});
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
		const recommendations = store.add(instantiationService.createInstance(NewChatConnectorRecommendations, () => focusCount++, random));
		document.body.appendChild(recommendations.element);
		return { recommendations, configurationService, commands, errors, notifications, hovers, telemetryService, get focusCount() { return focusCount; } };
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

	test('uses product descriptions without overriding known connectors and opens the selected detail', async () => {
		const fixtures = [0, 0.5, 0.999].map(value => setup(true, true, true, connectorRecommendations, true, () => value));
		for (const fixture of fixtures) {
			fixture.recommendations.element.querySelector<HTMLElement>('.new-session-connector-recommendation-card-primary')!.click();
		}
		await Promise.resolve();

		assert.deepStrictEqual(fixtures.map(fixture => ({
			hidden: fixture.recommendations.element.hidden,
			role: fixture.recommendations.element.getAttribute('role'),
			groupLabel: fixture.recommendations.element.getAttribute('aria-label'),
			cardCount: fixture.recommendations.element.querySelectorAll('.new-session-connector-recommendation-card').length,
			nameCount: fixture.recommendations.element.querySelectorAll('.new-session-connector-recommendation-name').length,
			description: fixture.recommendations.element.querySelector('.new-session-connector-recommendation-description')?.textContent,
			label: fixture.recommendations.element.querySelector('.new-session-connector-recommendation-card-primary')?.getAttribute('aria-label'),
			buttonRole: fixture.recommendations.element.querySelector('.new-session-connector-recommendation-card-primary')?.getAttribute('role'),
			iconHidden: fixture.recommendations.element.querySelector('.new-session-connector-recommendation-icon')?.getAttribute('aria-hidden'),
			dismissLabel: fixture.recommendations.element.querySelector('.new-session-connector-recommendation-dismiss .action-label')?.getAttribute('aria-label'),
			hovers: fixture.hovers,
			compactDismissCount: fixture.recommendations.element.querySelectorAll('.codicon-close-compact').length,
			icon: fixture.recommendations.element.querySelector<HTMLImageElement>('img')?.src,
			commands: fixture.commands,
			errors: fixture.errors,
		})), [
			{ id: 'linear', name: 'Linear', task: 'Plan and track product work.', icon: 'linear' },
			{ id: 'notion', name: 'Notion', task: 'Search team knowledge and documentation.', icon: 'notion' },
			{ id: 'workiq-mail', name: 'WorkIQ', task: 'Bring Microsoft 365 work context into chats.', icon: 'workiq' },
		].map(({ id, name, task, icon }) => ({
			hidden: false,
			role: 'group',
			groupLabel: 'Recommended connector',
			cardCount: 1,
			nameCount: 0,
			description: task,
			label: `Review the ${name} connector. ${task}`,
			buttonRole: 'button',
			iconHidden: 'true',
			dismissLabel: `Dismiss ${name} Connector Recommendation for This Session`,
			hovers: [{
				content: `Review the ${name} connector in Copilot Connectors`,
				persistence: { hideOnKeyDown: true },
			}],
			compactDismissCount: 1,
			icon: `https://example.com/${icon}.png`,
			commands: [{
				id: AICustomizationManagementCommands.OpenMarketplace,
				args: [{
					section: AICustomizationManagementSection.McpServers,
					sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
					connectorName: id,
				}],
			}],
			errors: [],
		})));
	});

	test('keeps the random choice stable and hides recommendations for the widget lifetime after dismissal', async () => {
		let randomCalls = 0;
		const fixture = setup(true, false, true, connectorRecommendations, true, () => {
			randomCalls++;
			return 0.5;
		});
		assert.strictEqual(fixture.recommendations.element.hidden, true);

		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled;
			}
		}());
		assert.strictEqual(fixture.recommendations.element.hidden, false);

		fixture.recommendations.element.querySelector<HTMLElement>('.new-session-connector-recommendation-dismiss .action-label')!.click();
		const hiddenImmediately = fixture.recommendations.element.hidden;
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, false);
		await fixture.configurationService.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		fixture.configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === CustomizationMarketplaceConfiguration.MarketplaceEnabled;
			}
		}());

		assert.deepStrictEqual({
			hidden: fixture.recommendations.element.hidden,
			hiddenImmediately,
			randomCalls,
			renderedConnectors: [...fixture.recommendations.element.querySelectorAll<HTMLElement>('.new-session-connector-recommendation-card')].map(card => card.dataset.connectorId),
			focusCount: fixture.focusCount,
		}, {
			hidden: true,
			hiddenImmediately: true,
			randomCalls: 1,
			renderedConnectors: ['notion'],
			focusCount: 1,
		});
	});

	test('preserves the product description for other recommended connectors', () => {
		const fixture = setup(true, true, true, {
			custom: { name: 'Custom', description: 'Find related customer feedback', iconUrl: '' },
		});
		const card = fixture.recommendations.element.querySelector<HTMLElement>('.new-session-connector-recommendation-card')!;

		assert.deepStrictEqual({
			hidden: card.hidden,
			description: card.querySelector('.new-session-connector-recommendation-description')?.textContent,
			label: card.querySelector('.new-session-connector-recommendation-card-primary')?.getAttribute('aria-label'),
		}, {
			hidden: false,
			description: 'Find related customer feedback',
			label: 'Review the Custom connector. Find related customer feedback',
		});
	});

	test('uses the MCP server icon when a product image URL is invalid', () => {
		const fallbackClasses = ['data:image/png;base64,invalid', '', 'file:///tmp/workiq.png'].map(iconUrl => {
			const fixture = setup(true, true, true, {
				linear: { ...connectorRecommendations.linear, iconUrl },
			});
			return [...fixture.recommendations.element.querySelector<HTMLElement>('.new-session-connector-recommendation-icon > .codicon')!.classList];
		});

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
