/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, mapObservableArrayCached, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { IAgentExtensionInfo, IAgentExtensionInventory } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { canvasOwnerKey, getCanvasDefinitionInstanceId, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasService, isCanvasOwner, isOpenableExtensionCanvasDefinition } from '../../../canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../canvases/common/canvasDefinitionStore.js';
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

interface ICanvasRefreshBatch {
	readonly generation: number;
	readonly pendingOwnerKeys: Set<string>;
	errorMessage?: string;
}

interface ICanvasStoreLifetime {
	readonly ownerKey: string;
	disposed: boolean;
	request: object | undefined;
}

interface IFocusedCustomizationCard {
	readonly itemKey: string;
	readonly actionId: string;
}

class CopilotCustomizationsWidget extends Disposable implements IAICustomizationManagementSectionWidget {
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
	private readonly canvasRefreshGeneration = observableValue(this, 0);
	private readonly canvasVisibilityChanged = observableSignal(this);
	private readonly activeCanvasOwnerKeys = new Set<string>();
	private readonly loadingCanvasOwnerKeys = new Set<string>();
	private readonly canvasErrors = new Map<string, string>();
	private readonly canvasStoreLifetimes = new Map<string, ICanvasStoreLifetime>();
	private canvasRefreshBatch: ICanvasRefreshBatch | undefined;

	private sessionResource: URI;
	private extensionInventory: IAgentExtensionInventory | undefined;
	private canvases: readonly ICopilotCanvasItem[] = [];
	private errorMessage: string | undefined;
	private visible = false;
	private loading = false;
	private extensionMutationPending = false;
	private requestSequence = 0;

