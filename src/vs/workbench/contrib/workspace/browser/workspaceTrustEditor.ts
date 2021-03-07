/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, Dimension, EventHelper } from 'vs/base/browser/dom';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
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

export class WorkspaceTrustEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.workspaceTrust';
	private rootElement!: HTMLElement;
	private headerContainer!: HTMLElement;
	private headerTitle!: HTMLElement;
	private headerDescription!: HTMLElement;
	private headerButtons!: HTMLElement;
	private extensionsListEntriesContainer!: HTMLElement;
	private configurationContainer!: HTMLElement;
	private trustSettingsTree!: WorkspaceTrustTree;
	private workspaceTrustSettingsTreeModel!: WorkspaceTrustTreeModel;
	private workspaceTrustEditorModel!: WorkspaceTrustEditorModel;
	private extensionsRequiringTrust: IExtensionDescription[] = [];

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
		this.createFeatureListElement(this.rootElement);
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
				return localize('trustedHeader', "This Workspace Is Trusted");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeader', "This Workspace Is Not Trusted");
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeader', "This Workspace Has Not Been Trusted");
		}
	}

	private getHeaderDescriptionText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return localize('trustedHeaderDescription', "All features requiring trust in this workspace are enabled. Below is the current list of features that will be disabled until you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inheret the current workspace trust status.");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeaderDescription', "This workspace has limited functionality as some features will not work until trust is given to the current workspace. Below is the current list of features that will be disabled until you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inherit the current workspace trust status.");
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeaderDescription', "This workspace has limited functionality as some features will not work until trust is given to the current workspace. Below is the current list of features that will be disabled until you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inherit the current workspace trust status.");
		}
	}

	private render(model: WorkspaceTrustEditorModel): void {
		// Header Section
		this.headerTitle.innerText = this.getHeaderTitleText(model.currentWorkspaceTrustState);
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
		clearNode(this.extensionsListEntriesContainer);
		this.extensionsRequiringTrust.forEach(ext => {
			const extensionListItem = append(this.extensionsListEntriesContainer, $('.workspace-trust-extension'));
			extensionListItem.innerText = ext.displayName || ext.name;
		});

		// Configuration Tree
		this.workspaceTrustSettingsTreeModel.update(model.dataModel.getTrustStateInfo());
		this.trustSettingsTree.setChildren(null, Iterable.map(this.workspaceTrustSettingsTreeModel.settings, s => { return { element: s }; }));
	}

	private createHeaderElement(parent: HTMLElement): void {
		this.headerContainer = append(parent, $('.workspace-trust-header'));
		this.headerTitle = append(this.headerContainer, $('.workspace-trust-title'));
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

	private createFeatureListElement(parent: HTMLElement): void {
		const featuresListContainer = append(parent, $('.workspace-trust-features-list'));
		const extensionsListContainer = append(featuresListContainer, $('.workspace-trust-extensions-list'));
		const extensionsListHeader = append(extensionsListContainer, $('.workspace-trust-extensions-list-header'));
		extensionsListHeader.innerText = localize('extListHeader', "Extensions Requiring Workspace Trust");
		this.extensionsListEntriesContainer = append(extensionsListContainer, $('.workspace-trust-extensions-list-entries'));
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
