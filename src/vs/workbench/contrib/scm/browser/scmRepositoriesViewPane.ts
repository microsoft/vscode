/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { localize } from '../../../../nls.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeEvent, ITreeContextMenuEvent, ITreeNode, ITreeElementRenderDetails } from '../../../../base/browser/ui/tree/tree.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ISCMRepository, ISCMService, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, connectPrimaryMenu, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactNode, isSCMArtifactTreeElement, isSCMRepository } from './util.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun, IObservable, observableSignalFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { Sequencer } from '../../../../base/common/async.js';
import { SCMArtifactGroupTreeElement, SCMArtifactTreeElement } from '../common/artifact.js';
import { FuzzyScore } from '../../../../base/common/fuzzyScorer.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SCMViewService } from './scmViewService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ITreeCompressionDelegate } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { Codicon } from '../../../../base/common/codicons.js';

type TreeElement = ISCMRepository | SCMArtifactGroupTreeElement | SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>;

class ListDelegate implements IListVirtualDelegate<ISCMRepository> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMArtifactGroupTreeElement(element)) {
			return ArtifactGroupRenderer.TEMPLATE_ID;
		} else if (isSCMArtifactTreeElement(element) || isSCMArtifactNode(element)) {
			return ArtifactRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

interface ArtifactGroupTemplate {
	readonly icon: HTMLElement;
	readonly label: IconLabel;
	readonly actionBar: WorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

class ArtifactGroupRenderer implements ICompressibleTreeRenderer<SCMArtifactGroupTreeElement, FuzzyScore, ArtifactGroupTemplate> {

	static readonly TEMPLATE_ID = 'artifactGroup';
	get templateId(): string { return ArtifactGroupRenderer.TEMPLATE_ID; }

	constructor(
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): ArtifactGroupTemplate {
		const element = append(container, $('.scm-artifact-group'));
		const icon = append(element, $('.icon'));
		const label = new IconLabel(element, { supportIcons: false });

		const actionsContainer = append(element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);

		return { icon, label, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
	}

	renderElement(node: ITreeNode<SCMArtifactGroupTreeElement, FuzzyScore>, index: number, templateData: ArtifactGroupTemplate): void {
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

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMArtifactGroupTreeElement>, FuzzyScore>, index: number, templateData: ArtifactGroupTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(element: ITreeNode<SCMArtifactGroupTreeElement, FuzzyScore>, index: number, templateData: ArtifactGroupTemplate, details?: ITreeElementRenderDetails): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: ArtifactGroupTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposable.dispose();
	}
}

interface ArtifactTemplate {
	readonly icon: HTMLElement;
	readonly label: IconLabel;
	readonly actionBar: WorkbenchToolBar;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

class ArtifactRenderer implements ICompressibleTreeRenderer<SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>, FuzzyScore, ArtifactTemplate> {

	static readonly TEMPLATE_ID = 'artifact';
	get templateId(): string { return ArtifactRenderer.TEMPLATE_ID; }

	constructor(
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): ArtifactTemplate {
		const element = append(container, $('.scm-artifact'));
		const icon = append(element, $('.icon'));
		const label = new IconLabel(element, { supportIcons: false });

		const actionsContainer = append(element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);

		return { icon, label, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
	}

	renderElement(nodeOrElement: ITreeNode<SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>, FuzzyScore>, index: number, templateData: ArtifactTemplate): void {
		const artifactOrFolder = nodeOrElement.element;

		// Label
		if (isSCMArtifactTreeElement(artifactOrFolder)) {
			// Artifact
			const artifact = artifactOrFolder.artifact;

			const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
			templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon)
				? `icon ${ThemeIcon.asClassName(artifactIcon)}`
				: '';

			const artifactLabel = artifact.name.split('/').pop() ?? artifact.name;
			templateData.label.setLabel(artifactLabel, artifact.description);
		} else if (isSCMArtifactNode(artifactOrFolder)) {
			// Folder
			templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
			templateData.label.setLabel(basename(artifactOrFolder.uri));
		}

		// Actions
		this._renderActionBar(artifactOrFolder, templateData);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>>, FuzzyScore>, index: number, templateData: ArtifactTemplate, details?: ITreeElementRenderDetails): void {
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
		} else if (isSCMArtifactNode(artifactOrFolder)) {
			// Folder
			templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
			templateData.label.setLabel(artifactOrFolder.uri.fsPath.substring(1));
		}

		// Actions
		this._renderActionBar(artifactOrFolder, templateData);
	}

	private _renderActionBar(artifactOrFolder: SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>, templateData: ArtifactTemplate): void {
		if (isSCMArtifactTreeElement(artifactOrFolder)) {
			const artifact = artifactOrFolder.artifact;
			const provider = artifactOrFolder.repository.provider;
			const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
			templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactMenu(artifactOrFolder.group), primary => {
				templateData.actionBar.setActions(primary);
			}, 'inline', provider));
			templateData.actionBar.context = artifact;

		} else if (ResourceTree.isResourceNode(artifactOrFolder)) {
			templateData.actionBar.setActions([]);
			templateData.actionBar.context = undefined;
		}
	}

	disposeElement(element: ITreeNode<SCMArtifactTreeElement | IResourceNode<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>, FuzzyScore>, index: number, templateData: ArtifactTemplate, details?: ITreeElementRenderDetails): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: ArtifactTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposable.dispose();
	}
}

