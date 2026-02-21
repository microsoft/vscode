/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { localize } from '../../../../../nls.js';
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
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import { AICustomizationListWidget } from './aiCustomizationListWidget.js';
import { McpListWidget } from './mcpListWidget.js';
import {
	AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
	AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY,
	AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY,
	AICustomizationManagementSection,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
	CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_MAX_WIDTH,
	CONTENT_MIN_WIDTH,
} from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon } from './aiCustomizationIcons.js';
import { ChatModelsWidget } from '../chatManagement/chatModelsWidget.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { INewPromptOptions, NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from '../promptSyntax/newPromptFileActions.js';
import { showConfigureHooksQuickPick } from '../promptSyntax/hookActions.js';
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory } from './customizationCreatorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';

const $ = DOM.$;

export const aiCustomizationManagementSashBorder = registerColor(
	'aiCustomizationManagement.sashBorder',
	PANEL_BORDER,
	localize('aiCustomizationManagementSashBorder', "The color of the AI Customization Management editor splitview sash border.")
);

//#region Sidebar Section Item

interface ISectionItem {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
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
}

class SectionItemRenderer implements IListRenderer<ISectionItem, ISectionItemTemplateData> {
	readonly templateId = 'sectionItem';

	renderTemplate(container: HTMLElement): ISectionItemTemplateData {
		container.classList.add('section-list-item');
		const icon = DOM.append(container, $('.section-icon'));
		const label = DOM.append(container, $('.section-label'));
		return { container, icon, label };
	}

	renderElement(element: ISectionItem, index: number, templateData: ISectionItemTemplateData): void {
		templateData.icon.className = 'section-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
		templateData.label.textContent = element.label;
	}

	disposeTemplate(): void { }
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
	private modelsWidget: ChatModelsWidget | undefined;
	private promptsContentContainer!: HTMLElement;
	private mcpContentContainer: HTMLElement | undefined;
	private modelsContentContainer: HTMLElement | undefined;
	private modelsFooterElement: HTMLElement | undefined;

	// Embedded editor state (sessions only — preferManualCreation)
	private editorContentContainer: HTMLElement | undefined;
	private embeddedEditor: CodeEditorWidget | undefined;
	private editorItemNameElement!: HTMLElement;
	private editorItemPathElement!: HTMLElement;
	private editorSaveIndicator!: HTMLElement;
	private readonly editorModelChangeDisposables = this._register(new DisposableStore());
	private currentEditingUri: URI | undefined;
	private currentEditingProjectRoot: URI | undefined;
	private currentModelRef: IReference<IResolvedTextEditorModel> | undefined;
	private viewMode: 'list' | 'editor' = 'list';

	private dimension: DOM.Dimension | undefined;
	private readonly sections: ISectionItem[] = [];
	private selectedSection: AICustomizationManagementSection = AICustomizationManagementSection.Agents;

	private readonly editorDisposables = this._register(new DisposableStore());

