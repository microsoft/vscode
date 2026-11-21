/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, IDimension } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableFromEvent } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IConfigurationOverrides, IConfigurationService, type IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ICopilotConnectorsService } from '../../../../chat/browser/aiCustomization/copilotConnectorsService.js';
import { AICustomizationManagementCommands } from '../../../../chat/common/aiCustomizationWorkspaceService.js';
import { IChatTipProvider, IChatTipService } from '../../../../chat/browser/chatTipService.js';
import { createCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService } from '../../../../chat/common/customizationMarketplaceInstallService.js';
import { IAgentPlugin, IAgentPluginMcpServerDefinition, IAgentPluginService } from '../../../../chat/common/plugins/agentPluginService.js';
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';
import { NewChatConnectorRecommendations } from '../../../browser/chat/newChatConnectorRecommendations.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../../../common/chatConstants.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';

const connectorRecommendations: NonNullable<IProductService['connectorRecommendations']> = {
	linear: { name: 'Linear', description: 'Triage your open issues in Linear', iconUrl: 'https://example.com/linear.png', urls: ['linear.app'] },
	notion: { name: 'Notion', description: 'Turn a Notion spec into an implementation plan', iconUrl: 'https://example.com/notion.png', urls: ['notion.so', 'notion.site'] },
	'workiq-mail': { name: 'WorkIQ', description: 'Find action items in your Outlook email', iconUrl: 'https://example.com/workiq.png', urls: ['outlook.office.com'] },
	slack: { name: 'Slack', description: 'Summarize a Slack channel', iconUrl: 'https://example.com/slack.png', urls: ['slack.com'], mcpServerNames: ['slack'] },
};

