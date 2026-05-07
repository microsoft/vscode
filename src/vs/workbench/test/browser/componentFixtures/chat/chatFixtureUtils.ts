/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IMenu, IMenuItem, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ISCMService } from '../../../../contrib/scm/common/scm.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatAttachmentWidgetRegistry } from '../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatContextPickService } from '../../../../contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatContextService } from '../../../../contrib/chat/browser/contextContrib/chatContextService.js';
import { IChatImageCarouselService } from '../../../../contrib/chat/browser/chatImageCarouselService.js';
import { IChatInputNotificationService } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatWidgetHistoryService } from '../../../../contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IChatModeService } from '../../../../contrib/chat/common/chatModes.js';
import { MockChatModeService } from '../../../../contrib/chat/test/common/mockChatModeService.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { Target } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../contrib/chat/common/languageModels.js';
import { ChatAgentService, IChatAgent, IChatAgentNameService, IChatAgentService } from '../../../../contrib/chat/common/participants/chatAgents.js';
import { MockChatService } from '../../../../contrib/chat/test/common/chatService/mockChatService.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IArtifactSourceGroup, IChatArtifacts, IChatArtifactsService } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatTodo, IChatTodoListService } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { IChatToolRiskAssessmentService } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ServiceRegistration, registerWorkbenchServices } from '../fixtureUtils.js';

/**
 * A minimal IMenuService implementation backed by an in-memory map. Tests can
 * register menu items with addItem() before the component renders the menu.
 */
