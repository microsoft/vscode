/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { localize } from '../../../../../nls.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate, IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import { AICustomizationListWidget } from './aiCustomizationListWidget.js';
import { IAICustomizationItemsModel, ITEMS_MODEL_SECTIONS } from './aiCustomizationItemsModel.js';
import { McpListWidget } from './mcpListWidget.js';
import { PluginListWidget } from './pluginListWidget.js';
import { ToolsListWidget } from './toolsListWidget.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { AutomationsListWidget } from './automationsListWidget.js';
import {
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
	AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY,
	AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY,
	AICustomizationManagementSection,
	AICustomizationSource,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_MAX_WIDTH,
	CONTENT_MIN_WIDTH,
} from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, pluginIcon, toolsIcon, automationIcon } from './aiCustomizationIcons.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../common/automations/automationsEnabled.js';
import { ChatModelsWidget } from '../chatManagement/chatModelsWidget.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, IPromptPath, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IHeaderAttribute, IValue, ParsedPromptFile } from '../../common/promptSyntax/promptFileParser.js';
import { AGENT_MD_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';
import { getAttributeDefinition, getTarget } from '../../common/promptSyntax/languageProviders/promptFileAttributes.js';
import { INewPromptOptions, NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from '../promptSyntax/newPromptFileActions.js';
import { showConfigureHooksQuickPick } from '../promptSyntax/hookActions.js';
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory, CustomizationLocationPicker } from './customizationCreatorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationSources, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../platform/files/common/files.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IExtension } from '../../../extensions/common/extensions.js';
import { EmbeddedMcpServerDetail } from './embeddedMcpServerDetail.js';
import { EmbeddedAgentPluginDetail } from './embeddedAgentPluginDetail.js';
import { EmbeddedExtensionToolsDetail } from './embeddedExtensionToolsDetail.js';
import { ICustomizationHarnessService, type ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { AICustomizationWelcomePage } from './aiCustomizationWelcomePage.js';
import { getPromptMigrationInfo, migratePromptFilesToSkills, type PromptMigrationSkillSourceFolders } from './promptMigration.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { showNoFoldersDialog } from '../promptSyntax/pickers/askForPromptSourceFolder.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';

const $ = DOM.$;

//#region Telemetry

type CustomizationEditorOpenedEvent = {
	section: string;
};

type CustomizationEditorOpenedClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The initially selected section when the editor opens.' };
	owner: 'joshspicer';
	comment: 'Tracks when the Agent Customizations editor is opened.';
};

type CustomizationEditorSectionChangedEvent = {
	section: string;
};

type CustomizationEditorSectionChangedClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The section the user navigated to.' };
	owner: 'joshspicer';
	comment: 'Tracks section navigation within the Agent Customizations editor.';
};

type CustomizationEditorItemSelectedEvent = {
	section: string;
	promptType: string;
	storage: string;
};

type CustomizationEditorItemSelectedClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The active section when the item was selected.' };
	promptType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The prompt type of the selected item.' };
	storage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The storage location of the selected item (local, user, extension, plugin, builtin).' };
	owner: 'joshspicer';
	comment: 'Tracks item selection in the Agent Customizations editor.';
};

type CustomizationEditorCreateItemEvent = {
	section: string;
	promptType: string;
	creationMode: 'ai' | 'manual';
	target: string;
};

type CustomizationEditorCreateItemClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The active section when the item was created.' };
	promptType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of customization being created.' };
	creationMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the item was created via AI-guided flow or manual creation.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The target storage for the new item (workspace, user).' };
	owner: 'joshspicer';
	comment: 'Tracks customization creation in the Agent Customizations editor.';
};

type CustomizationEditorSaveItemEvent = {
	promptType: string;
	storage: string;
	saveTarget: string;
};

type CustomizationEditorSaveItemClassification = {
	promptType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of customization being saved.' };
	storage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The original storage location of the item.' };
	saveTarget: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The target storage for the save (workspace, user, existing).' };
	owner: 'joshspicer';
	comment: 'Tracks save actions in the Agent Customizations editor.';
};

//#endregion

//#region Sidebar Section Item

interface ISectionItem {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	count: number;
}

interface ISaveTargetQuickPickItem extends IQuickPickItem {
	readonly target: 'workspace' | 'user' | 'cancel';
	readonly folder?: URI;
}

interface IMigrationSkillTargetQuickPickItem extends IQuickPickItem {
	readonly folder: ICustomizationSourceFolder;
}

interface IBuiltinPromptSaveRequest {
	readonly target: 'workspace' | 'user';
	readonly folder: URI;
	readonly sourceUri: URI;
	readonly content: string;
	readonly promptType: PromptsType;
	readonly projectRoot?: URI;
}

interface IExistingCustomizationSaveRequest {
	readonly fileUri: URI;
	readonly content: string;
	readonly projectRoot?: URI;
}

class SectionItemDelegate implements IListVirtualDelegate<ISectionItem> {
	getHeight(): number {
		return 26;
	}

	getTemplateId(): string {
		return 'sectionItem';
	}
}

interface ISectionItemTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly templateDisposables: DisposableStore;
}

