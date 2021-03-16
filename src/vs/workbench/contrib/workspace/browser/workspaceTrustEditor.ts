/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, Dimension, EventHelper } from 'vs/base/browser/dom';
import { ButtonBar } from 'vs/base/browser/ui/button/button';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import * as arrays from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { Iterable } from 'vs/base/common/iterator';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { parseLinkedText } from 'vs/base/common/linkedText';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ExtensionWorkspaceTrustRequirement } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Link } from 'vs/platform/opener/browser/link';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachButtonStyler, attachLinkStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { WorkspaceTrustState } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorOptions, IEditorOpenContext } from 'vs/workbench/common/editor';
import { Delegate } from 'vs/workbench/contrib/extensions/browser/extensionsList';
import { ExtensionsGridView, getExtensions } from 'vs/workbench/contrib/extensions/browser/extensionsViewer';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { getInstalledExtensions, IExtensionStatus } from 'vs/workbench/contrib/extensions/common/extensionsUtils';
import { trustedForegroundColor, untrustedForegroundColor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustColors';
import { IWorkspaceTrustSettingChangeEvent, WorkspaceTrustSettingArrayRenderer, WorkspaceTrustTree, WorkspaceTrustTreeModel } from 'vs/workbench/contrib/workspace/browser/workspaceTrustTree';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustEditorModel } from 'vs/workbench/services/workspaces/common/workspaceTrust';

const untrustedIcon = registerCodicon('workspace-untrusted-icon', Codicon.workspaceUntrusted);
const trustedIcon = registerCodicon('workspace-trusted-icon', Codicon.workspaceTrusted);
const unknownIcon = registerCodicon('workspace-unknown-icon', Codicon.workspaceUnknown);

class WorkspaceTrustExtensionDelegate extends Delegate {
	getHeight() { return super.getHeight() + 36; }
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
		@IInstantiationService private readonly instantiationService: IInstantiationService
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

	async setInput(input: WorkspaceTrustEditorInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {

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
				return localize('unknownHeaderDescription', "Trust is required for certain extensions to function in this workspace. [Learn more](https://aka.ms/vscode-workspace-trust).");
		}
	}

	private getHeaderTitleIconClassNames(trustState: WorkspaceTrustState): string[] {
		switch (trustState) {
			case WorkspaceTrustState.Trusted:
				return trustedIcon.classNamesArray;
			case WorkspaceTrustState.Untrusted:
				return untrustedIcon.classNamesArray;
			case WorkspaceTrustState.Unknown:
				return unknownIcon.classNamesArray;
		}
	}

	private rerenderDisposables: DisposableStore = this._register(new DisposableStore());
	private async render(model: WorkspaceTrustEditorModel) {
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

		clearNode(this.headerButtons);
		const buttonBar = this.rerenderDisposables.add(new ButtonBar(this.headerButtons));

		const createButton = (label: string, enabled: boolean, callback: () => void) => {
			const button = buttonBar.addButton();
			button.label = label;
			button.enabled = enabled;
			this.rerenderDisposables.add(button.onDidClick(e => {
				if (e) {
					EventHelper.stop(e);
				}

				callback();
			}));

			this.rerenderDisposables.add(attachButtonStyler(button, this.themeService));
		};


		const setTrustState = (state: WorkspaceTrustState) => {
			this.workspaceService.getWorkspace().folders.forEach(folder => {
				this.workspaceTrustEditorModel.dataModel.setFolderTrustState(folder.uri, state);
			});
		};

		createButton(localize('trustButton', "Trust"), model.currentWorkspaceTrustState !== WorkspaceTrustState.Trusted, () => setTrustState(WorkspaceTrustState.Trusted));
		createButton(localize('doNotTrustButton', "Don't Trust"), model.currentWorkspaceTrustState !== WorkspaceTrustState.Untrusted, () => setTrustState(WorkspaceTrustState.Untrusted));

		// Features List
		const installedExtensions = await this.instantiationService.invokeFunction(getInstalledExtensions);
		const onDemandExtensions = await this.getExtensionsByTrustRequirement(installedExtensions, 'onDemand');
		const onStartExtensions = await this.getExtensionsByTrustRequirement(installedExtensions, 'onStart');

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
	}

	private async getExtensionsByTrustRequirement(extensions: IExtensionStatus[], trustRequirement: ExtensionWorkspaceTrustRequirement): Promise<IExtension[]> {
		const filtered = extensions.filter(ext => ext.local.manifest.workspaceTrust?.required === trustRequirement);
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
