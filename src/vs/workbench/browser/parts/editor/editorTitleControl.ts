/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editortitlecontrol';
import { Dimension, clearNode } from 'vs/base/browser/dom';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { BreadcrumbsControl, IBreadcrumbsControlOptions } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
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

	private breadcrumbsControl: BreadcrumbsControl | undefined;
	private breadcrumbsControlDisposables = this._register(new DisposableStore());

	constructor(
		private parent: HTMLElement,
		private accessor: IEditorGroupsAccessor,
		private group: IEditorGroupView,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFileService private fileService: IFileService
	) {
		super(themeService);

		this.editorTabsControl = this.createEditorTabsControl();
		this.breadcrumbsControl = this.createBreadcrumbsControl();
	}

	private createEditorTabsControl(): EditorTabsControl {
		if (this.accessor.partOptions.showTabs) {
			return this.instantiationService.createInstance(MultiEditorTabsControl, this.parent, this.accessor, this.group);
		}

		return this.instantiationService.createInstance(SingleEditorTabsControl, this.parent, this.accessor, this.group);
	}

	private createBreadcrumbsControl(): BreadcrumbsControl | undefined {
		if (!this.accessor.partOptions.showTabs) {
			return undefined; // single tabs have breadcrumbs inlined
		}

		const options: IBreadcrumbsControlOptions = { showFileIcons: true, showSymbolIcons: true, showDecorationColors: false, showPlaceholder: true };

		// Breadcrumbs container
		const breadcrumbsContainer = document.createElement('div');
		breadcrumbsContainer.classList.add('breadcrumbs-below-tabs');
		this.parent.appendChild(breadcrumbsContainer);

		const config = this.breadcrumbsControlDisposables.add(BreadcrumbsConfig.IsEnabled.bindTo(this.configurationService));

		// Create if enabled
		let breadcrumbsControl: BreadcrumbsControl | undefined = undefined;
		if (config.getValue()) {
			breadcrumbsControl = this.breadcrumbsControlDisposables.add(this.instantiationService.createInstance(BreadcrumbsControl, breadcrumbsContainer, options, this.group));
		}

		// Listen to breadcrumbs enablement changes
		this.breadcrumbsControlDisposables.add(config.onDidChange(() => {
			const value = config.getValue();

			// Hide breadcrumbs if showing
			if (!value && this.breadcrumbsControl) {
				this.breadcrumbsControl.dispose();
				this.breadcrumbsControl = undefined;

				this.handleBreadcrumbsEnablementChange();
			}

			// Show breadcrumbs if hidden
			else if (value && !this.breadcrumbsControl) {
				this.breadcrumbsControl = this.breadcrumbsControlDisposables.add(this.instantiationService.createInstance(BreadcrumbsControl, breadcrumbsContainer, options, this.group));
				this.breadcrumbsControl.update();

				this.handleBreadcrumbsEnablementChange();
			}
		}));

		// Listen to file system provider changes
		this.breadcrumbsControlDisposables.add(this.fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (this.breadcrumbsControl?.model && this.breadcrumbsControl.model.resource.scheme !== e.scheme) {
				return; // ignore if the scheme of the breadcrumbs resource is not affected
			}

			if (this.breadcrumbsControl?.update()) {
				this.handleBreadcrumbsEnablementChange();
			}
		}));

		return breadcrumbsControl;
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
			this.editorTabsControl.dispose();
			this.breadcrumbsControlDisposables.clear();
			clearNode(this.parent);

			// Create new
			this.editorTabsControl = this.createEditorTabsControl();
			this.breadcrumbsControl = this.createBreadcrumbsControl();
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

	override dispose(): void {
		this.editorTabsControl.dispose();
		this.breadcrumbsControlDisposables.dispose();

		super.dispose();
	}
}
