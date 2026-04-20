/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IChatWidgetService, IChatAccessibilityService } from '../../../../contrib/chat/browser/chat.js';
import { IChatContextPickService } from '../../../../contrib/chat/browser/attachments/chatContextPickService.js';
import { IChatAttachmentResolveService } from '../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatAttachmentWidgetRegistry } from '../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatContextService } from '../../../../contrib/chat/browser/contextContrib/chatContextService.js';
import { IChatImageCarouselService } from '../../../../contrib/chat/browser/chatImageCarouselService.js';
import { IChatTipService } from '../../../../contrib/chat/browser/chatTipService.js';
import { ChatAgentLocation } from '../../../../contrib/chat/common/constants.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IChatModeService, ChatMode } from '../../../../contrib/chat/common/chatModes.js';
import { ILanguageModelsService } from '../../../../contrib/chat/common/languageModels.js';
import { IChatAgentService } from '../../../../contrib/chat/common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../../../../contrib/chat/common/participants/chatSlashCommands.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IChatArtifacts, IChatArtifactsService, IArtifactSourceGroup } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { IChatTodoListService } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { IChatDebugService } from '../../../../contrib/chat/common/chatDebugService.js';
import { IPromptsService } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { IChatWidgetHistoryService } from '../../../../contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IChatLayoutService } from '../../../../contrib/chat/common/widget/chatLayoutService.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ISCMService } from '../../../../contrib/scm/common/scm.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { InlineChatZoneWidget } from '../../../../contrib/inlineChat/browser/inlineChatZoneWidget.js';

// CSS imports
import '../../../../contrib/inlineChat/browser/media/inlineChat.css';
import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../../editor/contrib/zoneWidget/browser/zoneWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `import { useState, useEffect } from 'react';

interface User {
	id: number;
	name: string;
	email: string;
}

function useUsers() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/api/users')
			.then(res => res.json())
			.then(data => {
				setUsers(data);
				setLoading(false);
			});
	}, []);

	return { users, loading };
}

export function UserList() {
	const { users, loading } = useUsers();

	if (loading) {
		return <div>Loading...</div>;
	}

	return (
		<ul>
			{users.map(user => (
				<li key={user.id}>{user.name}</li>
			))}
		</ul>
	);
}
`;

// Register fake menu items once at module scope (not per-render) to avoid
// duplicates when Dark and Light fixtures are rendered simultaneously,
// since MenuRegistry is a global singleton.
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
	group: 'navigation', order: 1,
	command: { id: 'inlineChat.accept', title: 'Accept' },
});
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
	group: 'navigation', order: 2,
	command: { id: 'inlineChat.discard', title: 'Discard' },
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
	group: 'navigation', order: -1,
	command: { id: 'workbench.action.chat.attachContext', title: '+', icon: Codicon.add },
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
	group: 'navigation', order: 3,
	command: { id: 'workbench.action.chat.openModelPicker', title: 'GPT-4.1' },
});
MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
	group: 'navigation', order: 4,
	command: { id: 'workbench.action.chat.submit', title: 'Send', icon: Codicon.arrowUp },
});

