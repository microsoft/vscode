/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { localize } from '../../../../nls.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeEvent, ITreeContextMenuEvent, ITreeRenderer, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ISCMRepository, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactTreeElement, isSCMRepository } from './util.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { SCMArtifactGroupTreeElement, SCMArtifactTreeElement } from '../common/artifact.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

type TreeElement = ISCMRepository | SCMArtifactGroupTreeElement | SCMArtifactTreeElement;

class ListDelegate implements IListVirtualDelegate<TreeElement> {

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
	readonly templateDisposable: IDisposable;
}

class ArtifactGroupRenderer implements ITreeRenderer<SCMArtifactGroupTreeElement, FuzzyScore, ArtifactGroupTemplate> {

	static readonly TEMPLATE_ID = 'artifactGroup';
	get templateId(): string { return ArtifactGroupRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ArtifactGroupTemplate {
		const element = append(container, $('.scm-artifact-group'));
		const label = new IconLabel(element, { supportIcons: true });

		const templateDisposable = label;

		return { label, templateDisposable };
	}

	renderElement(node: ITreeNode<SCMArtifactGroupTreeElement, FuzzyScore>, index: number, templateData: ArtifactGroupTemplate): void {
		const artifactGroup = node.element.artifactGroup;
		const artifactGroupIcon = ThemeIcon.isThemeIcon(artifactGroup.icon)
			? `$(${artifactGroup.icon.id}) ` : '';

		templateData.label.setLabel(`${artifactGroupIcon}${artifactGroup.name}`);
	}

	disposeTemplate(templateData: ArtifactGroupTemplate): void {
		templateData.templateDisposable.dispose();
	}
}

interface ArtifactTemplate {
	readonly label: IconLabel;
	readonly templateDisposable: IDisposable;
}

class ArtifactRenderer implements ITreeRenderer<SCMArtifactTreeElement, FuzzyScore, ArtifactTemplate> {

	static readonly TEMPLATE_ID = 'artifact';
	get templateId(): string { return ArtifactRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ArtifactTemplate {
		const element = append(container, $('.scm-artifact'));
		const label = new IconLabel(element, { supportIcons: true });

		const templateDisposable = label;

		return { label, templateDisposable };
	}

	renderElement(node: ITreeNode<SCMArtifactTreeElement, FuzzyScore>, index: number, templateData: ArtifactTemplate): void {
		const element = node.element;
		templateData.label.setLabel(element.artifact.name);
	}

	disposeTemplate(templateData: ArtifactTemplate): void {
		templateData.templateDisposable.dispose();
	}
}

class RepositoryTreeDataSource extends Disposable implements IAsyncDataSource<SCMRepositoriesViewModel, TreeElement> {
	async getChildren(inputOrElement: SCMRepositoriesViewModel | TreeElement): Promise<TreeElement[]> {
		if (inputOrElement instanceof SCMRepositoriesViewModel) {
			return inputOrElement.repositories;
		}

		if (isSCMRepository(inputOrElement)) {
			const artifactGroups = await inputOrElement.provider.artifactProvider.get()?.provideArtifactGroups() ?? [];
			return artifactGroups.map(group => ({
				repository: inputOrElement,
				artifactGroup: group,
				type: 'artifactGroup'
			}));
		}

		if (isSCMArtifactGroupTreeElement(inputOrElement)) {
			const repository = inputOrElement.repository;
			const artifacts = await repository.provider.artifactProvider.get()?.provideArtifacts(inputOrElement.artifactGroup.id) ?? [];

			return artifacts.map(artifact => ({
				repository,
				group: inputOrElement.artifactGroup,
				artifact,
				type: 'artifact'
			}));
		}

		return [];
	}