class RepositoryTreeDataSource extends Disposable implements IAsyncDataSource<ISCMViewService, TreeElement> {
	constructor(@ISCMViewService private readonly scmViewService: ISCMViewService) {
		super();
	}

	async getChildren(inputOrElement: ISCMViewService | TreeElement): Promise<Iterable<TreeElement>> {
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
			return this.scmViewService.repositories;
		} else if (isSCMRepository(inputOrElement)) {
			const artifactGroups = await inputOrElement.provider.artifactProvider.get()?.provideArtifactGroups() ?? [];
			return artifactGroups.map(group => ({
				repository: inputOrElement,
				artifactGroup: group,
				type: 'artifactGroup'
			}));
		} else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
			const repository = inputOrElement.repository;
			const artifacts = await repository.provider.artifactProvider.get()?.provideArtifacts(inputOrElement.artifactGroup.id) ?? [];

			// Create resource tree for artifacts
			const artifactsTree = new ResourceTree<SCMArtifactTreeElement, SCMArtifactGroupTreeElement>(inputOrElement);
			for (const artifact of artifacts) {
				artifactsTree.add(URI.from({
					scheme: 'scm-artifact', path: artifact.name
				}), {
					repository,
					group: inputOrElement.artifactGroup,
					artifact,
					type: 'artifact'
				});
			}

			return Iterable.map(artifactsTree.root.children, node => node.element ?? node);
		} else if (isSCMArtifactNode(inputOrElement)) {
			return Iterable.map(inputOrElement.children,
				node => node.element && node.childrenCount === 0 ? node.element : node);
		} else if (isSCMArtifactTreeElement(inputOrElement)) { }

		return [];
	}

	hasChildren(inputOrElement: ISCMViewService | TreeElement): boolean {
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
		} else if (isSCMRepository(inputOrElement)) {
			return true;
		} else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
			return true;
		} else if (isSCMArtifactTreeElement(inputOrElement)) {
			return false;
		} else if (isSCMArtifactNode(inputOrElement)) {
			return inputOrElement.childrenCount > 0;
		} else {
			return false;
		}
	}
}

class RepositoryTreeIdentityProvider implements IIdentityProvider<TreeElement> {
	getId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return `repo:${element.provider.id}`;
		} else if (isSCMArtifactGroupTreeElement(element)) {
			return `artifactGroup:${element.repository.provider.id}/${element.artifactGroup.id}`;
		} else if (isSCMArtifactTreeElement(element)) {
			return `artifact:${element.repository.provider.id}/${element.group.id}/${element.artifact.id}`;
		} else if (isSCMArtifactNode(element)) {
			return `artifactFolder:${element.context.repository.provider.id}/${element.context.artifactGroup.id}/${element.uri.fsPath}`;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

class RepositoriesTreeCompressionDelegate implements ITreeCompressionDelegate<TreeElement> {
	isIncompressible(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return element.childrenCount > 1;
		} else {
			return true;
		}
	}
}

export class SCMRepositoriesViewPane extends ViewPane {

	private tree!: WorkbenchCompressibleAsyncDataTree<ISCMViewService, TreeElement>;
	private treeDataSource!: RepositoryTreeDataSource;
	private treeIdentityProvider!: RepositoryTreeIdentityProvider;
	private readonly treeOperationSequencer = new Sequencer();

	private readonly visibleCountObs: IObservable<number>;
	private readonly providerCountBadgeObs: IObservable<'hidden' | 'auto' | 'visible'>;

	private readonly visibilityDisposables = new DisposableStore();
	private readonly repositoryDisposables = new DisposableMap<ISCMRepository>();

