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
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpService } from '../../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { CUSTOMIZATION_ITEMS, CustomizationLinkViewItem } from '../../browser/customizationsToolbar.contribution.js';
import { ISessionsManagementService } from '../../browser/sessionsManagementService.js';
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
class FixtureMenuService {
    createMenu(id) {
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
                return actions.length ? [['navigation', actions]] : [];
            },
        };
    }
    getMenuActions(_id, _contextKeyService, _options) { return []; }
    getMenuContexts() { return new Set(); }
    resetHiddenStates() { }
}
// ============================================================================
// Minimal IActionViewItemService that supports register/lookUp
// ============================================================================
class FixtureActionViewItemService {
    constructor() {
        this._providers = new Map();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
    }
    register(menu, commandId, provider) {
        const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
        this._providers.set(key, provider);
        return { dispose: () => { this._providers.delete(key); } };
    }
    lookUp(menu, commandId) {
        const key = `${menu.id}/${commandId instanceof MenuId ? commandId.id : commandId}`;
        return this._providers.get(key);
    }
}
// ============================================================================
// Mock helpers
// ============================================================================
const defaultFilter = {
    sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension],
};
function createMockPromptsService() {
    return createMockPromptsServiceWithCounts();
}
function createMockPromptsServiceWithCounts(counts) {
    const fakeUri = (prefix, i) => URI.parse(`file:///mock/${prefix}-${i}.md`);
    const fakeItem = (prefix, i) => ({ uri: fakeUri(prefix, i), storage: PromptsStorage.local });
    const agents = Array.from({ length: counts?.agents ?? 0 }, (_, i) => ({
        uri: fakeUri('agent', i),
        source: { storage: PromptsStorage.local },
    }));
    const skills = Array.from({ length: counts?.skills ?? 0 }, (_, i) => fakeItem('skill', i));
    const prompts = Array.from({ length: counts?.prompts ?? 0 }, (_, i) => ({
        uri: fakeUri('prompt', i),
        name: `prompt-${i}`,
        type: PromptsType.prompt,
        storage: PromptsStorage.local,
        userInvocable: true,
        parsedPromptFile: undefined,
        when: undefined,
    }));
    const instructions = Array.from({ length: counts?.instructions ?? 0 }, (_, i) => fakeItem('instructions', i));
    const hooks = Array.from({ length: counts?.hooks ?? 0 }, (_, i) => fakeItem('hook', i));
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeCustomAgents = Event.None;
            this.onDidChangeSlashCommands = Event.None;
        }
        async getCustomAgents() { return agents; }
        async findAgentSkills() { return skills; }
        async getPromptSlashCommands() { return prompts; }
        async listPromptFiles(type) {
            return (type === PromptsType.hook ? hooks : instructions);
        }
        async listAgentInstructions() { return []; }
    }();
}
function createMockMcpService(serverCount = 0) {
    const MockServer = mock();
    const servers = observableValue('mockMcpServers', Array.from({ length: serverCount }, () => new MockServer()));
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.servers = servers;
        }
    }();
}
function createMockWorkspaceService() {
    const activeProjectRoot = observableValue('mockActiveProjectRoot', undefined);
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.activeProjectRoot = activeProjectRoot;
        }
        getActiveProjectRoot() { return undefined; }
        getStorageSourceFilter() { return defaultFilter; }
    }();
}
function createMockWorkspaceContextService() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() { return { id: 'test', folders: [] }; }
    }();
}
// ============================================================================
// Render helper
// ============================================================================
function renderWidget(ctx, options) {
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
            reg.defineInstance(IAgentPluginService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.plugins = observableValue('mockPlugins', []);
                }
            }());
            // Additional services needed by CustomizationLinkViewItem
            reg.defineInstance(ILanguageModelsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeLanguageModels = Event.None;
                }
            }());
            reg.defineInstance(ISessionsManagementService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.activeSession = observableValue('activeSession', undefined);
                }
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                }
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
        instantiationService.set(IStorageService, new class extends mock() {
            getBoolean(key, scope, fallbackValue) {
                if (key === 'agentSessions.customizationsCollapsed') {
                    return true;
                }
                return storageService.getBoolean(key, scope, fallbackValue);
            }
            store() { }
        }());
    }
    // Create the widget (uses FixtureMenuService → reads MenuRegistry items registered above)
    ctx.disposableStore.add(instantiationService.createInstance(AICustomizationShortcutsWidget, ctx.container, undefined));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uU2hvcnRjdXRzV2lkZ2V0LmZpeHR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9haUN1c3RvbWl6YXRpb25TaG9ydGN1dHNXaWRnZXQuZml4dHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUEwQixzQkFBc0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ2xJLE9BQU8sRUFBNkIsWUFBWSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQWtCLFlBQVksRUFBcUIsTUFBTSxtREFBbUQsQ0FBQztBQUNsTCxPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQWMsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLHFGQUFxRixDQUFDO0FBQ3RJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUN2RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUs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