suite('NewChatConnectorRecommendations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: {
		readonly marketplaceEnabled?: boolean;
		readonly connectorsEnabled?: boolean;
		readonly recommendationsEnabled?: boolean;
		readonly fromDefault?: boolean;
		readonly productRecommendations?: IProductService['connectorRecommendations'];
		readonly installedMcpServerNames?: readonly string[];
		readonly installedPluginMcpServerNames?: readonly string[];
		readonly installedConnectors?: readonly { readonly name: string; readonly displayName: string }[];
		readonly connectorInventoryKnown?: boolean;
		readonly random?: () => number;
		readonly phone?: boolean;
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
				if (options.fromDefault === false) {
					return super.inspect(key, overrides);
				}
				const value = this.getValue<T>(key, overrides);
				return { value, defaultValue: value, overrideIdentifiers: [] };
			}
		}({
			[NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING]: options.recommendationsEnabled ?? true,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: options.marketplaceEnabled ?? true,
			[CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled]: options.connectorsEnabled ?? true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const onDidChangeInput = store.add(new Emitter<void>());
		const onDidChangeMcp = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		const onDidResetMcp = store.add(new Emitter<void>());
		const onDidChangeConnector = store.add(new Emitter<void>());
		const onDidChangeConnectorAccount = store.add(new Emitter<void>());
		let inputValue = '';
		let inputReadCount = 0;
		let connectorInventoryKnown = options.connectorInventoryKnown ?? true;
		let connectorInventoryLoadCount = 0;
		let provider: IChatTipProvider | undefined;
		const createInstalledMcpServer = (name: string) => new class extends mock<IWorkbenchMcpServer>() {
			override readonly id = name;
			override readonly name = name;
			override readonly installState = McpServerInstallState.Installed;
			override readonly local = new class extends mock<IWorkbenchLocalMcpServer>() { }();
		}();
		let installedMcpServers = (options.installedMcpServerNames ?? []).map(createInstalledMcpServer);
		const installedPluginMcpServerNames = options.installedPluginMcpServerNames ?? [];
		const installedPlugins = installedPluginMcpServerNames.length ? [new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/test');
			override readonly format = PluginFormat.Copilot;
			override readonly label = 'Test Plugin';
			override readonly mcpServerDefinitions = constObservable(installedPluginMcpServerNames.map(name => new class extends mock<IAgentPluginMcpServerDefinition>() {
				override readonly name = name;
			}()));
			override readonly remove = async () => true;
		}()] : [];
		let installedConnectors = options.installedConnectors ?? [];

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IProductService, {
			_serviceBrand: undefined,
			connectorRecommendations: options.productRecommendations ?? connectorRecommendations,
		});
		instantiationService.stub(IChatTipService, {
			registerTipProvider: candidate => {
				provider = candidate;
				return Disposable.None;
			},
		} as Partial<IChatTipService>);
		instantiationService.stub(ITelemetryService, telemetryService);
		const mainContainer = $('div');
		mainContainer.classList.toggle('phone-layout', options.phone ?? false);
		const layoutChanged = store.add(new Emitter<IDimension>());
		instantiationService.stub(IWorkbenchLayoutService, { mainContainer, onDidLayoutMainContainer: layoutChanged.event });
		instantiationService.stub(ICopilotConnectorsService, new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = onDidChangeConnector.event;
			override readonly onDidChangeAccount = onDidChangeConnectorAccount.event;
			override get connectionStateKnown() { return connectorInventoryKnown; }
			override get authorizationRequired() { return false; }
			override async getConnectors() {
				connectorInventoryLoadCount++;
				connectorInventoryKnown = true;
				onDidChangeConnector.fire();
				return [];
			}
		}());
		instantiationService.stub(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = onDidChangeMcp.event;
			override readonly onReset = onDidResetMcp.event;
			override get local(): readonly IWorkbenchMcpServer[] { return installedMcpServers; }
			override readonly whenInitialLocalMcpServersLoaded = Promise.resolve();
		}());
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable(installedPlugins);
		}());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = onDidChangeConnector.event;
			override readonly installations = observableFromEvent(this, this.onDidChange, () => createCustomizationMarketplaceInstallationSnapshot(
				installedConnectors.map(connector => ({
					resource: createConnectorResource(connector.name, connector.displayName),
					state: { kind: 'installed', target: { kind: 'copilotConnector', name: connector.name } },
				}))
			));
		}());
		const recommendations = store.add(instantiationService.createInstance(NewChatConnectorRecommendations, {
			getInputValue: () => {
				inputReadCount++;
				return inputValue;
			},
			onDidChangeInputValue: onDidChangeInput.event,
		}, options.random ?? (() => 0)));

		return {
			recommendations,
			provider: provider!,
			telemetryService,
			setPhoneLayout(phone: boolean) {
				mainContainer.classList.toggle('phone-layout', phone);
				layoutChanged.fire({ width: phone ? 390 : 1024, height: 844 });
			},
			setInput(value: string) {
				inputValue = value;
				onDidChangeInput.fire();
			},
			setInstalledMcpServerNames(names: readonly string[]) {
				installedMcpServers = names.map(createInstalledMcpServer);
				onDidResetMcp.fire();
			},
			setInstalledConnectors(connectors: readonly { readonly name: string; readonly displayName: string }[]) {
				installedConnectors = connectors;
				onDidChangeConnector.fire();
			},
			setConnectorInventoryKnown(known: boolean) {
				connectorInventoryKnown = known;
				onDidChangeConnector.fire();
			},
			fireConnectorAccountChange() {
				onDidChangeConnectorAccount.fire();
			},
			get inputReadCount() { return inputReadCount; },
			get connectorInventoryLoadCount() { return connectorInventoryLoadCount; },
		};
	}

	function createConnectorResource(name: string, displayName = name): ICustomizationMarketplaceResource {
		return {
			sourceId: 'test',
			identifier: name,
			displayName,
			description: '',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'copilotConnector', name },
		};
	}

	test('does not offer desktop marketplace links on phones and follows layout changes', () => {
		const fixture = setup({ phone: true });
		fixture.setInput('Open https://linear.app/example');
		const phone = { tip: fixture.provider.provideTip()?.id, reads: fixture.inputReadCount };
		fixture.setPhoneLayout(false);
		const desktop = fixture.provider.provideTip()?.id;
		fixture.setPhoneLayout(true);
		const phoneAgain = fixture.provider.provideTip()?.id;
		fixture.setPhoneLayout(false);
		assert.deepStrictEqual({ phone, desktop, phoneAgain, desktopAgain: fixture.provider.provideTip()?.id }, {
			phone: { tip: undefined, reads: 0 },
			desktop: 'connectorRecommendation.linear',
			phoneAgain: undefined,
			desktopAgain: 'connectorRecommendation.linear',
		});
	});

	test('registers as a contextual tip provider', () => {
		const fixture = setup();
		fixture.setInput('Open https://linear.app/acme/issue/ENG-1');

		assert.deepStrictEqual({
			sameProvider: fixture.provider === fixture.recommendations,
			tip: fixture.provider.provideTip(),
		}, {
			sameProvider: true,
			tip: {
				id: 'connectorRecommendation.linear',
				content: fixture.provider.provideTip()!.content,
				enabledCommands: ['aiCustomization.openMarketplace'],
				icon: URI.parse('https://example.com/linear.png'),
			},
		});

		assert.match(fixture.provider.provideTip()!.content.value, /\*\*Tip:\*\* \[Triage your open issues in Linear\]\(command:aiCustomization\.openMarketplace\?/);
		const commandArgs = /\?([^)]*)/.exec(fixture.provider.provideTip()!.content.value)?.[1];
		assert.deepStrictEqual(JSON.parse(decodeURIComponent(commandArgs!)), [{
			section: 'mcpServers',
			sourceId: 'copilotConnectors',
			connectorName: 'linear',
			connectorDisplayName: 'Linear',
		}]);
	});

	test('loads unknown connector inventory before recommending and suppresses installed connectors after load', async () => {
		const fixture = setup({
			connectorInventoryKnown: false,
			installedConnectors: [{ name: 'slack', displayName: 'Slack' }],
		});
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip(), undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			loadCount: fixture.connectorInventoryLoadCount,
			tip: fixture.provider.provideTip(),
		}, {
			loadCount: 1,
			tip: undefined,
		});
	});

	test('reloads connector inventory after an account change', async () => {
		const fixture = setup({ connectorInventoryKnown: false });
		fixture.setInput('https://slack.com/archives/C123');
		await Promise.resolve();
		fixture.setConnectorInventoryKnown(false);
		fixture.fireConnectorAccountChange();
		await Promise.resolve();

		assert.strictEqual(fixture.connectorInventoryLoadCount, 2);
	});

	test('recommends upgrading an installed equivalent MCP server', () => {
		const fixture = setup({ installedMcpServerNames: ['Slack'] });
		fixture.setInput('https://slack.com/archives/C123');

		const tip = fixture.provider.provideTip();
		assert.ok(tip);
		assert.match(tip.content.value, /\*\*Tip:\*\* Get&nbsp;managed&nbsp;Slack&nbsp;authentication&nbsp;across&nbsp;Copilot&nbsp;surfaces\.&nbsp;\[Upgrade to the Slack Connector\.\]\(command:aiCustomization\.upgradeToConnector\?/);
		const commandArgs = /\?([^)]*)/.exec(tip.content.value)?.[1];
		assert.deepStrictEqual({
			enabledCommands: tip.enabledCommands,
			commandArgs: JSON.parse(decodeURIComponent(commandArgs!)),
		}, {
			enabledCommands: [AICustomizationManagementCommands.UpgradeToConnector],
			commandArgs: [{
				connectorName: 'slack',
				connectorDisplayName: 'Slack',
				connectorId: 'slack',
				mcpServerNames: ['slack'],
			}],
		});
	});

	test('does not recommend a connector provided by an installed plugin', () => {
		const fixture = setup({ installedPluginMcpServerNames: ['Slack'] });
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip(), undefined);
	});

	test('plugin-provided MCP suppresses an otherwise eligible standalone upgrade', () => {
		const fixture = setup({
			installedMcpServerNames: ['slack'],
			installedPluginMcpServerNames: ['Slack'],
		});
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip(), undefined);
	});

	test('unrelated plugin MCP does not suppress a connector recommendation', () => {
		const fixture = setup({ installedPluginMcpServerNames: ['github'] });
		fixture.setInput('https://slack.com/archives/C123');

		assert.deepStrictEqual(fixture.provider.provideTip()?.enabledCommands, [AICustomizationManagementCommands.OpenMarketplace]);
	});

	test('recommends upgrading by connector display name without configured MCP aliases', () => {
		const fixture = setup({ installedMcpServerNames: ['workiq'] });
		fixture.setInput('https://outlook.office.com/mail');

		const tip = fixture.provider.provideTip();
		const commandArgs = /\?([^)]*)/.exec(tip!.content.value)?.[1];
		assert.deepStrictEqual({
			enabledCommands: tip?.enabledCommands,
			commandArgs: JSON.parse(decodeURIComponent(commandArgs!)),
		}, {
			enabledCommands: [AICustomizationManagementCommands.UpgradeToConnector],
			commandArgs: [{
				connectorName: 'workiq-mail',
				connectorDisplayName: 'WorkIQ',
				connectorId: 'workiq-mail',
				mcpServerNames: ['workiq-mail', 'WorkIQ'],
			}],
		});
	});

	test('does not upgrade for an unrelated MCP server without configured aliases', () => {
		const fixture = setup({ installedMcpServerNames: ['workiq-calendar'] });
		fixture.setInput('https://outlook.office.com/mail');

		assert.deepStrictEqual(fixture.provider.provideTip()?.enabledCommands, [AICustomizationManagementCommands.OpenMarketplace]);
	});

	test('refreshes the recommendation when the MCP inventory changes', () => {
		const fixture = setup();
		fixture.setInput('https://slack.com/archives/C123');
		assert.deepStrictEqual(fixture.provider.provideTip()?.enabledCommands, [AICustomizationManagementCommands.OpenMarketplace]);

		let changeCount = 0;
		const listener = fixture.provider.onDidChange(() => changeCount++);
		fixture.setInstalledMcpServerNames(['slack']);

		assert.deepStrictEqual({
			changeCount,
			enabledCommands: fixture.provider.provideTip()?.enabledCommands,
		}, {
			changeCount: 1,
			enabledCommands: [AICustomizationManagementCommands.UpgradeToConnector],
		});
		listener.dispose();
	});

	test('does not recommend an installed connector', () => {
		const fixture = setup({ installedConnectors: [{ name: 'slack', displayName: 'Slack' }] });
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip(), undefined);
	});

	test('does not recommend an installed connector whose display name matches the recommendation', () => {
		const fixture = setup({ installedConnectors: [{ name: 'slack-connector', displayName: 'Slack' }] });
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip(), undefined);
	});

	test('recommends when an installed connector has a different name and display name', () => {
		const fixture = setup({ installedConnectors: [{ name: 'different-connector', displayName: 'Different Connector' }] });
		fixture.setInput('https://slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip()?.id, 'connectorRecommendation.slack');
	});

	test('refreshes the recommendation when the connector inventory changes', () => {
		const fixture = setup({ installedConnectors: [{ name: 'slack', displayName: 'Slack' }] });
		fixture.setInput('https://slack.com/archives/C123');
		assert.strictEqual(fixture.provider.provideTip(), undefined);

		let changeCount = 0;
		const listener = fixture.provider.onDidChange(() => changeCount++);
		fixture.setInstalledConnectors([]);

		assert.deepStrictEqual({
			changeCount,
			tip: fixture.provider.provideTip()?.id,
		}, {
			changeCount: 1,
			tip: 'connectorRecommendation.slack',
		});
		listener.dispose();
	});

	test('excludes installed connectors while preserving other matching recommendations', () => {
		const fixture = setup({ installedConnectors: [{ name: 'slack', displayName: 'Slack' }], random: () => 0.99 });
		fixture.setInput('https://linear.app/acme and https://slack.com/archives/C123');

		assert.deepStrictEqual({
			hasMultipleTips: fixture.provider.hasMultipleTips?.(),
			tip: fixture.provider.provideTip()?.id,
		}, {
			hasMultipleTips: false,
			tip: 'connectorRecommendation.linear',
		});
	});

	test('triggers the recommendation experiment only for the default value', () => {
		assert.deepStrictEqual([
			setup().telemetryService.triggers,
			setup({ fromDefault: false }).telemetryService.triggers,
		], [
			['config.sessions.chat.experimental.connectorRecommendations'],
			[],
		]);
	});

	test('does not read the prompt when connector recommendations are disabled', () => {
		const fixtures = [
			setup({ recommendationsEnabled: false }),
			setup({ marketplaceEnabled: false }),
			setup({ connectorsEnabled: false }),
		];
		for (const fixture of fixtures) {
			fixture.setInput('https://linear.app/acme');
		}

		assert.deepStrictEqual(fixtures.map(fixture => ({
			inputReadCount: fixture.inputReadCount,
			tip: fixture.provider.provideTip(),
		})), [
			{ inputReadCount: 0, tip: undefined },
			{ inputReadCount: 0, tip: undefined },
			{ inputReadCount: 0, tip: undefined },
		]);
	});

	test('clears the contextual tip when the matching URL is removed', () => {
		const fixture = setup();
		fixture.setInput('See notion.so/acme');
		const withUrl = fixture.provider.provideTip()?.id;
		fixture.setInput('No connector URL');

		assert.deepStrictEqual({
			withUrl,
			withoutUrl: fixture.provider.provideTip(),
		}, {
			withUrl: 'connectorRecommendation.notion',
			withoutUrl: undefined,
		});
	});

	test('keeps a stable recommendation while the matching set is unchanged', () => {
		let randomValue = 0.99;
		const fixture = setup({ random: () => randomValue });
		fixture.setInput('https://linear.app/acme and notion.so/acme');
		const first = fixture.provider.provideTip()?.id;
		randomValue = 0;
		fixture.setInput('Updated https://linear.app/acme and notion.so/acme');

		assert.deepStrictEqual({
			first,
			afterEdit: fixture.provider.provideTip()?.id,
		}, {
			first: 'connectorRecommendation.notion',
			afterEdit: 'connectorRecommendation.notion',
		});
	});

	test('navigates all URL-matched connector tips', () => {
		const fixture = setup({ random: () => 0.99 });
		fixture.setInput('https://linear.app/acme, notion.so/acme, and acme.slack.com/archives/C123');

		const initial = fixture.provider.provideTip()?.id;
		const previous = fixture.provider.navigateTip?.(-1)?.id;
		const next = fixture.provider.navigateTip?.(1)?.id;

		assert.deepStrictEqual({
			hasMultipleTips: fixture.provider.hasMultipleTips?.(),
			initial,
			previous,
			next,
		}, {
			hasMultipleTips: true,
			initial: 'connectorRecommendation.slack',
			previous: 'connectorRecommendation.notion',
			next: 'connectorRecommendation.slack',
		});
	});

	test('dismisses a connector independently for the composer session', () => {
		const fixture = setup();
		fixture.setInput('https://linear.app/acme');
		fixture.provider.dismissTip?.('connectorRecommendation.linear');
		const dismissed = fixture.provider.provideTip();
		fixture.setInput('');
		fixture.setInput('https://linear.app/another');

		assert.deepStrictEqual({
			dismissed,
			afterReappearing: fixture.provider.provideTip(),
		}, {
			dismissed: undefined,
			afterReappearing: undefined,
		});
	});

	test('uses product-owned URL associations including subdomains', () => {
		const fixture = setup();
		fixture.setInput('Read https://acme.slack.com/archives/C123');

		assert.strictEqual(fixture.provider.provideTip()?.id, 'connectorRecommendation.slack');
	});

	test('does not recommend lookalike hosts or domains embedded in another URL path', () => {
		const fixture = setup();
		const inputs = [
			'https://slack.com.example.com/archives/C123',
			'https://example.com/redirect;notion.so/acme',
			'https://example.com/redirect/(linear.app)/acme',
		];
		const tips = inputs.map(input => {
			fixture.setInput(input);
			return fixture.provider.provideTip();
		});

		assert.deepStrictEqual(tips, [undefined, undefined, undefined]);
	});
});
