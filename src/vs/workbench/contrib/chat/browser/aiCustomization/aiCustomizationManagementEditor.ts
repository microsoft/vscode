/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { localize } from '../../../../../nls.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
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
import { basename, dirname, isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import { AICustomizationListWidget } from './aiCustomizationListWidget.js';
import { McpListWidget } from './mcpListWidget.js';
import { PluginListWidget } from './pluginListWidget.js';
import {
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
	AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY,
	AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY,
	AICustomizationManagementSection,
	AICustomizationPromptsStorage,
	BUILTIN_STORAGE,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_MAX_WIDTH,
	CONTENT_MIN_WIDTH,
} from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, pluginIcon } from './aiCustomizationIcons.js';
import { ChatModelsWidget } from '../chatManagement/chatModelsWidget.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { AGENT_MD_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';
import { INewPromptOptions, NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from '../promptSyntax/newPromptFileActions.js';
import { showConfigureHooksQuickPick } from '../promptSyntax/hookActions.js';
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory } from './customizationCreatorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { Action } from '../../../../../base/common/actions.js';
import { McpServerEditorInput } from '../../../mcp/browser/mcpServerEditorInput.js';
import { McpServerEditor } from '../../../mcp/browser/mcpServerEditor.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';
import { AgentPluginEditor } from '../agentPluginEditor/agentPluginEditor.js';
import { AgentPluginEditorInput } from '../agentPluginEditor/agentPluginEditorInput.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { ICustomizationHarnessService, CustomizationHarness, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { AICustomizationWelcomePage } from './aiCustomizationWelcomePage.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

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

