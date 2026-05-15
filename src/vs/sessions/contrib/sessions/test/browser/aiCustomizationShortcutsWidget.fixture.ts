/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuActionOptions, IMenuService, isIMenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IMcpServer, IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IAICustomizationListItem } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemSource.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { CUSTOMIZATION_ITEMS, CustomizationLinkViewItem, SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING, SessionsCustomizationsSidebarMode } from '../../browser/customizationsToolbar.contribution.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

// Ensure color registrations are loaded
import '../../../../common/theme.js';
import '../../../../../platform/theme/common/colors/inputColors.js';

// ============================================================================
// One-time menu item registration (module-level).
// MenuRegistry.appendMenuItem does not throw on duplicates, unlike registerAction2
// which registers global commands and throws on the second call.
// ============================================================================

const menuRegistrations = new DisposableStore();
for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
	menuRegistrations.add(MenuRegistry.appendMenuItem(Menus.SidebarCustomizations, {
		command: { id: config.id, title: config.label },
		group: 'navigation',
		order: index + 1,
	}));
}

// ============================================================================
// FixtureMenuService — reads from MenuRegistry without context-key filtering
// ============================================================================

class FixtureMenuService implements IMenuService {
	declare readonly _serviceBrand: undefined;

	createMenu(id: MenuId): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => {
				const items = MenuRegistry.getMenuItems(id).filter(isIMenuItem);
				items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
				const actions = items.map(item => {
					const title = typeof item.command.title === 'string' ? item.command.title : item.command.title.value;
					return toAction({ id: item.command.id, label: title, run: () => { } });
				});
				return actions.length ? [['navigation', actions as unknown as (MenuItemAction | SubmenuItemAction)[]]] : [];
			},
		};
	}

	getMenuActions(_id: MenuId, _contextKeyService: unknown, _options?: IMenuActionOptions) { return []; }
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

// ============================================================================
// Minimal IActionViewItemService that supports register/lookUp
// ============================================================================

class FixtureActionViewItemService implements IActionViewItemService {
	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IActionViewItemFactory>();
	private readonly _onDidChange = new Emitter<MenuId>();
	readonly onDidChange = this._onDidChange.event;

	register(menu: MenuId, commandId: string | MenuId, provider: IActionViewItemFactory): { dispose(): void } {
		const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
		this._providers.set(key, provider);
		return { dispose: () => { this._providers.delete(key); } };
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
		const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
		return this._providers.get(key);
	}
}

// ============================================================================
// Mock IAICustomizationItemsModel — controllable per-section observables.
// This is the single source of truth for counts in both the editor and
// sidebar, so the fixture only needs to mock this one service.
// ============================================================================

interface ICustomizationCounts {
	readonly agents?: number;
	readonly skills?: number;
	readonly instructions?: number;
	readonly prompts?: number;
	readonly hooks?: number;
	readonly plugins?: number;
}

function createMockItemsModel(counts?: ICustomizationCounts): IAICustomizationItemsModel {
	const fakeItems = (n: number): readonly IAICustomizationListItem[] =>
		Array.from({ length: n }, (): IAICustomizationListItem => Object.create(null));

	const sectionItems = new Map<ItemsModelSection, IObservable<readonly IAICustomizationListItem[]>>([
		[AICustomizationManagementSection.Agents, observableValue('agentsItems', fakeItems(counts?.agents ?? 0))],
		[AICustomizationManagementSection.Skills, observableValue('skillsItems', fakeItems(counts?.skills ?? 0))],
		[AICustomizationManagementSection.Instructions, observableValue('instructionsItems', fakeItems(counts?.instructions ?? 0))],
		[AICustomizationManagementSection.Prompts, observableValue('promptsItems', fakeItems(counts?.prompts ?? 0))],
		[AICustomizationManagementSection.Hooks, observableValue('hooksItems', fakeItems(counts?.hooks ?? 0))],
	]);
	const pluginCount = observableValue('pluginsCount', counts?.plugins ?? 0);

	return new class extends mock<IAICustomizationItemsModel>() {
		override getItems(section: ItemsModelSection) {
			return sectionItems.get(section)!;
		}
		override getCount(section: ItemsModelSection): IObservable<number> {
			const items = sectionItems.get(section)!;
			return observableValue(`${section}-count`, items.get().length);
		}
		override getPluginCount(): IObservable<number> {
			return pluginCount;
		}
	}();
}

