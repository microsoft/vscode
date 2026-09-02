/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { getErrorMessage, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { dirname as dirnamePath } from '../../../../../base/common/path.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox, TriStateCheckbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { isAgentHostTarget } from '../../common/chatSessionsService.js';
import { CustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigrationTargetFolders, IMigratedCustomization, IMigratedCustomizationsResult, migrateCustomizations } from './customizationMigration.js';
import { CustomizationMigrationCategoryId, ICustomizationMigrationBanner, ICustomizationMigrationCategory } from './customizationMigrationCategories.js';
import { ICustomizationMigrationCategorySummary } from './aiCustomizationWelcomePage.js';
import type { ICustomizationMigrationFlow } from './customizationMigrationWidget.js';

const $ = DOM.$;

interface IMigrationTargetQuickPickItem extends IQuickPickItem {
	readonly folder: ICustomizationSourceFolder;
}

export interface IFileCustomizationMigrationFlowDelegate {
	openFileCustomization(customization: MigratableConfiguration): Promise<void>;
	revealMigratedFiles(customizations: readonly IMigratedCustomization[]): Promise<void>;
}

export interface ICustomizationMigrationRunCoordinator {
	readonly inProgress: IObservable<boolean>;
	readonly writesInProgress: IObservable<boolean>;
	tryAcquire(): IDisposable | undefined;
	beginWrite(): IDisposable;
}

export class CustomizationMigrationRunCoordinator extends Disposable implements ICustomizationMigrationRunCoordinator {

	private readonly _inProgress = observableValue(this, false);
	readonly inProgress = this._inProgress;
	private readonly _writesInProgress = observableValue(this, false);
	readonly writesInProgress = this._writesInProgress;

	tryAcquire(): IDisposable | undefined {
		if (this._inProgress.get()) {
			return undefined;
		}

		this._inProgress.set(true, undefined);
		return toDisposable(() => this._inProgress.set(false, undefined));
	}

	beginWrite(): IDisposable {
		this._writesInProgress.set(true, undefined);
		return toDisposable(() => this._writesInProgress.set(false, undefined));
	}
}

export class FileCustomizationMigrationFlow extends Disposable implements ICustomizationMigrationFlow {

	readonly summary = observableValue<ICustomizationMigrationCategorySummary | undefined>(this, undefined);

	private listContainer: HTMLElement | undefined;
	private listScrollable: DomScrollableElement | undefined;
	private migrateButton: Button | undefined;
	private titleElement: HTMLElement | undefined;
	private descriptionElement: HTMLElement | undefined;
	private descriptionTextElement: HTMLElement | undefined;
	private bannerContainer: HTMLElement | undefined;
	private linkElement: HTMLAnchorElement | undefined;
	private selectedCountElement: HTMLElement | undefined;
	private firstFocusableElement: HTMLElement | undefined;
	private candidates: readonly MigratableConfiguration[] = [];
	private targetFoldersByType = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
	private selectedItems = new ResourceMap<Set<PromptsStorage>>();
	private refreshSequence = 0;
	private loading = false;
	private loadError: string | undefined;
	private readonly viewDisposables = this._register(new DisposableStore());
	private readonly pageDisposables = this._register(new DisposableStore());

	constructor(
		readonly category: ICustomizationMigrationCategory,
		private readonly delegate: IFileCustomizationMigrationFlowDelegate,
		private readonly runCoordinator: ICustomizationMigrationRunCoordinator,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICustomizationMigrationService private readonly customizationMigrationService: ICustomizationMigrationService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILabelService private readonly labelService: ILabelService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();
		this._register(autorun(reader => {
			this.runCoordinator.inProgress.read(reader);
			this.updateActionState();
		}));
	}

	get id(): CustomizationMigrationCategoryId {
		return this.category.id;
	}

	get backLabel(): string {
		return this.category.backLabel;
	}

	activate(container: HTMLElement): void {
		this.deactivate();
		DOM.clearNode(container);

		const header = DOM.append(container, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		this.titleElement = DOM.append(titleRow, $('h2.section-title'));
		this.descriptionElement = DOM.append(header, $('p.section-title-description'));
		this.descriptionTextElement = DOM.append(this.descriptionElement, $('span.section-title-description-text'));
		this.descriptionElement.appendChild(document.createTextNode(' '));
		this.linkElement = DOM.append(this.descriptionElement, $('a.section-title-link')) as HTMLAnchorElement;
		this.linkElement.classList.add('migration-learn-more-link');
		this.viewDisposables.add(DOM.addDisposableListener(this.linkElement, 'click', event => {
			event.preventDefault();
			void this.openerService.open(URI.parse(this.linkElement!.href));
		}));

		this.bannerContainer = DOM.append(container, $('.customization-migration-banner'));
		this.bannerContainer.style.display = 'none';

		this.listContainer = $('.prompt-migration-list.list-container');
		this.listScrollable = this.viewDisposables.add(new DomScrollableElement(this.listContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		const listScrollableNode = this.listScrollable.getDomNode();
		listScrollableNode.classList.add('prompt-migration-list-scrollable');
		container.appendChild(listScrollableNode);
		const targetWindow = DOM.getWindow(container);
		const resizeObserver = this.viewDisposables.add(new DOM.DisposableResizeObserver(
			'FileCustomizationMigrationFlow.listScrollable',
			() => this.listScrollable?.scanDomNode(),
			targetWindow,
		));
		this.viewDisposables.add(resizeObserver.observe(listScrollableNode));

		const footer = DOM.append(container, $('.prompt-migration-footer'));
		this.selectedCountElement = DOM.append(footer, $('span.prompt-migration-selected-count'));
		this.selectedCountElement.setAttribute('aria-live', 'polite');
		const actionButtonContainer = DOM.append(footer, $('.list-add-button-container'));
		this.migrateButton = this.viewDisposables.add(new Button(actionButtonContainer, defaultButtonStyles));
		this.migrateButton.element.classList.add('list-add-button', 'prompt-migration-button');
		this.viewDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.migrateButton.element, () => this.category.migrateButtonTooltip));
		this.viewDisposables.add(this.migrateButton.onDidClick(() => {
			const selectedCustomizations = this.getCandidates().filter(customization => this.isSelected(customization));
			void this.migrateSelectedCustomizations(selectedCustomizations);
		}));

		this.render();
	}

	deactivate(): void {
		this.pageDisposables.clear();
		this.viewDisposables.clear();
		this.listContainer = undefined;
		this.listScrollable = undefined;
		this.migrateButton = undefined;
		this.titleElement = undefined;
		this.descriptionElement = undefined;
		this.descriptionTextElement = undefined;
		this.bannerContainer = undefined;
		this.linkElement = undefined;
		this.selectedCountElement = undefined;
		this.firstFocusableElement = undefined;
	}

	isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(this.category.enablementSetting) === true;
	}

	async refresh(): Promise<void> {
		const activeHarnessId = this.harnessService.activeHarness.get();
		const activeSessionResource = this.harnessService.activeSessionResource.get();
		const refreshSequence = ++this.refreshSequence;
		this.loading = true;
		this.loadError = undefined;
		this.render();

		if (!this.isEnabled() || !isAgentHostTarget(activeHarnessId)) {
			this.loading = false;
			this.setCandidates([], new Map());
			return;
		}

		try {
			const migrationType = this.category.id === CustomizationMigrationCategoryId.PromptFiles
				? CustomizationMigrationType.PromptFiles
				: CustomizationMigrationType.UserData;
			const migration = await this.customizationMigrationService.computeMigration(activeSessionResource, migrationType);
			if (!this.isRefreshCurrent(refreshSequence, activeHarnessId, activeSessionResource)) {
				return;
			}

			const provider = this.harnessService.findHarnessById(activeHarnessId)?.itemProvider;
			const targetTypes = new Set(migration.candidates.map(getCustomizationMigrationTargetType));
			const targetFolderEntries = await Promise.all([...targetTypes].map(async targetType => {
				const folders = await provider?.provideSourceFolders?.(activeSessionResource, targetType, CancellationToken.None);
				return [targetType, folders ?? []] as const;
			}));
			if (!this.isRefreshCurrent(refreshSequence, activeHarnessId, activeSessionResource)) {
				return;
			}

			this.loading = false;
			this.setCandidates(migration.candidates, new Map(targetFolderEntries));
		} catch (error) {
			if (refreshSequence === this.refreshSequence) {
				this.loading = false;
				this.loadError = getErrorMessage(error);
				this.render();
			}
			onUnexpectedError(error);
		}
	}

	refreshFromPromptChange(): void {
		if (!this.runCoordinator.writesInProgress.get()) {
			void this.refresh();
		}
	}

	focus(): void {
		(this.firstFocusableElement ?? this.linkElement ?? this.migrateButton?.element)?.focus();
	}

	layout(): void {
		this.listScrollable?.scanDomNode();
	}

	async resolveTargetFolders(
		customizations: readonly MigratableConfiguration[],
		availableSourceFolders: ReadonlyMap<PromptsType, readonly ICustomizationSourceFolder[]>,
		sessionResource: URI,
	): Promise<CustomizationMigrationTargetFolders | undefined> {
		const requiredStorageByTargetType = new Map<PromptsType, Set<PromptsStorage>>();
		for (const customization of customizations) {
			const targetType = getCustomizationMigrationTargetType(customization);
			const storages = requiredStorageByTargetType.get(targetType) ?? new Set<PromptsStorage>();
			storages.add(customization.storage);
			requiredStorageByTargetType.set(targetType, storages);
		}

		const targetFolders = new Map<PromptsType, ReadonlyMap<PromptsStorage, ICustomizationSourceFolder>>();
		const selectedDestinationGroupIds = new Map<PromptsStorage, string>();
		for (const [targetType, requiredStorages] of requiredStorageByTargetType) {
			const availableFolders = availableSourceFolders.get(targetType) ?? [];
			if (!this.isSessionActive(sessionResource)) {
				return undefined;
			}
			const foldersByStorage = new Map<PromptsStorage, ICustomizationSourceFolder>();
			for (const storage of requiredStorages) {
				const matchingFolders = availableFolders.filter(folder => folder.source === storage);
				if (matchingFolders.length === 0) {
					this.notificationService.error(this.getMissingTargetFolderMessage(targetType, storage));
					return undefined;
				}

				const selectedDestinationGroupId = selectedDestinationGroupIds.get(storage);
				const foldersAtSelectedDestination = selectedDestinationGroupId
					? matchingFolders.filter(folder => folder.destinationGroupId === selectedDestinationGroupId)
					: [];
				let targetFolder: ICustomizationSourceFolder | undefined;
				if (foldersAtSelectedDestination.length === 1) {
					targetFolder = foldersAtSelectedDestination[0];
				} else if (matchingFolders.length === 1) {
					targetFolder = matchingFolders[0];
				} else {
					targetFolder = await this.pickTargetFolder(matchingFolders, targetType, requiredStorageByTargetType.size > 1);
					if (targetFolder?.destinationGroupId) {
						selectedDestinationGroupIds.set(storage, targetFolder.destinationGroupId);
					}
				}
				if (!targetFolder || !this.isSessionActive(sessionResource)) {
					return undefined;
				}
				foldersByStorage.set(storage, targetFolder);
			}
			targetFolders.set(targetType, foldersByStorage);
		}
		return targetFolders;
	}

	private isRefreshCurrent(refreshSequence: number, activeHarnessId: string, activeSessionResource: URI): boolean {
		return refreshSequence === this.refreshSequence
			&& activeHarnessId === this.harnessService.activeHarness.get()
			&& isEqual(activeSessionResource, this.harnessService.activeSessionResource.get());
	}

	private setCandidates(candidates: readonly MigratableConfiguration[], targetFoldersByType: Map<PromptsType, readonly ICustomizationSourceFolder[]>): void {
		const previousItems = this.createItemMap(this.candidates);
		const selectedItems = new ResourceMap<Set<PromptsStorage>>();
		for (const customization of candidates) {
			if (!this.hasItem(previousItems, customization) || this.isSelected(customization)) {
				this.addItem(selectedItems, customization);
			}
		}
		this.selectedItems = selectedItems;
		this.candidates = candidates;
		this.targetFoldersByType = targetFoldersByType;
		this.updateSummary();
		this.render();
	}

	private createItemMap(customizations: readonly MigratableConfiguration[]): ResourceMap<Set<PromptsStorage>> {
		const result = new ResourceMap<Set<PromptsStorage>>();
		for (const customization of customizations) {
			this.addItem(result, customization);
		}
		return result;
	}

	private hasItem(items: ResourceMap<Set<PromptsStorage>>, customization: MigratableConfiguration): boolean {
		return items.get(customization.uri)?.has(customization.storage) === true;
	}

	private addItem(items: ResourceMap<Set<PromptsStorage>>, customization: MigratableConfiguration): void {
		const storages = items.get(customization.uri) ?? new Set<PromptsStorage>();
		storages.add(customization.storage);
		items.set(customization.uri, storages);
	}

	private isSelected(customization: MigratableConfiguration): boolean {
		return this.hasItem(this.selectedItems, customization);
	}

	private setSelected(customization: MigratableConfiguration, selected: boolean): void {
		if (selected) {
			this.addItem(this.selectedItems, customization);
			return;
		}

		const storages = this.selectedItems.get(customization.uri);
		storages?.delete(customization.storage);
		if (storages?.size === 0) {
			this.selectedItems.delete(customization.uri);
		}
	}

	private getCandidates(): readonly MigratableConfiguration[] {
		return this.isEnabled() ? this.candidates : [];
	}

	private updateSummary(): void {
		const candidates = this.getCandidates();
		this.summary.set(candidates.length === 0 ? undefined : {
			id: this.category.id,
			label: this.category.cardLabel,
			description: this.category.getCardDescription(candidates, this.getActiveHarnessLabel()),
			actionLabel: this.category.cardActionLabel,
			actionAriaLabel: this.category.cardActionAriaLabel,
			count: candidates.length,
		}, undefined);
	}

	private getActiveHarnessLabel(): string {
		const label = this.harnessService.getActiveDescriptor().label;
		return label || (this.workspaceService.isSessionsWindow ? '' : localize('localHarnessLabel', "Local"));
	}

	private async migrateSelectedCustomizations(customizations: readonly MigratableConfiguration[]): Promise<void> {
		if (customizations.length === 0 || !this.isEnabled()) {
			return;
		}

		const runLock = this.runCoordinator.tryAcquire();
		if (!runLock) {
			return;
		}
		this.updateActionState();
		try {
			const sessionResource = this.harnessService.activeSessionResource.get();
			const targetFolders = await this.resolveTargetFolders(customizations, this.targetFoldersByType, sessionResource);
			if (!targetFolders || !this.isSessionActive(sessionResource)) {
				return;
			}

			const confirmation = this.category.getConfirmation(
				customizations,
				this.getActiveHarnessLabel(),
				this.getDestinationLabel([...targetFolders.values()].flatMap(foldersByStorage => [...foldersByStorage.values()])),
			);
			const confirmResult = await this.dialogService.confirm({
				type: 'question',
				message: confirmation.message,
				detail: confirmation.detail,
				checkbox: {
					label: confirmation.deleteOriginalsLabel,
					checked: true,
				},
				primaryButton: confirmation.primaryButton,
			});
			if (!confirmResult.confirmed || !this.isSessionActive(sessionResource)) {
				return;
			}

			const deleteOriginalFiles = confirmResult.checkboxChecked !== false;
			const migrationResult = await this.runMigration(customizations, targetFolders, deleteOriginalFiles);
			const { migratedCount, failedCustomizationFileNames, unsupportedHeaderKeys, migratedCustomizations } = migrationResult;

			if (failedCustomizationFileNames.length > 0) {
				const displayedFileNames = failedCustomizationFileNames.slice(0, 3);
				const hiddenFileCount = failedCustomizationFileNames.length - displayedFileNames.length;
				this.notificationService.error(this.category.getFailedMessage(displayedFileNames, hiddenFileCount));
			}

			if (migratedCount === 0) {
				if (failedCustomizationFileNames.length === 0) {
					this.notificationService.warn(this.category.noFilesMigratedMessage);
				}
				return;
			}

			if (deleteOriginalFiles) {
				await this.refresh();
			}

			const unsupportedKeysLabel = unsupportedHeaderKeys.join(', ');
			this.notificationService.info(unsupportedKeysLabel.length > 0 && this.category.getMigratedWithReviewMessage
				? this.category.getMigratedWithReviewMessage(migratedCount, unsupportedKeysLabel)
				: this.category.getMigratedMessage(migratedCount));

			if (deleteOriginalFiles) {
				void this.delegate.revealMigratedFiles(migratedCustomizations);
			}
		} finally {
			runLock.dispose();
			this.updateActionState();
		}
	}

	private async runMigration(customizations: readonly MigratableConfiguration[], targetFolders: CustomizationMigrationTargetFolders, deleteOriginalFiles: boolean): Promise<IMigratedCustomizationsResult> {
		const writeLock = this.runCoordinator.beginWrite();
		try {
			return await migrateCustomizations(customizations, targetFolders, this.fileService, onUnexpectedError, { deleteOriginalFiles });
		} finally {
			await timeout(0);
			writeLock.dispose();
		}
	}

	private render(): void {
		if (!this.listContainer || !this.migrateButton) {
			return;
		}

		this.pageDisposables.clear();
		DOM.clearNode(this.listContainer);
		this.firstFocusableElement = undefined;

		const candidates = this.getCandidates();
		this.updatePageHeader(candidates);

		if (this.loading) {
			this.renderState(
				localize('customizationMigrationLoading', "Loading customizations..."),
				localize('customizationMigrationLoadingDescription', "Checking the active harness and available destinations."),
			);
			this.migrateButton.enabled = false;
			return;
		}

		if (this.loadError) {
			this.renderState(
				localize('customizationMigrationLoadError', "Customizations could not be loaded"),
				localize('customizationMigrationLoadErrorDescription', "Check the active agent connection, then try again."),
				() => void this.refresh(),
			);
			this.migrateButton.enabled = false;
			return;
		}

		if (candidates.length === 0) {
			DOM.append(this.listContainer, $('p.prompt-migration-empty')).textContent = this.category.pageEmptyMessage;
			this.migrateButton.enabled = false;
			this.listScrollable?.scanDomNode();
			return;
		}

		const renderSelectionCheckbox = (row: HTMLElement, customization: MigratableConfiguration, onSelectionChange?: () => void): Checkbox => {
			const checkboxContainer = DOM.append(row, $('.item-sync-checkbox.prompt-migration-checkbox'));
			const checkboxTitle = localize('customizationMigrationSelectAriaLabel', "Select {0}", customization.name ?? basename(customization.uri));
			const checkbox = this.pageDisposables.add(new Checkbox(checkboxTitle, this.isSelected(customization), defaultCheckboxStyles));
			checkboxContainer.replaceChildren(checkbox.domNode);
			this.firstFocusableElement ??= checkbox.domNode;
			this.pageDisposables.add(checkbox.onChange(() => {
				this.setSelected(customization, checkbox.checked);
				this.updateActionState();
				onSelectionChange?.();
			}));
			return checkbox;
		};

		const renderItem = (container: HTMLElement, customization: MigratableConfiguration, onSelectionChange?: () => void): Checkbox => {
			const row = DOM.append(container, $('div.ai-customization-list-item.prompt-migration-item'));
			const checkbox = renderSelectionCheckbox(row, customization, onSelectionChange);

			const itemLeft = DOM.append(row, $('span.item-left'));
			const displayName = customization.name ?? basename(customization.uri);
			const relativePath = this.labelService.getUriLabel(customization.uri, { relative: true });
			const openButton = this.pageDisposables.add(new Button(itemLeft, {
				ariaLabel: localize('openCustomizationFile', "Open {0}, {1}", displayName, relativePath),
			}));
			openButton.label = displayName;
			DOM.clearNode(openButton.element);
			openButton.element.classList.add('item-text', 'prompt-migration-open-button');
			this.pageDisposables.add(openButton.onDidClick(() => this.delegate.openFileCustomization(customization)));
			const itemText = openButton.element;
			const nameRow = DOM.append(itemText, $('span.item-name-row'));
			DOM.append(nameRow, $('span.item-name.prompt-migration-item-name')).textContent = displayName;
			DOM.append(itemText, $('span.item-description.is-filename.prompt-migration-item-path')).textContent = relativePath;

			const itemRight = DOM.append(row, $('span.item-right'));
			const moreButton = DOM.append(itemRight, $('button.icon-button.prompt-migration-more-action', {
				type: 'button',
				'aria-label': localize('customizationMigrationMoreActions', "More actions for {0}", customization.name ?? basename(customization.uri)),
			})) as HTMLButtonElement;
			moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));
			this.pageDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), moreButton, localize('moreActions', "More Actions")));
			this.pageDisposables.add(DOM.addDisposableListener(moreButton, 'click', event => {
				event.stopPropagation();
				const actions = new DisposableStore();
				const deleteAction = actions.add(new Action(
					'customizationMigration.delete',
					localize('delete', "Delete"),
					ThemeIcon.asClassName(Codicon.trash),
					true,
					() => this.deleteCustomizationFile(customization),
				));
				this.contextMenuService.showContextMenu({
					getAnchor: () => moreButton,
					getActions: () => [deleteAction],
					onHide: () => actions.dispose(),
				});
			}));
			return checkbox;
		};

		const renderGroup = (groupKey: string, groupLabel: string, customizations: readonly MigratableConfiguration[]): void => {
			const group = DOM.append(this.listContainer!, $('.prompt-migration-group'));
			const groupHeader = DOM.append(group, $('.prompt-migration-group-header'));
			const groupHeading = DOM.append(groupHeader, $('.prompt-migration-group-heading'));
			DOM.append(groupHeading, $('h3.prompt-migration-group-title')).textContent = groupLabel;
			if (customizations.length === 0) {
				DOM.append(groupHeading, $('span.prompt-migration-group-count')).textContent = '0';
				const emptyItems = DOM.append(group, $('.prompt-migration-group-items'));
				DOM.append(emptyItems, $('.plugin-inventory-empty.prompt-migration-group-empty')).textContent = localize(
					'customizationMigrationGroupEmpty',
					"No customizations are available to migrate from {0}.",
					groupLabel,
				);
				return;
			}
			const selectedInGroup = customizations.filter(customization => this.isSelected(customization)).length;
			const initialGroupState: boolean | 'mixed' = selectedInGroup === customizations.length ? true : selectedInGroup === 0 ? false : 'mixed';
			const groupCheckboxAriaLabel = localize('customizationMigrationSelectGroupAriaLabel', "Select all customizations in {0}", groupLabel);
			const groupCheckbox = this.pageDisposables.add(new TriStateCheckbox(groupCheckboxAriaLabel, initialGroupState, defaultCheckboxStyles));
			DOM.append(groupHeading, $('span.prompt-migration-group-count')).textContent = String(customizations.length);
			const groupControls = DOM.append(groupHeader, $('.prompt-migration-group-controls'));
			const groupCheckboxContainer = DOM.append(groupControls, $('.item-sync-checkbox.prompt-migration-group-checkbox'));
			groupCheckboxContainer.replaceChildren(groupCheckbox.domNode);
			this.firstFocusableElement ??= groupCheckbox.domNode;
			const selectAllLabel = DOM.append(groupControls, $('span.prompt-migration-select-all-label'));
			selectAllLabel.textContent = localize('customizationMigrationSelectAll', "Select all");
			const setGroupCheckboxState = (state: boolean | 'mixed'): void => {
				groupCheckbox.checked = state;
				groupCheckbox.domNode.setAttribute('aria-checked', String(state));
			};
			setGroupCheckboxState(initialGroupState);
			const itemCheckboxes: Checkbox[] = [];
			const setGroupSelection = (selected: boolean): void => {
				for (const customization of customizations) {
					this.setSelected(customization, selected);
				}
				for (const itemCheckbox of itemCheckboxes) {
					itemCheckbox.checked = selected;
				}
				this.updateActionState();
			};
			this.pageDisposables.add(groupCheckbox.onChange(() => setGroupSelection(groupCheckbox.checked === true)));
			this.pageDisposables.add(DOM.addDisposableListener(selectAllLabel, 'click', event => {
				DOM.EventHelper.stop(event, true);
				const selected = groupCheckbox.checked !== true;
				setGroupCheckboxState(selected);
				setGroupSelection(selected);
				groupCheckbox.focus();
			}));
			const updateGroupCheckboxState = (): void => {
				const selectedCount = customizations.filter(customization => this.isSelected(customization)).length;
				setGroupCheckboxState(selectedCount === customizations.length ? true : selectedCount === 0 ? false : 'mixed');
			};
			const groupItems = DOM.append(group, $('.prompt-migration-group-items'));
			groupItems.id = `prompt-migration-group-${this.category.id}-${groupKey}-items`;

			for (const customization of customizations) {
				itemCheckboxes.push(renderItem(groupItems, customization, updateGroupCheckboxState));
			}
		};

		const groups = this.category.group(candidates);
		const groupedUris = new ResourceSet();
		for (const group of groups) {
			for (const customization of group.customizations) {
				groupedUris.add(customization.uri);
			}
			renderGroup(group.key, group.label, group.customizations);
		}

		for (const customization of candidates.filter(item => !groupedUris.has(item.uri))) {
			renderItem(this.listContainer, customization);
		}

		this.updateActionState();
		this.listScrollable?.scanDomNode();
	}

	private renderState(title: string, description: string, retry?: () => void): void {
		const state = DOM.append(this.listContainer!, $('.plugin-inventory-empty.prompt-migration-state'));
		DOM.append(state, $('strong.prompt-migration-state-title')).textContent = title;
		DOM.append(state, $('span.prompt-migration-state-description')).textContent = description;
		if (retry) {
			const retryButton = this.pageDisposables.add(new Button(state, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('retryCustomizationMigration', "Retry loading customizations") }));
			retryButton.label = localize('retry', "Retry");
			this.firstFocusableElement ??= retryButton.element;
			this.pageDisposables.add(retryButton.onDidClick(retry));
		}
		this.listScrollable?.scanDomNode();
	}

	private updatePageHeader(candidates: readonly MigratableConfiguration[]): void {
		if (this.titleElement) {
			this.titleElement.textContent = this.category.pageTitle;
		}

		const banner = candidates.length > 0
			? this.category.getBanner?.(
				candidates,
				this.getActiveHarnessLabel(),
				this.getDestinationLabel(candidates.flatMap(customization => {
					const targetType = getCustomizationMigrationTargetType(customization);
					return this.targetFoldersByType.get(targetType)?.filter(folder => folder.source === customization.storage) ?? [];
				})),
			)
			: undefined;
		this.renderBanner(banner);
		if (this.descriptionElement) {
			const description = banner ? '' : this.category.getPageDescription(candidates, this.getActiveHarnessLabel());
			if (this.descriptionTextElement) {
				this.descriptionTextElement.textContent = description;
			} else {
				this.descriptionElement.textContent = description;
			}
			this.descriptionElement.style.display = banner ? 'none' : '';
		}

		if (this.linkElement) {
			this.linkElement.textContent = this.category.pageLinkLabel;
			this.linkElement.href = this.category.pageLinkUrl;
		}
	}

	private renderBanner(banner: ICustomizationMigrationBanner | undefined): void {
		if (!this.bannerContainer) {
			return;
		}

		DOM.clearNode(this.bannerContainer);
		if (!banner) {
			if (this.linkElement && this.descriptionElement) {
				this.descriptionElement.appendChild(this.linkElement);
			}
			this.bannerContainer.style.display = 'none';
			return;
		}

		this.bannerContainer.style.display = '';
		const content = DOM.append(this.bannerContainer, $('.customization-migration-banner-content'));
		DOM.append(content, $('p.customization-migration-banner-message')).textContent = banner.message;
		if (banner.consequence) {
			DOM.append(content, $('p.customization-migration-banner-consequence')).textContent = banner.consequence;
		}
		if (this.linkElement) {
			content.appendChild(this.linkElement);
		}
	}

	private updateActionState(): void {
		if (!this.migrateButton) {
			return;
		}
		const selectedCount = this.getCandidates().filter(customization => this.isSelected(customization)).length;
		this.migrateButton.enabled = selectedCount > 0 && !this.runCoordinator.inProgress.get();
		if (this.selectedCountElement) {
			this.selectedCountElement.textContent = selectedCount === 1
				? localize('customizationMigrationOneSelected', "1 selected")
				: localize('customizationMigrationSelectedCount', "{0} selected", selectedCount);
		}
		if (this.category.id === CustomizationMigrationCategoryId.PromptFiles) {
			this.migrateButton.label = selectedCount > 0
				? localize('customizationMigrationConvertWithCount', "Convert {0} to Skills", selectedCount)
				: localize('customizationMigrationConvert', "Convert to Skills");
		} else {
			this.migrateButton.label = selectedCount > 0
				? localize('customizationMigrationPageButtonWithCount', "Migrate {0}", selectedCount)
				: localize('customizationMigrationPageButton', "Migrate");
		}
	}

	private async deleteCustomizationFile(customization: MigratableConfiguration): Promise<void> {
		const fileName = customization.name ?? basename(customization.uri);
		const confirmation = await this.dialogService.confirm({
			message: localize('confirmDeleteCustomizationFile', "Are you sure you want to delete '{0}'?", fileName),
			detail: localize('confirmDeleteDetail', "This action cannot be undone."),
			primaryButton: localize('delete', "Delete"),
			type: 'warning',
		});
		if (!confirmation.confirmed) {
			return;
		}

		const useTrash = this.fileService.hasCapability(customization.uri, FileSystemProviderCapabilities.Trash);
		await this.fileService.del(customization.uri, { useTrash });
		if (customization.storage === PromptsStorage.local) {
			const projectRoot = this.workspaceService.getActiveProjectRoot();
			if (projectRoot) {
				await this.workspaceService.deleteFiles(projectRoot, [customization.uri]);
			}
		}

		this.setCandidates(this.candidates.filter(item => !isEqual(item.uri, customization.uri)), this.targetFoldersByType);
	}

	private isSessionActive(sessionResource: URI): boolean {
		return isEqual(sessionResource, this.harnessService.activeSessionResource.get());
	}

	private getMissingTargetFolderMessage(targetType: PromptsType, storage: PromptsStorage): string {
		if (storage === PromptsStorage.local) {
			switch (targetType) {
				case PromptsType.skill:
					return localize('migrationNoWorkspaceSkillFolder', "No workspace skills folder is configured for the active harness.");
				case PromptsType.agent:
					return localize('migrationNoWorkspaceAgentFolder', "No workspace agents folder is configured for the active harness.");
				default:
					return localize('migrationNoWorkspaceInstructionsFolder', "No workspace instructions folder is configured for the active harness.");
			}
		}
		switch (targetType) {
			case PromptsType.skill:
				return localize('migrationNoGlobalSkillFolder', "No global skills folder is configured for the active harness.");
			case PromptsType.agent:
				return localize('migrationNoGlobalAgentFolder', "No global agents folder is configured for the active harness.");
			default:
				return localize('migrationNoGlobalInstructionsFolder', "No global instructions folder is configured for the active harness.");
		}
	}

	private async pickTargetFolder(sourceFolders: readonly ICustomizationSourceFolder[], targetType: PromptsType, selectsMultipleTypes: boolean): Promise<ICustomizationSourceFolder | undefined> {
		const picks: IMigrationTargetQuickPickItem[] = sourceFolders.map(folder => ({
			label: folder.label,
			description: this.labelService.getUriLabel(folder.uri, { relative: true }),
			folder,
		}));
		const selected = await this.quickInputService.pick(picks, {
			canPickMany: false,
			placeHolder: this.getTargetFolderPlaceholder(targetType, selectsMultipleTypes),
			matchOnDescription: true,
		});
		return selected?.folder;
	}

	private getTargetFolderPlaceholder(targetType: PromptsType, selectsMultipleTypes: boolean): string {
		if (selectsMultipleTypes) {
			return localize('migrationPickCustomizationFolder', "Select a destination for the migrated customizations");
		}
		switch (targetType) {
			case PromptsType.skill:
				return localize('migrationPickSkillFolder', "Select a destination folder for migrated skills");
			case PromptsType.agent:
				return localize('migrationPickAgentFolder', "Select a destination folder for migrated agents");
			default:
				return localize('migrationPickInstructionsFolder', "Select a destination folder for migrated instructions");
		}
	}

	private getDestinationLabel(folders: readonly ICustomizationSourceFolder[]): string | undefined {
		const seen = new ResourceSet();
		const uniqueFolders = folders.filter(folder => {
			if (seen.has(folder.uri)) {
				return false;
			}
			seen.add(folder.uri);
			return true;
		});
		if (uniqueFolders.length === 0) {
			return undefined;
		}

		const commonLabel = uniqueFolders[0].label;
		if (commonLabel && uniqueFolders.every(folder => folder.label === commonLabel)) {
			return commonLabel;
		}

		const labelParent = dirnamePath(uniqueFolders[0].label);
		if (labelParent !== '.' && uniqueFolders.every(folder => dirnamePath(folder.label) === labelParent)) {
			return labelParent;
		}

		let destination = uniqueFolders[0].uri;
		if (uniqueFolders.length > 1) {
			const commonParent = dirname(destination);
			if (!uniqueFolders.every(folder => isEqual(dirname(folder.uri), commonParent))) {
				return undefined;
			}
			destination = commonParent;
		}
		return this.labelService.getUriLabel(destination);
	}
}
