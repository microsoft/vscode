/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, $} from 'vs/base/browser/builder';
import {ITree} from 'vs/base/parts/tree/browser/tree';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {IAction, IActionRunner} from 'vs/base/common/actions';
import workbenchEditorCommon = require('vs/workbench/common/editor');
import {CollapsibleState} from 'vs/base/browser/ui/splitview/splitview';
import {IWorkingFileEntry, IWorkingFilesModel, IWorkingFileModelChangeEvent, LocalFileChangeEvent, EventType as FileEventType, IFilesConfiguration, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import dom = require('vs/base/browser/dom');
import {IDisposable} from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import {EventType as WorkbenchEventType, UntitledEditorEvent, EditorEvent} from 'vs/workbench/common/events';
import {AdaptiveCollapsibleViewletView} from 'vs/workbench/browser/viewlet';
import {CloseAllWorkingFilesAction, SaveAllAction} from 'vs/workbench/parts/files/browser/fileActions';
import {WorkingFileEntry} from 'vs/workbench/parts/files/common/workingFilesModel';
import {WorkingFilesDragAndDrop, WorkingFilesSorter, WorkingFilesController, WorkingFilesDataSource, WorkingFilesRenderer, WorkingFilesAccessibilityProvider, WorkingFilesActionProvider} from 'vs/workbench/parts/files/browser/views/workingFilesViewer';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IMessageService} from 'vs/platform/message/common/message';

export class WorkingFilesView extends AdaptiveCollapsibleViewletView {

	private static MEMENTO_COLLAPSED = 'workingFiles.memento.collapsed';

	private static DEFAULT_MAX_VISIBLE_FILES = 9;
	private static DEFAULT_DYNAMIC_HEIGHT = true;

	private settings: any;
	private maxVisibleWorkingFiles: number;
	private dynamicHeight: boolean;

	private model: IWorkingFilesModel;
	private dirtyCountElement: HTMLElement;
	private lastDirtyCount: number;

	private disposeables: IDisposable[];

	constructor(actionRunner: IActionRunner, settings: any,
		@IEventService private eventService: IEventService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(actionRunner, WorkingFilesView.computeExpandedBodySize(textFileService.getWorkingFilesModel()), !!settings[WorkingFilesView.MEMENTO_COLLAPSED], nls.localize('workingFilesSection', "Working Files Section"), messageService, contextMenuService);

		this.settings = settings;
		this.model = this.textFileService.getWorkingFilesModel();
		this.lastDirtyCount = 0;
		this.disposeables = [];
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);