	hasChildren(inputOrElement: SCMRepositoriesViewModel | TreeElement): boolean {
		return inputOrElement instanceof SCMRepositoriesViewModel ||
			isSCMRepository(inputOrElement) ||
			isSCMArtifactGroupTreeElement(inputOrElement);
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

class SCMRepositoriesViewModel extends Disposable {
	readonly onDidChangeRepositoriesSignal: IObservable<void>;
	readonly onDidChangeVisibleRepositoriesSignal: IObservable<void>;

	constructor(
		@ISCMViewService private readonly scmViewService: ISCMViewService
	) {
		super();

		this.onDidChangeRepositoriesSignal = observableSignalFromEvent(this,
			this.scmViewService.onDidChangeRepositories);
		this.onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(this,
			this.scmViewService.onDidChangeVisibleRepositories);
	}

	get repositories(): ISCMRepository[] {
		return this.scmViewService.repositories;
	}
}

export class SCMRepositoriesViewPane extends ViewPane {

	private tree!: WorkbenchCompressibleAsyncDataTree<SCMRepositoriesViewModel, TreeElement, any>;
	private treeViewModel!: SCMRepositoriesViewModel;
	private treeDataSource!: RepositoryTreeDataSource;
	private treeIdentityProvider!: RepositoryTreeIdentityProvider;

	private readonly visibleCountObs: IObservable<number>;
	private readonly providerCountBadgeObs: IObservable<'hidden' | 'auto' | 'visible'>;
	private readonly repositoryExplorerEnabledObs: IObservable<boolean>;

	private readonly visibilityDisposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@ISCMViewService protected scmViewService: ISCMViewService,
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
		this.repositoryExplorerEnabledObs = observableConfigValue('scm.repositoryExplorer.enabled', false, this.configurationService);
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

		this.onDidChangeBodyVisibility(visible => {
			if (!visible) {
				this.visibilityDisposables.clear();
				return;
			}

			this.treeViewModel = this.instantiationService.createInstance(SCMRepositoriesViewModel);
			this._register(this.treeViewModel);

			// Initial rendering
			this.tree.setInput(this.treeViewModel);

			// scm.repositories.visible setting
			this.visibilityDisposables.add(autorun(reader => {
				const visibleCount = this.visibleCountObs.read(reader);
				this.updateBodySize(visibleCount);
			}));

			// onDidChangeRepositoriesSignal
			this.visibilityDisposables.add(autorun(async reader => {
				this.treeViewModel.onDidChangeRepositoriesSignal.read(reader);
				await this.updateChildren();
			}));

			// onDidChangeVisibleRepositoriesSignal
			this.visibilityDisposables.add(autorun(async reader => {
				this.treeViewModel.onDidChangeVisibleRepositoriesSignal.read(reader);
				this.updateTreeSelection();
			}));
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
				compressionEnabled: compressionEnabled.get(),
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
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
		) as WorkbenchCompressibleAsyncDataTree<SCMRepositoriesViewModel, TreeElement, any>;
		this._register(this.tree);

		this._register(this.tree.onDidOpen(this.onTreeOpen, this));
		this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
		this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
		this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
	}

	private onTreeContextMenu(e: ITreeContextMenuEvent<TreeElement>): void {
		if (!e.element) {
			return;
		}

		const provider = e.element.provider;
		const menus = this.scmViewService.menus.getRepositoryMenus(provider);
		const menu = menus.repositoryContextMenu;
		const actions = collectContextMenuActions(menu);

		const disposables = new DisposableStore();
		const actionRunner = new RepositoryActionRunner(() => {
			return this.tree.getSelection();
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

	private onTreeOpen(e: IOpenEvent<TreeElement | undefined>): void {
		if (e.element && this.repositoryExplorerEnabledObs.get() === true) {
			this.scmViewService.focus(e.element);
		}
	}

	private onTreeSelectionChange(e: ITreeEvent<TreeElement>): void {
		if (e.browserEvent && e.elements.length > 0 && this.repositoryExplorerEnabledObs.get() === false) {
			const scrollTop = this.tree.scrollTop;
			this.scmViewService.visibleRepositories = e.elements;
			this.tree.scrollTop = scrollTop;
		}
	}

	private onTreeDidChangeFocus(e: ITreeEvent<TreeElement>): void {
		if (e.browserEvent && e.elements.length > 0) {
			this.scmViewService.focus(e.elements[0]);
		}
	}

	private async updateChildren(): Promise<void> {
		await this.tree.updateChildren(this.treeViewModel);
		this.updateBodySize(this.visibleCountObs.get());
	}

	private updateBodySize(visibleCount: number): void {
		if (this.orientation === Orientation.HORIZONTAL) {
			return;
		}

		if (this.repositoryExplorerEnabledObs.get() === true) {
			return;
		}

		const empty = this.scmViewService.repositories.length === 0;
		const size = Math.min(this.scmViewService.repositories.length, visibleCount) * 22;

		this.minimumBodySize = visibleCount === 0 ? 22 : size;
		this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
	}

	private updateTreeSelection(): void {
		const oldSelection = this.tree.getSelection();
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

		this.tree.setSelection(selection);

		if (selection.length > 0 && !this.tree.getFocus().includes(selection[0])) {
			this.tree.setAnchor(selection[0]);
			this.tree.setFocus([selection[0]]);
		}
	}

	override dispose(): void {
		this.visibilityDisposables.dispose();
		super.dispose();
	}
}