function createMockMcpService(serverCount: number = 0): IMcpService {
	const MockServer = mock<IMcpServer>();
	const servers = observableValue<readonly IMcpServer[]>('mockMcpServers', Array.from({ length: serverCount }, () => new MockServer()));
	return new class extends mock<IMcpService>() {
		override readonly servers = servers;
	}();
}

function createMockHarnessService(hiddenSections: readonly string[] = []): ICustomizationHarnessService {
	const descriptor: IHarnessDescriptor = {
		id: 'fixture',
		label: 'Fixture',
		icon: ThemeIcon.fromId('vm'),
		hiddenSections,
		getStorageSourceFilter: () => ({ sources: [] }),
	};
	return new class extends mock<ICustomizationHarnessService>() {
		override readonly activeHarness = observableValue('mockActiveHarness', descriptor.id);
		override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('mockAvailableHarnesses', [descriptor]);
		override findHarnessById(id: string) { return id === descriptor.id ? descriptor : undefined; }
		override getActiveDescriptor() { return descriptor; }
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderWidget(ctx: ComponentFixtureContext, options?: { mcpServerCount?: number; collapsed?: boolean; counts?: ICustomizationCounts; hiddenSections?: readonly string[]; mode?: SessionsCustomizationsSidebarMode }): void {
	ctx.container.style.width = '300px';
	ctx.container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const actionViewItemService = new FixtureActionViewItemService();

	const configurationService = new TestConfigurationService();
	if (options?.mode !== undefined) {
		configurationService.setUserConfiguration(SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING, options.mode);
	}

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			// Register overrides AFTER registerWorkbenchServices so they take priority
			reg.defineInstance(IMenuService, new FixtureMenuService());
			reg.defineInstance(IActionViewItemService, actionViewItemService);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
				override readonly onDidVisibleEditorsChange = Event.None;
				override readonly onDidEditorsChange = Event.None;
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly activeSession = observableValue('mockActiveSession', undefined);
			}());
			reg.defineInstance(IAICustomizationItemsModel, createMockItemsModel(options?.counts));
			reg.defineInstance(ICustomizationHarnessService, createMockHarnessService(options?.hiddenSections));
			reg.defineInstance(IMcpService, createMockMcpService(options?.mcpServerCount ?? 0));
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly never[]>('mockPlugins', []);
			}());
		},
	});

	// Register view item factories from the real CustomizationLinkViewItem
	for (const config of CUSTOMIZATION_ITEMS) {
		ctx.disposableStore.add(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
			return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
		}));
	}

	// Override storage to set initial collapsed state
	if (options?.collapsed) {
		const storageService = instantiationService.get(IStorageService);
		instantiationService.set(IStorageService, new class extends mock<IStorageService>() {
			override getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean) {
				if (key === 'agentSessions.customizationsCollapsed') {
					return true;
				}
				return storageService.getBoolean(key, scope, fallbackValue!);
			}
			override store() { }
		}());
	}

	ctx.disposableStore.add(
		instantiationService.createInstance(AICustomizationShortcutsWidget, ctx.container, undefined)
	);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	Expanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx),
	}),

	Collapsed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, { collapsed: true }),
	}),

	WithMcpServers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, { mcpServerCount: 3 }),
	}),

	CollapsedWithMcpServers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, { mcpServerCount: 3, collapsed: true }),
	}),

	WithCounts: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			mcpServerCount: 2,
			counts: { agents: 2, skills: 30, instructions: 16, hooks: 4 },
		}),
	}),

	// --- Sidebar mode variations ---

	ModeWelcome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			mode: SessionsCustomizationsSidebarMode.Welcome,
			mcpServerCount: 2,
			counts: { agents: 2, skills: 30, instructions: 16, hooks: 4 },
		}),
	}),

	ModeSection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			mode: SessionsCustomizationsSidebarMode.Section,
			mcpServerCount: 2,
			counts: { agents: 2, skills: 30, instructions: 16, hooks: 4 },
		}),
	}),

	ModeSingle: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			mode: SessionsCustomizationsSidebarMode.Single,
			mcpServerCount: 2,
			counts: { agents: 2, skills: 30, instructions: 16, hooks: 4 },
		}),
	}),

	ModeSingleEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			mode: SessionsCustomizationsSidebarMode.Single,
		}),
	}),
});