	constructor(
		options: IViewPaneOptions,
		@ISCMService private readonly scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService
	) {
		super({ ...options, titleMenuId: MenuId.SCMSourceControlTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.visibleCountObs = observableConfigValue('scm.repositories.visible', 10, this.configurationService);
		this.providerCountBadgeObs = observableConfigValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge', 'hidden', this.configurationService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const treeContainer = append(container, $('.scm-view.scm-repositories-view'));

		// scm.providerCountBadge setting
		this._register(autorun(reader => {
			const providerCountBadge = this.providerCountBadgeObs.read(reader);
			treeContainer.classList.toggle('hide-provider-counts', providerCountBadge === 'hidden');
			treeContainer.classList.toggle('auto-provider-counts', providerCountBadge === 'auto');
		}));

		this.createTree(treeContainer);

		this.onDidChangeBodyVisibility(async visible => {
			if (!visible) {
				this.visibilityDisposables.clear();
				return;
			}

			this.treeOperationSequencer.queue(async () => {
				// Initial rendering
				await this.tree.setInput(this.scmViewService);

				// scm.repositories.visible setting
				this.visibilityDisposables.add(autorun(reader => {
					const visibleCount = this.visibleCountObs.read(reader);
					this.updateBodySize(this.tree.contentHeight, visibleCount);
				}));

				// scm.repositories.explorer setting
				this.visibilityDisposables.add(runOnChange(this.scmViewService.explorerEnabledConfig, async () => {
					await this.updateChildren();
					this.updateBodySize(this.tree.contentHeight);
				}));

				// Update tree selection
				const onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(
					this, this.scmViewService.onDidChangeVisibleRepositories);

				this.visibilityDisposables.add(autorun(async reader => {
					onDidChangeVisibleRepositoriesSignal.read(reader);
					await this.treeOperationSequencer.queue(() => this.updateTreeSelection());
				}));

				// Add/Remove event handlers
				this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.visibilityDisposables);
				this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.visibilityDisposables);
				for (const repository of this.scmService.repositories) {
					this.onDidAddRepository(repository);
				}
			});
		}, this, this._store);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	private createTree(container: HTMLElement): void {
		this.treeIdentityProvider = new RepositoryTreeIdentityProvider();
		this.treeDataSource = this.instantiationService.createInstance(RepositoryTreeDataSource);
		this._register(this.treeDataSource);

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'SCM Repositories',
			container,
			new ListDelegate(),
			new RepositoriesTreeCompressionDelegate(),
			[
				this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(ArtifactGroupRenderer),
				this.instantiationService.createInstance(ArtifactRenderer)
			],
			this.treeDataSource,
			{
				identityProvider: this.treeIdentityProvider,
				horizontalScrolling: false,
				collapseByDefault: (e: unknown) => {
					if (this.scmViewService.explorerEnabledConfig.get() === false) {
						if (isSCMRepository(e) && e.provider.parentId === undefined) {
							return false;
						}
						return true;
					}

					// Explorer mode
					if (isSCMArtifactNode(e)) {
						// Only expand artifact folders as they are compressed by default
						return !(e.childrenCount === 1 && Iterable.first(e.children)?.element === undefined);
					} else {
						return true;
					}
				},
				compressionEnabled: true,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
				multipleSelectionSupport: this.scmViewService.selectionModeConfig.get() === 'multiple',
				expandOnDoubleClick: true,
				expandOnlyOnTwistieClick: true,
				accessibilityProvider: {
					getAriaLabel(element: TreeElement): string {
						if (isSCMRepository(element)) {
							return element.provider.label;
						} else if (isSCMArtifactGroupTreeElement(element)) {
							return element.artifactGroup.name;
						} else if (isSCMArtifactTreeElement(element)) {
							return element.artifact.name;
						} else {
							return '';
						}
					},
					getWidgetAriaLabel() {
						return localize('scm', "Source Control Repositories");
					}
				}
			}
		) as WorkbenchCompressibleAsyncDataTree<ISCMViewService, TreeElement>;
		this._register(this.tree);

		this._register(autorun(reader => {
			const selectionMode = this.scmViewService.selectionModeConfig.read(reader);
			this.tree.updateOptions({ multipleSelectionSupport: selectionMode === 'multiple' });
		}));

		this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
		this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
		this._register(this.tree.onDidFocus(this.onDidTreeFocus, this));
		this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
		this._register(this.tree.onDidChangeContentHeight(this.onTreeContentHeightChange, this));
	}

