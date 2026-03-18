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
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { McpServerEditorInput } from '../../../mcp/browser/mcpServerEditorInput.js';
import { McpServerEditor } from '../../../mcp/browser/mcpServerEditor.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';
import { AgentPluginEditor } from '../agentPluginEditor/agentPluginEditor.js';
import { AgentPluginEditorInput } from '../agentPluginEditor/agentPluginEditorInput.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';

const $ = DOM.$;

//#region Telemetry

type CustomizationEditorOpenedEvent = {
	section: string;
};

type CustomizationEditorOpenedClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The initially selected section when the editor opens.' };
	owner: 'joshspicer';
	comment: 'Tracks when the Chat Customizations editor is opened.';
};

type CustomizationEditorSectionChangedEvent = {
	section: string;
};

type CustomizationEditorSectionChangedClassification = {
	section: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The section the user navigated to.' };
	owner: 'joshspicer';
	comment: 'Tracks section navigation within the Chat Customizations editor.';
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
	comment: 'Tracks item selection in the Chat Customizations editor.';
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
	comment: 'Tracks customization creation in the Chat Customizations editor.';
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
	comment: 'Tracks save actions in the Chat Customizations editor.';
};

//#endregion

export const aiCustomizationManagementSashBorder = registerColor(
	'aiCustomizationManagement.sashBorder',
	PANEL_BORDER,
	localize('aiCustomizationManagementSashBorder', "The color of the Chat Customization Management editor splitview sash border.")
);

//#region Sidebar Section Item

interface ISectionItem {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
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
}

class SectionItemRenderer implements IListRenderer<ISectionItem, ISectionItemTemplateData> {
	readonly templateId = 'sectionItem';

	renderTemplate(container: HTMLElement): ISectionItemTemplateData {
		container.classList.add('section-list-item');
		const icon = DOM.append(container, $('.section-icon'));
		const label = DOM.append(container, $('.section-label'));
		const count = DOM.append(container, $('.section-count'));
		return { container, icon, label, count };
	}

	renderElement(element: ISectionItem, index: number, templateData: ISectionItemTemplateData): void {
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

	private dimension: DOM.Dimension | undefined;
	private readonly sections: ISectionItem[] = [];
	private readonly allSections: ISectionItem[] = [];
	private selectedSection: AICustomizationManagementSection = AICustomizationManagementSection.Agents;

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly promptsSectionCountScheduler = this._register(new RunOnceScheduler(() => this._doRefreshAllPromptsSectionCounts(), 100));
	private _editorContentChanged = false;

	// Folder picker (sessions window only)
	private folderPickerContainer: HTMLElement | undefined;
	private folderPickerLabel: HTMLElement | undefined;
	private folderPickerClearButton: HTMLElement | undefined;

	// Harness dropdown
	private harnessDropdownButton: HTMLElement | undefined;
	private harnessDropdownIcon: HTMLElement | undefined;
	private harnessDropdownLabel: HTMLElement | undefined;

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
		@IPromptsService private readonly promptsService: IPromptsService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IModelService private readonly modelService: IModelService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
	) {
		super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);

