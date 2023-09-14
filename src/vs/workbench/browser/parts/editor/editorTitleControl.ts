/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editortitlecontrol';
import { Dimension, clearNode } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { BreadcrumbsControl, BreadcrumbsControlFactory } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IEditorGroupsAccessor, IEditorGroupTitleHeight, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { EditorTabsControl } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { MultiEditorTabsControl } from 'vs/workbench/browser/parts/editor/multiEditorTabsControl';
import { SingleEditorTabsControl } from 'vs/workbench/browser/parts/editor/singleEditorTabsControl';
import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from 'vs/workbench/browser/parts/editor/stickyEditorGroup';
import { assertIsDefined } from 'vs/base/common/types';

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

	protected editorTabsControl: EditorTabsControl[];
	private editorTabsControlDisposable = this._register(new DisposableStore());

	private breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private breadcrumbsControlDisposables = this._register(new DisposableStore());
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }

	constructor(
		protected parent: HTMLElement,
		protected accessor: IEditorGroupsAccessor,
		protected group: IEditorGroupView,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.editorTabsControl = this.createEditorTabsControl();
		this.breadcrumbsControlFactory = this.createBreadcrumbsControl();
	}

	private isPinnedTabsSeparateRow(): boolean {
		const showTabs = assertIsDefined(this.accessor.partOptions.showTabs);
		const pinnedTabsSeparateRow = assertIsDefined(this.accessor.partOptions.pinnedTabsSeparateRow);
		return showTabs && pinnedTabsSeparateRow;
	}

	private createEditorTabsControl(): EditorTabsControl[] {
		let controls: EditorTabsControl[];
		if (this.accessor.partOptions.showTabs) {
			if (this.accessor.partOptions.pinnedTabsSeparateRow) {
				controls = [
					this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, new StickyEditorGroupModel(this.group)),
					this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, new UnstickyEditorGroupModel(this.group))
				];
			}
			else {
				controls = [this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group, this.group)];
			}
		} else {
			controls = [this.instantiationService.createInstance(SingleEditorTabsControl, this.parent, this.accessor, this.group, this.group)];
		}
		return controls.map(c => this.editorTabsControlDisposable.add(c));
	}

	private createBreadcrumbsControl(): BreadcrumbsControlFactory | undefined {
		if (!this.accessor.partOptions.showTabs) {
			return undefined; // single tabs have breadcrumbs inlined
		}

		// Breadcrumbs container
		const breadcrumbsContainer = document.createElement('div');
		breadcrumbsContainer.classList.add('breadcrumbs-below-tabs');
		this.parent.appendChild(breadcrumbsContainer);

		const breadcrumbsControlFactory = this.breadcrumbsControlDisposables.add(this.instantiationService.createInstance(BreadcrumbsControlFactory, breadcrumbsContainer, this.accessor, this.group, {
			showFileIcons: true,
			showSymbolIcons: true,
			showDecorationColors: false,
			showPlaceholder: true
		}));
		this.breadcrumbsControlDisposables.add(breadcrumbsControlFactory.onDidEnablementChange(() => this.handleBreadcrumbsEnablementChange()));

		return breadcrumbsControlFactory;
	}

	private handleBreadcrumbsEnablementChange(): void {
		this.group.relayout(); // relayout when breadcrumbs are enable/disabled
	}

	private handlePinnedTabsSeparateRowToolbars(): void {
		if (this.group.count === 0) {
			// Do nothing as no tab bar is visible
			return;
		}
		if (this.group.count === this.group.stickyCount) {
			this.editorTabsControl[0].showEditorActionsToolbar();
			this.editorTabsControl[1].hideEditorActionsToolbar();
		}
		else {
			this.editorTabsControl[0].hideEditorActionsToolbar();
			this.editorTabsControl[1].showEditorActionsToolbar();
		}
	}

	openEditor(editor: EditorInput): void {
		let didChange: boolean;
		if (!this.isPinnedTabsSeparateRow()) {
			didChange = this.editorTabsControl[0].openEditor(editor);
		} else {
			const controllerIndex = this.group.isSticky(editor) ? 0 : 1;
			didChange = this.editorTabsControl[controllerIndex].openEditor(editor);
			if (didChange) {
				this.editorTabsControl[1 - controllerIndex].openEditors([]); // HACK: to render all editor tabs on startup, otherwise only one row gets rendered
			}
		}

		this.handleOpenedEditors(didChange);
	}

	openEditors(editors: EditorInput[]): void {
		let didChange: boolean;
		if (!this.isPinnedTabsSeparateRow()) {
			didChange = this.editorTabsControl[0].openEditors(editors);
		} else {
			const sticky = editors.filter(e => this.group.isSticky(e));
			const unsticky = editors.filter(e => !this.group.isSticky(e));

			const didChangeOpenEditorsSticky = this.editorTabsControl[0].openEditors(sticky);
			const didChangeOpenEditorsUnSticky = this.editorTabsControl[1].openEditors(unsticky);
			didChange = didChangeOpenEditorsSticky || didChangeOpenEditorsUnSticky;
		}

		this.handleOpenedEditors(didChange);
	}

	private handleOpenedEditors(didChange: boolean): void {
		if (didChange) {
			this.breadcrumbsControl?.update();
			if (this.isPinnedTabsSeparateRow()) {
				this.handlePinnedTabsSeparateRowToolbars();
			}
		} else {
			this.breadcrumbsControl?.revealLast();
		}
	}

	beforeCloseEditor(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].beforeCloseEditor(editor);
		} else {
			this.group.isSticky(editor) ? this.editorTabsControl[0].beforeCloseEditor(editor) : this.editorTabsControl[1].beforeCloseEditor(editor);
		}
	}

	closeEditor(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].closeEditor(editor);
		} else {
			this.editorTabsControl[0].closeEditor(editor);
			this.editorTabsControl[1].closeEditor(editor);
		}

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].closeEditors(editors);
		} else {
			const sticky = editors.filter(e => this.group.isSticky(e));
			const unsticky = editors.filter(e => !this.group.isSticky(e));

			this.editorTabsControl[0].closeEditors(sticky);
			this.editorTabsControl[1].closeEditors(unsticky);
		}

		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		if (this.isPinnedTabsSeparateRow()) {
			this.handlePinnedTabsSeparateRowToolbars();
		}

		if (!this.group.activeEditor) {
			this.breadcrumbsControl?.update();
		}
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange: boolean): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].moveEditor(editor, fromIndex, targetIndex);
			return;
		}
		if (stickyStateChange) {
			// If sticky state changes, move editor between tab bars
			if (this.group.isSticky(editor)) {
				this.editorTabsControl[0].openEditor(editor);
				this.editorTabsControl[1].closeEditor(editor);
			} else {
				this.editorTabsControl[0].closeEditor(editor);
				this.editorTabsControl[1].openEditor(editor);
			}
		}
		else {
			if (this.group.isSticky(editor)) {
				this.editorTabsControl[0].moveEditor(editor, fromIndex, targetIndex);
			} else {
				this.editorTabsControl[1].moveEditor(editor, fromIndex - this.group.stickyCount, targetIndex - this.group.stickyCount);
			}
		}

		this.handlePinnedTabsSeparateRowToolbars();
	}

	pinEditor(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].pinEditor(editor);
			return;
		}

		this.group.isSticky(editor) ? this.editorTabsControl[0].pinEditor(editor) : this.editorTabsControl[1].pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].stickEditor(editor);
			return;
		}

		this.editorTabsControl[0].openEditor(editor);
		this.editorTabsControl[1].closeEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	unstickEditor(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].stickEditor(editor);
			return;
		}

		this.editorTabsControl[0].closeEditor(editor);
		this.editorTabsControl[1].openEditor(editor);

		this.handlePinnedTabsSeparateRowToolbars();
	}

	setActive(isActive: boolean): void {
		this.editorTabsControl.forEach(c => c.setActive(isActive));
	}

	updateEditorLabel(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].updateEditorLabel(editor);
			return;
		}
		this.group.isSticky(editor) ? this.editorTabsControl[0].updateEditorLabel(editor) : this.editorTabsControl[1].updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		if (!this.isPinnedTabsSeparateRow()) {
			this.editorTabsControl[0].updateEditorDirty(editor);
			return;
		}
		this.group.isSticky(editor) ? this.editorTabsControl[0].updateEditorDirty(editor) : this.editorTabsControl[1].updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		// Update editor tabs control if options changed
		if (
			oldOptions.showTabs !== newOptions.showTabs ||
			(!newOptions.showTabs && oldOptions.pinnedTabsSeparateRow !== newOptions.pinnedTabsSeparateRow)
		) {
			// Clear old
			this.editorTabsControlDisposable.clear();
			this.breadcrumbsControlDisposables.clear();
			clearNode(this.parent);

			// Create new
			this.editorTabsControl = this.createEditorTabsControl();
			this.breadcrumbsControlFactory = this.createBreadcrumbsControl();
		} else {
			// Forward into editor tabs control
			this.editorTabsControl.forEach(c => c.updateOptions(oldOptions, newOptions));
		}
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {

		// Layout tabs control
		const tabsControlHeight = this.editorTabsControl.reduce((total, c) => total + c.layout(dimensions).height, 0);

		// Layout breadcrumbs if visible
		let breadcrumbsControlDimension: Dimension | undefined = undefined;
		if (this.breadcrumbsControl?.isHidden() === false) {
			breadcrumbsControlDimension = new Dimension(dimensions.container.width, BreadcrumbsControl.HEIGHT);
			this.breadcrumbsControl.layout(breadcrumbsControlDimension);
		}

		return new Dimension(
			dimensions.container.width,
			tabsControlHeight + (breadcrumbsControlDimension ? breadcrumbsControlDimension.height : 0)
		);
	}

	getHeight(): IEditorGroupTitleHeight {
		const tabsControlHeight = this.editorTabsControl.reduce((total, c) => total + c.getHeight(), 0);
		const breadcrumbsControlHeight = this.breadcrumbsControl?.isHidden() === false ? BreadcrumbsControl.HEIGHT : 0;

		return {
			total: tabsControlHeight + breadcrumbsControlHeight,
			offset: tabsControlHeight
		};
	}
}
