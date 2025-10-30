/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { localize } from '../../../../nls.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeEvent, ITreeContextMenuEvent, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ISCMRepository, ISCMService, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactTreeElement, isSCMRepository } from './util.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun, IObservable, observableFromEvent, observableSignalFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { Sequencer } from '../../../../base/common/async.js';
import { SCMArtifactGroupTreeElement, SCMArtifactTreeElement } from '../common/artifact.js';
import { FuzzyScore } from '../../../../base/common/fuzzyScorer.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SCMViewService } from './scmViewService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';

type TreeElement = ISCMRepository | SCMArtifactGroupTreeElement | SCMArtifactTreeElement;

class ListDelegate implements IListVirtualDelegate<ISCMRepository> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(element: TreeElement): string {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMArtifactGroupTreeElement(element)) {
			return ArtifactGroupRenderer.TEMPLATE_ID;
		} else if (isSCMArtifactTreeElement(element)) {
			return ArtifactRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Invalid tree element');
		}
	}
}

interface ArtifactGroupTemplate {
	readonly label: IconLabel;
	readonly actionBar: WorkbenchToolBar;
	readonly templateDisposable: IDisposable;
}

class ArtifactGroupRenderer implements ITreeRenderer<SCMArtifactGroupTreeElement, FuzzyScore, ArtifactGroupTemplate> {

	static readonly TEMPLATE_ID = 'artifactGroup';
	get templateId(): string { return ArtifactGroupRenderer.TEMPLATE_ID; }

	constructor(
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): ArtifactGroupTemplate {
		const element = append(container, $('.scm-artifact-group'));
		const label = new IconLabel(element, { supportIcons: true });

		const actionsContainer = append(element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);

		return { label, actionBar, templateDisposable: combinedDisposable(label, actionBar) };
	}

	renderElement(node: ITreeNode<SCMArtifactGroupTreeElement, FuzzyScore>, index: number, templateData: ArtifactGroupTemplate): void {
		const provider = node.element.repository.provider;
		const artifactGroup = node.element.artifactGroup;
		const artifactGroupIcon = ThemeIcon.isThemeIcon(artifactGroup.icon)
			? `$(${artifactGroup.icon.id}) ` : '';

		templateData.label.setLabel(`${artifactGroupIcon}${artifactGroup.name}`);

		const actions = this._menuService.getMenuActions(
			MenuId.SCMArtifactGroupContext,
			this._contextKeyService.createOverlay([['scmArtifactGroup', artifactGroup.id]]),
			{ arg: provider, shouldForwardArgs: true });

		templateData.actionBar.context = node.element.artifactGroup;
		templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
	}

	disposeTemplate(templateData: ArtifactGroupTemplate): void {
		templateData.templateDisposable.dispose();
	}
}

interface ArtifactTemplate {
	readonly label: IconLabel;
	readonly actionBar: WorkbenchToolBar;
	readonly templateDisposable: IDisposable;
}

class ArtifactRenderer implements ITreeRenderer<SCMArtifactTreeElement, FuzzyScore, ArtifactTemplate> {

	static readonly TEMPLATE_ID = 'artifact';
	get templateId(): string { return ArtifactRenderer.TEMPLATE_ID; }

	constructor(
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) { }

	renderTemplate(container: HTMLElement): ArtifactTemplate {
		const element = append(container, $('.scm-artifact'));
		const label = new IconLabel(element, { supportIcons: true });

		const actionsContainer = append(element, $('.actions'));
		const actionBar = new WorkbenchToolBar(actionsContainer, undefined, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);

		return { label, actionBar, templateDisposable: combinedDisposable(label, actionBar) };
	}

	renderElement(node: ITreeNode<SCMArtifactTreeElement, FuzzyScore>, index: number, templateData: ArtifactTemplate): void {
		const provider = node.element.repository.provider;
		const artifact = node.element.artifact;

		const artifactGroup = node.element.group;
		const artifactGroupIcon = ThemeIcon.isThemeIcon(artifactGroup.icon)
			? `$(${artifactGroup.icon.id}) ` : '';

		templateData.label.setLabel(`${artifactGroupIcon}${artifact.name}`, artifact.description);

		const actions = this._menuService.getMenuActions(
			MenuId.SCMArtifactContext,
			this._contextKeyService.createOverlay([['scmArtifactGroup', artifactGroup.id]]),
			{ arg: provider, shouldForwardArgs: true });

		templateData.actionBar.context = node.element.artifact;
		templateData.actionBar.setActions(getActionBarActions(actions, 'inline').primary);
	}

	disposeTemplate(templateData: ArtifactTemplate): void {
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

			return artifacts.map(artifact => ({
				repository,
				group: inputOrElement.artifactGroup,
				artifact,
				type: 'artifact'
			}));
		} else if (isSCMArtifactTreeElement(inputOrElement)) {
			return [];
		} else {
			return [];
		}
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
		} else {
			throw new Error('Invalid tree element');
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

				// Update tree (add/remove repositories)
				const addedRepositoryObs = observableFromEvent(
					this, this.scmService.onDidAddRepository, e => e);

				const removedRepositoryObs = observableFromEvent(
					this, this.scmService.onDidRemoveRepository, e => e);

				this.visibilityDisposables.add(autorun(async reader => {
					const addedRepository = addedRepositoryObs.read(reader);
					const removedRepository = removedRepositoryObs.read(reader);

					if (addedRepository === undefined && removedRepository === undefined) {
						await this.updateChildren();
						return;
					}

					if (addedRepository) {
						await this.updateRepository(addedRepository);
					}

					if (removedRepository) {
						await this.updateRepository(removedRepository);
					}
				}));

				// Update tree selection
				const onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(
					this, this.scmViewService.onDidChangeVisibleRepositories);

				this.visibilityDisposables.add(autorun(async reader => {
					onDidChangeVisibleRepositoriesSignal.read(reader);
					await this.treeOperationSequencer.queue(() => this.updateTreeSelection());
				}));
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

		const compressionEnabled = observableConfigValue('scm.compactFolders', true, this.configurationService);

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'SCM Repositories',
			container,
			new ListDelegate(),
			{
				isIncompressible: () => true
			},
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
					return true;
				},
				compressionEnabled: compressionEnabled.get(),
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
				multipleSelectionSupport: this.scmViewService.selectionModeConfig.get() === 'multiple',
				expandOnDoubleClick: false,
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

	private onTreeContextMenu(e: ITreeContextMenuEvent<TreeElement>): void {
		if (!e.element) {
			return;
		}

		if (!isSCMRepository(e.element)) {
			return;
		}

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
