/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editortitlecontrol.css';
import { $, append, Dimension, clearNode, reset } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { BreadcrumbsControl, BreadcrumbsControlFactory } from './breadcrumbsControl.js';
import { IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupTitleHeight, IEditorGroupView, IEditorPartsView, IInternalEditorOpenOptions } from './editor.js';
import { IEditorTabsControl } from './editorTabsControl.js';
import { MultiEditorTabsControl } from './multiEditorTabsControl.js';
import { SingleEditorTabsControl } from './singleEditorTabsControl.js';
import { IEditorPartOptions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MultiRowEditorControl } from './multiRowEditorTabsControl.js';
import { IReadonlyEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { NoEditorTabsControl } from './noEditorTabsControl.js';

export interface IEditorTitleControlDimensions {

	/**
	 * The size of the parent container the title control is layed out in.
	 */
	readonly container: Dimension;

	/**
	 * The maximum size the title control is allowed to consume based on
	 * other controls that are positioned inside the container.
	 */
	readonly available: Dimension;
}

export class EditorTitleControl extends Themable {

	static readonly HEADER_HEIGHT = 29;

	private editorTabsControl: IEditorTabsControl;
	private readonly editorTabsControlDisposable = this._register(new DisposableStore());

	private breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private breadcrumbsContainer: HTMLElement | undefined;
	private readonly breadcrumbsControlDisposables = this._register(new DisposableStore());
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }

	private headerContainer: HTMLElement | undefined;
	private headerPrimaryContainer: HTMLElement | undefined;
	private headerPrimaryActionsContainer: HTMLElement | undefined;
	private headerSecondaryActionsContainer: HTMLElement | undefined;
	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly headerActions = this._register(new MutableDisposable());
	private headerVisible = false;

	constructor(
		private readonly parent: HTMLElement,
		private readonly editorPartsView: IEditorPartsView,
		private readonly groupsView: IEditorGroupsView,
		private readonly groupView: IEditorGroupView,
		private readonly model: IReadonlyEditorGroupModel,
		private readonly menuIds: IEditorGroupMenuIds | undefined,
		private readonly showHeader: boolean,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.editorTabsControl = this.createEditorTabsControl();
		const header = this.createHeader();
		this.breadcrumbsControlFactory = this.createBreadcrumbsControl(header);
		this._register(this.groupView.onDidActiveEditorChange(() => this.renderHeaderActions(true)));
		this.renderHeaderActions(false);
	}

	private createEditorTabsControl(): IEditorTabsControl {
		let tabsControlType;
		switch (this.groupsView.partOptions.showTabs) {
			case 'none':
				tabsControlType = NoEditorTabsControl;
				break;
			case 'single':
				tabsControlType = SingleEditorTabsControl;
				break;
			case 'multiple':
			default:
				tabsControlType = this.groupsView.partOptions.pinnedTabsOnSeparateRow ? MultiRowEditorControl : MultiEditorTabsControl;
				break;
		}

		const control = this.instantiationService.createInstance(tabsControlType, this.parent, this.editorPartsView, this.groupsView, this.groupView, this.model, this.menuIds);
		return this.editorTabsControlDisposable.add(control);
	}

	private createHeader(): HTMLElement {
		if (!this.showHeader) {
			return this.parent;
		}

		this.headerContainer = append(this.parent, $('.editor-group-header'));
		const headerContentContainer = append(this.headerContainer, $('.editor-group-header-content.editor-group-header-toolbars'));
		this.headerPrimaryContainer = append(headerContentContainer, $('.editor-group-header-primary.breadcrumbs-in-header'));
		const headerSecondaryContainer = append(headerContentContainer, $('.editor-group-header-secondary'));
		this.headerPrimaryActionsContainer = append(this.headerPrimaryContainer, $('.editor-group-header-primary-actions.has-no-actions'));
		this.headerSecondaryActionsContainer = append(headerSecondaryContainer, $('.editor-group-header-secondary-actions.has-no-actions'));
		this.headerDisposables.add(toDisposable(() => {
			this.headerActions.clear();
			this.headerContainer = undefined;
			this.headerPrimaryContainer = undefined;
			this.headerPrimaryActionsContainer = undefined;
			this.headerSecondaryActionsContainer = undefined;
			this.headerVisible = false;
		}));

		return this.headerPrimaryContainer;
	}

	private updateHeaderVisibility(relayout: boolean): void {
		if (!this.showHeader || !this.headerContainer || !this.headerPrimaryActionsContainer || !this.headerSecondaryActionsContainer) {
			if (relayout) {
				this.groupView.relayout();
			}
			return;
		}

		const hasBreadcrumbs = this.breadcrumbsControl?.isHidden() === false;
		this.breadcrumbsContainer?.classList.toggle('hidden', !hasBreadcrumbs);
		const hasMenuActions = !this.headerPrimaryActionsContainer.classList.contains('has-no-actions')
			|| !this.headerSecondaryActionsContainer.classList.contains('has-no-actions');
		const visible = hasBreadcrumbs || hasMenuActions;
		this.headerContainer.style.display = visible ? '' : 'none';
		this.headerVisible = visible;
		if (relayout) {
			this.groupView.relayout();
		}
	}

	private renderHeaderActions(relayout: boolean): void {
		this.headerActions.clear();
		if (!this.showHeader || !this.headerPrimaryActionsContainer || !this.headerSecondaryActionsContainer) {
			return;
		}

		reset(this.headerPrimaryActionsContainer);
		reset(this.headerSecondaryActionsContainer);
		this.headerPrimaryActionsContainer.classList.add('has-no-actions');
		this.headerSecondaryActionsContainer.classList.add('has-no-actions');

		const headerPrimaryMenuId = this.menuIds?.headerPrimary;
		const headerSecondaryMenuId = this.menuIds?.headerSecondary;
		if (!headerPrimaryMenuId && !headerSecondaryMenuId) {
			this.updateHeaderVisibility(relayout);
			return;
		}

		const store = new DisposableStore();
		const scopedInstantiationService = this.groupView.activeEditorPane?.getScopedInstantiationService?.() ?? this.instantiationService;
		const toolbarOptions = {
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
			toolbarOptions: { primaryGroup: (group: string) => group !== 'secondary', useSeparatorsInPrimaryActions: true }
		};
		if (headerPrimaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.headerPrimaryActionsContainer, headerPrimaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateHeaderVisibility(true)));
		}
		if (headerSecondaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.headerSecondaryActionsContainer, headerSecondaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateHeaderVisibility(true)));
		}
		this.headerActions.value = store;
		this.updateHeaderVisibility(relayout);
	}

	private createBreadcrumbsControl(parent: HTMLElement): BreadcrumbsControlFactory | undefined {
		if (this.groupsView.partOptions.showTabs === 'single') {
			this.breadcrumbsContainer = undefined;
			return undefined; // Single tabs have breadcrumbs inlined. No tabs have no breadcrumbs.
		}
		const breadcrumbsContainer = this.breadcrumbsContainer = $('.breadcrumbs-below-tabs');
		parent.appendChild(breadcrumbsContainer);

		const breadcrumbsControlFactory = this.breadcrumbsControlDisposables.add(this.instantiationService.createInstance(BreadcrumbsControlFactory, breadcrumbsContainer, this.groupView, {
			showFileIcons: true,
			showSymbolIcons: true,
			showDecorationColors: false,
			showPlaceholder: true,
			dragEditor: false,
			showEditorTypePicker: true,
		}));

		this.breadcrumbsControlDisposables.add(breadcrumbsControlFactory.onDidEnablementChange(() => this.updateHeaderVisibility(true)));
		this.breadcrumbsControlDisposables.add(breadcrumbsControlFactory.onDidVisibilityChange(() => this.updateHeaderVisibility(true)));
		this.updateHeaderVisibility(false);

		return breadcrumbsControlFactory;
	}

	openEditor(editor: EditorInput, options?: IInternalEditorOpenOptions): void {
		const didChange = this.editorTabsControl.openEditor(editor, options);

		this.handleOpenedEditors(didChange);
	}

	openEditors(editors: EditorInput[]): void {
		const didChange = this.editorTabsControl.openEditors(editors);

		this.handleOpenedEditors(didChange);
	}

	private handleOpenedEditors(didChange: boolean): void {
		if (didChange) {
			this.breadcrumbsControl?.update();
		} else {
			this.breadcrumbsControl?.revealLast();
		}
	}

	beforeCloseEditor(editor: EditorInput): void {
		return this.editorTabsControl.beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		this.editorTabsControl.closeEditor(editor);

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		this.editorTabsControl.closeEditors(editors);

		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		if (!this.groupView.activeEditor) {
			this.breadcrumbsControl?.update();
		}
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange: boolean): void {
		return this.editorTabsControl.moveEditor(editor, fromIndex, targetIndex, stickyStateChange);
	}

	pinEditor(editor: EditorInput): void {
		return this.editorTabsControl.pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		return this.editorTabsControl.stickEditor(editor);
	}

	unstickEditor(editor: EditorInput): void {
		return this.editorTabsControl.unstickEditor(editor);
	}

	setActive(isActive: boolean): void {
		return this.editorTabsControl.setActive(isActive);
	}

	updateEditorSelections(): void {
		this.editorTabsControl.updateEditorSelections();
	}

	updateEditorLabel(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {

		// Update editor tabs control if options changed
		if (
			oldOptions.showTabs !== newOptions.showTabs ||
			(newOptions.showTabs !== 'single' && oldOptions.pinnedTabsOnSeparateRow !== newOptions.pinnedTabsOnSeparateRow)
		) {
			// Clear old
			this.editorTabsControlDisposable.clear();
			this.breadcrumbsControlDisposables.clear();
			this.headerDisposables.clear();
			clearNode(this.parent);

			// Create new
			this.editorTabsControl = this.createEditorTabsControl();
			const header = this.createHeader();
			this.breadcrumbsControlFactory = this.createBreadcrumbsControl(header);
			this.renderHeaderActions(false);
		}

		// Forward into editor tabs control
		else {
			this.editorTabsControl.updateOptions(oldOptions, newOptions);
		}
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {

		// Layout tabs control
		this.editorTabsControl.layout(dimensions);

		// Layout breadcrumbs if visible
		if (this.breadcrumbsControl?.isHidden() === false) {
			const breadcrumbsWidth = Math.max(0, dimensions.container.width);
			this.breadcrumbsContainer!.style.width = `${breadcrumbsWidth}px`;
			const breadcrumbsControlDimension = new Dimension(breadcrumbsWidth, BreadcrumbsControl.HEIGHT);
			this.breadcrumbsControl.layout(breadcrumbsControlDimension);
		}

		return new Dimension(dimensions.container.width, this.getHeight().total);
	}

	getHeight(): IEditorGroupTitleHeight {
		const tabsControlHeight = this.editorTabsControl.getHeight();
		const breadcrumbsControlHeight = this.breadcrumbsControl?.isHidden() === false ? BreadcrumbsControl.HEIGHT : 0;
		const additionalHeight = this.showHeader ? (this.headerVisible ? EditorTitleControl.HEADER_HEIGHT : 0) : breadcrumbsControlHeight;

		return {
			total: tabsControlHeight + additionalHeight,
			offset: tabsControlHeight
		};
	}
}
