/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, Dimension, EventHelper } from 'vs/base/browser/dom';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { Iterable } from 'vs/base/common/iterator';
import { FileAccess } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { DefaultIconPath } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorOptions, IEditorOpenContext } from 'vs/workbench/common/editor';
import { IWorkspaceTrustSettingChangeEvent, WorkspaceTrustSettingArrayRenderer, WorkspaceTrustTree, WorkspaceTrustTreeModel } from 'vs/workbench/contrib/workspace/browser/workspaceTrustTree';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustEditorModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

const trustIcon = registerCodicon('workspace-trust-icon', Codicon.shield);

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

	// Affected Features Section
	private affectedFeaturesContainer!: HTMLElement;
	private extensionsContainer!: HTMLElement;
	private onDemandExtensionsContainer!: HTMLElement;
	private onStartExtensionsContainer!: HTMLElement;
	private extensionsRequiringTrust: IExtensionDescription[] = [];

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
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { super(WorkspaceTrustEditor.ID, telemetryService, themeService, storageService); }

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = append(parent, $('.workspace-trust-editor.settings-editor', { tabindex: '-1' }));

		this.createHeaderElement(this.rootElement);
		this.createAffectedFeaturesElement(this.rootElement);
		this.createConfigurationElement(this.rootElement);
	}

	async setInput(input: WorkspaceTrustEditorInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) { return; }

		const model = await input.resolve();
		if (token.isCancellationRequested || !(model instanceof WorkspaceTrustEditorModel)) {
			return;
		}

		this._register(model.dataModel.onDidChangeTrustState(() => {
			this.render(model);
		}));

		this.extensionsRequiringTrust = (await this.extensionService.getExtensions()).filter(ext => ext.requiresWorkspaceTrust);

		this.render(model);

		this.workspaceTrustEditorModel = model;
	}

	private getHeaderContainerClass(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return 'workspace-trust-header workspace-trust-trusted';
			case WorkspaceTrustState.Untrusted:
				return 'workspace-trust-header workspace-trust-untrusted';
			case WorkspaceTrustState.Unknown:
				return 'workspace-trust-header workspace-trust-unknown';
		}
	}

	private getHeaderTitleText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return localize('trustedHeader', "This workspace is trusted");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeader', "This workspace is not trusted");
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeader', "Do you want to trust this workspace?");
		}
	}

	private getHeaderDescriptionText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
			case WorkspaceTrustState.Untrusted:
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeaderDescription', "Trust is required for certain extensions to function in this workspace.");
		}
	}

	private render(model: WorkspaceTrustEditorModel): void {
		// Header Section
		this.headerTitleText.innerText = this.getHeaderTitleText(model.currentWorkspaceTrustState);
		this.headerTitleIcon.classList.add(...trustIcon.classNamesArray);
		this.headerDescription.innerText = this.getHeaderDescriptionText(model.currentWorkspaceTrustState);
		this.headerContainer.className = this.getHeaderContainerClass(model.currentWorkspaceTrustState);

		clearNode(this.headerButtons);
		const buttonBar = this._register(new ButtonBar(this.headerButtons));

		const createButton = (label: string, callback: () => void) => {
			const button = buttonBar.addButton();
			button.label = label;
			this._register(button.onDidClick(e => {
				if (e) {
					EventHelper.stop(e);
				}

				callback();
			}));
		};


		const setTrustState = (state: WorkspaceTrustState) => {
			this.workspaceService.getWorkspace().folders.forEach(folder => {
				this.workspaceTrustEditorModel.dataModel.setFolderTrustState(folder.uri, state);
			});
		};

		if (model.currentWorkspaceTrustState !== WorkspaceTrustState.Trusted) {
			createButton(localize('trustButton', "Trust"), () => setTrustState(WorkspaceTrustState.Trusted));
		}

		if (model.currentWorkspaceTrustState !== WorkspaceTrustState.Untrusted) {
			createButton(localize('doNotTrustButton', "Don't Trust"), () => setTrustState(WorkspaceTrustState.Untrusted));
		}

		createButton(localize('learnMore', "Learn More"), () => { });

		// Features List
		this.renderExtensionList(
			localize('onStartExtensions', "Disabled Extensions"),
			this.onStartExtensionsContainer,
			this.extensionsRequiringTrust.filter(ext => ext.requiresWorkspaceTrust === 'onStart'));
		this.renderExtensionList(
			localize('onDemandExtensions', "Limited Extensions"),
			this.onDemandExtensionsContainer,
			this.extensionsRequiringTrust.filter(ext => ext.requiresWorkspaceTrust === 'onDemand'));

		// Configuration Tree
		this.workspaceTrustSettingsTreeModel.update(model.dataModel.getTrustStateInfo());
		this.trustSettingsTree.setChildren(null, Iterable.map(this.workspaceTrustSettingsTreeModel.settings, s => { return { element: s }; }));
	}

	private renderExtensionList(title: string, parent: HTMLElement, extensions: IExtensionDescription[]) {
		clearNode(parent);

		if (!extensions.length) {
			return;
		}

		const titleElement = append(parent, $('.workspace-trust-extension-list-title'));
		titleElement.innerText = title;

		const listContainer = append(parent, $('.workspace-trust-extension-list'));
		extensions.forEach(ext => {
			const extensionEntry = append(listContainer, $('.workspace-trust-extension-list-entry'));
			this.renderExtension(extensionEntry, ext);
		});
	}

	private renderExtension(parent: HTMLElement, extension: IExtensionDescription) {
		const iconContainer = append(parent, $('.workspace-trust-extension-icon'));
		const icon = append(iconContainer, $<HTMLImageElement>('img.icon'));
		const textContainer = append(parent, $('.workspace-trust-extension-text'));
		const nameContainer = append(textContainer, $('.workspace-trust-extension-name'));

		const extensionDescription = append(textContainer, $('.workspace-trust-extension-description'));

		nameContainer.innerText = extension.displayName || extension.name;
		icon.src = extension.icon
			? FileAccess.asBrowserUri(joinPath(extension.extensionLocation, extension.icon)).toString(true)
			: DefaultIconPath;
		extensionDescription.innerText = extension.description || '';
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
		this.configurationContainer = append(parent, $('.workspace-trust-settings.settings-body'));

		const workspaceTrustTreeContainer = append(this.configurationContainer, $('.workspace-trust-settings-tree-container.settings-tree-container'));
		const renderer = this.instantiationService.createInstance(WorkspaceTrustSettingArrayRenderer,);

		this.trustSettingsTree = this._register(this.instantiationService.createInstance(WorkspaceTrustTree,
			workspaceTrustTreeContainer,
			[renderer]));

		this.workspaceTrustSettingsTreeModel = this.instantiationService.createInstance(WorkspaceTrustTreeModel);

		this._register(renderer.onDidChangeSetting(e => this.onDidChangeSetting(e)));
	}

	private createAffectedFeaturesElement(parent: HTMLElement): void {
		this.affectedFeaturesContainer = append(parent, $('.workspace-trust-features'));
		this.extensionsContainer = append(this.affectedFeaturesContainer, $('.workspace-trust-extensions'));
		this.onDemandExtensionsContainer = append(this.extensionsContainer, $('.workspace-trust-extensions-on-demand'));
		this.onStartExtensionsContainer = append(this.extensionsContainer, $('.workspace-trust-extensions-on-start'));
	}

	private onDidChangeSetting(change: IWorkspaceTrustSettingChangeEvent) {
		if (this.workspaceTrustEditorModel) {
			if (isArray(change.value)) {
				if (change.key === 'trustedFolders') {
					this.workspaceTrustEditorModel.dataModel.setTrustedFolders(change.value.map(item => URI.file(item)));
				}

				if (change.key === 'untrustedFolders') {
					this.workspaceTrustEditorModel.dataModel.setUntrustedFolders(change.value.map(item => URI.file(item)));
				}
			}
		}
	}

	layout(dimension: Dimension): void {
		if (!this.isVisible()) {
			return;
		}

		const listHeight = dimension.height - this.configurationContainer.offsetTop;
		this.configurationContainer.style.height = `${listHeight}`;

		this.trustSettingsTree.layout(listHeight, dimension.width);
	}
}
