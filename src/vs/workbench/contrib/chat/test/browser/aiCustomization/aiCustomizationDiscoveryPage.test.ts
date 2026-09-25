/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IListService, ListService, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpWorkbenchService } from '../../../../mcp/common/mcpTypes.js';
import { AICustomizationDiscoveryPage } from '../../../browser/aiCustomization/aiCustomizationDiscoveryPage.js';
import { IAICustomizationListItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { DELETE_AI_CUSTOMIZATION_ID } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AICustomizationDiscoveryPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const secondSource = { id: 'other', displayName: 'Other Feed', enablementSetting: 'test.marketplace.other.enabled' };
	const sources = [CustomizationMarketplaceSources.AgentFinderPublicFeed, secondSource];

	function resource(identifier: string, overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
		return {
			identifier, displayName: identifier, sourceId: 'agentFinder', description: '',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			tags: [], capabilities: [], representativeQueries: [], ...overrides,
		};
	}

	function createPage(enabledSources: readonly string[] = ['agentFinder', 'other'], visibleSections: readonly AICustomizationManagementSection[] = [AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers], setupUrl?: URI) {
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
		const opened: (URI | string)[] = [];
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string): Promise<boolean> {
				opened.push(resource);
				return true;
			}
		}());
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
		let recoveryAction: ICustomizationMarketplaceSourceRecoveryAction | undefined;
		const deletions: DeferredPromise<void>[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(commandId: string, ..._args: unknown[]): Promise<R | undefined> {
				if (commandId === DELETE_AI_CUSTOMIZATION_ID) {
					const result = new DeferredPromise<void>();
					deletions.push(result);
					return result.p as Promise<R | undefined>;
				}
				return Promise.resolve(undefined);
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = sources;
			override getSourceRecoveryAction(sourceId: string) { return sourceId === 'other' ? recoveryAction : undefined; }
			override query(options: ICustomizationMarketplaceQuery, token: CancellationToken) {
				const result = new DeferredPromise<ICustomizationMarketplacePage>();
				requests.push({ options, token, result });
				return result.p;
			}
		}());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override getInstallState(resource: ICustomizationMarketplaceResource) {
				return setupUrl && resource.identifier === 'unity'
					? { kind: 'unavailable' as const, message: 'Manual setup required', setupUrl }
					: { kind: 'available' as const };
			}
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
		const creationEvents: string[] = [];
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
			override async generateCustomization(type: PromptsType): Promise<void> { creationEvents.push(type); }
		}());
		const page = store.add(instantiationService.createInstance(AICustomizationDiscoveryPage, container, undefined, {
			selectSection() { }, selectSectionWithMarketplace() { }, closeEditor() { creationEvents.push('close'); }, reviewMigrations() { }, prefillChat() { },
		}, 'Copilot'));
		page.rebuildCards(new Set(visibleSections));
		page.layout(new DOM.Dimension(900, 600));
		return {
			page, container, configuration, requests, listService, creationEvents, opened, deletions,
			setRecoveryAction: (action: ICustomizationMarketplaceSourceRecoveryAction) => { recoveryAction = action; },
			selectImport: async (id: string) => {
				const button = container.querySelector<HTMLElement>('.customization-discovery-title-row .monaco-button');
				assert.ok(button);
				button.click();
				const action = sourceMenu?.getActions?.().find(action => action.id === `customizationDiscovery.${id}`);
				assert.ok(action);
				await action.run();
				sourceMenu?.onHide?.(false);
				sourceMenu = undefined;
			},
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

	for (const [action, type] of [
		['newAgent', PromptsType.agent],
		['newSkill', PromptsType.skill],
		['newInstructions', PromptsType.instructions],
		['newPrompt', PromptsType.prompt],
	] as const) {
		test(`Import > ${action} closes Discover before starting creation`, async () => {
			const fixture = createPage(['agentFinder'], [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.Instructions,
				AICustomizationManagementSection.Prompts,
			]);
			await fixture.selectImport(action);
			assert.deepStrictEqual(fixture.creationEvents, ['close', type]);
		});
	}

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
		await timeout(0);
	}

	async function waitForRequestCount(requests: readonly object[], count: number): Promise<void> {
		await retry(async () => assert.ok(requests.length >= count), 10, 20);
	}

	test('one global continuation preserves ranked multi-type results and source selection', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp @type:plugin mail');
		fixture.page.setVisible(true);
		const types = [CustomizationMarketplaceMediaType.McpServer, CustomizationMarketplaceMediaType.CopilotPlugin, CustomizationMarketplaceMediaType.Skill];
		const items = Array.from({ length: 24 }, (_, index) => resource(`mail-${index}`, { mediaType: types[index % types.length], score: 100 - index }));
		const cursor = { token: 'opaque+/=&continuation' };
		await fixture.requests[0].result.complete({ items, nextCursor: cursor });
		await retry(async () => assert.ok(fixture.page.getAccessibilityContent().includes('mail-22')), 10, 20);
		const listElement = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .monaco-list');
		assert.ok(listElement);
		listElement.focus();
		listElement.dispatchEvent(new FocusEvent('focus'));
		const list = fixture.listService.lastFocusedList;
		assert.ok(list instanceof WorkbenchList);
		list.scrollTop = 0;
		list.scrollTop = list.scrollHeight;
		list.scrollTop = list.scrollHeight;
		await waitForRequestCount(fixture.requests, 2);
		assert.strictEqual(fixture.requests.length, 2);
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

	test('multi-type search backfills an empty filtered page without scrolling', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp @type:plugin mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'filtered-first-page' };
		const nextCursor = { token: 'filtered-second-page' };
		await fixture.requests[0].result.complete({
			items: Array.from({ length: 24 }, (_, index) => resource(`mail-skill-${index}`, { mediaType: CustomizationMarketplaceMediaType.Skill, score: 100 - index })),
			nextCursor: cursor,
		});
		await timeout(0);
		assert.deepStrictEqual(fixture.requests[1]?.options, {
			query: 'mail', mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor,
		});
		await fixture.requests[1].result.complete({
			items: Array.from({ length: 24 }, (_, index) => resource(`mail-skill-${index + 24}`, { mediaType: CustomizationMarketplaceMediaType.Skill, score: 50 - index })),
			nextCursor,
		});
		await timeout(0);
		assert.deepStrictEqual(fixture.requests[2]?.options.cursor, nextCursor);
		await fixture.requests[2].result.complete({ items: [resource('mail-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, score: 1 })] });
		await timeout(0);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			visible: fixture.page.getAccessibilityContent().match(/^mail-(?:skill-\d+|plugin)$/gm),
		}, { requests: 3, visible: ['mail-plugin'] });
	});

	test('plugin-only search finds a match after the first 24 filtered items', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'after-24-skills' };
		await fixture.requests[0].result.complete({
			items: Array.from({ length: 24 }, (_, index) => resource(`mail-skill-${index}`, { mediaType: CustomizationMarketplaceMediaType.Skill })),
			nextCursor: cursor,
		});
		await timeout(0);
		await fixture.requests[1].result.complete({
			items: [resource('mail-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			cursors: fixture.requests.map(request => request.options.cursor),
			visible: fixture.page.getAccessibilityContent().match(/^mail-(?:plugin|skill-\d+)$/gm),
		}, { cursors: [undefined, cursor], visible: ['mail-plugin'] });
	});

	test('filtered backfill automatically continues after a bounded batch', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		for (let index = 0; index < 8; index++) {
			await fixture.requests[index].result.complete({
				items: [resource(`mail-skill-${index}`, { mediaType: CustomizationMarketplaceMediaType.Skill })],
				nextCursor: { token: `page-${index + 1}` },
			});
			await timeout(0);
		}
		await waitForRequestCount(fixture.requests, 9);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			loadMore: fixture.container.querySelector('.customization-discovery-results .customization-discovery-state .monaco-button')?.textContent,
			cursor: fixture.requests[8]?.options.cursor,
		}, {
			requests: 9,
			loadMore: undefined,
			cursor: { token: 'page-8' },
		});
		await fixture.requests[8].result.complete({ items: [resource('mail-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })] });
		await timeout(0);
		assert.deepStrictEqual({
			visible: fixture.page.getAccessibilityContent().match(/^mail-plugin$/gm),
		}, {
			visible: ['mail-plugin'],
		});
	});

	test('short filtered results continue paging while the list remains underfilled', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'short-page' };
		await fixture.requests[0].result.complete({
			items: [resource('mail-plugin-1', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
			nextCursor: cursor,
		});
		await waitForRequestCount(fixture.requests, 2);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			cursor: fixture.requests[1]?.options.cursor,
			busy: fixture.container.querySelector('.customization-discovery-results')?.getAttribute('aria-busy'),
			loading: fixture.container.querySelector('.customization-discovery-results .customization-discovery-state')?.textContent,
		}, {
			requests: 2,
			cursor,
			busy: 'true',
			loading: 'Loading more customizations...',
		});
		await fixture.requests[1].result.complete({
			items: [resource('mail-plugin-2', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			visible: fixture.page.getAccessibilityContent().match(/^mail-plugin-\d$/gm),
			busy: fixture.container.querySelector('.customization-discovery-results')?.getAttribute('aria-busy'),
		}, {
			visible: ['mail-plugin-1', 'mail-plugin-2'],
			busy: 'false',
		});
	});

	test('continuation errors stop automatic paging and Retry resumes from the same cursor', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'retry-page' };
		await fixture.requests[0].result.complete({
			items: [resource('mail-1')],
			nextCursor: cursor,
		});
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.error(new Error('temporary failure'));
		await timeout(0);
		const retry = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-results .customization-discovery-state .monaco-button');
		assert.ok(retry);
		await timeout(0);
		assert.strictEqual(fixture.requests.length, 2);
		retry.click();
		await timeout(0);
		assert.deepStrictEqual({
			query: fixture.requests[2]?.options.query,
			cursor: fixture.requests[2]?.options.cursor,
		}, {
			query: 'mail',
			cursor,
		});
		await fixture.requests[2].result.complete({ items: [resource('mail-2')] });
		await timeout(0);
		assert.deepStrictEqual(fixture.page.getAccessibilityContent().match(/^mail-\d$/gm), ['mail-1', 'mail-2']);
	});

	test('hiding during a continuation resumes paging when shown again', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'resume-page' };
		await fixture.requests[0].result.complete({
			items: [resource('mail-1')],
			nextCursor: cursor,
		});
		await waitForRequestCount(fixture.requests, 2);
		const cancelledRequest = fixture.requests[1];
		fixture.page.setVisible(false);
		fixture.page.setVisible(true);
		await waitForRequestCount(fixture.requests, 3);
		await cancelledRequest.result.complete({ items: [resource('stale-mail')] });
		await fixture.requests[2].result.complete({ items: [resource('mail-2')] });
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: cancelledRequest.token.isCancellationRequested,
			cursors: fixture.requests.map(request => request.options.cursor),
			visible: fixture.page.getAccessibilityContent().match(/^(?:mail-\d|stale-mail)$/gm),
			busy: fixture.container.querySelector('.customization-discovery-results')?.getAttribute('aria-busy'),
		}, {
			cancelled: true,
			cursors: [undefined, cursor, cursor],
			visible: ['mail-1', 'mail-2'],
			busy: 'false',
		});
	});

	test('changing query cancels a filtered backfill without publishing stale results', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('mail-skill', { mediaType: CustomizationMarketplaceMediaType.Skill })],
			nextCursor: { token: 'next' },
		});
		await timeout(0);
		const staleRequest = fixture.requests[1];
		fixture.page.setSearchQuery('@type:plugin fresh');
		await staleRequest.result.complete({ items: [resource('mail-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })] });
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [resource('fresh-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })] });
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: staleRequest.token.isCancellationRequested,
			visible: fixture.page.getAccessibilityContent().match(/^(?:mail|fresh)-plugin$/gm),
		}, { cancelled: true, visible: ['fresh-plugin'] });
	});

	test('changing source cancels a pending continuation without publishing stale results', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('public-mail')],
			nextCursor: { token: 'public-next' },
		});
		await waitForRequestCount(fixture.requests, 2);
		const staleRequest = fixture.requests[1];
		await fixture.selectSource('other');
		await waitForRequestCount(fixture.requests, 3);
		await staleRequest.result.complete({ items: [resource('stale-mail')] });
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [resource('other-mail', { sourceId: 'other' })] });
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: staleRequest.token.isCancellationRequested,
			sourceIds: fixture.requests[2].options.sourceIds,
			visible: fixture.page.getAccessibilityContent().match(/^(?:public|stale|other)-mail$/gm),
		}, {
			cancelled: true,
			sourceIds: ['other'],
			visible: ['other-mail'],
		});
	});

	test('source recovery while hidden reloads on next reveal without stealing focus', async () => {
		const fixture = createPage();
		const recovery = new DeferredPromise<void>();
		fixture.setRecoveryAction({ kind: 'signIn', label: 'Sign in', run: async () => recovery.p });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [], sourceErrors: [{ sourceId: 'other', message: 'Sign in required' }] });
		await timeout(0);
		const signIn = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-signin .monaco-button');
		assert.ok(signIn);
		signIn.click();
		fixture.page.setVisible(false);
		const focusTarget = DOM.append(fixture.container, DOM.$('button'));
		focusTarget.focus();
		await recovery.complete();
		await timeout(0);
		assert.deepStrictEqual({
			hiddenRequests: fixture.requests.length,
			focusRetained: mainWindow.document.activeElement === focusTarget,
		}, { hiddenRequests: 1, focusRetained: true });
		fixture.page.setVisible(true);
		assert.deepStrictEqual(fixture.requests[1]?.options.cursor, undefined);
		await fixture.requests[1].result.complete({ items: [resource('recovered')] });
		await timeout(0);
		assert.deepStrictEqual({
			visible: fixture.page.getAccessibilityContent().includes('recovered'),
			warnings: fixture.container.querySelectorAll('.customization-marketplace-source-signin').length,
		}, { visible: true, warnings: 0 });
	});

	test('direct installed uninstall is pending immediately and cannot start twice', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@installed mail');
		fixture.page.setVisible(true);
		const uninstallButton = () => fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-results .monaco-list-row .monaco-button');
		assert.ok(uninstallButton());
		uninstallButton()!.click();
		const pending = { label: uninstallButton()?.textContent, disabled: uninstallButton()?.getAttribute('aria-disabled'), busy: uninstallButton()?.getAttribute('aria-busy') };
		uninstallButton()?.click();
		const calls = fixture.deletions.length;
		for (const deletion of fixture.deletions) {
			await deletion.complete();
		}
		assert.deepStrictEqual({ pending, calls }, { pending: { label: 'Uninstalling...', disabled: 'true', busy: 'true' }, calls: 1 });
	});

	for (const query of ['', '@type:plugin demo']) {
		test(`does not display Cursor plugins in ${query ? 'search' : 'browse'}`, async () => {
			const fixture = createPage();
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({
				items: [
					resource('demo Cursor plugin', { mediaType: CustomizationMarketplaceMediaType.CursorPlugin }),
					resource('demo Copilot plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }),
				],
			});
			await timeout(0);
			const content = fixture.page.getAccessibilityContent();
			assert.deepStrictEqual({
				cursor: content.includes('demo Cursor plugin'),
				copilot: content.includes('demo Copilot plugin'),
			}, { cursor: false, copilot: true });
		});
	}

	for (const query of ['', '@type:mcp unity']) {
		test(`offers publisher setup instead of retrying unsupported MCP installation in ${query ? 'search' : 'browse'}`, async () => {
			const setupUrl = URI.parse('https://github.com/CoplayDev/unity-mcp');
			const fixture = createPage(['agentFinder'], undefined, setupUrl);
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({ items: [resource('unity')] });
			await timeout(0);
			const button = fixture.container.querySelector<HTMLButtonElement>(query
				? '.customization-discovery-result-actions .monaco-button'
				: '.customization-discovery-card-actions .monaco-button');
			assert.ok(button);
			const presentation = { label: button.textContent, ariaLabel: button.getAttribute('aria-label'), disabled: button.hasAttribute('disabled') };
			button.click();
			await timeout(0);
			assert.deepStrictEqual({ presentation, opened: fixture.opened }, {
				presentation: { label: 'View Setup', ariaLabel: 'View setup instructions for unity', disabled: false },
				opened: [setupUrl],
			});
		});
	}

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

	for (const query of ['', '@type:mcp mail']) {
		test(`source warnings in ${query ? 'search' : 'browse'} preserve healthy results and restart from page one`, async () => {
			const fixture = createPage();
			let failing = true;
			const marketplace = new CustomizationMarketplaceService([
				{ id: 'agentFinder', query: async () => ({ items: [resource('public-mail', { score: 50 })], total: 1 }) },
				{
					id: 'other', query: async () => {
						if (failing) {
							throw new Error('Other Feed unavailable');
						}
						return { items: [resource('other-mail', { score: 100 })], total: 1 };
					}
				},
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