	private readonly inEditorContextKey: IContextKey<boolean>;
	private readonly sectionContextKey: IContextKey<string>;

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
		@IEditorService private readonly editorService: IEditorService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
	) {
		super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);

		this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
		this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);

		// Track workspace changes for embedded editor (sessions only)
		if (this.workspaceService.preferManualCreation) {
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
		}

		// Build sections from the workspace service configuration
		const sectionInfo: Record<string, { label: string; icon: ThemeIcon }> = {
			[AICustomizationManagementSection.Agents]: { label: localize('agents', "Agents"), icon: agentIcon },
			[AICustomizationManagementSection.Skills]: { label: localize('skills', "Skills"), icon: skillIcon },
			[AICustomizationManagementSection.Instructions]: { label: localize('instructions', "Instructions"), icon: instructionsIcon },
			[AICustomizationManagementSection.Prompts]: { label: localize('prompts', "Prompts"), icon: promptIcon },
			[AICustomizationManagementSection.Hooks]: { label: localize('hooks', "Hooks"), icon: hookIcon },
			[AICustomizationManagementSection.McpServers]: { label: localize('mcpServers', "MCP Servers"), icon: Codicon.server },
			[AICustomizationManagementSection.Models]: { label: localize('models', "Models"), icon: Codicon.vm },
		};
		for (const id of this.workspaceService.managementSections) {
			const info = sectionInfo[id];
			if (info) {
				this.sections.push({ id, ...info });
			}
		}

		// Restore selected section from storage, falling back to first available
		const savedSection = this.storageService.get(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
		if (savedSection && this.sections.some(s => s.id === savedSection)) {
			this.selectedSection = savedSection as AICustomizationManagementSection;
		} else if (this.sections.length > 0) {
			this.selectedSection = this.sections[0].id;
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
					const listHeight = height - 8;
					this.sectionsList.layout(listHeight, width);
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
					const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
					this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
					if (this.viewMode === 'editor' && this.embeddedEditor) {
						const editorHeaderHeight = 50;
						const padding = 24;
						this.embeddedEditor.layout({ width: Math.max(0, width - padding), height: Math.max(0, height - editorHeaderHeight - padding) });
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

	private createSidebar(): void {
		const sidebarContent = DOM.append(this.sidebarContainer, $('.sidebar-content'));

		// Main sections list container (takes remaining space)
		const sectionsListContainer = DOM.append(sidebarContent, $('.sidebar-sections-list'));

		this.sectionsList = this.editorDisposables.add(this.instantiationService.createInstance(
			WorkbenchList<ISectionItem>,
			'AICustomizationManagementSections',
			sectionsListContainer,
			new SectionItemDelegate(),
			[new SectionItemRenderer()],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (item: ISectionItem) => item.label,
					getWidgetAriaLabel: () => localize('sectionsAriaLabel', "AI Customization Sections"),
				},
				openOnSingleClick: true,
				identityProvider: {
					getId: (item: ISectionItem) => item.id,
				},
			}
		));

		this.sectionsList.splice(0, this.sectionsList.length, this.sections);

		// Select the saved section
		const selectedIndex = this.sections.findIndex(s => s.id === this.selectedSection);
		if (selectedIndex >= 0) {
			this.sectionsList.setSelection([selectedIndex]);
		}

		this.editorDisposables.add(this.sectionsList.onDidChangeSelection(e => {
			if (e.elements.length > 0) {
				this.selectSection(e.elements[0].id);
			}
		}));
	}

	private createContent(): void {
		const contentInner = DOM.append(this.contentContainer, $('.content-inner'));

		// Container for prompts-based content (Agents, Skills, Instructions, Prompts)
		this.promptsContentContainer = DOM.append(contentInner, $('.prompts-content-container'));
		this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
		this.promptsContentContainer.appendChild(this.listWidget.element);

		// Handle item selection
		this.editorDisposables.add(this.listWidget.onDidSelectItem(item => {
			if (this.workspaceService.preferManualCreation) {
				const isWorkspaceFile = item.storage === PromptsStorage.local;
				const isReadOnly = item.storage === PromptsStorage.extension;
				this.showEmbeddedEditor(item.uri, item.name, isWorkspaceFile, isReadOnly);
			} else {
				this.editorService.openEditor({ resource: item.uri });
			}
		}));

		// Handle create actions - AI-guided creation
		this.editorDisposables.add(this.listWidget.onDidRequestCreate(promptType => {
			this.createNewItemWithAI(promptType);
		}));

		// Handle manual create actions - open editor directly
		this.editorDisposables.add(this.listWidget.onDidRequestCreateManual(({ type, target }) => {
			this.createNewItemManual(type, target);
		}));

		// Container for Models content (only in sessions)
		const hasSections = new Set(this.workspaceService.managementSections);
		if (hasSections.has(AICustomizationManagementSection.Models)) {
			this.modelsContentContainer = DOM.append(contentInner, $('.models-content-container'));
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

		// Container for MCP content (only in sessions)
		if (hasSections.has(AICustomizationManagementSection.McpServers)) {
			this.mcpContentContainer = DOM.append(contentInner, $('.mcp-content-container'));
			this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
			this.mcpContentContainer.appendChild(this.mcpListWidget.element);
		}

		// Embedded editor container (sessions only)
		if (this.workspaceService.preferManualCreation) {
			this.editorContentContainer = DOM.append(contentInner, $('.editor-content-container'));
			this.createEmbeddedEditor();
		}

		// Set initial visibility based on selected section
		this.updateContentVisibility();

		// Load items for the initial section
		if (this.isPromptsSection(this.selectedSection)) {
			void this.listWidget.setSection(this.selectedSection);
		}
	}

	private isPromptsSection(section: AICustomizationManagementSection): boolean {
		return section === AICustomizationManagementSection.Agents ||
			section === AICustomizationManagementSection.Skills ||
			section === AICustomizationManagementSection.Instructions ||
			section === AICustomizationManagementSection.Prompts ||
			section === AICustomizationManagementSection.Hooks;
	}

	private selectSection(section: AICustomizationManagementSection): void {
		if (this.selectedSection === section) {
			return;
		}

		if (this.viewMode === 'editor') {
			this.goBackToList();
		}

		this.selectedSection = section;
		this.sectionContextKey.set(section);

		// Persist selection
		this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, section, StorageScope.PROFILE, StorageTarget.USER);

		// Update editor tab title
		this.updateEditorTitle();

		// Update content visibility
		this.updateContentVisibility();

		// Load items for the new section (only for prompts-based sections)
		if (this.isPromptsSection(section)) {
			void this.listWidget.setSection(section);
		}
	}

	private updateEditorTitle(): void {
		const sectionItem = this.sections.find(s => s.id === this.selectedSection);
		if (sectionItem && this.input instanceof AICustomizationManagementEditorInput) {
			this.input.setSectionLabel(sectionItem.label);
		}
	}

	private updateContentVisibility(): void {
		const isEditorMode = this.viewMode === 'editor';
		const isPromptsSection = this.isPromptsSection(this.selectedSection);
		const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
		const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;

		this.promptsContentContainer.style.display = !isEditorMode && isPromptsSection ? '' : 'none';
		if (this.modelsContentContainer) {
			this.modelsContentContainer.style.display = !isEditorMode && isModelsSection ? '' : 'none';
		}
		if (this.mcpContentContainer) {
			this.mcpContentContainer.style.display = !isEditorMode && isMcpSection ? '' : 'none';
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
		this.close();
		await this.workspaceService.generateCustomization(type);
	}

	/**
	 * Creates a new prompt file and opens it.
	 * In sessions (preferManualCreation), uses the embedded editor with commit-on-close.
	 * In core, opens in a regular editor tab.
	 */
	private async createNewItemManual(type: PromptsType, target: 'workspace' | 'user'): Promise<void> {
		const useEmbeddedEditor = this.workspaceService.preferManualCreation;

		if (type === PromptsType.hook) {
			const isWorkspace = target === 'workspace';
			await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
				openEditor: async (resource) => {
					if (useEmbeddedEditor) {
						await this.showEmbeddedEditor(resource, basename(resource), isWorkspace);
					} else {
						await this.editorService.openEditor({ resource });
					}
					return;
				},
			});
			return;
		}

		const targetDir = target === 'workspace'
			? resolveWorkspaceTargetDirectory(this.workspaceService, type)
			: await resolveUserTargetDirectory(this.promptsService, type);

		const options: INewPromptOptions = {
			targetFolder: targetDir,
			targetStorage: target === 'user' ? PromptsStorage.user : PromptsStorage.local,
			openFile: async (uri) => {
				if (useEmbeddedEditor) {
					const isWorkspace = target === 'workspace';
					await this.showEmbeddedEditor(uri, basename(uri), isWorkspace);
					return this.embeddedEditor;
				} else {
					await this.editorService.openEditor({ resource: uri });
					return undefined;
				}
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

	override updateStyles(): void {
		const borderColor = this.theme.getColor(aiCustomizationManagementSashBorder);
		if (borderColor) {
			this.splitView?.style({ separatorBorder: borderColor });
		}
	}

	override async setInput(input: AICustomizationManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.inEditorContextKey.set(true);
		this.sectionContextKey.set(this.selectedSection);

		await super.setInput(input, options, context, token);

		// Set initial editor tab title
		this.updateEditorTitle();

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override clearInput(): void {
		this.inEditorContextKey.set(false);
		if (this.viewMode === 'editor') {
			this.goBackToList();
		}
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
		if (this.selectedSection === AICustomizationManagementSection.McpServers) {
			this.mcpListWidget?.focusSearch();
		} else if (this.selectedSection === AICustomizationManagementSection.Models) {
			this.modelsWidget?.focusSearch();
		} else {
			this.listWidget?.focusSearch();
		}
	}

	/**
	 * Selects a specific section programmatically.
	 */
	public selectSectionById(sectionId: AICustomizationManagementSection): void {
		const index = this.sections.findIndex(s => s.id === sectionId);
		if (index >= 0) {
			this.sectionsList.setFocus([index]);
			this.sectionsList.setSelection([index]);
		}
	}

	/**
	 * Refreshes the list widget.
	 */
	public refreshList(): void {
		void this.listWidget.refresh();
	}

	private close(): void {
		if (!this.workspaceService.preferManualCreation && this.input) {
			this.group.closeEditor(this.input);
		}
	}

	//#region Embedded Editor (sessions only)

	private createEmbeddedEditor(): void {
		if (!this.editorContentContainer) {
			return;
		}

		const editorHeader = DOM.append(this.editorContentContainer, $('.editor-header'));

		const backButton = DOM.append(editorHeader, $('button.editor-back-button'));
		backButton.setAttribute('aria-label', localize('backToList', "Back to list"));
		const backIcon = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
		backIcon.setAttribute('aria-hidden', 'true');
		this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
			this.goBackToList();
		}));

		const itemInfo = DOM.append(editorHeader, $('.editor-item-info'));
		this.editorItemNameElement = DOM.append(itemInfo, $('.editor-item-name'));
		this.editorItemPathElement = DOM.append(itemInfo, $('.editor-item-path'));
		this.editorSaveIndicator = DOM.append(editorHeader, $('.editor-save-indicator'));

		const embeddedEditorContainer = DOM.append(this.editorContentContainer, $('.embedded-editor-container'));
		const overflowWidgetsDomNode = this.layoutService.getContainer(DOM.getWindow(embeddedEditorContainer)).appendChild($('.embedded-editor-overflow-widgets.monaco-editor'));
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

	private async showEmbeddedEditor(uri: URI, displayName: string, isWorkspaceFile = false, isReadOnly = false): Promise<void> {
		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.currentEditingUri = uri;
		this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : undefined;
		this.viewMode = 'editor';

		this.editorItemNameElement.textContent = displayName;
		this.editorItemPathElement.textContent = basename(uri);
		this.updateContentVisibility();

		try {
			const ref = await this.textModelService.createModelReference(uri);
			this.currentModelRef = ref;
			this.embeddedEditor!.setModel(ref.object.textEditorModel);
			this.embeddedEditor!.updateOptions({ readOnly: isReadOnly });

			if (this.dimension) {
				this.layout(this.dimension);
			}
			this.embeddedEditor!.focus();

			this.editorModelChangeDisposables.clear();
			this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
				this.editorSaveIndicator.className = 'editor-save-indicator visible';
				this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
				this.editorSaveIndicator.title = localize('saving', "Saving...");
			}));
			this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave(e => {
				if (isEqual(e.workingCopy.resource, uri)) {
					this.editorSaveIndicator.className = 'editor-save-indicator visible saved';
					this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
					this.editorSaveIndicator.title = localize('saved', "Saved");
				}
			}));
		} catch (error) {
			console.error('Failed to load model for embedded editor:', error);
			this.goBackToList();
		}
	}

	private goBackToList(): void {
		// Auto-commit workspace files when leaving the embedded editor
		const fileUri = this.currentEditingUri;
		const projectRoot = this.currentEditingProjectRoot;
		if (fileUri && projectRoot) {
			this.workspaceService.commitFiles(projectRoot, [fileUri]);
		}

		this.currentModelRef?.dispose();
		this.currentModelRef = undefined;
		this.currentEditingUri = undefined;
		this.currentEditingProjectRoot = undefined;
		this.editorModelChangeDisposables.clear();
		this.editorSaveIndicator.className = 'editor-save-indicator';
		this.editorSaveIndicator.title = '';
		this.embeddedEditor?.setModel(null);
		this.viewMode = 'list';
		this.updateContentVisibility();

		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.listWidget?.focusSearch();
	}

	//#endregion
}
