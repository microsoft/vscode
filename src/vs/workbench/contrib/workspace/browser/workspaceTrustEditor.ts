/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, Dimension, EventHelper } from 'vs/base/browser/dom';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Action } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { debounce } from 'vs/base/common/decorators';
import { Iterable } from 'vs/base/common/iterator';
import { splitName } from 'vs/base/common/labels';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { Schemas } from 'vs/base/common/network';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ExtensionWorkspaceTrustRequestType, getExtensionWorkspaceTrustRequestType } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPromptChoiceWithMenu } from 'vs/platform/notification/common/notification';
import { Link } from 'vs/platform/opener/browser/link';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachLinkStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorOptions, IEditorOpenContext } from 'vs/workbench/common/editor';
import { ChoiceAction } from 'vs/workbench/common/notifications';
import { Delegate } from 'vs/workbench/contrib/extensions/browser/extensionsList';
import { ExtensionsGridView, getExtensions } from 'vs/workbench/contrib/extensions/browser/extensionsViewer';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { getInstalledExtensions, IExtensionStatus } from 'vs/workbench/contrib/extensions/common/extensionsUtils';
import { trustedForegroundColor, trustEditorTileBackgroundColor, untrustedForegroundColor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustColors';
import { IWorkspaceTrustSettingChangeEvent, WorkspaceTrustSettingArrayRenderer, WorkspaceTrustTree, WorkspaceTrustTreeModel } from 'vs/workbench/contrib/workspace/browser/workspaceTrustTree';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustEditorModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

const untrustedIcon = registerCodicon('workspace-untrusted-icon', Codicon.workspaceUntrusted);
const trustedIcon = registerCodicon('workspace-trusted-icon', Codicon.workspaceTrusted);
const unspecified = registerCodicon('workspace-unspecified-icon', Codicon.workspaceUnspecified);

class WorkspaceTrustExtensionDelegate extends Delegate {
	override getHeight() { return super.getHeight() + 36; }
}

export class WorkspaceTrustEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.workspaceTrust';
	private rootElement!: HTMLElement;

	// Header Section
	private headerContainer!: HTMLElement;
	private headerTitleContainer!: HTMLElement;
	private headerTitleIcon!: HTMLElement;
	private headerTitleText!: HTMLElement;
	private headerDescription!: HTMLElement;
	private headerButtons!: HTMLElement;

	private bodyScrollBar!: DomScrollableElement;

	// Affected Features Section
	private affectedFeaturesContainer!: HTMLElement;
	private extensionsContainer!: HTMLElement;
	private onDemandExtensionsContainer!: HTMLElement;
	private onStartExtensionsContainer!: HTMLElement;

	// Settings Section
	private configurationContainer!: HTMLElement;
	private trustSettingsTree!: WorkspaceTrustTree;
	private workspaceTrustSettingsTreeModel!: WorkspaceTrustTreeModel;

	private workspaceTrustEditorModel!: WorkspaceTrustEditorModel;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDialogService private readonly dialogService: IDialogService
	) { super(WorkspaceTrustEditor.ID, telemetryService, themeService, storageService); }

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = append(parent, $('.workspace-trust-editor', { tabindex: '-1' }));

		this.createHeaderElement(this.rootElement);

		const scrollableContent = $('.workspace-trust-editor-body');
		this.bodyScrollBar = this._register(new DomScrollableElement(scrollableContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Visible,
		}));

		append(this.rootElement, this.bodyScrollBar.getDomNode());

		this.createAffectedFeaturesElement(scrollableContent);
		this.createConfigurationElement(scrollableContent);

		this._register(attachStylerCallback(this.themeService, { trustedForegroundColor, untrustedForegroundColor }, colors => {
			this.rootElement.style.setProperty('--workspace-trust-state-trusted-color', colors.trustedForegroundColor?.toString() || '');
			this.rootElement.style.setProperty('--workspace-trust-state-untrusted-color', colors.untrustedForegroundColor?.toString() || '');
		}));
	}

	async override setInput(input: WorkspaceTrustEditorInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) { return; }

		const model = await input.resolve();
		if (token.isCancellationRequested || !(model instanceof WorkspaceTrustEditorModel)) {
			return;
		}

		this.registerListeners(model);

		this.render(model);

		this.workspaceTrustEditorModel = model;
	}

	private registerListeners(model: WorkspaceTrustEditorModel): void {
		this._register(model.dataModel.onDidChangeTrustState(() => {
			this.render(model);
		}));

		this._register(this.extensionWorkbenchService.onChange(() => {
			this.render(model);
		}));
	}

	private getHeaderContainerClass(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return 'workspace-trust-header workspace-trust-trusted';
			case WorkspaceTrustState.Untrusted:
				return 'workspace-trust-header workspace-trust-untrusted';
			case WorkspaceTrustState.Unspecified:
				return 'workspace-trust-header workspace-trust-unknown';
		}
	}

	private getHeaderTitleText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return localize('trustedHeader', "This workspace is trusted");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeader', "This workspace is not trusted");
			case WorkspaceTrustState.Unspecified:
				return localize('unspecifiedHeader', "Do you want to trust this workspace?");
		}
	}

	private getHeaderDescriptionText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
			case WorkspaceTrustState.Untrusted:
			case WorkspaceTrustState.Unspecified:
				return localize('unknownSpecifiedDescription', "Trust is required for certain extensions to function in this workspace. [Learn more](https://aka.ms/vscode-workspace-trust).");
		}
	}

	private getHeaderTitleIconClassNames(trustState: WorkspaceTrustState): string[] {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return trustedIcon.classNamesArray;
			case WorkspaceTrustState.Untrusted:
				return untrustedIcon.classNamesArray;
			case WorkspaceTrustState.Unspecified:
				return unspecified.classNamesArray;
		}
	}

	private rendering = false;
	private rerenderDisposables: DisposableStore = this._register(new DisposableStore());
	@debounce(100)
	private async render(model: WorkspaceTrustEditorModel) {
		if (this.rendering) {
			return;
		}

		this.rendering = true;
		this.rerenderDisposables.clear();

		// Header Section
		this.headerTitleText.innerText = this.getHeaderTitleText(model.currentWorkspaceTrustState);
		this.headerTitleIcon.className = 'workspace-trust-title-icon';
		this.headerTitleIcon.classList.add(...this.getHeaderTitleIconClassNames(model.currentWorkspaceTrustState));
		this.headerDescription.innerText = '';

		const linkedText = parseLinkedText(this.getHeaderDescriptionText(model.currentWorkspaceTrustState));
		const p = append(this.headerDescription, $('p'));
		for (const node of linkedText.nodes) {
			if (typeof node === 'string') {
				append(p, document.createTextNode(node));
			} else {
				const link = this.instantiationService.createInstance(Link, node);
				append(p, link.el);
				this.rerenderDisposables.add(link);
				this.rerenderDisposables.add(attachLinkStyler(link, this.themeService));
			}
		}

		this.headerContainer.className = this.getHeaderContainerClass(model.currentWorkspaceTrustState);

		// Buttons
		clearNode(this.headerButtons);
		const workspaceFolders = this.workspaceService.getWorkspace().folders;

		if (workspaceFolders.length) {
			const buttonBar = this.rerenderDisposables.add(new ButtonBar(this.headerButtons));

			const createButton = (action: Action, enabled?: boolean) => {

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
			};

			const setTrustState = async (state: WorkspaceTrustState, uris?: URI[]) => {
				if (state !== WorkspaceTrustState.Trusted) {
					const message = localize('workspaceTrustTransitionMessage', "Deny Workspace Trust");
					const detail = localize('workspaceTrustTransitionDetail', "In order to safely complete this action, all affected windows will have to be reloaded. Are you sure you want to proceed with this action?");
					const primaryButton = localize('workspaceTrustTransitionPrimaryButton', "Yes");
					const secondaryButton = localize('workspaceTrustTransitionSecondaryButton', "No");

					const result = await this.dialogService.confirm({ type: 'info', message, detail, primaryButton, secondaryButton });
					if (!result.confirmed) {
						return;
					}
				}

				(uris || this.workspaceService.getWorkspace().folders.map(folder => folder.uri)).forEach(uri => {
					this.workspaceTrustEditorModel.dataModel.setFolderTrustState(uri, state);
				});
			};


			const trustChoiceWithMenu: IPromptChoiceWithMenu = {
				isSecondary: false,
				label: localize('trustButton', "Trust"),
				menu: [],
				run: () => {
					setTrustState(WorkspaceTrustState.Trusted);
				}
			};

			const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceService.getWorkspace());
			if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && workspaceIdentifier.uri.scheme === Schemas.file) {
				const { parentPath } = splitName(workspaceIdentifier.uri.fsPath);
				const { name } = splitName(parentPath);
				if (parentPath) {
					trustChoiceWithMenu.menu.push({
						label: localize('trustParentButton', "Trust All in {0}", name),
						run: () => {
							setTrustState(WorkspaceTrustState.Trusted, [URI.file(parentPath)]);
						}
					});
				}
			}

			createButton(new ChoiceAction('workspace.trust.button.action', trustChoiceWithMenu), model.currentWorkspaceTrustState !== WorkspaceTrustState.Trusted);
			createButton(new Action('workspace.trust.button.deny', localize('doNotTrustButton', "Don't Trust"), undefined, model.currentWorkspaceTrustState !== WorkspaceTrustState.Untrusted, async () => { setTrustState(WorkspaceTrustState.Untrusted); }));
		}

		// Features List
		const installedExtensions = await this.instantiationService.invokeFunction(getInstalledExtensions);
		const onDemandExtensions = await this.getExtensionsByTrustRequestType(installedExtensions, 'onDemand');
		const onStartExtensions = await this.getExtensionsByTrustRequestType(installedExtensions, 'onStart');

		this.renderExtensionList(
			localize('onStartExtensions', "Disabled Extensions"),
			localize('onStartExtensionsDescription', "The following extensions require the workspace to be trusted. They will be disabled while the workspace is not trusted."),
			this.onStartExtensionsContainer,
			onStartExtensions);
		this.renderExtensionList(
			localize('onDemandExtensions', "Limited Extensions"),
			localize('onDemandExtensionsDescription', "The following extensions can function partially in a non-trusted workspace. Some functionality will be turned off while the workspace is not trusted."),
			this.onDemandExtensionsContainer,
			onDemandExtensions);

		// Configuration Tree
		this.workspaceTrustSettingsTreeModel.update(model.dataModel.getTrustStateInfo());
		this.trustSettingsTree.setChildren(null, Iterable.map(this.workspaceTrustSettingsTreeModel.settings, s => { return { element: s }; }));

		this.bodyScrollBar.scanDomNode();
		this.rendering = false;
	}

	private async getExtensionsByTrustRequestType(extensions: IExtensionStatus[], trustRequestType: ExtensionWorkspaceTrustRequestType): Promise<IExtension[]> {
		const filtered = extensions.filter(ext => getExtensionWorkspaceTrustRequestType(ext.local.manifest) === trustRequestType);
		const ids = filtered.map(ext => ext.identifier.id);

		return getExtensions(ids, this.extensionWorkbenchService);
	}

	private renderExtensionList(title: string, description: string, parent: HTMLElement, extensions: IExtension[]) {
		clearNode(parent);

		if (!extensions.length) {
			return;
		}
		const titleElement = append(parent, $('.workspace-trust-extension-list-title'));
		titleElement.innerText = title;

		const descriptionElement = append(parent, $('.workspace-trust-extension-list-description'));
		descriptionElement.innerText = description;

		const content = $('div', { class: 'subcontent' });
		const scrollableContent = new DomScrollableElement(content, { useShadows: false });
		append(parent, scrollableContent.getDomNode());

		const extensionsGridView = this.instantiationService.createInstance(ExtensionsGridView, content, new WorkspaceTrustExtensionDelegate());
		extensionsGridView.setExtensions(extensions);
		scrollableContent.scanDomNode();

		this.rerenderDisposables.add(scrollableContent);
		this.rerenderDisposables.add(extensionsGridView);
		this.rerenderDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout: () => scrollableContent.scanDomNode() })));
	}

	private createHeaderElement(parent: HTMLElement): void {
		this.headerContainer = append(parent, $('.workspace-trust-header'));
		this.headerTitleContainer = append(this.headerContainer, $('.workspace-trust-title'));
		this.headerTitleIcon = append(this.headerTitleContainer, $('.workspace-trust-title-icon'));
		this.headerTitleText = append(this.headerTitleContainer, $('.workspace-trust-title-text'));
		this.headerDescription = append(this.headerContainer, $('.workspace-trust-description'));

		const buttonsRow = append(this.headerContainer, $('.workspace-trust-buttons-row'));
		this.headerButtons = append(buttonsRow, $('.workspace-trust-buttons'));
	}

	private createConfigurationElement(parent: HTMLElement): void {
		this.configurationContainer = append(parent, $('.workspace-trust-settings.settings-editor'));

		const titleContainer = append(this.configurationContainer, $('.workspace-trust-section-title'));
		titleContainer.innerText = localize('configurationSectionTitle', "Configure All Workspaces");

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
		const titleContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-section-title'));
		titleContainer.innerText = localize('affectedFeaturesTitle', "Features Affected By Workspace Trust");

		this.extensionsContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-extensions'));
		this.onDemandExtensionsContainer = append(this.extensionsContainer, $('.workspace-trust-extensions-list'));
		this.onStartExtensionsContainer = append(this.extensionsContainer, $('.workspace-trust-extensions-list'));
	}

	private onDidChangeSetting(change: IWorkspaceTrustSettingChangeEvent) {
		const applyChangesWithPrompt = async (showPrompt: boolean, applyChanges: () => void) => {
			if (showPrompt) {
				const message = localize('workspaceTrustSettingModificationMessage', "Update Workspace Trust Settings");
				const detail = localize('workspaceTrustTransitionDetail', "In order to safely complete this action, all affected windows will have to be reloaded. Are you sure you want to proceed with this action?");
				const primaryButton = localize('workspaceTrustTransitionPrimaryButton', "Yes");
				const secondaryButton = localize('workspaceTrustTransitionSecondaryButton', "No");

				const result = await this.dialogService.confirm({ type: 'info', message, detail, primaryButton, secondaryButton });
				if (!result.confirmed) {
					return;
				}
			}

			applyChanges();
		};


		if (this.workspaceTrustEditorModel) {
			if (isArray(change.value)) {
				if (change.key === 'trustedFolders') {
					applyChangesWithPrompt(change.type === 'changed' || change.type === 'removed', () => this.workspaceTrustEditorModel.dataModel.setTrustedFolders(change.value!));
				}

				if (change.key === 'untrustedFolders') {
					applyChangesWithPrompt(change.type === 'changed' || change.type === 'added', () => this.workspaceTrustEditorModel.dataModel.setUntrustedFolders(change.value!));
				}
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

		this.bodyScrollBar.getDomNode().style.height = `calc(100% - ${this.headerContainer.clientHeight}px)`;

		this.bodyScrollBar.scanDomNode();
	}
}

registerThemingParticipant((theme, collector) => {
	const tileBackgroundColor = theme.getColor(trustEditorTileBackgroundColor);
	if (tileBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .workspace-trust-editor .extension-container  { background: ${tileBackgroundColor}; }`);
	}

	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .workspace-trust-editor .extension-container { border: 1px solid ${border}; }`);
	}
});
