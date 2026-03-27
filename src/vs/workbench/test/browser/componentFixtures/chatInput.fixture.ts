/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IMenuService, IMenu, MenuId, MenuItemAction, IMenuItem } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IChatWidgetHistoryService } from '../../../contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IChatContextPickService } from '../../../contrib/chat/browser/attachments/chatContextPickService.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatWidget } from '../../../contrib/chat/browser/chat.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatAttachmentResolveService } from '../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatAttachmentWidgetRegistry } from '../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatContextService } from '../../../contrib/chat/browser/contextContrib/chatContextService.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatArtifacts, IChatArtifactsService } from '../../../contrib/chat/common/tools/chatArtifactsService.js';
import { ChatEditingSessionState, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatRequestDisablement } from '../../../contrib/chat/common/model/chatModel.js';
import { IChatTodo, IChatTodoListService } from '../../../contrib/chat/common/tools/chatTodoListService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IChatModeService } from '../../../contrib/chat/common/chatModes.js';
import { IChatService } from '../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { IChatAgentService } from '../../../contrib/chat/common/participants/chatAgents.js';
import { ILanguageModelToolsService } from '../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { INotebookDocumentService } from '../../../services/notebook/common/notebookDocumentService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';

import '../../../contrib/chat/browser/widget/media/chat.css';

class FixtureMenuService implements IMenuService {
	declare readonly _serviceBrand: undefined;
	private readonly _items = new Map<string, IMenuItem[]>();
	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
	) { }
	addItem(menuId: MenuId, item: IMenuItem): void {
		const key = menuId.id;
		let items = this._items.get(key);
		if (!items) {
			items = [];
			this._items.set(key, items);
		}
		items.push(item);
	}
	createMenu(id: MenuId): IMenu {
		const actions: [string, MenuItemAction[]][] = [];
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
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

interface ChatInputFixtureOptions {
	readonly artifacts?: readonly { label: string; uri: string; type: 'devServer' | 'screenshot' | 'plan' | undefined }[];
	readonly editingSession?: IChatEditingSession;
	readonly todos?: IChatTodo[];
}

async function renderChatInput(context: ComponentFixtureContext, fixtureOptions: ChatInputFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	const { artifacts = [], editingSession, todos = [] } = fixtureOptions;
	const artifactsObs = observableValue<readonly typeof artifacts[number][]>('artifacts', artifacts);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IMenuService, FixtureMenuService);
			registerWorkbenchServices(reg);
			// eslint-disable-next-line local/code-no-dangerous-type-assertions
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() { override async createModelReference() { return { object: { textEditorModel: null }, dispose() { } } as unknown as Awaited<ReturnType<ITextModelService['createModelReference']>>; } }());
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(ILanguageModelsService, new class extends mock<ILanguageModelsService>() { override onDidChangeLanguageModels = Event.None; override getLanguageModelIds() { return []; } }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; }());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { override onDidActiveEditorChange = Event.None; }());
			reg.defineInstance(IChatAgentService, new class extends mock<IChatAgentService>() { override onDidChangeAgents = Event.None; override getAgents() { return []; } override getActivatedAgents() { return []; } }());
			reg.defineInstance(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
			reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() { override async getCurrentExperiments() { return []; } override async getTreatment() { return undefined; } override onDidRefetchAssignments = Event.None; }());
			reg.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() { }());
			reg.defineInstance(IChatModeService, new class extends mock<IChatModeService>() { override readonly onDidChangeChatModes = Event.None; override getModes() { return { builtin: [], custom: [] }; } override findModeById() { return undefined; } }());
			reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() { override onDidChangeTools = Event.None; override getTools() { return []; } }());
			reg.defineInstance(IChatService, new class extends mock<IChatService>() { override onDidSubmitRequest = Event.None; }());
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() { override getAllChatSessionContributions() { return []; } override readonly onDidChangeSessionOptions = Event.None; override readonly onDidChangeOptionGroups = Event.None; override readonly onDidChangeAvailability = Event.None; }());
			reg.defineInstance(IChatContextService, new class extends mock<IChatContextService>() { }());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() { override readonly model = new class extends mock<IAgentSessionsService['model']>() { override readonly onDidChangeSessions = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() { override onDidChangePartVisibility = Event.None; override onDidChangeWindowMaximized = Event.None; override isVisible() { return true; } }());
			reg.defineInstance(IViewDescriptorService, new class extends mock<IViewDescriptorService>() { override onDidChangeLocation = Event.None; }());
			reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock<IChatAttachmentWidgetRegistry>() { }());
			reg.defineInstance(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { override readonly onDidChangeExtensions = Event.None; }());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() { }());
			reg.defineInstance(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() { override getHistory() { return []; } override readonly onDidChangeHistory = Event.None; }());
			reg.defineInstance(IChatContextPickService, new class extends mock<IChatContextPickService>() { }());
			reg.defineInstance(IListService, new ListService());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { }());
			reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() { override show() { } override hide() { } override get isVisible() { return false; } }());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() { }());
			reg.defineInstance(IUpdateService, new class extends mock<IUpdateService>() { override onStateChange = Event.None; override get state() { return { type: StateType.Uninitialized as const }; } }());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() { }());
			reg.defineInstance(IChatArtifactsService, new class extends mock<IChatArtifactsService>() {
				override getArtifacts(): IChatArtifacts {
					const mutableObs = observableValue<boolean>('mutable', true);
					return new class extends mock<IChatArtifacts>() {
						override readonly artifacts = artifactsObs;
						override readonly mutable = mutableObs;
						override set() { }
						override clear() { }
						override migrate() { }
					}();
				}
			}());
			reg.defineInstance(IChatTodoListService, new class extends mock<IChatTodoListService>() {
				override readonly onDidUpdateTodos = Event.None;
				override getTodos() { return [...todos]; }
				override setTodos() { }
				override migrateTodos() { }
			}());
		},
	});

	if (artifacts.length > 0) {
		const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configService.setUserConfiguration(ChatConfiguration.ArtifactsEnabled, true);
	}

	container.style.width = '500px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.classList.add('monaco-workbench');

	const session = document.createElement('div');
	session.classList.add('interactive-session');
	container.appendChild(session);

	const menuService = instantiationService.get(IMenuService) as FixtureMenuService;
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.attachContext', title: '+', icon: Codicon.add }, group: 'navigation', order: -1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModePicker', title: 'Agent' }, group: 'navigation', order: 1 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.openModelPicker', title: 'GPT-5.3-Codex' }, group: 'navigation', order: 3 });
	menuService.addItem(MenuId.ChatInput, { command: { id: 'workbench.action.chat.configureTools', title: '', icon: Codicon.settingsGear }, group: 'navigation', order: 100 });
	menuService.addItem(MenuId.ChatExecute, { command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.arrowUp }, group: 'navigation', order: 4 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openSessionTargetPicker', title: 'Local' }, group: 'navigation', order: 0 });
	menuService.addItem(MenuId.ChatInputSecondary, { command: { id: 'workbench.action.chat.openPermissionPicker', title: 'Default Approvals' }, group: 'navigation', order: 10 });

	const options: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: !!editingSession,
		menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: 'fixture' },
		widgetViewKindTag: 'view',
		inputEditorMinLines: 2,
	};
	const styles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-editor-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground: 'var(--vscode-editor-background)',
	};

	try {
		const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, options, styles, false));
		const mockWidget = new class extends mock<IChatWidget>() {
			override readonly onDidChangeViewModel = new Emitter<never>().event;
			override readonly viewModel = undefined;
			override readonly contribs = [];
			override readonly location = ChatAgentLocation.Chat;
			override readonly viewContext = {};
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
	} catch (e) {
		const err = document.createElement('pre');
		err.style.cssText = 'color:red;font-size:11px;white-space:pre-wrap';
		err.textContent = `Render error: ${e instanceof Error ? e.message : String(e)}`;
		session.appendChild(err);
	}
}