	protected constructor(
		private readonly kind: CopilotCustomizationsWidgetKind,
		container: HTMLElement,
		private readonly extensionsService: ICopilotExtensionsService | undefined,
		private readonly canvasContextService: ICanvasContextService | undefined,
		private readonly canvasService: ICanvasService | undefined,
		private readonly harnessService: ICustomizationHarnessService,
		contextViewService: IContextViewService,
		private readonly hoverService: IHoverService,
		private readonly notificationService: INotificationService,
		private readonly editorService: IEditorService,
		private readonly commandService: ICommandService,
		private readonly logService: ILogService,
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
		this._register(this.refreshButton.onDidClick(() => {
			if (this.kind === 'extensions') {
				void this.refreshExtensions(true);
			} else {
				this.refreshCanvases();
			}
		}));

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
				void this.refreshExtensions(false);
			}
		}));
		if (this.extensionsService) {
			this._register(this.extensionsService.onDidChange(() => {
				if (this.visible) {
					void this.refreshExtensions(false);
				} else {
					this.extensionInventory = undefined;
				}
			}));
		}

		const canvasContexts = this.canvasContextService;
		const canvasPresentationService = this.canvasService;
		const visibleCanvasContexts = derived(this, reader => {
			this.canvasVisibilityChanged.read(reader);
			if (this.kind !== 'canvases' || !this.visible || !canvasContexts || !canvasPresentationService?.enabled.read(reader)) {
				return [];
			}
			return canvasContexts.contexts.read(reader)
				.filter(context => context.definitionProvider && canvasContexts.isOwnerVisible(context.owner, reader));
		});
		const canvasStores = mapObservableArrayCached(this, visibleCanvasContexts, (context, store) => {
			const owner = context.owner;
			const ownerKey = canvasOwnerKey(owner);
			const lifetime: ICanvasStoreLifetime = { ownerKey, disposed: false, request: undefined };
			this.canvasStoreLifetimes.set(ownerKey, lifetime);
			store.add(toDisposable(() => {
				lifetime.disposed = true;
				if (this.canvasStoreLifetimes.get(ownerKey) === lifetime) {
					this.canvasStoreLifetimes.delete(ownerKey);
					this.loadingCanvasOwnerKeys.delete(ownerKey);
					this.canvasErrors.delete(ownerKey);
				}
			}));
			const definitions = store.add(new CanvasDefinitionStore(reader => {
				const refreshGeneration = this.canvasRefreshGeneration.read(reader);
				const current = canvasContexts?.contexts.read(reader)
					.find(candidate => isCanvasOwner(candidate.owner, owner));
				const definitionProvider = current?.definitionProvider;
				if (!current || !definitionProvider || !canvasContexts?.isOwnerVisible(current.owner, reader)) {
					return undefined;
				}
				observableSignalFromEvent(reader.store, definitionProvider.onDidChangeDefinitions).read(reader);
				return {
					owner: current.owner,
					includeDefinition: () => true,
					listCanvases: () => this.listCanvasDefinitions(lifetime, refreshGeneration, () => definitionProvider.listCanvases()),
				};
			}, `[CopilotCustomizationsWidget:${ownerKey}]`, this.logService)).definitions;
			return { owner, definitions };
		}, context => canvasOwnerKey(context.owner));
		const canvasItems = derived(this, reader => canvasStores.read(reader).flatMap(entry => {
			const context = canvasContexts?.contexts.read(reader)
				.find(candidate => isCanvasOwner(candidate.owner, entry.owner));
			return context
				? entry.definitions.read(reader).map(canvas => ({ context, canvas }))
				: [];
		}));
		this._register(autorun(reader => {
			const activeOwnerKeys = new Set(visibleCanvasContexts.read(reader).map(context => canvasOwnerKey(context.owner)));
			this.activeCanvasOwnerKeys.clear();
			for (const ownerKey of activeOwnerKeys) {
				this.activeCanvasOwnerKeys.add(ownerKey);
			}
			for (const ownerKey of this.loadingCanvasOwnerKeys) {
				if (!activeOwnerKeys.has(ownerKey)) {
					this.loadingCanvasOwnerKeys.delete(ownerKey);
				}
			}
			for (const ownerKey of this.canvasErrors.keys()) {
				if (!activeOwnerKeys.has(ownerKey)) {
					this.canvasErrors.delete(ownerKey);
				}
			}
			if (this.canvasRefreshBatch) {
				for (const ownerKey of this.canvasRefreshBatch.pendingOwnerKeys) {
					if (!activeOwnerKeys.has(ownerKey)) {
						this.canvasRefreshBatch.pendingOwnerKeys.delete(ownerKey);
					}
				}
				this.completeCanvasRefreshIfReady();
			}
			this.canvases = canvasItems.read(reader);
			if (this.kind === 'canvases') {
				this.render();
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

	override dispose(): void {
		this.request.value?.cancel();
		super.dispose();
	}

	getAccessibilityContent(): string {
		const title = this.kind === 'extensions'
			? localize('copilotExtensions.title', "Extensions")
			: localize('copilotCanvases.title', "Canvases");
		const description = this.kind === 'extensions'
			? this.getExtensionModeDescription()
			: localize('copilotCanvases.availableDescription', "Canvas availability follows the chats currently visible in this window.");
		const items = this.getFilteredItems();
		if (items.length === 0) {
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
		if (this.kind === 'canvases') {
			this.canvasVisibilityChanged.trigger(undefined);
			return;
		}
		if (!visible) {
			this.request.value?.cancel();
			return;
		}
		if (!this.loading && !this.extensionInventory) {
			void this.refreshExtensions(false);
		}
	}

	private refreshCanvases(): void {
		this.canvasErrors.clear();
		const generation = this.canvasRefreshGeneration.get() + 1;
		this.canvasRefreshBatch = {
			generation,
			pendingOwnerKeys: new Set(this.activeCanvasOwnerKeys),
		};
		this.canvasRefreshGeneration.set(generation, undefined);
		status(localize('copilotCanvases.refreshing', "Refreshing Copilot canvases."));
		this.completeCanvasRefreshIfReady();
		this.render();
	}

	private async refreshExtensions(userInitiated: boolean): Promise<void> {
		const extensionsService = this.extensionsService;
		if (!extensionsService) {
			return;
		}
		const sequence = ++this.requestSequence;
		this.request.value?.cancel();
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = true;
		this.errorMessage = undefined;
		this.render();
		try {
			const inventory = await extensionsService.listExtensions(this.sessionResource, request.token);
			if (this._store.isDisposed || sequence !== this.requestSequence || request.token.isCancellationRequested) {
				return;
			}
			this.extensionInventory = inventory;
			if (userInitiated) {
				status(localize('copilotExtensions.refreshed', "Copilot extensions refreshed."));
			}
		} catch (error) {
			if (this._store.isDisposed || sequence !== this.requestSequence || isCancellationError(error)) {
				return;
			}
			this.errorMessage = getErrorMessage(error);
			if (userInitiated) {
				this.notificationService.error(localize('copilotExtensions.refreshFailed', "Unable to refresh Copilot extensions. {0}", this.errorMessage));
			}
		} finally {
			if (!this._store.isDisposed && sequence === this.requestSequence) {
				this.loading = false;
				this.request.clear();
				this.render();
			}
		}
	}

	private async listCanvasDefinitions(lifetime: ICanvasStoreLifetime, refreshGeneration: number, listCanvases: () => Promise<readonly ICanvasDefinition[]>): Promise<readonly ICanvasDefinition[]> {
		const request = {};
		lifetime.request = request;
		const isCurrent = () => !this._store.isDisposed
			&& !lifetime.disposed
			&& lifetime.request === request
			&& this.canvasStoreLifetimes.get(lifetime.ownerKey) === lifetime;
		if (!isCurrent()) {
			return [];
		}
		const ownerKey = lifetime.ownerKey;
		this.loadingCanvasOwnerKeys.add(ownerKey);
		this.canvasErrors.delete(ownerKey);
		this.render();
		try {
			return await listCanvases();
		} catch (error) {
			if (isCurrent()) {
				const errorMessage = getErrorMessage(error);
				this.canvasErrors.set(ownerKey, errorMessage);
				if (this.canvasRefreshBatch?.generation === refreshGeneration) {
					this.canvasRefreshBatch.errorMessage ??= errorMessage;
				}
			}
			throw error;
		} finally {
			if (isCurrent()) {
				this.loadingCanvasOwnerKeys.delete(ownerKey);
				if (this.canvasRefreshBatch?.generation === refreshGeneration) {
					this.canvasRefreshBatch.pendingOwnerKeys.delete(ownerKey);
					this.completeCanvasRefreshIfReady();
				}
				this.render();
			}
		}
	}

	private completeCanvasRefreshIfReady(): void {
		const refresh = this.canvasRefreshBatch;
		if (!refresh || refresh.pendingOwnerKeys.size > 0) {
			return;
		}
		this.canvasRefreshBatch = undefined;
		if (refresh.errorMessage) {
			this.notificationService.error(localize('copilotCanvases.refreshFailed', "Unable to refresh Copilot canvases. {0}", refresh.errorMessage));
		} else {
			status(localize('copilotCanvases.refreshed', "Copilot canvases refreshed."));
		}
	}

	private render(): void {
		if (this._store.isDisposed) {
			return;
		}
		const focusedCard = this.captureFocusedCard();
		const focusTargets = new Map<string, HTMLElement>();
		this.renderDisposables.clear();
		DOM.clearNode(this.cardContent);
		const items = this.getFilteredItems();
		const loading = this.isBusy();
		const showEmpty = items.length === 0;
		this.emptyContainer.style.display = showEmpty ? '' : 'none';
		this.cardScrollable.getDomNode().style.display = showEmpty ? 'none' : '';
		this.refreshButton.enabled = !loading;
		this.element.setAttribute('aria-busy', String(loading));

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
			this.renderItem(grid, controller, item, focusTargets);
		}
		controller.finalize();
		this.cardScrollable.scanDomNode();
		this.restoreFocusedCard(focusedCard, focusTargets);
	}

	private renderEmptyState(): void {
		if (this.isEmptyLoading()) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.loading', "Loading Extensions...")
				: localize('copilotCanvases.loading', "Loading Canvases...");
			this.emptySubtext.textContent = '';
			return;
		}
		const errorMessage = this.getCurrentErrorMessage();
		if (errorMessage) {
			this.emptyText.textContent = this.kind === 'extensions'
				? localize('copilotExtensions.unavailable', "Extensions Unavailable")
				: localize('copilotCanvases.unavailable', "Canvases Unavailable");
			this.emptySubtext.textContent = errorMessage;
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

	private isBusy(): boolean {
		return this.kind === 'extensions' ? this.loading || this.extensionMutationPending : this.loadingCanvasOwnerKeys.size > 0;
	}

	private isEmptyLoading(): boolean {
		return this.isBusy() && (this.kind === 'extensions' || this.canvases.length === 0);
	}

	private getCurrentErrorMessage(): string | undefined {
		return this.kind === 'extensions'
			? this.errorMessage
			: this.canvases.length === 0
				? this.canvasErrors.values().next().value
				: undefined;
	}

	private renderItem(parent: HTMLElement, controller: CustomizationCardListController, item: CopilotCustomizationItem, focusTargets: Map<string, HTMLElement>): void {
		const row = DOM.append(parent, $('.plugin-list-item.plugin-home-row'));
		const itemKey = this.getItemKey(item);
		row.dataset.customizationKey = itemKey;
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
		this.registerFocusTarget(focusTargets, itemKey, 'primary', primaryAction);
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
			this.registerFocusTarget(focusTargets, itemKey, 'toggle', actionButton.element);
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
			this.registerFocusTarget(focusTargets, itemKey, 'manage', actionButton.element);
			actionButton.label = localize('copilotCanvases.manage', "Manage Provider");
			actionButton.setAriaLabel(localize('copilotCanvases.manageLabel', "Manage the provider for canvas {0}", name));
			this.renderDisposables.add(actionButton.onDidClick(() => this.openCanvasProvider(item.item)));
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
					this.openCanvasProvider(item.item);
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
		const extensionsService = this.extensionsService;
		if (!extensionsService || this.extensionMutationPending) {
			return;
		}
		this.extensionMutationPending = true;
		this.render();
		try {
			await extensionsService.setExtensionEnabled(this.sessionResource, extension.id, enabled);
			status(enabled
				? localize('copilotExtensions.enabledAnnouncement', "Enabled extension {0}.", extension.name)
				: localize('copilotExtensions.disabledAnnouncement', "Disabled extension {0}.", extension.name));
		} catch (error) {
			this.notificationService.error(enabled
				? localize('copilotExtensions.enableFailed', "Could not finish enabling extension {0}. {1}", extension.name, getErrorMessage(error))
				: localize('copilotExtensions.disableFailed', "Could not finish disabling extension {0}. {1}", extension.name, getErrorMessage(error)));
		} finally {
			this.extensionMutationPending = false;
			this.render();
		}
	}

	private async openCanvas(item: ICopilotCanvasItem): Promise<void> {
		const canvasService = this.canvasService;
		if (!canvasService?.enabled.get()) {
			return;
		}
		try {
			const instanceId = getCanvasDefinitionInstanceId(item.canvas);
			const existing = item.context.canvases.get()?.find(candidate => candidate.instanceId === instanceId);
			if (existing) {
				await canvasService.revealCanvas({ ...item.context.owner, canvas: existing.resource });
				if (existing.source) {
					return;
				}
			}
			await item.context.definitionProvider!.openCanvas(item.canvas, instanceId);
		} catch (error) {
			this.notificationService.error(localize('copilotCanvases.openFailed', "Unable to open canvas {0}. {1}", item.canvas.displayName, getErrorMessage(error)));
		}
	}

	private openCanvasProvider(item: ICopilotCanvasItem): void {
		const section = this.getCanvasManagementSection(item.canvas);
		if (section) {
			this.openSection(section, item.context.frontendSessionResource);
		}
	}

	private getCanvasManagementSection(canvas: ICanvasDefinition): AICustomizationManagementSection | undefined {
		switch (canvas.extensionSource) {
			case 'plugin': return AICustomizationManagementSection.Plugins;
			case 'user': return AICustomizationManagementSection.Extensions;
			default: return undefined;
		}
	}

	private openSection(section: AICustomizationManagementSection, sessionResource = this.sessionResource): void {
		void this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
			section,
			sessionResource,
		});
	}

	private getItemKey(item: CopilotCustomizationItem): string {
		return item.kind === 'extension'
			? `extension:${item.extension.id}`
			: `canvas:${canvasOwnerKey(item.item.context.owner)}\u0000${item.item.canvas.extensionId}\u0000${item.item.canvas.canvasId}`;
	}

	private registerFocusTarget(focusTargets: Map<string, HTMLElement>, itemKey: string, actionId: string, element: HTMLElement): void {
		element.dataset.customizationAction = actionId;
		focusTargets.set(`${itemKey}\u0000${actionId}`, element);
	}

	private captureFocusedCard(): IFocusedCustomizationCard | undefined {
		const activeElement = DOM.getActiveElement();
		if (!DOM.isHTMLElement(activeElement) || !this.cardContent.contains(activeElement)) {
			return undefined;
		}
		const row = activeElement.closest<HTMLElement>('[data-customization-key]');
		const action = activeElement.closest<HTMLElement>('[data-customization-action]');
		const itemKey = row?.dataset.customizationKey;
		const actionId = action?.dataset.customizationAction;
		return itemKey && actionId ? { itemKey, actionId } : undefined;
	}

	private restoreFocusedCard(focusedCard: IFocusedCustomizationCard | undefined, focusTargets: Map<string, HTMLElement>): void {
		if (!focusedCard) {
			return;
		}
		const activeElement = DOM.getActiveElement();
		const targetWindow = DOM.getWindow(this.element);
		if (DOM.isHTMLElement(activeElement) && activeElement.isConnected && activeElement !== targetWindow.document.body) {
			return;
		}
		focusTargets.get(`${focusedCard.itemKey}\u0000${focusedCard.actionId}`)?.focus();
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

export class CopilotExtensionsWidget extends CopilotCustomizationsWidget {

	constructor(
		container: HTMLElement,
		@ICopilotExtensionsService extensionsService: ICopilotExtensionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService notificationService: INotificationService,
		@IEditorService editorService: IEditorService,
		@ICommandService commandService: ICommandService,
		@ILogService logService: ILogService,
	) {
		super('extensions', container, extensionsService, undefined, undefined, harnessService, contextViewService, hoverService, notificationService, editorService, commandService, logService);
	}
}

export class CopilotCanvasesWidget extends CopilotCustomizationsWidget {

	constructor(
		container: HTMLElement,
		@ICanvasContextService canvasContextService: ICanvasContextService,
		@ICanvasService canvasService: ICanvasService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService notificationService: INotificationService,
		@IEditorService editorService: IEditorService,
		@ICommandService commandService: ICommandService,
		@ILogService logService: ILogService,
	) {
		super('canvases', container, undefined, canvasContextService, canvasService, harnessService, contextViewService, hoverService, notificationService, editorService, commandService, logService);
	}
}