		this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
		this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);

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
		const sectionInfo: Record<string, { label: string; icon: ThemeIcon }> = {
			[AICustomizationManagementSection.Agents]: { label: localize('agents', "Agents"), icon: agentIcon },
			[AICustomizationManagementSection.Skills]: { label: localize('skills', "Skills"), icon: skillIcon },
			[AICustomizationManagementSection.Instructions]: { label: localize('instructions', "Instructions"), icon: instructionsIcon },
			[AICustomizationManagementSection.Prompts]: { label: localize('prompts', "Prompts"), icon: promptIcon },
			[AICustomizationManagementSection.Hooks]: { label: localize('hooks', "Hooks"), icon: hookIcon },
			[AICustomizationManagementSection.McpServers]: { label: localize('mcpServers', "MCP Servers"), icon: Codicon.server },
			[AICustomizationManagementSection.Plugins]: { label: localize('plugins', "Plugins"), icon: pluginIcon },
			[AICustomizationManagementSection.Models]: { label: localize('models', "Models"), icon: Codicon.vm },
		};
		for (const id of this.workspaceService.managementSections) {
			const info = sectionInfo[id];
			if (info) {
				this.allSections.push({ id, ...info, count: 0 });
			}
		}
		this.rebuildVisibleSections();

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
					const footerHeight = this.folderPickerContainer?.offsetHeight ?? 0;
					const listHeight = height - 8 - footerHeight;
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
	 * Rebuilds the visible sections list based on the active harness's
	 * `hiddenSections`. If the current selection falls into a hidden
	 * section, the first visible section is selected instead.
	 */
	private rebuildVisibleSections(): void {
		const activeId = this.harnessService.activeHarness.get();
		const descriptor = this.harnessService.availableHarnesses.get().find(h => h.id === activeId);
		const hidden = new Set(descriptor?.hiddenSections ?? []);

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

		// If the current selection is hidden, fall back to first visible
		if (!this.sections.some(s => s.id === this.selectedSection) && this.sections.length > 0) {
			this.selectSection(this.sections[0].id);
		} else {
			this.ensureSectionsListReflectsActiveSection();
		}
	}

	private createSidebar(): void {
		const sidebarContent = DOM.append(this.sidebarContainer, $('.sidebar-content'));

		// Harness dropdown (shown when multiple harnesses available)
		this.createHarnessDropdown(sidebarContent);

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
					getWidgetAriaLabel: () => localize('sectionsAriaLabel', "Chat Customization Sections"),
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
				this.ensureSectionsListReflectsActiveSection();
				return;
			}
			this.selectSection(e.elements[0].id);
		}));

		// React to harness changes — rebuild visible sections
		this.editorDisposables.add(autorun(reader => {
			this.harnessService.activeHarness.read(reader);
			this.rebuildVisibleSections();
			this.updateHarnessDropdown();
		}));

		// Folder picker (sessions window only)
		if (this.workspaceService.isSessionsWindow) {
			this.createFolderPicker(sidebarContent);
		}
	}

	private createHarnessDropdown(sidebarContent: HTMLElement): void {
		const harnesses = this.harnessService.availableHarnesses.get();
		if (harnesses.length <= 1) {
			return;
		}

		const container = DOM.append(sidebarContent, $('.sidebar-harness-dropdown'));

		this.harnessDropdownButton = DOM.append(container, $('button.harness-dropdown-button'));
		this.harnessDropdownButton.setAttribute('aria-label', localize('selectHarness', "Select customization target"));
		this.harnessDropdownButton.setAttribute('aria-haspopup', 'listbox');

		this.harnessDropdownIcon = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-icon'));
		this.harnessDropdownLabel = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-label'));
		DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-chevron.codicon.codicon-chevron-down'));

		this.updateHarnessDropdown();

		this.editorDisposables.add(DOM.addDisposableListener(this.harnessDropdownButton, 'click', () => {
			this.showHarnessPicker();
		}));
	}

	private updateHarnessDropdown(): void {
		if (!this.harnessDropdownIcon || !this.harnessDropdownLabel) {
			return;
		}
		const activeId = this.harnessService.activeHarness.get();
		const descriptor = this.harnessService.availableHarnesses.get().find(h => h.id === activeId);
		if (descriptor) {
			this.harnessDropdownIcon.className = 'harness-dropdown-icon';
			this.harnessDropdownIcon.classList.add(...ThemeIcon.asClassNameArray(descriptor.icon));
			this.harnessDropdownLabel.textContent = descriptor.label;
		}
	}

	private showHarnessPicker(): void {
		const harnesses = this.harnessService.availableHarnesses.get();
		const activeId = this.harnessService.activeHarness.get();

		const items = harnesses.map(h => ({
			label: h.label,
			iconClass: ThemeIcon.asClassName(h.icon),
			id: h.id,
			picked: h.id === activeId,
		}));

		const picker = this.quickInputService.createQuickPick();
		picker.items = items;
		picker.placeholder = localize('selectTarget', "Select customization target");
		picker.canSelectMany = false;
		picker.activeItems = items.filter(i => i.picked);
		picker.onDidAccept(() => {
			const selected = picker.activeItems[0] as typeof items[0] | undefined;
			if (selected) {
				this.harnessService.setActiveHarness(selected.id);
			}
			picker.dispose();
		});
		picker.onDidHide(() => picker.dispose());
		picker.show();
	}

	private createFolderPicker(sidebarContent: HTMLElement): void {
		const footer = this.folderPickerContainer = DOM.append(sidebarContent, $('.sidebar-folder-picker'));

		const button = DOM.append(footer, $('button.folder-picker-button'));
		button.setAttribute('aria-label', localize('browseFolder', "Browse folder"));

		const folderIcon = DOM.append(button, $(`.codicon.codicon-${Codicon.folder.id}`));
		folderIcon.classList.add('folder-picker-icon');

		this.folderPickerLabel = DOM.append(button, $('span.folder-picker-label'));

		this.folderPickerClearButton = DOM.append(footer, $('button.folder-picker-clear'));
		this.folderPickerClearButton.setAttribute('aria-label', localize('clearFolderOverride', "Reset to session folder"));
		DOM.append(this.folderPickerClearButton, $(`.codicon.codicon-${Codicon.close.id}`));

		// Clicking the main button opens the folder dialog
		this.editorDisposables.add(DOM.addDisposableListener(button, 'click', () => {
			this.browseForFolder();
		}));

		// Clear button resets to session default
		this.editorDisposables.add(DOM.addDisposableListener(this.folderPickerClearButton, 'click', () => {
			this.workspaceService.clearOverrideProjectRoot();
		}));

		// Hover showing full path
		this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, () => {
			const root = this.workspaceService.getActiveProjectRoot();
			return root?.fsPath ?? '';
		}));

		// Keep label and clear button in sync with the active root
		this.editorDisposables.add(autorun(reader => {
			const root = this.workspaceService.activeProjectRoot.read(reader);
			const hasOverride = this.workspaceService.hasOverrideProjectRoot.read(reader);
			this.updateFolderPickerLabel(root, hasOverride);
		}));
	}

	private updateFolderPickerLabel(root: URI | undefined, hasOverride: boolean): void {
		if (this.folderPickerLabel) {
			this.folderPickerLabel.textContent = root ? basename(root) : localize('noFolder', "No folder");
		}
		if (this.folderPickerClearButton) {
			this.folderPickerClearButton.style.display = hasOverride ? '' : 'none';
		}
	}

	private async browseForFolder(): Promise<void> {
		const result = await this.fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			title: localize('selectFolder', "Select Folder to Explore"),
			defaultUri: this.workspaceService.getActiveProjectRoot(),
		});
		if (result?.[0]) {
			this.workspaceService.setOverrideProjectRoot(result[0]);
		}
	}

	private createContent(): void {
		const contentInner = DOM.append(this.contentContainer, $('.content-inner'));

		// Container for prompts-based content (Agents, Skills, Instructions, Prompts)
		this.promptsContentContainer = DOM.append(contentInner, $('.prompts-content-container'));
		this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
		this.promptsContentContainer.appendChild(this.listWidget.element);

		// Handle item selection
		this.editorDisposables.add(this.listWidget.onDidSelectItem(item => {
			this.telemetryService.publicLog2<CustomizationEditorItemSelectedEvent, CustomizationEditorItemSelectedClassification>('chatCustomizationEditor.itemSelected', {
				section: this.selectedSection,
				promptType: item.promptType,
				storage: item.storage,
			});
			const isWorkspaceFile = item.storage === PromptsStorage.local;
			const isReadOnly = item.storage === PromptsStorage.extension || item.storage === PromptsStorage.plugin || item.storage === BUILTIN_STORAGE;
			this.showEmbeddedEditor(item.uri, item.name, item.promptType, item.storage, isWorkspaceFile, isReadOnly);
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

		// Container for MCP content
		if (hasSections.has(AICustomizationManagementSection.McpServers)) {
			this.mcpContentContainer = DOM.append(contentInner, $('.mcp-content-container'));
			this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
			this.mcpContentContainer.appendChild(this.mcpListWidget.element);

			// Embedded MCP server detail view
			this.mcpDetailContainer = DOM.append(contentInner, $('.mcp-detail-container'));
			this.createEmbeddedMcpDetail();

			this.editorDisposables.add(this.mcpListWidget.onDidSelectServer(server => {
				this.showEmbeddedMcpDetail(server);
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

	private isPromptsSection(section: AICustomizationManagementSection): boolean {
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

	private selectSection(section: AICustomizationManagementSection): void {
		if (this.selectedSection === section) {
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
	}

	private ensureSectionsListReflectsActiveSection(section: AICustomizationManagementSection = this.selectedSection): void {
		if (!this.sectionsList) {
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
		const isPromptsSection = this.isPromptsSection(this.selectedSection);
		const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
		const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
		const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;

		this.promptsContentContainer.style.display = !isEditorMode && !isDetailMode && isPromptsSection ? '' : 'none';
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
			section: this.selectedSection,
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
	private async createNewItemManual(type: PromptsType, target: 'workspace' | 'user' | 'workspace-root'): Promise<void> {
		this.telemetryService.publicLog2<CustomizationEditorCreateItemEvent, CustomizationEditorCreateItemClassification>('chatCustomizationEditor.createItem', {
			section: this.selectedSection,
			promptType: type,
			creationMode: 'manual',
			target: target === 'workspace-root' ? 'workspace' : target,
		});

		// Handle workspace-root files (e.g. AGENTS.md at project root)
		if (target === 'workspace-root') {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			if (!projectRoot) {
				return;
			}
			const fileUri = URI.joinPath(projectRoot, AGENT_MD_FILENAME);
			if (await this.fileService.exists(fileUri)) {
				// File already exists — just open it
				await this.showEmbeddedEditor(fileUri, AGENT_MD_FILENAME, PromptsType.instructions, PromptsStorage.local, true);
			} else {
				await this.fileService.createFile(fileUri);
				await this.showEmbeddedEditor(fileUri, AGENT_MD_FILENAME, PromptsType.instructions, PromptsStorage.local, true);
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

		const options: INewPromptOptions = {
			targetFolder: targetDir,
			targetStorage: target === 'user' ? PromptsStorage.user : PromptsStorage.local,
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

		// Partition folders by whether they're under the active project root.
		// The storage tags from getSourceFolders() are unreliable (tilde-expanded
		// user paths like ~/.copilot/skills get tagged PromptsStorage.local),
		// so we use the project root as the authoritative boundary.
		let matchingFolders;
		if (target === 'workspace') {
			matchingFolders = projectRoot
				? allFolders.filter(f => isEqualOrParent(f.uri, projectRoot))
				: [];
		} else {
			matchingFolders = projectRoot
				? allFolders.filter(f => !isEqualOrParent(f.uri, projectRoot))
				: allFolders;
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
		this.sectionContextKey.set(this.selectedSection);

		this.telemetryService.publicLog2<CustomizationEditorOpenedEvent, CustomizationEditorOpenedClassification>('chatCustomizationEditor.opened', {
			section: this.selectedSection,
		});

		await super.setInput(input, options, context, token);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override clearInput(): void {
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
	public selectSectionById(sectionId: AICustomizationManagementSection): void {
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
			this.ensureSectionsListReflectsActiveSection(sectionId);
		}
	}

	/**
	 * Refreshes the list widget.
	 */
	public refreshList(): void {
		void this.listWidget.refresh();
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

	private goBackFromPluginDetail(): void {
		this.pluginDetailDisposables.clear();
		this.embeddedPluginEditor?.clearInput();
		this.viewMode = 'list';
		this.updateContentVisibility();

		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.pluginListWidget?.focusSearch();
	}

	//#endregion
}
