/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatManagementEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ChatManagementEditorInput, CHAT_MANAGEMENT_SECTION_USAGE, CHAT_MANAGEMENT_SECTION_MODELS, ModelsManagementEditorInput } from './chatManagementEditorInput.js';
import { ChatModelsWidget } from './chatModelsWidget.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService, ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatUsageWidget } from './chatUsageWidget.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { Event } from '../../../../../base/common/event.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_MODELS_EDITOR } from '../../common/constants.js';

const $ = DOM.$;

export class ModelsManagementEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.modelsManagement';

	private readonly editorDisposables = this._register(new DisposableStore());
	private dimension: Dimension | undefined;
	private modelsWidget: ChatModelsWidget | undefined;
	private bodyContainer: HTMLElement | undefined;

	private readonly inModelsEditorContextKey: IContextKey<boolean>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(ModelsManagementEditor.ID, group, telemetryService, themeService, storageService);
		this.inModelsEditorContextKey = CONTEXT_MODELS_EDITOR.bindTo(contextKeyService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.editorDisposables.clear();
		this.bodyContainer = DOM.append(parent, $('.ai-models-management-editor'));
		this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
		this.bodyContainer.appendChild(this.modelsWidget.element);
	}

	override async setInput(input: ModelsManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.inModelsEditorContextKey.set(true);
		await super.setInput(input, options, context, token);
		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.modelsWidget?.render();
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.bodyContainer) {
			this.modelsWidget?.layout(dimension.height - 15, this.bodyContainer!.clientWidth - 24);
		}
	}

	override focus(): void {
		super.focus();
		this.modelsWidget?.focusSearch();
	}

	override clearInput(): void {
		this.inModelsEditorContextKey.set(false);
		super.clearInput();
	}

	clearSearch(): void {
		this.modelsWidget?.clearSearch();
	}
}

export const chatManagementSashBorder = registerColor('chatManagement.sashBorder', PANEL_BORDER, localize('chatManagementSashBorder', "The color of the Chat Management editor splitview sash border."));

function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.installed ||
		chatEntitlementService.entitlement === ChatEntitlement.Available;
}

interface SectionItem {
	id: string;
	label: string;
}