export class FixtureMenuService implements IMenuService {
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

export interface IChatFixtureServicesOptions {
	/** Observable backing IChatArtifactsService.getArtifacts().artifactGroups. */
	readonly artifactGroups?: IObservable<readonly IArtifactSourceGroup[]>;
	/** Initial todos returned from IChatTodoListService.getTodos(). */
	readonly todos?: readonly IChatTodo[];
}

/**
 * Registers the wide set of service mocks needed to instantiate chat widgets
 * (input part, list widget, content parts). All of these are no-op mocks
 * suitable for fixtures.
 *
 * Callers can override any service by registering it again after this call.
 */
export function registerChatFixtureServices(reg: ServiceRegistration, options: IChatFixtureServicesOptions = {}): void {
	registerWorkbenchServices(reg);
	reg.define(IMenuService, FixtureMenuService);
	reg.define(IMarkdownRendererService, MarkdownRendererService);
	reg.define(IListService, ListService);

	reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
	reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
	reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; override hasProvider() { return false; } }());
	reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { override onDidActiveEditorChange = Event.None; }());
	reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { override readonly onDidChangeExtensions = Event.None; }());
	reg.defineInstance(IPathService, new class extends mock<IPathService>() { }());
	reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() { override async getCurrentExperiments() { return []; } override async getTreatment() { return undefined; } override onDidRefetchAssignments = Event.None; }());
	reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
	reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() { override onDidChangePartVisibility = Event.None; override onDidChangeWindowMaximized = Event.None; override isVisible() { return true; } }());
	reg.defineInstance(IViewDescriptorService, new class extends mock<IViewDescriptorService>() { override onDidChangeLocation = Event.None; }());
	reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { }());
	reg.defineInstance(ISCMService, new class extends mock<ISCMService>() {
		override readonly onDidAddRepository = Event.None;
		override readonly onDidRemoveRepository = Event.None;
		override readonly repositories = [];
		override readonly repositoryCount = 0;
	}());
	reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
	reg.defineInstance(IProductService, new class extends mock<IProductService>() { }());
	reg.defineInstance(IUpdateService, new class extends mock<IUpdateService>() { override onStateChange = Event.None; override get state() { return { type: StateType.Uninitialized as const }; } }());
	reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() { }());
	reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() { override show() { } override hide() { } override get isVisible() { return false; } }());
	reg.defineInstance(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
	reg.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() { override getOpenAriaHint() { return null; } }());

	// Chat services
	reg.define(IChatAgentService, class FixtureChatAgentService extends ChatAgentService {
		override getDefaultAgent(): IChatAgent {
			// eslint-disable-next-line local/code-no-dangerous-type-assertions
			return { fullName: 'GitHub Copilot', id: 'githubCopilot' } as unknown as IChatAgent;
		}
	});
	reg.defineInstance(IChatAgentNameService, new class extends mock<IChatAgentNameService>() {
		override getAgentNameRestriction() { return true; }
	}());
	reg.define(IChatService, MockChatService);
	reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
		override readonly lastFocusedWidget = undefined;
		override readonly onDidAddWidget = Event.None;
		override readonly onDidBackgroundSession = Event.None;
		override readonly onDidChangeFocusedWidget = Event.None;
		override readonly onDidChangeFocusedSession = Event.None;
		override getAllWidgets(): readonly IChatWidget[] { return []; }
		override getWidgetByInputUri() { return undefined; }
		override getWidgetBySessionResource() { return undefined; }
		override getWidgetsByLocations() { return []; }
		override register() { return { dispose() { } }; }
	}());
	reg.defineInstance(IChatAccessibilityService, new class extends mock<IChatAccessibilityService>() {
		override acceptRequest() { }
		override disposeRequest() { }
		override acceptResponse() { }
		override acceptElicitation() { }
	}());
	reg.defineInstance(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
		override readonly isExtensionDevelopment = false;
		override readonly isBuilt = true;
		override readonly isSessionsWindow = false;
	}());
	reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() { override getAllChatSessionContributions() { return []; } override readonly onDidChangeSessionOptions = Event.None; override readonly onDidChangeOptionGroups = Event.None; override readonly onDidChangeAvailability = Event.None; override getCustomAgentTargetForSessionType() { return Target.Undefined; } override requiresCustomModelsForSessionType() { return false; } override getOptionGroupsForSessionType() { return []; } }());
	reg.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() { }());
	reg.defineInstance(IChatModeService, new MockChatModeService());
	reg.defineInstance(ILanguageModelsService, new class extends mock<ILanguageModelsService>() { override onDidChangeLanguageModels = Event.None; override getLanguageModelIds() { return []; } override getVendors() { return []; } override hasResolvedVendor() { return false; } }());
	reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() { override onDidChangeTools = Event.None; override onDidPrepareToolCallBecomeUnresponsive = Event.None; override getTools() { return []; } }());
	reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {
		override isEnabled() { return false; }
		override getCached() { return undefined; }
		override async assess() { return undefined; }
	}());
	reg.defineInstance(IChatContextService, new class extends mock<IChatContextService>() { }());
	reg.defineInstance(IChatContextPickService, new class extends mock<IChatContextPickService>() { }());
	reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock<IChatAttachmentWidgetRegistry>() { }());
	reg.defineInstance(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());
	reg.defineInstance(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() { override getHistory() { return []; } override readonly onDidChangeHistory = Event.None; }());
	reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { }());
	reg.defineInstance(IChatMarkdownAnchorService, new class extends mock<IChatMarkdownAnchorService>() { override register() { return { dispose() { } }; } }());
	reg.defineInstance(IChatInputNotificationService, new class extends mock<IChatInputNotificationService>() {
		override readonly onDidChange = Event.None;
		override getActiveNotification() { return undefined; }
	}());
	reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() { override readonly model = new class extends mock<IAgentSessionsService['model']>() { override readonly onDidChangeSessions = Event.None; }(); }());

	const artifactGroups = options.artifactGroups ?? observableValue<readonly IArtifactSourceGroup[]>('artifactGroups', []);
	reg.defineInstance(IChatArtifactsService, new class extends mock<IChatArtifactsService>() {
		override getArtifacts(): IChatArtifacts {
			return new class extends mock<IChatArtifacts>() {
				override readonly artifactGroups = artifactGroups;
				override setAgentArtifacts() { }
				override clearAgentArtifacts() { }
				override clearSubagentArtifacts() { }
				override migrate() { }
			}();
		}
	}());

	const todos = [...(options.todos ?? [])];
	reg.defineInstance(IChatTodoListService, new class extends mock<IChatTodoListService>() {
		override readonly onDidUpdateTodos = Event.None;
		override getTodos() { return [...todos]; }
		override setTodos() { }
		override migrateTodos() { }
	}());
}