class SectionItemRenderer implements IListRenderer<ISectionItem, ISectionItemTemplateData> {
	readonly templateId = 'sectionItem';

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): ISectionItemTemplateData {
		container.classList.add('section-list-item');
		const icon = DOM.append(container, $('.section-icon'));
		const label = DOM.append(container, $('.section-label'));
		const count = DOM.append(container, $('.section-count'));
		const templateDisposables = new DisposableStore();
		return { container, icon, label, count, templateDisposables };
	}

	renderElement(element: ISectionItem, index: number, templateData: ISectionItemTemplateData): void {
		templateData.templateDisposables.clear();
		templateData.icon.className = 'section-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
		templateData.label.textContent = element.label;
		if (element.count > 0) {
			templateData.count.textContent = String(element.count);
			templateData.count.style.display = '';
		} else {
			templateData.count.textContent = '';
			templateData.count.style.display = 'none';
		}
		templateData.templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), templateData.container, element.description));
	}

	disposeTemplate(templateData: ISectionItemTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

//#endregion

/**
 * Editor pane for the AI Customizations Management Editor.
 * Provides a global view of all AI customizations with a sidebar for navigation
 * and a content area showing a searchable list of items.
 */
export class AICustomizationManagementEditor extends EditorPane {

	static readonly ID = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID;

	private container!: HTMLElement;
	private splitViewContainer!: HTMLElement;
	private splitView!: SplitView<number>;
	private sidebarContainer!: HTMLElement;
	private sectionsListContainer: HTMLElement | undefined;
	private sectionsList!: WorkbenchList<ISectionItem>;
	private contentContainer!: HTMLElement;
	private listWidget!: AICustomizationListWidget;
	private mcpListWidget: McpListWidget | undefined;
	private pluginListWidget: PluginListWidget | undefined;
	private automationsListWidget: AutomationsListWidget | undefined;
	private modelsWidget: ChatModelsWidget | undefined;
	private toolsListWidget: ToolsListWidget | undefined;
	private promptsContentContainer!: HTMLElement;
	private mcpContentContainer: HTMLElement | undefined;
	private pluginContentContainer: HTMLElement | undefined;
	private automationsContentContainer: HTMLElement | undefined;
	private modelsContentContainer: HTMLElement | undefined;
	private toolsContentContainer: HTMLElement | undefined;
	private modelsFooterElement: HTMLElement | undefined;

	// Embedded editor state
	private editorContentContainer: HTMLElement | undefined;
	private editorPreviewContainer: HTMLElement | undefined;
	private editorPreviewScrollContainer: HTMLElement | undefined;
	private editorPreviewIssuesContainer: HTMLElement | undefined;
	private editorPreviewFrontMatterContainer: HTMLElement | undefined;
	private editorPreviewBodyContainer: HTMLElement | undefined;
	private embeddedEditorContainer: HTMLElement | undefined;
	private embeddedEditor: CodeEditorWidget | undefined;
	private editorActionButton!: HTMLButtonElement;
	private editorActionButtonIcon!: HTMLElement;
	private editorModeButton: HTMLButtonElement | undefined;
	private editorActionButtonInProgress = false;
	private editorDisplayMode: 'preview' | 'raw' = 'preview';
	private editorItemNameElement!: HTMLElement;
	private editorItemPathElement!: HTMLElement;
	private editorSaveIndicator!: HTMLElement;
	private readonly editorModelChangeDisposables = this._register(new DisposableStore());
	private readonly editorPreviewDisposables = this._register(new DisposableStore());
	private readonly editorPreviewRenderScheduler = this._register(new RunOnceScheduler(() => {
		if (this.viewMode === 'editor' && this.editorDisplayMode === 'preview') {
			this.renderCurrentEditorPreview();
		}
	}, 200));
	private readonly builtinEditingSessions = new Map<string, { model: ITextModel; originalContent: string }>();
	private currentEditingUri: URI | undefined;
	private currentEditingProjectRoot: URI | undefined;
	private currentEditingSource: AICustomizationSource | undefined;
	private currentEditingPromptType: PromptsType | undefined;
	private currentEditingReadOnly = false;
	private editorReturnViewMode: 'list' | 'migration' = 'list';
	private currentModelRef: IReference<IResolvedTextEditorModel> | undefined;
	private viewMode: 'list' | 'migration' | 'editor' | 'mcpDetail' | 'pluginDetail' | 'toolsDetail' = 'list';
	private migrationContentContainer: HTMLElement | undefined;
	private migrationListContainer: HTMLElement | undefined;
	private migrationMigrateButton: Button | undefined;
	private migrationSearchInput: InputBox | undefined;
	private migrationDescriptionElement: HTMLElement | undefined;
	private migrationSearchQuery = '';
	private selectedPromptMigrationUris = new ResourceSet();
	private readonly migrationPageDisposables = this._register(new DisposableStore());

	// Embedded MCP server detail view
	private mcpDetailContainer: HTMLElement | undefined;
	private embeddedMcpDetail: EmbeddedMcpServerDetail | undefined;
	private readonly mcpDetailDisposables = this._register(new DisposableStore());

	// Embedded plugin detail view
	private pluginDetailContainer: HTMLElement | undefined;
	private embeddedPluginDetail: EmbeddedAgentPluginDetail | undefined;
	private readonly pluginDetailDisposables = this._register(new DisposableStore());
	/** Section to restore when navigating back from plugin detail (when opened from a non-plugin section). */
	private pluginDetailReturnSection: AICustomizationManagementSection | undefined;

	// Embedded tool-contributing extension detail view
	private toolsDetailContainer: HTMLElement | undefined;
	private embeddedToolDetail: EmbeddedExtensionToolsDetail | undefined;
	private readonly toolsDetailDisposables = this._register(new DisposableStore());

	private dimension: DOM.Dimension | undefined;
	private readonly sections: ISectionItem[] = [];
	private readonly allSections: ISectionItem[] = [];
	private selectedSection: AICustomizationManagementSection | undefined;

	// Welcome page
	private welcomePage: AICustomizationWelcomePage | undefined;
	private promptFilesToMigrate: readonly IPromptPath[] = [];
	private promptMigrationRefreshSequence = 0;

	private readonly editorDisposables = this._register(new DisposableStore());
	private _editorContentChanged = false;
	private _previousActiveHarnessId: string | undefined;

	private sidebarHeaderContainer: HTMLElement | undefined;
	private homeButton: HTMLElement | undefined;
	private homeButtonIcon: HTMLElement | undefined;
	private homeButtonLabel: HTMLElement | undefined;
	private migrationShortcutContainer: HTMLElement | undefined;
	private migrationShortcutButton: HTMLButtonElement | undefined;
	private migrationShortcutCount: HTMLElement | undefined;
	private sidebarWidth = 0;
	private sidebarHeight = 0;

	private readonly inEditorContextKey: IContextKey<boolean>;
	private readonly sectionContextKey: IContextKey<string>;
	private readonly harnessContextKey: IContextKey<string>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ICommandService private readonly commandService: ICommandService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IModelService private readonly modelService: IModelService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILabelService private readonly labelService: ILabelService,
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
	) {
		super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);

		this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
		this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);
		this.harnessContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS.bindTo(contextKeyService);
		this.updateHarnessLabelPresentation();

		// Track workspace changes for embedded editor
		this._register(autorun(reader => {
			this.workspaceService.activeProjectRoot.read(reader);
			if (this.viewMode === 'editor') {
				this.currentEditingProjectRoot = this.workspaceService.getActiveProjectRoot();
			}
		}));
		this._register(toDisposable(() => {
			this.currentModelRef?.dispose();
			this.currentModelRef = undefined;
		}));
		this._register(toDisposable(() => this.disposeBuiltinEditingSessions()));

		// Build sections from the workspace service configuration
		const sectionInfo: Record<string, { label: string; icon: ThemeIcon; description: string }> = {
			[AICustomizationManagementSection.Agents]: { label: localize('agents', "Agents"), icon: agentIcon, description: localize('agentsDesc', "Define custom agents with specialized personas, tool access, and instructions for specific tasks.") },
			[AICustomizationManagementSection.Skills]: { label: localize('skills', "Skills"), icon: skillIcon, description: localize('skillsDesc', "Create reusable skill files that provide domain-specific knowledge and workflows.") },
			[AICustomizationManagementSection.Instructions]: { label: localize('instructions', "Instructions"), icon: instructionsIcon, description: localize('instructionsDesc', "Set always-on instructions that guide AI behavior across your workspace or user profile.") },
			[AICustomizationManagementSection.Prompts]: { label: localize('prompts', "Prompts"), icon: promptIcon, description: localize('promptsDesc', "Reusable prompt templates that can be invoked as slash commands.") },
			[AICustomizationManagementSection.Hooks]: { label: localize('hooks', "Hooks"), icon: hookIcon, description: localize('hooksDesc', "Configure automated actions triggered by events like saving files or running tasks.") },
			[AICustomizationManagementSection.Automations]: { label: localize('automations', "Automations"), icon: automationIcon, description: localize('automationsDesc', "Schedule agent sessions to run on a cadence you choose.") },
			[AICustomizationManagementSection.McpServers]: { label: localize('mcpServers', "MCP Servers"), icon: Codicon.server, description: localize('mcpServersDesc', "Connect external tool servers that extend AI capabilities with custom tools and data sources.") },
			[AICustomizationManagementSection.Plugins]: { label: localize('plugins', "Plugins"), icon: pluginIcon, description: localize('pluginsDesc', "Install and manage agent plugins that add additional tools, skills, and integrations.") },
			[AICustomizationManagementSection.Models]: { label: localize('models', "Models"), icon: Codicon.vm, description: localize('modelsDesc', "Configure and manage language models available for use.") },
			[AICustomizationManagementSection.Tools]: { label: localize('tools', "Tools"), icon: toolsIcon, description: localize('toolsDesc', "Enable or disable groups of language model tools available to chat.") },
		};
		for (const id of this.workspaceService.managementSections) {
			const info = sectionInfo[id];
			if (info) {
				this.allSections.push({ id, ...info, count: 0 });
			}
		}
		this.rebuildVisibleSections();

		// Restore selected section from storage, falling back to welcome page
		const savedSection = this.storageService.get(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
		if (savedSection && this.sections.some(s => s.id === savedSection)) {
			this.selectedSection = savedSection as AICustomizationManagementSection;
		} else {
			this.selectedSection = undefined; // Show welcome page
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this.editorDisposables.clear();
		this.container = DOM.append(parent, $('.ai-customization-management-editor'));

		this.createSplitView();
		this.updateStyles();
	}

	private createSplitView(): void {
		this.splitViewContainer = DOM.append(this.container, $('.management-split-view'));

		this.sidebarContainer = $('.management-sidebar');
		this.contentContainer = $('.management-content');

		this.createSidebar();
		this.createContent();

		this.splitView = this.editorDisposables.add(new SplitView(this.splitViewContainer, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true,
		}));

		const savedWidth = this.storageService.getNumber(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, StorageScope.PROFILE, SIDEBAR_DEFAULT_WIDTH);

		// Sidebar view
		this.splitView.addView({
			onDidChange: Event.None,
			element: this.sidebarContainer,
			minimumSize: SIDEBAR_MIN_WIDTH,
			maximumSize: SIDEBAR_MAX_WIDTH,
			layout: (width, _, height) => {
				this.sidebarContainer.style.width = `${width}px`;
				if (height !== undefined) {
					this.layoutSidebar(width, height);
				}
			},
		}, savedWidth, undefined, true);

		// Content view
		this.splitView.addView({
			onDidChange: Event.None,
			element: this.contentContainer,
			minimumSize: CONTENT_MIN_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				this.contentContainer.style.width = `${width}px`;
				if (height !== undefined) {
					this.listWidget.layout(height - 16, width - 24);
					this.mcpListWidget?.layout(height - 16, width - 24);
					this.pluginListWidget?.layout(height - 16, width - 24);
					this.toolsListWidget?.layout(height - 16, width - 24);
					this.automationsListWidget?.layout(height - 16, width - 24);
					const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
					this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
					if (this.viewMode === 'editor' && this.embeddedEditor && this.embeddedEditorContainer) {
						// Use the actual rendered size of the embedded editor container so
						// the Monaco editor (and its scrollbars) stay within the rounded
						// panel chrome regardless of header/margin changes. Guard against
						// the container being hidden (clientHeight === 0); re-layout once
						// it becomes visible to avoid a zero-height editor.
						const { clientWidth, clientHeight } = this.embeddedEditorContainer;
						if (clientWidth > 0 && clientHeight > 0) {
							this.embeddedEditor.layout({ width: clientWidth, height: clientHeight });
						} else if (this.dimension) {
							DOM.getWindow(this.embeddedEditorContainer).requestAnimationFrame(() => {
								if (this.embeddedEditor && this.embeddedEditorContainer) {
									const { clientWidth: w, clientHeight: h } = this.embeddedEditorContainer;
									if (w > 0 && h > 0) {
										this.embeddedEditor.layout({ width: w, height: h });
									}
								}
							});
						}
					}
					// Embedded MCP/plugin detail panes use a plain DOM widget that flows with
					// the container; no explicit layout call is needed here.
				}
			},
		}, Sizing.Distribute, undefined, true);

		// Persist sidebar width
		this.editorDisposables.add(this.splitView.onDidSashChange(() => {
			const width = this.splitView.getViewSize(0);
			this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, width, StorageScope.PROFILE, StorageTarget.USER);
		}));

		// Reset on double-click
		this.editorDisposables.add(this.splitView.onDidSashReset(() => {
			const totalWidth = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
			this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
			this.splitView.resizeView(1, totalWidth - SIDEBAR_DEFAULT_WIDTH);
		}));
	}

	private getActiveHarnessLabel(): string {
		return this.harnessService.getActiveDescriptor().label || localize('localHarnessLabel', "Local");
	}

	private updateHarnessLabelPresentation(): void {
		const harnessLabel = this.getActiveHarnessLabel();
		AICustomizationManagementEditorInput.getOrCreate().setHarnessLabel(harnessLabel);
		this.welcomePage?.setHarnessLabel(harnessLabel);
	}

	/**
	 * Rebuilds the visible sections list based on the active harness's
	 * `hiddenSections`. If the current selection falls into a hidden
	 * section, the first visible section is selected instead.
	 */
	private rebuildVisibleSections(): void {
		const activeId = this.harnessService.activeHarness.get();
		const descriptor = this.harnessService.findHarnessById(activeId);
		const hidden = new Set(descriptor?.hiddenSections ?? []);

		// Also hide the Automations section when the feature setting is off.
		if (this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
			hidden.add(AICustomizationManagementSection.Automations);
		}

		this.sections.length = 0;
		for (const s of this.allSections) {
			if (!hidden.has(s.id)) {
				this.sections.push(s);
			}
		}

		// Update the list widget if it exists
		if (this.sectionsList) {
			this.sectionsList.splice(0, this.sectionsList.length, this.sections);
			this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
		}

		// Rebuild welcome cards to reflect new visible sections
		this.welcomePage?.rebuildCards(new Set(this.sections.map(s => s.id)));

		// If the current selection is hidden, fall back to welcome page
		if (this.selectedSection !== undefined && !this.sections.some(s => s.id === this.selectedSection) && this.sections.length > 0) {
			this.showWelcomePage();
		} else {
			this.ensureSectionsListReflectsActiveSection();
		}
	}

	private createSidebar(): void {
		const sidebarContent = DOM.append(this.sidebarContainer, $('.sidebar-content'));

		this.createSidebarHeader(sidebarContent);

		// Main sections list container (takes remaining space)
		const sectionsListContainer = this.sectionsListContainer = DOM.append(sidebarContent, $('.sidebar-sections-list'));

		this.sectionsList = this.editorDisposables.add(this.instantiationService.createInstance(
			WorkbenchList<ISectionItem>,
			'AICustomizationManagementSections',
			sectionsListContainer,
			new SectionItemDelegate(),
			[new SectionItemRenderer(this.hoverService)],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (item: ISectionItem) => item.count > 0
						? localize('sectionAriaLabelWithCount', "{0}, {1} items", item.label, item.count)
						: item.label,
					getWidgetAriaLabel: () => localize('sectionsAriaLabel', "Agent Customization Sections"),
				},
				openOnSingleClick: true,
				identityProvider: {
					getId: (item: ISectionItem) => item.id,
				},
			}
		));

		this.sectionsList.splice(0, this.sectionsList.length, this.sections);
		this.ensureSectionsListReflectsActiveSection();

		this.editorDisposables.add(this.sectionsList.onDidChangeSelection(e => {
			if (e.elements.length === 0) {
				if (this.selectedSection !== undefined) {
					this.showWelcomePage();
				}
				return;
			}
			this.selectSection(e.elements[0].id);
		}));

		// React to harness changes — rebuild visible sections and refresh counts.
		// Also track availableHarnesses to handle agent registration/unregistration.
		this.editorDisposables.add(autorun(reader => {
			this.harnessService.availableHarnesses.read(reader);
			const activeId = this.harnessService.activeHarness.read(reader);
			this.harnessContextKey.set(activeId);
			this.updateHomeButtonHarnessPresentation();
			this.rebuildVisibleSections();
			// Reset counts to zero immediately on harness switch to prevent
			// stale counts from the previous harness flashing before the async
			// count refresh completes. Only reset when the active harness
			// actually changed to avoid flicker on harness registration events.
			if (this._previousActiveHarnessId !== undefined && this._previousActiveHarnessId !== activeId) {
				for (const section of this.sections) {
					this.updateSectionCount(section.id, 0);
				}
			}
			this._previousActiveHarnessId = activeId;
		}));

		this.editorDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled)) {
				this.onStructuredPreviewSettingChanged();
			}
			if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled)) {
				this.refreshPromptMigrationUi();
			}
			if (e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
				this.rebuildVisibleSections();
			}
		}));

		this.createSidebarMigrationShortcut(sidebarContent);
	}

	private layoutSidebar(width: number, height: number): void {
		this.sidebarWidth = width;
		this.sidebarHeight = height;
		if (!this.sectionsListContainer) {
			return;
		}

		// Subtract sidebar-content padding (4px each side = 8px), the fixed header,
		// and the optional migration row so the sections list only occupies the
		// space it needs and the migration entry can sit directly beneath it.
		const headerHeight = this.sidebarHeaderContainer?.offsetHeight ?? 0;
		const migrationHeight = this.migrationShortcutContainer?.style.display !== 'none'
			? (this.migrationShortcutContainer?.offsetHeight ?? 0)
			: 0;
		const availableListHeight = Math.max(0, height - 8 - headerHeight - migrationHeight);
		const listHeight = Math.min(availableListHeight, this.sections.length * 26);
		this.sectionsListContainer.style.height = `${listHeight}px`;
		this.sectionsList.layout(listHeight, width);
	}

	private createSidebarHeader(sidebarContent: HTMLElement): void {
		const headerRow = this.sidebarHeaderContainer = DOM.append(sidebarContent, $('.sidebar-header-row'));

		// Home/overview button
		const homeButton = this.homeButton = DOM.append(headerRow, $('button.sidebar-home-button'));
		homeButton.classList.add('sidebar-harness-home-button');
		homeButton.setAttribute('aria-label', localize('homeButton', "Overview"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), homeButton, localize('homeButtonTooltip', "Back to overview")));
		const homeIcon = this.homeButtonIcon = DOM.append(homeButton, $('span.sidebar-home-icon'));
		homeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
		homeIcon.setAttribute('aria-hidden', 'true');
		const homeLabel = this.homeButtonLabel = DOM.append(homeButton, $('span.sidebar-home-label'));
		homeLabel.textContent = localize('homeButtonLabel', "Overview");
		this.editorDisposables.add(DOM.addDisposableListener(homeButton, 'click', () => {
			this.showWelcomePage();
		}));
		this.updateHomeButtonHarnessPresentation();

		this.updateHomeButtonStyle();
	}

	private updateHomeButtonStyle(): void {
		if (!this.homeButtonLabel || !this.homeButton) {
			return;
		}
		this.homeButtonLabel.style.display = '';
		this.homeButton.style.flex = '1';
	}

	private updateHomeButtonHarnessPresentation(): void {
		this.updateHarnessLabelPresentation();

		if (!this.homeButton || !this.homeButtonIcon || !this.homeButtonLabel) {
			return;
		}

		this.homeButtonIcon.className = 'sidebar-home-icon';
		this.homeButtonIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
		this.homeButtonLabel.textContent = localize('homeButtonLabel', "Overview");
		this.homeButton.setAttribute('aria-label', localize('homeButton', "Overview"));
		this.homeButton.title = localize('homeButtonTooltip', "Back to overview");
	}

	private createSidebarMigrationShortcut(sidebarContent: HTMLElement): void {
		const container = this.migrationShortcutContainer = DOM.append(sidebarContent, $('.sidebar-migration-shortcut'));
		container.style.display = 'none';

		DOM.append(container, $('div.sidebar-migration-separator'));

		const button = this.migrationShortcutButton = DOM.append(container, $('button.sidebar-migration-button')) as HTMLButtonElement;
		button.type = 'button';
		button.setAttribute('aria-label', localize('migrationShortcutAriaLabel', "Migrate prompt files to skills"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, localize('migrationShortcutTooltip', "Convert deprecated prompt files to skills")));

		const icon = DOM.append(button, $('span.sidebar-migration-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
		icon.setAttribute('aria-hidden', 'true');

		const label = DOM.append(button, $('span.sidebar-migration-label'));
		label.textContent = localize('migrationShortcutLabel', "Migrate Prompts");

		this.migrationShortcutCount = DOM.append(button, $('span.sidebar-migration-count'));

		this.editorDisposables.add(DOM.addDisposableListener(button, 'click', () => {
			this.showPromptMigrationPage();
		}));
	}

	private createWelcomePage(parent: HTMLElement): void {
		this.welcomePage = this.editorDisposables.add(new AICustomizationWelcomePage(
			parent,
			this.workspaceService.welcomePageFeatures,
			{
				selectSection: (section) => this.selectSection(section),
				selectSectionWithMarketplace: (section) => this.selectSection(section, { showMarketplace: true }),
				closeEditor: () => {
					if (this.input) {
						this.group.closeEditor(this.input);
					}
				},
				migratePromptFiles: () => {
					this.showPromptMigrationPage();
				},
				prefillChat: async (query, options) => {
					try {
						if (this.workspaceService.isSessionsWindow) {
							const sessionsViewId = 'workbench.view.sessions.chat';
							if (options?.newChat) {
								await this.commandService.executeCommand('workbench.action.sessions.newChat');
							}
							const view = await this.viewsService.openView(sessionsViewId, true);
							const chatView = view as unknown as { prefillInput?(text: string): void; sendQuery?(text: string): void } | undefined;
							if (options?.isPartialQuery && chatView?.prefillInput) {
								chatView.prefillInput(query);
							} else if (chatView?.sendQuery) {
								chatView.sendQuery(query);
							}
						} else {
							if (options?.newChat) {
								await this.commandService.executeCommand('workbench.action.chat.newChat');
							}
							await this.commandService.executeCommand('workbench.action.chat.open', { query, isPartialQuery: options?.isPartialQuery ?? false });
						}
					} catch (err) {
						onUnexpectedError(err);
					}
				},
			},
			this.commandService,
			this.workspaceService,
			this.hoverService,
			this.getActiveHarnessLabel(),
		));
		this.welcomePage.rebuildCards(new Set(this.sections.map(s => s.id)));
		this.welcomePage.setPromptMigrationInfo(getPromptMigrationInfo(this.promptFilesToMigrate));
	}

	private createBackArrowButton(onClick?: () => void): HTMLButtonElement {
		const button = $('button.section-back-arrow-button') as HTMLButtonElement;
		button.type = 'button';
		button.setAttribute('aria-label', localize('backToOverview', "Back to overview"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, localize('backToOverviewTooltip', "Back to overview")));
		const icon = DOM.append(button, $('span.section-back-arrow-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
		icon.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(button, 'click', () => {
			if (onClick) {
				onClick();
			} else {
				this.showWelcomePage();
			}
		}));
		return button;
	}

	private createPromptMigrationContent(contentInner: HTMLElement): void {
		this.migrationContentContainer = DOM.append(contentInner, $('.prompt-migration-content-container.ai-customization-list-widget'));

		const header = DOM.append(this.migrationContentContainer, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		const title = DOM.append(titleRow, $('h2.section-title'));
		title.textContent = localize('promptMigrationPageTitle', "Migrate Prompt Files");
		this.migrationDescriptionElement = DOM.append(header, $('p.section-title-description'));
		const sectionLink = DOM.append(header, $('a.section-title-link')) as HTMLAnchorElement;
		sectionLink.textContent = localize('learnMoreSkills', "Learn more about agent skills");
		sectionLink.href = 'https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product';
		this.editorDisposables.add(DOM.addDisposableListener(sectionLink, 'click', e => {
			e.preventDefault();
			this.openerService.open(URI.parse(sectionLink.href));
		}));

		const actions = DOM.append(this.migrationContentContainer, $('.list-search-and-button-container.prompt-migration-actions'));
		const searchContainer = DOM.append(actions, $('.list-search-container'));
		this.migrationSearchInput = this.editorDisposables.add(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('promptMigrationSearchPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.editorDisposables.add(this.migrationSearchInput.onDidChange(() => {
			this.migrationSearchQuery = this.migrationSearchInput?.value ?? '';
			this.renderPromptMigrationPage();
		}));
		const actionButtonContainer = DOM.append(actions, $('.list-add-button-container'));
		this.migrationMigrateButton = this.editorDisposables.add(new Button(actionButtonContainer, defaultButtonStyles));
		this.migrationMigrateButton.element.classList.add('list-add-button', 'prompt-migration-button');
		this.migrationMigrateButton.label = localize('promptMigrationPageButton', "Migrate");
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.migrationMigrateButton.element, localize('promptMigrationPageButtonTooltip', "Convert selected prompt files to skills")));
		this.editorDisposables.add(this.migrationMigrateButton.onDidClick(() => {
			const selectedPromptFiles = this.promptFilesToMigrate.filter(file => this.selectedPromptMigrationUris.has(file.uri));
			void this.migratePromptFiles(selectedPromptFiles);
		}));

		this.migrationListContainer = DOM.append(this.migrationContentContainer, $('.prompt-migration-list.list-container'));
		this.renderPromptMigrationPage();
	}

	private createContent(): void {
		const contentInner = DOM.append(this.contentContainer, $('.content-inner'));

		// Welcome page (shown when no section is selected)
		this.createWelcomePage(contentInner);
		this.editorDisposables.add(this.promptsService.onDidChangeSlashCommands(() => {
			void this.refreshPromptMigrationInfo();
		}));
		this.editorDisposables.add(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			void this.refreshPromptMigrationInfo();
		}));

		// Container for prompts-based content (Agents, Skills, Instructions, Prompts)
		this.promptsContentContainer = DOM.append(contentInner, $('.prompts-content-container'));
		this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
		this.promptsContentContainer.appendChild(this.listWidget.element);
		this.createPromptMigrationContent(contentInner);

		// Handle item selection
		this.editorDisposables.add(this.listWidget.onDidSelectItem(item => {
			this.telemetryService.publicLog2<CustomizationEditorItemSelectedEvent, CustomizationEditorItemSelectedClassification>('chatCustomizationEditor.itemSelected', {
				section: this.selectedSection ?? 'welcome',
				promptType: item.promptType,
				storage: item.source ?? 'external',
			});
			const source = item.source;
			const isWorkspaceFile = source === AICustomizationSources.local;
			const isReadOnly = !source || source === AICustomizationSources.extension || source === AICustomizationSources.plugin || source === AICustomizationSources.builtin;
			this.showEmbeddedEditor(item.uri, item.name, item.promptType, source ?? AICustomizationSources.builtin, isWorkspaceFile, isReadOnly);
		}));

		// Handle create actions - AI-guided creation
		this.editorDisposables.add(this.listWidget.onDidRequestCreate(promptType => {
			this.createNewItemWithAI(promptType);
		}));

		// Handle manual create actions - open editor directly
		this.editorDisposables.add(this.listWidget.onDidRequestCreateManual(({ type, target, rootFileName }) => {
			this.createNewItemManual(type, target, rootFileName);
		}));

		// Container for Models content (only in sessions)
		const hasSections = new Set(this.workspaceService.managementSections);
		if (hasSections.has(AICustomizationManagementSection.Models)) {
			this.modelsContentContainer = DOM.append(contentInner, $('.models-content-container'));
			const modelsBackBar = DOM.append(this.modelsContentContainer, $('.section-back-bar'));
			modelsBackBar.appendChild(this.createBackArrowButton());
			this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
			this.modelsContentContainer.appendChild(this.modelsWidget.element);

			this.modelsFooterElement = DOM.append(this.modelsContentContainer, $('.section-footer'));
			const modelsDescription = DOM.append(this.modelsFooterElement, $('p.section-footer-description'));
			modelsDescription.textContent = localize('modelsDescription', "Browse and manage language models from different providers. Select models for use in chat, code completion, and other AI features.");
			const modelsLink = DOM.append(this.modelsFooterElement, $('a.section-footer-link')) as HTMLAnchorElement;
			modelsLink.textContent = localize('learnMoreModels', "Learn more about language models");
			modelsLink.href = 'https://code.visualstudio.com/docs/agent-customization/language-models?referrer=in-product';
			this.editorDisposables.add(DOM.addDisposableListener(modelsLink, 'click', (e) => {
				e.preventDefault();
				this.openerService.open(URI.parse(modelsLink.href));
			}));
		}

		// Container for MCP content
		if (hasSections.has(AICustomizationManagementSection.McpServers)) {
			this.mcpContentContainer = DOM.append(contentInner, $('.mcp-content-container'));
			this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
			this.mcpListWidget.setCloseCustomizationEditor(async () => {
				if (this.input) {
					await this.group.closeEditor(this.input);
				}
			});
			this.mcpContentContainer.appendChild(this.mcpListWidget.element);

			// Embedded MCP server detail view
			this.mcpDetailContainer = DOM.append(contentInner, $('.mcp-detail-container'));
			this.createEmbeddedMcpDetail();

			this.editorDisposables.add(this.mcpListWidget.onDidSelectServer(server => {
				this.showEmbeddedMcpDetail(server);
			}));

			this.editorDisposables.add(this.mcpListWidget.onDidRequestShowPlugin(item => {
				this.showPluginDetail(item);
			}));
		}

		// Container for Plugins content
		if (hasSections.has(AICustomizationManagementSection.Plugins)) {
			this.pluginContentContainer = DOM.append(contentInner, $('.plugin-content-container'));
			this.pluginListWidget = this.editorDisposables.add(this.instantiationService.createInstance(PluginListWidget));
			this.pluginContentContainer.appendChild(this.pluginListWidget.element);

			// Embedded plugin detail view
			this.pluginDetailContainer = DOM.append(contentInner, $('.plugin-detail-container'));
			this.createEmbeddedPluginDetail();

			this.editorDisposables.add(this.pluginListWidget.onDidSelectPlugin(item => {
				this.pluginDetailReturnSection = undefined;
				this.showEmbeddedPluginDetail(item);
			}));
		}

		// Container for Tools content.
		if (hasSections.has(AICustomizationManagementSection.Tools)) {
			this.toolsContentContainer = DOM.append(contentInner, $('.tools-content-container'));
			// Tools customizations only target the agent host (Copilot CLI), in both windows.
			this.toolsListWidget = this.editorDisposables.add(this.instantiationService.createInstance(ToolsListWidget, AGENT_HOST_COPILOT_CLI_SESSION_TYPE));
			this.toolsContentContainer.appendChild(this.toolsListWidget.element);

			// Embedded tool-contributing extension detail view
			this.toolsDetailContainer = DOM.append(contentInner, $('.tools-detail-container'));
			this.createEmbeddedToolDetail();

			this.editorDisposables.add(this.toolsListWidget.onDidSelectExtension(extension => {
				this.showEmbeddedToolDetail(extension);
			}));
		}

		// Container for Automations content
		if (hasSections.has(AICustomizationManagementSection.Automations)) {
			this.automationsContentContainer = DOM.append(contentInner, $('.automations-content-container'));
			this.automationsListWidget = this.editorDisposables.add(this.instantiationService.createInstance(AutomationsListWidget));
			this.automationsContentContainer.appendChild(this.automationsListWidget.element);
		}

		// Embedded editor container
		this.editorContentContainer = DOM.append(contentInner, $('.editor-content-container'));
		this.createEmbeddedEditor();

		// Set initial visibility based on selected section
		this.updateContentVisibility();

		// Wire up section count updates — active prompts section gets its count
		// from the list widget; all prompts sections are also refreshed from
		// the prompts service on every change event for consistency.
		this.editorDisposables.add(this.listWidget.onDidChangeItemCount(count => {
			if (this.isPromptsSection(this.selectedSection)) {
				this.updateSectionCount(this.selectedSection, count);
			}
		}));
		if (this.mcpListWidget) {
			this.editorDisposables.add(this.mcpListWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.McpServers, count);
			}));
			this.mcpListWidget.fireItemCount();
		}
		if (this.pluginListWidget) {
			this.editorDisposables.add(this.pluginListWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.Plugins, count);
			}));
			this.pluginListWidget.fireItemCount();
		}
		if (this.automationsListWidget) {
			this.editorDisposables.add(this.automationsListWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.Automations, count);
			}));
			this.automationsListWidget.fireItemCount();
		}
		if (this.modelsWidget) {
			this.editorDisposables.add(this.modelsWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.Models, count);
			}));
			this.modelsWidget.fireItemCount();
		}
		if (this.toolsListWidget) {
			this.editorDisposables.add(this.toolsListWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.Tools, count);
			}));
			this.toolsListWidget.fireItemCount();
		}

		// Per-prompts-section autoruns: drive sidebar counts from the items model,
		// the same source the editor list widget renders from.
		for (const section of ITEMS_MODEL_SECTIONS) {
			const observable = this.itemsModel.getCount(section);
			this.editorDisposables.add(autorun(reader => {
				this.updateSectionCount(section, observable.read(reader));
			}));
		}

		// Load items for the initial section
		if (this.isPromptsSection(this.selectedSection)) {
			void this.listWidget.setSection(this.selectedSection);
		}

		void this.refreshPromptMigrationInfo();
	}

	private async refreshPromptMigrationInfo(): Promise<void> {
		const activeHarnessId = this.harnessService.activeHarness.get();
		const refreshSequence = ++this.promptMigrationRefreshSequence;

		if (!isAgentHostTarget(activeHarnessId)) {
			this.setPromptFilesToMigrate([]);
			return;
		}

		try {
			const promptFiles = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
			if (refreshSequence !== this.promptMigrationRefreshSequence || activeHarnessId !== this.harnessService.activeHarness.get()) {
				return;
			}

			this.setPromptFilesToMigrate(promptFiles.filter(file => file.storage === PromptsStorage.local || file.storage === PromptsStorage.user));
		} catch (error) {
			if (refreshSequence === this.promptMigrationRefreshSequence) {
				this.setPromptFilesToMigrate([]);
			}
			onUnexpectedError(error);
		}
	}

	private setPromptFilesToMigrate(promptFiles: readonly IPromptPath[]): void {
		const previousPromptUris = new ResourceSet(this.promptFilesToMigrate.map(promptFile => promptFile.uri));
		const selectedPromptUris = new ResourceSet();
		for (const promptFile of promptFiles) {
			if (!previousPromptUris.has(promptFile.uri) || this.selectedPromptMigrationUris.has(promptFile.uri)) {
				selectedPromptUris.add(promptFile.uri);
			}
		}
		this.selectedPromptMigrationUris = selectedPromptUris;
		this.promptFilesToMigrate = promptFiles;
		this.refreshPromptMigrationUi();
	}

	private refreshPromptMigrationUi(): void {
		const migrationInfo = this.isPromptMigrationEnabled() ? getPromptMigrationInfo(this.promptFilesToMigrate) : undefined;
		this.welcomePage?.setPromptMigrationInfo(migrationInfo);
		this.updateSidebarMigrationShortcut(migrationInfo);
		this.renderPromptMigrationPage();
	}

	private updateSidebarMigrationShortcut(migrationInfo: ReturnType<typeof getPromptMigrationInfo> | undefined): void {
		if (!this.migrationShortcutContainer || !this.migrationShortcutButton || !this.migrationShortcutCount) {
			return;
		}

		if (!migrationInfo) {
			this.migrationShortcutContainer.style.display = 'none';
			this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
			return;
		}

		this.migrationShortcutContainer.style.display = '';
		this.migrationShortcutCount.textContent = String(migrationInfo.totalPromptCount);
		this.migrationShortcutButton.setAttribute(
			'aria-label',
			localize('migrationShortcutAriaLabelWithCount', "Prompts, {0} deprecated prompt files need migration", migrationInfo.totalPromptCount),
		);
		this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
	}

	private async migratePromptFiles(promptFiles: readonly IPromptPath[]): Promise<void> {
		if (promptFiles.length === 0) {
			return;
		}
		if (!this.isPromptMigrationEnabled()) {
			return;
		}

		const migrationInfo = getPromptMigrationInfo(promptFiles);
		if (!migrationInfo) {
			return;
		}
		const confirmResult = await this.dialogService.confirm({
			type: 'question',
			message: localize('promptMigrationConfirmMessage', "Convert prompt files to skills?"),
			detail: migrationInfo && migrationInfo.workspacePromptCount > 0 && migrationInfo.userPromptCount > 0
				? localize('promptMigrationConfirmDetailWorkspaceAndUser', "This converts {0} workspace prompt files and {1} user prompt files into skills.", migrationInfo.workspacePromptCount, migrationInfo.userPromptCount)
				: migrationInfo && migrationInfo.workspacePromptCount > 0
					? localize('promptMigrationConfirmDetailWorkspace', "This converts {0} workspace prompt files into skills.", migrationInfo.workspacePromptCount)
					: localize('promptMigrationConfirmDetailUser', "This converts {0} user prompt files into skills.", migrationInfo?.userPromptCount ?? this.promptFilesToMigrate.length),
			checkbox: {
				label: localize('promptMigrationDeletePromptFilesCheckbox', "Delete original prompt files after migration"),
				checked: true,
			},
			primaryButton: localize('promptMigrationConfirmButton', "Convert to Skills"),
		});
		if (!confirmResult.confirmed) {
			return;
		}

		const skillSourceFolders = await this.itemsModel.getActiveItemSource().fetchSourceFolders(PromptsType.skill);
		if (skillSourceFolders.length === 0) {
			this.notificationService.error(localize('promptMigrationNoSkillFolders', "No skill folders are configured for the active harness."));
			return;
		}
		const skillSourceFoldersByStorage = await this.resolveMigrationSkillSourceFolders(skillSourceFolders, migrationInfo);
		if (!skillSourceFoldersByStorage) {
			return;
		}

		const migrationResult = await migratePromptFilesToSkills(
			promptFiles,
			skillSourceFoldersByStorage,
			this.fileService,
			onUnexpectedError,
			{ deleteOriginalPromptFiles: confirmResult.checkboxChecked !== false },
		);
		const { convertedCount, failedPromptFileNames, unsupportedHeaderKeys, convertedSkillFileUris } = migrationResult;

		if (failedPromptFileNames.length > 0) {
			const displayedFileNames = failedPromptFileNames.slice(0, 3);
			const hiddenFileCount = failedPromptFileNames.length - displayedFileNames.length;
			if (hiddenFileCount > 0) {
				this.notificationService.error(localize(
					'promptMigrationFilesFailedWithRemainder',
					"Failed to migrate {0} prompt files: {1}, and {2} more.",
					failedPromptFileNames.length,
					displayedFileNames.join(', '),
					hiddenFileCount,
				));
			} else {
				this.notificationService.error(localize(
					'promptMigrationFilesFailed',
					"Failed to migrate {0} prompt files: {1}.",
					failedPromptFileNames.length,
					displayedFileNames.join(', '),
				));
			}
		}

		if (convertedCount === 0) {
			if (failedPromptFileNames.length === 0) {
				this.notificationService.warn(localize('promptMigrationNoFilesConverted', "No prompt files were converted."));
			}
			return;
		}

		await this.refreshPromptMigrationInfo();

		const unsupportedKeysLabel = Array.from(unsupportedHeaderKeys).sort().join(', ');
		if (unsupportedKeysLabel.length > 0) {
			this.notificationService.info(localize(
				'promptMigrationConvertedWithReview',
				"Converted {0} prompt files to skills. Review migrated skills that used unsupported prompt headers: {1}.",
				convertedCount,
				unsupportedKeysLabel,
			));
		} else {
			this.notificationService.info(localize('promptMigrationConverted', "Converted {0} prompt files to skills.", convertedCount));
		}

		this.selectSection(AICustomizationManagementSection.Skills);
		void this.revealMigratedSkills(convertedSkillFileUris);
	}

	private renderPromptMigrationPage(): void {
		if (!this.migrationListContainer || !this.migrationMigrateButton) {
			return;
		}

		this.migrationPageDisposables.clear();
		DOM.clearNode(this.migrationListContainer);
		this.updatePromptMigrationPageDescription();
		if (this.promptFilesToMigrate.length === 0 || !this.isPromptMigrationEnabled()) {
			const emptyMessage = DOM.append(this.migrationListContainer, $('p.prompt-migration-empty'));
			emptyMessage.textContent = localize('promptMigrationPageEmpty', "No prompt files are available to migrate.");
			this.migrationMigrateButton.enabled = false;
			return;
		}

		const query = this.migrationSearchQuery.trim().toLowerCase();
		const filteredPromptFiles = this.promptFilesToMigrate.filter(promptFile => {
			if (!query) {
				return true;
			}
			const displayName = (promptFile.name ?? basename(promptFile.uri)).toLowerCase();
			const relativePath = this.labelService.getUriLabel(promptFile.uri, { relative: true }).toLowerCase();
			return displayName.includes(query) || relativePath.includes(query);
		});
		if (filteredPromptFiles.length === 0) {
			const emptyMessage = DOM.append(this.migrationListContainer, $('p.prompt-migration-empty'));
			emptyMessage.textContent = localize('promptMigrationSearchEmpty', "No prompt files match your search.");
			this.updatePromptMigrationActionState();
			return;
		}

		const workspacePromptFiles = filteredPromptFiles.filter(file => file.storage === PromptsStorage.local);
		const userPromptFiles = filteredPromptFiles.filter(file => file.storage === PromptsStorage.user);
		const openPromptFileInEmbeddedEditor = (promptFile: IPromptPath): void => {
			const isWorkspaceFile = promptFile.storage === PromptsStorage.local;
			void this.showEmbeddedEditor(
				promptFile.uri,
				promptFile.name ?? basename(promptFile.uri),
				PromptsType.prompt,
				promptFile.storage,
				isWorkspaceFile,
			);
		};
		const renderSelectionCheckbox = (row: HTMLElement, promptFile: IPromptPath): Checkbox => {
			const checkboxContainer = DOM.append(row, $('.item-sync-checkbox.prompt-migration-checkbox'));
			const checkboxTitle = localize('promptMigrationSelectAriaLabel', "Select {0}", promptFile.name ?? basename(promptFile.uri));
			const checkbox = this.migrationPageDisposables.add(new Checkbox(checkboxTitle, this.selectedPromptMigrationUris.has(promptFile.uri), defaultCheckboxStyles));
			checkboxContainer.replaceChildren(checkbox.domNode);
			this.migrationPageDisposables.add(checkbox.onChange(() => {
				if (checkbox.checked) {
					this.selectedPromptMigrationUris.add(promptFile.uri);
				} else {
					this.selectedPromptMigrationUris.delete(promptFile.uri);
				}
				this.updatePromptMigrationActionState();
			}));
			return checkbox;
		};

		const renderItem = (container: HTMLElement, promptFile: IPromptPath): void => {
			const row = DOM.append(container, $('div.ai-customization-list-item.prompt-migration-item'));
			const checkbox = renderSelectionCheckbox(row, promptFile);
			this.migrationPageDisposables.add(DOM.addDisposableListener(row, 'click', event => {
				if (event.target instanceof Node && checkbox.domNode.contains(event.target)) {
					return;
				}
				openPromptFileInEmbeddedEditor(promptFile);
			}));

			const itemLeft = DOM.append(row, $('span.item-left'));
			const itemText = DOM.append(itemLeft, $('span.item-text'));
			const nameRow = DOM.append(itemText, $('span.item-name-row'));
			const nameLabel = DOM.append(nameRow, $('span.item-name.prompt-migration-item-name'));
			nameLabel.textContent = promptFile.name ?? basename(promptFile.uri);

			const pathLabel = DOM.append(itemText, $('span.item-description.is-filename.prompt-migration-item-path'));
			pathLabel.textContent = this.labelService.getUriLabel(promptFile.uri, { relative: true });

			const itemRight = DOM.append(row, $('span.item-right'));
			const deleteButton = DOM.append(itemRight, $('button.icon-button', {
				type: 'button',
				'aria-label': localize('deletePromptFile', "Delete {0}", promptFile.name ?? basename(promptFile.uri)),
			})) as HTMLButtonElement;
			deleteButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.trash));
			this.migrationPageDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), deleteButton, localize('deletePromptFileTooltip', "Delete")));
			this.migrationPageDisposables.add(DOM.addDisposableListener(deleteButton, 'click', event => {
				event.stopPropagation();
				void this.deletePromptFile(promptFile);
			}));
		};

		const renderGroup = (groupLabel: string, promptFiles: readonly IPromptPath[]): void => {
			if (promptFiles.length === 0) {
				return;
			}

			const group = DOM.append(this.migrationListContainer!, $('.prompt-migration-group'));
			const groupHeader = DOM.append(group, $('.ai-customization-group-header.prompt-migration-group-header'));
			const groupCheckboxContainer = DOM.append(groupHeader, $('.item-sync-checkbox.prompt-migration-group-checkbox'));
			const allInGroupSelected = promptFiles.every(file => this.selectedPromptMigrationUris.has(file.uri));
			const groupCheckboxAriaLabel = localize('promptMigrationSelectGroupAriaLabel', "Select all {0} prompt files", groupLabel.toLowerCase());
			const groupCheckbox = this.migrationPageDisposables.add(new Checkbox(groupCheckboxAriaLabel, allInGroupSelected, defaultCheckboxStyles));
			groupCheckboxContainer.replaceChildren(groupCheckbox.domNode);
			this.migrationPageDisposables.add(groupCheckbox.onChange(() => {
				for (const promptFile of promptFiles) {
					if (groupCheckbox.checked) {
						this.selectedPromptMigrationUris.add(promptFile.uri);
					} else {
						this.selectedPromptMigrationUris.delete(promptFile.uri);
					}
				}
				this.renderPromptMigrationPage();
			}));
			const groupLabelGroup = DOM.append(groupHeader, $('.group-label-group'));
			const label = DOM.append(groupLabelGroup, $('span.group-label'));
			label.textContent = groupLabel;
			const count = DOM.append(groupLabelGroup, $('span.group-count'));
			count.textContent = String(promptFiles.length);

			for (const promptFile of promptFiles) {
				renderItem(group, promptFile);
			}
		};

		renderGroup(localize('promptMigrationWorkspaceGroup', "Workspace"), workspacePromptFiles);
		renderGroup(localize('promptMigrationUserGroup', "User"), userPromptFiles);

		for (const promptFile of filteredPromptFiles.filter(file => file.storage !== PromptsStorage.local && file.storage !== PromptsStorage.user)) {
			renderItem(this.migrationListContainer, promptFile);
		}

		this.updatePromptMigrationActionState();
	}

	private updatePromptMigrationPageDescription(): void {
		if (!this.migrationDescriptionElement) {
			return;
		}

		const migrationInfo = getPromptMigrationInfo(this.promptFilesToMigrate);
		if (!migrationInfo) {
			this.migrationDescriptionElement.textContent = localize('promptMigrationPageDescription', "Select prompt files to convert into skills for the active harness.");
			return;
		}

		const { workspacePromptCount, userPromptCount, totalPromptCount } = migrationInfo;
		const harnessLabel = this.getActiveHarnessLabel();

		if (workspacePromptCount > 0 && userPromptCount > 0) {
			this.migrationDescriptionElement.textContent = localize(
				'promptMigrationPageDescriptionWorkspaceAndUser',
				"Prompt files are not supported for this harness. Found {0} prompt files ({1} workspace, {2} user) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
				totalPromptCount,
				workspacePromptCount,
				userPromptCount,
				harnessLabel,
			);
			return;
		}

		if (workspacePromptCount > 0) {
			this.migrationDescriptionElement.textContent = localize(
				'promptMigrationPageDescriptionWorkspace',
				"Prompt files are not supported for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
				workspacePromptCount,
				harnessLabel,
			);
			return;
		}

		this.migrationDescriptionElement.textContent = localize(
			'promptMigrationPageDescriptionUser',
			"Prompt files are not supported for this harness. Found {0} user prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
			userPromptCount,
			harnessLabel,
		);
	}

	private updatePromptMigrationActionState(): void {
		if (!this.migrationMigrateButton) {
			return;
		}
		const selectedCount = this.promptFilesToMigrate.filter(file => this.selectedPromptMigrationUris.has(file.uri)).length;
		this.migrationMigrateButton.enabled = selectedCount > 0;
		this.migrationMigrateButton.label = selectedCount > 0
			? localize('promptMigrationPageButtonWithCount', "Migrate ({0})", selectedCount)
			: localize('promptMigrationPageButton', "Migrate");
	}

	private async deletePromptFile(promptFile: IPromptPath): Promise<void> {
		const fileName = promptFile.name ?? basename(promptFile.uri);
		const confirmation = await this.dialogService.confirm({
			message: localize('confirmDeletePromptFile', "Are you sure you want to delete '{0}'?", fileName),
			detail: localize('confirmDeleteDetail', "This action cannot be undone."),
			primaryButton: localize('delete', "Delete"),
			type: 'warning',
		});

		if (!confirmation.confirmed) {
			return;
		}

		const useTrash = this.fileService.hasCapability(promptFile.uri, FileSystemProviderCapabilities.Trash);
		await this.fileService.del(promptFile.uri, { useTrash });
		if (promptFile.storage === PromptsStorage.local) {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			if (projectRoot) {
				await this.workspaceService.deleteFiles(projectRoot, [promptFile.uri]);
			}
		}

		// Remove the deleted file from the list and re-render immediately
		const updatedFiles = this.promptFilesToMigrate.filter(f => !isEqual(f.uri, promptFile.uri));
		this.setPromptFilesToMigrate(updatedFiles);
	}

	private isPromptMigrationEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled) === true;
	}

	private async resolveMigrationSkillSourceFolders(
		skillSourceFolders: readonly ICustomizationSourceFolder[],
		migrationInfo: ReturnType<typeof getPromptMigrationInfo>,
	): Promise<PromptMigrationSkillSourceFolders | undefined> {
		const sourceFoldersByStorage = new Map<PromptsStorage, ICustomizationSourceFolder>();

		const localSkillSourceFolders = skillSourceFolders.filter(folder => folder.source === PromptsStorage.local);
		if (localSkillSourceFolders.length > 0) {
			if ((migrationInfo?.workspacePromptCount ?? 0) > 0 && localSkillSourceFolders.length > 1) {
				const pickedLocalFolder = await this.pickMigrationWorkspaceSkillSourceFolder(localSkillSourceFolders);
				if (!pickedLocalFolder) {
					return undefined;
				}
				sourceFoldersByStorage.set(PromptsStorage.local, pickedLocalFolder);
			} else {
				sourceFoldersByStorage.set(PromptsStorage.local, localSkillSourceFolders[0]);
			}
		}

		for (const folder of skillSourceFolders) {
			if (folder.source === PromptsStorage.user && !sourceFoldersByStorage.has(PromptsStorage.user)) {
				sourceFoldersByStorage.set(PromptsStorage.user, folder);
			}
			if (folder.source === PromptsStorage.local && !sourceFoldersByStorage.has(PromptsStorage.local)) {
				sourceFoldersByStorage.set(PromptsStorage.local, folder);
			}
		}

		return sourceFoldersByStorage;
	}

	private async pickMigrationWorkspaceSkillSourceFolder(localSkillSourceFolders: readonly ICustomizationSourceFolder[]): Promise<ICustomizationSourceFolder | undefined> {
		const picks: IMigrationSkillTargetQuickPickItem[] = localSkillSourceFolders.map(folder => ({
			label: folder.label,
			description: this.labelService.getUriLabel(folder.uri, { relative: true }),
			folder,
		}));

		const selected = await this.quickInputService.pick(picks, {
			canPickMany: false,
			placeHolder: localize('promptMigrationPickWorkspaceSkillFolder', "Select a workspace skill folder for migrated prompts"),
			matchOnDescription: true,
		});
		return selected?.folder;
	}

	private async revealMigratedSkills(skillUris: readonly URI[]): Promise<void> {
		if (skillUris.length === 0) {
			return;
		}

		await this.listWidget.setSection(AICustomizationManagementSection.Skills);
		if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
			return;
		}

		// A stale search filter can hide migrated skills from the list.
		this.listWidget.clearSearch();
		if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
			return;
		}

		// Skill discovery/list refresh can lag immediately after migration;
		// retry briefly until the new item appears.
		for (let attempt = 0; attempt < 10; attempt++) {
			await timeout(100);
			if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
				return;
			}
		}
	}

	private isPromptsSection(section: AICustomizationManagementSection | undefined): section is AICustomizationManagementSection {
		return section === AICustomizationManagementSection.Agents ||
			section === AICustomizationManagementSection.Skills ||
			section === AICustomizationManagementSection.Instructions ||
			section === AICustomizationManagementSection.Prompts ||
			section === AICustomizationManagementSection.Hooks;
	}

	//#region Section Counts

	/**
	 * Updates the count for a specific section and re-renders the sidebar.
	 */
	private updateSectionCount(sectionId: AICustomizationManagementSection, count: number): void {
		const section = this.sections.find(s => s.id === sectionId);
		if (!section || section.count === count) {
			return;
		}
		section.count = count;
		// Re-splice the sections list to trigger re-render
		this.sectionsList.splice(0, this.sectionsList.length, this.sections);
		this.ensureSectionsListReflectsActiveSection();
	}

	//#endregion

	/**
	 * Navigates to the welcome page (no section selected).
	 */
	public showWelcomePage(): void {
		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
		if (this.viewMode === 'migration') {
			this.viewMode = 'list';
		}
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
		}
		if (this.viewMode === 'toolsDetail') {
			this.goBackFromToolDetail();
		}

		this.selectedSection = undefined;
		this.sectionContextKey.set('');

		// Clear persisted section so welcome shows next time
		this.storageService.remove(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);

		this.welcomePage?.reset();
		this.updateContentVisibility();
		this.ensureSectionsListReflectsActiveSection(undefined);
		this.welcomePage?.focus();
	}

	private selectSection(section: AICustomizationManagementSection, options?: { showMarketplace?: boolean }): void {
		if (this.selectedSection === section && !options?.showMarketplace) {
			this.ensureSectionsListReflectsActiveSection(section);
			return;
		}

		this.telemetryService.publicLog2<CustomizationEditorSectionChangedEvent, CustomizationEditorSectionChangedClassification>('chatCustomizationEditor.sectionChanged', {
			section,
		});

		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
		if (this.viewMode === 'migration') {
			this.viewMode = 'list';
		}
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
		}
		if (this.viewMode === 'toolsDetail') {
			this.goBackFromToolDetail();
		}

		this.selectedSection = section;
		this.sectionContextKey.set(section);

		// Persist selection
		this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, section, StorageScope.PROFILE, StorageTarget.USER);

		// Update content visibility
		this.updateContentVisibility();

		// Load items for the new section (only for prompts-based sections)
		if (this.isPromptsSection(section)) {
			void this.listWidget.setSection(section);
		}

		// Re-layout after visibility change so the newly-visible widget can
		// measure its flex-computed container height correctly. Without this,
		// a widget that was previously hidden (offsetHeight === 0) keeps its
		// stale listContainer height and clips items at the bottom.
		if (this.dimension) {
			this.layout(this.dimension);
		}

		this.ensureSectionsListReflectsActiveSection(section);

		// Activate marketplace browse mode if requested
		if (options?.showMarketplace) {
			if (section === AICustomizationManagementSection.McpServers) {
				this.mcpListWidget?.showBrowseMarketplace();
			} else if (section === AICustomizationManagementSection.Plugins) {
				this.pluginListWidget?.showBrowseMarketplace();
			}
		}

		// Move focus to the search input so keyboard users can immediately
		// filter without extra Tab traversal (parity with mouse-click flow).
		if (section === AICustomizationManagementSection.McpServers) {
			this.mcpListWidget?.focusSearch();
		} else if (section === AICustomizationManagementSection.Plugins) {
			this.pluginListWidget?.focusSearch();
		} else if (section === AICustomizationManagementSection.Models) {
			this.modelsWidget?.focusSearch();
		} else if (section === AICustomizationManagementSection.Tools) {
			this.toolsListWidget?.focusSearch();
		} else if (section === AICustomizationManagementSection.Automations) {
			this.automationsListWidget?.focus();
		} else {
			this.listWidget?.focusSearch();
		}
	}

	private ensureSectionsListReflectsActiveSection(section: AICustomizationManagementSection | undefined = this.selectedSection): void {
		if (!this.sectionsList) {
			return;
		}

		if (section === undefined) {
			// Welcome page — deselect all
			this.sectionsList.setSelection([]);
			this.sectionsList.setFocus([]);
			return;
		}

		const index = this.sections.findIndex(s => s.id === section);
		if (index < 0) {
			return;
		}

		const selection = this.sectionsList.getSelection();
		if (selection.length !== 1 || selection[0] !== index) {
			this.sectionsList.setSelection([index]);
		}

		const focus = this.sectionsList.getFocus();
		if (focus.length !== 1 || focus[0] !== index) {
			this.sectionsList.setFocus([index]);
		}
	}

	private updateContentVisibility(): void {
		const isEditorMode = this.viewMode === 'editor';
		const isMigrationMode = this.viewMode === 'migration';
		const isMcpDetailMode = this.viewMode === 'mcpDetail';
		const isPluginDetailMode = this.viewMode === 'pluginDetail';
		const isToolsDetailMode = this.viewMode === 'toolsDetail';
		const isDetailMode = isMcpDetailMode || isPluginDetailMode || isToolsDetailMode;
		const isWelcome = this.selectedSection === undefined;
		const isPromptsSection = this.selectedSection !== undefined && this.isPromptsSection(this.selectedSection);
		const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
		const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
		const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;
		const isToolsSection = this.selectedSection === AICustomizationManagementSection.Tools;
		const isAutomationsSection = this.selectedSection === AICustomizationManagementSection.Automations;

		if (this.welcomePage) {
			this.welcomePage.container.style.display = isWelcome && !isEditorMode && !isMigrationMode && !isDetailMode ? '' : 'none';
		}
		if (this.promptsContentContainer) {
			this.promptsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPromptsSection ? '' : 'none';
		}
		if (this.migrationContentContainer) {
			this.migrationContentContainer.style.display = isMigrationMode ? '' : 'none';
		}
		if (this.modelsContentContainer) {
			this.modelsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isModelsSection ? '' : 'none';
		}
		if (this.mcpContentContainer) {
			this.mcpContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isMcpSection ? '' : 'none';
		}
		if (this.mcpDetailContainer) {
			this.mcpDetailContainer.style.display = isMcpDetailMode ? '' : 'none';
		}
		if (this.pluginContentContainer) {
			this.pluginContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPluginsSection ? '' : 'none';
		}
		if (this.automationsContentContainer) {
			this.automationsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isAutomationsSection ? '' : 'none';
		}
		if (this.pluginDetailContainer) {
			this.pluginDetailContainer.style.display = isPluginDetailMode ? '' : 'none';
		}
		if (this.toolsContentContainer) {
			this.toolsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isToolsSection ? '' : 'none';
		}
		if (this.toolsDetailContainer) {
			this.toolsDetailContainer.style.display = isToolsDetailMode ? '' : 'none';
		}
		if (this.editorContentContainer) {
			this.editorContentContainer.style.display = isEditorMode ? '' : 'none';
		}

		// Render and layout models widget when switching to it
		if (isModelsSection && this.modelsWidget) {
			this.modelsWidget.render();
			if (this.dimension) {
				this.layout(this.dimension);
			}
		}
	}

	/**
	 * Creates a new customization using the AI-guided flow.
	 */
	private async createNewItemWithAI(type: PromptsType): Promise<void> {
		this.telemetryService.publicLog2<CustomizationEditorCreateItemEvent, CustomizationEditorCreateItemClassification>('chatCustomizationEditor.createItem', {
			section: this.selectedSection ?? 'welcome',
			promptType: type,
			creationMode: 'ai',
			target: 'workspace',
		});
		if (this.input) {
			this.group.closeEditor(this.input);
		}
		await this.workspaceService.generateCustomization(type);
	}

	/**
	 * Creates a new prompt file and opens it in the embedded editor.
	 */
	private async createNewItemManual(type: PromptsType, target: 'local' | 'user' | 'workspace-root', rootFileName?: string): Promise<void> {
		this.telemetryService.publicLog2<CustomizationEditorCreateItemEvent, CustomizationEditorCreateItemClassification>('chatCustomizationEditor.createItem', {
			section: this.selectedSection ?? 'welcome',
			promptType: type,
			creationMode: 'manual',
			target: target === 'workspace-root' ? 'workspace' : target,
		});

		// Handle workspace-root files (e.g. AGENTS.md or CLAUDE.md at project root).
		// rootFileName is passed from rootFileShortcuts; falls back to
		// the section override's rootFile, then AGENTS.md as the default.
		if (target === 'workspace-root') {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			if (!projectRoot) {
				return;
			}
			const override = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : undefined;
			const fileName = rootFileName ?? override?.rootFile ?? AGENT_MD_FILENAME;
			const fileUri = URI.joinPath(projectRoot, fileName);
			if (await this.fileService.exists(fileUri)) {
				// File already exists — just open it
				await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
			} else {
				await this.fileService.createFile(fileUri);
				await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
			}
			this.listWidget.refresh();
			return;
		}

		if (type === PromptsType.hook) {
			if (this.workspaceService.isSessionsWindow) {
				// Sessions: show hooks filtered to Copilot CLI (GitHub Copilot) hook types
				await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
					openEditor: async (resource) => {
						await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
						return;
					},
					target: Target.GitHubCopilot,
				});
			} else {
				// Core: use the default core behaviour
				await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
					openEditor: async (resource) => {
						await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
						return;
					}
				});
			}
			return;
		}
		const sessionResource = this.harnessService.activeSessionResource.get();
		const picker = this.instantiationService.createInstance(CustomizationLocationPicker);
		const targetDir = await picker.resolveTargetDirectoryWithPicker(
			sessionResource,
			type,
			target,
		);
		if (targetDir === null) {
			return; // User cancelled the picker
		}

		if (targetDir === undefined) {
			// targetDir may be undefined when no matching folder exists for the
			// requested storage type (e.g. skills have no user-storage folder).
			await this.instantiationService.invokeFunction(showNoFoldersDialog, type);
			return;
		}

		// When the active harness overrides the file extension (e.g. Claude
		// rules use .md instead of .instructions.md), pass it through so the
		// name picker and file creation use the correct extension.
		const override = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : undefined;

		const options: INewPromptOptions = {
			targetFolder: targetDir,
			targetStorage: target === AICustomizationSources.user ? PromptsStorage.user : PromptsStorage.local,
			fileExtension: override?.fileExtension,
			openFile: async (uri) => {
				const isWorkspace = target === AICustomizationSources.local;
				await this.showEmbeddedEditor(uri, basename(uri), type, target, isWorkspace);
				return this.embeddedEditor;
			},
		};

		let commandId: string;
		switch (type) {
			case PromptsType.prompt: commandId = NEW_PROMPT_COMMAND_ID; break;
			case PromptsType.instructions: commandId = NEW_INSTRUCTIONS_COMMAND_ID; break;
			case PromptsType.agent: commandId = NEW_AGENT_COMMAND_ID; break;
			case PromptsType.skill: commandId = NEW_SKILL_COMMAND_ID; break;
			default: return;
		}

		await this.commandService.executeCommand(commandId, options);
		this.listWidget.refresh();
	}

	override updateStyles(): void {
		// The modal provides its own panel chrome, so the split view separator
		// is intentionally hidden here regardless of theme.
		this.splitView?.style({ separatorBorder: Color.transparent });
	}

	override async setInput(input: AICustomizationManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// On (re)open, clear any override so the root comes from the default source
		this.workspaceService.clearOverrideProjectRoot();

		this.inEditorContextKey.set(true);
		this.sectionContextKey.set(this.selectedSection ?? '');

		input.setSaveHandler(() => this.handleBuiltinSave());

		this.telemetryService.publicLog2<CustomizationEditorOpenedEvent, CustomizationEditorOpenedClassification>('chatCustomizationEditor.opened', {
			section: this.selectedSection ?? 'welcome',
		});

		await super.setInput(input, options, context, token);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override clearInput(): void {
		const input = this.input;
		if (input instanceof AICustomizationManagementEditorInput) {
			input.setSaveHandler(undefined);
			input.setDirty(false);
		}

		this.inEditorContextKey.set(false);
		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
		if (this.viewMode === 'migration') {
			this.viewMode = 'list';
		}
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
		}
		if (this.viewMode === 'toolsDetail') {
			this.goBackFromToolDetail();
		}
		// Clear transient folder override on close
		this.workspaceService.clearOverrideProjectRoot();
		this.disposeBuiltinEditingSessions();
		super.clearInput();
	}

	override layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		if (this.container && this.splitView) {
			this.splitViewContainer.style.height = `${dimension.height}px`;
			this.splitView.layout(dimension.width, dimension.height);
		}
		this.migrationSearchInput?.layout();
	}

	override focus(): void {
		super.focus();
		if (this.viewMode === 'editor') {
			if (this.editorDisplayMode === 'raw') {
				this.embeddedEditor?.focus();
			} else {
				this.editorModeButton?.focus();
			}
			return;
		}
		if (this.viewMode === 'migration') {
			this.migrationSearchInput?.focus();
			return;
		}
		if (this.selectedSection === undefined) {
			this.welcomePage?.focus();
			return;
		}
		if (this.selectedSection === AICustomizationManagementSection.McpServers) {
			this.mcpListWidget?.focusSearch();
		} else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
			this.pluginListWidget?.focusSearch();
		} else if (this.selectedSection === AICustomizationManagementSection.Models) {
			this.modelsWidget?.focusSearch();
		} else if (this.selectedSection === AICustomizationManagementSection.Tools) {
			this.toolsListWidget?.focusSearch();
		} else if (this.selectedSection === AICustomizationManagementSection.Automations) {
			this.automationsListWidget?.focus();
		} else {
			this.listWidget?.focusSearch();
		}
	}

	/**
	 * Selects a specific section programmatically.
	 */
	public selectSectionById(sectionId: AICustomizationManagementSection, options?: { showMarketplace?: boolean }): void {
		const index = this.sections.findIndex(s => s.id === sectionId);
		if (index >= 0) {
			// Directly update state and UI, bypassing the early-return guard in selectSection
			// to handle the case where the editor just opened with a persisted section that
			// matches the requested one (content might not be loaded yet).
			if (this.viewMode === 'editor') {
				this.goBackToList();
			}
			if (this.viewMode === 'migration') {
				this.viewMode = 'list';
			}
			if (this.viewMode === 'mcpDetail') {
				this.goBackFromMcpDetail();
			}
			if (this.viewMode === 'pluginDetail') {
				this.goBackFromPluginDetail();
			}
			if (this.viewMode === 'toolsDetail') {
				this.goBackFromToolDetail();
			}
			this.selectedSection = sectionId;
			this.sectionContextKey.set(sectionId);
			this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, sectionId, StorageScope.PROFILE, StorageTarget.USER);
			this.updateContentVisibility();
			if (this.isPromptsSection(sectionId)) {
				void this.listWidget.setSection(sectionId);
			}
			// Re-layout after visibility change so the newly-visible widget
			// can measure its flex-computed container height correctly.
			if (this.dimension) {
				this.layout(this.dimension);
			}
			this.ensureSectionsListReflectsActiveSection(sectionId);

			// Activate marketplace browse mode if requested
			if (options?.showMarketplace) {
				if (sectionId === AICustomizationManagementSection.McpServers) {
					this.mcpListWidget?.showBrowseMarketplace();
				} else if (sectionId === AICustomizationManagementSection.Plugins) {
					this.pluginListWidget?.showBrowseMarketplace();
				}
			}
		}
	}

	public showPromptMigrationPage(): void {
		if (!this.isPromptMigrationEnabled()) {
			return;
		}

		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
		}
		if (this.viewMode === 'toolsDetail') {
			this.goBackFromToolDetail();
		}

		this.selectedSection = undefined;
		this.sectionContextKey.set('');
		this.viewMode = 'migration';
		this.ensureSectionsListReflectsActiveSection(undefined);
		this.renderPromptMigrationPage();
		this.updateContentVisibility();
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	/**
	 * Refreshes the list widget.
	 */
	public refreshList(): void {
		this.listWidget.refresh();
	}

	/**
	 * Scrolls the active list widget so the last item is visible.
	 */
	public revealLastItem(): void {
		if (this.selectedSection === AICustomizationManagementSection.McpServers) {
			this.mcpListWidget?.revealLastItem();
		} else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
			this.pluginListWidget?.revealLastItem();
		} else {
			this.listWidget.revealLastItem();
		}
	}

	/**
	 * Generates a debug report for the current section.
	 */
	public async generateDebugReport(): Promise<string> {
		return this.listWidget.generateDebugReport();
	}

	//#region Embedded Editor

	private createEmbeddedEditor(): void {
		if (!this.editorContentContainer) {
			return;
		}

		const editorHeader = DOM.append(this.editorContentContainer, $('.editor-header'));

		this.editorActionButton = DOM.append(editorHeader, $('button.editor-back-button'));
		this.editorActionButton.setAttribute('aria-label', localize('backToList', "Back to list"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.editorActionButton, localize('backToListTooltip', "Back to list")));
		this.editorActionButtonIcon = DOM.append(this.editorActionButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}.editor-action-button-icon`));
		this.editorActionButtonIcon.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(this.editorActionButton, 'click', () => {
			void this.handleEditorActionButton().catch(error => {
				console.error('Failed to handle editor back action:', error);
				this.notificationService.error(localize('editorActionButtonFailed', "Failed to finish the prompt action."));
			});
		}));

		const itemInfo = DOM.append(editorHeader, $('.editor-item-info'));
		this.editorItemNameElement = DOM.append(itemInfo, $('.editor-item-name'));
		this.editorItemPathElement = DOM.append(itemInfo, $('.editor-item-path'));

		this.editorModeButton = DOM.append(editorHeader, $('button.editor-mode-button'));
		this.editorModeButton.type = 'button';
		this.editorModeButton.setAttribute('aria-pressed', 'false');
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.editorModeButton, () => this.getEditorModeButtonTooltip()));
		this.editorDisposables.add(DOM.addDisposableListener(this.editorModeButton, 'click', () => {
			this.toggleEditorDisplayMode();
		}));

		this.editorSaveIndicator = DOM.append(editorHeader, $('.editor-save-indicator'));

		this.editorPreviewContainer = DOM.append(this.editorContentContainer, $('.editor-preview-container'));
		this.editorPreviewScrollContainer = DOM.append(this.editorPreviewContainer, $('.editor-preview-scroll-container'));
		this.editorPreviewScrollContainer.setAttribute('role', 'region');
		this.editorPreviewScrollContainer.setAttribute('aria-label', localize('customizationPreviewAriaLabel', "Customization preview"));

		this.editorPreviewIssuesContainer = DOM.append(this.editorPreviewScrollContainer, $('.editor-preview-issues'));

		const frontMatterSection = DOM.append(this.editorPreviewScrollContainer, $('.editor-preview-section.editor-preview-frontmatter-section'));
		this.editorPreviewFrontMatterContainer = DOM.append(frontMatterSection, $('.editor-preview-frontmatter-list'));

		const bodySection = DOM.append(this.editorPreviewScrollContainer, $('.editor-preview-section.editor-preview-body-section'));
		this.editorPreviewBodyContainer = DOM.append(bodySection, $('.editor-preview-body-content'));

		this.embeddedEditorContainer = DOM.append(this.editorContentContainer, $('.embedded-editor-container'));
		const overflowWidgetsDomNode = DOM.append(this.editorContentContainer, $('.embedded-editor-overflow-widgets.monaco-editor'));
		this.editorDisposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));

		this.embeddedEditor = this.editorDisposables.add(this.instantiationService.createInstance(
			CodeEditorWidget,
			this.embeddedEditorContainer,
			{
				...getSimpleEditorOptions(this.configurationService),
				readOnly: false,
				minimap: { enabled: false },
				lineNumbers: 'on' as const,
				wordWrap: 'on' as const,
				scrollBeyondLastLine: false,
				automaticLayout: false,
				folding: true,
				renderLineHighlight: 'all' as const,
				scrollbar: { vertical: 'auto' as const, horizontal: 'auto' as const },
				overflowWidgetsDomNode,
			},
			{ isSimpleWidget: false }
		));

		this.updateEditorDisplayMode();
	}

	private async showEmbeddedEditor(uri: URI, displayName: string, promptType: PromptsType, source: AICustomizationSource, isWorkspaceFile = false, isReadOnly = false): Promise<void> {
		this.editorReturnViewMode = this.viewMode === 'migration' ? 'migration' : 'list';
		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.editorModelChangeDisposables.clear();
		this.editorPreviewDisposables.clear();
		this.editorPreviewRenderScheduler.cancel();
		this.currentEditingUri = uri;
		this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : undefined;
		this.currentEditingSource = source;
		this.currentEditingPromptType = promptType;
		this.currentEditingReadOnly = isReadOnly;
		this.editorDisplayMode = this.isStructuredPreviewSupported(promptType) ? 'preview' : 'raw';
		this.viewMode = 'editor';

		this.editorItemNameElement.textContent = displayName;
		this.editorItemPathElement.textContent = basename(uri);
		this._editorContentChanged = false;
		this.resetEditorSaveIndicator();
		this.updateEditorActionButton();
		this.updateEditorDisplayMode();
		this.updateContentVisibility();

		try {
			if (source === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill)) {
				const session = await this.getOrCreateBuiltinEditingSession(uri);

				if (!isEqual(this.currentEditingUri, uri)) {
					return;
				}

				this.embeddedEditor!.setModel(session.model);
				this.embeddedEditor!.updateOptions({ readOnly: false });
				this._editorContentChanged = session.model.getValue() !== session.originalContent;
				this.renderCurrentEditorPreview();
				this.updateEditorActionButton();

				if (this.dimension) {
					this.layout(this.dimension);
				}
				if (this.editorDisplayMode === 'raw') {
					this.embeddedEditor!.focus();
				} else {
					this.editorModeButton?.focus();
				}

				this.editorModelChangeDisposables.add(session.model.onDidChangeContent(() => {
					this._editorContentChanged = session.model.getValue() !== session.originalContent;
					this.scheduleCurrentEditorPreviewRender();
					this.updateEditorActionButton();
				}));
				return;
			}

			const ref = await this.textModelService.createModelReference(uri);

			if (!isEqual(this.currentEditingUri, uri)) {
				ref.dispose();
				return; // another item was selected while loading
			}

			this.currentModelRef = ref;
			this.embeddedEditor!.setModel(ref.object.textEditorModel);
			this.embeddedEditor!.updateOptions({ readOnly: isReadOnly });
			this.renderCurrentEditorPreview();

			if (this.dimension) {
				this.layout(this.dimension);
			}
			if (this.editorDisplayMode === 'raw') {
				this.embeddedEditor!.focus();
			} else {
				this.editorModeButton?.focus();
			}

			this._editorContentChanged = this.workingCopyService.isDirty(uri);
			this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
				this._editorContentChanged = true;
				this.scheduleCurrentEditorPreviewRender();
				this.resetEditorSaveIndicator();
			}));
			this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave(e => {
				if (isEqual(e.workingCopy.resource, uri)) {
					this._editorContentChanged = this.workingCopyService.isDirty(uri);
					this.editorSaveIndicator.className = 'editor-save-indicator visible saved';
					this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
					this.editorSaveIndicator.title = localize('saved', "Saved");
					this.editorSaveIndicator.setAttribute('aria-label', localize('saved', "Saved"));
					status(localize('saved', "Saved"));
				}
			}));
		} catch (error) {
			console.error('Failed to load model for embedded editor:', error);
			if (isEqual(this.currentEditingUri, uri)) {
				this.goBackToList();
			}
		}
	}

	private goBackToList(): void {
		const returnViewMode = this.editorReturnViewMode;
		this.editorReturnViewMode = 'list';
		const fileUri = this.currentEditingUri;
		const backgroundSaveRequest = this.createExistingCustomizationSaveRequest();
		if (backgroundSaveRequest) {
			this.telemetryService.publicLog2<CustomizationEditorSaveItemEvent, CustomizationEditorSaveItemClassification>('chatCustomizationEditor.saveItem', {
				promptType: this.currentEditingPromptType ?? '',
				storage: String(this.currentEditingSource ?? ''),
				saveTarget: 'existing',
			});
		}
		if (fileUri && this.currentEditingSource === AICustomizationSources.builtin) {
			this.disposeBuiltinEditingSession(fileUri);
		}

		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.currentEditingUri = undefined;
		this.currentEditingProjectRoot = undefined;
		this.currentEditingSource = undefined;
		this.currentEditingPromptType = undefined;
		this.currentEditingReadOnly = false;
		this.editorDisplayMode = 'preview';
		this._editorContentChanged = false;
		this.editorModelChangeDisposables.clear();
		this.editorPreviewRenderScheduler.cancel();
		this.clearEditorPreview();
		this.resetEditorSaveIndicator();
		this.updateEditorActionButton();
		this.updateEditorDisplayMode();
		this.embeddedEditor?.setModel(null);
		this.viewMode = returnViewMode;
		this.updateContentVisibility();

		if (returnViewMode === 'migration') {
			this.renderPromptMigrationPage();
			void this.refreshPromptMigrationInfo();
		} else {
			// Refresh the list to pick up newly created/edited files
			void this.listWidget?.refresh();
		}

		if (this.dimension) {
			this.layout(this.dimension);
		}
		if (returnViewMode === 'migration') {
			this.migrationSearchInput?.focus();
		} else {
			this.listWidget?.focusSearch();
		}

		if (backgroundSaveRequest) {
			const saveRequest = backgroundSaveRequest;
			void this.saveExistingCustomization(saveRequest).catch(error => {
				console.error('Failed to save customization changes on exit:', error);
				this.notificationService.warn(localize('saveCustomizationOnExitFailed', "Could not save changes to {0}.", basename(saveRequest.fileUri)));
			});
		}
	}

	//#endregion

	private async getOrCreateBuiltinEditingSession(uri: URI): Promise<{ model: ITextModel; originalContent: string }> {
		const key = uri.toString();
		const existing = this.builtinEditingSessions.get(key);
		if (existing && !existing.model.isDisposed()) {
			return existing;
		}

		const ref = await this.textModelService.createModelReference(uri);
		try {
			const session = {
				model: this.modelService.createModel(
					createTextBufferFactoryFromSnapshot(ref.object.textEditorModel.createSnapshot()),
					{ languageId: ref.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
					URI.from({ scheme: 'ai-customization-builtin', path: uri.path, query: generateUuid() }),
					false
				),
				originalContent: ref.object.textEditorModel.getValue(),
			};
			this.builtinEditingSessions.set(key, session);
			return session;
		} finally {
			ref.dispose();
		}
	}

	private createBuiltinPromptSaveRequest(target: ISaveTargetQuickPickItem): IBuiltinPromptSaveRequest | undefined {
		const sourceUri = this.currentEditingUri;
		const promptType = this.currentEditingPromptType;
		if (!sourceUri || this.currentEditingSource !== AICustomizationSources.builtin || (promptType !== PromptsType.prompt && promptType !== PromptsType.skill) || !target.folder || target.target === 'cancel') {
			return;
		}

		const session = this.builtinEditingSessions.get(sourceUri.toString());
		if (!session || !this._editorContentChanged) {
			return;
		}

		return {
			target: target.target,
			folder: target.folder,
			sourceUri,
			content: session.model.getValue(),
			promptType,
			projectRoot: target.target === 'workspace' ? this.workspaceService.getActiveProjectRoot() : undefined,
		};
	}

	private createExistingCustomizationSaveRequest(): IExistingCustomizationSaveRequest | undefined {
		if (!this._editorContentChanged || this.currentEditingSource === AICustomizationSources.builtin || !this.currentEditingUri) {
			return undefined;
		}

		const model = this.currentModelRef?.object.textEditorModel;
		if (!model) {
			return undefined;
		}

		return {
			fileUri: this.currentEditingUri,
			content: model.getValue(),
			projectRoot: this.currentEditingProjectRoot,
		};
	}

	private async saveBuiltinPromptCopy(request: IBuiltinPromptSaveRequest): Promise<void> {
		let targetUri: URI;
		if (request.promptType === PromptsType.skill) {
			// Skills use {skillName}/SKILL.md directory structure
			const skillFolderName = basename(dirname(request.sourceUri));
			targetUri = URI.joinPath(request.folder, skillFolderName, basename(request.sourceUri));
		} else {
			targetUri = URI.joinPath(request.folder, basename(request.sourceUri));
		}
		await this.fileService.createFolder(dirname(targetUri));
		await this.fileService.writeFile(targetUri, VSBuffer.fromString(request.content));
		if (request.target === 'workspace' && request.projectRoot) {
			await this.workspaceService.commitFiles(request.projectRoot, [targetUri]);
		}
	}

	private async saveExistingCustomization(request: IExistingCustomizationSaveRequest): Promise<void> {
		await this.fileService.writeFile(request.fileUri, VSBuffer.fromString(request.content));
		if (request.projectRoot) {
			await this.workspaceService.commitFiles(request.projectRoot, [request.fileUri]);
		}
	}

	private async pickBuiltinPromptSaveTarget(): Promise<ISaveTargetQuickPickItem | undefined> {
		const items: ISaveTargetQuickPickItem[] = [];
		const promptType = this.currentEditingPromptType ?? PromptsType.prompt;

		const workspaceFolder = resolveWorkspaceTargetDirectory(this.workspaceService, promptType);
		if (workspaceFolder) {
			items.push({
				label: localize('workspaceSaveTarget', "Workspace"),
				description: this.labelService.getUriLabel(workspaceFolder, { relative: true }),
				target: 'workspace',
				folder: workspaceFolder,
			});
		}

		const userFolder = await resolveUserTargetDirectory(this.promptsService, promptType);
		if (userFolder) {
			items.push({
				label: localize('userSaveTarget', "User"),
				description: this.labelService.getUriLabel(userFolder, { relative: true }),
				target: 'user',
				folder: userFolder,
			});
		}

		items.push({
			label: localize('cancelSaveTarget', "Cancel"),
			target: 'cancel',
		});

		return this.quickInputService.pick(items, {
			canPickMany: false,
			placeHolder: localize('saveBuiltinCopyPlaceholder', "Select Workspace, User, or Cancel"),
			matchOnDescription: true,
		});
	}

	private async handleEditorActionButton(): Promise<void> {
		if (this.editorActionButtonInProgress) {
			return;
		}

		this.editorActionButtonInProgress = true;
		this.updateEditorActionButton();

		let backgroundSaveRequest: IBuiltinPromptSaveRequest | undefined;
		try {
			if (this.shouldShowBuiltinSaveAction()) {
				const selection = await this.pickBuiltinPromptSaveTarget();
				if (!selection || selection.target === 'cancel') {
					return;
				}

				backgroundSaveRequest = this.createBuiltinPromptSaveRequest(selection);
				if (backgroundSaveRequest) {
					this.telemetryService.publicLog2<CustomizationEditorSaveItemEvent, CustomizationEditorSaveItemClassification>('chatCustomizationEditor.saveItem', {
						promptType: this.currentEditingPromptType ?? '',
						storage: String(this.currentEditingSource ?? ''),
						saveTarget: selection.target,
					});
				}
			}

			this.goBackToList();
			if (backgroundSaveRequest) {
				const saveRequest = backgroundSaveRequest;
				void this.saveBuiltinPromptCopy(saveRequest).then(() => {
					void this.listWidget?.refresh();
				}, error => {
					console.error('Failed to save built-in override:', error);
					this.notificationService.warn(saveRequest.target === 'workspace'
						? localize('saveBuiltinCopyFailedWorkspace', "Could not save the override to the workspace.")
						: localize('saveBuiltinCopyFailedUser', "Could not save the override to your user folder."));
				});
			}
		} finally {
			this.editorActionButtonInProgress = false;
			this.updateEditorActionButton();
		}
	}

	private updateEditorActionButton(): void {
		this.updateInputDirtyState();

		if (!this.editorActionButton || !this.editorActionButtonIcon) {
			return;
		}

		const shouldShowBuiltinSaveAction = this.shouldShowBuiltinSaveAction();
		this.editorActionButtonIcon.className = `codicon codicon-${shouldShowBuiltinSaveAction ? Codicon.save.id : Codicon.arrowLeft.id} editor-action-button-icon`;
		this.editorActionButton.disabled = this.editorActionButtonInProgress;
		this.editorActionButton.setAttribute('aria-label', shouldShowBuiltinSaveAction
			? localize('saveBuiltinCopyAndChooseLocation', "Save override")
			: this.editorReturnViewMode === 'migration'
				? localize('backToPromptMigration', "Back to Migrate Prompt Files")
				: localize('backToList', "Back to list"));
		this.editorActionButton.title = shouldShowBuiltinSaveAction
			? localize('saveBuiltinCopyAndChooseLocationTooltip', "Save override (choose Workspace, User, or Cancel)")
			: this.editorReturnViewMode === 'migration'
				? localize('backToPromptMigrationTooltip', "Back to Migrate Prompt Files")
				: localize('backToList', "Back to list");
	}

	private shouldShowBuiltinSaveAction(): boolean {
		return this._editorContentChanged
			&& this.currentEditingSource === AICustomizationSources.builtin
			&& (this.currentEditingPromptType === PromptsType.prompt || this.currentEditingPromptType === PromptsType.skill);
	}

	private updateInputDirtyState(): void {
		const input = this.input;
		if (input instanceof AICustomizationManagementEditorInput) {
			input.setDirty(this.shouldShowBuiltinSaveAction());
		}
	}

	private async handleBuiltinSave(): Promise<boolean> {
		if (!this.shouldShowBuiltinSaveAction()) {
			return false;
		}

		const target = await this.pickBuiltinPromptSaveTarget();
		if (!target || target.target === 'cancel') {
			return false;
		}

		const saveRequest = this.createBuiltinPromptSaveRequest(target);
		if (!saveRequest) {
			return false;
		}

		try {
			await this.saveBuiltinPromptCopy(saveRequest);
			this.telemetryService.publicLog2<CustomizationEditorSaveItemEvent, CustomizationEditorSaveItemClassification>('chatCustomizationEditor.saveItem', {
				promptType: this.currentEditingPromptType ?? '',
				storage: String(this.currentEditingSource ?? ''),
				saveTarget: target.target,
			});

			this._editorContentChanged = false;
			this.updateEditorActionButton();

			return true;
		} catch (error) {
			console.error('Failed to save built-in override:', error);
			this.notificationService.warn(target.target === 'workspace'
				? localize('saveBuiltinCopyFailedWorkspace', "Could not save the override to the workspace.")
				: localize('saveBuiltinCopyFailedUser', "Could not save the override to your user folder."));
			return false;
		}
	}

	private resetEditorSaveIndicator(): void {
		this.editorSaveIndicator.className = 'editor-save-indicator';
		this.editorSaveIndicator.title = '';
		this.editorSaveIndicator.removeAttribute('aria-label');
	}

	private isStructuredPreviewSupported(promptType: PromptsType | undefined): boolean {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled) !== true) {
			return false;
		}
		return promptType === PromptsType.agent
			|| promptType === PromptsType.skill
			|| promptType === PromptsType.instructions
			|| promptType === PromptsType.prompt;
	}

	private onStructuredPreviewSettingChanged(): void {
		if (this.viewMode !== 'editor') {
			return;
		}
		const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
		if (!supportsStructuredPreview) {
			this.editorDisplayMode = 'raw';
			this.editorPreviewRenderScheduler.cancel();
			this.clearEditorPreview();
		} else if (this.editorDisplayMode === 'preview') {
			this.editorPreviewRenderScheduler.schedule();
		}
		this.updateEditorDisplayMode();
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private getCurrentEditingModel(): ITextModel | undefined {
		if (!this.currentEditingUri) {
			return undefined;
		}

		if (this.currentEditingSource === AICustomizationSources.builtin) {
			return this.builtinEditingSessions.get(this.currentEditingUri.toString())?.model;
		}

		return this.currentModelRef?.object.textEditorModel;
	}

	private toggleEditorDisplayMode(): void {
		if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
			return;
		}

		this.editorDisplayMode = this.editorDisplayMode === 'preview' ? 'raw' : 'preview';
		if (this.editorDisplayMode === 'preview') {
			this.editorPreviewRenderScheduler.cancel();
			this.renderCurrentEditorPreview();
		}

		this.updateEditorDisplayMode();
		if (this.dimension) {
			this.layout(this.dimension);
		}

		if (this.editorDisplayMode === 'raw') {
			this.embeddedEditor?.focus();
		} else {
			this.editorModeButton?.focus();
		}
	}

	private updateEditorDisplayMode(): void {
		const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
		const showPreview = supportsStructuredPreview && this.editorDisplayMode === 'preview';

		if (this.editorModeButton) {
			this.editorModeButton.style.display = supportsStructuredPreview ? '' : 'none';
			this.editorModeButton.textContent = this.getEditorModeButtonLabel();
			this.editorModeButton.setAttribute('aria-label', this.getEditorModeButtonTooltip());
			this.editorModeButton.setAttribute('aria-pressed', String(this.editorDisplayMode === 'raw'));
			this.editorModeButton.title = this.getEditorModeButtonTooltip();
		}

		if (this.editorPreviewContainer) {
			this.editorPreviewContainer.style.display = showPreview ? '' : 'none';
		}

		if (this.embeddedEditorContainer) {
			this.embeddedEditorContainer.style.display = showPreview ? 'none' : '';
		}
	}

	private getEditorModeButtonLabel(): string {
		if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
			return '';
		}

		if (this.editorDisplayMode === 'raw') {
			return localize('editorPreviewButtonLabel', "Preview");
		}

		return this.canEditCurrentRaw()
			? localize('editorEditRawButtonLabel', "Edit")
			: localize('editorViewRawButtonLabel', "View Raw");
	}

	private getEditorModeButtonTooltip(): string {
		if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
			return '';
		}

		if (this.editorDisplayMode === 'raw') {
			return localize('editorPreviewButtonTooltip', "Show structured preview");
		}

		return this.canEditCurrentRaw()
			? localize('editorEditRawButtonTooltip', "Edit the raw markdown file")
			: localize('editorViewRawButtonTooltip', "Show the raw markdown file");
	}

	private canEditCurrentRaw(): boolean {
		const promptType = this.currentEditingPromptType;
		if (!promptType) {
			return false;
		}

		return (this.currentEditingSource === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill))
			|| !this.currentEditingReadOnly;
	}

	private scheduleCurrentEditorPreviewRender(): void {
		if (this.editorDisplayMode !== 'preview') {
			return;
		}

		this.editorPreviewRenderScheduler.schedule();
	}

	private renderCurrentEditorPreview(): void {
		const model = this.getCurrentEditingModel();
		const promptType = this.currentEditingPromptType;
		if (!model || !promptType || this.editorDisplayMode !== 'preview' || !this.isStructuredPreviewSupported(promptType)) {
			this.clearEditorPreview();
			return;
		}

		const parsedPromptFile = this.promptsService.getParsedPromptFile(model);
		this.renderEditorPreview(parsedPromptFile, promptType);
	}

	private renderEditorPreview(parsedPromptFile: ParsedPromptFile, promptType: PromptsType): void {
		if (!this.editorPreviewIssuesContainer || !this.editorPreviewFrontMatterContainer || !this.editorPreviewBodyContainer) {
			return;
		}

		this.editorPreviewDisposables.clear();
		DOM.clearNode(this.editorPreviewIssuesContainer);
		DOM.clearNode(this.editorPreviewFrontMatterContainer);
		DOM.clearNode(this.editorPreviewBodyContainer);

		const target = getTarget(promptType, parsedPromptFile.header ?? parsedPromptFile.uri);
		this.renderPreviewIssues(parsedPromptFile);
		this.renderPreviewFrontMatter(parsedPromptFile, promptType, target);
		this.renderPreviewBody(parsedPromptFile);
	}

	private renderPreviewIssues(parsedPromptFile: ParsedPromptFile): void {
		if (!this.editorPreviewIssuesContainer || !parsedPromptFile.header?.errors.length) {
			return;
		}

		const issuesContainer = DOM.append(this.editorPreviewIssuesContainer, $('.editor-preview-issues-box'));
		DOM.append(issuesContainer, $('div.editor-preview-issues-title')).textContent = localize('previewHeaderIssuesTitle', "Header issues detected");
		DOM.append(issuesContainer, $('div.editor-preview-issues-description')).textContent = localize('previewHeaderIssuesDescription', "Switch to raw view to fix invalid or unsupported metadata entries.");
		const list = DOM.append(issuesContainer, $('ul.editor-preview-issues-list'));
		for (const error of parsedPromptFile.header.errors) {
			DOM.append(list, $('li.editor-preview-issues-item')).textContent = error.message;
		}
	}

	private renderPreviewFrontMatter(parsedPromptFile: ParsedPromptFile, promptType: PromptsType, target: Target): void {
		if (!this.editorPreviewFrontMatterContainer) {
			return;
		}

		const attributes = parsedPromptFile.header?.attributes ?? [];
		if (!attributes.length) {
			DOM.append(this.editorPreviewFrontMatterContainer, $('div.editor-preview-empty-state')).textContent = localize('previewNoFrontMatter', "No metadata found in this file.");
			return;
		}

		for (const attribute of attributes) {
			this.renderPreviewAttribute(attribute, promptType, target);
		}
	}

	private renderPreviewAttribute(attribute: IHeaderAttribute, promptType: PromptsType, target: Target): void {
		if (!this.editorPreviewFrontMatterContainer) {
			return;
		}

		const row = DOM.append(this.editorPreviewFrontMatterContainer, $('.editor-preview-row'));
		const header = DOM.append(row, $('.editor-preview-row-header'));
		DOM.append(header, $('div.editor-preview-row-key')).textContent = attribute.key;

		const helpButton = DOM.append(header, $('button.editor-preview-row-help')) as HTMLButtonElement;
		helpButton.type = 'button';
		helpButton.setAttribute('aria-label', localize('previewFieldHelpAriaLabel', "Show help for '{0}'", attribute.key));
		const helpIcon = DOM.append(helpButton, $('span.editor-preview-row-help-icon'));
		helpIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
		helpIcon.setAttribute('aria-hidden', 'true');

		const description = getAttributeDefinition(attribute.key, promptType, target)?.description ?? localize('previewUnknownFieldDescription', "Custom metadata field `{0}`.", attribute.key);
		const helpHover = this.editorPreviewDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), helpButton, {
			markdown: new MarkdownString(description),
			markdownNotSupportedFallback: description,
		}));
		this.editorPreviewDisposables.add(DOM.addDisposableListener(helpButton, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			helpHover.show(true);
		}));

		const valueElement = DOM.append(row, $('div.editor-preview-row-value'));
		const valueText = this.stringifyPreviewValue(attribute.value);
		valueElement.textContent = valueText;
		valueElement.classList.toggle('multiline', valueText.includes('\n'));
	}

	private renderPreviewBody(parsedPromptFile: ParsedPromptFile): void {
		if (!this.editorPreviewBodyContainer) {
			return;
		}

		const bodyContent = parsedPromptFile.body?.getContent() ?? '';
		if (!bodyContent.trim()) {
			DOM.append(this.editorPreviewBodyContainer, $('div.editor-preview-empty-state')).textContent = localize('previewNoBody', "No markdown body found in this file.");
			return;
		}

		const markdown = new MarkdownString(bodyContent, { supportThemeIcons: true });
		markdown.baseUri = parsedPromptFile.uri;
		const renderedMarkdown = this.editorPreviewDisposables.add(this.markdownRendererService.render(markdown));
		this.editorPreviewBodyContainer.appendChild(renderedMarkdown.element);
	}

	private stringifyPreviewValue(value: IValue): string {
		switch (value.type) {
			case 'scalar':
				return value.value;
			case 'sequence':
				if (value.items.every(item => item.type === 'scalar')) {
					return value.items.map(item => item.value).join('\n');
				}
				return JSON.stringify(this.toPreviewObject(value), null, 2);
			case 'map':
				return JSON.stringify(this.toPreviewObject(value), null, 2);
		}
	}

	private toPreviewObject(value: IValue): unknown {
		switch (value.type) {
			case 'scalar':
				return value.value;
			case 'sequence':
				return value.items.map(item => this.toPreviewObject(item));
			case 'map': {
				const entries: Record<string, unknown> = {};
				for (const property of value.properties) {
					entries[property.key.value] = this.toPreviewObject(property.value);
				}
				return entries;
			}
		}
	}

	private clearEditorPreview(): void {
		this.editorPreviewRenderScheduler.cancel();
		this.editorPreviewDisposables.clear();
		if (this.editorPreviewIssuesContainer) {
			DOM.clearNode(this.editorPreviewIssuesContainer);
		}
		if (this.editorPreviewFrontMatterContainer) {
			DOM.clearNode(this.editorPreviewFrontMatterContainer);
		}
		if (this.editorPreviewBodyContainer) {
			DOM.clearNode(this.editorPreviewBodyContainer);
		}
	}

	private disposeBuiltinEditingSessions(): void {
		for (const session of this.builtinEditingSessions.values()) {
			session.model.dispose();
		}
		this.builtinEditingSessions.clear();
	}

	private disposeBuiltinEditingSession(uri: URI): void {
		const key = uri.toString();
		const session = this.builtinEditingSessions.get(key);
		if (!session) {
			return;
		}

		session.model.dispose();
		this.builtinEditingSessions.delete(key);
	}

	//#region Embedded MCP Server Detail

	private createEmbeddedMcpDetail(): void {
		if (!this.mcpDetailContainer) {
			return;
		}

		// Container for the compact MCP detail component
		const detailBody = DOM.append(this.mcpDetailContainer, $('.mcp-detail-editor-container'));

		this.embeddedMcpDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedMcpServerDetail, detailBody));

		// Back button rendered into the detail's leading slot
		const backButton = DOM.append(this.embeddedMcpDetail.leadingSlot, $('button.editor-back-button'));
		backButton.setAttribute('type', 'button');
		backButton.setAttribute('aria-label', localize('backToMcpList', "Back to MCP servers"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), backButton, localize('backToMcpListTooltip', "Back to MCP servers")));
		const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIconEl.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackFromMcpDetail();
		}));
	}

	private async showEmbeddedMcpDetail(server: IWorkbenchMcpServer): Promise<void> {
		if (!this.embeddedMcpDetail) {
			return;
		}

		this.viewMode = 'mcpDetail';
		this.updateContentVisibility();

		this.mcpDetailDisposables.clear();
		this.embeddedMcpDetail.setInput(server);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private goBackFromMcpDetail(): void {
		this.mcpDetailDisposables.clear();
		this.embeddedMcpDetail?.clearInput();
		this.viewMode = 'list';
		this.updateContentVisibility();

		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.mcpListWidget?.focusSearch();
	}

	//#endregion

	//#region Embedded Plugin Detail

	private createEmbeddedPluginDetail(): void {
		if (!this.pluginDetailContainer) {
			return;
		}

		// Container for the compact plugin detail component
		const detailBody = DOM.append(this.pluginDetailContainer, $('.plugin-detail-editor-container'));

		this.embeddedPluginDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedAgentPluginDetail, detailBody));

		// Back button rendered into the detail's leading slot
		const backButton = DOM.append(this.embeddedPluginDetail.leadingSlot, $('button.editor-back-button'));
		backButton.setAttribute('type', 'button');
		backButton.setAttribute('aria-label', localize('backToPluginList', "Back to plugins"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), backButton, localize('backToPluginListTooltip', "Back to plugins")));
		const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIconEl.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackFromPluginDetail();
		}));
	}

	private async showEmbeddedPluginDetail(item: IAgentPluginItem): Promise<void> {
		if (!this.embeddedPluginDetail) {
			return;
		}

		this.viewMode = 'pluginDetail';
		this.updateContentVisibility();

		this.pluginDetailDisposables.clear();
		this.embeddedPluginDetail.setInput(item);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	/**
	 * Public method to show a plugin detail from any section (e.g. from "Show Plugin" context menu).
	 * Saves the current section so the back button returns the user to it.
	 */
	public async showPluginDetail(item: IAgentPluginItem): Promise<void> {
		if (this.selectedSection !== AICustomizationManagementSection.Plugins) {
			this.pluginDetailReturnSection = this.selectedSection ?? AICustomizationManagementSection.Agents;
		}
		await this.showEmbeddedPluginDetail(item);
	}

	private goBackFromPluginDetail(): void {
		this.pluginDetailDisposables.clear();
		this.embeddedPluginDetail?.clearInput();

		const returnSection = this.pluginDetailReturnSection;
		this.pluginDetailReturnSection = undefined;

		if (returnSection) {
			// Return to the section the user was on before opening the plugin detail.
			// selectSection may early-return when the section hasn't changed, so always
			// ensure viewMode and content visibility are updated.
			this.viewMode = 'list';
			this.updateContentVisibility();
			this.selectSection(returnSection);
		} else {
			this.viewMode = 'list';
			this.updateContentVisibility();
			this.pluginListWidget?.focusSearch();
		}

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	//#endregion

	//#region Embedded Tool Extension Detail

	private createEmbeddedToolDetail(): void {
		if (!this.toolsDetailContainer) {
			return;
		}

		// Container for the compact tool extension detail component
		const detailBody = DOM.append(this.toolsDetailContainer, $('.tools-detail-editor-container'));

		this.embeddedToolDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedExtensionToolsDetail, detailBody));

		// Back button rendered into the detail's leading slot
		const backButton = DOM.append(this.embeddedToolDetail.leadingSlot, $('button.editor-back-button'));
		backButton.setAttribute('type', 'button');
		backButton.setAttribute('aria-label', localize('backToToolsList', "Back to tools"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), backButton, localize('backToToolsListTooltip', "Back to tools")));
		const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIconEl.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackFromToolDetail();
		}));
	}

	private async showEmbeddedToolDetail(extension: IExtension): Promise<void> {
		if (!this.embeddedToolDetail) {
			return;
		}

		this.viewMode = 'toolsDetail';
		this.updateContentVisibility();

		this.toolsDetailDisposables.clear();
		this.embeddedToolDetail.setInput(extension);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private goBackFromToolDetail(): void {
		this.toolsDetailDisposables.clear();
		this.embeddedToolDetail?.clearInput();
		this.viewMode = 'list';
		this.updateContentVisibility();

		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.toolsListWidget?.focusSearch();
	}

	//#endregion
}
