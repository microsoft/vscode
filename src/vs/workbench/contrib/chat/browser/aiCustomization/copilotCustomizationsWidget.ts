/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { raceCancellationError } from '../../../../../base/common/async.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { IAgentExtensionInfo, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getCanvasDefinitionInstanceId, ICanvasContext, ICanvasContextService, ICanvasDefinition, isOpenableExtensionCanvasDefinition } from '../../../canvases/common/canvas.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IAICustomizationManagementSectionWidget } from './aiCustomizationManagementSectionRegistry.js';
import { createCustomizationCardPrimaryAction, CustomizationCardListController, trackCustomizationCardPrimaryActionFocus } from './customizationCardList.js';
import { ICopilotExtensionsService } from './copilotExtensionsService.js';

const $ = DOM.$;

export type CopilotCustomizationsWidgetKind = 'extensions' | 'canvases';

interface ICopilotCanvasItem {
	readonly context: ICanvasContext;
	readonly canvas: ICanvasDefinition;
}

type CopilotCustomizationItem =
	| { readonly kind: 'extension'; readonly extension: IAgentExtensionInfo }
	| { readonly kind: 'canvas'; readonly item: ICopilotCanvasItem };

export class CopilotCustomizationsWidget extends Disposable implements IAICustomizationManagementSectionWidget {
	readonly element: HTMLElement;

	private readonly searchInput: InputBox;
	private readonly refreshButton: Button;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly emptySubtext: HTMLElement;
	private readonly cardContainer: HTMLElement;
	private readonly cardContent: HTMLElement;
	private readonly cardScrollable: DomScrollableElement;
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly renderDisposables = this._register(new DisposableStore());

	private sessionResource: URI;
	private extensionInventory: IAgentExtensionInventory | undefined;
	private canvases: readonly ICopilotCanvasItem[] = [];
	private errorMessage: string | undefined;
	private visible = false;
	private loading = false;
	private requestSequence = 0;

