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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorOptions, IEditorOpenContext } from 'vs/workbench/common/editor';
import { IWorkspaceTrustSettingChangeEvent, WorkspaceTrustSettingArrayRenderer, WorkspaceTrustTree, WorkspaceTrustTreeModel } from 'vs/workbench/contrib/workspace/browser/workspaceTrustTree';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustEditorModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class WorkspaceTrustEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.workspaceTrust';
	private rootElement!: HTMLElement;
	private headerContainer!: HTMLElement;
	private headerTitle!: HTMLElement;
	private headerDescription!: HTMLElement;
	private headerButtons!: HTMLElement;
	private configurationContainer!: HTMLElement;
	private trustSettingsTree!: WorkspaceTrustTree;
	private workspaceTrustSettingsTreeModel!: WorkspaceTrustTreeModel;
	private workspaceTrustEditorModel!: WorkspaceTrustEditorModel;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { super(WorkspaceTrustEditor.ID, telemetryService, themeService, storageService); }

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = append(parent, $('.workspace-trust-editor.settings-editor', { tabindex: '-1' }));

		this.createHeaderElement(this.rootElement);
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

		this.render(model);

		this.workspaceTrustEditorModel = model;
	}

	private getHeaderTitleText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return localize('trustedHeader', "This Workspace is Trusted");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeader', "This Workspace is Not Trusted");
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeader', "This Workspace has Not Been Trusted");
		}
	}

	private getHeaderDescriptionText(trustState: WorkspaceTrustState): string {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return localize('trustedHeaderDescription', "All features requiring trust in this workspace are enabled. Below is the current list of features that will be disabled you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inheret the current workspace trust status.");
			case WorkspaceTrustState.Untrusted:
				return localize('untrustedHeaderDescription', "This workspace has limited functionality as some features will not work until trust is given to the current workspace. Below is the current list of features that will be disabled you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inherit the current workspace trust status.");
			case WorkspaceTrustState.Unknown:
				return localize('unknownHeaderDescription', "This workspace has limited functionality as some features will not work until trust is given to the current workspace. Below is the current list of features that will be disabled you grant trust to the workspace. Note that after trust is given, new features requiring trust will automatically inherit the current workspace trust status.");
		}
	}

	private render(model: WorkspaceTrustEditorModel): void {
		this.headerTitle.innerText = this.getHeaderTitleText(model.currentWorkspaceTrustState);
		this.headerDescription.innerText = this.getHeaderDescriptionText(model.currentWorkspaceTrustState);

		clearNode(this.headerButtons);
		const buttonBar = this._register(new ButtonBar(this.headerButtons));

		const createButton = (label: string, command: string) => {
			const button = buttonBar.addButton({ title: true });
			button.label = label;
			this._register(button.onDidClick(e => {
				if (e) {
					EventHelper.stop(e);
				}

				this.commandService.executeCommand(command);
			}));
		};

		if (model.currentWorkspaceTrustState !== WorkspaceTrustState.Trusted) {
			createButton(localize('trustButton', "Trust"), 'workbench.trust.grant');
		}

		if (model.currentWorkspaceTrustState !== WorkspaceTrustState.Untrusted) {
			createButton(localize('doNotTrustButton', "Don't Trust"), 'workbench.trust.deny');
		}

		createButton(localize('learnMore', "Learn More"), 'workbench.trust.learnMore');

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

	private onDidChangeSetting(change: IWorkspaceTrustSettingChangeEvent) {
		if (this.workspaceTrustEditorModel) {
			if (isArray(change.value)) {
				console.log(change.key);
				console.log(change.value);
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
