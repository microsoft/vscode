/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IListService, ListService, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
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
		const configuration = new TestConfigurationService({
			'workbench.list.smoothScrolling': false,
			...Object.fromEntries(Object.values(CustomizationMarketplaceSources).map(source => [
				source.enablementSetting, enabledSourceIds.includes(source.id),
			])),
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
		const recoveryActions = new Map<string, ICustomizationMarketplaceSourceRecoveryAction>();
		const notifications: Parameters<INotificationService['error']>[0][] = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: Parameters<INotificationService['error']>[0]) { notifications.push(error); }
		}());
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = Object.values(CustomizationMarketplaceSources);
			override getSourceRecoveryAction(sourceId: string) { return recoveryActions.get(sourceId); }
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
		function getSourceActions() {
			const button = container.querySelector<HTMLElement>('.customization-discovery-source .monaco-button');
			assert.ok(button);
			button.click();
			assert.ok(sourceMenu?.getActions);
			return sourceMenu.getActions();
		}
		async function selectSource(sourceId: string | undefined): Promise<void> {
			const action = getSourceActions().find(action => action.id === `customizationDiscovery.source.${sourceId ?? 'all'}`);
			assert.ok(action);
			await action.run();
			sourceMenu?.onHide?.(false);
			sourceMenu = undefined;
			await timeout(0);
		}
		return { page, container, configuration, requests, entitlement, sentimentChanged, recoveryActions, notifications, getSourceActions, selectSource, listService };
	}

	async function setEnabled(configuration: TestConfigurationService, setting: string, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(setting, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === setting; }
		}());
		await timeout(0);
	}

	function loadMore(fixture: ReturnType<typeof createPage>): void {
		const element = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .monaco-list');
		assert.ok(element);
		element.focus();
		element.dispatchEvent(new FocusEvent('focus'));
		const list = fixture.listService.lastFocusedList;
		assert.ok(list instanceof WorkbenchList);
		list.scrollTop = 0;
		list.scrollTop = list.scrollHeight;
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
				catalogRequests: sourceIds.length ? [{ query: undefined, mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor: undefined }] : [],
				installedVisible: true,
				searchVisible: true,
			});
		});
	}

	test('source selection uses public display names, cancels the previous query, and resets when disabled', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		const labels = fixture.getSourceActions().map(action => action.label).filter(Boolean);
		await fixture.selectSource('copilotConnectors');
		await fixture.requests[1].result.complete({ items: [resource('connector-mail', { sourceId: 'copilotConnectors' })] });
		await fixture.requests[0].result.complete({ items: [resource('stale-mail')] });
		await timeout(0);
		const selected = {
			label: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			cancelled: fixture.requests[0].token.isCancellationRequested,
			content: fixture.page.getAccessibilityContent().match(/^(?:connector|stale)-mail$/gm),
		};
		await setEnabled(fixture.configuration, ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled, false);
		await fixture.requests[2].result.complete({ items: [resource('public-mail')] });
		await timeout(0);
		assert.deepStrictEqual({
			labels,
			selected,
			selections: fixture.requests.map(request => request.options.sourceIds),
			finalLabel: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			disabledSelectable: fixture.getSourceActions().some(action => action.id === 'customizationDiscovery.source.copilotConnectors'),
			content: fixture.page.getAccessibilityContent().match(/^(?:connector|public|stale)-mail$/gm),
		}, {
			labels: ['All sources', 'Public GitHub Feed', 'Copilot Connectors', 'Configure Marketplaces'],
			selected: { label: 'Copilot Connectors', cancelled: true, content: ['connector-mail'] },
			selections: [undefined, ['copilotConnectors'], undefined],
			finalLabel: 'All sources',
			disabledSelectable: false,
			content: ['public-mail'],
		});
	});

	test('clearing search restores browse results only for the selected source', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('all-featured')] });
		await fixture.selectSource('copilotConnectors');
		await fixture.requests[1].result.complete({ items: [resource('connector-featured', { sourceId: 'copilotConnectors' })] });
		fixture.page.setSearchQuery('mail');
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [resource('connector-search', { sourceId: 'copilotConnectors' })] });
		fixture.page.setSearchQuery('');
		const restored = fixture.page.getAccessibilityContent().match(/^(?:all|connector)-(?:featured|search)$/gm);
		await fixture.selectSource(undefined);
		assert.deepStrictEqual({
			restored,
			all: fixture.page.getAccessibilityContent().match(/^(?:all|connector)-(?:featured|search)$/gm),
			requests: fixture.requests.map(request => [request.options.query, request.options.sourceIds]),
		}, {
			restored: ['connector-featured'],
			all: ['all-featured'],
			requests: [[undefined, undefined], [undefined, ['copilotConnectors']], ['mail', ['copilotConnectors']]],
		});
	});

	test('source recovery during search invalidates cached browse failures', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		const sourceErrors = [{ sourceId: 'copilotConnectors', message: 'Sign in to view connectors.' }];
		fixture.recoveryActions.set('copilotConnectors', { label: 'Sign In', kind: 'signIn', run: async () => { } });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('old-featured')], sourceErrors });
		fixture.page.setSearchQuery('mail');
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [], sourceErrors });
		await timeout(0);
		const signIn = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-signin .monaco-button');
		assert.ok(signIn);
		signIn.click();
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [resource('connector-search', { sourceId: 'copilotConnectors' })] });
		fixture.page.setSearchQuery('');
		await timeout(0);
		const restoredStale = fixture.page.getAccessibilityContent().includes('old-featured');
		await fixture.requests[3].result.complete({ items: [resource('new-featured')] });
		await timeout(0);
		assert.deepStrictEqual({
			queries: fixture.requests.map(request => request.options.query),
			cursors: fixture.requests.map(request => request.options.cursor),
			restoredStale,
			signInPrompts: fixture.container.querySelectorAll('.customization-marketplace-source-signin').length,
			featured: fixture.page.getAccessibilityContent().match(/^(?:old|new)-featured$/gm),
		}, {
			queries: [undefined, 'mail', 'mail', undefined],
			cursors: [undefined, undefined, undefined, undefined],
			restoredStale: false,
			signInPrompts: 0,
			featured: ['new-featured'],
		});
	});

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
		loadMore(fixture);
		await fixture.requests[1].result.complete({ items: [
			resource('mail-24', { mediaType: CustomizationMarketplaceMediaType.ClaudePlugin, score: 70 }),
			resource('mail-25', { sourceId: 'copilotConnectors', score: 60 }),
		] });
		await timeout(0);
		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			visibleOrder: fixture.page.getAccessibilityContent().match(/^mail-\d+/gm),
			hasLoadMoreFooter: fixture.container.querySelector('.customization-discovery-footer') !== null,
		}, {
			requests: [
				{ query: 'mail', mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor: undefined },
				{ query: 'mail', mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor },
			],
			visibleOrder: [...items.filter(item => item.mediaType !== CustomizationMarketplaceMediaType.Skill).map(item => item.identifier), 'mail-24', 'mail-25'],
			hasLoadMoreFooter: false,
		});
	});

	test('single-type filters use the native type selector with the global page size', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		assert.deepStrictEqual(fixture.requests.map(request => request.options), [
			{ query: 'mail', mediaType: CustomizationMarketplaceMediaType.McpServer, sourceIds: undefined, pageSize: 24, cursor: undefined },
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
		loadMore(fixture);
		await fixture.requests[1].result.error(new Error('Connection interrupted'));
		await timeout(0);
		const afterFailure = {
			hasFirst: fixture.page.getAccessibilityContent().includes('mail-first'),
			hasError: fixture.page.getAccessibilityContent().includes('Connection interrupted'),
		};
		const retry = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .customization-discovery-state .monaco-button');
		assert.ok(retry);
		retry.click();
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

	test('source authorization is explicit, keyboard accessible, and restarts the combined query after consent', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		const consent = new DeferredPromise<void>();
		const authorizations: CancellationToken[] = [];
		fixture.recoveryActions.set('copilotConnectors', {
			label: 'Sign In',
			kind: 'signIn',
			run: async token => { authorizations.push(token); await consent.p; },
		});
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('public-mail')],
			sourceErrors: [{ sourceId: 'copilotConnectors', message: 'Sign in to view connectors.' }],
		});
		await timeout(0);
		const action = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-signin .monaco-button');
		assert.ok(action);
		const initial = {
			authorizations: authorizations.length,
			healthyVisible: fixture.page.getAccessibilityContent().includes('public-mail'),
			accessibleAction: fixture.page.getAccessibilityContent().includes('Choose Sign In'),
			label: action.getAttribute('aria-label'),
			primary: !action.classList.contains('secondary'),
			warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning, .customization-marketplace-source-warning-help, .customization-marketplace-source-warnings .codicon-warning').length,
		};
		action.focus();
		action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		action.click();
		const pending = { authorizations: authorizations.length, disabled: action.getAttribute('aria-disabled'), requests: fixture.requests.length };
		await consent.complete();
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [resource('connector-mail', { sourceId: 'copilotConnectors' }), resource('public-mail')] });
		await timeout(0);
		assert.deepStrictEqual({
			initial, pending,
			cursors: fixture.requests.map(request => request.options.cursor),
			warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
			signIns: fixture.container.querySelectorAll('.customization-marketplace-source-signin').length,
			notifications: fixture.notifications,
		}, {
			initial: {
				authorizations: 0,
				healthyVisible: true,
				accessibleAction: true,
				label: 'Sign In to view Copilot Connectors.',
				primary: true,
				warnings: 0,
			},
			pending: { authorizations: 1, disabled: 'true', requests: 1 },
			cursors: [undefined, undefined],
			warnings: 0,
			signIns: 0,
			notifications: [],
		});
	});

	for (const outcome of ['cancelled', 'denied', 'disposed']) {
		test(`source authorization ${outcome} does not restart discovery or remove healthy results`, async () => {
			const fixture = createPage(['agentFinder', 'copilotConnectors']);
			const consent = new DeferredPromise<void>();
			let authorizationToken = CancellationToken.None;
			fixture.recoveryActions.set('copilotConnectors', {
				label: 'Sign In',
				kind: 'signIn',
				run: async token => { authorizationToken = token; await consent.p; },
			});
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({
				items: [resource('public-mail')],
				sourceErrors: [{ sourceId: 'copilotConnectors', message: 'Sign in to view connectors.' }],
			});
			await timeout(0);
			const action = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-signin .monaco-button');
			assert.ok(action);
			action.click();
			const denied = new Error('Permission denied');
			if (outcome === 'disposed') {
				fixture.page.dispose();
				await consent.complete();
			} else {
				await consent.error(outcome === 'cancelled' ? new CancellationError() : denied);
			}
			await timeout(0);
			assert.deepStrictEqual({
				requests: fixture.requests.length,
				healthyVisible: outcome === 'disposed' || fixture.page.getAccessibilityContent().includes('public-mail'),
				disabled: outcome === 'disposed' ? undefined : action.getAttribute('aria-disabled'),
				cancelled: authorizationToken.isCancellationRequested,
				notifications: fixture.notifications,
			}, {
				requests: 1,
				healthyVisible: true,
				disabled: outcome === 'disposed' ? undefined : 'false',
				cancelled: outcome === 'disposed',
				notifications: outcome === 'denied' ? [denied] : [],
			});
		});
	}

	for (const query of ['', '@type:mcp mail']) {
		test(`connector sign-in with no ${query ? 'search' : 'browse'} results is an invitation, not a warning or empty success`, async () => {
			const fixture = createPage(['copilotConnectors']);
			fixture.recoveryActions.set('copilotConnectors', { label: 'Sign In', kind: 'signIn', run: async () => { } });
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({
				items: [],
				sourceErrors: [{ sourceId: 'copilotConnectors', message: 'Sign in to view connectors.' }],
			});
			await timeout(0);
			const state = fixture.container.querySelector(query ? '.customization-discovery-results .customization-discovery-state' : '.customization-discovery-browse .customization-discovery-state');
			assert.deepStrictEqual({
				prompt: fixture.container.querySelector('.customization-marketplace-source-signin .customization-marketplace-source-message')?.textContent,
				state: state?.textContent,
				warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning, .customization-marketplace-source-warning-help, .customization-marketplace-source-warnings .codicon-warning').length,
				accessibleAction: fixture.page.getAccessibilityContent().includes('Choose Sign In'),
				accessibleFailure: /unavailable|incomplete|could not|No customizations/.test(fixture.page.getAccessibilityContent()),
			}, {
				prompt: 'Sign in to view connectors.', state: '', warnings: 0, accessibleAction: true, accessibleFailure: false,
			});
		});

		test(`isolates source failures in ${query ? 'search' : 'welcome browsing'} and restarts ranking on source retry`, async () => {
			const fixture = createPage(['agentFinder', 'copilotConnectors']);
			let failing = true;
			const service = new CustomizationMarketplaceService([
				{ id: 'agentFinder', query: async () => ({ items: [resource('public-mail', { score: 50 })], total: 1 }) },
				{ id: 'copilotConnectors', query: async () => {
					if (failing) {
						throw new Error('Connector catalog unavailable');
					}
					return { items: [resource('connector-mail', { score: 100 })], total: 1 };
				} },
			]);
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			const complete = async (index: number) => {
				const request = fixture.requests[index];
				await request.result.complete(await service.query({ ...request.options, sourceIds: ['agentFinder', 'copilotConnectors'] }, request.token));
				await timeout(0);
			};
			await complete(0);
			const initial = {
				healthyVisible: fixture.page.getAccessibilityContent().includes('public-mail'),
				warning: fixture.container.querySelector('.customization-marketplace-source-warning')?.textContent,
				accessibleWarning: fixture.page.getAccessibilityContent().includes('Connector catalog unavailable'),
			};
			const retry = fixture.container.querySelector<HTMLElement>('.customization-marketplace-source-warning .monaco-button');
			assert.ok(retry);
			failing = false;
			retry.click();
			await complete(1);
			assert.deepStrictEqual({
				initial,
				cursors: fixture.requests.map(request => request.options.cursor),
				order: fixture.page.getAccessibilityContent().match(/^(?:public|connector)-mail$/gm),
				warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
			}, {
				initial: {
					healthyVisible: true,
					warning: 'Copilot Connectors: Connector catalog unavailableRetry',
					accessibleWarning: true,
				},
				cursors: [undefined, undefined],
				order: query ? ['connector-mail', 'public-mail'] : ['public-mail', 'connector-mail'],
				warnings: 0,
			});
		});

		test(`all sources failing in ${query ? 'search' : 'welcome browsing'} offers source retries rather than an empty success`, async () => {
			const fixture = createPage(['agentFinder', 'copilotConnectors']);
			const sources = ['agentFinder', 'copilotConnectors'].map(id => ({
				id, query: async () => { throw new Error(`${id} unavailable`); },
			}));
			const service = new CustomizationMarketplaceService(sources);
			if (query) {
				fixture.page.setSearchQuery(query);
			}
			fixture.page.setVisible(true);
			const request = fixture.requests[0];
			await request.result.complete(await service.query({ ...request.options, sourceIds: sources.map(source => source.id) }, request.token));
			await timeout(0);
			const state = fixture.container.querySelector(query ? '.customization-discovery-results .customization-discovery-state' : '.customization-discovery-browse .customization-discovery-state');
			assert.deepStrictEqual({
				state: state?.textContent,
				retries: [...fixture.container.querySelectorAll('.customization-marketplace-source-warning .monaco-button')].map(button => button.getAttribute('aria-label')),
				accessibleErrors: sources.map(source => fixture.page.getAccessibilityContent().includes(`${source.id} unavailable`)),
			}, {
				state: 'Available customizations could not be fully loaded. Retry an unavailable source.',
				retries: [
					'Retry Public GitHub Feed. Reload all sources from the first page.',
					'Retry Copilot Connectors. Reload all sources from the first page.',
				],
				accessibleErrors: [true, true],
			});
		});
	}

	test('a later source failure retains loaded results and healthy paging across cancellation', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		const publicItems = Array.from({ length: 30 }, (_, index) => resource(`public-mail-${index}`, { score: 40 - index }));
		const connectorItems = Array.from({ length: 24 }, (_, index) => resource(`connector-mail-${index}`, { score: 100 - index }));
		const service = new CustomizationMarketplaceService([
			{ id: 'agentFinder', query: async options => {
				const offset = Number(options.cursor ?? 0);
				return { items: publicItems.slice(offset, offset + 24), total: 30, nextCursor: offset === 0 ? '24' : undefined };
			} },
			{ id: 'copilotConnectors', query: async options => {
				if (options.cursor) {
					throw new Error('Connector continuation unavailable');
				}
				return { items: connectorItems, total: 30, nextCursor: '24' };
			} },
		]);
		const complete = async (index: number) => {
			const request = fixture.requests[index];
			await request.result.complete(await service.query({ ...request.options, sourceIds: ['agentFinder', 'copilotConnectors'] }, request.token));
			await timeout(0);
		};
		fixture.page.setSearchQuery('@type:mcp mail');
		fixture.page.setVisible(true);
		await complete(0);
		loadMore(fixture);
		await complete(1);
		const partial = {
			loaded: fixture.page.getAccessibilityContent().match(/^(?:connector|public)-mail-\d+$/gm)?.length,
			warning: fixture.page.getAccessibilityContent().includes('Connector continuation unavailable'),
		};
		loadMore(fixture);
		fixture.page.setVisible(false);
		await fixture.requests[2].result.complete({
			items: [resource('cancelled-result')],
			sourceErrors: [{ sourceId: 'agentFinder', message: 'cancelled-warning' }],
		});
		await timeout(0);
		fixture.page.setVisible(true);
		loadMore(fixture);
		await complete(3);
		assert.deepStrictEqual({
			partial,
			cancelled: fixture.requests[2].token.isCancellationRequested,
			retriedCursor: fixture.requests[2].options.cursor?.token === fixture.requests[3].options.cursor?.token,
			loaded: fixture.page.getAccessibilityContent().match(/^(?:connector|public)-mail-\d+$/gm),
			lateContent: fixture.page.getAccessibilityContent().includes('cancelled-'),
			warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
		}, {
			partial: { loaded: 48, warning: true },
			cancelled: true,
			retriedCursor: true,
			loaded: [...connectorItems, ...publicItems].map(item => item.identifier),
			lateContent: false,
			warnings: 1,
		});
	});
});
