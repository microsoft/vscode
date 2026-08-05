/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, reset } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { BreadcrumbsControl, BreadcrumbsControlFactory } from './breadcrumbsControl.js';
import { IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupView } from './editor.js';
import { IBreadcrumbsModelOptions } from './breadcrumbsModel.js';

export class EditorHeaderControl extends Disposable {

	static readonly HEIGHT = 29;

	private readonly element: HTMLElement | undefined;
	private readonly primaryActionsContainer: HTMLElement | undefined;
	private readonly secondaryActionsContainer: HTMLElement | undefined;
	private readonly headerActions = this._register(new MutableDisposable());
	private readonly breadcrumbsContainer: HTMLElement | undefined;
	private readonly breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }
	private breadcrumbsVisible = false;
	private visible = false;

	get height(): number {
		if (this.showHeader) {
			return this.visible ? EditorHeaderControl.HEIGHT : 0;
		}
		return this.breadcrumbsControl?.isHidden() === false ? BreadcrumbsControl.HEIGHT : 0;
	}

	constructor(
		parent: HTMLElement,
		private readonly groupView: IEditorGroupView,
		groupsView: IEditorGroupsView,
		private readonly menuIds: IEditorGroupMenuIds | undefined,
		private readonly showHeader: boolean,
		headerBreadcrumbs: IBreadcrumbsModelOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		let breadcrumbsParent = parent;
		if (this.showHeader) {
			this.element = append(parent, $('.editor-group-header'));
			const headerContentContainer = append(this.element, $('.editor-group-header-content.editor-group-header-toolbars'));
			const primaryContainer = append(headerContentContainer, $('.editor-group-header-primary.breadcrumbs-in-header'));
			const secondaryContainer = append(headerContentContainer, $('.editor-group-header-secondary'));
			breadcrumbsParent = primaryContainer;
			this.primaryActionsContainer = append(primaryContainer, $('.editor-group-header-primary-actions.has-no-actions'));
			this.secondaryActionsContainer = append(secondaryContainer, $('.editor-group-header-secondary-actions.has-no-actions'));
			this._register(toDisposable(() => this.element?.remove()));
			this._register(this.groupView.onDidActiveEditorChange(() => this.renderActions(true)));
			this.renderActions(false);
		}

		if (groupsView.partOptions.showTabs !== 'single') {
			this.breadcrumbsContainer = append(breadcrumbsParent, $('.breadcrumbs-below-tabs'));
			this.breadcrumbsControlFactory = this._register(this.instantiationService.createInstance(BreadcrumbsControlFactory, this.breadcrumbsContainer, this.groupView, {
				showFileIcons: true,
				showSymbolIcons: true,
				showDecorationColors: false,
				showPlaceholder: true,
				dragEditor: false,
				showEditorTypePicker: true,
				modelOptions: headerBreadcrumbs,
			}));
			this._register(this.breadcrumbsControlFactory.onDidEnablementChange(() => this.updateBreadcrumbsVisibility(true)));
			this._register(this.breadcrumbsControlFactory.onDidVisibilityChange(() => this.updateBreadcrumbsVisibility(true)));
			this.updateBreadcrumbsVisibility(false);
		}
	}

	handleEditorsChange(changed: boolean): void {
		if (changed) {
			this.breadcrumbsControl?.update();
		} else {
			this.breadcrumbsControl?.revealLast();
		}
	}

	layout(width: number): void {
		if (this.breadcrumbsControl?.isHidden() === false && this.breadcrumbsContainer) {
			const breadcrumbsWidth = Math.max(0, width);
			this.breadcrumbsContainer.style.width = `${breadcrumbsWidth}px`;
			this.breadcrumbsControl.layout(new Dimension(breadcrumbsWidth, BreadcrumbsControl.HEIGHT));
		}
	}

	private updateBreadcrumbsVisibility(relayout: boolean): void {
		this.breadcrumbsVisible = this.breadcrumbsControl?.isHidden() === false;
		this.breadcrumbsContainer?.classList.toggle('hidden', !this.breadcrumbsVisible);
		this.updateVisibility(relayout);
	}

	private updateVisibility(relayout: boolean): void {
		if (!this.showHeader || !this.element || !this.primaryActionsContainer || !this.secondaryActionsContainer) {
			if (relayout) {
				this.groupView.relayout();
			}
			return;
		}
		const hasMenuActions = !this.primaryActionsContainer.classList.contains('has-no-actions')
			|| !this.secondaryActionsContainer.classList.contains('has-no-actions');
		this.visible = this.breadcrumbsVisible || hasMenuActions;
		this.element.style.display = this.visible ? '' : 'none';
		if (relayout) {
			this.groupView.relayout();
		}
	}

	private renderActions(relayout: boolean): void {
		if (!this.primaryActionsContainer || !this.secondaryActionsContainer) {
			return;
		}
		this.headerActions.clear();
		reset(this.primaryActionsContainer);
		reset(this.secondaryActionsContainer);
		this.primaryActionsContainer.classList.add('has-no-actions');
		this.secondaryActionsContainer.classList.add('has-no-actions');

		const headerPrimaryMenuId = this.menuIds?.headerPrimary;
		const headerSecondaryMenuId = this.menuIds?.headerSecondary;
		if (!headerPrimaryMenuId && !headerSecondaryMenuId) {
			this.updateVisibility(relayout);
			return;
		}

		const store = new DisposableStore();
		const scopedInstantiationService = this.groupView.activeEditorPane?.scopedInstantiationService ?? this.instantiationService;
		const toolbarOptions = {
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
			toolbarOptions: { primaryGroup: (group: string) => group !== 'secondary', useSeparatorsInPrimaryActions: true }
		};
		if (headerPrimaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.primaryActionsContainer, headerPrimaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		if (headerSecondaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryActionsContainer, headerSecondaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		this.headerActions.value = store;
		this.updateVisibility(relayout);
	}
}
