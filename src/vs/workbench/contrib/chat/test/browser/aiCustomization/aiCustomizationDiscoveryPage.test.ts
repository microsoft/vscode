/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IListService, ListService, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpWorkbenchService } from '../../../../mcp/common/mcpTypes.js';
import { AICustomizationDiscoveryPage } from '../../../browser/aiCustomization/aiCustomizationDiscoveryPage.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AICustomizationDiscoveryPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const secondSource = { id: 'other', displayName: 'Other Feed', enablementSetting: 'test.marketplace.other.enabled' };
	const sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed, secondSource, CustomizationMarketplaceSources.PluginMarketplaces];

	function resource(identifier: string, overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
		return {
			identifier, displayName: identifier, sourceId: 'agentFinder', description: '',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			tags: [], capabilities: [], representativeQueries: [], ...overrides,
		};
	}

	function createPage(enabledSources: readonly string[] = ['agentFinder', 'other'], installedPlugins: readonly IAgentPlugin[] = []) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.customization-discovery-test'));
		container.style.width = '900px';
		container.style.height = '600px';
		store.add(toDisposable(() => container.remove()));
		const configuration = new TestConfigurationService({
			'workbench.list.smoothScrolling': false,
			...Object.fromEntries(sources.map(source => [source.enablementSetting, enabledSources.includes(source.id)])),
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const listService = store.add(new ListService());
		instantiationService.stub(IListService, listService);
		let sourceMenu: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;
		store.add(toDisposable(() => sourceMenu?.onHide?.(false)));
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
				sourceMenu?.onHide?.(false);
				sourceMenu = delegate;
			}
		}());
		const requests: { options: ICustomizationMarketplaceQuery; token: CancellationToken; result: DeferredPromise<ICustomizationMarketplacePage> }[] = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = sources;
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
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
			override readonly onDidChangeSentiment = Event.None;
		}();
		instantiationService.stub(IChatEntitlementService, entitlement);
		const installed: readonly IAICustomizationListItem[] = [{
			id: 'local-skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md'), name: 'Local mail skill',
			filename: 'SKILL.md', description: 'Installed locally', source: 'local', promptType: PromptsType.skill, disabled: false,
		}];
		instantiationService.stub(IAICustomizationItemsModel, new class extends mock<IAICustomizationItemsModel>() {
			override getActiveItemSource(): IAICustomizationItemSource {
				return new class extends mock<IAICustomizationItemSource>() {
					override async fetchProviderItems() { return []; }
				}();
			}
			override getItems(section: ItemsModelSection) {
				return constObservable(section === AICustomizationManagementSection.Skills ? installed : []);
			}
		}());
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable(installedPlugins);
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
		return {
			page, container, configuration, requests, listService,
			selectSource: async (id: string) => {
				const button = container.querySelector<HTMLElement>('.customization-discovery-source .monaco-button');
				assert.ok(button);
				button.click();
				const action = sourceMenu?.getActions?.().find(action => action.id === `customizationDiscovery.source.${id}`);
				assert.ok(action);
				await action.run();
				sourceMenu?.onHide?.(false);
				sourceMenu = undefined;
			},
		};
	}

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
		await timeout(0);
	}

	test('one global continuation preserves ranked multi-type results and source selection', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp @type:plugin mail');
		fixture.page.setVisible(true);
		const types = [CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.Skill];
		const items = Array.from({ length: 24 }, (_, index) => resource(`mail-${index}`, { mediaType: types[index % types.length], score: 100 - index }));
		const cursor = { token: 'opaque+/=&continuation' };
		await fixture.requests[0].result.complete({ items, nextCursor: cursor });
		const listElement = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .monaco-list');
		assert.ok(listElement);
		listElement.focus();
		listElement.dispatchEvent(new FocusEvent('focus'));
		const list = fixture.listService.lastFocusedList;
		assert.ok(list instanceof WorkbenchList);
		list.scrollTop = 0;
		list.scrollTop = list.scrollHeight;
		await fixture.requests[1].result.complete({ items: [resource('mail-24', { sourceId: 'other', mediaType: CustomizationMarketplaceMediaType.ClaudePlugin })] });
		await timeout(0);
		await fixture.selectSource('other');
		await fixture.requests[2].result.complete({ items: [resource('other-mail', { sourceId: 'other' })] });
		await timeout(0);
		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			visible: fixture.page.getAccessibilityContent().match(/^(?:mail-\d+|other-mail)$/gm),
			selected: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
		}, {
			requests: [
				{ query: 'mail', mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor: undefined },
				{ query: 'mail', mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor },
				{ query: 'mail', mediaType: undefined, sourceIds: ['other'], pageSize: 24, cursor: undefined },
			],
			visible: ['other-mail'],
			selected: 'Other Feed',
		});
	});

	test('changing source enablement clears available pages but keeps installed search', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('public-mail')] });
		await setEnabled(fixture.configuration, CustomizationMarketplaceSources.AgentFinderPublicFeed.enablementSetting, false);
		assert.deepStrictEqual({
			queries: fixture.requests.length,
			available: fixture.page.getAccessibilityContent().includes('public-mail'),
			installed: fixture.page.getAccessibilityContent().includes('Local mail skill'),
		}, { queries: 1, available: false, installed: true });
	});

	test('plugin-only source picker and accessible results keep configured provenance', async () => {
		const fixture = createPage([CustomizationMarketplaceSources.PluginMarketplaces.id]);
		fixture.page.setSearchQuery('@type:plugin review');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('review', { sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id, mediaType: CustomizationMarketplaceMediaType.ClaudePlugin, description: 'Review code', originLabel: 'owner/catalog' })],
		});
		await timeout(0);
		const availableAccessible = fixture.page.getAccessibilityContent().includes('review\nPlugin · Configured Plugin Marketplaces · owner/catalog\nReview code');
		await fixture.selectSource(CustomizationMarketplaceSources.PluginMarketplaces.id);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options.sourceIds),
			source: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			availableAccessible,
			accessible: fixture.page.getAccessibilityContent().includes('Configured Plugin Marketplaces'),
		}, {
			requests: [undefined, [CustomizationMarketplaceSources.PluginMarketplaces.id]],
			source: 'Configured Plugin Marketplaces',
			availableAccessible: true,
			accessible: true,
		});
	});

	test('different configured plugins with the same name remain available', async () => {
		const installedPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/review');
			override readonly label = 'review';
		}();
		const fixture = createPage([CustomizationMarketplaceSources.PluginMarketplaces.id], [installedPlugin]);
		fixture.page.rebuildCards(new Set([AICustomizationManagementSection.Plugins]));
		fixture.page.setSearchQuery('@type:plugin review');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('review', { sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id, mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			rows: fixture.container.querySelectorAll('.customization-discovery-results .monaco-list-row').length,
			accessible: fixture.page.getAccessibilityContent().includes('Configured Plugin Marketplaces'),
		}, { rows: 2, accessible: true });
	});

	test('strict plugin policy changes clear cached plugin results and restart discovery', async () => {
		const fixture = createPage([CustomizationMarketplaceSources.PluginMarketplaces.id]);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('blocked', { sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id })] });
		await setEnabled(fixture.configuration, ChatConfiguration.StrictMarketplaces, true);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			queries: fixture.requests.length,
			containsBlocked: fixture.page.getAccessibilityContent().includes('blocked'),
		}, { queries: 2, containsBlocked: false });
	});

	for (const query of ['', '@type:mcp mail']) {
		test(`source warnings in ${query ? 'search' : 'browse'} preserve healthy results and restart from page one`, async () => {
			const fixture = createPage();
			let failing = true;
			const marketplace = new CustomizationMarketplaceService([
				{ id: 'agentFinder', query: async () => ({ items: [resource('public-mail', { score: 50 })], total: 1 }) },
				{ id: 'other', query: async () => {
					if (failing) {
						throw new Error('Other Feed unavailable');
					}
					return { items: [resource('other-mail', { score: 100 })], total: 1 };
				} },
			]);
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			const complete = async (index: number) => {
				const request = fixture.requests[index];
				await request.result.complete(await marketplace.query({ ...request.options, sourceIds: ['agentFinder', 'other'] }, request.token));
				await timeout(0);
			};
			await complete(0);
			const initial = {
				healthy: fixture.page.getAccessibilityContent().includes('public-mail'),
				warning: fixture.container.querySelector('.customization-marketplace-source-warning')?.textContent,
				accessible: fixture.page.getAccessibilityContent().includes('Other Feed unavailable'),
			};
			const retry = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-warning .monaco-button');
			assert.ok(retry);
			failing = false;
			retry.click();
			await complete(1);
			assert.deepStrictEqual({
				initial,
				cursors: fixture.requests.map(request => request.options.cursor),
				visible: fixture.page.getAccessibilityContent().match(/^(?:public|other)-mail$/gm),
				warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
			}, {
				initial: { healthy: true, warning: 'Other Feed: Other Feed unavailableRetry', accessible: true },
				cursors: [undefined, undefined],
				visible: query ? ['other-mail', 'public-mail'] : ['public-mail', 'other-mail'],
				warnings: 0,
			});
		});
	}
});
