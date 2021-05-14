/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, Dimension, EventHelper } from 'vs/base/browser/dom';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Action } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { debounce } from 'vs/base/common/decorators';
import { Iterable } from 'vs/base/common/iterator';
import { splitName } from 'vs/base/common/labels';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { Schemas } from 'vs/base/common/network';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ExtensionUntrustedWorkpaceSupportType } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPromptChoiceWithMenu, Severity } from 'vs/platform/notification/common/notification';
import { Link } from 'vs/platform/opener/browser/link';
import product from 'vs/platform/product/common/product';
import { getVirtualWorkspaceScheme } from 'vs/platform/remote/common/remoteHosts';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { buttonBackground, buttonSecondaryBackground, editorErrorForeground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachLinkStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorOptions, IEditorOpenContext } from 'vs/workbench/common/editor';
import { ChoiceAction } from 'vs/workbench/common/notifications';
import { debugIconStartForeground } from 'vs/workbench/contrib/debug/browser/debugColors';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { getInstalledExtensions, IExtensionStatus } from 'vs/workbench/contrib/extensions/common/extensionsUtils';
import { IWorkspaceTrustSettingChangeEvent, WorkspaceTrustSettingArrayRenderer, WorkspaceTrustTree, WorkspaceTrustTreeModel } from 'vs/workbench/contrib/workspace/browser/workspaceTrustTree';
import { filterSettingsRequireWorkspaceTrust, IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';

export const shieldIcon = registerCodicon('workspace-trust-icon', Codicon.shield);

const checkListIcon = registerCodicon('workspace-trusted-check-icon', Codicon.check);
const xListIcon = registerCodicon('workspace-trusted-x-icon', Codicon.x);

export class WorkspaceTrustEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.workspaceTrust';
	private rootElement!: HTMLElement;

	// Header Section
	private headerContainer!: HTMLElement;
	private headerTitleContainer!: HTMLElement;
	private headerTitleIcon!: HTMLElement;
	private headerTitleText!: HTMLElement;
	private headerDescription!: HTMLElement;

	private bodyScrollBar!: DomScrollableElement;

	// Affected Features Section
	private affectedFeaturesContainer!: HTMLElement;

	// Settings Section
	private configurationContainer!: HTMLElement;
	private trustSettingsTree!: WorkspaceTrustTree;
	private workspaceTrustSettingsTreeModel!: WorkspaceTrustTreeModel;


	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
	) { super(WorkspaceTrustEditor.ID, telemetryService, themeService, storageService); }

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = append(parent, $('.workspace-trust-editor', { tabindex: '-1' }));

		this.createHeaderElement(this.rootElement);

		const scrollableContent = $('.workspace-trust-editor-body');
		this.bodyScrollBar = this._register(new DomScrollableElement(scrollableContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
		}));

		append(this.rootElement, this.bodyScrollBar.getDomNode());

		this.createAffectedFeaturesElement(scrollableContent);
		this.createConfigurationElement(scrollableContent);

		this._register(attachStylerCallback(this.themeService, { debugIconStartForeground, editorErrorForeground, buttonBackground, buttonSecondaryBackground }, colors => {
			this.rootElement.style.setProperty('--workspace-trust-selected-color', colors.buttonBackground?.toString() || '');
			this.rootElement.style.setProperty('--workspace-trust-unselected-color', colors.buttonSecondaryBackground?.toString() || '');
			this.rootElement.style.setProperty('--workspace-trust-check-color', colors.debugIconStartForeground?.toString() || '');
			this.rootElement.style.setProperty('--workspace-trust-x-color', colors.editorErrorForeground?.toString() || '');
		}));
	}

	override async setInput(input: WorkspaceTrustEditorInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) { return; }

		this.registerListeners();
		this.render();
	}

	private registerListeners(): void {
		this._register(this.extensionWorkbenchService.onChange(() => this.render()));
		this._register(this.configurationService.onDidChangeRestrictedSettings(() => this.render()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.render()));
		this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this.render()));
	}

	private getHeaderContainerClass(trusted: boolean): string {
		if (trusted) {
			return 'workspace-trust-header workspace-trust-trusted';
		}

		return 'workspace-trust-header workspace-trust-untrusted';
	}

	private getHeaderTitleText(trusted: boolean): string {
		if (trusted) {
			switch (this.workspaceService.getWorkbenchState()) {
				case WorkbenchState.EMPTY:
					return localize('trustedHeaderWindow', "You trust this window");
				case WorkbenchState.FOLDER:
					return localize('trustedHeaderFolder', "You trust this folder");
				case WorkbenchState.WORKSPACE:
					return localize('trustedHeaderWorkspace', "You trust this workspace");
			}
		}

		return localize('untrustedHeader', "You are in Restricted Mode");
	}

	private getHeaderDescriptionText(trusted: boolean): string {
		if (trusted) {
			return localize('trustedDescription', "All features are enabled because trust has been granted to the workspace. [Learn more](https://aka.ms/vscode-workspace-trust).");
		}

		return localize('untrustedDescription', "{0} is in a restricted mode intended for safe code browsing. [Learn more](https://aka.ms/vscode-workspace-trust).", product.nameShort);
	}

	private getHeaderTitleIconClassNames(trusted: boolean): string[] {
		return shieldIcon.classNamesArray;
	}

	private getFeaturesHeaderText(trusted: boolean): [string, string] {
		let title: string = '';
		let subTitle: string = '';

		switch (this.workspaceService.getWorkbenchState()) {
			case WorkbenchState.EMPTY: {
				title = trusted ? localize('trustedWindow', "In a trusted window") : localize('untrustedWorkspace', "In Restricted Mode");
				subTitle = trusted ? localize('trustedWindowSubtitle', "You trust the authors of the files in the current window. All features are enabled:") :
					localize('untrustedWindowSubtitle', "You do not trust the authors of the files in the current window. The following features are disabled:");
				break;
			}
			case WorkbenchState.FOLDER: {
				title = trusted ? localize('trustedFolder', "In a trusted folder") : localize('untrustedWorkspace', "In Restricted Mode");
				subTitle = trusted ? localize('trustedFolderSubtitle', "You trust the authors of the files in the current folder. All features are enabled:") :
					localize('untrustedFolderSubtitle', "You do not trust the authors of the files in the current folder. The following features are disabled:");
				break;
			}
			case WorkbenchState.WORKSPACE: {
				title = trusted ? localize('trustedWorkspace', "In a trusted workspace") : localize('untrustedWorkspace', "In Restricted Mode");
				subTitle = trusted ? localize('trustedWorkspaceSubtitle', "You trust the authors of the files in the current workspace. All features are enabled:") :
					localize('untrustedWorkspaceSubtitle', "You do not trust the authors of the files in the current workspace. The following features are disabled:");
				break;
			}
		}

		return [title, subTitle];
	}

	private rendering = false;
	private rerenderDisposables: DisposableStore = this._register(new DisposableStore());
	@debounce(100)
	private async render() {
		if (this.rendering) {
			return;
		}

		this.rendering = true;
		this.rerenderDisposables.clear();

		const isWorkspaceTrusted = this.workspaceTrustManagementService.isWorkpaceTrusted();
		this.rootElement.classList.toggle('trusted', isWorkspaceTrusted);
		this.rootElement.classList.toggle('untrusted', !isWorkspaceTrusted);

		// Header Section
		this.headerTitleText.innerText = this.getHeaderTitleText(isWorkspaceTrusted);
		this.headerTitleIcon.className = 'workspace-trust-title-icon';
		this.headerTitleIcon.classList.add(...this.getHeaderTitleIconClassNames(isWorkspaceTrusted));
		this.headerDescription.innerText = '';

		const linkedText = parseLinkedText(this.getHeaderDescriptionText(isWorkspaceTrusted));
		const p = append(this.headerDescription, $('p'));
		for (const node of linkedText.nodes) {
			if (typeof node === 'string') {
				append(p, document.createTextNode(node));
			} else {
				const link = this.instantiationService.createInstance(Link, node, {});
				append(p, link.el);
				this.rerenderDisposables.add(link);
				this.rerenderDisposables.add(attachLinkStyler(link, this.themeService));
			}
		}

		this.headerContainer.className = this.getHeaderContainerClass(isWorkspaceTrusted);

		// Settings
		const settingsRequiringTrustedWorkspaceCount = filterSettingsRequireWorkspaceTrust(this.configurationService.restrictedSettings.default).length;

		// Features List
		const installedExtensions = await this.instantiationService.invokeFunction(getInstalledExtensions);
		const onDemandExtensionCount = this.getExtensionCountByUntrustedWorkspaceSupport(installedExtensions, 'limited');
		const onStartExtensionCount = this.getExtensionCountByUntrustedWorkspaceSupport(installedExtensions, false);

		this.renderAffectedFeatures(settingsRequiringTrustedWorkspaceCount, onDemandExtensionCount + onStartExtensionCount);

		// Configuration Tree
		this.workspaceTrustSettingsTreeModel.update(this.workspaceTrustManagementService.getTrustedFolders());
		this.trustSettingsTree.setChildren(null, Iterable.map(this.workspaceTrustSettingsTreeModel.settings, s => { return { element: s }; }));

		this.bodyScrollBar.getDomNode().style.height = `calc(100% - ${this.headerContainer.clientHeight}px)`;
		this.bodyScrollBar.scanDomNode();
		this.rendering = false;
	}

	private getExtensionCountByUntrustedWorkspaceSupport(extensions: IExtensionStatus[], trustRequestType: ExtensionUntrustedWorkpaceSupportType): number {
		const filtered = extensions.filter(ext => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.local.manifest) === trustRequestType);
		const set = new Set<string>();
		for (const ext of filtered) {
			const isVirtualWorkspace = getVirtualWorkspaceScheme(this.workspaceService.getWorkspace()) !== undefined;
			if (!isVirtualWorkspace || this.extensionManifestPropertiesService.canSupportVirtualWorkspace(ext.local.manifest)) {
				set.add(ext.identifier.id);
			}
		}

		return set.size;
	}

	private createHeaderElement(parent: HTMLElement): void {
		this.headerContainer = append(parent, $('.workspace-trust-header'));
		this.headerTitleContainer = append(this.headerContainer, $('.workspace-trust-title'));
		this.headerTitleIcon = append(this.headerTitleContainer, $('.workspace-trust-title-icon'));
		this.headerTitleText = append(this.headerTitleContainer, $('.workspace-trust-title-text'));
		this.headerDescription = append(this.headerContainer, $('.workspace-trust-description'));
	}

	private createConfigurationElement(parent: HTMLElement): void {
		this.configurationContainer = append(parent, $('.workspace-trust-settings.settings-editor'));

		const settingsBody = append(this.configurationContainer, $('.workspace-trust-settings-body.settings-body'));

		const workspaceTrustTreeContainer = append(settingsBody, $('.workspace-trust-settings-tree-container.settings-tree-container'));
		const renderer = this.instantiationService.createInstance(WorkspaceTrustSettingArrayRenderer,);

		this.trustSettingsTree = this._register(this.instantiationService.createInstance(WorkspaceTrustTree,
			workspaceTrustTreeContainer,
			[renderer]));

		this.workspaceTrustSettingsTreeModel = this.instantiationService.createInstance(WorkspaceTrustTreeModel);

		this._register(renderer.onDidChangeSetting(e => this.onDidChangeSetting(e)));
	}

	private createAffectedFeaturesElement(parent: HTMLElement): void {
		this.affectedFeaturesContainer = append(parent, $('.workspace-trust-features'));
	}

	private renderAffectedFeatures(numSettings: number, numExtensions: number): void {
		clearNode(this.affectedFeaturesContainer);
		const trustedContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-limitations.trusted'));
		const [trustedTitle, trustedSubTitle] = this.getFeaturesHeaderText(true);
		this.renderLimitationsHeaderElement(trustedContainer, trustedTitle, trustedSubTitle);
		this.renderLimitationsListElement(trustedContainer, [
			localize('trustedTasks', "Tasks are allowed to run"),
			localize('trustedDebugging', "Debugging is enabled"),
			localize('trustedSettings', "All workspace settings are applied"),
			localize('trustedExtensions', "All extensions are enabled")
		], checkListIcon.classNamesArray);

		const untrustedContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-limitations.untrusted'));
		const [untrustedTitle, untrustedSubTitle] = this.getFeaturesHeaderText(false);
		this.renderLimitationsHeaderElement(untrustedContainer, untrustedTitle, untrustedSubTitle);

		this.renderLimitationsListElement(untrustedContainer, [
			localize('untrustedTasks', "Tasks are disabled"),
			localize('untrustedDebugging', "Debugging is disabled"),
			numSettings ? localize('untrustedSettings', "[{0} workspace settings](command:{1}) are not applied", numSettings, 'settings.filterUntrusted') : localize('no untrustedSettings', "Workspace settings requiring trust are not applied"),
			localize('untrustedExtensions', "[{0} extensions](command:{1}) are disabled or have limited functionality", numExtensions, 'workbench.extensions.action.listWorkspaceUnsupportedExtensions')
		], xListIcon.classNamesArray);

		if (this.workspaceTrustManagementService.isWorkpaceTrusted()) {
			if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
				this.addDontTrustButtonToElement(untrustedContainer);
			} else {
				this.addTrustedTextToElement(untrustedContainer);
			}
		} else {
			if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
				this.addTrustButtonToElement(trustedContainer);
			}
		}
	}

	private createButton(parent: HTMLElement, action: Action, enabled?: boolean): void {
		const buttonRow = append(parent, $('.workspace-trust-buttons-row'));
		const buttonContainer = append(buttonRow, $('.workspace-trust-buttons'));
		const buttonBar = this.rerenderDisposables.add(new ButtonBar(buttonContainer));

		const button =
			action instanceof ChoiceAction && action.menu?.length ?
				buttonBar.addButtonWithDropdown({
					title: true,
					actions: action.menu ?? [],
					contextMenuProvider: this.contextMenuService
				}) :
				buttonBar.addButton();

		button.label = action.label;
		button.enabled = enabled !== undefined ? enabled : action.enabled;

		this.rerenderDisposables.add(button.onDidClick(e => {
			if (e) {
				EventHelper.stop(e, true);
			}

			action.run();
		}));

		this.rerenderDisposables.add(attachButtonStyler(button, this.themeService));
	}

	private addTrustButtonToElement(parent: HTMLElement): void {
		const trustUris = async (uris?: URI[]) => {
			if (!uris) {
				await this.workspaceTrustManagementService.setWorkspaceTrust(true);
			} else {
				await this.workspaceTrustManagementService.setUrisTrust(uris, true);
			}
		};

		const trustChoiceWithMenu: IPromptChoiceWithMenu = {
			isSecondary: false,
			label: localize('trustButton', "Trust"),
			menu: [],
			run: () => {
				trustUris();
			}
		};

		const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceService.getWorkspace());
		if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && workspaceIdentifier.uri.scheme === Schemas.file) {
			const { parentPath } = splitName(workspaceIdentifier.uri.fsPath);
			if (parentPath) {
				trustChoiceWithMenu.menu.push({
					label: localize('trustParentButton', "Trust All in Parent Folder"),
					run: () => {
						trustUris([URI.file(parentPath)]);
					}
				});
			}
		}

		const isWorkspaceTrusted = this.workspaceTrustManagementService.isWorkpaceTrusted();
		this.createButton(parent, new ChoiceAction('workspace.trust.button.action', trustChoiceWithMenu), !isWorkspaceTrusted);
	}

	private addDontTrustButtonToElement(parent: HTMLElement): void {
		this.createButton(parent, new Action('workspace.trust.button.action.deny', localize('dontTrustButton', "Don't Trust"), undefined, true, async () => {
			await this.workspaceTrustManagementService.setWorkspaceTrust(false);
		}));
	}

	private addTrustedTextToElement(parent: HTMLElement): void {
		if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		const textElement = append(parent, $('.workspace-trust-untrusted-description'));
		textElement.innerText = this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE ? localize('untrustedWorkspaceReason', "This workspace is trusted via one or more of the trusted folders below.") : localize('untrustedFolderReason', "This folder is trusted via one or more of the trusted folders below.");
	}

	private renderLimitationsHeaderElement(parent: HTMLElement, headerText: string, subtitleText: string): void {
		const limitationsHeaderContainer = append(parent, $('.workspace-trust-limitations-header'));
		const titleElement = append(limitationsHeaderContainer, $('.workspace-trust-limitations-title'));
		const textElement = append(titleElement, $('.workspace-trust-limitations-title-text'));
		const subtitleElement = append(limitationsHeaderContainer, $('.workspace-trust-limitations-subtitle'));

		textElement.innerText = headerText;
		subtitleElement.innerText = subtitleText;
	}

	private renderLimitationsListElement(parent: HTMLElement, limitations: string[], iconClassNames: string[]): void {
		const listContainer = append(parent, $('.workspace-trust-limitations-list-container'));
		const limitationsList = append(listContainer, $('ul'));
		for (const limitation of limitations) {
			const limitationListItem = append(limitationsList, $('li'));
			const icon = append(limitationListItem, $('.list-item-icon'));
			const text = append(limitationListItem, $('.list-item-text'));

			icon.classList.add(...iconClassNames);

			const linkedText = parseLinkedText(limitation);
			for (const node of linkedText.nodes) {
				if (typeof node === 'string') {
					append(text, document.createTextNode(node));
				} else {
					const link = this.instantiationService.createInstance(Link, node, {});
					append(text, link.el);
					this.rerenderDisposables.add(link);
					this.rerenderDisposables.add(attachLinkStyler(link, this.themeService));
				}
			}
		}
	}

	private onDidChangeSetting(change: IWorkspaceTrustSettingChangeEvent) {
		const applyChangesWithPrompt = async (showPrompt: boolean, applyChanges: () => void) => {
			if (showPrompt) {
				const message = localize('workspaceTrustSettingModificationMessage', "Update Workspace Trust Settings");
				const detail = localize('workspaceTrustTransitionDetail', "In order to safely complete this action, all affected windows will have to be reloaded. Are you sure you want to proceed with this action?");
				const primaryButton = localize('workspaceTrustTransitionPrimaryButton', "Yes");
				const secondaryButton = localize('workspaceTrustTransitionSecondaryButton', "No");

				const result = await this.dialogService.show(Severity.Info, message, [primaryButton, secondaryButton], { cancelId: 1, detail, custom: { icon: Codicon.shield } });
				if (result.choice !== 0) {
					return;
				}
			}

			applyChanges();
		};

		if (isArray(change.value)) {
			if (change.key === 'trustedFolders') {
				applyChangesWithPrompt(false, () => this.workspaceTrustManagementService.setTrustedFolders(change.value!));
			}
		}
	}

	private layoutParticipants: { layout: () => void; }[] = [];
	layout(dimension: Dimension): void {
		if (!this.isVisible()) {
			return;
		}

		this.trustSettingsTree.layout(dimension.height, dimension.width);

		this.layoutParticipants.forEach(participant => {
			participant.layout();
		});

		this.bodyScrollBar.scanDomNode();
	}
}
