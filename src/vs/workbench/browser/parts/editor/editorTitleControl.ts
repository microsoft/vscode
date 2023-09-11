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

	private editorTabsControl: EditorTabsControl;
	private editorTabsControlDisposable = this._register(new DisposableStore());

	private breadcrumbsControlFactory: BreadcrumbsControlFactory | undefined;
	private breadcrumbsControlDisposables = this._register(new DisposableStore());
	private get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }

	constructor(
		private parent: HTMLElement,
		private accessor: IEditorGroupsAccessor,
		private group: IEditorGroupView,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.editorTabsControl = this.createEditorTabsControl();
		this.breadcrumbsControlFactory = this.createBreadcrumbsControl();
	}

	private createEditorTabsControl(): EditorTabsControl {
		let control: EditorTabsControl;
		if (this.accessor.partOptions.showTabs) {
			control = this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group);
		} else {
			control = this.instantiationService.createInstance(SingleEditorTabsControl, this.parent, this.accessor, this.group);
		}

		return this.editorTabsControlDisposable.add(control);
	}

	private createBreadcrumbsControl(): BreadcrumbsControlFactory | undefined {
		if (!this.accessor.partOptions.showTabs) {
			return undefined; // single tabs have breadcrumbs inlined
		}

		// Breadcrumbs container
		const breadcrumbsContainer = document.createElement('div');
		breadcrumbsContainer.classList.add('breadcrumbs-below-tabs');
		this.parent.appendChild(breadcrumbsContainer);

		const breadcrumbsControlFactory = this.breadcrumbsControlDisposables.add(this.instantiationService.createInstance(BreadcrumbsControlFactory, breadcrumbsContainer, this.group, {
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

	openEditor(editor: EditorInput): void {
		const didChange = this.editorTabsControl.openEditor(editor);

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
		if (!this.group.activeEditor) {
			this.breadcrumbsControl?.update();
		}
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void {
		return this.editorTabsControl.moveEditor(editor, fromIndex, targetIndex);
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

	updateEditorLabel(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		return this.editorTabsControl.updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {

		// Update editor tabs control if options changed
		if (oldOptions.showTabs !== newOptions.showTabs) {

			// Clear old
			this.editorTabsControlDisposable.clear();
			this.breadcrumbsControlDisposables.clear();
			clearNode(this.parent);

			// Create new
			this.editorTabsControl = this.createEditorTabsControl();
			this.breadcrumbsControlFactory = this.createBreadcrumbsControl();
		}

		// Forward into editor tabs control
		this.editorTabsControl.updateOptions(oldOptions, newOptions);
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {

		// Layout tabs control
		const tabsControlDimension = this.editorTabsControl.layout(dimensions);

		// Layout breadcrumbs if visible
		let breadcrumbsControlDimension: Dimension | undefined = undefined;
		if (this.breadcrumbsControl?.isHidden() === false) {
			breadcrumbsControlDimension = new Dimension(dimensions.container.width, BreadcrumbsControl.HEIGHT);
			this.breadcrumbsControl.layout(breadcrumbsControlDimension);
		}

		return new Dimension(
			dimensions.container.width,
			tabsControlDimension.height + (breadcrumbsControlDimension ? breadcrumbsControlDimension.height : 0)
		);
	}

	getHeight(): IEditorGroupTitleHeight {
		const tabsControlHeight = this.editorTabsControl.getHeight();
		const breadcrumbsControlHeight = this.breadcrumbsControl?.isHidden() === false ? BreadcrumbsControl.HEIGHT : 0;

		return {
			total: tabsControlHeight + breadcrumbsControlHeight,
			offset: tabsControlHeight
		};
	}
}