export const aiCustomizationManagementSashBorder = registerColor(
	'aiCustomizationManagement.sashBorder',
	PANEL_BORDER,
	localize('aiCustomizationManagementSashBorder', "The color of the Agent Customizations editor splitview sash border.")
);

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
	private sectionsList!: WorkbenchList<ISectionItem>;
	private contentContainer!: HTMLElement;
	private listWidget!: AICustomizationListWidget;
	private mcpListWidget: McpListWidget | undefined;
	private pluginListWidget: PluginListWidget | undefined;
	private modelsWidget: ChatModelsWidget | undefined;
	private promptsContentContainer!: HTMLElement;
	private mcpContentContainer: HTMLElement | undefined;
	private pluginContentContainer: HTMLElement | undefined;
	private modelsContentContainer: HTMLElement | undefined;
	private modelsFooterElement: HTMLElement | undefined;

	// Embedded editor state
	private editorContentContainer: HTMLElement | undefined;
	private embeddedEditor: CodeEditorWidget | undefined;
	private editorActionButton!: HTMLButtonElement;
	private editorActionButtonIcon!: HTMLElement;
	private editorActionButtonInProgress = false;
	private editorItemNameElement!: HTMLElement;
	private editorItemPathElement!: HTMLElement;
	private editorSaveIndicator!: HTMLElement;
	private readonly editorModelChangeDisposables = this._register(new DisposableStore());
	private readonly builtinEditingSessions = new Map<string, { model: ITextModel; originalContent: string }>();
	private currentEditingUri: URI | undefined;
	private currentEditingProjectRoot: URI | undefined;
	private currentEditingStorage: AICustomizationPromptsStorage | undefined;
	private currentEditingPromptType: PromptsType | undefined;
	private currentModelRef: IReference<IResolvedTextEditorModel> | undefined;
	private viewMode: 'list' | 'editor' | 'mcpDetail' | 'pluginDetail' = 'list';

	// Embedded MCP server detail view
	private mcpDetailContainer: HTMLElement | undefined;
	private embeddedMcpEditor: McpServerEditor | undefined;
	private readonly mcpDetailDisposables = this._register(new DisposableStore());

	// Embedded plugin detail view
	private pluginDetailContainer: HTMLElement | undefined;
	private embeddedPluginEditor: AgentPluginEditor | undefined;
	private readonly pluginDetailDisposables = this._register(new DisposableStore());
	/** Section to restore when navigating back from plugin detail (when opened from a non-plugin section). */
	private pluginDetailReturnSection: AICustomizationManagementSection | undefined;

	private dimension: DOM.Dimension | undefined;
	private readonly sections: ISectionItem[] = [];
	private readonly allSections: ISectionItem[] = [];
	private selectedSection: AICustomizationManagementSection | undefined;

	// Welcome page
	private welcomePage: AICustomizationWelcomePage | undefined;

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly promptsSectionCountScheduler = this._register(new RunOnceScheduler(() => this._doRefreshAllPromptsSectionCounts(), 100));
	private _editorContentChanged = false;
	private _previousActiveHarnessId: string | undefined;

	// Harness dropdown
	private harnessDropdownContainer: HTMLElement | undefined;
	private harnessDropdownButton: HTMLElement | undefined;
	private harnessDropdownIcon: HTMLElement | undefined;
	private harnessDropdownLabel: HTMLElement | undefined;
	private sidebarHeaderContainer: HTMLElement | undefined;
	private homeButton: HTMLElement | undefined;
	private homeButtonLabel: HTMLElement | undefined;

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
		@IModelService private readonly modelService: IModelService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);

		this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
		this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);
		this.harnessContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS.bindTo(contextKeyService);

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
			[AICustomizationManagementSection.McpServers]: { label: localize('mcpServers', "MCP Servers"), icon: Codicon.server, description: localize('mcpServersDesc', "Connect external tool servers that extend AI capabilities with custom tools and data sources.") },
			[AICustomizationManagementSection.Plugins]: { label: localize('plugins', "Plugins"), icon: pluginIcon, description: localize('pluginsDesc', "Install and manage agent plugins that add additional tools, skills, and integrations.") },
			[AICustomizationManagementSection.Models]: { label: localize('models', "Models"), icon: Codicon.vm, description: localize('modelsDesc', "Configure and manage language models available for use.") },
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
					this.sectionsList.layout(height - 8, width);
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
					const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
					this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
					if (this.viewMode === 'editor' && this.embeddedEditor) {
						const editorHeaderHeight = 50;
						const padding = 24;
						this.embeddedEditor.layout({ width: Math.max(0, width - padding), height: Math.max(0, height - editorHeaderHeight - padding) });
					}
					if (this.viewMode === 'mcpDetail' && this.embeddedMcpEditor) {
						const backHeaderHeight = 40;
						this.embeddedMcpEditor.layout(new DOM.Dimension(width, Math.max(0, height - backHeaderHeight)));
					}
					if (this.viewMode === 'pluginDetail' && this.embeddedPluginEditor) {
						const backHeaderHeight = 40;
						this.embeddedPluginEditor.layout(new DOM.Dimension(width, Math.max(0, height - backHeaderHeight)));
					}
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

	/**
	 * Whether the harness selector UI is enabled.
	 * When disabled, the editor behaves as if "Local" is always selected.
	 */
	private get isHarnessSelectorEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationHarnessSelectorEnabled) !== false;
	}

	/**
	 * Rebuilds the visible sections list based on the active harness's
	 * `hiddenSections`. If the current selection falls into a hidden
	 * section, the first visible section is selected instead.
	 */
	private rebuildVisibleSections(): void {
		let hidden: Set<string>;
		if (this.isHarnessSelectorEnabled) {
			const activeId = this.harnessService.activeHarness.get();
			const descriptor = this.harnessService.availableHarnesses.get().find(h => h.id === activeId);
			hidden = new Set(descriptor?.hiddenSections ?? []);
		} else {
			hidden = new Set(); // Local harness has no hidden sections
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

		// Header row with home button and optional harness dropdown
		this.createSidebarHeader(sidebarContent);

		// Main sections list container (takes remaining space)
		const sectionsListContainer = DOM.append(sidebarContent, $('.sidebar-sections-list'));

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
					getAriaLabel: (item: ISectionItem) => item.label,
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
			const available = this.harnessService.availableHarnesses.read(reader);
			const activeId = this.harnessService.activeHarness.read(reader);

			// If the active harness is no longer available, fall back to the default
			if (!available.some(h => h.id === activeId) && available.length > 0) {
				this.harnessService.setActiveHarness(available[0].id);
				return; // setActiveHarness will trigger another autorun cycle
			}

			this.harnessContextKey.set(activeId);
			this.rebuildVisibleSections();
			this.ensureHarnessDropdown();
			this.updateHarnessDropdown();
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
			this.refreshAllPromptsSectionCounts();
		}));

		// When the harness selector setting is off, lock to Local harness.
		// In Sessions (single CLI harness) the dropdown is already hidden and
		// setActiveHarness(VSCode) is a safe no-op since the CLI harness
		// remains active — filtering stays correct for that window.
		if (!this.isHarnessSelectorEnabled) {
			this.harnessService.setActiveHarness(CustomizationHarness.VSCode);
		}
		this.editorDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationHarnessSelectorEnabled)) {
				if (!this.isHarnessSelectorEnabled) {
					this.harnessService.setActiveHarness(CustomizationHarness.VSCode);
				}
			}
		}));

	}

	private createSidebarHeader(sidebarContent: HTMLElement): void {
		const headerRow = this.sidebarHeaderContainer = DOM.append(sidebarContent, $('.sidebar-header-row'));

		// Home/overview button
		const homeButton = this.homeButton = DOM.append(headerRow, $('button.sidebar-home-button'));
		homeButton.setAttribute('aria-label', localize('homeButton', "Overview"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), homeButton, localize('homeButtonTooltip', "Back to overview")));
		const homeIcon = DOM.append(homeButton, $('span.sidebar-home-icon'));
		homeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
		homeIcon.setAttribute('aria-hidden', 'true');
		const homeLabel = this.homeButtonLabel = DOM.append(homeButton, $('span.sidebar-home-label'));
		homeLabel.textContent = localize('overview', "Overview");
		this.editorDisposables.add(DOM.addDisposableListener(homeButton, 'click', () => {
			this.showWelcomePage();
		}));

		// Harness dropdown (shown when multiple harnesses available)
		this.createHarnessDropdown(headerRow);
		this.updateHomeButtonStyle();
	}

	private createHarnessDropdown(parent: HTMLElement): void {
		if (!this.isHarnessSelectorEnabled) {
			return;
		}

		const container = this.harnessDropdownContainer = DOM.append(parent, $('.sidebar-harness-dropdown'));

		this.harnessDropdownButton = DOM.append(container, $('button.harness-dropdown-button'));
		this.harnessDropdownButton.setAttribute('aria-label', localize('selectHarness', "Select customization target"));
		this.harnessDropdownButton.setAttribute('aria-haspopup', 'listbox');
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.harnessDropdownButton, () => {
			const descriptor = this.harnessService.availableHarnesses.get().find(h => h.id === this.harnessService.activeHarness.get());
			return descriptor?.label ?? '';
		}));

		this.harnessDropdownIcon = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-icon'));
		this.harnessDropdownLabel = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-label'));
		DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-chevron.codicon.codicon-chevron-down'));

		this.updateHarnessDropdown();

		this.editorDisposables.add(DOM.addDisposableListener(this.harnessDropdownButton, 'click', () => {
			this.showHarnessMenu();
		}));
	}

	/**
	 * Lazily creates the harness dropdown if it doesn't exist but
	 * multiple harnesses are now available, or hides it if only one
	 * harness remains (e.g. after an extension-contributed harness is
	 * unregistered).
	 */
	private ensureHarnessDropdown(): void {
		if (!this.isHarnessSelectorEnabled && this.harnessDropdownContainer) {
			// Setting is off — remove the dropdown entirely
			this.harnessDropdownContainer.remove();
			this.harnessDropdownContainer = undefined;
			this.harnessDropdownButton = undefined;
			this.harnessDropdownIcon = undefined;
			this.harnessDropdownLabel = undefined;
			this.updateHomeButtonStyle();
		} else if (this.isHarnessSelectorEnabled && !this.harnessDropdownContainer && this.sidebarHeaderContainer) {
			this.createHarnessDropdown(this.sidebarHeaderContainer);
			this.updateHomeButtonStyle();
		}
		// Visibility is handled by updateHarnessDropdown based on harness count
	}

	private updateHomeButtonStyle(): void {
		if (!this.homeButtonLabel || !this.homeButton) {
			return;
		}
		// Show full label when harness dropdown is hidden, icon-only when visible
		const harnessVisible = this.harnessDropdownContainer && this.harnessDropdownContainer.style.display !== 'none';
		this.homeButtonLabel.style.display = harnessVisible ? 'none' : '';
		this.homeButton.style.flex = harnessVisible ? '' : '1';
	}

	private updateHarnessDropdown(): void {
		if (!this.harnessDropdownContainer || !this.harnessDropdownIcon || !this.harnessDropdownLabel) {
			return;
		}
		const harnesses = this.harnessService.availableHarnesses.get();
		// Hide dropdown when only one harness is available
		this.harnessDropdownContainer.style.display = harnesses.length <= 1 ? 'none' : '';
		this.updateHomeButtonStyle();

		const activeId = this.harnessService.activeHarness.get();
		const descriptor = harnesses.find(h => h.id === activeId);
		if (descriptor) {
			this.harnessDropdownIcon.className = 'harness-dropdown-icon';
			this.harnessDropdownIcon.classList.add(...ThemeIcon.asClassNameArray(descriptor.icon));
			this.harnessDropdownLabel.textContent = descriptor.label;
		}
	}

	private showHarnessMenu(): void {
		if (!this.harnessDropdownButton) {
			return;
		}
		const harnesses = this.harnessService.availableHarnesses.get();
		const activeId = this.harnessService.activeHarness.get();

		const actions = harnesses.map(h => {
			const action = new Action(h.id, h.label, ThemeIcon.asClassName(h.icon), true, () => {
				this.harnessService.setActiveHarness(h.id);
			});
			action.checked = h.id === activeId;
			return action;
		});

		this.contextMenuService.showContextMenu({
			getAnchor: () => this.harnessDropdownButton!,
			getActions: () => actions,
			getCheckedActionsRepresentation: () => 'radio',
		});
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
		));
		this.welcomePage.rebuildCards(new Set(this.sections.map(s => s.id)));
	}

	private createBackArrowButton(): HTMLButtonElement {
		const button = $('button.section-back-arrow-button') as HTMLButtonElement;
		button.type = 'button';
		button.setAttribute('aria-label', localize('backToOverview', "Back to overview"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, localize('backToOverviewTooltip', "Back to overview")));
		const icon = DOM.append(button, $('span.section-back-arrow-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
		icon.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(button, 'click', () => {
			this.showWelcomePage();
		}));
		return button;
	}

	private injectBackArrowIntoSearchRow(widget: { prependToSearchRow(el: HTMLElement): void }): void {
		widget.prependToSearchRow(this.createBackArrowButton());
	}

	private createContent(): void {
		const contentInner = DOM.append(this.contentContainer, $('.content-inner'));

		// Welcome page (shown when no section is selected)
		this.createWelcomePage(contentInner);

		// Container for prompts-based content (Agents, Skills, Instructions, Prompts)
		this.promptsContentContainer = DOM.append(contentInner, $('.prompts-content-container'));
		this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
		this.promptsContentContainer.appendChild(this.listWidget.element);
		this.injectBackArrowIntoSearchRow(this.listWidget);

		// Handle item selection
		this.editorDisposables.add(this.listWidget.onDidSelectItem(item => {
			this.telemetryService.publicLog2<CustomizationEditorItemSelectedEvent, CustomizationEditorItemSelectedClassification>('chatCustomizationEditor.itemSelected', {
				section: this.selectedSection ?? 'welcome',
				promptType: item.promptType,
				storage: item.storage ?? 'external',
			});
			const storage = item.storage;
			const isWorkspaceFile = storage === PromptsStorage.local;
			const isReadOnly = !storage || storage === PromptsStorage.extension || storage === PromptsStorage.plugin || storage === BUILTIN_STORAGE;
			this.showEmbeddedEditor(item.uri, item.name, item.promptType, storage ?? BUILTIN_STORAGE, isWorkspaceFile, isReadOnly);
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
			modelsLink.href = 'https://code.visualstudio.com/docs/copilot/customization/language-models';
			this.editorDisposables.add(DOM.addDisposableListener(modelsLink, 'click', (e) => {
				e.preventDefault();
				this.openerService.open(URI.parse(modelsLink.href));
			}));
		}

		// Container for MCP content
		if (hasSections.has(AICustomizationManagementSection.McpServers)) {
			this.mcpContentContainer = DOM.append(contentInner, $('.mcp-content-container'));
			this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
			this.mcpContentContainer.appendChild(this.mcpListWidget.element);
			this.injectBackArrowIntoSearchRow(this.mcpListWidget);

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
			this.injectBackArrowIntoSearchRow(this.pluginListWidget);

			// Embedded plugin detail view
			this.pluginDetailContainer = DOM.append(contentInner, $('.plugin-detail-container'));
			this.createEmbeddedPluginDetail();

			this.editorDisposables.add(this.pluginListWidget.onDidSelectPlugin(item => {
				this.pluginDetailReturnSection = undefined;
				this.showEmbeddedPluginDetail(item);
			}));
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
		if (this.modelsWidget) {
			this.editorDisposables.add(this.modelsWidget.onDidChangeItemCount(count => {
				this.updateSectionCount(AICustomizationManagementSection.Models, count);
			}));
			this.modelsWidget.fireItemCount();
		}

		// Any prompts data change → refresh ALL prompts section counts (debounced)
		this.editorDisposables.add(this.promptsService.onDidChangeCustomAgents(() => this.refreshAllPromptsSectionCounts()));
		this.editorDisposables.add(this.promptsService.onDidChangeSkills(() => this.refreshAllPromptsSectionCounts()));
		this.editorDisposables.add(this.promptsService.onDidChangeInstructions(() => this.refreshAllPromptsSectionCounts()));
		this.editorDisposables.add(this.promptsService.onDidChangeSlashCommands(() => this.refreshAllPromptsSectionCounts()));

		// Load initial counts for all sections
		this.refreshAllPromptsSectionCounts();

		// Load items for the initial section
		if (this.isPromptsSection(this.selectedSection)) {
			void this.listWidget.setSection(this.selectedSection);
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

	/**
	 * Schedules a debounced refresh of all prompts-based section counts.
	 */
	private refreshAllPromptsSectionCounts(): void {
		this.promptsSectionCountScheduler.schedule();
	}

	/**
	 * Performs the actual refresh of all prompts-based section counts.
	 * Uses the list widget's shared item-loading logic so sidebar counts
	 * match the per-group counts shown inside each section.
	 */
	private _doRefreshAllPromptsSectionCounts(): void {
		for (const section of this.sections) {
			if (this.isPromptsSection(section.id)) {
				this.listWidget.computeItemCountForSection(section.id).then(count => {
					this.updateSectionCount(section.id, count);
				}, onUnexpectedError);
			}
		}
	}

	//#endregion

	/**
	 * Navigates to the welcome page (no section selected).
	 */
	private showWelcomePage(): void {
		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
		}

		this.selectedSection = undefined;
		this.sectionContextKey.set('');

		// Clear persisted section so welcome shows next time
		this.storageService.remove(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);

		this.welcomePage?.reset();
		this.updateContentVisibility();
		this.ensureSectionsListReflectsActiveSection(undefined);
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
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
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

		this.ensureSectionsListReflectsActiveSection(section);

		// Activate marketplace browse mode if requested
		if (options?.showMarketplace) {
			if (section === AICustomizationManagementSection.McpServers) {
				this.mcpListWidget?.showBrowseMarketplace();
			} else if (section === AICustomizationManagementSection.Plugins) {
				this.pluginListWidget?.showBrowseMarketplace();
			}
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
		const isMcpDetailMode = this.viewMode === 'mcpDetail';
		const isPluginDetailMode = this.viewMode === 'pluginDetail';
		const isDetailMode = isMcpDetailMode || isPluginDetailMode;
		const isWelcome = this.selectedSection === undefined;
		const isPromptsSection = this.selectedSection !== undefined && this.isPromptsSection(this.selectedSection);
		const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
		const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
		const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;

		if (this.welcomePage) {
			this.welcomePage.container.style.display = isWelcome && !isEditorMode && !isDetailMode ? '' : 'none';
		}
		if (this.promptsContentContainer) {
			this.promptsContentContainer.style.display = !isEditorMode && !isDetailMode && isPromptsSection ? '' : 'none';
		}
		if (this.modelsContentContainer) {
			this.modelsContentContainer.style.display = !isEditorMode && !isDetailMode && isModelsSection ? '' : 'none';
		}
		if (this.mcpContentContainer) {
			this.mcpContentContainer.style.display = !isEditorMode && !isDetailMode && isMcpSection ? '' : 'none';
		}
		if (this.mcpDetailContainer) {
			this.mcpDetailContainer.style.display = isMcpDetailMode ? '' : 'none';
		}
		if (this.pluginContentContainer) {
			this.pluginContentContainer.style.display = !isEditorMode && !isDetailMode && isPluginsSection ? '' : 'none';
		}
		if (this.pluginDetailContainer) {
			this.pluginDetailContainer.style.display = isPluginDetailMode ? '' : 'none';
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
	private async createNewItemManual(type: PromptsType, target: 'workspace' | 'user' | 'workspace-root', rootFileName?: string): Promise<void> {
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
			void this.listWidget.refresh();
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

		const targetDir = await this.resolveTargetDirectoryWithPicker(type, target);
		if (targetDir === null) {
			return; // User cancelled the picker
		}
		// targetDir may be undefined when no matching folder exists for the
		// requested storage type (e.g. skills have no user-storage folder).
		// Pass it through — the command handles undefined by showing its own
		// folder picker via askForPromptSourceFolder.

		// When the active harness overrides the file extension (e.g. Claude
		// rules use .md instead of .instructions.md), pass it through so the
		// name picker and file creation use the correct extension.
		const override = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : undefined;

		const options: INewPromptOptions = {
			targetFolder: targetDir,
			targetStorage: target === 'user' ? PromptsStorage.user : PromptsStorage.local,
			fileExtension: override?.fileExtension,
			openFile: async (uri) => {
				const isWorkspace = target === 'workspace';
				await this.showEmbeddedEditor(uri, basename(uri), type, target === 'user' ? PromptsStorage.user : PromptsStorage.local, isWorkspace);
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
		void this.listWidget.refresh();
	}

	/**
	 * Resolves the target directory for creating a new customization file.
	 * If multiple source folders exist for the given storage type, shows a
	 * picker to let the user choose. Otherwise, returns the single match.
	 *
	 * @returns the resolved URI, `undefined` when no folder is available,
	 *          or `null` when the user cancelled the picker.
	 */
	private async resolveTargetDirectoryWithPicker(type: PromptsType, target: 'workspace' | 'user'): Promise<URI | undefined | null> {
		const allFolders = await this.promptsService.getSourceFolders(type);
		const projectRoot = this.workspaceService.getActiveProjectRoot();
		const descriptor = this.harnessService.getActiveDescriptor();
		const subpaths = descriptor.workspaceSubpaths;

		// Partition folders by whether they're under the active project root.
		// The storage tags from getSourceFolders() are unreliable (tilde-expanded
		// user paths like ~/.copilot/skills get tagged PromptsStorage.local),
		// so we use the project root as the authoritative boundary.
		let matchingFolders;
		if (target === 'workspace') {
			matchingFolders = projectRoot
				? allFolders.filter(f => {
					if (!isEqualOrParent(f.uri, projectRoot)) {
						return false;
					}
					// When the active harness specifies workspaceSubpaths, only offer
					// directories whose path includes one of those sub-paths.
					if (subpaths) {
						return matchesWorkspaceSubpath(f.uri.path, subpaths);
					}
					return true;
				})
				: [];
		} else {
			matchingFolders = projectRoot
				? allFolders.filter(f => !isEqualOrParent(f.uri, projectRoot))
				: allFolders;

			// When the active harness restricts user roots, only offer
			// directories under the harness-accessible user roots
			// (e.g. Claude → ~/.claude only, not ~/.copilot or profile paths).
			const filter = this.harnessService.getStorageSourceFilter(type);
			if (filter.includedUserFileRoots) {
				const roots = filter.includedUserFileRoots;
				matchingFolders = matchingFolders.filter(f =>
					roots.some(root => isEqualOrParent(f.uri, root))
				);
			}
		}

		// Deduplicate by URI (getSourceFolders may return the same path
		// from both config-based discovery and the AgenticPromptsService override)
		const seen = new Set<string>();
		matchingFolders = matchingFolders.filter(f => {
			const key = f.uri.toString();
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});

		if (matchingFolders.length === 0) {
			// No matching folders — return undefined so the command can fall
			// back to askForPromptSourceFolder (not null which means cancellation)
			return undefined;
		}

		if (matchingFolders.length === 1) {
			return matchingFolders[0].uri;
		}

		// Multiple directories — ask the user which one to use
		const items: (IQuickPickItem & { uri: URI })[] = matchingFolders.map(folder => ({
			label: this.promptsService.getPromptLocationLabel(folder),
			description: folder.uri.fsPath,
			uri: folder.uri,
		}));

		const picked = await this.quickInputService.pick(items, {
			placeHolder: localize('selectTargetDirectory', "Select a directory for the new customization file"),
		});

		return picked?.uri ?? null;
	}

	override updateStyles(): void {
		const borderColor = this.theme.getColor(aiCustomizationManagementSashBorder);
		if (borderColor) {
			this.splitView?.style({ separatorBorder: borderColor });
		}
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
		if (this.viewMode === 'mcpDetail') {
			this.goBackFromMcpDetail();
		}
		if (this.viewMode === 'pluginDetail') {
			this.goBackFromPluginDetail();
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
	}

	override focus(): void {
		super.focus();
		if (this.viewMode === 'editor') {
			this.embeddedEditor?.focus();
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
			if (this.viewMode === 'mcpDetail') {
				this.goBackFromMcpDetail();
			}
			if (this.viewMode === 'pluginDetail') {
				this.goBackFromPluginDetail();
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

	/**
	 * Refreshes the list widget.
	 */
	public refreshList(): void {
		void this.listWidget.refresh();
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

		this.editorSaveIndicator = DOM.append(editorHeader, $('.editor-save-indicator'));

		const embeddedEditorContainer = DOM.append(this.editorContentContainer, $('.embedded-editor-container'));
		const overflowWidgetsDomNode = DOM.append(this.editorContentContainer, $('.embedded-editor-overflow-widgets.monaco-editor'));
		this.editorDisposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));

		this.embeddedEditor = this.editorDisposables.add(this.instantiationService.createInstance(
			CodeEditorWidget,
			embeddedEditorContainer,
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
	}

	private async showEmbeddedEditor(uri: URI, displayName: string, promptType: PromptsType, storage: AICustomizationPromptsStorage, isWorkspaceFile = false, isReadOnly = false): Promise<void> {
		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.editorModelChangeDisposables.clear();
		this.currentEditingUri = uri;
		this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : undefined;
		this.currentEditingStorage = storage;
		this.currentEditingPromptType = promptType;
		this.viewMode = 'editor';

		this.editorItemNameElement.textContent = displayName;
		this.editorItemPathElement.textContent = basename(uri);
		this._editorContentChanged = false;
		this.resetEditorSaveIndicator();
		this.updateEditorActionButton();
		this.updateContentVisibility();

		try {
			if (storage === BUILTIN_STORAGE && (promptType === PromptsType.prompt || promptType === PromptsType.skill)) {
				const session = await this.getOrCreateBuiltinEditingSession(uri);

				if (!isEqual(this.currentEditingUri, uri)) {
					return;
				}

				this.embeddedEditor!.setModel(session.model);
				this.embeddedEditor!.updateOptions({ readOnly: false });
				this._editorContentChanged = session.model.getValue() !== session.originalContent;
				this.updateEditorActionButton();

				if (this.dimension) {
					this.layout(this.dimension);
				}
				this.embeddedEditor!.focus();

				this.editorModelChangeDisposables.add(session.model.onDidChangeContent(() => {
					this._editorContentChanged = session.model.getValue() !== session.originalContent;
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

			if (this.dimension) {
				this.layout(this.dimension);
			}
			this.embeddedEditor!.focus();

			this._editorContentChanged = this.workingCopyService.isDirty(uri);
			this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
				this._editorContentChanged = true;
				this.resetEditorSaveIndicator();
			}));
			this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave(e => {
				if (isEqual(e.workingCopy.resource, uri)) {
					this._editorContentChanged = this.workingCopyService.isDirty(uri);
					this.editorSaveIndicator.className = 'editor-save-indicator visible saved';
					this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
					this.editorSaveIndicator.title = localize('saved', "Saved");
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
		const fileUri = this.currentEditingUri;
		const backgroundSaveRequest = this.createExistingCustomizationSaveRequest();
		if (backgroundSaveRequest) {
			this.telemetryService.publicLog2<CustomizationEditorSaveItemEvent, CustomizationEditorSaveItemClassification>('chatCustomizationEditor.saveItem', {
				promptType: this.currentEditingPromptType ?? '',
				storage: String(this.currentEditingStorage ?? ''),
				saveTarget: 'existing',
			});
		}
		if (fileUri && this.currentEditingStorage === BUILTIN_STORAGE) {
			this.disposeBuiltinEditingSession(fileUri);
		}

		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.currentEditingUri = undefined;
		this.currentEditingProjectRoot = undefined;
		this.currentEditingStorage = undefined;
		this.currentEditingPromptType = undefined;
		this._editorContentChanged = false;
		this.editorModelChangeDisposables.clear();
		this.resetEditorSaveIndicator();
		this.updateEditorActionButton();
		this.embeddedEditor?.setModel(null);
		this.viewMode = 'list';
		this.updateContentVisibility();

		// Refresh the list to pick up newly created/edited files
		void this.listWidget?.refresh();

		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.listWidget?.focusSearch();

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
		if (!sourceUri || this.currentEditingStorage !== BUILTIN_STORAGE || (promptType !== PromptsType.prompt && promptType !== PromptsType.skill) || !target.folder || target.target === 'cancel') {
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
		if (!this._editorContentChanged || this.currentEditingStorage === BUILTIN_STORAGE || !this.currentEditingUri) {
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
				description: workspaceFolder.fsPath,
				target: 'workspace',
				folder: workspaceFolder,
			});
		}

		const userFolder = await resolveUserTargetDirectory(this.promptsService, promptType);
		if (userFolder) {
			items.push({
				label: localize('userSaveTarget', "User"),
				description: userFolder.fsPath,
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
						storage: String(this.currentEditingStorage ?? ''),
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
			: localize('backToList', "Back to list"));
		this.editorActionButton.title = shouldShowBuiltinSaveAction
			? localize('saveBuiltinCopyAndChooseLocationTooltip', "Save override (choose Workspace, User, or Cancel)")
			: localize('backToList', "Back to list");
	}

	private shouldShowBuiltinSaveAction(): boolean {
		return this._editorContentChanged
			&& this.currentEditingStorage === BUILTIN_STORAGE
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
				storage: String(this.currentEditingStorage ?? ''),
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

		// Back button header
		const detailHeader = DOM.append(this.mcpDetailContainer, $('.editor-header'));
		const backButton = DOM.append(detailHeader, $('button.editor-back-button'));
		backButton.setAttribute('aria-label', localize('backToMcpList', "Back to MCP servers"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), backButton, localize('backToMcpListTooltip', "Back to MCP servers")));
		const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIconEl.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackFromMcpDetail();
		}));

		// Container for the MCP server editor
		const editorContainer = DOM.append(this.mcpDetailContainer, $('.mcp-detail-editor-container'));

		// Create the embedded MCP server editor pane
		this.embeddedMcpEditor = this.editorDisposables.add(this.instantiationService.createInstance(McpServerEditor, this.group));
		this.embeddedMcpEditor.create(editorContainer);
	}

	private async showEmbeddedMcpDetail(server: IWorkbenchMcpServer): Promise<void> {
		if (!this.embeddedMcpEditor) {
			return;
		}

		this.viewMode = 'mcpDetail';
		this.updateContentVisibility();

		const input = this.instantiationService.createInstance(McpServerEditorInput, server);
		this.mcpDetailDisposables.clear();
		this.mcpDetailDisposables.add(input);

		try {
			await this.embeddedMcpEditor.setInput(input, undefined, {}, CancellationToken.None);
		} catch {
			this.goBackFromMcpDetail();
			return;
		}

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private goBackFromMcpDetail(): void {
		this.mcpDetailDisposables.clear();
		this.embeddedMcpEditor?.clearInput();
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

		// Back button header
		const detailHeader = DOM.append(this.pluginDetailContainer, $('.editor-header'));
		const backButton = DOM.append(detailHeader, $('button.editor-back-button'));
		backButton.setAttribute('aria-label', localize('backToPluginList', "Back to plugins"));
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), backButton, localize('backToPluginListTooltip', "Back to plugins")));
		const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIconEl.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackFromPluginDetail();
		}));

		// Container for the plugin editor
		const editorContainer = DOM.append(this.pluginDetailContainer, $('.plugin-detail-editor-container'));

		// Create the embedded plugin editor pane
		this.embeddedPluginEditor = this.editorDisposables.add(this.instantiationService.createInstance(AgentPluginEditor, this.group));
		this.embeddedPluginEditor.create(editorContainer);
	}

	private async showEmbeddedPluginDetail(item: IAgentPluginItem): Promise<void> {
		if (!this.embeddedPluginEditor) {
			return;
		}

		this.viewMode = 'pluginDetail';
		this.updateContentVisibility();

		const input = new AgentPluginEditorInput(item);
		this.pluginDetailDisposables.clear();
		this.pluginDetailDisposables.add(input);

		try {
			await this.embeddedPluginEditor.setInput(input, undefined, {}, CancellationToken.None);
		} catch {
			this.goBackFromPluginDetail();
			return;
		}

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
		this.embeddedPluginEditor?.clearInput();

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
}
