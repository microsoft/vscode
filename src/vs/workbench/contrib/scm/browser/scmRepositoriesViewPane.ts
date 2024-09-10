/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { localize } from '../../../../nls.js';
import { Event } from '../../../../base/common/event.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { append, $ } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IListContextMenuEvent, IListEvent } from '../../../../base/browser/ui/list/list.js';
import { ISCMRepository, ISCMViewService } from '../common/scm.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { collectContextMenuActions, getActionViewItemProvider } from './util.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

class ListDelegate implements IListVirtualDelegate<ISCMRepository> {

	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return RepositoryRenderer.TEMPLATE_ID;
	}
}

export class SCMRepositoriesViewPane extends ViewPane {

	private list!: WorkbenchList<ISCMRepository>;
	private readonly disposables = new DisposableStore();

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
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService
	) {
		super({ ...options, titleMenuId: MenuId.SCMSourceControlTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const listContainer = append(container, $('.scm-view.scm-repositories-view'));

		const updateProviderCountVisibility = () => {
			const value = this.configurationService.getValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge');
			listContainer.classList.toggle('hide-provider-counts', value === 'hidden');
			listContainer.classList.toggle('auto-provider-counts', value === 'auto');
		};
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.providerCountBadge'), this.disposables)(updateProviderCountVisibility));
		updateProviderCountVisibility();

		const delegate = new ListDelegate();
		const renderer = this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService));
		const identityProvider = { getId: (r: ISCMRepository) => r.provider.id };

		this.list = this.instantiationService.createInstance(WorkbenchList, `SCM Main`, listContainer, delegate, [renderer], {
			identityProvider,
			horizontalScrolling: false,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			accessibilityProvider: {
				getAriaLabel(r: ISCMRepository) {
					return r.provider.label;
				},
				getWidgetAriaLabel() {
					return localize('scm', "Source Control Repositories");
				}
			}
		}) as WorkbenchList<ISCMRepository>;

		this._register(this.list);
		this._register(this.list.onDidChangeSelection(this.onListSelectionChange, this));
		this._register(this.list.onContextMenu(this.onListContextMenu, this));

		this._register(this.scmViewService.onDidChangeRepositories(this.onDidChangeRepositories, this));
		this._register(this.scmViewService.onDidChangeVisibleRepositories(this.updateListSelection, this));

		if (this.orientation === Orientation.VERTICAL) {
			this._register(this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('scm.repositories.visible')) {
					this.updateBodySize();
				}
			}));
		}

		this.onDidChangeRepositories();
		this.updateListSelection();
	}

	private onDidChangeRepositories(): void {
		this.list.splice(0, this.list.length, this.scmViewService.repositories);
		this.updateBodySize();
	}

	override focus(): void {
		super.focus();
		this.list.domFocus();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.list.layout(height, width);
	}

	private updateBodySize(): void {
		if (this.orientation === Orientation.HORIZONTAL) {
			return;
		}

		const visibleCount = this.configurationService.getValue<number>('scm.repositories.visible');
		const empty = this.list.length === 0;
		const size = Math.min(this.list.length, visibleCount) * 22;

		this.minimumBodySize = visibleCount === 0 ? 22 : size;
		this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
	}

	private onListContextMenu(e: IListContextMenuEvent<ISCMRepository>): void {
		if (!e.element) {
			return;
		}

		const provider = e.element.provider;
		const menus = this.scmViewService.menus.getRepositoryMenus(provider);
		const menu = menus.repositoryContextMenu;
		const actions = collectContextMenuActions(menu);

		const actionRunner = this._register(new RepositoryActionRunner(() => {
			return this.list.getSelectedElements();
		}));
		actionRunner.onWillRun(() => this.list.domFocus());

		this.contextMenuService.showContextMenu({
			actionRunner,
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => provider
		});
	}

	private onListSelectionChange(e: IListEvent<ISCMRepository>): void {
		if (e.browserEvent && e.elements.length > 0) {
			const scrollTop = this.list.scrollTop;
			this.scmViewService.visibleRepositories = e.elements;
			this.list.scrollTop = scrollTop;
		}
	}

	private updateListSelection(): void {
		const oldSelection = this.list.getSelection();
		const oldSet = new Set(Iterable.map(oldSelection, i => this.list.element(i)));
		const set = new Set(this.scmViewService.visibleRepositories);
		const added = new Set(Iterable.filter(set, r => !oldSet.has(r)));
		const removed = new Set(Iterable.filter(oldSet, r => !set.has(r)));

		if (added.size === 0 && removed.size === 0) {
			return;
		}

		const selection = oldSelection
			.filter(i => !removed.has(this.list.element(i)));

		for (let i = 0; i < this.list.length; i++) {
			if (added.has(this.list.element(i))) {
				selection.push(i);
			}
		}

		this.list.setSelection(selection);

		if (selection.length > 0 && selection.indexOf(this.list.getFocus()[0]) === -1) {
			this.list.setAnchor(selection[0]);
			this.list.setFocus([selection[0]]);
		}
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}