	constructor(
		private readonly kind: CopilotCustomizationsWidgetKind,
		container: HTMLElement,
		@ICopilotExtensionsService private readonly extensionsService: ICopilotExtensionsService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@ICanvasContextService private readonly canvasContextService: ICanvasContextService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.sessionResource = this.harnessService.activeSessionResource.get();
		this.element = DOM.append(container, $('.mcp-list-widget.plugin-list-widget.copilot-customizations-widget'));

		const header = DOM.append(this.element, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = kind === 'extensions'
			? localize('copilotExtensions.title', "Extensions")
			: localize('copilotCanvases.title', "Canvases");
		DOM.append(header, $('p.section-title-description')).textContent = kind === 'extensions'
			? localize('copilotExtensions.description', "Manage executable Copilot extensions discovered from your profile and installed plugins.")
			: localize('copilotCanvases.description', "Review and open canvases registered for chats that are visible in this window.");

		const searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));
		const searchContainer = DOM.append(searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: kind === 'extensions'
				? localize('copilotExtensions.search', "Search extensions...")
				: localize('copilotCanvases.search', "Search canvases..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));

		const buttonContainer = DOM.append(searchAndButtonContainer, $('.list-add-button-container'));
		this.refreshButton = this._register(new Button(buttonContainer, { ...defaultButtonStyles, secondary: true, small: true, supportIcons: true }));
		this.refreshButton.element.classList.add('list-add-button');
		this.refreshButton.label = `$(${Codicon.refresh.id}) ${localize('copilotCustomizations.refresh', "Refresh")}`;
		this.refreshButton.setAriaLabel(kind === 'extensions'
			? localize('copilotExtensions.refreshLabel', "Refresh Copilot extensions")
			: localize('copilotCanvases.refreshLabel', "Refresh registered Copilot canvases"));
		this._register(this.refreshButton.onDidClick(() => void this.refresh(true)));

		this.emptyContainer = DOM.append(this.element, $('.mcp-empty-state'));
		this.emptyText = DOM.append(this.emptyContainer, $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		this.cardContainer = $('.plugin-card-container');
		this.cardScrollable = this._register(new DomScrollableElement(this.cardContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		const scrollableNode = this.cardScrollable.getDomNode();
		scrollableNode.classList.add('plugin-card-scrollable');
		this.element.appendChild(scrollableNode);
		this.cardContent = DOM.append(this.cardContainer, $('.plugin-card-scroll'));

		this._register(autorun(reader => {
			const sessionResource = this.harnessService.activeSessionResource.read(reader);
			if (isEqual(sessionResource, this.sessionResource)) {
				return;
			}
			this.sessionResource = sessionResource;
			this.extensionInventory = undefined;
			if (this.visible && this.kind === 'extensions') {
				void this.refresh(false);
			}
		}));
		this._register(this.extensionsService.onDidChange(() => {
			if (this.kind !== 'extensions') {
				return;
			}
			this.extensionInventory = undefined;
			if (this.visible) {
				void this.refresh(false);
			}
		}));
		this._register(autorun(reader => {
			for (const context of this.canvasContextService.contexts.read(reader)) {
				if (context.definitionProvider) {
					reader.store.add(context.definitionProvider.onDidChangeDefinitions(() => this.handleCanvasDefinitionsChanged()));
				}
			}
			this.canvases = [];
			if (this.visible && this.kind === 'canvases') {
				void this.refresh(false);
			}
		}));
		this.render();
	}

	layout(_dimension: DOM.Dimension): void {
		this.cardScrollable.scanDomNode();
	}

	focus(): void {
		this.searchInput.focus();
	}

	getAccessibilityContent(): string {
		const title = this.kind === 'extensions'
			? localize('copilotExtensions.title', "Extensions")
			: localize('copilotCanvases.title', "Canvases");
		const description = this.kind === 'extensions'
			? this.getExtensionModeDescription()
			: localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		const items = this.getFilteredItems();
		if (this.loading || this.errorMessage || items.length === 0) {
			return [title, description, this.emptyText.textContent, this.emptySubtext.textContent].filter(Boolean).join('\n\n');
		}
		return [
			title,
			description,
			...items.map(item => {
				if (item.kind === 'extension') {
					return localize(
						'copilotExtensions.accessibleItem',
						"{0}. {1}. {2}. Executable Copilot extension.",
						item.extension.name,
						item.extension.enabled ? localize('copilotExtensions.enabled', "Enabled") : localize('copilotExtensions.disabledStatus', "Disabled"),
						this.getExtensionSource(item.extension),
					);
				}
				return localize(
					'copilotCanvases.accessibleItem',
					"{0}. {1}. {2}. {3}",
					item.item.canvas.displayName,
					item.item.canvas.description,
					this.getCanvasSource(item.item.canvas),
					item.item.canvas.requiresInput ? localize('copilotCanvases.requiresInput', "Requires input") : localize('copilotCanvases.readyToOpen', "Ready to open"),
				);
			}),
		].join('\n\n');
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (!visible) {
			this.request.value?.cancel();
			return;
		}
		if (!this.loading && (this.kind === 'extensions' ? !this.extensionInventory : this.canvases.length === 0)) {
			void this.refresh(false);
		}
	}

	private handleCanvasDefinitionsChanged(): void {
		this.canvases = [];
		if (this.visible && this.kind === 'canvases') {
			void this.refresh(false);
		}
	}

	private async refresh(userInitiated: boolean): Promise<void> {
		const sequence = ++this.requestSequence;
		this.request.value?.cancel();
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = true;
		this.errorMessage = undefined;
		this.render();
		try {
			if (this.kind === 'extensions') {
				this.extensionInventory = await this.extensionsService.listExtensions(this.sessionResource, request.token);
			} else {
				this.canvases = await this.listVisibleCanvases(request.token);
			}
			if (sequence !== this.requestSequence || request.token.isCancellationRequested) {
				return;
			}
			if (userInitiated) {
				status(this.kind === 'extensions'
					? localize('copilotExtensions.refreshed', "Copilot extensions refreshed.")
					: localize('copilotCanvases.refreshed', "Copilot canvases refreshed."));
			}
		} catch (error) {
			if (sequence !== this.requestSequence || isCancellationError(error)) {
				return;
			}
			this.errorMessage = getErrorMessage(error);
			if (userInitiated) {
				this.notificationService.error(this.kind === 'extensions'
					? localize('copilotExtensions.refreshFailed', "Unable to refresh Copilot extensions. {0}", this.errorMessage)
					: localize('copilotCanvases.refreshFailed', "Unable to refresh Copilot canvases. {0}", this.errorMessage));
			}
		} finally {
			if (sequence === this.requestSequence) {
				this.loading = false;
				this.request.clear();
				this.render();
			}
		}
	}

	private async listVisibleCanvases(token: CancellationToken): Promise<readonly ICopilotCanvasItem[]> {
		const contexts = this.canvasContextService.contexts.get()
			.filter(context => context.definitionProvider && this.canvasContextService.isOwnerVisible(context.owner));
		const definitions = await Promise.all(contexts.map(async context => {
			const canvases = await raceCancellationError(context.definitionProvider!.listCanvases(), token);
			return canvases.map(canvas => ({ context, canvas }));
		}));
		return definitions.flat();
	}

	private render(): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.cardContent);
		const items = this.getFilteredItems();
		const showEmpty = this.loading || !!this.errorMessage || items.length === 0;
		this.emptyContainer.style.display = showEmpty ? '' : 'none';
		this.cardScrollable.getDomNode().style.display = showEmpty ? 'none' : '';
		this.refreshButton.enabled = !this.loading;
		this.element.setAttribute('aria-busy', String(this.loading));

		if (showEmpty) {
			this.renderEmptyState();
			return;
		}

		const section = DOM.append(this.cardContent, $('.plugin-card-section'));
		const sectionHeader = DOM.append(section, $('.plugin-card-section-header'));
		const sectionText = DOM.append(sectionHeader, $('.plugin-card-section-text'));
		DOM.append(sectionText, $('h3.plugin-card-section-title')).textContent = this.kind === 'extensions'
			? localize('copilotExtensions.installed', "Installed Extensions")
			: localize('copilotCanvases.available', "Available Canvases");
		DOM.append(sectionText, $('p.plugin-card-section-description')).textContent = this.kind === 'extensions'
			? this.getExtensionModeDescription()
			: localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		const grid = DOM.append(section, $('.plugin-card-grid.plugin-inventory-list'));
		const controller = this.renderDisposables.add(new CustomizationCardListController(
			grid,
			this.kind === 'extensions'
				? localize('copilotExtensions.listLabel', "Installed Copilot extensions")
				: localize('copilotCanvases.listLabel', "Available Copilot canvases"),
		));
		for (const item of items) {
			this.renderItem(grid, controller, item);
		}
		controller.finalize();
		this.cardScrollable.scanDomNode();
	}

	private renderEmptyState(): void {
		if (this.loading) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.loading', "Loading Extensions...")
				: localize('copilotCanvases.loading', "Loading Canvases...");
			this.emptySubtext.textContent = '';
			return;
		}
		if (this.errorMessage) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.unavailable', "Extensions Unavailable")
				: localize('copilotCanvases.unavailable', "Canvases Unavailable");
			this.emptySubtext.textContent = this.errorMessage;
			return;
		}
		if (this.kind === 'extensions' && this.extensionInventory?.mode === 'disabled') {
			this.emptyText.textContent = localize('copilotExtensions.disabled', "Extensions Are Disabled");
			this.emptySubtext.textContent = localize('copilotExtensions.disabledDescription', "The Copilot runtime is not loading extensions.");
			return;
		}
		if (this.searchInput.value.trim()) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.noMatches', "No Matching Extensions")
				: localize('copilotCanvases.noMatches', "No Matching Canvases");
			this.emptySubtext.textContent = localize('copilotCustomizations.noMatchesDescription', "Try a different search.");
			return;
		}
		this.emptyText.textContent = this.kind === 'extensions'
			? localize('copilotExtensions.empty', "No Extensions Found")
			: localize('copilotCanvases.empty', "No Canvases Found");
		this.emptySubtext.textContent = this.kind === 'extensions'
			? localize('copilotExtensions.emptyDescription', "Install a user extension or a plugin that contributes one, then refresh this page.")
			: localize('copilotCanvases.emptyDescription', "Open or resume a Copilot chat with Canvas support in this window.");
	}

	private renderItem(parent: HTMLElement, controller: CustomizationCardListController, item: CopilotCustomizationItem): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row'));
		const name = item.kind === 'extension' ? item.extension.name : item.item.canvas.displayName;
		const description = item.kind === 'extension'
			? localize('copilotExtensions.itemDescription', "Executable Copilot extension")
			: item.item.canvas.description;
		const source = item.kind === 'extension'
			? this.getExtensionSource(item.extension)
			: this.getCanvasSource(item.item.canvas);
		if (item.kind === 'extension' && !item.extension.enabled) {
			row.classList.add('disabled');
		}

		const canvasOpenable = item.kind === 'canvas' && isOpenableExtensionCanvasDefinition(item.item.canvas);
		const canvasManagementSection = item.kind === 'canvas' ? this.getCanvasManagementSection(item.item.canvas) : undefined;
		const canvasActionable = item.kind !== 'canvas' || canvasOpenable || canvasManagementSection !== undefined;
		const primaryAction = createCustomizationCardPrimaryAction(
			row,
			item.kind === 'extension'
				? item.extension.source === 'plugin'
					? localize('copilotExtensions.managePlugin', "Manage the plugin that provides extension {0}", name)
					: localize('copilotExtensions.open', "Open extension {0}", name)
				: canvasOpenable
					? localize('copilotCanvases.open', "Open canvas {0}", name)
					: canvasManagementSection
						? localize('copilotCanvases.manageProvider', "Manage the provider for canvas {0}", name)
						: localize('copilotCanvases.requiresInputLabel', "Canvas {0} requires input and must be opened from its chat", name),
		);
		if (!canvasActionable) {
			primaryAction.setAttribute('aria-disabled', 'true');
			primaryAction.style.cursor = 'default';
		}
		primaryAction.style.gap = 'var(--vscode-spacing-size120)';
		const icon = DOM.append(primaryAction, $('.codicon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(item.kind === 'extension' ? Codicon.extensions : Codicon.preview));
		icon.setAttribute('aria-hidden', 'true');
		icon.style.flexShrink = '0';
		const details = DOM.append(primaryAction, $('.plugin-list-item-details'));
		const nameRow = DOM.append(details, $('.plugin-list-item-name-row'));
		const nameElement = DOM.append(nameRow, $('.plugin-list-item-name'));
		nameElement.textContent = name;
		const statusElement = DOM.append(nameRow, $('.plugin-list-item-status'));
		if (item.kind === 'extension') {
			statusElement.textContent = item.extension.enabled
				? localize('copilotExtensions.enabled', "Enabled")
				: localize('copilotExtensions.disabledStatus', "Disabled");
			if (!item.extension.enabled) {
				statusElement.classList.add('disabled');
			}
		} else {
			statusElement.textContent = localize('copilotCanvases.canvasStatus', "Canvas");
		}
		const descriptionElement = DOM.append(details, $('.plugin-list-item-description'));
		descriptionElement.textContent = description;
		const sourceElement = DOM.append(details, $('.plugin-list-item-source'));
		sourceElement.textContent = source;
		if (item.kind === 'canvas' && item.item.canvas.requiresInput) {
			DOM.append(details, $('.plugin-list-item-metadata')).textContent = localize('copilotCanvases.requiresInput', "Requires input");
		}

		const actions: HTMLElement[] = [];
		if (item.kind === 'extension') {
			const actionContainer = DOM.append(row, $('.plugin-list-item-action'));
			actions.push(actionContainer);
			const actionButton = this.renderDisposables.add(new Button(actionContainer, { ...defaultButtonStyles, secondary: true, small: true }));
			actionButton.element.classList.add('plugin-list-item-install-button');
			const enabled = item.extension.enabled;
			actionButton.label = enabled ? localize('copilotExtensions.disable', "Disable") : localize('copilotExtensions.enable', "Enable");
			actionButton.enabled = this.extensionInventory?.mode === 'load_and_augment';
			actionButton.setAriaLabel(enabled
				? localize('copilotExtensions.disableLabel', "Disable extension {0}", name)
				: localize('copilotExtensions.enableLabel', "Enable extension {0}", name));
			if (!actionButton.enabled) {
				this.renderDisposables.add(this.hoverService.setupDelayedHover(actionButton.element, {
					content: this.extensionInventory?.mode === 'load_only'
						? localize('copilotExtensions.loadOnlyActionUnavailable', "This runtime loads extensions but does not allow changing their enablement.")
						: localize('copilotExtensions.disabledActionUnavailable', "Extension management is unavailable while extensions are disabled."),
				}));
			}
			this.renderDisposables.add(actionButton.onDidClick(() => void this.setExtensionEnabled(item.extension, !enabled)));
		} else if (canvasOpenable && canvasManagementSection) {
			const actionContainer = DOM.append(row, $('.plugin-list-item-action'));
			actions.push(actionContainer);
			const actionButton = this.renderDisposables.add(new Button(actionContainer, { ...defaultButtonStyles, secondary: true, small: true }));
			actionButton.element.classList.add('plugin-list-item-install-button');
			actionButton.label = localize('copilotCanvases.manage', "Manage Provider");
			actionButton.setAriaLabel(localize('copilotCanvases.manageLabel', "Manage the provider for canvas {0}", name));
			this.renderDisposables.add(actionButton.onDidClick(() => this.openCanvasProvider(item.item.canvas)));
		}

		if (canvasActionable) {
			this.renderDisposables.add(DOM.addDisposableListener(primaryAction, DOM.EventType.CLICK, () => {
				if (item.kind === 'extension') {
					if (item.extension.source === 'plugin') {
						this.openSection(AICustomizationManagementSection.Plugins);
					} else {
						void this.editorService.openEditor({ resource: item.extension.resource });
					}
				} else if (canvasOpenable) {
					void this.openCanvas(item.item);
				} else {
					this.openCanvasProvider(item.item.canvas);
				}
			}));
		}
		trackCustomizationCardPrimaryActionFocus(primaryAction, row, this.renderDisposables);
		this.renderDisposables.add(this.hoverService.setupDelayedHover(nameElement, { content: name }));
		this.renderDisposables.add(this.hoverService.setupDelayedHover(descriptionElement, { content: description }));
		this.renderDisposables.add(this.hoverService.setupDelayedHover(sourceElement, { content: source }));
		controller.addItem({ row, primaryAction, label: name, actions });
	}

	private async setExtensionEnabled(extension: IAgentExtensionInfo, enabled: boolean): Promise<void> {
		this.refreshButton.enabled = false;
		try {
			await this.extensionsService.setExtensionEnabled(this.sessionResource, extension.id, enabled);
			status(enabled
				? localize('copilotExtensions.enabledAnnouncement', "Enabled extension {0}.", extension.name)
				: localize('copilotExtensions.disabledAnnouncement', "Disabled extension {0}.", extension.name));
		} catch (error) {
			this.notificationService.error(enabled
				? localize('copilotExtensions.enableFailed', "Could not finish enabling extension {0}. {1}", extension.name, getErrorMessage(error))
				: localize('copilotExtensions.disableFailed', "Could not finish disabling extension {0}. {1}", extension.name, getErrorMessage(error)));
		}
	}

	private async openCanvas(item: ICopilotCanvasItem): Promise<void> {
		try {
			await item.context.definitionProvider!.openCanvas(item.canvas, getCanvasDefinitionInstanceId(item.canvas));
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.openFailed', "Unable to open canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error)));
		}
	}

	private openCanvasProvider(canvas: ICanvasDefinition): void {
		const section = this.getCanvasManagementSection(canvas);
		if (section) {
			this.openSection(section);
		}
	}

	private getCanvasManagementSection(canvas: ICanvasDefinition): AICustomizationManagementSection | undefined {
		switch (canvas.extensionSource) {
			case 'plugin': return AICustomizationManagementSection.Plugins;
			case 'user': return AICustomizationManagementSection.Extensions;
			default: return undefined;
		}
	}

	private openSection(section: AICustomizationManagementSection): void {
		void this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
			section,
			sessionResource: this.sessionResource,
		});
	}

	private getFilteredItems(): readonly CopilotCustomizationItem[] {
		const query = this.searchInput.value.trim().toLowerCase();
		const items: CopilotCustomizationItem[] = this.kind === 'extensions'
			? (this.extensionInventory?.extensions ?? []).map(extension => ({ kind: 'extension', extension }))
			: this.canvases.map(item => ({ kind: 'canvas', item }));
		return items
			.filter(item => {
				if (!query) {
					return true;
				}
				const values = item.kind === 'extension'
					? [item.extension.name, item.extension.id, item.extension.pluginName, this.getExtensionSource(item.extension)]
					: [item.item.canvas.displayName, item.item.canvas.description, item.item.canvas.canvasId, item.item.canvas.extensionId, item.item.canvas.extensionName, this.getCanvasSource(item.item.canvas)];
				return values.some(value => value?.toLowerCase().includes(query));
			})
			.sort((left, right) => {
				const leftName = left.kind === 'extension' ? left.extension.name : left.item.canvas.displayName;
				const rightName = right.kind === 'extension' ? right.extension.name : right.item.canvas.displayName;
				return leftName.localeCompare(rightName);
			});
	}

	private getExtensionModeDescription(): string {
		switch (this.extensionInventory?.mode) {
			case 'disabled':
				return localize('copilotExtensions.disabledInventoryDescription', "Extensions are installed but are not loaded by the active runtime.");
			case 'load_only':
				return localize('copilotExtensions.loadOnlyDescription', "Extensions are loaded by the runtime, but enablement changes are unavailable.");
			case 'load_and_augment':
				return localize('copilotExtensions.manageableDescription', "Preferences apply to future sessions and reconcile the selected live chat when available.");
			default:
				return localize('copilotExtensions.inventoryDescription', "Extensions are discovered from your profile and enabled installed plugins.");
		}
	}

	private getExtensionSource(extension: IAgentExtensionInfo): string {
		return extension.source === 'plugin'
			? extension.pluginName
				? localize('copilotExtensions.pluginSource', "Plugin: {0}", extension.pluginName)
				: localize('copilotExtensions.plugin', "Plugin Extension")
			: localize('copilotExtensions.user', "User Extension");
	}

	private getCanvasSource(canvas: ICanvasDefinition): string {
		const provider = canvas.extensionName ?? canvas.extensionId;
		switch (canvas.extensionSource) {
			case 'plugin': return localize('copilotCanvases.pluginSource', "Plugin: {0}", provider);
			case 'project': return localize('copilotCanvases.projectSource', "Project Extension: {0}", provider);
			case 'user': return localize('copilotCanvases.userSource', "User Extension: {0}", provider);
			case 'session': return localize('copilotCanvases.sessionSource', "Session Extension: {0}", provider);
			default: return localize('copilotCanvases.providerSource', "Provider: {0}", provider);
		}
	}
}