		let titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('workingFiles', "Working Files")).appendTo(titleDiv);

		this.dirtyCountElement = $('div.monaco-count-badge').appendTo(titleDiv).hide().getHTMLElement();
		this.updateDirtyIndicator();
	}

	public getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(SaveAllAction, SaveAllAction.ID, SaveAllAction.LABEL),
			this.instantiationService.createInstance(CloseAllWorkingFilesAction, this.model)
		];
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		dom.addClass(this.treeContainer, 'explorer-working-files');

		this.createViewer($(this.treeContainer));
	}

	public create(): TPromise<void> {

		// Load Config
		return this.configurationService.loadConfiguration().then((configuration) => {

			// Update configuration
			this.onConfigurationUpdated(configuration);

			// listeners
			this.registerListeners();

			// highlight active input
			this.highlightInput(this.editorService.getActiveEditorInput());

			return super.create();
		});
	}

	private onConfigurationUpdated(configuration: IFilesConfiguration): void {
		let visibleWorkingFiles = configuration && configuration.explorer && configuration.explorer.workingFiles && configuration.explorer.workingFiles.maxVisible;
		if (typeof visibleWorkingFiles === 'number') {
			this.maxVisibleWorkingFiles = visibleWorkingFiles;
		} else {
			this.maxVisibleWorkingFiles = WorkingFilesView.DEFAULT_MAX_VISIBLE_FILES;
		}

		let dynamicHeight = configuration && configuration.explorer && configuration.explorer.workingFiles && configuration.explorer.workingFiles.dynamicHeight;
		if (typeof dynamicHeight === 'boolean') {
			this.dynamicHeight = dynamicHeight;
		} else {
			this.dynamicHeight = WorkingFilesView.DEFAULT_DYNAMIC_HEIGHT;
		}

		// Adjust expanded body size
		this.expandedBodySize = this.getExpandedBodySize(this.model);
	}

	private registerListeners(): void {

		// update on model changes
		this.disposeables.push(this.model.onModelChange(this.onWorkingFilesModelChange, this));
		this.disposeables.push(this.model.onWorkingFileChange(this.onWorkingFileChange, this));

		// listen to untitled
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DIRTY, (e: UntitledEditorEvent) => this.onUntitledFileDirty()));
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.UNTITLED_FILE_DELETED, (e: UntitledEditorEvent) => this.onUntitledFileDeleted()));

		// listen to files being changed locally
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => this.onTextFileDirty(e)));
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_SAVED, (e: LocalFileChangeEvent) => this.onTextFileSaved(e)));
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_SAVE_ERROR, (e: LocalFileChangeEvent) => this.onTextFileSaveError(e)));
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => this.onTextFileReverted(e)));

		// listen to files being opened
		this.toDispose.push(this.eventService.addListener2(WorkbenchEventType.EDITOR_INPUT_CHANGED, (e: EditorEvent) => this.onEditorInputChanged(e)));

		// Also handle configuration updates
		this.toDispose.push(this.configurationService.addListener2(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => this.onConfigurationUpdated(e.config)));
	}

	private onTextFileDirty(e: LocalFileChangeEvent): void {
		if (this.textFileService.getAutoSaveMode() !== AutoSaveMode.AFTER_SHORT_DELAY) {
			this.updateDirtyIndicator(); // no indication needed when auto save is enabled for short delay
		}
	}

	private onTextFileSaved(e: LocalFileChangeEvent): void {
		if (this.lastDirtyCount > 0) {
			this.updateDirtyIndicator();
		}
	}

	private onTextFileSaveError(e: LocalFileChangeEvent): void {
		this.updateDirtyIndicator();
	}

	private onTextFileReverted(e: LocalFileChangeEvent): void {
		if (this.lastDirtyCount > 0) {
			this.updateDirtyIndicator();
		}
	}

	private onUntitledFileDirty(): void {
		this.updateDirtyIndicator();
	}

	private onUntitledFileDeleted(): void {
		if (this.lastDirtyCount > 0) {
			this.updateDirtyIndicator();
		}
	}

	private updateDirtyIndicator(): void {
		let dirty = this.textFileService.getDirty().length;
		this.lastDirtyCount = dirty;
		if (dirty === 0) {
			$(this.dirtyCountElement).hide();
		} else {
			const label = nls.localize('dirtyCounter', "{0} unsaved", dirty);
			$(this.dirtyCountElement).show().text(label).title(label);
		}
	}

	private onWorkingFilesModelChange(event: IWorkingFileModelChangeEvent): void {
		if (this.isDisposed) {
			return;
		}

		// View size
		this.expandedBodySize = this.getExpandedBodySize(this.model);

		if (this.tree) {

			// Show in tree
			this.tree.refresh();

			// Make sure to keep active editor input highlighted
			let activeInput = this.editorService.getActiveEditorInput();
			this.highlightInput(activeInput);
		}
	}

	private onWorkingFileChange(file: WorkingFileEntry): void {
		if (this.isDisposed) {
			return;
		}

		if (this.tree) {
			this.tree.refresh(file);
		}
	}

	private getExpandedBodySize(model: IWorkingFilesModel): number {
		return WorkingFilesView.computeExpandedBodySize(model, this.maxVisibleWorkingFiles, this.dynamicHeight);
	}

	private static computeExpandedBodySize(model: IWorkingFilesModel, maxVisibleWorkingFiles?: number, hasDynamicHeight?: boolean): number {
		let entryCount = model.count();

		let visibleWorkingFiles = maxVisibleWorkingFiles;
		if (typeof visibleWorkingFiles !== 'number') {
			visibleWorkingFiles = WorkingFilesView.DEFAULT_MAX_VISIBLE_FILES;
		}

		let dynamicHeight = hasDynamicHeight;
		if (typeof dynamicHeight !== 'boolean') {
			dynamicHeight = WorkingFilesView.DEFAULT_DYNAMIC_HEIGHT;
		}

		let itemsToShow: number;
		if (dynamicHeight) {
			itemsToShow = Math.min(Math.max(visibleWorkingFiles, 1), entryCount);
		} else {
			itemsToShow = Math.max(visibleWorkingFiles, 1);
		}

		return itemsToShow * WorkingFilesRenderer.FILE_ITEM_HEIGHT;
	}

	private onEditorInputChanged(e: EditorEvent): void {
		let activeInput = this.editorService.getActiveEditorInput();
		if (activeInput === e.editorInput) {
			this.highlightInput(e.editorInput);
		}
	}

	private highlightInput(input: IEditorInput): void {
		let entry: IWorkingFileEntry;

		let resource = workbenchEditorCommon.getUntitledOrFileResource(input);
		if (resource) {
			entry = this.model.findEntry(resource);
		}

		if (entry) {
			this.highlightEntry(entry);
		} else {
			this.highlightEntry(null);
		}
	}

	private highlightEntry(entry: IWorkingFileEntry): void {
		this.tree.clearFocus();
		this.tree.clearSelection();

		if (entry) {
			this.tree.setFocus(entry);
			this.tree.setSelection([entry]);
			this.tree.reveal(entry).done(null, errors.onUnexpectedError);
		}
	}

	private createViewer(container: Builder): ITree {
		let actionProvider = this.instantiationService.createInstance(WorkingFilesActionProvider, this.model);
		let renderer = this.instantiationService.createInstance(WorkingFilesRenderer, this.model, actionProvider, this.actionRunner);
		let dataSource = this.instantiationService.createInstance(WorkingFilesDataSource);
		let controller = this.instantiationService.createInstance(WorkingFilesController, this.model, actionProvider);
		let sorter = this.instantiationService.createInstance(WorkingFilesSorter);
		let dnd = this.instantiationService.createInstance(WorkingFilesDragAndDrop, this.model);
		let accessibility = this.instantiationService.createInstance(WorkingFilesAccessibilityProvider);

		this.tree = new Tree(container.getHTMLElement(), {
			dataSource: dataSource,
			renderer: renderer,
			sorter: sorter,
			controller: controller,
			dnd: dnd,
			accessibilityProvider: accessibility
		}, {
			indentPixels: 0,
			twistiePixels: 8,
			ariaLabel: nls.localize('treeAriaLabel', "Working Files")
		});

		this.tree.setInput(this.model);

		return this.tree;
	}

	public shutdown(): void {
		this.settings[WorkingFilesView.MEMENTO_COLLAPSED] = (this.state === CollapsibleState.COLLAPSED);

		super.shutdown();
	}

	public dispose(): void {
		super.dispose();

		while (this.disposeables.length) {
			this.disposeables.pop().dispose();
		}
	}
}