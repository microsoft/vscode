/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatWidgetHistoryService } from '../../../../contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IChatContextPickService } from '../../../../contrib/chat/browser/attachments/chatContextPickService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatAttachmentResolveService } from '../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatAttachmentWidgetRegistry } from '../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatContextService } from '../../../../contrib/chat/browser/contextContrib/chatContextService.js';
import { ChatInputPart } from '../../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatArtifactsService } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatTodoListService } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatModeService } from '../../../../contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../contrib/chat/common/languageModels.js';
import { IChatAgentService } from '../../../../contrib/chat/common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUpdateService } from '../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ISCMService } from '../../../../contrib/scm/common/scm.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import '../../../../contrib/chat/browser/widget/media/chat.css';
let FixtureMenuService = class FixtureMenuService {
    constructor(_contextKeyService, _commandService) {
        this._contextKeyService = _contextKeyService;
        this._commandService = _commandService;
        this._items = new Map();
    }
    addItem(menuId, item) {
        const key = menuId.id;
        let items = this._items.get(key);
        if (!items) {
            items = [];
            this._items.set(key, items);
        }
        items.push(item);
    }
    createMenu(id) {
        const actions = [];
        for (const item of this._items.get(id.id) ?? []) {
            const group = item.group ?? '';
            let entry = actions.find(a => a[0] === group);
            if (!entry) {
                entry = [group, []];
                actions.push(entry);
            }
            entry[1].push(new MenuItemAction(item.command, item.alt, {}, undefined, undefined, this._contextKeyService, this._commandService));
        }
        return { onDidChange: Event.None, dispose() { }, getActions: () => actions };
    }
    getMenuActions() { return []; }
    getMenuContexts() { return new Set(); }
    resetHiddenStates() { }
};
FixtureMenuService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ICommandService)
], FixtureMenuService);
async function renderChatInput(context, fixtureOptions = {}) {
    const { container, disposableStore } = context;
    const { artifacts = [], editingSession, todos = [] } = fixtureOptions;
    const artifactsObs = observableValue('artifacts', artifacts);
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: context.theme,
        additionalServices: (reg) => {
            reg.define(IMenuService, FixtureMenuService);
            registerWorkbenchServices(reg);
            // eslint-disable-next-line local/code-no-dangerous-type-assertions
            reg.defineInstance(ITextModelService, new class extends mock() {
                async createModelReference() { return { object: { textEditorModel: null }, dispose() { } }; }
            }());
            reg.defineInstance(IDecorationsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeDecorations = Event.None;
                }
            }());
            reg.defineInstance(ITextFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.untitled = new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.onDidChangeLabel = Event.None;
                        }
                    }();
                }
            }());
            reg.defineInstance(ILanguageModelsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeLanguageModels = Event.None;
                }
                getLanguageModelIds() { return []; }
            }());
            reg.defineInstance(IFileService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidFilesChange = Event.None;
                    this.onDidRunOperation = Event.None;
                }
            }());
            reg.defineInstance(IEditorService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidActiveEditorChange = Event.None;
                }
            }());
            reg.defineInstance(IChatAgentService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeAgents = Event.None;
                }
                getAgents() { return []; }
                getActivatedAgents() { return []; }
            }());
            reg.defineInstance(ISharedWebContentExtractorService, new class extends mock() {
            }());
            reg.defineInstance(IWorkbenchAssignmentService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidRefetchAssignments = Event.None;
                }
                async getCurrentExperiments() { return []; }
                async getTreatment() { return undefined; }
            }());
            reg.defineInstance(IChatEntitlementService, new class extends mock() {
            }());
            reg.defineInstance(IChatModeService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeChatModes = Event.None;
                }
                getModes() { return { builtin: [], custom: [] }; }
                findModeById() { return undefined; }
            }());
            reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeTools = Event.None;
                }
                getTools() { return []; }
            }());
            reg.defineInstance(IChatService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidSubmitRequest = Event.None;
                }
            }());
            reg.defineInstance(IChatSessionsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeSessionOptions = Event.None;
                    this.onDidChangeOptionGroups = Event.None;
                    this.onDidChangeAvailability = Event.None;
                }
                getAllChatSessionContributions() { return []; }
            }());
            reg.defineInstance(IChatContextService, new class extends mock() {
            }());
            reg.defineInstance(IAgentSessionsService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.model = new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.onDidChangeSessions = Event.None;
                        }
                    }();
                }
            }());
            reg.defineInstance(IWorkspaceContextService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeWorkspaceFolders = Event.None;
                }
                getWorkspace() { return { id: '', folders: [], configuration: undefined }; }
            }());
            reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangePartVisibility = Event.None;
                    this.onDidChangeWindowMaximized = Event.None;
                }
                isVisible() { return true; }
            }());
            reg.defineInstance(IViewDescriptorService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeLocation = Event.None;
                }
            }());
            reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock() {
            }());
            reg.defineInstance(IChatAttachmentResolveService, new class extends mock() {
            }());
            reg.defineInstance(IExtensionService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeExtensions = Event.None;
                }
            }());
            reg.defineInstance(IPathService, new class extends mock() {
            }());
            reg.defineInstance(IChatWidgetHistoryService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidChangeHistory = Event.None;
                }
                getHistory() { return []; }
            }());
            reg.defineInstance(IChatContextPickService, new class extends mock() {
            }());
            reg.defineInstance(IListService, new ListService());
            reg.defineInstance(INotebookDocumentService, new class extends mock() {
            }());
            reg.defineInstance(ISCMService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidAddRepository = Event.None;
                    this.onDidRemoveRepository = Event.None;
                    this.repositories = [];
                    this.repositoryCount = 0;
                }
            }());
            reg.defineInstance(IActionWidgetService, new class extends mock() {
                show() { }
                hide() { }
                get isVisible() { return false; }
            }());
            reg.defineInstance(IProductService, new class extends mock() {
            }());
            reg.defineInstance(IUpdateService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onStateChange = Event.None;
                }
                get state() { return { type: "uninitialized" /* StateType.Uninitialized */ }; }
            }());
            reg.defineInstance(IUriIdentityService, new class extends mock() {
            }());
            reg.defineInstance(IChatArtifactsService, new class extends mock() {
                getArtifacts() {
                    const mutableObs = observableValue('mutable', true);
                    return new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.artifacts = artifactsObs;
                            this.mutable = mutableObs;
                        }
                        set() { }
                        clear() { }
                        migrate() { }
                    }();
                }
            }());
            reg.defineInstance(IChatTodoListService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidUpdateTodos = Event.None;
                }
                getTodos() { return [...todos]; }
                setTodos() { }
                migrateTodos() { }
            }());
        },
    });
    if (artifacts.length > 0) {
        const configService = instantiationService.get(IConfigurationService);
        await configService.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, true);
    }
    container.style.width = '500px';
    container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
    container.classList.add('monaco-workbench');
    const session = document.createElement('div');
    session.classList.add('interactive-session');
    container.appendChild(session);
    const menuService = instantiationService.get(IMenuService);
    menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.attachContext', title: '+', icon: Codicon.add }, group: 'navigation', order: -1 });
    menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModePicker', title: 'Agent' }, group: 'navigation', order: 1 });
    menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModelPicker', title: 'GPT-5.3-Codex' }, group: 'navigation', order: 3 });
    menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.configureTools', title: '', icon: Codicon.settingsGear }, group: 'navigation', order: 100 });
    menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.arrowUp }, group: 'navigation', order: 4 });
    menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openSessionTargetPicker', title: 'Local' }, group: 'navigation', order: 0 });
    menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Approvals' }, group: 'navigation', order: 10 });
    const options = {
        renderFollowups: false,
        renderInputToolbarBelowInput: false,
        renderWorkingSet: !!editingSession,
        menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: 'fixture' },
        widgetViewKindTag: 'view',
        inputEditorMinLines: 2,
    };
    const styles = {
        overlayBackground: 'var(--vscode-editor-background)',
        listForeground: 'var(--vscode-foreground)',
        listBackground: 'var(--vscode-editor-background)',
    };
    try {
        const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, options, styles, false));
        const mockWidget = new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidChangeViewModel = new Emitter().event;
                this.viewModel = undefined;
                this.contribs = [];
                this.location = ChatAgentLocation.Chat;
                this.viewContext = {};
            }
        }();
        inputPart.render(session, '', mockWidget);
        inputPart.layout(500);
        await new Promise(r => setTimeout(r, 100));
        inputPart.layout(500);
        inputPart.renderArtifactsWidget(URI.parse('chat-session:test-session'));
        await inputPart.renderChatTodoListWidget(URI.parse('chat-session:test-session'));
        await new Promise(r => setTimeout(r, 50));
        if (editingSession) {
            inputPart.renderChatEditingSessionState(editingSession);
            await new Promise(r => setTimeout(r, 50));
            inputPart.layout(500);
        }
    }
    catch (e) {
        const err = document.createElement('pre');
        err.style.cssText = 'color:red;font-size:11px;white-space:pre-wrap';
        err.textContent = `Render error: ${e instanceof Error ? e.message : String(e)}`;
        session.appendChild(err);
    }
}
const sampleArtifacts = [
    { label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
    { label: 'Screenshot', uri: 'file:///tmp/screenshot.png', type: 'screenshot' },
    { label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' },
];
function createMockEditingSession(files) {
    const entries = files.map(f => {
        const entry = new class extends mock() {
            constructor() {
                super(...arguments);
                this.entryId = f.uri;
                this.modifiedURI = URI.parse(f.uri);
                this.originalURI = URI.parse(f.uri);
                this.state = observableValue('state', 0 /* ModifiedFileEntryState.Modified */);
                this.linesAdded = observableValue('linesAdded', f.added);
                this.linesRemoved = observableValue('linesRemoved', f.removed);
                this.lastModifyingRequestId = 'request-1';
                this.changesCount = observableValue('changesCount', 1);
                this.isCurrentlyBeingModifiedBy = observableValue('isCurrentlyBeingModifiedBy', undefined);
                this.lastModifyingResponse = observableValue('lastModifyingResponse', undefined);
                this.rewriteRatio = observableValue('rewriteRatio', 0);
                this.waitsForLastEdits = observableValue('waitsForLastEdits', false);
                this.reviewMode = observableValue('reviewMode', false);
                this.autoAcceptController = observableValue('autoAcceptController', undefined);
            }
        }();
        return entry;
    });
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.isGlobalEditingSession = false;
            this.chatSessionResource = URI.parse('chat-session:test-session');
            this.onDidDispose = Event.None;
            this.state = observableValue('state', 2 /* ChatEditingSessionState.Idle */);
            this.entries = observableValue('entries', entries);
            this.requestDisablement = observableValue('requestDisablement', []);
        }
    }();
}
const sampleTodos = [
    { id: 1, title: 'Set up project structure', status: 'completed' },
    { id: 2, title: 'Implement auth service', status: 'in-progress' },
    { id: 3, title: 'Add unit tests', status: 'not-started' },
];
export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
    Default: defineComponentFixture({ render: context => renderChatInput(context) }),
    WithArtifacts: defineComponentFixture({ render: context => renderChatInput(context, { artifacts: sampleArtifacts }) }),
    WithFileChanges: defineComponentFixture({
        render: context => renderChatInput(context, { editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
    }),
    WithTodos: defineComponentFixture({
        render: context => renderChatInput(context, { todos: sampleTodos })
    }),
    WithTodosAndFileChanges: defineComponentFixture({
        render: context => renderChatInput(context, { todos: sampleTodos, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
    }),
    WithArtifactsAndFileChanges: defineComponentFixture({
        render: context => renderChatInput(context, { artifacts: sampleArtifacts, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
    }),
    Full: defineComponentFixture({
        render: context => renderChatInput(context, {
            artifacts: sampleArtifacts,
            editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]),
            todos: sampleTodos,
        })
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0LmZpeHR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2NoYXQvY2hhdElucHV0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFlBQVksRUFBUyxNQUFNLEVBQUUsY0FBYyxFQUFhLE1BQU0sbURBQW1ELENBQUM7QUFDM0gsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUM5SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUs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