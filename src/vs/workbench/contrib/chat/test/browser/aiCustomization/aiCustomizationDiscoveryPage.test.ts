/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpWorkbenchService } from '../../../../mcp/common/mcpTypes.js';
import { AICustomizationDiscoveryPage } from '../../../browser/aiCustomization/aiCustomizationDiscoveryPage.js';
import { IAICustomizationListItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AICustomizationDiscoveryPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function resource(identifier: string, overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
		return {
			identifier, displayName: identifier, sourceId: 'agentFinder', description: '', mediaType: CustomizationMarketplaceMediaType.McpServer,
			tags: [], capabilities: [], representativeQueries: [], ...overrides,
		};
	}

	function createPage(enabledSourceIds: readonly string[] = ['agentFinder']) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.customization-discovery-test'));
		container.style.width = '900px';
		container.style.height = '600px';
		store.add(toDisposable(() => container.remove()));
		const configuration = new TestConfigurationService(Object.fromEntries(Object.values(CustomizationMarketplaceSources).map(source => [
			source.enablementSetting, enabledSourceIds.includes(source.id),
		])));
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const requests: { options: ICustomizationMarketplaceQuery; token: CancellationToken; result: DeferredPromise<ICustomizationMarketplacePage> }[] = [];
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = Object.values(CustomizationMarketplaceSources);
			override query(options: ICustomizationMarketplaceQuery, token: CancellationToken) {
				const result = new DeferredPromise<ICustomizationMarketplacePage>();
				requests.push({ options, token, result });
				return result.p;
			}
		}());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override getInstallState() { return { kind: 'available' as const }; }
		}());
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
			override readonly onDidChangeSentiment = sentimentChanged.event;
		}();
		instantiationService.stub(IChatEntitlementService, entitlement);
		const installed: readonly IAICustomizationListItem[] = [{
			id: 'local-skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md'), name: 'Local mail skill',
			filename: 'SKILL.md', description: 'Installed locally', source: 'local', promptType: PromptsType.skill, disabled: false,
		}];
		instantiationService.stub(IAICustomizationItemsModel, new class extends mock<IAICustomizationItemsModel>() {
			override getItems(section: ItemsModelSection) {
				return constObservable(section === AICustomizationManagementSection.Skills ? installed : []);
			}
		}());
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable([]);
		}());
		instantiationService.stub(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = Event.None;
			override readonly onReset = Event.None;
			override readonly local = [];
			override readonly whenInitialLocalMcpServersLoaded = Promise.resolve();
		}());
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() { }());
		const page = store.add(instantiationService.createInstance(AICustomizationDiscoveryPage, container, undefined, {
			selectSection() { }, selectSectionWithMarketplace() { }, closeEditor() { }, reviewMigrations() { }, prefillChat() { },
		}, 'Copilot'));
		page.rebuildCards(new Set([AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers]));
		page.layout(new DOM.Dimension(900, 600));
		return { page, container, configuration, requests, entitlement, sentimentChanged };
	}

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
		await timeout(0);
	}

	function loadMore(container: HTMLElement): void {
		const button = container.querySelector<HTMLElement>('.customization-discovery-footer .monaco-button');
		assert.ok(button);
		button.click();
	}

	for (const sourceIds of [[], ['agentFinder'], ['copilotConnectors'], ['agentFinder', 'copilotConnectors']]) {
		test(`source gates preserve installed Discover: ${sourceIds.join(', ') || 'none'}`, async () => {
			const fixture = createPage(sourceIds);
			fixture.page.setVisible(true);
			if (sourceIds.length) {
				await fixture.requests[0].result.complete({ items: [] });
			}
			fixture.page.setSearchQuery('@installed mail');
			await timeout(0);
			assert.deepStrictEqual({
				catalogRequests: fixture.requests.map(request => request.options),
				installedVisible: fixture.page.getAccessibilityContent().includes('Local mail skill'),
				searchVisible: fixture.container.querySelector('.customization-discovery-search') !== null,
			}, {
				catalogRequests: sourceIds.length ? [{ query: undefined, mediaType: undefined, pageSize: 24, cursor: undefined }] : [],
				installedVisible: true,
				searchVisible: true,
			});
		});
	}

	test('multi-type filters share a single ranked page and opaque continuation rather than merging or sorting in the widget', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setSearchQuery('@type:mcp @type:plugin mail');
		fixture.page.setVisible(true);
		const types = [CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.Skill];
		const items = Array.from({ length: 24 }, (_, index) => resource(`mail-${index}`, {
			mediaType: types[index % types.length], score: 100 - index,
		}));
		const cursor = { token: 'opaque+/=&continuation' };
		await fixture.requests[0].result.complete({ items, nextCursor: cursor });
		await timeout(0);
		loadMore(fixture.container);
		await fixture.requests[1].result.complete({ items: [
			resource('mail-24', { mediaType: CustomizationMarketplaceMediaType.ClaudePlugin, score: 70 }),
			resource('mail-25', { sourceId: 'copilotConnectors', score: 60 }),
		] });
		await timeout(0);
		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			visibleOrder: fixture.page.getAccessibilityContent().match(/^mail-\d+/gm),
			moreHidden: fixture.container.querySelector<HTMLElement>('.customization-discovery-footer')?.hidden,
		}, {
			requests: [
				{ query: 'mail', mediaType: undefined, pageSize: 24, cursor: undefined },
				{ query: 'mail', mediaType: undefined, pageSize: 24, cursor },
			],
			visibleOrder: [...items.filter(item => item.mediaType !== CustomizationMarketplaceMediaType.Skill).map(item => item.identifier), 'mail-24', 'mail-25'],
			moreHidden: true,
		});
	});

	test('single-type filters use the native type selector with the global page size', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		assert.deepStrictEqual(fixture.requests.map(request => request.options), [
			{ query: 'mail', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 24, cursor: undefined },
		]);
	});

	test('effective source toggles cancel and clear available results without clearing the installed search', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await setEnabled(fixture.configuration, ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, true);
		await setEnabled(fixture.configuration, ChatConfiguration.AgentFinderPublicFeedEnabled, false);
		await fixture.requests[2].result.complete({ items: [resource('current mail', { sourceId: 'copilotConnectors' })] });
		await fixture.requests[0].result.complete({ items: [resource('stale mail')] });
		await fixture.requests[1].result.complete({ items: [resource('also stale mail')] });
		await timeout(0);
		const beforeDisable = {
			cancelled: fixture.requests.slice(0, 2).map(request => request.token.isCancellationRequested),
			hasCurrent: fixture.page.getAccessibilityContent().includes('current mail'),
			hasStale: fixture.page.getAccessibilityContent().includes('stale mail'),
		};
		await setEnabled(fixture.configuration, ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, false);
		const disabled = {
			hasAvailable: fixture.page.getAccessibilityContent().includes('current mail'),
			hasInstalled: fixture.page.getAccessibilityContent().includes('Local mail skill'),
			requests: fixture.requests.length,
		};
		await setEnabled(fixture.configuration, ChatConfiguration.AgentFinderPublicFeedEnabled, true);
		await fixture.requests[3].result.complete({ items: [] });
		assert.deepStrictEqual({
			beforeDisable, disabled, searches: fixture.requests.map(request => [request.options.query, request.options.cursor]),
		}, {
			beforeDisable: { cancelled: [true, true], hasCurrent: true, hasStale: false },
			disabled: { hasAvailable: false, hasInstalled: true, requests: 3 },
			searches: [['mail', undefined], ['mail', undefined], ['mail', undefined], ['mail', undefined]],
		});
	});

	test('unchanged source settings and entitlement notifications preserve the request', async () => {
		const fixture = createPage();
		fixture.page.setVisible(true);
		await setEnabled(fixture.configuration, ChatConfiguration.AgentFinderPublicFeedEnabled, true);
		await setEnabled(fixture.configuration, ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, false);
		fixture.sentimentChanged.fire();
		const cancelled = fixture.requests[0].token.isCancellationRequested;
		await fixture.requests[0].result.complete({ items: [] });
		assert.deepStrictEqual({ count: fixture.requests.length, cancelled }, { count: 1, cancelled: false });
	});

	test('failed continuation preserves loaded results and retries the same opaque cursor', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'retryable' };
		await fixture.requests[0].result.complete({ items: [resource('mail-first')], nextCursor: cursor });
		await timeout(0);
		loadMore(fixture.container);
		await fixture.requests[1].result.error(new Error('Connection interrupted'));
		await timeout(0);
		const afterFailure = {
			hasFirst: fixture.page.getAccessibilityContent().includes('mail-first'),
			hasError: fixture.page.getAccessibilityContent().includes('Connection interrupted'),
		};
		loadMore(fixture.container);
		await fixture.requests[2].result.complete({ items: [resource('mail-second')] });
		await timeout(0);
		assert.deepStrictEqual({
			afterFailure,
			cursors: fixture.requests.map(request => request.options.cursor),
			finalOrder: fixture.page.getAccessibilityContent().match(/^mail-\w+/gm),
		}, {
			afterFailure: { hasFirst: true, hasError: true },
			cursors: [undefined, cursor, cursor],
			finalOrder: ['mail-first', 'mail-second'],
		});
	});
});
