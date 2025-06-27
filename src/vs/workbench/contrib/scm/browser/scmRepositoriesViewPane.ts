/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { localize } from '../../../../nls.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeEvent, ITreeContextMenuEvent } from '../../../../base/browser/ui/tree/tree.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ISCMRepository, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, getActionViewItemProvider } from './util.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';

class ListDelegate implements IListVirtualDelegate<ISCMRepository> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return RepositoryRenderer.TEMPLATE_ID;
	}
}

class RepositoryTreeDataSource extends Disposable implements IAsyncDataSource<SCMRepositoriesViewModel, ISCMRepository> {
	async getChildren(inputOrElement: SCMRepositoriesViewModel | ISCMRepository): Promise<Iterable<ISCMRepository>> {
		if (inputOrElement instanceof SCMRepositoriesViewModel) {
			return inputOrElement.repositories;
		}
		return [];
	}

	hasChildren(inputOrElement: SCMRepositoriesViewModel | ISCMRepository): boolean {
		return inputOrElement instanceof SCMRepositoriesViewModel;
	}
}

class RepositoryTreeIdentityProvider implements IIdentityProvider<ISCMRepository> {
	getId(element: ISCMRepository): string {
		return element.provider.id;
	}
}

class SCMRepositoriesViewModel extends Disposable {
	constructor(
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) {
		super();
	}

	get repositories(): ISCMRepository[] {
		return this._scmViewService.repositories;
	}
}

export class SCMRepositoriesViewPane extends ViewPane {

	private tree!: WorkbenchCompressibleAsyncDataTree<SCMRepositoriesViewModel, ISCMRepository, any>;
	private treeViewModel!: SCMRepositoriesViewModel;
	private treeDataSource!: RepositoryTreeDataSource;
	private treeIdentityProvider!: RepositoryTreeIdentityProvider;

	private readonly visibleCountObs: IObservable<number>;
	private readonly providerCountBadgeObs: IObservable<'hidden' | 'auto' | 'visible'>;

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

			this.scmViewService.onDidChangeRepositories(this.onDidChangeRepositories, this, this.visibilityDisposables);
			this.scmViewService.onDidChangeVisibleRepositories(this.updateTreeSelection, this, this.visibilityDisposables);

			this.onDidChangeRepositories();
			this.updateTreeSelection();
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
				this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService))
			],
			this.treeDataSource,
			{
				identityProvider: this.treeIdentityProvider,
				horizontalScrolling: false,
				compressionEnabled: compressionEnabled.get(),
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
				accessibilityProvider: {
					getAriaLabel(r: ISCMRepository) {
						return r.provider.label;
					},
					getWidgetAriaLabel() {
						return localize('scm', "Source Control Repositories");
					}
				}
			}
		) as WorkbenchCompressibleAsyncDataTree<SCMRepositoriesViewModel, ISCMRepository, any>;
		this._register(this.tree);

		this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
		this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
		this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
	}

	private async onDidChangeRepositories(): Promise<void> {
		await this.tree.updateChildren(this.treeViewModel);
		this.updateBodySize(this.visibleCountObs.get());
	}

	private onTreeContextMenu(e: ITreeContextMenuEvent<ISCMRepository>): void {
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

	private onTreeSelectionChange(e: ITreeEvent<ISCMRepository>): void {
		if (e.browserEvent && e.elements.length > 0) {
			const scrollTop = this.tree.scrollTop;
			this.scmViewService.visibleRepositories = e.elements;
			this.tree.scrollTop = scrollTop;
		}
	}

	private onTreeDidChangeFocus(e: ITreeEvent<ISCMRepository>): void {
		if (e.browserEvent && e.elements.length > 0) {
			this.scmViewService.focus(e.elements[0]);
		}
	}

	private updateBodySize(visibleCount: number): void {
		if (this.orientation === Orientation.HORIZONTAL) {
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
