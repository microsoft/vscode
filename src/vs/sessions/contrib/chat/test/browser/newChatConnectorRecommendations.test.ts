/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { type IConfigurationOverrides, IConfigurationService, type IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IChatTipProvider, IChatTipService } from '../../../../../workbench/contrib/chat/browser/chatTipService.js';
import { NewChatConnectorRecommendations } from '../../browser/newChatConnectorRecommendations.js';
import { NEW_SESSION_CONNECTOR_RECOMMENDATIONS_SETTING } from '../../common/constants.js';

const connectorRecommendations: NonNullable<IProductService['connectorRecommendations']> = {
	linear: { name: 'Linear', description: 'Triage your open issues in Linear', iconUrl: 'https://example.com/linear.png', urls: ['linear.app'] },
	notion: { name: 'Notion', description: 'Turn a Notion spec into an implementation plan', iconUrl: 'https://example.com/notion.png', urls: ['notion.so', 'notion.site'] },
	slack: { name: 'Slack', description: 'Summarize a Slack channel', iconUrl: 'https://example.com/slack.png', urls: ['slack.com'] },
};

suite('NewChatConnectorRecommendations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: {
		readonly marketplaceEnabled?: boolean;
		readonly connectorsEnabled?: boolean;
		readonly recommendationsEnabled?: boolean;
		readonly fromDefault?: boolean;
		readonly productRecommendations?: IProductService['connectorRecommendations'];
		readonly random?: () => number;
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
		let inputValue = '';
		let inputReadCount = 0;
		let provider: IChatTipProvider | undefined;

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
			setInput(value: string) {
				inputValue = value;
				onDidChangeInput.fire();
			},
			get inputReadCount() { return inputReadCount; },
		};
	}

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