function renderInlineChatZoneWidget({ container, disposableStore, theme }: ComponentFixtureContext, showTerminationCard: boolean): void {
	container.style.width = '600px';
	container.style.height = '700px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	// The component-explorer harness injects a global `* { box-sizing: border-box }`
	// reset into the document head. The chat input toolbar (and other Monaco UI bits)
	// rely on the browser default `content-box` so that explicit `height` plus `padding`
	// add up correctly (e.g. the attachments row is 16px height + 3px padding = 22px).
	// Revert the reset for our subtree so the fixture renders like the real product.
	const styleReset = document.createElement('style');
	styleReset.textContent = '.component-fixture-box-sizing-reset, .component-fixture-box-sizing-reset * { box-sizing: revert; }';
	container.appendChild(styleReset);
	container.classList.add('component-fixture-box-sizing-reset');

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, MenuService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);

			reg.defineInstance(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
				declare readonly _serviceBrand: undefined;
				override getOpenAriaHint() { return ''; }
			}());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly urlProtocol = 'vscode';
			}());
			reg.defineInstance(ILifecycleService, new class extends mock<ILifecycleService>() {
				declare readonly _serviceBrand: undefined;
				override readonly onBeforeShutdown = Event.None;
				override readonly onWillShutdown = Event.None;
				override readonly onDidShutdown = Event.None;
				override readonly onShutdownVeto = Event.None;
			}());

			// Chat services
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly onDidPerformUserAction = Event.None;
				override readonly onDidSubmitRequest = Event.None;
				override readonly requestInProgressObs = observableValue('requestInProgress', false);
			}());
			reg.defineInstance(IChatAgentService, new class extends mock<IChatAgentService>() {
				override readonly onDidChangeAgents = Event.None;
				override getAgents() { return []; }
				override getActivatedAgents() { return []; }
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				getWidgetBySessionId() { return undefined; }
				override register() { return { dispose() { } }; }
			}());
			reg.defineInstance(IChatAccessibilityService, new class extends mock<IChatAccessibilityService>() {
				override acceptRequest() { }
				override acceptResponse() { }
			}());
			reg.defineInstance(IChatSlashCommandService, new class extends mock<IChatSlashCommandService>() {
				override readonly onDidChangeCommands = Event.None;
				override getCommands() { return []; }
			}());
			reg.defineInstance(IPromptsService, new class extends mock<IPromptsService>() { }());
			reg.defineInstance(IChatLayoutService, new class extends mock<IChatLayoutService>() {
				override readonly fontFamily = observableValue<string | null>('fontFamily', null);
				override readonly fontSize = observableValue('fontSize', 13);
			}());
			reg.defineInstance(IChatTipService, new class extends mock<IChatTipService>() {
				readonly onDidReceiveTip = Event.None;
			}());
			reg.defineInstance(IChatDebugService, new class extends mock<IChatDebugService>() {
				override readonly onDidAddEvent = Event.None;
			}());
			reg.defineInstance(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
				override readonly sentimentObs = observableValue('sentiment', { completed: true });
				override readonly anonymousObs = observableValue('anonymous', false);
				override readonly onDidChangeAnonymous = Event.None;
			}());
			reg.defineInstance(IChatModeService, new class extends mock<IChatModeService>() {
				override readonly onDidChangeChatModes = Event.None;
				override getModes() { return { builtin: [], custom: [] }; }
				override findModeById() { return undefined; }
			}());
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() {
				override getAllChatSessionContributions() { return []; }
				override readonly onDidChangeSessionOptions = Event.None;
				override readonly onDidChangeOptionGroups = Event.None;
				override readonly onDidChangeAvailability = Event.None;
			}());
			reg.defineInstance(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
				override readonly onDidChangeLanguageModels = Event.None;
				override getLanguageModelIds() { return []; }
			}());
			reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
				override readonly onDidChangeTools = Event.None;
				override getTools() { return []; }
				override observeTools() { return observableValue('tools', []); }
				override getToolSetsForModel() { return []; }
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsService['model']>() {
					override readonly onDidChangeSessions = Event.None;
				}();
			}());
			reg.defineInstance(IChatContextService, new class extends mock<IChatContextService>() { }());
			reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock<IChatAttachmentWidgetRegistry>() { }());
			reg.defineInstance(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { }());
			reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { }());
			reg.defineInstance(IChatArtifactsService, new class extends mock<IChatArtifactsService>() {
				override getArtifacts(): IChatArtifacts {
					return new class extends mock<IChatArtifacts>() {
						override readonly artifactGroups = observableValue<readonly IArtifactSourceGroup[]>('artifactGroups', []);
						override setAgentArtifacts() { }
						override clearAgentArtifacts() { }
						override clearSubagentArtifacts() { }
						override migrate() { }
					}();
				}
			}());
			reg.defineInstance(IChatTodoListService, new class extends mock<IChatTodoListService>() {
				override readonly onDidUpdateTodos = Event.None;
				override getTodos() { return []; }
				override setTodos() { }
				override migrateTodos() { }
			}());
			reg.defineInstance(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
				override getHistory() { return []; }
				override readonly onDidChangeHistory = Event.None;
			}());
			reg.defineInstance(IChatContextPickService, new class extends mock<IChatContextPickService>() { }());
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override readonly onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override readonly onDidFilesChange = Event.None; override readonly onDidRunOperation = Event.None; }());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { override readonly onDidActiveEditorChange = Event.None; }());
			reg.defineInstance(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { }());
			reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() { override async getCurrentExperiments() { return []; } override async getTreatment() { return undefined; } override readonly onDidRefetchAssignments = Event.None; }());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				declare readonly _serviceBrand: undefined;
				override get mainContainer() { return container; }
				override get activeContainer() { return container; }
				override get mainContainerDimension() { return { width: 600, height: 400 }; }
				override get activeContainerDimension() { return { width: 600, height: 400 }; }
				override readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
				override readonly onDidLayoutMainContainer = Event.None;
				override readonly onDidLayoutActiveContainer = Event.None;
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidChangeActiveContainer = Event.None;
				override readonly onDidAddContainer = Event.None;
				override get containers() { return [container]; }
				override getContainer() { return container; }
				override whenContainerStylesLoaded() { return undefined; }
				override readonly onDidChangePartVisibility = Event.None;
				override readonly onDidChangeWindowMaximized = Event.None;
				override isVisible() { return true; }
			}());
			reg.defineInstance(IViewDescriptorService, new class extends mock<IViewDescriptorService>() { override readonly onDidChangeLocation = Event.None; }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override readonly onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { override readonly onDidChangeExtensions = Event.None; }());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() { }());
			reg.defineInstance(IListService, new ListService());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { }());
			reg.defineInstance(ISCMService, new class extends mock<ISCMService>() {
				override readonly onDidAddRepository = Event.None;
				override readonly onDidRemoveRepository = Event.None;
				override readonly repositories = [];
				override readonly repositoryCount = 0;
			}());
			reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() { override show() { } override hide() { } override get isVisible() { return false; } }());
			reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
			reg.defineInstance(IUpdateService, new class extends mock<IUpdateService>() { override readonly onStateChange = Event.None; override get state() { return { type: StateType.Uninitialized as const }; } }());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() { }());
		},
	});

	// Configure chat editor settings required by ChatEditorOptions
	const configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configService.setUserConfiguration('chat', { editor: { fontSize: 14, fontFamily: 'default', fontWeight: 'normal', lineHeight: 0, wordWrap: 'on' } });
	configService.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, accessibilitySupport: 'off' });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://inline-chat-zone.tsx'),
		'typescriptreact'
	));

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			cursorBlinking: 'solid',
		},
		{ contributions: [] } satisfies ICodeEditorWidgetOptions
	));

	editor.setModel(textModel);
	editor.focus();

	const zoneWidget = disposableStore.add(instantiationService.createInstance(
		InlineChatZoneWidget,
		{ location: ChatAgentLocation.EditorInline },
		{
			enableWorkingSet: 'implicit',
			enableImplicitContext: false,
			renderInputOnTop: false,
			renderInputToolbarBelowInput: true,
			menus: {
				telemetrySource: 'inlineChatWidget',
				executeToolbar: MenuId.ChatEditorInlineExecute,
				inputSideToolbar: MenuId.ChatEditorInlineInputSide,
			},
			defaultMode: ChatMode.Ask,
		},
		{ editor },
		() => Promise.resolve(),
	));

	// Match what InlineChatController does in the real product so that the
	// inline-chat-2 specific styles (toolbar layout, attachment row sizing) apply.
	zoneWidget.domNode.classList.add('inline-chat-2');

	zoneWidget.show(new Position(10, 1));

	// Force a relayout after the initial show so that the chat widget's
	// contentHeight (which includes the toolbar row rendered below the input)
	// is fully measured and the zone widget adjusts its height accordingly.
	zoneWidget.updatePositionAndHeight(new Position(10, 1));

	if (showTerminationCard) {
		zoneWidget.showTerminationCard(
			'The agent ran into an issue and stopped. You can review the changes made so far.',
			instantiationService,
		);
	}
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	InlineChatZoneWidget: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineChatZoneWidget(context, false),
	}),
	InlineChatZoneWidgetTerminated: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineChatZoneWidget(context, true),
	}),
});