export class ChatManagementEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.chatManagement';

	private container: HTMLElement | undefined;
	private splitView: SplitView<number> | undefined;
	private sectionsList: WorkbenchList<SectionItem> | undefined;
	private headerContainer!: HTMLElement;
	private contentsContainer!: HTMLElement;

	private planBadge!: HTMLElement;
	private actionButton!: Button;

	private chatUsageWidget!: ChatUsageWidget;
	private modelsWidget!: ChatModelsWidget;

	private dimension: Dimension | undefined;
	private selectedSection: string = CHAT_MANAGEMENT_SECTION_USAGE;
	private sections: SectionItem[] = [];

	private readonly commandService: ICommandService;
	private readonly chatEntitlementService: IChatEntitlementService;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService
	) {
		super(ChatManagementEditor.ID, group, telemetryService, themeService, storageService);
		this.commandService = commandService;
		this.chatEntitlementService = chatEntitlementService;
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = DOM.append(parent, $('.ai-management-editor'));

		// Header spans across entire width
		this.renderHeader(this.container);

		// Create split view container
		const splitViewContainer = DOM.append(this.container, $('.split-view-container'));

		const sidebarView = DOM.append(splitViewContainer, $('.sidebar-view'));
		const sidebarContainer = DOM.append(sidebarView, $('.sidebar-container'));

		const contentsView = DOM.append(splitViewContainer, $('.contents-view'));
		this.contentsContainer = DOM.append(contentsView, $('.contents-container'));

		this.splitView = new SplitView(splitViewContainer, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		});

		this.renderSidebar(sidebarContainer);
		this.renderContents(this.contentsContainer);

		this.splitView.addView({
			onDidChange: Event.None,
			element: sidebarView,
			minimumSize: 150,
			maximumSize: 350,
			layout: (width, _, height) => {
				sidebarContainer.style.width = `${width}px`;
				if (this.sectionsList && height !== undefined) {
					this.sectionsList.layout(height, width);
				}
			}
		}, 200, undefined, true);

		this.splitView.addView({
			onDidChange: Event.None,
			element: contentsView,
			minimumSize: 550,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				contentsView.style.width = `${width}px`;
				if (height !== undefined) {
					this.layoutContents(width, height);
				}
			}
		}, Sizing.Distribute, undefined, true);

		this.updateStyles();

		// Update header data when quotas or entitlements change
		this.updateHeaderData();
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.updateHeaderData()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.updateHeaderData()));
	}

	override updateStyles(): void {
		const borderColor = this.theme.getColor(chatManagementSashBorder)!;
		this.splitView?.style({ separatorBorder: borderColor });
	}

	private renderSidebar(parent: HTMLElement): void {
		// Define sections
		this.sections = [
			{ id: CHAT_MANAGEMENT_SECTION_USAGE, label: localize('plan.usage', 'Usage') },
			{ id: CHAT_MANAGEMENT_SECTION_MODELS, label: localize('plan.models', 'Models') }
		];

		const delegate = new SectionItemDelegate();
		const renderer = new SectionItemRenderer();

		this.sectionsList = this._register(this.instantiationService.createInstance(
			WorkbenchList<SectionItem>,
			'ChatManagementSections',
			parent,
			delegate,
			[renderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: SectionItem) {
						return element.label;
					},
					getWidgetAriaLabel() {
						return localize('sectionsListAriaLabel', "Sections");
					}
				},
				openOnSingleClick: true,
				identityProvider: {
					getId(element: SectionItem) {
						return element.id;
					}
				}
			}
		));

		this.sectionsList.splice(0, this.sectionsList.length, this.sections);
		this.sectionsList.setSelection([0]);

		this._register(this.sectionsList.onDidChangeSelection(e => {
			if (e.elements.length > 0) {
				this.selectedSection = e.elements[0].id;
				this.renderSelectedSection();
			}
		}));
	}

	private renderHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.ai-management-header'));
		const headerTitleContainer = DOM.append(this.headerContainer, $('.header-title-container'));
		const headerTitleWrapper = DOM.append(headerTitleContainer, $('.header-title-wrapper'));

		// Copilot label
		const tile = DOM.append(headerTitleWrapper, $('.ai-management-editor-title'));
		tile.textContent = localize('plan.copilot', 'Copilot');

		// Plan badge
		this.planBadge = DOM.append(headerTitleWrapper, $('.plan-badge'));

		// Action button container in title
		const titleButtonContainer = DOM.append(headerTitleContainer, $('.header-upgrade-button-container'));
		this.actionButton = this._register(new Button(titleButtonContainer, { ...defaultButtonStyles }));
		this.actionButton.element.classList.add('header-upgrade-button');
		this.actionButton.element.style.display = 'none';
	}

	private renderContents(parent: HTMLElement): void {
		// Body container for widgets
		const bodyContainer = DOM.append(parent, $('.ai-management-body'));

		// Create widgets
		this.chatUsageWidget = this._register(this.instantiationService.createInstance(ChatUsageWidget));
		this.modelsWidget = this._register(this.instantiationService.createInstance(ChatModelsWidget));

		// Append widgets to body
		bodyContainer.appendChild(this.chatUsageWidget.element);
		bodyContainer.appendChild(this.modelsWidget.element);

		// Initially show only the selected section
		this.renderSelectedSection();
	}

	private renderSelectedSection(): void {
		// Hide all widgets
		this.chatUsageWidget.element.style.display = 'none';
		this.modelsWidget.element.style.display = 'none';

		// Show selected widget
		if (this.selectedSection === CHAT_MANAGEMENT_SECTION_USAGE) {
			this.chatUsageWidget.element.style.display = '';
		} else if (this.selectedSection === CHAT_MANAGEMENT_SECTION_MODELS) {
			this.modelsWidget.element.style.display = '';
		}

		// Trigger layout
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private layoutContents(width: number, height: number): void {
		if (!this.contentsContainer) {
			return;
		}

		if (this.selectedSection === CHAT_MANAGEMENT_SECTION_MODELS) {
			this.modelsWidget.layout(height - 30, width - 30);
		}
	}

	selectSection(sectionId: string): void {
		const index = this.sections.findIndex(s => s.id === sectionId);
		if (index >= 0) {
			this.sectionsList?.setFocus([index]);
			this.sectionsList?.setSelection([index]);
		}
	}

	private updateHeaderData(): void {
		const newUser = isNewUser(this.chatEntitlementService);
		const anonymousUser = this.chatEntitlementService.anonymous;
		const disabled = this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted;
		const signedOut = this.chatEntitlementService.entitlement === ChatEntitlement.Unknown;
		const isFreePlan = this.chatEntitlementService.entitlement === ChatEntitlement.Free;

		// Set plan name and toggle visibility based on plan type
		if (anonymousUser || isFreePlan) {
			if (anonymousUser) {
				// Hide badge for anonymous users, only show "Copilot" label
				this.planBadge.style.display = 'none';
			} else {
				// Show "Free" badge for free plan
				this.planBadge.style.display = '';
				this.planBadge.textContent = localize('plan.free', 'Free');
			}
		} else {
			this.planBadge.style.display = '';
			// Extract just the plan type (Pro, Pro+, Business, Enterprise)
			const planName = this.getCurrentPlanName();
			this.planBadge.textContent = planName.replace('Copilot ', '');
		}

		const shouldUpgrade = this.shouldShowUpgradeButton();

		// Configure action button
		if (newUser || signedOut || disabled || shouldUpgrade) {
			this.actionButton.element.style.display = '';

			let buttonLabel: string;
			let commandId: string;

			if (shouldUpgrade && !isFreePlan && !anonymousUser) {
				// Upgrade for paid plans
				if (this.chatEntitlementService.entitlement === ChatEntitlement.Pro) {
					buttonLabel = localize('plan.upgradeToProPlus', 'Upgrade to Copilot Pro+');
				} else {
					buttonLabel = localize('plan.upgradeToPro', 'Upgrade to Copilot Pro');
				}
				commandId = 'workbench.action.chat.upgradePlan';
			} else if (shouldUpgrade && (isFreePlan || anonymousUser)) {
				// Upgrade case for free plan
				buttonLabel = localize('upgradeToCopilotPro', 'Upgrade to Copilot Pro');
				commandId = 'workbench.action.chat.upgradePlan';
			} else if (newUser) {
				buttonLabel = localize('enableAIFeatures', "Use AI Features");
				commandId = newUser && anonymousUser ? 'workbench.action.chat.triggerSetupAnonymousWithoutDialog' : 'workbench.action.chat.triggerSetup';
			} else if (anonymousUser) {
				buttonLabel = localize('enableMoreAIFeatures', "Enable more AI Features");
				commandId = 'workbench.action.chat.triggerSetup';
			} else if (disabled) {
				buttonLabel = localize('enableCopilotButton', "Enable AI Features");
				commandId = 'workbench.action.chat.triggerSetup';
			} else {
				buttonLabel = localize('signInToUseAIFeatures', "Sign in to use AI Features");
				commandId = 'workbench.action.chat.triggerSetup';
			}

			this.actionButton.label = buttonLabel;
			this.actionButton.onDidClick(() => {
				this.commandService.executeCommand(commandId);
			});
		} else {
			this.actionButton.element.style.display = 'none';
		}
	}

	private getCurrentPlanName(): string {
		const entitlement = this.chatEntitlementService.entitlement;
		switch (entitlement) {
			case ChatEntitlement.Pro:
				return localize('plan.proName', 'Copilot Pro');
			case ChatEntitlement.ProPlus:
				return localize('plan.proPlusName', 'Copilot Pro+');
			case ChatEntitlement.Business:
				return localize('plan.businessName', 'Copilot Business');
			case ChatEntitlement.Enterprise:
				return localize('plan.enterpriseName', 'Copilot Enterprise');
			default:
				return localize('plan.freeName', 'Copilot Free');
		}
	}

	private shouldShowUpgradeButton(): boolean {
		const entitlement = this.chatEntitlementService.entitlement;
		return entitlement === ChatEntitlement.Available ||
			entitlement === ChatEntitlement.Free ||
			entitlement === ChatEntitlement.Pro;
	}

	override async setInput(input: ChatManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;

		if (this.container && this.splitView) {
			const headerHeight = this.headerContainer?.offsetHeight || 0;
			const splitViewHeight = dimension.height - headerHeight;
			this.splitView.layout(this.container.clientWidth, splitViewHeight);
			this.splitView.el.style.height = `${splitViewHeight}px`;
		}
	}

	override focus(): void {
		super.focus();
		this.sectionsList?.domFocus();
	}
}

class SectionItemDelegate implements IListVirtualDelegate<SectionItem> {
	getHeight(element: SectionItem) {
		return 22;
	}
	getTemplateId() { return 'sectionItem'; }
}

interface ISectionItemTemplateData {
	readonly label: HTMLElement;
}

class SectionItemRenderer {
	readonly templateId = 'sectionItem';

	renderTemplate(container: HTMLElement): ISectionItemTemplateData {
		container.classList.add('section-list-item');
		const label = DOM.append(container, $('.section-list-item-label'));
		return { label };
	}

	renderElement(element: SectionItem, index: number, templateData: ISectionItemTemplateData): void {
		templateData.label.textContent = element.label;
	}

	disposeTemplate(templateData: ISectionItemTemplateData): void {
	}
}
