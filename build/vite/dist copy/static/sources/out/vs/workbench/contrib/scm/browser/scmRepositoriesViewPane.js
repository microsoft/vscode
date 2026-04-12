/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ArtifactGroupRenderer_1, ArtifactRenderer_1;
import './media/scm.css';
import { localize } from '../../../../nls.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ISCMService, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, connectPrimaryMenu, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactNode, isSCMArtifactTreeElement, isSCMRepository } from './util.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun, observableSignalFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { Sequencer, Throttler } from '../../../../base/common/async.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SCMViewService } from './scmViewService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { fromNow } from '../../../../base/common/date.js';
class ListDelegate {
    getHeight() {
        return 22;
    }
    getTemplateId(element) {
        if (isSCMRepository(element)) {
            return RepositoryRenderer.TEMPLATE_ID;
        }
        else if (isSCMArtifactGroupTreeElement(element)) {
            return ArtifactGroupRenderer.TEMPLATE_ID;
        }
        else if (isSCMArtifactTreeElement(element) || isSCMArtifactNode(element)) {
            return ArtifactRenderer.TEMPLATE_ID;
        }
        else {
            throw new Error('Invalid tree element');
        }
    }
}
let ArtifactGroupRenderer = class ArtifactGroupRenderer {
    static { ArtifactGroupRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'artifactGroup'; }
    get templateId() { return ArtifactGroupRenderer_1.TEMPLATE_ID; }
    constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
        this.actionViewItemProvider = actionViewItemProvider;
        this._contextMenuService = _contextMenuService;
        this._contextKeyService = _contextKeyService;
        this._keybindingService = _keybindingService;
        this._menuService = _menuService;
        this._commandService = _commandService;
        this._scmViewService = _scmViewService;
        this._telemetryService = _telemetryService;
    }
    renderTemplate(container) {
        const element = append(container, $('.scm-artifact-group'));
        const icon = append(element, $('.icon'));
        const label = new IconLabel(element, { supportIcons: false });
        const actionsContainer = append(element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
        return { icon, label, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
    }
    renderElement(node, index, templateData) {
        const provider = node.element.repository.provider;
        const artifactGroup = node.element.artifactGroup;
        templateData.icon.className = ThemeIcon.isThemeIcon(artifactGroup.icon)
            ? `icon ${ThemeIcon.asClassName(artifactGroup.icon)}`
            : '';
        templateData.label.setLabel(artifactGroup.name);
        const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
        templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactGroupMenu(artifactGroup), primary => {
            templateData.actionBar.setActions(primary);
        }, 'inline', provider));
        templateData.actionBar.context = artifactGroup;
    }
    renderCompressedElements(node, index, templateData, details) {
        throw new Error('Should never happen since node is incompressible');
    }
    disposeElement(element, index, templateData, details) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposable.dispose();
    }
};
ArtifactGroupRenderer = ArtifactGroupRenderer_1 = __decorate([
    __param(1, IContextMenuService),
    __param(2, IContextKeyService),
    __param(3, IKeybindingService),
    __param(4, IMenuService),
    __param(5, ICommandService),
    __param(6, ISCMViewService),
    __param(7, ITelemetryService)
], ArtifactGroupRenderer);
let ArtifactRenderer = class ArtifactRenderer {
    static { ArtifactRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'artifact'; }
    get templateId() { return ArtifactRenderer_1.TEMPLATE_ID; }
    constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
        this.actionViewItemProvider = actionViewItemProvider;
        this._contextMenuService = _contextMenuService;
        this._contextKeyService = _contextKeyService;
        this._keybindingService = _keybindingService;
        this._menuService = _menuService;
        this._commandService = _commandService;
        this._scmViewService = _scmViewService;
        this._telemetryService = _telemetryService;
    }
    renderTemplate(container) {
        const element = append(container, $('.scm-artifact'));
        const icon = append(element, $('.icon'));
        const label = new IconLabel(element, { supportIcons: false });
        const timestampContainer = append(element, $('.timestamp-container'));
        const timestamp = append(timestampContainer, $('.timestamp'));
        const actionsContainer = append(element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
        return { icon, label, timestampContainer, timestamp, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
    }
    renderElement(nodeOrElement, index, templateData) {
        const artifactOrFolder = nodeOrElement.element;
        // Label
        if (isSCMArtifactTreeElement(artifactOrFolder)) {
            // Artifact
            const artifactGroup = artifactOrFolder.group;
            const artifact = artifactOrFolder.artifact;
            const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
            templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon)
                ? `icon ${ThemeIcon.asClassName(artifactIcon)}`
                : '';
            const artifactLabel = artifactGroup.supportsFolders
                ? artifact.name.split('/').pop() ?? artifact.name
                : artifact.name;
            templateData.label.setLabel(artifactLabel, artifact.description);
            templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : '';
            templateData.timestampContainer.classList.toggle('duplicate', artifactOrFolder.hideTimestamp);
            templateData.timestampContainer.style.display = '';
        }
        else if (isSCMArtifactNode(artifactOrFolder)) {
            // Folder
            templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
            templateData.label.setLabel(basename(artifactOrFolder.uri));
            templateData.timestamp.textContent = '';
            templateData.timestampContainer.classList.remove('duplicate');
            templateData.timestampContainer.style.display = 'none';
        }
        // Actions
        this._renderActionBar(artifactOrFolder, templateData);
    }
    renderCompressedElements(node, index, templateData, details) {
        const compressed = node.element;
        const artifactOrFolder = compressed.elements[compressed.elements.length - 1];
        // Label
        if (isSCMArtifactTreeElement(artifactOrFolder)) {
            // Artifact
            const artifact = artifactOrFolder.artifact;
            const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
            templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon)
                ? `icon ${ThemeIcon.asClassName(artifactIcon)}`
                : '';
            templateData.label.setLabel(artifact.name, artifact.description);
            templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : '';
            templateData.timestampContainer.classList.toggle('duplicate', artifactOrFolder.hideTimestamp);
            templateData.timestampContainer.style.display = '';
        }
        else if (isSCMArtifactNode(artifactOrFolder)) {
            // Folder
            templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
            templateData.label.setLabel(artifactOrFolder.uri.fsPath.substring(1));
            templateData.timestamp.textContent = '';
            templateData.timestampContainer.classList.remove('duplicate');
            templateData.timestampContainer.style.display = 'none';
        }
        // Actions
        this._renderActionBar(artifactOrFolder, templateData);
    }
    _renderActionBar(artifactOrFolder, templateData) {
        if (isSCMArtifactTreeElement(artifactOrFolder)) {
            const artifact = artifactOrFolder.artifact;
            const provider = artifactOrFolder.repository.provider;
            const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
            templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactMenu(artifactOrFolder.group, artifact), primary => {
                templateData.actionBar.setActions(primary);
            }, 'inline', provider));
            templateData.actionBar.context = artifact;
        }
        else if (ResourceTree.isResourceNode(artifactOrFolder)) {
            templateData.actionBar.setActions([]);
            templateData.actionBar.context = undefined;
        }
    }
    disposeElement(element, index, templateData, details) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposable.dispose();
    }
};
ArtifactRenderer = ArtifactRenderer_1 = __decorate([
    __param(1, IContextMenuService),
    __param(2, IContextKeyService),
    __param(3, IKeybindingService),
    __param(4, IMenuService),
    __param(5, ICommandService),
    __param(6, ISCMViewService),
    __param(7, ITelemetryService)
], ArtifactRenderer);
let RepositoryTreeDataSource = class RepositoryTreeDataSource extends Disposable {
    constructor(scmViewService) {
        super();
        this.scmViewService = scmViewService;
    }
    async getChildren(inputOrElement) {
        if (this.scmViewService.explorerEnabledConfig.get() === false) {
            const parentId = isSCMRepository(inputOrElement)
                ? inputOrElement.provider.id
                : undefined;
            const repositories = this.scmViewService.repositories
                .filter(r => r.provider.parentId === parentId);
            return repositories;
        }
        // Explorer mode
        if (inputOrElement instanceof SCMViewService) {
            // Get all top level repositories
            const repositories = this.scmViewService.repositories
                .filter(r => r.provider.parentId === undefined);
            // Check whether there are any child repositories
            if (repositories.length !== this.scmViewService.repositories.length) {
                for (const repository of repositories) {
                    const childRepositories = this.scmViewService.repositories
                        .filter(r => r.provider.parentId === repository.provider.id);
                    if (childRepositories.length === 0) {
                        continue;
                    }
                    // Insert child repositories right after the parent
                    const repositoryIndex = repositories.indexOf(repository);
                    repositories.splice(repositoryIndex + 1, 0, ...childRepositories);
                }
            }
            return repositories;
        }
        else if (isSCMRepository(inputOrElement)) {
            const artifactGroups = await inputOrElement.provider.artifactProvider.get()?.provideArtifactGroups() ?? [];
            return artifactGroups.map(group => ({
                repository: inputOrElement,
                artifactGroup: group,
                type: 'artifactGroup'
            }));
        }
        else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
            const repository = inputOrElement.repository;
            const artifacts = await repository.provider.artifactProvider.get()?.provideArtifacts(inputOrElement.artifactGroup.id) ?? [];
            if (inputOrElement.artifactGroup.supportsFolders) {
                // Resource tree for artifacts
                const artifactsTree = new ResourceTree(inputOrElement);
                for (let index = 0; index < artifacts.length; index++) {
                    const artifact = artifacts[index];
                    const artifactUri = URI.from({ scheme: 'scm-artifact', path: artifact.name });
                    const artifactDirectory = artifact.id.lastIndexOf('/') > 0
                        ? artifact.id.substring(0, artifact.id.lastIndexOf('/'))
                        : artifact.id;
                    const prevArtifact = index > 0 ? artifacts[index - 1] : undefined;
                    const prevArtifactDirectory = prevArtifact && prevArtifact.id.lastIndexOf('/') > 0
                        ? prevArtifact.id.substring(0, prevArtifact.id.lastIndexOf('/'))
                        : prevArtifact?.id;
                    const hideTimestamp = index > 0 &&
                        artifact.timestamp !== undefined &&
                        prevArtifact?.timestamp !== undefined &&
                        artifactDirectory === prevArtifactDirectory &&
                        fromNow(prevArtifact.timestamp) === fromNow(artifact.timestamp);
                    artifactsTree.add(artifactUri, {
                        repository,
                        group: inputOrElement.artifactGroup,
                        artifact,
                        hideTimestamp,
                        type: 'artifact'
                    });
                }
                return Iterable.map(artifactsTree.root.children, node => node.element ?? node);
            }
            // Flat list of artifacts
            return artifacts.map((artifact, index, artifacts) => ({
                repository,
                group: inputOrElement.artifactGroup,
                artifact,
                hideTimestamp: index > 0 &&
                    artifact.timestamp !== undefined &&
                    artifacts[index - 1].timestamp !== undefined &&
                    fromNow(artifacts[index - 1].timestamp) === fromNow(artifact.timestamp),
                type: 'artifact'
            }));
        }
        else if (isSCMArtifactNode(inputOrElement)) {
            return Iterable.map(inputOrElement.children, node => node.element && node.childrenCount === 0 ? node.element : node);
        }
        return [];
    }
    hasChildren(inputOrElement) {
        if (this.scmViewService.explorerEnabledConfig.get() === false) {
            const parentId = isSCMRepository(inputOrElement)
                ? inputOrElement.provider.id
                : undefined;
            const repositories = this.scmViewService.repositories
                .filter(r => r.provider.parentId === parentId);
            return repositories.length > 0;
        }
        // Explorer mode
        if (inputOrElement instanceof SCMViewService) {
            return this.scmViewService.repositories.length > 0;
        }
        else if (isSCMRepository(inputOrElement)) {
            return true;
        }
        else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
            return true;
        }
        else if (isSCMArtifactTreeElement(inputOrElement)) {
            return false;
        }
        else if (isSCMArtifactNode(inputOrElement)) {
            return inputOrElement.childrenCount > 0;
        }
        else {
            return false;
        }
    }
};
RepositoryTreeDataSource = __decorate([
    __param(0, ISCMViewService)
], RepositoryTreeDataSource);
class RepositoryTreeIdentityProvider {
    getId(element) {
        if (isSCMRepository(element)) {
            return `repo:${element.provider.id}`;
        }
        else if (isSCMArtifactGroupTreeElement(element)) {
            return `artifactGroup:${element.repository.provider.id}/${element.artifactGroup.id}`;
        }
        else if (isSCMArtifactTreeElement(element)) {
            return `artifact:${element.repository.provider.id}/${element.group.id}/${element.artifact.id}`;
        }
        else if (isSCMArtifactNode(element)) {
            return `artifactFolder:${element.context.repository.provider.id}/${element.context.artifactGroup.id}/${element.uri.fsPath}`;
        }
        else {
            throw new Error('Invalid tree element');
        }
    }
}
class RepositoriesTreeCompressionDelegate {
    isIncompressible(element) {
        if (ResourceTree.isResourceNode(element)) {
            return element.childrenCount > 1;
        }
        else {
            return true;
        }
    }
}
let SCMRepositoriesViewPane = class SCMRepositoriesViewPane extends ViewPane {
    constructor(options, scmService, scmViewService, keybindingService, contextMenuService, commandService, instantiationService, viewDescriptorService, contextKeyService, configurationService, openerService, themeService, hoverService, storageService) {
        super({ ...options, titleMenuId: MenuId.SCMSourceControlTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.scmService = scmService;
        this.scmViewService = scmViewService;
        this.commandService = commandService;
        this.storageService = storageService;
        this.treeOperationSequencer = new Sequencer();
        this.updateChildrenThrottler = new Throttler();
        this.visibilityDisposables = new DisposableStore();
        this.repositoryDisposables = new DisposableMap();
        this.visibleCountObs = observableConfigValue('scm.repositories.visible', 10, this.configurationService);
        this.providerCountBadgeObs = observableConfigValue('scm.providerCountBadge', 'hidden', this.configurationService);
        this.storageService.onWillSaveState(() => {
            this.storeTreeViewState();
        }, this, this._store);
        this._register(this.updateChildrenThrottler);
    }
    renderBody(container) {
        super.renderBody(container);
        const treeContainer = append(container, $('.scm-view.scm-repositories-view'));
        // scm.providerCountBadge setting
        this._register(autorun(reader => {
            const providerCountBadge = this.providerCountBadgeObs.read(reader);
            treeContainer.classList.toggle('hide-provider-counts', providerCountBadge === 'hidden');
            treeContainer.classList.toggle('auto-provider-counts', providerCountBadge === 'auto');
        }));
        const viewState = this.loadTreeViewState();
        this.createTree(treeContainer, viewState);
        this.onDidChangeBodyVisibility(async (visible) => {
            if (!visible) {
                this.visibilityDisposables.clear();
                return;
            }
            this.treeOperationSequencer.queue(async () => {
                // Initial rendering
                await this.tree.setInput(this.scmViewService, viewState);
                // scm.repositories.visible setting
                this.visibilityDisposables.add(autorun(reader => {
                    const visibleCount = this.visibleCountObs.read(reader);
                    this.updateBodySize(this.tree.contentHeight, visibleCount);
                }));
                // scm.repositories.explorer setting
                this.visibilityDisposables.add(runOnChange(this.scmViewService.explorerEnabledConfig, async () => {
                    await this.updateChildren();
                    this.updateBodySize(this.tree.contentHeight);
                    // If we only have one repository, expand it
                    if (this.scmViewService.repositories.length === 1) {
                        await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
                    }
                }));
                // Update tree selection
                const onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(this, this.scmViewService.onDidChangeVisibleRepositories);
                this.visibilityDisposables.add(autorun(async (reader) => {
                    onDidChangeVisibleRepositoriesSignal.read(reader);
                    await this.treeOperationSequencer.queue(() => this.updateTreeSelection());
                }));
                // Add/Remove event handlers
                this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.visibilityDisposables);
                this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.visibilityDisposables);
                for (const repository of this.scmService.repositories) {
                    this.onDidAddRepository(repository);
                }
                // Expand repository if there is only one
                this.visibilityDisposables.add(autorun(async (reader) => {
                    const explorerEnabledConfig = this.scmViewService.explorerEnabledConfig.read(reader);
                    const didFinishLoadingRepositories = this.scmViewService.didFinishLoadingRepositories.read(reader);
                    if (viewState === undefined && explorerEnabledConfig && didFinishLoadingRepositories && this.scmViewService.repositories.length === 1) {
                        await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
                    }
                }));
            });
        }, this, this._store);
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree.layout(height, width);
    }
    focus() {
        super.focus();
        this.tree.domFocus();
    }
    createTree(container, viewState) {
        this.treeIdentityProvider = new RepositoryTreeIdentityProvider();
        this.treeDataSource = this.instantiationService.createInstance(RepositoryTreeDataSource);
        this._register(this.treeDataSource);
        this.tree = this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, 'SCM Repositories', container, new ListDelegate(), new RepositoriesTreeCompressionDelegate(), [
            this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService)),
            this.instantiationService.createInstance(ArtifactGroupRenderer, getActionViewItemProvider(this.instantiationService)),
            this.instantiationService.createInstance(ArtifactRenderer, getActionViewItemProvider(this.instantiationService))
        ], this.treeDataSource, {
            identityProvider: this.treeIdentityProvider,
            horizontalScrolling: false,
            collapseByDefault: (e) => {
                if (this.scmViewService.explorerEnabledConfig.get() === false) {
                    if (isSCMRepository(e) && e.provider.parentId === undefined) {
                        return false;
                    }
                    return true;
                }
                // Explorer mode
                if (viewState?.expanded && (isSCMRepository(e) || isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e))) {
                    // Only expand repositories/artifact groups/artifacts that were expanded before
                    return viewState.expanded.indexOf(this.treeIdentityProvider.getId(e)) === -1;
                }
                else if (isSCMArtifactNode(e)) {
                    // Only expand artifact folders as they are compressed by default
                    return !(e.childrenCount === 1 && Iterable.first(e.children)?.element === undefined);
                }
                else {
                    return true;
                }
            },
            compressionEnabled: true,
            overrideStyles: this.getLocationBasedColors().listOverrideStyles,
            multipleSelectionSupport: this.scmViewService.selectionModeConfig.get() === 'multiple',
            expandOnDoubleClick: true,
            expandOnlyOnTwistieClick: true,
            accessibilityProvider: {
                getAriaLabel(element) {
                    if (isSCMRepository(element)) {
                        return element.provider.label;
                    }
                    else if (isSCMArtifactGroupTreeElement(element)) {
                        return element.artifactGroup.name;
                    }
                    else if (isSCMArtifactTreeElement(element)) {
                        return element.artifact.name;
                    }
                    else {
                        return '';
                    }
                },
                getWidgetAriaLabel() {
                    return localize('scm', "Source Control Repositories");
                }
            }
        });
        this._register(this.tree);
        this._register(autorun(reader => {
            const selectionMode = this.scmViewService.selectionModeConfig.read(reader);
            this.tree.updateOptions({ multipleSelectionSupport: selectionMode === 'multiple' });
        }));
        this._register(this.tree.onDidOpen(this.onTreeDidOpen, this));
        this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
        this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
        this._register(this.tree.onDidFocus(this.onDidTreeFocus, this));
        this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
        this._register(this.tree.onDidChangeContentHeight(this.onTreeContentHeightChange, this));
    }
    async onDidAddRepository(repository) {
        const disposables = new DisposableStore();
        // Artifact group changed
        disposables.add(autorun(async (reader) => {
            const explorerEnabled = this.scmViewService.explorerEnabledConfig.read(reader);
            const artifactsProvider = repository.provider.artifactProvider.read(reader);
            if (!explorerEnabled || !artifactsProvider) {
                return;
            }
            reader.store.add(artifactsProvider.onDidChangeArtifacts(async (groups) => {
                await this.updateRepository(repository);
            }));
        }));
        // HistoryItemRef changed
        disposables.add(autorun(async (reader) => {
            const historyProvider = repository.provider.historyProvider.read(reader);
            if (!historyProvider) {
                return;
            }
            reader.store.add(runOnChange(historyProvider.historyItemRef, async () => {
                await this.updateRepository(repository);
            }));
        }));
        await this.updateRepository(repository);
        this.repositoryDisposables.set(repository, disposables);
    }
    async onDidRemoveRepository(repository) {
        await this.updateRepository(repository);
        this.repositoryDisposables.deleteAndDispose(repository);
    }
    onTreeDidOpen(e) {
        if (!e.element || !isSCMArtifactTreeElement(e.element) || !e.element.artifact.command) {
            return;
        }
        this.commandService.executeCommand(e.element.artifact.command.id, e.element.repository.provider, e.element.artifact);
    }
    onTreeContextMenu(e) {
        if (!e.element) {
            return;
        }
        if (isSCMRepository(e.element)) {
            // Repository
            const provider = e.element.provider;
            const menus = this.scmViewService.menus.getRepositoryMenus(provider);
            const menu = menus.getRepositoryContextMenu(e.element);
            const actions = collectContextMenuActions(menu);
            const disposables = new DisposableStore();
            const actionRunner = new RepositoryActionRunner(() => {
                return this.getTreeSelection();
            });
            disposables.add(actionRunner);
            disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
            this.contextMenuService.showContextMenu({
                actionRunner,
                getAnchor: () => e.anchor,
                getActions: () => actions,
                getActionsContext: () => provider,
                onHide: () => disposables.dispose()
            });
        }
        else if (isSCMArtifactTreeElement(e.element)) {
            // Artifact
            const provider = e.element.repository.provider;
            const artifact = e.element.artifact;
            const menus = this.scmViewService.menus.getRepositoryMenus(provider);
            const menu = menus.getArtifactMenu(e.element.group, artifact);
            const actions = collectContextMenuActions(menu, provider);
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => actions,
                getActionsContext: () => artifact
            });
        }
    }
    onTreeSelectionChange(e) {
        if (e.browserEvent && e.elements.length > 0) {
            const scrollTop = this.tree.scrollTop;
            if (e.elements.every(e => isSCMRepository(e))) {
                this.scmViewService.visibleRepositories = e.elements;
            }
            else if (e.elements.every(e => isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e))) {
                this.scmViewService.visibleRepositories = e.elements.map(e => e.repository);
            }
            this.tree.scrollTop = scrollTop;
        }
    }
    onTreeDidChangeFocus(e) {
        if (e.browserEvent && e.elements.length > 0) {
            if (isSCMRepository(e.elements[0])) {
                this.scmViewService.focus(e.elements[0]);
            }
        }
    }
    onDidTreeFocus() {
        const focused = this.tree.getFocus();
        if (focused.length > 0) {
            if (isSCMRepository(focused[0])) {
                this.scmViewService.focus(focused[0]);
            }
            else if (isSCMArtifactGroupTreeElement(focused[0]) || isSCMArtifactTreeElement(focused[0])) {
                this.scmViewService.focus(focused[0].repository);
            }
        }
    }
    onTreeContentHeightChange(height) {
        this.updateBodySize(height);
        // Refresh the selection
        this.treeOperationSequencer.queue(() => this.updateTreeSelection());
    }
    async updateChildren(element) {
        return this.updateChildrenThrottler.queue(() => this.treeOperationSequencer.queue(async () => {
            if (element && this.tree.hasNode(element)) {
                await this.tree.updateChildren(element, true);
            }
            else {
                await this.tree.updateChildren(undefined, true);
            }
        }));
    }
    async expand(element) {
        await this.treeOperationSequencer.queue(() => this.tree.expand(element, true));
    }
    async updateRepository(repository) {
        if (this.scmViewService.explorerEnabledConfig.get() === false) {
            if (repository.provider.parentId === undefined) {
                await this.updateChildren();
                return;
            }
            await this.updateParentRepository(repository);
        }
        // Explorer mode
        await this.updateChildren();
    }
    async updateParentRepository(repository) {
        const parentRepository = this.scmViewService.repositories
            .find(r => r.provider.id === repository.provider.parentId);
        if (!parentRepository) {
            return;
        }
        await this.updateChildren(parentRepository);
        await this.expand(parentRepository);
    }
    updateBodySize(contentHeight, visibleCount) {
        if (this.orientation === 1 /* Orientation.HORIZONTAL */) {
            return;
        }
        if (this.scmViewService.explorerEnabledConfig.get() === false) {
            visibleCount = visibleCount ?? this.visibleCountObs.get();
            const empty = this.scmViewService.repositories.length === 0;
            const size = Math.min(contentHeight / 22, visibleCount) * 22;
            this.minimumBodySize = visibleCount === 0 ? 22 : size;
            this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
        }
        else {
            this.minimumBodySize = 120;
            this.maximumBodySize = Number.POSITIVE_INFINITY;
        }
    }
    async updateTreeSelection() {
        const oldSelection = this.getTreeSelection();
        const oldSet = new Set(oldSelection);
        const set = new Set(this.scmViewService.visibleRepositories);
        const added = new Set(Iterable.filter(set, r => !oldSet.has(r)));
        const removed = new Set(Iterable.filter(oldSet, r => !set.has(r)));
        if (added.size === 0 && removed.size === 0) {
            return;
        }
        const selection = oldSelection.filter(repo => !removed.has(repo));
        for (const repo of this.scmViewService.repositories) {
            if (added.has(repo)) {
                selection.push(repo);
            }
        }
        const visibleSelection = selection
            .filter(s => this.tree.hasNode(s));
        this.tree.setSelection(visibleSelection);
        if (visibleSelection.length > 0 && !this.tree.getFocus().includes(visibleSelection[0])) {
            this.tree.setAnchor(visibleSelection[0]);
            this.tree.setFocus([visibleSelection[0]]);
        }
    }
    getTreeSelection() {
        return this.tree.getSelection()
            .map(e => {
            if (isSCMRepository(e)) {
                return e;
            }
            else if (isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e)) {
                return e.repository;
            }
            else if (isSCMArtifactNode(e)) {
                return e.context.repository;
            }
            else {
                throw new Error('Invalid tree element');
            }
        });
    }
    loadTreeViewState() {
        const storageViewState = this.storageService.get('scm.repositoriesViewState', 1 /* StorageScope.WORKSPACE */);
        if (!storageViewState) {
            return undefined;
        }
        try {
            const treeViewState = JSON.parse(storageViewState);
            return treeViewState;
        }
        catch {
            return undefined;
        }
    }
    storeTreeViewState() {
        if (this.tree) {
            this.storageService.store('scm.repositoriesViewState', JSON.stringify(this.tree.getViewState()), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    dispose() {
        this.visibilityDisposables.dispose();
        this.repositoryDisposables.dispose();
        super.dispose();
    }
};
SCMRepositoriesViewPane = __decorate([
    __param(1, ISCMService),
    __param(2, ISCMViewService),
    __param(3, IKeybindingService),
    __param(4, IContextMenuService),
    __param(5, ICommandService),
    __param(6, IInstantiationService),
    __param(7, IViewDescriptorService),
    __param(8, IContextKeyService),
    __param(9, IConfigurationService),
    __param(10, IOpenerService),
    __param(11, IThemeService),
    __param(12, IHoverService),
    __param(13, IStorageService)
], SCMRepositoriesViewPane);
export { SCMRepositoriesViewPane };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtUmVwb3NpdG9yaWVzVmlld1BhbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9zY21SZXBvc2l0b3JpZXNWaWV3UGFuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQkFBaUIsQ0FBQztBQUN6QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFFBQVEsRUFBb0IsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RixPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzVELE9BQU8sRUFBYyxrQ0FBa0MsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xILE9BQU8sRUFBa0IsV0FBVyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFF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