const sampleArtifacts = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' as const },
	{ label: 'Screenshot', uri: 'file:///tmp/screenshot.png', type: 'screenshot' as const },
	{ label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' as const },
];

function createMockEditingSession(files: { uri: string; added: number; removed: number }[]): IChatEditingSession {
	const entries = files.map(f => {
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly entryId = f.uri;
			override readonly modifiedURI = URI.parse(f.uri);
			override readonly originalURI = URI.parse(f.uri);
			override readonly state = observableValue('state', ModifiedFileEntryState.Modified);
			override readonly linesAdded = observableValue('linesAdded', f.added);
			override readonly linesRemoved = observableValue('linesRemoved', f.removed);
			override readonly lastModifyingRequestId = 'request-1';
			override readonly changesCount = observableValue('changesCount', 1);
			override readonly isCurrentlyBeingModifiedBy = observableValue('isCurrentlyBeingModifiedBy', undefined);
			override readonly lastModifyingResponse = observableValue('lastModifyingResponse', undefined);
			override readonly rewriteRatio = observableValue('rewriteRatio', 0);
			override readonly waitsForLastEdits = observableValue('waitsForLastEdits', false);
			override readonly reviewMode = observableValue('reviewMode', false);
			override readonly autoAcceptController = observableValue('autoAcceptController', undefined);
		}();
		return entry;
	});

	return new class extends mock<IChatEditingSession>() {
		override readonly isGlobalEditingSession = false;
		override readonly chatSessionResource = URI.parse('chat-session:test-session');
		override readonly onDidDispose = Event.None;
		override readonly state = observableValue('state', ChatEditingSessionState.Idle);
		override readonly entries = observableValue('entries', entries);
		override readonly requestDisablement = observableValue<IChatRequestDisablement[]>('requestDisablement', []);
	}();
}

const sampleTodos: IChatTodo[] = [
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
