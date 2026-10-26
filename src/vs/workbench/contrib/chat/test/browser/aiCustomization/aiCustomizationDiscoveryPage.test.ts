/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceQueryProgressCallback, CustomizationMarketplaceRecoveryGroup, CustomizationMarketplaceService, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceBrowseSections, ICustomizationMarketplaceBrowseSectionsProgress, ICustomizationMarketplacePage, ICustomizationMarketplaceQuery, ICustomizationMarketplaceResource, ICustomizationMarketplaceService, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IListService, ListService, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService, NoOpNotification, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer } from '../../../../mcp/common/mcpTypes.js';
import { AICustomizationDiscoveryPage } from '../../../browser/aiCustomization/aiCustomizationDiscoveryPage.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from '../../../browser/aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { DELETE_AI_CUSTOMIZATION_ID } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID } from '../../../browser/actions/chatPluginActions.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationItem } from '../../../common/customizationHarnessService.js';
import { createCustomizationMarketplaceInstallationSnapshot, CustomizationMarketplaceInstallOrigin, CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('AICustomizationDiscoveryPage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const otherSourceUrlSetting = 'test.marketplace.other.url';
	const secondSource = {
		id: 'other',
		displayName: 'Other Feed',
		enablementSetting: 'test.marketplace.other.enabled',
		configurationDependencies: [otherSourceUrlSetting],
	};
	const pluginSource = {
		...CustomizationMarketplaceSources.PluginMarketplaces,
	};
	const configuredMarketplaceReference = parseMarketplaceReference('owner/catalog')!;
	const secondConfiguredMarketplaceReference = parseMarketplaceReference('anthropics/claude-code')!;
	const configuredMarketplaceSourceId = getPluginCustomizationMarketplaceSourceId(configuredMarketplaceReference);
	const configuredMarketplaceSource = { ...pluginSource, id: configuredMarketplaceSourceId, displayName: configuredMarketplaceReference.displayLabel };
	const secondConfiguredMarketplaceSource = {
		...pluginSource,
		id: getPluginCustomizationMarketplaceSourceId(secondConfiguredMarketplaceReference),
		displayName: secondConfiguredMarketplaceReference.displayLabel,
	};
	const sources = [configuredMarketplaceSource, secondConfiguredMarketplaceSource, CustomizationMarketplaceSources.AgentFinderPublicFeed, CustomizationMarketplaceSources.CopilotConnectors, secondSource];
	const testIcon = URI.parse('https://example.invalid/icon.png');

	function resource(identifier: string, overrides: Partial<ICustomizationMarketplaceResource> = {}): ICustomizationMarketplaceResource {
		return {
			identifier, displayName: identifier, sourceId: 'agentFinder', description: '',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			tags: [], capabilities: [], representativeQueries: [], ...overrides,
		};
	}

	function createPage(
		enabledSources: readonly string[] = ['agentFinder', 'other'],
		visibleSections: readonly AICustomizationManagementSection[] = [AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
		installedPlugins: readonly IAgentPlugin[] = [],
		setupUrl?: URI,
		installedIdentifiers: readonly string[] = [],
		browseSections?: ICustomizationMarketplaceBrowseSections | Promise<ICustomizationMarketplaceBrowseSections>,
		sourcePreviews: Readonly<Record<string, readonly ICustomizationMarketplaceResource[] | Promise<readonly ICustomizationMarketplaceResource[]>>> = {},
		providerItems: readonly ICustomizationItem[] = [],
	) {
		const container = DOM.append(mainWindow.document.body, DOM.$('.customization-discovery-test'));
		container.style.width = '900px';
		container.style.height = '600px';
		store.add(toDisposable(() => container.remove()));
		const configuration = new TestConfigurationService({
			'workbench.list.smoothScrolling': false,
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			...Object.fromEntries(sources
				.filter(source => !source.id.startsWith(`${CustomizationMarketplaceSources.PluginMarketplaces.id}.`))
				.map(source => [source.enablementSetting, enabledSources.includes(source.id)])),
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const telemetry: { readonly name: string; readonly data: Record<string, unknown> }[] = [];
		instantiationService.stub(ITelemetryService, new class extends NullTelemetryServiceShape {
			override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
				if (eventName && data) {
					telemetry.push({ name: eventName, data });
				}
			}
		}());
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
		const requests: { options: ICustomizationMarketplaceQuery; token: CancellationToken; onProgress: CustomizationMarketplaceQueryProgressCallback | undefined; result: DeferredPromise<ICustomizationMarketplacePage> }[] = [];
		let browseSectionsProgress: Parameters<NonNullable<ICustomizationMarketplaceService['getBrowseSections']>>[2];
		const installs: { identifier: string; origin: CustomizationMarketplaceInstallOrigin | undefined; result: DeferredPromise<void> }[] = [];
		const marketplaceChanges = store.add(new Emitter<void>());
		const recoveryActions = new Map<string, ICustomizationMarketplaceSourceRecoveryAction>();
		const deletions: DeferredPromise<void>[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id: commandId, args });
				if (commandId === DELETE_AI_CUSTOMIZATION_ID) {
					const result = new DeferredPromise<void>();
					deletions.push(result);
					return result.p as Promise<R | undefined>;
				}
				return Promise.resolve(undefined);
			}
		}());
		const notifications: Parameters<INotificationService['error']>[0][] = [];
		const prompts: Parameters<INotificationService['prompt']>[] = [];
		const promptHandles: NoOpNotification[] = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: Parameters<INotificationService['error']>[0]) { notifications.push(error); }
			override prompt(...args: Parameters<INotificationService['prompt']>) {
				prompts.push(args);
				const handle = new NoOpNotification();
				promptHandles.push(handle);
				return handle;
			}
		}());
		instantiationService.stub(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
			override readonly sources = sources;
			override readonly allSources = sources;
			override readonly onDidChangeSources = marketplaceChanges.event;
			override getSourceRecoveryAction(sourceId: string) { return recoveryActions.get(sourceId); }
			override async getBrowseSections(_options: Pick<ICustomizationMarketplaceQuery, 'sourceIds'>, _token: CancellationToken, onProgress?: (progress: ICustomizationMarketplaceBrowseSectionsProgress) => void) {
				browseSectionsProgress = onProgress;
				return await browseSections;
			}
			override query(options: ICustomizationMarketplaceQuery, token: CancellationToken, onProgress?: CustomizationMarketplaceQueryProgressCallback) {
				if (options.pageSize === 4 && options.sourceIds?.length === 1 && !options.query && !options.mediaType && !options.cursor) {
					return Promise.resolve(sourcePreviews[options.sourceIds[0]] ?? []).then(items => ({ items, total: items.length }));
				}
				const result = new DeferredPromise<ICustomizationMarketplacePage>();
				requests.push({ options, token, onProgress, result });
				return result.p;
			}
		}());
		const installChanges = store.add(new Emitter<void>());
		const installStates = new Map<string, CustomizationMarketplaceInstallState>();
		const recordedResources = new Map<string, ICustomizationMarketplaceResource>();
		const repairs: string[] = [];
		const cancellations: string[] = [];
		const uninstalls: string[] = [];
		let onRepair: ((resource: ICustomizationMarketplaceResource) => Promise<void>) | undefined;
		const getInstallations = () => createCustomizationMarketplaceInstallationSnapshot([...recordedResources.values()].flatMap(resource => {
			const state = installStates.get(getCustomizationMarketplaceResourceKey(resource));
			return state?.kind === 'checking' || state?.kind === 'installed' || state?.kind === 'missing' || state?.kind === 'repairing' || state?.kind === 'uninstalling' || state?.kind === 'error'
				? [{ resource, state }]
				: [];
		}));
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = installChanges.event;
			override readonly installations = observableFromEvent(installChanges.event, getInstallations);
			override getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState {
				if (installedIdentifiers.includes(resource.identifier)) {
					return { kind: 'installed', target: { kind: 'skill', uri: URI.file(`/installed/${resource.identifier}`) } };
				}
				return setupUrl && resource.identifier === 'unity'
					? { kind: 'unavailable', message: 'Manual setup required', setupUrl }
					: installStates.get(getCustomizationMarketplaceResourceKey(resource)) ?? { kind: 'available' };
			}
			override async repair(resource: ICustomizationMarketplaceResource): Promise<void> {
				const key = getCustomizationMarketplaceResourceKey(resource);
				const state = installStates.get(key);
				if (state?.kind !== 'missing') {
					throw new Error('Only missing installations can be repaired.');
				}
				repairs.push(resource.identifier);
				installStates.set(key, { kind: 'repairing', target: state.target });
				installChanges.fire();
				await onRepair?.(resource);
				installStates.set(key, { kind: 'installed', target: state.target });
				installChanges.fire();
			}
			override async install(resource: ICustomizationMarketplaceResource, origin?: CustomizationMarketplaceInstallOrigin): Promise<void> {
				const result = new DeferredPromise<void>();
				installs.push({ identifier: resource.identifier, origin, result });
				await result.p;
			}
			override async uninstall(resource: ICustomizationMarketplaceResource): Promise<void> {
				const key = getCustomizationMarketplaceResourceKey(resource);
				uninstalls.push(resource.identifier);
				installStates.set(key, { kind: 'available' });
				installChanges.fire();
			}
			override cancelConnectorOperation(resource: ICustomizationMarketplaceResource): void {
				cancellations.push(resource.identifier);
			}
		}());
		const sentimentChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
			override readonly onDidChangeSentiment = sentimentChanged.event;
		}();
		instantiationService.stub(IChatEntitlementService, entitlement);
		const installedSkills = observableValue<readonly IAICustomizationListItem[]>('installedSkills', [{
			id: 'local-skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md'), name: 'Local mail skill',
			filename: 'SKILL.md', description: 'Installed locally', source: 'local', promptType: PromptsType.skill, disabled: false,
		}]);
		instantiationService.stub(IAICustomizationItemsModel, new class extends mock<IAICustomizationItemsModel>() {
			override getActiveItemSource(): IAICustomizationItemSource {
				return new class extends mock<IAICustomizationItemSource>() {
					override async fetchProviderItems() { return providerItems; }
				}();
			}
			override getItems(section: ItemsModelSection) {
				return section === AICustomizationManagementSection.Skills ? installedSkills : constObservable([]);
			}
		}());
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() {
			override readonly plugins = constObservable(installedPlugins);
		}());
		const mcpChanges = store.add(new Emitter<IWorkbenchMcpServer | undefined>());
		instantiationService.stub(IMcpWorkbenchService, new class extends mock<IMcpWorkbenchService>() {
			override readonly onChange = mcpChanges.event;
			override readonly onReset = Event.None;
			override readonly local = [];
			override readonly whenInitialLocalMcpServersLoaded = Promise.resolve();
		}());
		const creationEvents: string[] = [];
		const openedDetails: ICustomizationMarketplaceResource[] = [];
		const openedInstalled: NonNullable<Parameters<NonNullable<ConstructorParameters<typeof AICustomizationDiscoveryPage>[2]['openInstalled']>>[0]>[] = [];
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
			override async generateCustomization(type: PromptsType): Promise<void> { creationEvents.push(type); }
		}());
		const page = store.add(instantiationService.createInstance(AICustomizationDiscoveryPage, container, undefined, {
			selectSection() { creationEvents.push('navigate'); }, async createCustomization(section) { creationEvents.push(section); }, selectSectionWithMarketplace() { }, openInstalled(target) { openedInstalled.push(target); }, openMarketplaceItem(resource) { openedDetails.push(resource); }, closeEditor() { creationEvents.push('close'); }, reviewMigrations() { }, prefillChat() { },
		}, 'Copilot'));
		page.rebuildCards(new Set(visibleSections));
		page.layout(new DOM.Dimension(900, 600));
		function getSourceActions() {
			const button = container.querySelector<HTMLElement>('.customization-discovery-source .monaco-button');
			assert.ok(button);
			button.click();
			assert.ok(sourceMenu?.getActions);
			return sourceMenu.getActions();
		}
		return {
			page, container, configuration, requests, marketplaceChanges, entitlement, sentimentChanged, recoveryActions, notifications, prompts, promptHandles, getSourceActions, listService, creationEvents, opened, openedDetails, openedInstalled, deletions, installs, repairs, cancellations, uninstalls, commands, telemetry,
			reportBrowseSectionsProgress: (progress: Parameters<NonNullable<typeof browseSectionsProgress>>[0]) => browseSectionsProgress?.(progress),
			setInstallState: (resource: ICustomizationMarketplaceResource, state: CustomizationMarketplaceInstallState) => {
				const key = getCustomizationMarketplaceResourceKey(resource);
				installStates.set(key, state);
				if (state.kind === 'checking' || state.kind === 'installed' || state.kind === 'missing' || state.kind === 'repairing' || state.kind === 'uninstalling' || state.kind === 'error') {
					recordedResources.set(key, resource);
				} else {
					recordedResources.delete(key);
				}
			},
			notifyInstallChange: () => installChanges.fire(),
			notifyMcpChange: () => mcpChanges.fire(undefined),
			setInstalledSkills: (items: readonly IAICustomizationListItem[]) => installedSkills.set(items, undefined),
			setRepairHandler: (handler: (resource: ICustomizationMarketplaceResource) => Promise<void>) => { onRepair = handler; },
			setRecoveryAction: (action: ICustomizationMarketplaceSourceRecoveryAction) => { recoveryActions.set('other', action); },
			selectAddCustomization: async (id: string) => {
				const button = container.querySelector<HTMLElement>('.customization-discovery-title-row .monaco-button');
				assert.ok(button);
				button.click();
				const action = sourceMenu?.getActions?.().find(action => action.id === `customizationDiscovery.${id}`);
				assert.ok(action);
				await action.run();
				sourceMenu?.onHide?.(false);
				sourceMenu = undefined;
			},
			selectSource: async (id: string | undefined) => {
				const button = container.querySelector<HTMLElement>('.customization-discovery-source .monaco-button');
				assert.ok(button);
				button.click();
				const action = sourceMenu?.getActions?.().find(action => action.id === `customizationDiscovery.source.${id ?? 'all'}`);
				assert.ok(action);
				await action.run();
				sourceMenu?.onHide?.(false);
				sourceMenu = undefined;
			},
			configureMarketplaces: async () => {
				const action = getSourceActions().find(action => action.id === 'customizationDiscovery.source.configure');
				assert.ok(action);
				await action.run();
				sourceMenu?.onHide?.(false);
				sourceMenu = undefined;
			},
		};
	}

	function assertImageReplacesFallback(container: HTMLElement, iconSelector: string): void {
		const icon = container.querySelector<HTMLElement>(iconSelector);
		const image = icon?.querySelector<HTMLImageElement>('img');
		const fallback = icon?.querySelector<HTMLElement>('.codicon');
		assert.ok(icon);
		assert.ok(image);
		assert.ok(fallback);
		Object.defineProperties(image, {
			naturalWidth: { configurable: true, value: 32 },
			naturalHeight: { configurable: true, value: 32 },
		});

		const initial = {
			isFallback: icon.classList.contains('is-fallback'),
			fallbackHidden: mainWindow.getComputedStyle(fallback).display === 'none',
			imagePresent: icon.contains(image),
		};
		image.dispatchEvent(new mainWindow.Event(DOM.EventType.LOAD));
		const loaded = {
			isFallback: icon.classList.contains('is-fallback'),
			fallbackHidden: mainWindow.getComputedStyle(fallback).display === 'none',
			imagePresent: icon.contains(image),
		};
		image.dispatchEvent(new mainWindow.Event(DOM.EventType.ERROR));
		const failed = {
			isFallback: icon.classList.contains('is-fallback'),
			fallbackHidden: mainWindow.getComputedStyle(fallback).display === 'none',
			imagePresent: icon.contains(image),
		};

		assert.deepStrictEqual({ initial, loaded, failed }, {
			initial: { isFallback: false, fallbackHidden: true, imagePresent: true },
			loaded: { isFallback: false, fallbackHidden: true, imagePresent: true },
			failed: { isFallback: true, fallbackHidden: false, imagePresent: false },
		});
	}

	function assertWideImageReplacesFallback(container: HTMLElement, iconSelector: string): void {
		const icon = container.querySelector<HTMLElement>(iconSelector);
		const image = icon?.querySelector<HTMLImageElement>('img');
		const fallback = icon?.querySelector<HTMLElement>('.codicon');
		assert.ok(icon);
		assert.ok(image);
		assert.ok(fallback);
		Object.defineProperties(image, {
			naturalWidth: { configurable: true, value: 384 },
			naturalHeight: { configurable: true, value: 216 },
		});

		image.dispatchEvent(new mainWindow.Event(DOM.EventType.LOAD));

		assert.deepStrictEqual({
			isFallback: icon.classList.contains('is-fallback'),
			fallbackHidden: mainWindow.getComputedStyle(fallback).display === 'none',
			imagePresent: icon.contains(image),
		}, {
			isFallback: false,
			fallbackHidden: true,
			imagePresent: true,
		});
	}

	test('Add Customization action describes the menu trigger', () => {
		const fixture = createPage();
		const button = fixture.container.querySelector<HTMLElement>('.customization-discovery-title-row .monaco-button');
		assert.ok(button);
		assert.deepStrictEqual({
			ariaLabel: button.getAttribute('aria-label'),
			expanded: button.getAttribute('aria-expanded'),
		}, {
			ariaLabel: 'Add a customization',
			expanded: 'false',
		});
	});

	for (const [action, section] of [
		['newAgent', AICustomizationManagementSection.Agents],
		['newSkill', AICustomizationManagementSection.Skills],
		['newInstructions', AICustomizationManagementSection.Instructions],
		['newPrompt', AICustomizationManagementSection.Prompts],
		['addMcp', AICustomizationManagementSection.McpServers],
		['addPlugin', AICustomizationManagementSection.Plugins],
	] as const) {
		test(`Add Customization > ${action} delegates to the section creation flow`, async () => {
			const fixture = createPage(['agentFinder'], [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.Instructions,
				AICustomizationManagementSection.Prompts,
				AICustomizationManagementSection.McpServers,
				AICustomizationManagementSection.Plugins,
			]);
			await fixture.selectAddCustomization(action);
			assert.deepStrictEqual(fixture.creationEvents, [section]);
		});
	}

	test('title and menu buttons use the expected casing', () => {
		const fixture = createPage(['agentFinder'], [AICustomizationManagementSection.Agents]);
		const title = fixture.container.querySelector<HTMLElement>('.customization-discovery-title');
		const addCustomizationButton = fixture.container.querySelector<HTMLElement>('.customization-discovery-title-row .monaco-button');
		const sourceButton = fixture.container.querySelector<HTMLElement>('.customization-discovery-source .monaco-button');

		assert.deepStrictEqual({
			title: title?.textContent,
			buttons: [addCustomizationButton, sourceButton].map(button => ({
				label: button?.textContent,
				small: button?.classList.contains('small'),
				hasChevron: button?.querySelector('.codicon-chevron-down') !== null,
				hasPopup: button?.getAttribute('aria-haspopup'),
			})),
		}, {
			title: 'Browse customizations',
			buttons: [
				{ label: 'Add Customization', small: true, hasChevron: true, hasPopup: 'menu' },
				{ label: 'All Sources', small: true, hasChevron: true, hasPopup: 'menu' },
			],
		});
	});

	test('intro offers one accessible Learn more link to customization documentation', async () => {
		const fixture = createPage();
		const description = fixture.container.querySelector<HTMLElement>('.customization-discovery-description');
		const links = [...description?.querySelectorAll('a') ?? []];
		links[0]?.click();
		await timeout(0);

		assert.deepStrictEqual({
			description: description?.textContent,
			links: links.map(link => ({
				label: link.textContent,
				ariaLabel: link.getAttribute('aria-label'),
				href: link.href,
				tabIndex: link.tabIndex,
			})),
			opened: fixture.opened,
		}, {
			description: 'Tailor your agent to your tools, your team, and your workflow. Learn more',
			links: [{
				label: 'Learn more',
				ariaLabel: 'Learn more about agent customizations',
				href: 'https://aka.ms/vscode-customizations',
				tabIndex: 0,
			}],
			opened: ['https://aka.ms/vscode-customizations'],
		});
	});

	test('search placeholder introduces customization types', () => {
		const fixture = createPage();
		assert.strictEqual(
			fixture.container.querySelector('.customization-discovery-search .suggest-input-placeholder')?.textContent,
			'Search MCP servers, plugins, skills and more...',
		);
	});

	test('announces loading only after the scheduled catalog search starts', async () => {
		const ariaHost = DOM.append(mainWindow.document.body, DOM.$('div'));
		store.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);

		fixture.page.setSearchQuery('remote');
		const pending = {
			requests: fixture.requests.length,
			busy: fixture.container.querySelector('.customization-discovery-results')?.getAttribute('aria-busy'),
			announcements: [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean),
		};

		await timeout(0);
		const loading = {
			requests: fixture.requests.length,
			announcements: [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean),
		};

		await fixture.requests[1].result.complete({ items: [resource('remote')] });
		await timeout(0);
		const complete = [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean);

		assert.deepStrictEqual({ pending, loading, complete }, {
			pending: { requests: 1, busy: 'true', announcements: [] },
			loading: { requests: 2, announcements: ['Loading customizations...'] },
			complete: ['1 customizations found.'],
		});
	});

	test('browse features first-party resources ahead of the source order', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('third-party-one'),
				resource('azure-mcp', { installation: { kind: 'mcp', name: 'com.microsoft/azure', version: '1.0.0' } }),
				resource('third-party-two'),
				resource('github-plugin', { publisher: 'GitHub', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }),
				resource('microsoft-skill', { publisher: 'Microsoft', mediaType: CustomizationMarketplaceMediaType.Skill }),
				resource('fabric-mcp', { installation: { kind: 'mcp', name: 'com.microsoft/microsoft-fabric', version: '1.0.0' } }),
			],
		});
		await timeout(0);

		assert.deepStrictEqual({
			pageSize: fixture.requests[0].options.pageSize,
			featured: Array.from(fixture.container.querySelectorAll('.customization-discovery-section.featured .customization-discovery-card-name')).map(element => element.textContent),
		}, {
			pageSize: 100,
			featured: ['azure-mcp', 'github-plugin', 'fabric-mcp', 'microsoft-skill'],
		});
	});

	test('marks only Copilot Connector search results as verified by GitHub', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('copilot-connector', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'copilot-connector' },
				}),
				resource('public-alternative', {
					installation: { kind: 'mcp', name: 'public/alternative', version: '1.0.0' },
				}),
			],
		});
		await timeout(0);

		const getVerification = (name: string) => {
			const card = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-card')]
				.find(card => card.querySelector('.customization-discovery-card-name')?.textContent === name);
			const verified = card?.querySelector<HTMLElement>('.customization-discovery-verified');
			const visible = verified?.style.display === '';
			return {
				visible,
				label: verified?.getAttribute('aria-label') ?? null,
				icon: !!verified?.querySelector('.codicon-extensions-verified-publisher'),
				afterMetadata: visible && verified.previousElementSibling?.classList.contains('customization-discovery-card-metadata') === true,
			};
		};

		assert.deepStrictEqual({
			connector: getVerification('copilot-connector'),
			alternative: getVerification('public-alternative'),
			accessibility: fixture.page.getAccessibilityContent().includes('Verified by GitHub'),
		}, {
			connector: { visible: false, label: null, icon: false, afterMetadata: false },
			alternative: { visible: false, label: null, icon: false, afterMetadata: false },
			accessibility: false,
		});

		fixture.page.setSearchQuery('connector');
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({
			items: [
				resource('copilot-connector', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'copilot-connector' },
				}),
			],
		});
		await timeout(0);

		const getResultVerification = (name: string) => {
			const row = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-result-content')]
				.find(row => row.querySelector('.customization-discovery-result-name')?.textContent === name);
			const verified = row?.querySelector<HTMLElement>('.customization-discovery-verified');
			const visible = verified?.style.display === '';
			return {
				visible,
				label: verified?.getAttribute('aria-label') ?? null,
				hidden: verified?.getAttribute('aria-hidden') ?? null,
				afterDetail: visible && verified.previousElementSibling?.classList.contains('customization-discovery-result-detail') === true,
			};
		};
		assert.deepStrictEqual({
			connector: getResultVerification('copilot-connector'),
			accessibility: fixture.page.getAccessibilityContent().includes('copilot-connector\nMCP server · Copilot Connectors · Verified by GitHub'),
		}, {
			connector: { visible: true, label: 'Verified by GitHub', hidden: null, afterDetail: true },
			accessibility: true,
		});

		fixture.page.setSearchQuery('public');
		await waitForRequestCount(fixture.requests, 3);
		await fixture.requests[2].result.complete({
			items: [
				resource('public-alternative', {
					installation: { kind: 'mcp', name: 'public/alternative', version: '1.0.0' },
				}),
			],
		});
		await timeout(0);

		assert.deepStrictEqual({
			alternative: getResultVerification('public-alternative'),
			accessibility: fixture.page.getAccessibilityContent().includes('Verified by GitHub'),
		}, {
			alternative: { visible: false, label: null, hidden: 'true', afterDetail: false },
			accessibility: false,
		});
	});

	test('installed item changes keep browse cards and update search results in place', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('remote-mail', { mediaType: CustomizationMarketplaceMediaType.Skill })] });
		await timeout(0);
		const card = fixture.container.querySelector('.customization-discovery-card');
		assert.ok(card);
		const localSkill = (id: string, name: string): IAICustomizationListItem => ({
			id, uri: URI.file(`/workspace/.github/skills/${id}/SKILL.md`), name, filename: 'SKILL.md', description: 'Installed locally', source: 'local', promptType: PromptsType.skill, disabled: false,
		});

		fixture.setInstalledSkills([localSkill('local-skill', 'Local mail skill'), localSkill('other-skill', 'Other mail skill')]);
		fixture.notifyMcpChange();
		const browseCardKeptAfterMcpChange = card.isConnected;
		fixture.page.setSearchQuery('mail');
		await timeout(0);
		fixture.setInstalledSkills([localSkill('local-skill', 'Local mail skill')]);

		assert.deepStrictEqual({
			browseCardKeptAfterMcpChange,
			rows: [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent),
		}, {
			browseCardKeptAfterMcpChange: true,
			rows: ['Local mail skill'],
		});
	});

	test('installation notifications keep browse cards mounted unless a displayed installation changes', async () => {
		const fixture = createPage(['agentFinder']);
		const item = resource('remote-mail', { mediaType: CustomizationMarketplaceMediaType.Skill });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [item] });
		await timeout(0);
		const card = fixture.container.querySelector('.customization-discovery-card');
		const primaryAction = card?.querySelector<HTMLElement>('.customization-discovery-card-primary');
		assert.ok(card && primaryAction);
		primaryAction.focus();

		fixture.notifyInstallChange();
		fixture.setInstallState(resource('unrelated'), { kind: 'installing' });
		fixture.notifyInstallChange();
		fixture.setInstallState(item, { kind: 'available' });
		fixture.notifyInstallChange();
		const unchanged = { mounted: card.isConnected, focused: DOM.getActiveElement() === primaryAction };

		fixture.setInstallState(item, { kind: 'installing' });
		fixture.notifyInstallChange();
		const installingCard = fixture.container.querySelector('.customization-discovery-card');
		fixture.setInstallState(item, { kind: 'installing' });
		fixture.notifyInstallChange();

		assert.deepStrictEqual({
			unchanged,
			oldCardRemoved: !card.isConnected,
			installingCardKept: installingCard?.isConnected,
			installing: installingCard?.querySelector('.monaco-button')?.getAttribute('aria-busy'),
			requests: fixture.requests.length,
		}, {
			unchanged: { mounted: true, focused: true },
			oldCardRemoved: true,
			installingCardKept: true,
			installing: 'true',
			requests: 1,
		});
	});

	for (const targetKind of ['skill', 'plugin'] as const) {
		test(`equivalent ${targetKind} installation target URIs keep browse cards and focus`, async () => {
			const fixture = createPage(['agentFinder']);
			const item = resource('installed-item');
			fixture.setInstallState(item, { kind: 'installed', target: { kind: targetKind, uri: URI.file('/installed/item'), name: 'item' } });
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({ items: [item] });
			await timeout(0);
			const card = fixture.container.querySelector('.customization-discovery-card');
			const primaryAction = card?.querySelector<HTMLElement>('.customization-discovery-card-primary');
			assert.ok(card && primaryAction);
			primaryAction.focus();

			fixture.setInstallState(item, { kind: 'installed', target: { kind: targetKind, uri: URI.file('/installed/item'), name: 'item' } });
			fixture.notifyInstallChange();
			const unchanged = { mounted: card.isConnected, focused: DOM.getActiveElement() === primaryAction };
			fixture.setInstallState(item, { kind: 'installed', target: { kind: targetKind, uri: URI.file('/installed/other'), name: 'item' } });
			fixture.notifyInstallChange();

			assert.deepStrictEqual({ unchanged, changedTargetRerendered: !card.isConnected }, {
				unchanged: { mounted: true, focused: true },
				changedTargetRerendered: true,
			});
		});
	}

	test('equivalent setup URLs keep browse cards while changed URLs update actions', async () => {
		const fixture = createPage(['agentFinder']);
		const item = resource('setup-item');
		fixture.setInstallState(item, { kind: 'unavailable', message: 'Manual setup', setupUrl: URI.parse('https://example.com/setup') });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [item] });
		await timeout(0);
		const card = fixture.container.querySelector('.customization-discovery-card');
		assert.ok(card);
		fixture.setInstallState(item, { kind: 'unavailable', message: 'Manual setup', setupUrl: URI.parse('https://example.com/setup') });
		fixture.notifyInstallChange();
		const unchangedCardKept = card.isConnected;
		fixture.setInstallState(item, { kind: 'unavailable', message: 'Manual setup', setupUrl: URI.parse('https://example.com/other') });
		fixture.notifyInstallChange();
		const setupAction = fixture.container.querySelector<HTMLElement>('.customization-discovery-card-actions .monaco-button');
		assert.ok(setupAction);
		setupAction.click();
		await timeout(0);

		assert.deepStrictEqual({
			unchangedCardKept,
			changedUrlRerendered: !card.isConnected,
			opened: fixture.opened.map(uri => typeof uri === 'string' ? uri : uri.toString()),
		}, {
			unchangedCardKept: true,
			changedUrlRerendered: true,
			opened: ['https://example.com/other'],
		});
	});

	test('curated browse cards track installation changes independently of catalog results', async () => {
		const item = resource('curated-skill', { mediaType: CustomizationMarketplaceMediaType.Skill });
		const fixture = createPage(['agentFinder'], undefined, undefined, undefined, undefined, {
			sourceId: 'agentFinder',
			sections: [{ id: 'featured', title: 'Featured', items: [item] }],
		});
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);
		const card = fixture.container.querySelector('.customization-discovery-card');
		assert.ok(card);
		fixture.notifyInstallChange();
		const unchangedCardKept = card.isConnected;
		fixture.setInstallState(item, { kind: 'installed', target: { kind: 'skill', uri: URI.file('/installed/curated-skill') } });
		fixture.notifyInstallChange();

		assert.deepStrictEqual({
			unchangedCardKept,
			oldCardRemoved: !card.isConnected,
			action: fixture.container.querySelector('.customization-discovery-card-primary')?.getAttribute('aria-label'),
			requests: fixture.requests.length,
		}, {
			unchangedCardKept: true,
			oldCardRemoved: true,
			action: 'Open installed customization curated-skill',
			requests: 1,
		});
	});

	test('browse card images replace fallback icons and restore them on error', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.container.style.position = 'absolute';
		fixture.container.style.top = '100000px';
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('with-icon', { publisher: 'GitHub', icon: testIcon })],
		});
		await timeout(0);

		assertImageReplacesFallback(fixture.container, '.customization-discovery-card-icon');
	});

	test('browse cards retain wide catalog images', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.container.style.position = 'absolute';
		fixture.container.style.top = '100000px';
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('with-wide-icon', { publisher: 'GitHub', icon: testIcon })],
		});
		await timeout(0);

		assertWideImageReplacesFallback(fixture.container, '.customization-discovery-card-icon');
	});

	test('search results render compact star counts with exact accessible labels', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);

		fixture.page.setSearchQuery('server');
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({
			items: [
				resource('popular', { stars: 189_789 }),
				resource('featured', { stars: 33_000 }),
				resource('recent', { stars: 999 }),
				resource('established', { stars: 1_800_000 }),
			],
		});
		await timeout(0);

		assert.deepStrictEqual(
			[...fixture.container.querySelectorAll('.customization-discovery-result-stats')].map(element => ({
				text: element.textContent,
				ariaLabel: element.getAttribute('aria-label'),
			})),
			[
				{ text: '189K', ariaLabel: '189,789 stars' },
				{ text: '33K', ariaLabel: '33,000 stars' },
				{ text: '999', ariaLabel: '999 stars' },
				{ text: '1.8M', ariaLabel: '1,800,000 stars' },
			],
		);
	});

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

	function loadingState(container: HTMLElement) {
		return {
			progress: container.querySelector('.monaco-progress-container')?.classList.contains('active'),
			placeholder: container.querySelector('.customization-discovery-result-content.loading') !== null,
			status: [...container.querySelectorAll('.customization-discovery-state')].map(element => element.textContent),
		};
	}

	for (const query of ['', 'mail', '@type:plugin mail']) {
		test(`initial loading reserves progress space without loading text or placeholders (${query || 'browse'})`, async () => {
			const fixture = createPage();
			fixture.page.setSearchQuery(query);
			fixture.page.setVisible(true);
			const search = fixture.container.querySelector<HTMLElement>('.customization-discovery-search-row')!;
			const progress = fixture.container.querySelector<HTMLElement>('.customization-discovery-progress')!;
			const pendingPosition = { top: search.getBoundingClientRect().top, progressHeight: progress.offsetHeight };
			assert.ok(progress.offsetHeight > 0);
			assert.deepStrictEqual(loadingState(fixture.container), {
				progress: true, placeholder: false, status: ['', ''],
			});
			assert.strictEqual(progress.querySelector('[role="progressbar"]')?.getAttribute('aria-label'), 'Loading customizations');
			assert.ok(fixture.page.getAccessibilityContent().includes('Loading customizations...'));

			await fixture.requests[0].result.complete({
				items: [resource('mail-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
			});
			await timeout(0);
			assert.deepStrictEqual({
				state: loadingState(fixture.container),
				position: { top: search.getBoundingClientRect().top, progressHeight: progress.offsetHeight },
			}, {
				state: { progress: false, placeholder: false, status: ['', ''] },
				position: pendingPosition,
			});
		});
	}

	test('pending query and source changes preserve the progress animation across the full row', async () => {
		const fixture = createPage();
		// Keep the 2% progress bit an integral width: WebKit rounds percentage transform reference boxes.
		fixture.container.querySelector<HTMLElement>('.customization-discovery-header')!.style.width = '800px';
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		const track = fixture.container.querySelector<HTMLElement>('.customization-discovery-progress .monaco-progress-container')!;
		const bit = track.querySelector<HTMLElement>('.progress-bit')!;
		const search = fixture.container.querySelector<HTMLElement>('.customization-discovery-search-row')!;
		assert.deepStrictEqual({ trackWidth: track.getBoundingClientRect().width, searchWidth: search.getBoundingClientRect().width }, { trackWidth: 800, searchWidth: 800 });
		const animation = bit.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 1200;
		const before = bit.getBoundingClientRect().left;

		fixture.page.setSearchQuery('@type:plugin fresh');
		await waitForRequestCount(fixture.requests, 2);
		await fixture.selectSource('other');
		assert.deepStrictEqual({
			sameAnimation: bit.getAnimations()[0] === animation,
			time: animation.currentTime,
			left: bit.getBoundingClientRect().left,
		}, { sameAnimation: true, time: 1200, left: before });

		animation.currentTime = 3999;
		const bitBounds = bit.getBoundingClientRect();
		const trackBounds = track.getBoundingClientRect();
		assert.ok(Math.abs(bitBounds.right - trackBounds.right) <= 1, `The moving bar must reach the right edge before looping: bit=${bitBounds.right}, track=${trackBounds.right}.`);
		await fixture.requests[2].result.complete({ items: [] });
		await timeout(0);
		assert.deepStrictEqual(loadingState(fixture.container).progress, false);
	});

	test('continuation preserves loaded rows, focus, scroll position and viewport geometry', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin mail');
		fixture.page.setVisible(true);
		const cursor = { token: 'next-page' };
		await fixture.requests[0].result.complete({
			items: Array.from({ length: 24 }, (_, index) => resource(`mail-${index}`, { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })),
			nextCursor: cursor,
		});
		await timeout(0);
		const listElement = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .monaco-list')!;
		listElement.focus();
		listElement.dispatchEvent(new FocusEvent('focus'));
		const list = fixture.listService.lastFocusedList;
		assert.ok(list instanceof WorkbenchList);
		list.scrollTop = list.scrollHeight;
		list.setFocus([23]);
		list.setSelection([23]);
		const search = fixture.container.querySelector<HTMLElement>('.customization-discovery-search-row')!;
		const lastRow = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-result-content')]
			.find(row => row.querySelector('.customization-discovery-result-name')?.textContent === 'mail-23')!;
		assert.ok(lastRow.offsetHeight > 0);
		const position = () => ({
			searchTop: search.getBoundingClientRect().top,
			rowTop: lastRow.getBoundingClientRect().top,
			scrollTop: list.scrollTop,
			viewportHeight: list.renderHeight,
			focus: list.getFocus(),
			selection: list.getSelection(),
		});
		const before = position();
		await waitForRequestCount(fixture.requests, 2);
		assert.deepStrictEqual({
			position: position(),
			rowRetained: lastRow.isConnected,
			length: list.length,
			progress: loadingState(fixture.container).progress,
			status: loadingState(fixture.container).status,
		}, {
			position: before, rowRetained: true, length: 25, progress: false, status: ['', ''],
		});
		list.reveal(24);
		const placeholder = fixture.container.querySelector<HTMLElement>('.customization-discovery-result-content.loading')!;
		assert.ok(placeholder.inert);
		placeholder.querySelector<HTMLButtonElement>('button')!.click();
		const spinner = placeholder.querySelector<HTMLElement>('.customization-discovery-result-loading')!;
		assert.deepStrictEqual({
			openedDetails: fixture.openedDetails,
			spinnerDisplay: DOM.getWindow(spinner).getComputedStyle(spinner).display,
			spinnerAriaHidden: spinner.getAttribute('aria-hidden'),
		}, {
			openedDetails: [],
			spinnerDisplay: 'grid',
			spinnerAriaHidden: 'true',
		});
		const pending = position();
		await fixture.requests[1].result.complete({
			items: [resource('mail-24', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			position: position(),
			rowRetained: lastRow.isConnected,
			length: list.length,
			state: loadingState(fixture.container),
			busy: fixture.container.querySelector('.customization-discovery-results')?.getAttribute('aria-busy'),
			visibleSpinners: [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-result-loading')]
				.filter(spinner => DOM.getWindow(spinner).getComputedStyle(spinner).display !== 'none').length,
		}, {
			position: pending, rowRetained: true, length: 25,
			state: { progress: false, placeholder: false, status: ['', ''] },
			busy: 'false',
			visibleSpinners: 0,
		});
	});

	test('hiding an initial request stops the progress bar and ignores its result', async () => {
		const fixture = createPage();
		fixture.page.setVisible(true);
		const request = fixture.requests[0];
		fixture.page.setVisible(false);
		await request.result.complete({ items: [resource('stale')] });
		await timeout(0);
		assert.deepStrictEqual({
			cancelled: request.token.isCancellationRequested,
			progress: loadingState(fixture.container).progress,
			placeholder: loadingState(fixture.container).placeholder,
			stale: fixture.page.getAccessibilityContent().includes('stale'),
		}, { cancelled: true, progress: false, placeholder: false, stale: false });
	});

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

	test('canvas search uses plugin pages and filters explicit compatibility tags', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:canvas');
		fixture.page.setVisible(true);
		const cursor = { token: 'canvas-next-page' };
		await fixture.requests[0].result.complete({
			items: [
				resource('category-only-canvas', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					tags: ['canvas'],
				}),
			],
		});
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({
			items: [
				resource('first-page-canvas', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas'],
					installCount: 5,
				}),
				resource('missing-count', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas'],
				}),
				resource('description-only-canvas', {
					description: 'A canvas workflow without compatibility metadata',
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
				}),
			],
			nextCursor: cursor,
		});
		await waitForRequestCount(fixture.requests, 3);
		await fixture.requests[2].result.complete({
			items: [
				resource('canvas-plugin', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas'],
					installCount: 12,
				}),
				resource('canvas-only-plugin', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas-only'],
					installCount: 5,
				}),
				resource('zero-count', {
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas'],
					installCount: 0,
				}),
			],
		});
		await timeout(0);
		const content = fixture.page.getAccessibilityContent();
		const lines = content.split('\n');
		const positions = ['canvas-plugin', 'first-page-canvas', 'canvas-only-plugin', 'missing-count', 'zero-count'].map(name => content.indexOf(name));

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			canvas: lines.includes('canvas-plugin'),
			canvasOnly: lines.includes('canvas-only-plugin'),
			firstPageCanvas: lines.includes('first-page-canvas'),
			descriptionOnly: lines.includes('description-only-canvas'),
			categoryOnly: lines.includes('category-only-canvas'),
			positions,
			ariaLabel: fixture.container.querySelector('.customization-discovery-results .monaco-list')?.getAttribute('aria-label'),
		}, {
			requests: [
				{ query: undefined, mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, sourceIds: undefined, pageSize: 50, cursor: undefined },
				{ query: 'canvas', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], pageSize: 50, cursor: undefined },
				{ query: 'canvas', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], pageSize: 50, cursor },
			],
			canvas: true,
			canvasOnly: true,
			firstPageCanvas: true,
			descriptionOnly: false,
			categoryOnly: false,
			positions: [...positions].sort((first, second) => first - second),
			ariaLabel: 'Canvas extension search results',
		});
	});

	test('canvas text search preserves user text and requests only plugins', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('diagram @type:canvas');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('diagram-semantic-first', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, compatibilityTags: ['canvas'], installCount: 1 }),
				resource('diagram-popular-second', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, compatibilityTags: ['canvas'], installCount: 100 }),
				resource('diagram-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }),
			],
		});
		await timeout(0);
		const content = fixture.page.getAccessibilityContent();

		assert.deepStrictEqual({
			request: fixture.requests[0].options,
			semanticOrder: content.indexOf('diagram-semantic-first') < content.indexOf('diagram-popular-second'),
			ordinary: content.includes('diagram-plugin'),
		}, {
			request: { query: 'diagram', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, sourceIds: undefined, pageSize: 24, cursor: undefined },
			semanticOrder: true,
			ordinary: false,
		});
	});

	test('combining Canvas with another type preserves the other type query and results', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:mcp @type:canvas');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('mail-mcp')],
		});
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({
			items: [resource('canvas-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, compatibilityTags: ['canvas'] })],
		});
		await timeout(0);
		const content = fixture.page.getAccessibilityContent();

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			mcp: content.includes('mail-mcp'),
			canvas: content.includes('canvas-plugin'),
			ariaLabel: fixture.container.querySelector('.customization-discovery-results .monaco-list')?.getAttribute('aria-label'),
		}, {
			requests: [
				{ query: undefined, mediaType: undefined, sourceIds: undefined, pageSize: 24, cursor: undefined },
				{ query: 'canvas', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id], pageSize: 50, cursor: undefined },
			],
			mcp: true,
			canvas: true,
			ariaLabel: 'Customization search results',
		});
	});

	test('source-specific canvas-compatible plugins appear under Plugins and Canvases without the GitHub Feed fallback', async () => {
		const fixture = createPage([configuredMarketplaceSourceId]);
		fixture.page.showMarketplace('@type:plugin', configuredMarketplaceSourceId);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('configured-canvas', {
					sourceId: configuredMarketplaceSourceId,
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas-only'],
				}),
			],
		});
		await timeout(0);
		const pluginResults = [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent);

		fixture.page.setSearchQuery('@type:canvas');
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({
			items: [
				resource('configured-canvas', {
					sourceId: configuredMarketplaceSourceId,
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					compatibilityTags: ['canvas-only'],
				}),
			],
		});
		await timeout(0);
		const canvasResults = [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent);

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options),
			pluginResults,
			canvasResults,
		}, {
			requests: [
				{
					query: undefined,
					mediaType: undefined,
					sourceIds: [configuredMarketplaceSourceId],
					pageSize: 24,
					cursor: undefined,
				},
				{
					query: undefined,
					mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
					sourceIds: [configuredMarketplaceSourceId],
					pageSize: 50,
					cursor: undefined,
				},
			],
			pluginResults: ['configured-canvas'],
			canvasResults: ['configured-canvas'],
		});
	});

	test('plugin search includes ordinary, canvas-capable, and canvas-only plugins', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@type:plugin');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('ordinary-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }),
				resource('canvas-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, compatibilityTags: ['canvas'] }),
				resource('canvas-only-plugin', { mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, compatibilityTags: ['canvas-only'] }),
			],
		});
		await timeout(0);
		const content = fixture.page.getAccessibilityContent();

		assert.deepStrictEqual({
			ordinary: content.includes('ordinary-plugin'),
			canvas: content.includes('canvas-plugin'),
			canvasOnly: content.includes('canvas-only-plugin'),
		}, {
			ordinary: true,
			canvas: true,
			canvasOnly: true,
		});
	});

	test('installed plugin and Canvas filters overlap without duplicate rows', async () => {
		const plugin = resource('canvas-only-plugin', {
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			compatibilityTags: ['canvas', 'canvas-only'],
		});
		const fixture = createPage(
			undefined,
			[AICustomizationManagementSection.Plugins],
			[],
			undefined,
			[],
			undefined,
			{},
			[{
				uri: URI.file('/provider/canvas-only-plugin'),
				type: 'plugin',
				name: 'canvas-only-plugin',
				description: 'Canvas only',
				source: 'plugin',
				extensionId: undefined,
				pluginUri: undefined,
			}, {
				uri: URI.file('/provider/ordinary-plugin'),
				type: 'plugin',
				name: 'ordinary-plugin',
				description: 'Ordinary plugin',
				source: 'plugin',
				extensionId: undefined,
				pluginUri: undefined,
			}],
		);
		fixture.setInstallState(plugin, { kind: 'installed', target: { kind: 'plugin', name: 'canvas-only-plugin' } });
		fixture.notifyInstallChange();
		fixture.page.setVisible(true);

		const getRows = () => [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent).sort();
		fixture.page.setSearchQuery('@installed');
		await timeout(0);
		const allResults = getRows();

		fixture.page.setSearchQuery('@installed @type:plugin');
		await timeout(0);
		const pluginResults = getRows();

		fixture.page.setSearchQuery('@installed @type:canvas');
		await timeout(0);
		const canvasResults = getRows();

		fixture.page.setSearchQuery('@installed @type:plugin @type:canvas');
		await timeout(0);
		const combinedResults = getRows();

		assert.deepStrictEqual({
			allResults,
			pluginResults,
			canvasResults,
			combinedResults,
		}, {
			allResults: ['canvas-only-plugin', 'ordinary-plugin'],
			pluginResults: ['canvas-only-plugin', 'ordinary-plugin'],
			canvasResults: ['canvas-only-plugin'],
			combinedResults: ['canvas-only-plugin', 'ordinary-plugin'],
		});
	});

	test('does not associate a URI-backed local plugin with a name-only provider installation', async () => {
		const plugin = resource('shared-name', {
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			compatibilityTags: ['canvas', 'canvas-only'],
		});
		const localPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/local/shared-name');
			override readonly label = 'shared-name';
		}();
		const fixture = createPage(undefined, [AICustomizationManagementSection.Plugins], [localPlugin]);
		fixture.setInstallState(plugin, { kind: 'installed', target: { kind: 'plugin', name: 'shared-name' } });
		fixture.notifyInstallChange();
		fixture.page.setSearchQuery('@installed @type:plugin');
		fixture.page.setVisible(true);
		await timeout(0);

		assert.strictEqual(fixture.page.getAccessibilityContent().includes('shared-name'), true);
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
		const bit = fixture.container.querySelector<HTMLElement>('.customization-discovery-progress .progress-bit')!;
		const animation = bit.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 1200;
		for (let index = 0; index < 8; index++) {
			await fixture.requests[index].result.complete({
				items: [resource(`mail-skill-${index}`, { mediaType: CustomizationMarketplaceMediaType.Skill })],
				nextCursor: { token: `page-${index + 1}` },
			});
			await timeout(0);
		}
		await waitForRequestCount(fixture.requests, 9);
		assert.deepStrictEqual({
			sameAnimation: bit.getAnimations()[0] === animation,
			time: animation.currentTime,
		}, { sameAnimation: true, time: 1200 });
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
			loading: loadingState(fixture.container),
		}, {
			requests: 2,
			cursor,
			busy: 'true',
			loading: { progress: false, placeholder: true, status: ['', ''] },
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
		assert.deepStrictEqual({
			progress: loadingState(fixture.container).progress,
			placeholder: loadingState(fixture.container).placeholder,
		}, { progress: false, placeholder: false });
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

	test('groups a linked MCP search result under a promoted Copilot connector alias', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setSearchQuery('atlassian');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('atlassian-public-first'),
				resource('atlassian-mcp', { connectorIds: ['githubcopilotatlassian'] }),
				resource('atlassian-public-last'),
				resource('atlassian-connector', {
					sourceId: 'copilotConnectors',
					connectorIds: ['atlassian-rovo', 'GitHubCopilotAtlassian'],
					installation: { kind: 'copilotConnector', name: 'atlassian-rovo' },
				}),
			],
		});
		await timeout(0);

		const connectedRows = [...fixture.container.querySelectorAll('.customization-discovery-result-content.linked-connector, .customization-discovery-result-content.linked-alternative')];
		const disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.ok(disclosure);
		const collapsed = {
			order: fixture.page.getAccessibilityContent().match(/^atlassian-(?:public-(?:first|last)|connector|mcp)$/gm),
			expanded: disclosure.getAttribute('aria-expanded'),
			label: disclosure.textContent,
			hasChevron: disclosure.querySelector('.codicon-chevron-right-compact') !== null,
			connectedRows: connectedRows.map(row => row.textContent),
		};
		disclosure.click();
		await timeout(0);
		const expandedDisclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.deepStrictEqual({
			collapsed,
			expandedOrder: fixture.page.getAccessibilityContent().match(/^atlassian-(?:public-(?:first|last)|connector|mcp)$/gm),
			expanded: expandedDisclosure?.getAttribute('aria-expanded'),
			expandedLabel: expandedDisclosure?.textContent,
			hasExpandedChevron: expandedDisclosure?.querySelector('.codicon-chevron-down-compact') !== null,
			expandedAlternativeContent: fixture.container.querySelector('.customization-discovery-result-content.linked-alternative')?.textContent,
		}, {
			collapsed: {
				order: ['atlassian-connector', 'atlassian-public-first', 'atlassian-public-last'],
				expanded: 'false',
				label: '1 alternative customization',
				hasChevron: true,
				connectedRows: [
					'atlassian-connectorMCP server · Copilot ConnectorsConnect',
					'1 alternative customizationatlassian-mcpMCP server · GitHub FeedInstall',
				],
			},
			expandedOrder: ['atlassian-connector', 'atlassian-mcp', 'atlassian-public-first', 'atlassian-public-last'],
			expanded: 'true',
			expandedLabel: '1 alternative customization',
			hasExpandedChevron: true,
			expandedAlternativeContent: '1 alternative customizationatlassian-mcpMCP server · GitHub FeedInstall',
		});
	});

	test('orders linked groups by their primary connectors without grouping connector self aliases', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setSearchQuery('connector');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('connector-self', {
					sourceId: 'copilotConnectors',
					connectorIds: ['connector-self'],
					installation: { kind: 'copilotConnector', name: 'connector-self' },
				}),
				resource('connector-a', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'connector-a' },
				}),
				resource('connector-b', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'connector-b' },
				}),
				resource('connector-mcp-b', { connectorIds: ['connector-b'] }),
				resource('connector-mcp-a', { connectorIds: ['connector-a'] }),
			],
		});
		await timeout(0);

		while (true) {
			const disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label[aria-expanded="false"]');
			if (!disclosure) {
				break;
			}
			disclosure.click();
			await timeout(0);
		}
		assert.deepStrictEqual(
			fixture.page.getAccessibilityContent().match(/^connector-(?:self|a|b|mcp-[ab])$/gm),
			['connector-self', 'connector-a', 'connector-mcp-a', 'connector-b', 'connector-mcp-b']
		);
	});

	test('toggles linked alternatives with activation keys and restores disclosure focus', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setSearchQuery('atlassian');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('atlassian-mcp', { connectorIds: ['atlassian'] }),
				resource('atlassian-connector', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'atlassian' },
				}),
			],
		});
		await timeout(0);

		let disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.ok(disclosure);
		disclosure.focus();
		const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
		disclosure.dispatchEvent(enterEvent);
		await timeout(0);
		disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.deepStrictEqual({
			enterPrevented: enterEvent.defaultPrevented,
			expanded: disclosure?.getAttribute('aria-expanded'),
			focusRestored: mainWindow.document.activeElement === disclosure,
		}, {
			enterPrevented: true,
			expanded: 'true',
			focusRestored: true,
		});

		const spaceEvent = new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true });
		disclosure?.dispatchEvent(spaceEvent);
		await timeout(0);
		disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.deepStrictEqual({
			spacePrevented: spaceEvent.defaultPrevented,
			expanded: disclosure?.getAttribute('aria-expanded'),
			focusRestored: mainWindow.document.activeElement === disclosure,
		}, {
			spacePrevented: true,
			expanded: 'false',
			focusRestored: true,
		});

		disclosure?.closest('.monaco-list-row')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		await timeout(0);
		disclosure = fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label');
		assert.deepStrictEqual({
			expanded: disclosure?.getAttribute('aria-expanded'),
			openedDetails: fixture.openedDetails.map(resource => resource.identifier),
			focusRestored: mainWindow.document.activeElement === disclosure,
		}, {
			expanded: 'true',
			openedDetails: [],
			focusRestored: true,
		});
	});

	test('keeps linked search rows adjacent across mixed installation states', async () => {
		const connector = resource('mixed-connector', {
			sourceId: 'copilotConnectors',
			installation: { kind: 'copilotConnector', name: 'mixed' },
		});
		const alternative = resource('mixed-mcp', { connectorIds: ['mixed'] });
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.setInstallState(alternative, { kind: 'installed', target: { kind: 'mcp', id: 'mixed' } });
		fixture.notifyInstallChange();
		fixture.page.setSearchQuery('mixed');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [alternative, connector] });
		await timeout(0);

		const rows = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-result-content.linked-connector, .customization-discovery-result-content.linked-alternative')];
		assert.deepStrictEqual(rows.map(row => ({
			name: row.querySelector('.customization-discovery-result-name')?.textContent,
			kind: row.classList.contains('linked-connector') ? 'connector' : 'alternative',
		})), [
			{ name: 'mixed-connector', kind: 'connector' },
			{ name: 'mixed-mcp', kind: 'alternative' },
		]);
	});

	test('groups linked alternatives in empty-query Browse cards', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('browse-mcp', { connectorIds: ['browse'] }),
				resource('browse-connector', {
					sourceId: 'copilotConnectors',
					installation: { kind: 'copilotConnector', name: 'browse' },
				}),
			],
		});
		await timeout(0);

		const group = fixture.container.querySelector<HTMLElement>('.customization-discovery-card-group');
		assert.ok(group);
		let disclosure = group.querySelector<HTMLButtonElement>('.customization-discovery-card-linked-label');
		assert.ok(disclosure);
		assert.deepStrictEqual({
			cards: [...group.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
			expanded: disclosure.getAttribute('aria-expanded'),
		}, {
			cards: ['browse-connector'],
			expanded: 'false',
		});
		disclosure.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);
		disclosure = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-linked-label');
		assert.deepStrictEqual({
			cards: [...fixture.container.querySelectorAll('.customization-discovery-card-group .customization-discovery-card-name')].map(element => element.textContent),
			expanded: disclosure?.getAttribute('aria-expanded'),
			focusRestored: mainWindow.document.activeElement === disclosure,
		}, {
			cards: ['browse-connector', 'browse-mcp'],
			expanded: 'true',
			focusRestored: true,
		});
	});

	test('does not repeat a collapsed installed alternative in accessible content', async () => {
		const connector = resource('accessible-connector', {
			sourceId: 'copilotConnectors',
			installation: { kind: 'copilotConnector', name: 'accessible' },
		});
		const alternative = resource('accessible-mcp', { connectorIds: ['accessible'] });
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.setInstallState(alternative, { kind: 'installed', target: { kind: 'skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md') } });
		fixture.notifyInstallChange();
		fixture.page.setSearchQuery('accessible');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [alternative, connector] });
		await timeout(0);

		const content = fixture.page.getAccessibilityContent();
		assert.deepStrictEqual({
			connector: content.match(/^accessible-connector$/gm),
			alternative: content.match(/^accessible-mcp$/gm),
			installedFallback: content.match(/^Local mail skill$/gm),
			disclosure: content.match(/^1 alternative customization$/gm),
		}, {
			connector: ['accessible-connector'],
			alternative: null,
			installedFallback: null,
			disclosure: ['1 alternative customization'],
		});
	});

	test('prioritizes connectors, GitHub Feed MCP and plugins, GitHub Feed skills, then other sources', async () => {
		const fixture = createPage(
			['agentFinder', 'copilotConnectors', 'other', configuredMarketplaceSource.id],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers, AICustomizationManagementSection.Plugins]
		);
		fixture.page.setSearchQuery('marketplace');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [
				resource('other-mcp', { sourceId: 'other', displayName: 'Marketplace Other MCP', mediaType: CustomizationMarketplaceMediaType.McpServer, score: 100 }),
				resource('feed-skill', { displayName: 'Marketplace Feed Skill', mediaType: CustomizationMarketplaceMediaType.Skill, score: 100 }),
				resource('feed-plugin', { displayName: 'Marketplace Feed Plugin', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, score: 10 }),
				resource('linked-mcp', { displayName: 'Marketplace Linked MCP', connectorIds: ['connector-linked'], score: 5 }),
				resource('connector-linked', {
					sourceId: 'copilotConnectors',
					displayName: 'Marketplace Linked Connector',
					score: 0,
					installation: { kind: 'copilotConnector', name: 'connector-linked' },
				}),
				resource('feed-mcp', { displayName: 'Marketplace Feed MCP', score: 1 }),
				resource('other-plugin', { sourceId: configuredMarketplaceSource.id, displayName: 'Marketplace Other Plugin', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, score: 100 }),
			],
		});
		await timeout(0);
		fixture.container.querySelector<HTMLButtonElement>('.linked-alternative .customization-discovery-result-linked-label')?.click();
		await timeout(0);

		assert.deepStrictEqual(
			fixture.page.getAccessibilityContent().match(/^Marketplace (?:Linked Connector|Linked MCP|Feed Plugin|Feed MCP|Feed Skill|Other MCP|Other Plugin)$/gm),
			['Marketplace Linked Connector', 'Marketplace Linked MCP', 'Marketplace Feed Plugin', 'Marketplace Feed MCP', 'Marketplace Feed Skill', 'Marketplace Other MCP', 'Marketplace Other Plugin']
		);
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
		assert.deepStrictEqual(loadingState(fixture.container), { progress: false, placeholder: false, status: ['', ''] });
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

	test('available browse cards open in-product details without external title links', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		const item = resource('review-skill', {
			mediaType: CustomizationMarketplaceMediaType.Skill,
			url: URI.parse('https://example.com/review-skill'),
		});
		await fixture.requests[0].result.complete({ items: [item] });
		await timeout(0);
		const card = fixture.container.querySelector<HTMLElement>('.customization-discovery-card');
		const primaryAction = card?.querySelector<HTMLButtonElement>('.customization-discovery-card-primary');
		assert.ok(primaryAction);
		primaryAction.click();
		assert.deepStrictEqual({
			titleLinks: card?.querySelectorAll('.customization-discovery-card-name[href]').length,
			openedDetails: fixture.openedDetails.map(resource => resource.identifier),
			openedExternal: fixture.opened,
		}, {
			titleLinks: 0,
			openedDetails: ['review-skill'],
			openedExternal: [],
		});
	});

	test('attributes installs to curated, fallback, and search discovery', async () => {
		const fallback = createPage(['agentFinder']);
		fallback.page.setVisible(true);
		await fallback.requests[0].result.complete({ items: [resource('fallback-skill')] });
		await timeout(0);
		fallback.container.querySelector<HTMLButtonElement>('.customization-discovery-card-actions .monaco-button')!.click();
		await timeout(0);

		const curated = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			{
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				sections: [{ id: 'featured', title: 'Featured', items: [resource('curated-skill')] }],
			},
		);
		curated.page.setVisible(true);
		await curated.requests[0].result.complete({ items: [] });
		await timeout(0);
		curated.container.querySelector<HTMLButtonElement>('.customization-discovery-card-actions .monaco-button')!.click();
		await timeout(0);

		const search = createPage(['agentFinder']);
		search.page.setVisible(true);
		await search.requests[0].result.complete({ items: [] });
		search.page.setSearchQuery('mail');
		await waitForRequestCount(search.requests, 2);
		await search.requests[1].result.complete({ items: [resource('mail-skill')] });
		await timeout(0);
		const searchRow = [...search.container.querySelectorAll<HTMLElement>('.customization-discovery-results .monaco-list-row')]
			.find(row => row.querySelector('.customization-discovery-result-name')?.textContent === 'mail-skill');
		const searchInstall = searchRow?.querySelector<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button');
		assert.ok(searchInstall);
		assert.deepStrictEqual({
			label: searchInstall.textContent,
			disabled: searchInstall.getAttribute('aria-disabled'),
		}, {
			label: 'Install',
			disabled: 'false',
		});
		searchInstall.click();
		await timeout(0);

		assert.deepStrictEqual([
			...fallback.installs,
			...curated.installs,
			...search.installs,
		].map(install => ({ identifier: install.identifier, origin: install.origin })), [{
			identifier: 'fallback-skill',
			origin: 'browseFallback',
		}, {
			identifier: 'curated-skill',
			origin: 'curatedSection',
		}, {
			identifier: 'mail-skill',
			origin: 'search',
		}]);

		await Promise.all([
			fallback.installs[0].result.complete(),
			curated.installs[0].result.complete(),
			search.installs[0].result.complete(),
		]);
	});

	test('installed browse cards open the installed customization list', async () => {
		const candidate = resource('installed-skill', {
			displayName: 'Security skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
		});
		const skillUri = URI.file('/workspace/.github/skills/security/SKILL.md');
		const fixture = createPage(['agentFinder']);
		fixture.setInstallState(candidate, { kind: 'installed', target: { kind: 'skill', uri: skillUri } });
		fixture.notifyInstallChange();
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const primaryAction = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-primary');
		assert.ok(primaryAction);
		primaryAction.click();
		assert.deepStrictEqual({
			ariaLabel: primaryAction.getAttribute('aria-label'),
			marketplace: fixture.openedDetails,
			installed: fixture.openedInstalled,
		}, {
			ariaLabel: 'Open installed customization Security skill',
			marketplace: [],
			installed: [{
				section: AICustomizationManagementSection.Skills,
				name: 'Security skill',
				uri: skillUri,
				mcpServerId: undefined,
				mcpConnectorName: undefined,
			}],
		});
	});

	test('installed browse cards can uninstall without opening details', async () => {
		const candidate = resource('installed-mcp', {
			displayName: 'Azure AI Foundry',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
		});
		const fixture = createPage(['agentFinder']);
		fixture.setInstallState(candidate, { kind: 'installed', target: { kind: 'mcp', id: 'azure-ai-foundry' } });
		fixture.notifyInstallChange();
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const action = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-actions .monaco-button');
		assert.ok(action);
		const before = {
			label: action.textContent,
			disabled: action.getAttribute('aria-disabled'),
			ariaLabel: action.getAttribute('aria-label'),
		};
		action.click();
		await timeout(0);

		assert.deepStrictEqual({
			before,
			uninstalls: fixture.uninstalls,
			openedDetails: fixture.openedDetails,
			actionAfter: fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-actions .monaco-button')?.textContent,
		}, {
			before: {
				label: 'Uninstall',
				disabled: 'false',
				ariaLabel: 'Uninstall Azure AI Foundry',
			},
			uninstalls: ['installed-mcp'],
			openedDetails: [],
			actionAfter: 'Install',
		});
	});

	test('installed Connector browse cards preserve the Connector identity', async () => {
		const candidate = resource('mail', {
			sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
			displayName: 'Mail',
			installation: { kind: 'copilotConnector', name: 'mail' },
		});
		const fixture = createPage([CustomizationMarketplaceSources.CopilotConnectors.id]);
		fixture.setInstallState(candidate, { kind: 'installed', target: { kind: 'copilotConnector', name: 'mail' } });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const primaryAction = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-primary');
		assert.ok(primaryAction);
		primaryAction.click();

		assert.deepStrictEqual(fixture.openedInstalled, [{
			section: AICustomizationManagementSection.McpServers,
			name: 'Mail',
			uri: undefined,
			mcpServerId: undefined,
			mcpConnectorName: 'mail',
		}]);
	});

	test('recorded missing browse cards open details instead of an installed list', async () => {
		const candidate = resource('missing-skill', {
			displayName: 'Missing skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
		});
		const fixture = createPage(['agentFinder']);
		fixture.setInstallState(candidate, { kind: 'missing', target: { kind: 'skill', uri: URI.file('/workspace/.github/skills/missing/SKILL.md') } });
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const primaryAction = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-card-primary');
		assert.ok(primaryAction);
		primaryAction.click();

		assert.deepStrictEqual({
			ariaLabel: primaryAction.getAttribute('aria-label'),
			openedDetails: fixture.openedDetails.map(resource => resource.identifier),
			openedInstalled: fixture.openedInstalled,
		}, {
			ariaLabel: 'View details for Missing skill',
			openedDetails: ['missing-skill'],
			openedInstalled: [],
		});
	});

	test('available search rows open details while setup actions stay isolated', async () => {
		const setupUrl = URI.parse('https://example.com/setup');
		const fixture = createPage(['agentFinder'], undefined, undefined, setupUrl);
		fixture.page.setSearchQuery('@type:mcp unity');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('unity', { url: URI.parse('https://example.com/unity') })] });
		await timeout(0);
		const row = fixture.container.querySelector<HTMLElement>('.customization-discovery-result-row');
		const primaryAction = row?.querySelector<HTMLButtonElement>('.customization-discovery-result-primary');
		const setup = row?.querySelector<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button');
		assert.ok(primaryAction);
		assert.ok(setup);
		setup.click();
		primaryAction.click();
		await timeout(0);
		assert.deepStrictEqual({
			titleLinks: row?.querySelectorAll('.customization-discovery-result-name[href]').length,
			openedDetails: fixture.openedDetails.map(resource => resource.identifier),
			openedExternal: fixture.opened,
		}, {
			titleLinks: 0,
			openedDetails: ['unity'],
			openedExternal: [setupUrl],
		});
	});

	test('search result images replace fallback icons and restore them on error', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.container.style.position = 'absolute';
		fixture.container.style.top = '100000px';
		fixture.page.setSearchQuery('icon');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('with-icon', { icon: testIcon })],
		});
		await timeout(0);

		assertImageReplacesFallback(fixture.container, '.customization-discovery-result-icon');
	});

	test('catalog-backed installed skills open their installed customization list', async () => {
		const candidate = resource('installed-skill', { displayName: 'Local mail skill', mediaType: CustomizationMarketplaceMediaType.Skill });
		const fixture = createPage(['agentFinder']);
		fixture.setInstallState(candidate, { kind: 'installed', target: { kind: 'skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md') } });
		fixture.notifyInstallChange();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const primaryAction = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-result-primary')]
			.find(element => element.getAttribute('aria-label') === 'Open installed customization Local mail skill');
		assert.ok(primaryAction);
		primaryAction.click();
		await timeout(0);
		assert.deepStrictEqual({
			rows: [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent),
			accessibleNames: fixture.page.getAccessibilityContent().split('\n').filter(line => line === 'Local mail skill'),
			marketplace: fixture.openedDetails,
			installed: fixture.openedInstalled.map(target => ({
				section: target.section,
				name: target.name,
				uri: target.uri?.toString(),
			})),
		}, {
			rows: ['Local mail skill'],
			accessibleNames: ['Local mail skill'],
			marketplace: [],
			installed: [{
				section: AICustomizationManagementSection.Skills,
				name: 'Local mail skill',
				uri: 'file:///workspace/.github/skills/mail/SKILL.md',
			}],
		});
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

	test('direct installed uninstall that leaves the item installed restores its uninstall action', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('@installed mail');
		fixture.page.setVisible(true);
		const uninstallButton = () => fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-results .monaco-list-row .monaco-button');
		uninstallButton()!.click();
		// The user cancels the confirmation, so the item remains installed.
		await fixture.deletions[0].complete();
		await timeout(0);

		assert.deepStrictEqual({ label: uninstallButton()?.textContent, disabled: uninstallButton()?.getAttribute('aria-disabled') }, { label: 'Uninstall', disabled: 'false' });
	});

	test('keeps an available marketplace resource separate from a same-name local item', async () => {
		const candidate = resource('marketplace-mail', {
			displayName: 'Local mail skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			installation: { kind: 'skill', repository: 'owner/catalog', ref: 'v1', path: 'skills/mail' },
		});
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		assert.deepStrictEqual({
			rows: [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent),
			actions: [...fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button')].map(element => element.textContent),
		}, {
			rows: ['Local mail skill', 'Local mail skill'],
			actions: ['Uninstall', 'Install'],
		});
	});

	test('shows and repairs a recorded installation whose exact target is missing', async () => {
		const candidate = resource('repair-mail', {
			displayName: 'Repair mail skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			installation: { kind: 'skill', repository: 'owner/catalog', ref: 'v1', path: 'skills/repair-mail' },
		});
		const fixture = createPage();
		fixture.setInstallState(candidate, { kind: 'missing', target: { kind: 'skill', uri: URI.file('/workspace/.github/skills/repair-mail/SKILL.md') } });
		fixture.page.setSearchQuery('repair mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const before = {
			detail: fixture.container.querySelector('.customization-discovery-result-detail')?.textContent,
			actions: [...fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button')].map(element => element.textContent),
		};
		const primaryAction = fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-result-primary');
		assert.ok(primaryAction);
		primaryAction.click();
		const navigation = {
			ariaLabel: primaryAction.getAttribute('aria-label'),
			openedDetails: fixture.openedDetails.map(resource => resource.identifier),
			openedInstalled: [...fixture.openedInstalled],
		};
		const repair = [...fixture.container.querySelectorAll<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button')].find(button => button.textContent === 'Repair');
		assert.ok(repair);
		repair.click();
		await timeout(0);
		assert.deepStrictEqual({
			before,
			navigation,
			repairs: fixture.repairs,
			actionsAfter: [...fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button')].map(element => element.textContent),
		}, {
			before: { detail: 'Skill · GitHub Feed · Missing files', actions: ['Repair', 'Uninstall'] },
			navigation: {
				ariaLabel: 'View details for Repair mail skill',
				openedDetails: ['repair-mail'],
				openedInstalled: [],
			},
			repairs: ['repair-mail'],
			actionsAfter: ['Uninstall'],
		});
	});

	test('uses connection terminology and offers cancellation for a pending Connector repair', async () => {
		const candidate = resource('mail', {
			sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
			displayName: 'Mail',
			installation: { kind: 'copilotConnector', name: 'mail' },
		});
		const target = { kind: 'copilotConnector' as const, name: 'mail' };
		const fixture = createPage([CustomizationMarketplaceSources.CopilotConnectors.id]);
		fixture.setInstallState(candidate, { kind: 'missing', target });
		fixture.page.setSearchQuery('@installed mail');
		fixture.page.setVisible(true);
		await timeout(0);
		const getConnectorRow = () => [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-results .monaco-list-row')]
			.find(row => row.querySelector('.customization-discovery-result-name')?.textContent === 'Mail');
		const disconnectedRow = getConnectorRow();
		assert.ok(disconnectedRow);
		const disconnected = {
			detail: disconnectedRow.querySelector('.customization-discovery-result-detail')?.textContent,
			actions: [...disconnectedRow.querySelectorAll('.customization-discovery-result-actions .monaco-button')].map(element => element.textContent),
		};

		fixture.setInstallState(candidate, { kind: 'repairing', target });
		fixture.notifyInstallChange();
		await timeout(0);
		const repairingRow = getConnectorRow();
		assert.ok(repairingRow);
		const cancel = [...repairingRow.querySelectorAll<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button')].find(button => button.textContent === 'Cancel');
		assert.ok(cancel);
		cancel.click();

		assert.deepStrictEqual({
			disconnected,
			repairingDetail: repairingRow.querySelector('.customization-discovery-result-detail')?.textContent,
			cancelAriaLabel: cancel.getAttribute('aria-label'),
			cancellations: fixture.cancellations,
		}, {
			disconnected: { detail: 'MCP server · Copilot Connectors · Disconnected', actions: ['Reconnect', 'Disconnect'] },
			repairingDetail: 'MCP server · Copilot Connectors · Reconnecting',
			cancelAriaLabel: 'Cancel reconnecting Mail',
			cancellations: ['mail'],
		});
	});

	test('shows missing records in installed-only search without querying the catalog', async () => {
		const candidate = resource('retired-skill', {
			sourceId: 'retired',
			displayName: 'Retired recorded skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			installation: { kind: 'skill', repository: 'owner/catalog', ref: 'v1', path: 'skills/retired' },
		});
		const fixture = createPage();
		fixture.setInstallState(candidate, { kind: 'missing', target: { kind: 'skill', uri: URI.file('/workspace/.agents/skills/retired/SKILL.md') } });
		fixture.page.setSearchQuery('@installed retired');
		fixture.page.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			name: fixture.container.querySelector('.customization-discovery-result-name')?.textContent,
			detail: fixture.container.querySelector('.customization-discovery-result-detail')?.textContent,
			actions: [...fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button')].map(element => element.textContent),
		}, {
			requests: 0,
			name: 'Retired recorded skill',
			detail: 'Skill · retired · Missing files',
			actions: ['Repair', 'Uninstall'],
		});
	});

	test('keeps uninstall available when installation verification fails', async () => {
		const candidate = resource('unreadable-skill', {
			displayName: 'Unreadable recorded skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			installation: { kind: 'skill', repository: 'owner/catalog', ref: 'v1', path: 'skills/unreadable' },
		});

		const fixture = createPage();
		fixture.setInstallState(candidate, { kind: 'error', target: { kind: 'skill', uri: URI.file('/workspace/.agents/skills/unreadable/SKILL.md') }, message: 'Permission denied' });
		fixture.page.setSearchQuery('@installed unreadable');
		fixture.page.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({
			detail: fixture.container.querySelector('.customization-discovery-result-detail')?.textContent,
			action: fixture.container.querySelector<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button')?.textContent,
			disabled: fixture.container.querySelector<HTMLElement>('.customization-discovery-result-actions .monaco-button')?.getAttribute('aria-disabled'),
		}, { detail: 'Skill · GitHub Feed · Could not verify installation', action: 'Uninstall', disabled: 'false' });
	});

	test('explains unresolved plugin identity and disables uninstall until inventory recovers', async () => {
		const candidate = resource('pacman', { displayName: 'Token Pacman Plugin', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin });
		const fixture = createPage();
		const target = { kind: 'plugin' as const, name: 'token-pacman' };
		const message = 'Refresh the plugin inventory to resolve the installation identity.';
		fixture.setInstallState(candidate, { kind: 'installed', target, uninstallUnavailableMessage: message });
		fixture.page.setSearchQuery('@installed pacman');
		fixture.page.setVisible(true);
		await timeout(0);
		const button = () => fixture.container.querySelector<HTMLElement>('.customization-discovery-result-actions .monaco-button');
		const unresolved = {
			detail: fixture.container.querySelector('.customization-discovery-result-detail')?.textContent,
			action: button()?.textContent,
			disabled: button()?.getAttribute('aria-disabled'),
			label: button()?.getAttribute('aria-label'),
		};
		button()?.click();
		fixture.setInstallState(candidate, { kind: 'installed', target });
		fixture.notifyInstallChange();
		await timeout(0);
		assert.deepStrictEqual({ unresolved, recovered: button()?.getAttribute('aria-disabled') }, {
			unresolved: {
				detail: `Plugin · GitHub Feed · ${message}`,
				action: 'Uninstall',
				disabled: 'true',
				label: `Uninstall Token Pacman Plugin. ${message}`,
			},
			recovered: 'false',
		});
	});

	test('does not render after disposal while repair completes', async () => {
		const candidate = resource('repair-after-dispose', {
			displayName: 'Repair after dispose',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			installation: { kind: 'skill', repository: 'owner/catalog', ref: 'v1', path: 'skills/repair-after-dispose' },
		});
		const fixture = createPage();
		const repair = new DeferredPromise<void>();
		fixture.setRepairHandler(async () => repair.p);
		fixture.setInstallState(candidate, { kind: 'missing', target: { kind: 'skill', uri: URI.file('/workspace/.agents/skills/repair-after-dispose/SKILL.md') } });
		fixture.page.setSearchQuery('repair after dispose');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [candidate] });
		await timeout(0);
		const button = [...fixture.container.querySelectorAll<HTMLButtonElement>('.customization-discovery-result-actions .monaco-button')].find(candidate => candidate.textContent === 'Repair');
		assert.ok(button);
		button.click();
		const before = fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button').length;
		fixture.page.dispose();
		await repair.complete();
		await timeout(0);
		assert.deepStrictEqual({ before, after: fixture.container.querySelectorAll('.customization-discovery-result-actions .monaco-button').length }, { before: 1, after: 0 });
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
			const fixture = createPage(['agentFinder'], undefined, undefined, setupUrl);
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
			assert.deepStrictEqual(fixture.openedDetails, []);
		});
	}

	test('changing source enablement clears available pages but keeps installed search', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('public-mail')] });
		await setEnabled(fixture.configuration, CustomizationMarketplaceSources.AgentFinderPublicFeed.enablementSetting, false);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			queries: fixture.requests.length,
			available: fixture.page.getAccessibilityContent().includes('public-mail'),
			installed: fixture.page.getAccessibilityContent().includes('Local mail skill'),
		}, { queries: 2, available: false, installed: true });
	});

	test('source picker limits installed results to the selected source', async () => {
		const fixture = createPage(['agentFinder', 'other']);
		const candidate = resource('mail-skill', {
			displayName: 'Marketplace mail skill',
			mediaType: CustomizationMarketplaceMediaType.Skill,
		});
		fixture.setInstallState(candidate, { kind: 'installed', target: { kind: 'skill', uri: URI.file('/workspace/.github/skills/mail/SKILL.md') } });
		fixture.notifyInstallChange();
		fixture.page.setSearchQuery('@installed mail');
		fixture.page.setVisible(true);

		const getRows = () => [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent);
		const allSources = getRows();
		await fixture.selectSource('other');
		const otherSource = getRows();
		await fixture.selectSource('agentFinder');
		const matchingSource = getRows();

		assert.deepStrictEqual({ allSources, otherSource, matchingSource }, {
			allSources: ['Local mail skill'],
			otherSource: [],
			matchingSource: ['Local mail skill'],
		});
	});

	test('source picker uses native plugin provenance before catalog association', async () => {
		const marketplacePlugin: IMarketplacePlugin = {
			name: 'review',
			description: 'Review code',
			version: '1.0.0',
			source: 'plugins/review',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/review' },
			marketplace: configuredMarketplaceReference.displayLabel,
			marketplaceReference: configuredMarketplaceReference,
			marketplaceType: MarketplaceType.Claude,
			readmeUri: URI.parse('https://example.com/review/README.md'),
		};
		const installedPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/review');
			override readonly label = 'review';
			override readonly fromMarketplace = marketplacePlugin;
		}();
		const fixture = createPage(
			[configuredMarketplaceSourceId, secondConfiguredMarketplaceSource.id],
			[AICustomizationManagementSection.Plugins],
			[installedPlugin],
		);
		fixture.page.setSearchQuery('@installed review');
		fixture.page.setVisible(true);

		const getRows = () => [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent);
		await fixture.selectSource(secondConfiguredMarketplaceSource.id);
		const otherSource = getRows();
		await fixture.selectSource(configuredMarketplaceSourceId);

		assert.deepStrictEqual({
			requests: fixture.requests.length,
			otherSource,
			matchingSource: getRows(),
		}, {
			requests: 0,
			otherSource: [],
			matchingSource: ['review'],
		});
	});

	test('plugin-only source picker and accessible results keep configured provenance', async () => {
		const fixture = createPage([configuredMarketplaceSourceId]);
		fixture.page.setSearchQuery('@type:plugin review');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('review', { sourceId: configuredMarketplaceSourceId, mediaType: CustomizationMarketplaceMediaType.ClaudePlugin, description: 'Review code', originLabel: 'owner/catalog' })],
		});
		await timeout(0);
		const availableAccessible = fixture.page.getAccessibilityContent().includes('review\nPlugin · owner/catalog\nReview code');
		await fixture.selectSource(configuredMarketplaceSourceId);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			requests: fixture.requests.map(request => request.options.sourceIds),
			source: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			availableAccessible,
			accessible: fixture.page.getAccessibilityContent().includes('owner/catalog'),
		}, {
			requests: [undefined, [configuredMarketplaceSourceId]],
			source: 'owner/catalog',
			availableAccessible: true,
			accessible: true,
		});
	});

	test('marketplace navigation applies its source and clears stale sources for general browse', async () => {
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.McpServers, AICustomizationManagementSection.Plugins],
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });

		fixture.page.showMarketplace('@type:plugin', configuredMarketplaceSourceId);
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [] });
		const configuredPluginSource = fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent;

		fixture.page.showMarketplace('@type:mcp', undefined);
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [] });
		const generalMcpSource = fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent;

		fixture.page.showMarketplace('@type:mcp', CustomizationMarketplaceSources.AgentFinderPublicFeed.id);
		await timeout(0);
		await fixture.requests[3].result.complete({ items: [] });

		fixture.page.showMarketplace('@type:plugin', undefined);
		await timeout(0);
		await fixture.requests[4].result.complete({ items: [] });
		const generalPluginSource = fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent;

		assert.deepStrictEqual({
			requests: fixture.requests.slice(1).map(request => ({
				query: request.options.query,
				sourceIds: request.options.sourceIds,
			})),
			configuredPluginSource,
			generalMcpSource,
			generalPluginSource,
		}, {
			requests: [
				{ query: undefined, sourceIds: [configuredMarketplaceSourceId] },
				{ query: undefined, sourceIds: undefined },
				{ query: undefined, sourceIds: [CustomizationMarketplaceSources.AgentFinderPublicFeed.id] },
				{ query: undefined, sourceIds: undefined },
			],
			configuredPluginSource: 'owner/catalog',
			generalMcpSource: 'All Sources',
			generalPluginSource: 'All Sources',
		});
	});

	test('different configured plugins with the same name remain available', async () => {
		const installedPlugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/plugins/review');
			override readonly label = 'review';
		}();
		const fixture = createPage([configuredMarketplaceSourceId], [AICustomizationManagementSection.Plugins], [installedPlugin]);
		fixture.page.setSearchQuery('@type:plugin review');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('review', { sourceId: configuredMarketplaceSourceId, mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, originLabel: 'owner/catalog' })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			rows: fixture.container.querySelectorAll('.customization-discovery-results .monaco-list-row').length,
			accessible: fixture.page.getAccessibilityContent().includes('owner/catalog'),
		}, { rows: 2, accessible: true });
	});

	test('strict plugin policy changes clear cached plugin results and restart discovery', async () => {
		const fixture = createPage([configuredMarketplaceSourceId]);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('blocked', { sourceId: configuredMarketplaceSourceId })] });
		await timeout(0);
		fixture.marketplaceChanges.fire();
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			queries: fixture.requests.length,
			containsBlocked: fixture.page.getAccessibilityContent().includes('blocked'),
		}, { queries: 2, containsBlocked: false });
	});

	test('workspace marketplace changes reset plugin results and cursor without requerying the public source', async () => {
		const fixture = createPage([configuredMarketplaceSourceId]);
		fixture.page.setSearchQuery('@type:plugin review');
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('old-review', { sourceId: configuredMarketplaceSourceId, mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
			nextCursor: { token: 'old-cursor' },
		});
		await timeout(0);
		fixture.marketplaceChanges.fire();
		await timeout(0);
		const resetRequest = fixture.requests.at(-1)!;
		const beforeNewResults = {
			resetCursor: resetRequest.options.cursor,
			previousResultVisible: fixture.page.getAccessibilityContent().includes('old-review'),
		};
		await resetRequest.result.complete({
			items: [resource('new-review', { sourceId: configuredMarketplaceSourceId, mediaType: CustomizationMarketplaceMediaType.CopilotPlugin })],
		});
		await timeout(0);
		assert.deepStrictEqual({
			beforeNewResults,
			newResultVisible: fixture.page.getAccessibilityContent().includes('new-review'),
		}, {
			beforeNewResults: { resetCursor: undefined, previousResultVisible: false },
			newResultVisible: true,
		});
	});

	test('plugin marketplace changes reload Discover while the public feed remains enabled', async () => {
		const fixture = createPage([CustomizationMarketplaceSources.AgentFinderPublicFeed.id]);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('public')] });
		fixture.marketplaceChanges.fire();
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [] });
		assert.deepStrictEqual({
			requests: fixture.requests.length,
			publicResultVisible: fixture.page.getAccessibilityContent().includes('public'),
		}, { requests: 2, publicResultVisible: false });
	});

	test('source identity changes discard stale pages and surface a retryable transition', async () => {
		const fixture = createPage(['other']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('old-item', { sourceId: 'other' })] });
		await fixture.configuration.setUserConfiguration(otherSourceUrlSetting, 'https://new.registry.test');
		fixture.configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean { return section === otherSourceUrlSetting; }
		}());
		await timeout(0);
		assert.strictEqual(fixture.requests.length, 2);
		await fixture.requests[1].result.complete({
			items: [],
			sourceErrors: [{ sourceId: 'other', message: 'Source is changing. Try again.' }],
		});
		await timeout(0);
		const content = fixture.page.getAccessibilityContent();
		assert.deepStrictEqual({
			old: content.includes('old-item'),
			retry: content.includes('Source is changing. Try again.'),
			prompt: fixture.prompts.map(([severity, message, choices]) => ({ severity, message, choices: choices.map(choice => choice.label) })),
		}, {
			old: false,
			retry: false,
			prompt: [{ severity: Severity.Warning, message: 'Other Feed: Source is changing. Try again.', choices: ['Retry'] }],
		});
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
				prompt: fixture.prompts.map(([severity, message, choices]) => ({ severity, message, choices: choices.map(choice => choice.label) })),
			};
			const retry = fixture.prompts[0][2][0];
			failing = false;
			retry.run();
			await complete(1);
			assert.deepStrictEqual({
				initial,
				cursors: fixture.requests.map(request => request.options.cursor),
				visible: fixture.page.getAccessibilityContent().match(/^(?:public|other)-mail$/gm),
				warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
			}, {
				initial: {
					healthy: true,
					warning: undefined,
					accessible: false,
					prompt: [{ severity: Severity.Warning, message: 'Other Feed: Other Feed unavailable', choices: ['Retry'] }],
				},
				cursors: [undefined, undefined],
				visible: ['public-mail', 'other-mail'],
				warnings: 0,
			});
		});
	}

	test('Retry keeps the warning when the source fails again with the same error', async () => {
		const fixture = createPage(['other']);
		fixture.page.setVisible(true);
		const failure = { items: [], sourceErrors: [{ sourceId: 'other', message: 'Other Feed unavailable' }] };
		await fixture.requests[0].result.complete(failure);
		await timeout(0);
		const retry = fixture.prompts[0][2][0];
		retry.run();
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete(failure);
		await timeout(0);
		assert.deepStrictEqual({
			keepOpen: retry.keepOpen,
			requests: fixture.requests.map(request => request.options.cursor),
			prompts: fixture.prompts.length,
			state: fixture.container.querySelector('.customization-discovery-browse .customization-discovery-state')?.textContent,
		}, {
			keepOpen: true,
			requests: [undefined, undefined],
			prompts: 1,
			state: '',
		});
	});

	test('Retry clicked during pagination runs after the current page finishes loading', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		const sourceErrors = [{ sourceId: 'other', message: 'Other Feed unavailable' }];
		await fixture.requests[0].result.complete({
			items: [resource('mail-1')],
			nextCursor: { token: 'next-page' },
			sourceErrors,
		});
		await waitForRequestCount(fixture.requests, 2);
		fixture.prompts[0][2][0].run();
		await timeout(0);
		assert.strictEqual(fixture.requests.length, 2);
		await fixture.requests[1].result.complete({
			items: [resource('mail-2')],
			sourceErrors,
		});
		await waitForRequestCount(fixture.requests, 3);
		assert.deepStrictEqual({
			cursors: fixture.requests.map(request => request.options.cursor),
			prompts: fixture.prompts.length,
		}, {
			cursors: [undefined, { token: 'next-page' }, undefined],
			prompts: 1,
		});
	});

	test('changing search preserves a dismissed warning identity until a completed response confirms recovery', async () => {
		const fixture = createPage(['other']);
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		const failure = { items: [], sourceErrors: [{ sourceId: 'other', message: 'Other Feed unavailable' }] };
		await fixture.requests[0].result.complete(failure);
		await timeout(0);
		fixture.promptHandles[0].close();
		fixture.page.setSearchQuery('tools');
		await waitForRequestCount(fixture.requests, 2);
		const promptsWhilePending = fixture.prompts.length;
		await fixture.requests[1].result.complete(failure);
		await timeout(0);
		assert.deepStrictEqual({
			promptsWhilePending,
			promptsAfterSameFailure: fixture.prompts.length,
		}, {
			promptsWhilePending: 1,
			promptsAfterSameFailure: 1,
		});
	});


	for (const sourceIds of [['agentFinder'], ['copilotConnectors'], ['agentFinder', 'copilotConnectors']]) {
		test(`source gates preserve installed Discover: ${sourceIds.join(', ')}`, async () => {
			const fixture = createPage(sourceIds);
			fixture.page.setVisible(true);
			await fixture.requests[0].result.complete({ items: [] });
			fixture.page.setSearchQuery('@installed mail');
			await timeout(0);
			assert.deepStrictEqual({
				catalogRequests: fixture.requests.map(request => request.options),
				installedVisible: fixture.page.getAccessibilityContent().includes('Local mail skill'),
				searchVisible: fixture.container.querySelector('.customization-discovery-search') !== null,
			}, {
				catalogRequests: [{ query: undefined, mediaType: undefined, sourceIds: undefined, pageSize: 100, cursor: undefined }],
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
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
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
			labels: ['All Sources', 'owner/catalog', 'anthropics/claude-code', 'GitHub Feed', 'Copilot Connectors', 'Configure Marketplaces'],
			selected: { label: 'Copilot Connectors', cancelled: true, content: ['connector-mail'] },
			selections: [undefined, ['copilotConnectors'], undefined],
			finalLabel: 'All Sources',
			disabledSelectable: false,
			content: ['public-mail'],
		});
	});

	test('Configure Marketplaces opens the marketplace management quick pick', async () => {
		const fixture = createPage(['agentFinder']);
		await fixture.configureMarketplaces();
		assert.deepStrictEqual(fixture.commands, [{
			id: MANAGE_PLUGIN_MARKETPLACES_COMMAND_ID,
			args: [],
		}]);
	});

	test('prioritizes editorial Browse content while remaining sources load', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: { items: [resource('fast-source')] },
			completedSourceIds: ['agentFinder'],
			cachedSourceIds: [],
			totalSourceCount: 2,
		});

		assert.deepStrictEqual({
			item: fixture.container.querySelector('.customization-discovery-card-name')?.textContent,
			status: fixture.container.querySelector('.customization-discovery-browse .customization-discovery-state')?.textContent,
			busy: fixture.container.querySelector('.customization-discovery-browse')?.getAttribute('aria-busy'),
			accessible: fixture.page.getAccessibilityContent().includes('Loading customizations... 1 of 2 sources loaded.'),
		}, {
			item: undefined,
			status: 'Loading customizations... 1 of 2 sources loaded.',
			busy: 'true',
			accessible: true,
		});

		await fixture.requests[0].result.complete({ items: [resource('fast-source'), resource('slow-source')] });
	});

	test('preserves visible Browse item order while additional sources load', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: { items: [resource('first-source'), resource('second-source')] },
			completedSourceIds: ['agentFinder'],
			cachedSourceIds: [],
			totalSourceCount: 2,
		});
		fixture.requests[0].onProgress?.({
			page: { items: [resource('new-source'), resource('first-source'), resource('second-source')] },
			completedSourceIds: ['agentFinder', 'copilotConnectors'],
			cachedSourceIds: [],
			totalSourceCount: 2,
		});
		await fixture.requests[0].result.complete({ items: [resource('new-source'), resource('first-source'), resource('second-source')] });
		await timeout(0);

		assert.deepStrictEqual(
			[...fixture.container.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
			['first-source', 'second-source', 'new-source'],
		);
	});

	test('replaces pending fallback Browse content when curated sections arrive', async () => {
		const browseSections = new DeferredPromise<ICustomizationMarketplaceBrowseSections>();
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections.p,
		);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: { items: [resource('catalog-first')] },
			completedSourceIds: ['agentFinder'],
			cachedSourceIds: [],
			totalSourceCount: 1,
		});
		fixture.reportBrowseSectionsProgress({
			result: {
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				sections: [{ id: 'featured', title: 'Featured', items: [resource('curated-later')] }],
			},
			completedSectionCount: 1,
			cachedSectionCount: 0,
			totalSectionCount: 1,
		});
		await fixture.requests[0].result.complete({ items: [resource('catalog-first')] });
		await browseSections.complete({
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [{ id: 'featured', title: 'Featured', items: [resource('curated-later')] }],
		});
		await timeout(0);

		assert.deepStrictEqual({
			visible: [...fixture.container.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
			accessible: fixture.page.getAccessibilityContent().match(/^(?:catalog-first|curated-later)$/gm),
		}, {
			visible: ['curated-later'],
			accessible: ['curated-later'],
		});
	});

	test('rate limits Browse loading announcements', async () => {
		const ariaHost = DOM.append(mainWindow.document.body, DOM.$('div'));
		store.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		const fixture = createPage(['agentFinder', 'copilotConnectors', 'other']);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: { items: [resource('fast-source')] },
			completedSourceIds: ['agentFinder'],
			cachedSourceIds: [],
			totalSourceCount: 3,
		});
		fixture.requests[0].onProgress?.({
			page: { items: [resource('fast-source'), resource('second-source')] },
			completedSourceIds: ['agentFinder', 'copilotConnectors'],
			cachedSourceIds: [],
			totalSourceCount: 3,
		});
		const immediate = [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean);

		await timeout(1_050);
		const settled = [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent).filter(Boolean);
		await fixture.requests[0].result.complete({ items: [resource('fast-source'), resource('second-source')] });

		assert.deepStrictEqual({ immediate, settled }, {
			immediate: ['Loading customizations... 1 of 3 sources loaded.'],
			settled: ['Loading customizations... 2 of 3 sources loaded.'],
		});
	});

	test('reports settled Browse telemetry once when no content loads', async () => {
		const browseSections = new DeferredPromise<ICustomizationMarketplaceBrowseSections>();
		const fixture = createPage(
			['agentFinder', 'copilotConnectors'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections.p,
		);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: { items: [] },
			completedSourceIds: ['agentFinder'],
			cachedSourceIds: ['agentFinder'],
			totalSourceCount: 2,
		});
		fixture.reportBrowseSectionsProgress({
			result: {
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				sections: [],
			},
			completedSectionCount: 1,
			cachedSectionCount: 2,
			totalSectionCount: 3,
		});
		await fixture.requests[0].result.complete({ items: [] });
		await browseSections.complete({
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [],
		});
		await timeout(0);

		assert.deepStrictEqual(
			fixture.telemetry
				.filter(event => event.name === 'chatCustomizationMarketplace.browseLoaded')
				.map(event => ({
					timeToFirstContentMs: event.data.timeToFirstContentMs,
					hasSettledTime: typeof event.data.timeToSettledMs === 'number' && event.data.timeToSettledMs >= 0,
					sourceCount: event.data.sourceCount,
					cachedSourceCount: event.data.cachedSourceCount,
				})),
			[{
				timeToFirstContentMs: -1,
				hasSettledTime: true,
				sourceCount: 5,
				cachedSourceCount: 3,
			}],
		);
	});

	test('renders curated Browse sections in feed order using existing cards', async () => {
		const editorsPicks = [
			resource('impeccable', { displayName: 'Impeccable', mediaType: CustomizationMarketplaceMediaType.Skill, description: 'Improve interface design.' }),
			resource('foundry', { displayName: 'Foundry canvas', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, description: 'Design hosted agents.' }),
		];
		const planBuildAndShip = [
			resource('figma', { displayName: 'Figma MCP', description: 'Use Figma context.' }),
			resource('playwright', { displayName: 'Playwright MCP', description: 'Automate browsers.' }),
		];
		const connectYourWork = [
			resource('workiq', { displayName: 'WorkIQ', mediaType: CustomizationMarketplaceMediaType.CopilotPlugin, description: 'Connect Microsoft 365.' }),
			resource('azure-devops', { displayName: 'Azure DevOps MCP', description: 'Connect Azure DevOps.' }),
		];
		const browseSections = {
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [{
				id: 'editors',
				title: 'Editor\'s picks',
				items: editorsPicks,
			}, {
				id: 'plan',
				title: 'Plan, build, and ship',
				items: planBuildAndShip,
			}, {
				id: 'connect',
				title: 'Connect your work',
				items: connectYourWork,
			}],
		};
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections,
		);
		fixture.page.setVisible(true);
		fixture.reportBrowseSectionsProgress({
			result: browseSections,
			completedSectionCount: browseSections.sections.length,
			cachedSectionCount: 0,
			totalSectionCount: browseSections.sections.length,
		});
		await fixture.requests[0].result.complete({ items: [resource('catalog-fallback')] });
		await timeout(0);

		const sections = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-section')].map(section => ({
			title: section.querySelector('.customization-discovery-section-title')?.textContent,
			featured: section.classList.contains('featured'),
			items: [...section.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
		}));
		const accessible = fixture.page.getAccessibilityContent();
		const headingPositions = [
			accessible.indexOf('Editor\'s picks'),
			accessible.indexOf('Plan, build, and ship'),
			accessible.indexOf('Connect your work'),
		];
		assert.deepStrictEqual({
			sections,
			fallbackVisible: accessible.includes('catalog-fallback'),
			headingOrder: headingPositions.every(position => position >= 0)
				&& headingPositions[0] < headingPositions[1]
				&& headingPositions[1] < headingPositions[2],
		}, {
			sections: [{
				title: 'Editor\'s picks',
				featured: true,
				items: ['Impeccable', 'Foundry canvas'],
			}, {
				title: 'Plan, build, and ship',
				featured: false,
				items: ['Figma MCP', 'Playwright MCP'],
			}, {
				title: 'Connect your work',
				featured: false,
				items: ['WorkIQ', 'Azure DevOps MCP'],
			}],
			fallbackVisible: false,
			headingOrder: true,
		});
	});

	test('renders source shelves after editorial content and opens selected-source results', async () => {
		const browseSections = {
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [{
				id: 'editors',
				title: 'Editor\'s picks',
				items: [resource('editorial-item', { displayName: 'Editorial item' })],
			}],
		};
		const connectorItems = Array.from({ length: 5 }, (_, index) => resource(`connector-${index}`, {
			sourceId: CustomizationMarketplaceSources.CopilotConnectors.id,
			displayName: `Connector ${index}`,
		}));
		const otherItems = [
			resource('other-skill', { sourceId: 'other', displayName: 'Other skill', mediaType: CustomizationMarketplaceMediaType.Skill }),
			resource('other-mcp', { sourceId: 'other', displayName: 'Other MCP' }),
		];
		const fixture = createPage(
			['agentFinder', 'copilotConnectors', 'other'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections,
			{
				copilotConnectors: connectorItems,
				other: otherItems,
			},
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [...connectorItems, ...otherItems] });
		await timeout(0);

		const initialSections = [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-section')].map(section => ({
			title: section.querySelector('.customization-discovery-section-title')?.textContent,
			items: [...section.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
			action: section.querySelector<HTMLButtonElement>('.customization-discovery-show-all'),
		}));
		const accessibleViewAll = fixture.page.getAccessibilityContent().includes('View all customizations from Copilot Connectors.');
		initialSections[1].action?.click();
		await timeout(0);
		await fixture.requests[1].result.complete({ items: connectorItems.slice(0, 2) });
		await timeout(0);

		assert.deepStrictEqual({
			initial: initialSections.map(section => ({
				title: section.title,
				items: section.items,
				action: section.action?.textContent,
				ariaLabel: section.action?.ariaLabel,
			})),
			accessibleViewAll,
			selectedSource: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			sourceResults: [...fixture.container.querySelectorAll('.customization-discovery-result-name')].map(element => element.textContent),
			resultSourceIds: fixture.requests[1].options.sourceIds,
		}, {
			initial: [{
				title: 'Editor\'s picks',
				items: ['Editorial item'],
				action: undefined,
				ariaLabel: undefined,
			}, {
				title: 'Copilot Connectors',
				items: ['Connector 0', 'Connector 1', 'Connector 2', 'Connector 3'],
				action: 'View All',
				ariaLabel: 'View all customizations from Copilot Connectors',
			}, {
				title: 'Other Feed',
				items: ['Other skill', 'Other MCP'],
				action: 'View All',
				ariaLabel: 'View all customizations from Other Feed',
			}],
			accessibleViewAll: true,
			selectedSource: 'Copilot Connectors',
			sourceResults: ['Connector 0', 'Connector 1'],
			resultSourceIds: ['copilotConnectors'],
		});
	});

	test('selecting the editorial source shows its SDK home feeds', async () => {
		const browseSections = {
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [
				{
					id: 'editors',
					title: 'Editor\'s picks',
					items: [resource('editorial-item')],
				},
				{
					id: 'connect',
					title: 'Connect your work',
					items: [resource('connector-item')],
				},
			],
		};
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections,
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('home-item')] });
		await timeout(0);
		await fixture.selectSource('agentFinder');
		await fixture.requests[1].result.complete({ items: [] });
		await timeout(0);

		assert.deepStrictEqual({
			sections: [...fixture.container.querySelectorAll<HTMLElement>('.customization-discovery-section')].map(section => ({
				title: section.querySelector('.customization-discovery-section-title')?.textContent,
				items: [...section.querySelectorAll('.customization-discovery-card-name')].map(element => element.textContent),
			})),
			resultsHidden: fixture.container.querySelector<HTMLElement>('.customization-discovery-results')?.hidden,
			request: fixture.requests[1].options,
		}, {
			sections: [
				{ title: 'Editor\'s picks', items: ['editorial-item'] },
				{ title: 'Connect your work', items: ['connector-item'] },
			],
			resultsHidden: true,
			request: {
				query: undefined,
				mediaType: undefined,
				sourceIds: ['agentFinder'],
				pageSize: 24,
				cursor: undefined,
			},
		});
	});

	test('source result pages preserve native order and paginate on scroll', async () => {
		const fixture = createPage(['other']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);
		await fixture.selectSource('other');
		const cursor = { token: 'next-mcp-page' };
		await fixture.requests[1].result.complete({
			items: Array.from({ length: 24 }, (_, index) => resource(`source-${index}`, {
				sourceId: 'other',
				mediaType: index % 2 ? CustomizationMarketplaceMediaType.Skill : CustomizationMarketplaceMediaType.McpServer,
			})),
			nextCursor: cursor,
		});
		await timeout(0);
		const sourceOrder = fixture.page.getAccessibilityContent().match(/^source-\d+$/gm);
		const listElement = fixture.container.querySelector<HTMLElement>('.customization-discovery-results .monaco-list')!;
		listElement.focus();
		listElement.dispatchEvent(new FocusEvent('focus'));
		const list = fixture.listService.lastFocusedList;
		assert.ok(list instanceof WorkbenchList);
		list.scrollTop = list.scrollHeight;
		await waitForRequestCount(fixture.requests, 3);

		assert.deepStrictEqual({
			order: sourceOrder,
			initial: fixture.requests[1].options,
			continuation: fixture.requests[2].options,
		}, {
			order: Array.from({ length: 24 }, (_, index) => `source-${index}`),
			initial: {
				query: undefined,
				mediaType: undefined,
				sourceIds: ['other'],
				pageSize: 24,
				cursor: undefined,
			},
			continuation: {
				query: undefined,
				mediaType: undefined,
				sourceIds: ['other'],
				pageSize: 24,
				cursor,
			},
		});
		await fixture.requests[2].result.complete({ items: [resource('source-24', { sourceId: 'other' })] });
	});

	test('selected-source Browse replaces progressive snapshots with native final order', async () => {
		const fixture = createPage(['other']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);
		await fixture.selectSource('other');
		fixture.requests[1].onProgress?.({
			page: {
				items: [resource('default-result', { sourceId: 'other' })],
			},
			completedSourceIds: ['other.default'],
			cachedSourceIds: [],
			totalSourceCount: 2,
		});
		await fixture.requests[1].result.complete({
			items: [
				resource('custom-result', { sourceId: 'other' }),
				resource('default-result', { sourceId: 'other' }),
			],
		});
		await timeout(0);

		assert.deepStrictEqual(
			fixture.page.getAccessibilityContent().match(/^(?:custom|default)-result$/gm),
			['custom-result', 'default-result'],
		);
	});

	test('final All Sources Browse snapshots discard stale cached results', async () => {
		const fixture = createPage(['agentFinder']);
		fixture.page.setVisible(true);
		fixture.requests[0].onProgress?.({
			page: {
				items: [resource('stale-result'), resource('current-result')],
			},
			completedSourceIds: [],
			cachedSourceIds: ['agentFinder'],
			totalSourceCount: 1,
		});
		await fixture.requests[0].result.complete({ items: [resource('current-result')] });
		await timeout(0);

		assert.deepStrictEqual(
			fixture.page.getAccessibilityContent().match(/^(?:stale|current)-result$/gm),
			['current-result'],
		);
	});

	test('does not restore a partially loaded source-shelf cache', async () => {
		const pendingOtherPreview = new DeferredPromise<readonly ICustomizationMarketplaceResource[]>();
		const browseSections = {
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [{
				id: 'editors',
				title: 'Editor\'s picks',
				items: [resource('editorial-item')],
			}],
		};
		const fixture = createPage(
			['agentFinder', 'copilotConnectors', 'other'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections,
			{
				copilotConnectors: [resource('connector-item', { sourceId: 'copilotConnectors' })],
				other: pendingOtherPreview.p,
			},
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [] });
		await timeout(0);
		await fixture.selectSource('copilotConnectors');
		await fixture.requests[1].result.complete({ items: [resource('connector-item', { sourceId: 'copilotConnectors' })] });
		await timeout(0);
		await fixture.selectSource(undefined);
		await waitForRequestCount(fixture.requests, 3);
		await fixture.requests[2].result.complete({ items: [] });
		await pendingOtherPreview.complete([]);
		await timeout(0);

		assert.deepStrictEqual(
			fixture.requests.map(request => request.options.sourceIds),
			[undefined, ['copilotConnectors'], undefined],
		);
	});

	test('falls back to catalog Browse groups when curated feeds fail', async () => {
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			{
				sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
				sections: [],
				error: 'Curated feeds unavailable',
			},
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({
			items: [resource('catalog-skill', { mediaType: CustomizationMarketplaceMediaType.Skill })],
		});
		await timeout(0);

		assert.deepStrictEqual({
			headings: [...fixture.container.querySelectorAll('.customization-discovery-section-title')].map(element => element.textContent),
			warning: fixture.prompts.some(([, message]) => String(message).includes('Curated feeds unavailable')),
			item: fixture.container.querySelector('.customization-discovery-card-name')?.textContent,
		}, {
			headings: ['Expand your agent\'s horizons'],
			warning: true,
			item: 'catalog-skill',
		});
	});

	test('does not show or cache fallback results while editorial content is pending', async () => {
		const browseSections = new DeferredPromise<ICustomizationMarketplaceBrowseSections>();
		const fixture = createPage(
			['agentFinder'],
			[AICustomizationManagementSection.Skills, AICustomizationManagementSection.McpServers],
			[],
			undefined,
			[],
			browseSections.p,
		);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('catalog-featured')] });
		await timeout(0);
		const catalogVisibleBeforeFeeds = fixture.page.getAccessibilityContent().includes('catalog-featured');

		fixture.page.setSearchQuery('mail');
		await waitForRequestCount(fixture.requests, 2);
		await fixture.requests[1].result.complete({ items: [resource('search-result')] });
		fixture.page.setSearchQuery('');
		await waitForRequestCount(fixture.requests, 3);
		const restoredBeforeFeeds = fixture.page.getAccessibilityContent().match(/^(?:catalog-featured|search-result)$/gm);

		await fixture.requests[2].result.complete({ items: [resource('fresh-featured')] });
		await browseSections.complete({
			sourceId: CustomizationMarketplaceSources.AgentFinderPublicFeed.id,
			sections: [{ id: 'editors', title: 'Editor\'s picks', items: [resource('curated-featured')] }],
		});
		await timeout(0);

		assert.deepStrictEqual({
			queries: fixture.requests.map(request => request.options.query),
			catalogVisibleBeforeFeeds,
			restoredBeforeFeeds,
			visible: fixture.page.getAccessibilityContent().match(/^(?:catalog-featured|search-result|fresh-featured|curated-featured)$/gm),
			telemetry: fixture.telemetry.filter(event => event.name === 'chatCustomizationMarketplace.browseRendered').map(event => ({ name: event.name, ...event.data })),
		}, {
			queries: [undefined, 'mail', undefined],
			catalogVisibleBeforeFeeds: false,
			restoredBeforeFeeds: null,
			visible: ['curated-featured'],
			telemetry: [{
				name: 'chatCustomizationMarketplace.browseRendered',
				view: 'curated',
				curatedSectionCount: 1,
			}],
		});
	});


	test('clearing search restores browse results only for the selected source', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('all-featured')] });
		await timeout(0);
		await fixture.selectSource('copilotConnectors');
		await fixture.requests[1].result.complete({ items: [resource('connector-featured', { sourceId: 'copilotConnectors' })] });
		await timeout(0);
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

	test('resetting filters restores unfiltered browse results', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		fixture.page.setVisible(true);
		await fixture.requests[0].result.complete({ items: [resource('all-featured')] });
		await timeout(0);
		await fixture.selectSource('copilotConnectors');
		await fixture.requests[1].result.complete({ items: [resource('connector-featured', { sourceId: 'copilotConnectors' })] });
		await timeout(0);
		fixture.page.setSearchQuery('mail');
		await timeout(0);
		await fixture.requests[2].result.complete({ items: [resource('connector-search', { sourceId: 'copilotConnectors' })] });

		fixture.page.resetFilters();

		assert.deepStrictEqual({
			browseMode: fixture.page.getAccessibilityContent().includes('Browse mode.'),
			source: fixture.container.querySelector('.customization-discovery-source .monaco-button')?.textContent,
			content: fixture.page.getAccessibilityContent().match(/^(?:all|connector)-(?:featured|search)$/gm),
		}, {
			browseMode: true,
			source: 'All Sources',
			content: ['all-featured'],
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


	test('effective source toggles cancel and clear available results without clearing the installed search', async () => {
		const fixture = createPage();
		fixture.page.setSearchQuery('mail');
		fixture.page.setVisible(true);
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, true);
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await fixture.requests[2].result.complete({ items: [resource('current mail', { sourceId: 'copilotConnectors' })] });
		await fixture.requests[0].result.complete({ items: [resource('stale mail')] });
		await fixture.requests[1].result.complete({ items: [resource('also stale mail')] });
		await timeout(0);
		const beforeDisable = {
			cancelled: fixture.requests.slice(0, 2).map(request => request.token.isCancellationRequested),
			hasCurrent: fixture.page.getAccessibilityContent().includes('current mail'),
			hasStale: fixture.page.getAccessibilityContent().includes('stale mail'),
		};
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
		const disabled = {
			hasAvailable: fixture.page.getAccessibilityContent().includes('current mail'),
			hasInstalled: fixture.page.getAccessibilityContent().includes('Local mail skill'),
			requests: fixture.requests.length,
		};
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await fixture.requests[4].result.complete({ items: [] });
		assert.deepStrictEqual({
			beforeDisable, disabled, searches: fixture.requests.map(request => [request.options.query, request.options.cursor]),
		}, {
			beforeDisable: { cancelled: [true, true], hasCurrent: true, hasStale: false },
			disabled: { hasAvailable: false, hasInstalled: true, requests: 4 },
			searches: [['mail', undefined], ['mail', undefined], ['mail', undefined], ['mail', undefined], ['mail', undefined]],
		});
	});


	test('unchanged source settings and entitlement notifications preserve the request', async () => {
		const fixture = createPage();
		fixture.page.setVisible(true);
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await setEnabled(fixture.configuration, CustomizationMarketplaceConfiguration.CopilotConnectorsEnabled, false);
		fixture.sentimentChanged.fire();
		const cancelled = fixture.requests[0].token.isCancellationRequested;
		await fixture.requests[0].result.complete({ items: [] });
		assert.deepStrictEqual({ count: fixture.requests.length, cancelled }, { count: 1, cancelled: false });
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
				label: 'Sign In to access Copilot Connectors.',
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


	test('coalesces shared GitHub account recovery into one sign-in invitation', async () => {
		const fixture = createPage(['agentFinder', 'copilotConnectors']);
		const recoveries: string[] = [];
		for (const sourceId of ['agentFinder', 'copilotConnectors']) {
			fixture.recoveryActions.set(sourceId, {
				label: 'Sign In',
				kind: 'signIn',
				groupId: CustomizationMarketplaceRecoveryGroup.GitHubDefaultAccount,
				run: async () => { recoveries.push(sourceId); },
			});
		}
		fixture.page.setSearchQuery('figma');
		fixture.page.setVisible(true);
		const sourceErrors = [
			{ sourceId: 'agentFinder', message: 'Sign in to Copilot to search the GitHub Feed.' },
			{ sourceId: 'copilotConnectors', message: 'Sign in to view connectors.' },
		];
		await fixture.requests[0].result.complete({ items: [], sourceErrors });
		await timeout(0);
		const actions = fixture.container.querySelectorAll<HTMLElement>('.customization-marketplace-source-signin .monaco-button');
		assert.strictEqual(actions.length, 1);
		const initialMessage = fixture.container.querySelector('.customization-marketplace-source-signin .customization-marketplace-source-message')?.textContent;
		const ariaLabel = actions[0].getAttribute('aria-label');
		actions[0].click();
		await timeout(0);
		await fixture.requests[1].result.complete({ items: [resource('figma')] });
		await timeout(0);

		assert.deepStrictEqual({
			initialMessage,
			ariaLabel,
			recoveries,
			queries: fixture.requests.map(request => request.options.query),
			signInPrompts: fixture.container.querySelectorAll('.customization-marketplace-source-signin').length,
			results: fixture.page.getAccessibilityContent().match(/^figma$/gm),
		}, {
			initialMessage: 'Sign in to access GitHub Feed and Copilot Connectors.',
			ariaLabel: 'Sign In to access GitHub Feed and Copilot Connectors.',
			recoveries: ['agentFinder'],
			queries: ['figma', 'figma'],
			signInPrompts: 0,
			results: ['figma'],
		});
	});

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
				{
					id: 'copilotConnectors', query: async () => {
						if (failing) {
							throw new Error('Connector catalog unavailable');
						}
						return {
							items: [resource('connector-mail', {
								sourceId: 'copilotConnectors',
								score: 100,
								installation: { kind: 'copilotConnector', name: 'connector-mail' },
							})],
							total: 1,
						};
					}
				},
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
				prompt: fixture.prompts.map(([severity, message, choices]) => ({ severity, message, choices: choices.map(choice => choice.label) })),
			};
			const retry = fixture.prompts[0][2][0];
			failing = false;
			retry.run();
			await complete(1);
			assert.deepStrictEqual({
				initial,
				cursors: fixture.requests.map(request => request.options.cursor),
				order: fixture.page.getAccessibilityContent().match(/^(?:public|connector)-mail$/gm),
				warnings: fixture.container.querySelectorAll('.customization-marketplace-source-warning').length,
			}, {
				initial: {
					healthyVisible: true,
					warning: undefined,
					accessibleWarning: false,
					prompt: [{ severity: Severity.Warning, message: 'Copilot Connectors: Connector catalog unavailable', choices: ['Retry'] }],
				},
				cursors: [undefined, undefined],
				order: ['connector-mail', 'public-mail'],
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
				prompts: fixture.prompts.map(([severity, message, choices]) => ({ severity, message, choices: choices.map(choice => choice.label) })),
				accessibleErrors: sources.map(source => fixture.page.getAccessibilityContent().includes(`${source.id} unavailable`)),
			}, {
				state: '',
				prompts: [
					{ severity: Severity.Warning, message: 'GitHub Feed: agentFinder unavailable', choices: ['Retry'] },
					{ severity: Severity.Warning, message: 'Copilot Connectors: copilotConnectors unavailable', choices: ['Retry'] },
				],
				accessibleErrors: [false, false],
			});
		});
	}
});