	private async onDidAddRepository(repository: ISCMRepository): Promise<void> {
		const disposables = new DisposableStore();

		disposables.add(autorun(async reader => {
			const artifactsProvider = repository.provider.artifactProvider.read(reader);
			if (!artifactsProvider) {
				return;
			}

			reader.store.add(artifactsProvider.onDidChangeArtifacts(async groups => {
				await this.updateRepository(repository);
			}));
		}));

		await this.updateRepository(repository);
		this.repositoryDisposables.set(repository, disposables);
	}

	private async onDidRemoveRepository(repository: ISCMRepository): Promise<void> {
		await this.updateRepository(repository);
		this.repositoryDisposables.deleteAndDispose(repository);
	}

	private onTreeContextMenu(e: ITreeContextMenuEvent<TreeElement>): void {
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
		} else if (isSCMArtifactTreeElement(e.element)) {
			// Artifact
			const provider = e.element.repository.provider;
			const artifact = e.element.artifact;

			const menus = this.scmViewService.menus.getRepositoryMenus(provider);
			const menu = menus.getArtifactMenu(e.element.group);
			const actions = collectContextMenuActions(menu, provider);

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				getActionsContext: () => artifact
			});
		}
	}

	private onTreeSelectionChange(e: ITreeEvent<TreeElement>): void {
		if (e.browserEvent && e.elements.length > 0) {
			const scrollTop = this.tree.scrollTop;

			if (e.elements.every(e => isSCMRepository(e))) {
				this.scmViewService.visibleRepositories = e.elements;
			} else if (e.elements.every(e => isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e))) {
				this.scmViewService.visibleRepositories = e.elements.map(e => e.repository);
			}

			this.tree.scrollTop = scrollTop;
		}
	}

	private onTreeDidChangeFocus(e: ITreeEvent<TreeElement>): void {
		if (e.browserEvent && e.elements.length > 0) {
			if (isSCMRepository(e.elements[0])) {
				this.scmViewService.focus(e.elements[0]);
			}
		}
	}

	private onDidTreeFocus(): void {
		const focused = this.tree.getFocus();
		if (focused.length > 0) {
			if (isSCMRepository(focused[0])) {
				this.scmViewService.focus(focused[0]);
			} else if (isSCMArtifactGroupTreeElement(focused[0]) || isSCMArtifactTreeElement(focused[0])) {
				this.scmViewService.focus(focused[0].repository);
			}
		}
	}

	private onTreeContentHeightChange(height: number): void {
		this.updateBodySize(height);

		// Refresh the selection
		this.treeOperationSequencer.queue(() => this.updateTreeSelection());
	}

	private async updateChildren(element?: TreeElement): Promise<void> {
		await this.treeOperationSequencer.queue(async () => {
			if (element && this.tree.hasNode(element)) {
				await this.tree.updateChildren(element, true);
			} else {
				await this.tree.updateChildren(undefined, true);
			}
		});
	}

	private async expand(element: TreeElement): Promise<void> {
		await this.treeOperationSequencer.queue(() => this.tree.expand(element, true));
	}

	private async updateRepository(repository: ISCMRepository): Promise<void> {
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

	private async updateParentRepository(repository: ISCMRepository): Promise<void> {
		const parentRepository = this.scmViewService.repositories
			.find(r => r.provider.id === repository.provider.parentId);
		if (!parentRepository) {
			return;
		}

		await this.updateChildren(parentRepository);
		await this.expand(parentRepository);
	}

	private updateBodySize(contentHeight: number, visibleCount?: number): void {
		if (this.orientation === Orientation.HORIZONTAL) {
			return;
		}

		if (this.scmViewService.explorerEnabledConfig.get() === false) {
			visibleCount = visibleCount ?? this.visibleCountObs.get();
			const empty = this.scmViewService.repositories.length === 0;
			const size = Math.min(contentHeight / 22, visibleCount) * 22;

			this.minimumBodySize = visibleCount === 0 ? 22 : size;
			this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
		} else {
			this.maximumBodySize = Number.POSITIVE_INFINITY;
		}
	}

	private async updateTreeSelection(): Promise<void> {
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

	private getTreeSelection(): ISCMRepository[] {
		return this.tree.getSelection()
			.map(e => {
				if (isSCMRepository(e)) {
					return e;
				} else if (isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e)) {
					return e.repository;
				} else if (isSCMArtifactNode(e)) {
					return e.context.repository;
				} else {
					throw new Error('Invalid tree element');
				}
			});
	}

	override dispose(): void {
		this.visibilityDisposables.dispose();
		super.dispose();
	}
}
