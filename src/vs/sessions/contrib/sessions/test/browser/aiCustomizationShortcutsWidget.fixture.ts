/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuActionOptions, IMenuService, isIMenuItem, MenuId, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpServer, IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService, IStorageSourceFilter } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { CUSTOMIZATION_ITEMS, CustomizationLinkViewItem } from '../../browser/customizationsToolbar.contribution.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../browser/sessionsManagementService.js';
import { Menus } from '../../../../browser/menus.js';

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
// (MockContextKeyService.contextMatchesRules always returns false, which hides
// every item when using the real MenuService.)
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
// Mock helpers
// ============================================================================

const defaultFilter: IStorageSourceFilter = {
	sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension],
};

function createMockPromptsService(): IPromptsService {
	return createMockPromptsServiceWithCounts();
}

interface ICustomizationCounts {
	readonly agents?: number;
	readonly skills?: number;
	readonly instructions?: number;
	readonly prompts?: number;
	readonly hooks?: number;
}

function createMockPromptsServiceWithCounts(counts?: ICustomizationCounts): IPromptsService {
	const fakeUri = (prefix: string, i: number) => URI.parse(`file:///mock/${prefix}-${i}.md`);
	const fakeItem = (prefix: string, i: number) => ({ uri: fakeUri(prefix, i), storage: PromptsStorage.local });

	const agents = Array.from({ length: counts?.agents ?? 0 }, (_, i) => ({
		uri: fakeUri('agent', i),
		source: { storage: PromptsStorage.local },
	}));
	const skills = Array.from({ length: counts?.skills ?? 0 }, (_, i) => fakeItem('skill', i));
	const prompts = Array.from({ length: counts?.prompts ?? 0 }, (_, i) => ({
		promptPath: { uri: fakeUri('prompt', i), storage: PromptsStorage.local, type: PromptsType.prompt },
	}));
	const instructions = Array.from({ length: counts?.instructions ?? 0 }, (_, i) => fakeItem('instructions', i));
	const hooks = Array.from({ length: counts?.hooks ?? 0 }, (_, i) => fakeItem('hook', i));

	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override async getCustomAgents() { return agents as never[]; }
		override async findAgentSkills() { return skills as never[]; }
		override async getPromptSlashCommands() { return prompts as never[]; }
		override async listPromptFiles(type: PromptsType) {
			return (type === PromptsType.hook ? hooks : instructions) as never[];
		}
		override async listAgentInstructions() { return [] as never[]; }
	}();
}

function createMockMcpService(serverCount: number = 0): IMcpService {
	const MockServer = mock<IMcpServer>();
	const servers = observableValue<readonly IMcpServer[]>('mockMcpServers', Array.from({ length: serverCount }, () => new MockServer()));
	return new class extends mock<IMcpService>() {
		override readonly servers = servers;
	}();
}

function createMockWorkspaceService(): IAICustomizationWorkspaceService {
	const activeProjectRoot = observableValue<URI | undefined>('mockActiveProjectRoot', undefined);
	return new class extends mock<IAICustomizationWorkspaceService>() {
		override readonly activeProjectRoot = activeProjectRoot;
		override getActiveProjectRoot() { return undefined; }
		override getStorageSourceFilter() { return defaultFilter; }
	}();
}

function createMockWorkspaceContextService(): IWorkspaceContextService {
	return new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace(): IWorkspace { return { id: 'test', folders: [] }; }
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderWidget(ctx: ComponentFixtureContext, options?: { mcpServerCount?: number; collapsed?: boolean; counts?: ICustomizationCounts }): void {
	ctx.container.style.width = '300px';
	ctx.container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const actionViewItemService = new FixtureActionViewItemService();

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Register overrides BEFORE registerWorkbenchServices so they take priority
			reg.defineInstance(IMenuService, new FixtureMenuService());
			reg.defineInstance(IActionViewItemService, actionViewItemService);
			registerWorkbenchServices(reg);
			// Services needed by AICustomizationShortcutsWidget
			reg.defineInstance(IPromptsService, options?.counts ? createMockPromptsServiceWithCounts(options.counts) : createMockPromptsService());
			reg.defineInstance(IMcpService, createMockMcpService(options?.mcpServerCount ?? 0));
			reg.defineInstance(IAICustomizationWorkspaceService, createMockWorkspaceService());
			reg.defineInstance(IWorkspaceContextService, createMockWorkspaceContextService());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly never[]>('mockPlugins', []);
				override readonly allPlugins = observableValue<readonly never[]>('mockAllPlugins', []);
			}());
			// Additional services needed by CustomizationLinkViewItem
			reg.defineInstance(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
				override readonly onDidChangeLanguageModels = Event.None;
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly activeSession = observableValue<IActiveSessionItem | undefined>('activeSession', undefined);
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
			}());
		},
	});

	// Register view item factories from the real CustomizationLinkViewItem (per-render, instance-scoped)
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

	// Create the widget (uses FixtureMenuService → reads MenuRegistry items registered above)
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
			counts: { agents: 2, skills: 30, instructions: 16, prompts: 17, hooks: 4 },
		}),
	}),
});
