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
import { ChatManagementEditorInput } from './chatManagementEditorInput.js';
import { ChatModelsWidget } from './chatModelsWidget.js';
import { Button, ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IChatEntitlementService, ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatUsageWidget } from './chatUsageWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';

const $ = DOM.$;

function isNewUser(chatEntitlementService: IChatEntitlementService): boolean {
	return !chatEntitlementService.sentiment.installed ||
		chatEntitlementService.entitlement === ChatEntitlement.Available;
}

export class ChatManagementEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.aiManagement';

	private rootElement!: HTMLElement;
	private headerContainer!: HTMLElement;
	private bodyContainer!: HTMLElement;

	private planBadge!: HTMLElement;
	private actionButton!: Button;

	private chatUsageWidget!: ChatUsageWidget;
	private modelsWidgetContainer!: HTMLElement;
	private modelsWidget!: ChatModelsWidget;

	private dimension: DOM.Dimension | undefined;
	private modelsWidgetWidth: number | undefined;
	private modelsWidgetHeight: number | undefined;
	private readonly sectionToggleStates: Map<string, boolean> = new Map();

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
		this.rootElement = DOM.append(parent, $('.ai-management-editor'));
		this.createHeader(this.rootElement);
		this.createBody(this.rootElement);

		// Render header after body is created so all elements are available
		this.renderHeader();

		// Update when quotas or entitlements change
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderHeader()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderHeader()));
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.ai-management-header'));

		// Header title
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
		this.actionButton.element.style.display = 'none'; // Hidden by default, shown in render
	}

	private createBody(parent: HTMLElement): void {
		this.bodyContainer = DOM.append(parent, $('.ai-management-body'));

		// Determine if usage should be expanded by default (for anonymous or free users)
		const anonymousUser = this.chatEntitlementService.anonymous;
		const isFreePlan = this.chatEntitlementService.entitlement === ChatEntitlement.Free;
		const expandUsageByDefault = anonymousUser || isFreePlan;

		// Create Chat Usage Widget
		this.chatUsageWidget = this._register(this.instantiationService.createInstance(ChatUsageWidget));
		this.createSection(
			this.bodyContainer,
			'usage',
			localize('plan.usage', 'Usage'),
			this.chatUsageWidget,
			true,
			!expandUsageByDefault // initialCollapsed: false for anon/free, true otherwise
		);

		// Create Models Widget
		this.modelsWidget = this._register(this.instantiationService.createInstance(ChatModelsWidget));
		this.modelsWidgetContainer = this.createSection(
			this.bodyContainer,
			'models',
			localize('plan.models', 'Models'),
			this.modelsWidget,
			false,
			false
		);

		// Listen to content height changes and trigger layout
		this._register(this.modelsWidget.onDidChangeContentHeight((height) => {
			this.modelsWidgetHeight = height;
			if (this.modelsWidgetWidth) {
				this.modelsWidget.layout(height, this.modelsWidgetWidth);
			}
		}));
	}

	private createSection(parent: HTMLElement, sectionId: string, title: string, widget: { element: HTMLElement }, collapsible: boolean, initialCollapsed: boolean): HTMLElement {
		const sectionContainer = DOM.append(parent, $('.ai-section.' + sectionId + '-section'));

		// Create section title
		const titleContainer = DOM.append(sectionContainer, $('.section-title-container'));

		// Add widget content container
		const contentContainer = DOM.append(sectionContainer, $('.section-content'));

		// Create fixed-width toggle button container for alignment
		const toggleButtonContainer = DOM.append(titleContainer, $('.toggle-button-container'));

		let toggleButton: ButtonWithIcon | undefined;

		if (collapsible) {
			// Initialize collapsed state with provided initial value
			const isCollapsed = this.sectionToggleStates.get(sectionId) ?? initialCollapsed;
			this.sectionToggleStates.set(sectionId, isCollapsed);

			const toggleVisibility = () => {
				const currentState = this.sectionToggleStates.get(sectionId) ?? true;
				const newState = !currentState;
				this.sectionToggleStates.set(sectionId, newState);

				if (toggleButton) {
					toggleButton.icon = newState ? Codicon.chevronRight : Codicon.chevronDown;
				}

				// Remove or add element from DOM based on state
				if (newState) {
					// Collapsed: remove element and hide container
					if (widget.element.parentElement) {
						widget.element.remove();
					}
					contentContainer.style.display = 'none';
				} else {
					// Expanded: add element and show container
					contentContainer.style.display = '';
					contentContainer.appendChild(widget.element);
				}
			};

			// Make the entire title container clickable for collapsible sections
			titleContainer.style.cursor = 'pointer';
			titleContainer.setAttribute('role', 'button');
			titleContainer.setAttribute('tabindex', '0');
			titleContainer.setAttribute('aria-label', localize('plan.toggleSection', 'Toggle {0}', title));
			titleContainer.classList.add('clickable');
			this._register(DOM.addDisposableListener(titleContainer, DOM.EventType.CLICK, toggleVisibility));
			this._register(DOM.addDisposableListener(titleContainer, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleVisibility();
				}
			}));

			// Add chevron button to the container
			toggleButton = this._register(new ButtonWithIcon(toggleButtonContainer, {}));
			toggleButton.icon = isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			toggleButton.element.classList.add('section-toggle-button');
			toggleButton.element.title = localize('plan.toggleSection', 'Toggle {0}', title);

		}

		const titleElement = DOM.append(titleContainer, $('.section-title'));
		titleElement.textContent = title;

		// Set initial visibility based on collapsed state
		if (collapsible) {
			const isCollapsed = this.sectionToggleStates.get(sectionId) ?? true;
			// Only add element to DOM if not collapsed
			if (!isCollapsed) {
				contentContainer.appendChild(widget.element);
			} else {
				contentContainer.style.display = 'none';
			}
		} else {
			// Add widget content for non-collapsible sections
			contentContainer.appendChild(widget.element);
		}

		return sectionContainer;
	}

	private renderHeader(): void {
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
			// Show usage by default for anonymous and free plan users
			// Override stored state to always show for these users
			if (this.chatUsageWidget) {
				this.sectionToggleStates.set('usage', false); // Ensure expanded
				const contentContainer = this.chatUsageWidget.element.parentElement;
				if (contentContainer) {
					contentContainer.style.display = '';
					if (!contentContainer.contains(this.chatUsageWidget.element)) {
						contentContainer.appendChild(this.chatUsageWidget.element);
					}
				}
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

	override layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		if (!this.rootElement) {
			return;
		}

		this.rootElement.style.width = `${dimension.width}px`;
		this.rootElement.style.height = `${dimension.height}px`;

		this.bodyContainer.style.height = `${dimension.height - 58}px`;
		this.modelsWidgetWidth = this.modelsWidgetContainer.clientWidth - 52;

		if (this.modelsWidget) {
			this.modelsWidget.layout(this.modelsWidgetHeight ?? 140, this.modelsWidgetWidth);
		}
	}

	override focus(): void {
		super.focus();
		if (this.headerContainer) {
			this.headerContainer.focus();
		}
	}
}
