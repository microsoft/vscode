/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, reset } from '../../../../base/browser/dom.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { EditorResourceAccessor, IEditorCommandsContext, SideBySideEditor } from '../../../common/editor.js';
import { BreadcrumbsControl, BreadcrumbsControlFactory } from './breadcrumbsControl.js';
import { IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupView, IEditorGroupViewOptions } from './editor.js';
import { EditorCommandsContextActionRunner } from './editorTabsControl.js';

export class EditorHeaderControl extends Disposable {

	static readonly DEFAULT_HEIGHT = 32;
	static readonly COMPACT_HEIGHT = 28;

	private readonly headerContainer: HTMLElement | undefined;
	private readonly actionsContainer: HTMLElement | undefined;
	private readonly primaryActionsContainer: HTMLElement | undefined;
	private readonly secondaryActionsContainer: HTMLElement | undefined;
	private readonly layoutActionsContainer: HTMLElement | undefined;
	private primaryActionsToolbar: MenuWorkbenchToolBar | undefined;
	private secondaryActionsToolbar: MenuWorkbenchToolBar | undefined;
	private layoutActionsToolbar: MenuWorkbenchToolBar | undefined;
	private readonly headerActions = this._register(new MutableDisposable());
	private readonly breadcrumbsContainer: HTMLElement | undefined;
	private readonly breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }
	private breadcrumbsVisible = false;
	private visible = false;

	get height(): number {
		if (this.headerContainer) {
			if (!this.visible) {
				return 0;
			}
			return this.groupsView.partOptions.tabHeight === 'compact' ? EditorHeaderControl.COMPACT_HEIGHT : EditorHeaderControl.DEFAULT_HEIGHT;
		}
		return this.breadcrumbsControl?.isHidden() === false ? BreadcrumbsControl.HEIGHT : 0;
	}

	constructor(
		parent: HTMLElement,
		private readonly groupView: IEditorGroupView,
		private readonly groupsView: IEditorGroupsView,
		private readonly menuIds: IEditorGroupMenuIds | undefined,
		showHeader: boolean,
		private readonly reserveHeaderSpace: IEditorGroupViewOptions['reserveHeaderSpace'],
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		let breadcrumbsParent = parent;
		if (showHeader) {
			this.headerContainer = breadcrumbsParent = append(parent, $('.editor-group-header.breadcrumbs-in-header'));
			this.actionsContainer = $('.editor-group-header-actions');
			this.primaryActionsContainer = append(this.actionsContainer, $('.editor-group-header-primary-actions'));
			this.secondaryActionsContainer = append(this.actionsContainer, $('.editor-group-header-secondary-actions'));
			this.layoutActionsContainer = append(this.actionsContainer, $('.editor-group-header-layout-actions'));
			this._register(toDisposable(() => this.headerContainer?.remove()));
			this._register(this.groupView.onDidActiveEditorChange(() => this.renderActions(true)));
		}

		if (showHeader || groupsView.partOptions.showTabs !== 'single') {
			this.breadcrumbsContainer = append(breadcrumbsParent, $('.breadcrumbs-below-tabs'));
			this.breadcrumbsControlFactory = this._register(this.instantiationService.createInstance(BreadcrumbsControlFactory, this.breadcrumbsContainer, this.groupView, {
				showFileIcons: true,
				showSymbolIcons: true,
				showDecorationColors: false,
				showPlaceholder: true,
				dragEditor: false,
				showEditorTypePicker: true,
			}));
			this._register(this.breadcrumbsControlFactory.onDidEnablementChange(() => this.updateBreadcrumbsVisibility(true)));
			this._register(this.breadcrumbsControlFactory.onDidVisibilityChange(() => this.updateBreadcrumbsVisibility(true)));
			this.updateBreadcrumbsVisibility(false);
		}

		if (this.headerContainer && this.actionsContainer) {
			this.headerContainer.appendChild(this.actionsContainer);
			this.renderActions(false);
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
		this.updateVisibility(false);
		if (this.headerContainer) {
			this.headerContainer.style.width = `${Math.max(0, width)}px`;
		}
		if (this.breadcrumbsControl?.isHidden() === false && this.breadcrumbsContainer) {
			let breadcrumbsWidth = 0;
			if (this.headerContainer) {
				breadcrumbsWidth = Math.max(0, this.breadcrumbsControl.domNode.clientWidth);
			} else {
				breadcrumbsWidth = Math.max(0, width);
				this.breadcrumbsContainer.style.width = `${breadcrumbsWidth}px`;
			}
			this.breadcrumbsControl.layout(new Dimension(breadcrumbsWidth, BreadcrumbsControl.HEIGHT));
		}
	}

	private updateBreadcrumbsVisibility(relayout: boolean): void {
		this.breadcrumbsVisible = this.breadcrumbsControl?.isHidden() === false;
		this.breadcrumbsContainer?.classList.toggle('hidden', !this.breadcrumbsVisible);
		this.updateVisibility(relayout);
	}

	private updateVisibility(relayout: boolean): void {
		if (!this.headerContainer || !this.actionsContainer || !this.primaryActionsContainer || !this.secondaryActionsContainer || !this.layoutActionsContainer) {
			if (relayout) {
				this.groupView.relayout();
			}
			return;
		}
		const hasPrimaryActions = (this.primaryActionsToolbar?.getItemsLength() ?? 0) > 0;
		const hasSecondaryActions = (this.secondaryActionsToolbar?.getItemsLength() ?? 0) > 0;
		const hasLayoutActions = (this.layoutActionsToolbar?.getItemsLength() ?? 0) > 0;
		const hasMenuActions = hasPrimaryActions || hasSecondaryActions || hasLayoutActions;
		this.primaryActionsContainer.style.display = hasPrimaryActions ? '' : 'none';
		this.secondaryActionsContainer.style.display = hasSecondaryActions ? '' : 'none';
		this.secondaryActionsContainer.style.marginLeft = hasPrimaryActions ? 'var(--vscode-spacing-size80, 8px)' : '';
		this.layoutActionsContainer.style.display = hasLayoutActions ? '' : 'none';
		this.layoutActionsContainer.style.marginLeft = hasSecondaryActions && hasLayoutActions ? 'var(--vscode-spacing-size40, 4px)' : '';
		this.actionsContainer.style.display = hasMenuActions ? '' : 'none';
		this.actionsContainer.style.flex = this.breadcrumbsVisible ? '0 1 auto' : '1 1 auto';
		this.actionsContainer.style.gridTemplateColumns = this.breadcrumbsVisible ? 'auto auto auto' : 'minmax(0, 1fr) auto auto';
		this.visible = this.breadcrumbsVisible || hasMenuActions || this.reserveHeaderSpace?.(this.groupView.activeEditor ?? undefined) === true;
		this.headerContainer.style.display = this.visible ? '' : 'none';
		if (relayout) {
			this.groupView.relayout();
		}
	}

	private renderActions(relayout: boolean): void {
		if (!this.primaryActionsContainer || !this.secondaryActionsContainer || !this.layoutActionsContainer) {
			return;
		}
		this.headerActions.clear();
		this.primaryActionsToolbar = undefined;
		this.secondaryActionsToolbar = undefined;
		this.layoutActionsToolbar = undefined;
		reset(this.primaryActionsContainer);
		reset(this.secondaryActionsContainer);
		reset(this.layoutActionsContainer);

		const headerPrimaryMenuId = this.menuIds?.headerPrimary;
		const headerSecondaryMenuId = this.menuIds?.headerSecondary;
		const headerLayoutMenuId = this.menuIds?.headerLayout;
		if (!headerPrimaryMenuId && !headerSecondaryMenuId && !headerLayoutMenuId) {
			this.updateVisibility(relayout);
			return;
		}

		const store = new DisposableStore();
		const activeEditor = this.groupView.activeEditor;
		if (activeEditor) {
			store.add(activeEditor.onDidChangeLabel(() => this.renderActions(true)));
		}
		const scopedInstantiationService = this.groupView.activeEditorPane?.scopedInstantiationService ?? this.instantiationService;
		// Run header actions with the same group context as the editor actions in the tab bar.
		const context: IEditorCommandsContext = { groupId: this.groupView.id };
		const actionRunner = store.add(new EditorCommandsContextActionRunner(context));
		store.add(actionRunner.onDidRun(e => {
			if (e.error && !isCancellationError(e.error)) {
				this.notificationService.error(e.error);
			}
		}));
		const createToolbarOptions = (ariaLabel: string, trailingSeparator = false) => ({
			ariaLabel,
			trailingSeparator,
			actionRunner,
			menuOptions: {
				arg: EditorResourceAccessor.getOriginalUri(this.groupView.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }),
				shouldForwardArgs: true,
			},
			highlightToggledItems: true,
			toolbarOptions: { primaryGroup: (group: string) => !group.startsWith('secondary/'), useSeparatorsInPrimaryActions: true }
		});
		const createToolbar = (container: HTMLElement, menuId: MenuId, ariaLabel: string, trailingSeparator = false) => {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, container, menuId, createToolbarOptions(ariaLabel, trailingSeparator)));
			toolbar.context = context;
			return toolbar;
		};
		if (headerPrimaryMenuId) {
			this.primaryActionsToolbar = createToolbar(this.primaryActionsContainer, headerPrimaryMenuId, localize('ariaLabelEditorHeaderPrimaryActions', "Editor primary actions"));
			store.add(this.primaryActionsToolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		if (headerLayoutMenuId) {
			this.layoutActionsToolbar = createToolbar(this.layoutActionsContainer, headerLayoutMenuId, localize('ariaLabelEditorHeaderLayoutActions', "Editor layout actions"));
			store.add(this.layoutActionsToolbar.onDidChangeMenuItems(() => this.renderActions(true)));
		}
		if (headerSecondaryMenuId) {
			const hasLayoutActions = (this.layoutActionsToolbar?.getItemsLength() ?? 0) > 0;
			this.secondaryActionsToolbar = createToolbar(this.secondaryActionsContainer, headerSecondaryMenuId, localize('ariaLabelEditorHeaderActions', "Editor actions"), hasLayoutActions);
			store.add(this.secondaryActionsToolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		this.headerActions.value = store;
		this.updateVisibility(relayout);
	}
}
