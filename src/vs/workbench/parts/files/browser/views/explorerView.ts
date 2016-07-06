/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, $} from 'vs/base/browser/builder';
import URI from 'vs/base/common/uri';
import {ThrottledDelayer} from 'vs/base/common/async';
import errors = require('vs/base/common/errors');
import labels = require('vs/base/common/labels');
import paths = require('vs/base/common/paths');
import {Action, IActionRunner, IAction} from 'vs/base/common/actions';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {ITree} from 'vs/base/parts/tree/browser/tree';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {LocalFileChangeEvent, IFilesConfiguration} from 'vs/workbench/parts/files/common/files';
import {IFileStat, IResolveFileOptions, FileChangeType, FileChangesEvent, IFileChange, EventType as FileEventType, IFileService} from 'vs/platform/files/common/files';
import {FileImportedEvent, RefreshViewExplorerAction, NewFolderAction, NewFileAction} from 'vs/workbench/parts/files/browser/fileActions';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {FileDragAndDrop, FileFilter, FileSorter, FileController, FileRenderer, FileDataSource, FileViewletState, FileAccessibilityProvider} from 'vs/workbench/parts/files/browser/views/explorerViewer';
import lifecycle = require('vs/base/common/lifecycle');
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {IEditor} from 'vs/platform/editor/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import * as DOM from 'vs/base/browser/dom';
import {CollapseAction, CollapsibleViewletView} from 'vs/workbench/browser/viewlet';
import {FileStat} from 'vs/workbench/parts/files/common/explorerViewModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';

export class ExplorerView extends CollapsibleViewletView {

	private static EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first
	private static EXPLORER_FILE_CHANGES_REFRESH_DELAY = 100; // delay in ms to refresh the explorer from disk file changes
	private static EXPLORER_IMPORT_REFRESH_DELAY = 300; // delay in ms to refresh the explorer from imports

	private static MEMENTO_LAST_ACTIVE_FILE_RESOURCE = 'explorer.memento.lastActiveFileResource';
	private static MEMENTO_EXPANDED_FOLDER_RESOURCES = 'explorer.memento.expandedFolderResources';

	private workspace: IWorkspace;

	private explorerViewer: ITree;
	private filter: FileFilter;
	private viewletState: FileViewletState;

	private explorerRefreshDelayer: ThrottledDelayer<void>;
	private explorerImportDelayer: ThrottledDelayer<void>;

	private resourceContext: ResourceContextKey;

	private shouldRefresh: boolean;

	private autoReveal: boolean;

	private settings: any;

	constructor(
		viewletState: FileViewletState,
		actionRunner: IActionRunner,
		settings: any,
		headerSize: number,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IEventService private eventService: IEventService,
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IProgressService private progressService: IProgressService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(actionRunner, false, nls.localize('explorerSection', "Files Explorer Section"), messageService, keybindingService, contextMenuService, headerSize);

		this.workspace = contextService.getWorkspace();

		this.settings = settings;
		this.viewletState = viewletState;
		this.actionRunner = actionRunner;
		this.autoReveal = true;

		this.explorerRefreshDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_FILE_CHANGES_REFRESH_DELAY);
		this.explorerImportDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_IMPORT_REFRESH_DELAY);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(this.workspace.name).title(labels.getPathLabel(this.workspace.resource.fsPath)).appendTo(titleDiv);

		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'explorer-folders-view');

		this.tree = this.createViewer($(this.treeContainer));

		if (this.toolBar) {
			this.toolBar.setActions(prepareActions(this.getActions()), [])();
		}
	}

	public getActions(): IAction[] {
		const actions: Action[] = [];

		actions.push(this.instantiationService.createInstance(NewFileAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(NewFolderAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(RefreshViewExplorerAction, this, 'explorer-action refresh-explorer'));
		actions.push(this.instantiationService.createInstance(CollapseAction, this.getViewer(), true, 'explorer-action collapse-explorer'));

		// Set Order
		for (let i = 0; i < actions.length; i++) {
			let action = actions[i];
			action.order = 10 * (i + 1);
		}

		return actions;
	}

	public create(): TPromise<void> {

		// Update configuration
		const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();
		this.onConfigurationUpdated(configuration);

		// Load and Fill Viewer
		return this.doRefresh().then(() => {

			// When the explorer viewer is loaded, listen to changes to the editor input
			this.toDispose.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));

			// Also handle configuration updates
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config, true)));
		});
	}

	private onEditorsChanged(): void {
		let activeInput = this.editorService.getActiveEditorInput();
		let clearSelection = true;
		let clearFocus = false;

		// Handle File Input
		if (activeInput instanceof FileEditorInput) {
			const fileResource = activeInput.getResource();

			// Always remember last opened file
			this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = fileResource.toString();

			// Select file if input is FileEditorInput
			if (this.isVisible && this.contextService.isInsideWorkspace(fileResource)) {
				let selection = this.hasSelection(fileResource);
				if (!selection) {
					this.select(fileResource).done(null, errors.onUnexpectedError);
				}

				clearSelection = false;
			}
		}

		// Handle closed or untitled file (convince explorer to not reopen any file when getting visible)
		if (activeInput instanceof UntitledEditorInput || !activeInput) {
			this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = void 0;
			clearFocus = true;
		}

		// Otherwise clear
		if (clearSelection) {
			this.explorerViewer.clearSelection();
		}

		if (clearFocus) {
			this.explorerViewer.clearFocus();
		}
	}

	private onConfigurationUpdated(configuration: IFilesConfiguration, refresh?: boolean): void {
		this.autoReveal = configuration && configuration.explorer && configuration.explorer.autoReveal;

		// Push down config updates to components of viewer
		let needsRefresh = false;
		if (this.filter) {
			needsRefresh = this.filter.updateConfiguration(configuration);
		}

		// Refresh viewer as needed
		if (refresh && needsRefresh) {
			this.doRefresh().done(null, errors.onUnexpectedError);
		}
	}

	public focusBody(): void {
		let keepFocus = false;

		// Make sure the current selected element is revealed
		if (this.explorerViewer) {
			if (this.autoReveal) {
				let selection = this.explorerViewer.getSelection();
				if (selection.length > 0) {
					this.reveal(selection[0], 0.5).done(null, errors.onUnexpectedError);
				}
			}

			// Pass Focus to Viewer
			this.explorerViewer.DOMFocus();
			keepFocus = true;
		}

		// Open the focused element in the editor if there is currently no file opened
		let input = this.editorService.getActiveEditorInput();
		if (!input || !(input instanceof FileEditorInput)) {
			this.openFocusedElement(keepFocus);
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {

			// Show
			if (visible) {

				// If a refresh was requested and we are now visible, run it
				let refreshPromise = TPromise.as(null);
				if (this.shouldRefresh) {
					refreshPromise = this.doRefresh();
					this.shouldRefresh = false; // Reset flag
				}

				// Always select the current navigated file in explorer if input is file editor input
				let activeResource = this.getActiveEditorInputResource();
				if (activeResource) {
					return refreshPromise.then(() => {
						return this.select(activeResource);
					});
				}

				// Return now if the workbench has not yet been created - in this case the workbench takes care of restoring last used editors
				if (!this.partService.isCreated()) {
					return TPromise.as(null);
				}

				// Otherwise restore last used file: By lastActiveFileResource
				let root = this.getInput();
				let lastActiveFileResource: URI;
				if (this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]) {
					lastActiveFileResource = URI.parse(this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]);
				}

				if (lastActiveFileResource && root && root.find(lastActiveFileResource)) {
					let editorInput = this.instantiationService.createInstance(FileEditorInput, lastActiveFileResource, void 0, void 0);
					this.activateOrOpenEditor(editorInput).done(null, errors.onUnexpectedError);

					return refreshPromise;
				}

				// Otherwise restore last used file: By Explorer selection
				return refreshPromise.then(() => {
					this.openFocusedElement();
				});
			}
		});
	}

	private openFocusedElement(keepFocus?: boolean): void {
		let stat: FileStat = this.explorerViewer.getFocus();
		if (stat && !stat.isDirectory) {
			let editorInput = this.instantiationService.createInstance(FileEditorInput, stat.resource, stat.mime, void 0);

			this.activateOrOpenEditor(editorInput, keepFocus).done(null, errors.onUnexpectedError);
		}
	}

	private activateOrOpenEditor(input: FileEditorInput, keepFocus?: boolean): TPromise<IEditor> {

		// First try to find if input already visible
		let editors = this.editorService.getVisibleEditors();
		if (editors) {
			for (let i = 0; i < editors.length; i++) {
				let editor = editors[i];
				if (input.matches(editor.input)) {
					if (!keepFocus) {
						this.editorGroupService.focusGroup(editor.position);
					}

					return TPromise.as(editor);
				}
			}
		}

		// Otherwise open in active slot
		return this.editorService.openEditor(input, keepFocus ? { preserveFocus: true } : void 0);
	}

	private getActiveEditorInputResource(): URI {

		// Try with Editor Input
		let input = this.editorService.getActiveEditorInput();
		if (input && input instanceof FileEditorInput) {
			return (<FileEditorInput>input).getResource();
		}

		return null;
	}

	private getInput(): FileStat {
		return this.explorerViewer ? (<FileStat>this.explorerViewer.getInput()) : null;
	}

	public createViewer(container: Builder): ITree {
		let dataSource = this.instantiationService.createInstance(FileDataSource);
		let renderer = this.instantiationService.createInstance(FileRenderer, this.viewletState, this.actionRunner);
		let controller = this.instantiationService.createInstance(FileController, this.viewletState);
		let sorter = new FileSorter();
		this.filter = this.instantiationService.createInstance(FileFilter);
		let dnd = this.instantiationService.createInstance(FileDragAndDrop);
		let accessibility = this.instantiationService.createInstance(FileAccessibilityProvider);

		this.explorerViewer = new Tree(container.getHTMLElement(), {
			dataSource: dataSource,
			renderer: renderer,
			controller: controller,
			sorter: sorter,
			filter: this.filter,
			dnd: dnd,
			accessibilityProvider: accessibility
		}, {
			autoExpandSingleChildren: true,
			ariaLabel: nls.localize('treeAriaLabel', "Files Explorer")
		});

		this.toDispose.push(lifecycle.toDisposable(() => renderer.dispose()));

		// Update Viewer based on File Change Events
		this.toDispose.push(this.eventService.addListener2('files.internal:fileChanged', (e: LocalFileChangeEvent) => this.onLocalFileChange(e)));
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_CHANGES, (e: FileChangesEvent) => this.onFileChanges(e)));

		// Update resource context based on focused element
		this.toDispose.push(this.explorerViewer.addListener2('focus', (e: { focus: FileStat }) => this.resourceContext.set(e.focus && e.focus.resource)));

		return this.explorerViewer;
	}

	public getOptimalWidth(): number {
		let parentNode = this.explorerViewer.getHTMLElement();
		let childNodes = [].slice.call(parentNode.querySelectorAll('.explorer-item-label > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	private onLocalFileChange(e: LocalFileChangeEvent): void {
		let modelElement: FileStat;
		let parent: FileStat;
		let parentResource: URI;
		let parentElement: FileStat;

		// Add
		if (e.gotAdded()) {
			let addedElement = e.getAfter();
			parentResource = URI.file(paths.dirname(addedElement.resource.fsPath));
			parentElement = this.getInput().find(parentResource);

			if (parentElement) {

				// Add the new file to its parent (Model)
				let childElement = FileStat.create(addedElement);
				parentElement.addChild(childElement);

				let refreshPromise = () => {

					// Refresh the Parent (View)
					return this.explorerViewer.refresh(parentElement).then(() => {
						return this.reveal(childElement, 0.5).then(() => {

							// Focus new element
							this.explorerViewer.setFocus(childElement);

							// Open new file in editor (pinned)
							if (!childElement.isDirectory) {
								return this.editorService.openEditor({ resource: childElement.resource, options: { pinned: true } });
							}
						});
					});
				};

				// For file imports, use a delayer to not refresh too many times when multiple files are imported
				if (e instanceof FileImportedEvent) {
					this.explorerImportDelayer.trigger(refreshPromise).done(null, errors.onUnexpectedError);
				}

				// Otherwise just refresh immediately
				else {
					refreshPromise().done(null, errors.onUnexpectedError);
				}
			}
		}

		// Move (including Rename)
		else if (e.gotMoved()) {
			let oldElement = e.getBefore();
			let newElement = e.getAfter();

			let oldParentResource = URI.file(paths.dirname(oldElement.resource.fsPath));
			let newParentResource = URI.file(paths.dirname(newElement.resource.fsPath));

			// Only update focus if renamed/moved element is selected
			let updateFocus = false;
			let focus: FileStat = this.explorerViewer.getFocus();
			if (focus && focus.resource && focus.resource.toString() === oldElement.resource.toString()) {
				updateFocus = true;
			}

			// Handle Rename
			if (oldParentResource && newParentResource && oldParentResource.toString() === newParentResource.toString()) {
				modelElement = this.getInput().find(oldElement.resource);
				if (modelElement) {
					if (!modelElement.isDirectory && !modelElement.mime) {
						return;
					}

					// Rename File (Model)
					modelElement.rename(newElement);

					// Update Parent (View)
					parent = modelElement.parent;
					if (parent) {
						this.explorerViewer.refresh(parent).done(() => {

							// Select in Viewer if set
							if (updateFocus) {
								this.explorerViewer.setFocus(modelElement);
							}
						}, errors.onUnexpectedError);
					}
				}
			}

			// Handle Move
			else if (oldParentResource && newParentResource) {
				let oldParent = this.getInput().find(oldParentResource);
				let newParent = this.getInput().find(newParentResource);
				modelElement = this.getInput().find(oldElement.resource);

				if (oldParent && newParent && modelElement) {

					// Move in Model
					modelElement.move(newParent, (callback: () => void) => {

						// Update old parent
						this.explorerViewer.refresh(oldParent, true).done(callback, errors.onUnexpectedError);
					}, () => {

						// Update new parent
						this.explorerViewer.refresh(newParent, true).done(() => {
							return this.explorerViewer.expand(newParent);
						}, errors.onUnexpectedError);
					});
				}
			}
		}

		// Delete
		else if (e.gotDeleted()) {
			let deletedElement = e.getBefore();
			modelElement = this.getInput().find(deletedElement.resource);
			if (modelElement && modelElement.parent) {
				parent = modelElement.parent;

				// Remove Element from Parent (Model)
				parent.removeChild(modelElement);

				// Refresh Parent (View)
				this.explorerViewer.refresh(parent).done(() => {

					// Ensure viewer has keyboard focus if event originates from viewer
					this.explorerViewer.DOMFocus();
				}, errors.onUnexpectedError);
			}
		}

		// Imported which replaced an existing file
		else if (e instanceof FileImportedEvent) {
			let importedElement: IFileStat = (<FileImportedEvent>e).getAfter();
			parentResource = URI.file(paths.dirname(importedElement.resource.fsPath));
			parentElement = this.getInput().find(parentResource);

			// Open it (pinned)
			if (parentElement) {
				this.explorerViewer.refresh(parentElement).then(() => this.editorService.openEditor({ resource: importedElement.resource, options: { pinned: true } })).done(null, errors.onUnexpectedError);
			}
		}

		// Refresh if the event indicates that '/' got updated (from a place outside the explorer viewlet)
		else if (this.workspace && e.gotUpdated() && e.getAfter().resource.toString() === this.workspace.resource.toString() && !this.explorerViewer.getHighlight()) {
			this.refreshFromEvent();
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Ensure memento state does not capture a deleted file (we run this from a timeout because
		// delete events can result in UI activity that will fill the memento again when multiple
		// editors are closing)
		setTimeout(() => {
			let lastActiveResource: string = this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE];
			if (lastActiveResource && e.contains(URI.parse(lastActiveResource), FileChangeType.DELETED)) {
				this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = null;
			}
		});

		// Check if an explorer refresh is necessary (delayed to give internal events a chance to react first)
		// Note: there is no guarantee when the internal events are fired vs real ones. Code has to deal with the fact that one might
		// be fired first over the other or not at all.
		setTimeout(() => {
			if (!this.shouldRefresh && this.shouldRefreshFromEvent(e)) {
				this.refreshFromEvent();
			}
		}, ExplorerView.EXPLORER_FILE_CHANGES_REACT_DELAY);
	}

	private shouldRefreshFromEvent(e: FileChangesEvent): boolean {

		// Filter to the ones we care
		e = this.filterToAddRemovedOnWorkspacePath(e, (event, segments) => {
			if (segments[0] !== '.git') {
				return true; // we like all things outside .git
			}

			return segments.length === 1; // we only care about the .git folder itself
		});

		// We only ever refresh from files/folders that got added or deleted
		if (e.gotAdded() || e.gotDeleted()) {
			let added = e.getAdded();
			let deleted = e.getDeleted();

			let root = this.getInput();
			if (!root) {
				return false;
			}

			// Check added: Refresh if added file/folder is not part of resolved root and parent is part of it
			let ignoredPaths: { [fsPath: string]: boolean } = <{ [fsPath: string]: boolean }>{};
			for (let i = 0; i < added.length; i++) {
				let change = added[i];
				if (!this.contextService.isInsideWorkspace(change.resource)) {
					continue; // out of workspace file
				}

				// Find parent
				let parent = paths.dirname(change.resource.fsPath);

				// Continue if parent was already determined as to be ignored
				if (ignoredPaths[parent]) {
					continue;
				}

				// Compute if parent is visible and added file not yet part of it
				let parentStat = root.find(URI.file(parent));
				if (parentStat && parentStat.isDirectoryResolved && !root.find(change.resource)) {
					return true;
				}

				// Keep track of path that can be ignored for faster lookup
				if (!parentStat || !parentStat.isDirectoryResolved) {
					ignoredPaths[parent] = true;
				}
			}

			// Check deleted: Refresh if deleted file/folder part of resolved root
			for (let j = 0; j < deleted.length; j++) {
				let del = deleted[j];
				if (!this.contextService.isInsideWorkspace(del.resource)) {
					continue; // out of workspace file
				}

				if (root.find(del.resource)) {
					return true;
				}
			}
		}

		return false;
	}

	private filterToAddRemovedOnWorkspacePath(e: FileChangesEvent, fn: (change: IFileChange, workspacePathSegments: string[]) => boolean): FileChangesEvent {
		return new FileChangesEvent(e.changes.filter(change => {
			if (change.type === FileChangeType.UPDATED) {
				return false; // we only want added / removed
			}

			let workspacePath = this.contextService.toWorkspaceRelativePath(change.resource);
			if (!workspacePath) {
				return false; // not inside workspace
			}

			let segments = workspacePath.split(/\//);

			return fn(change, segments);
		}));
	}

	private refreshFromEvent(): void {
		if (this.isVisible) {
			this.explorerRefreshDelayer.trigger(() => {
				if (!this.explorerViewer.getHighlight()) {
					return this.doRefresh();
				}

				return TPromise.as(null);
			}).done(null, errors.onUnexpectedError);
		} else {
			this.shouldRefresh = true;
		}
	}

	/**
	 * Refresh the contents of the explorer to get up to date data from the disk about the file structure.
	 */
	public refresh(): TPromise<void> {
		if (!this.explorerViewer || this.explorerViewer.getHighlight()) {
			return TPromise.as(null);
		}

		// Focus
		this.explorerViewer.DOMFocus();

		// Find resource to focus from active editor input if set
		let resourceToFocus: URI;
		if (this.autoReveal) {
			resourceToFocus = this.getActiveEditorInputResource();
			if (!resourceToFocus) {
				let selection = this.explorerViewer.getSelection();
				if (selection && selection.length === 1) {
					resourceToFocus = (<FileStat>selection[0]).resource;
				}
			}
		}

		return this.doRefresh().then(() => {
			if (resourceToFocus) {
				return this.select(resourceToFocus, true);
			}

			return TPromise.as(null);
		});
	}

	private doRefresh(): TPromise<void> {
		let root = this.getInput();
		let targetsToResolve: URI[] = [];
		let targetsToExpand: URI[] = [];

		if (this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES]) {
			targetsToExpand = this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES].map(e => URI.parse(e));
		}

		// First time refresh: Receive target through active editor input or selection and also include settings from previous session
		if (!root) {
			let activeResource = this.getActiveEditorInputResource();
			if (activeResource) {
				targetsToResolve.push(activeResource);
			}

			if (targetsToExpand.length) {
				targetsToResolve.push(...targetsToExpand);
			}
		}

		// Subsequent refresh: Receive targets through expanded folders in tree
		else {
			this.getResolvedDirectories(root, targetsToResolve);
		}

		// Load Root Stat with given target path configured
		let options: IResolveFileOptions = { resolveTo: targetsToResolve };
		let promise = this.fileService.resolveFile(this.workspace.resource, options).then(stat => {
			let explorerPromise: TPromise<void>;

			// Convert to model
			let modelStat = FileStat.create(stat, options.resolveTo);

			// First time refresh: The stat becomes the input of the viewer
			if (!root) {
				explorerPromise = this.explorerViewer.setInput(modelStat).then(() => {

					// Make sure to expand all folders that where expanded in the previous session
					if (targetsToExpand) {
						return this.explorerViewer.expandAll(targetsToExpand.map(expand => this.getInput().find(expand)));
					}

					return TPromise.as(null);
				});
			}

			// Subsequent refresh: Merge stat into our local model and refresh tree
			else {
				FileStat.mergeLocalWithDisk(modelStat, root);

				explorerPromise = this.explorerViewer.refresh(root);
			}

			return explorerPromise;
		}, (e: any) => TPromise.wrapError(e));

		this.progressService.showWhile(promise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

		return promise;
	}

	/**
	 * Given a stat, fills an array of path that make all folders below the stat that are resolved directories.
	 */
	private getResolvedDirectories(stat: FileStat, resolvedDirectories: URI[]): void {
		if (stat.isDirectoryResolved) {
			if (stat.resource.toString() !== this.workspace.resource.toString()) {

				// Drop those path which are parents of the current one
				for (let i = resolvedDirectories.length - 1; i >= 0; i--) {
					let resource = resolvedDirectories[i];
					if (stat.resource.toString().indexOf(resource.toString()) === 0) {
						resolvedDirectories.splice(i);
					}
				}

				// Add to the list of path to resolve
				resolvedDirectories.push(stat.resource);
			}

			// Recurse into children
			for (let i = 0; i < stat.children.length; i++) {
				let child = stat.children[i];
				this.getResolvedDirectories(child, resolvedDirectories);
			}
		}
	}

	/**
	 * Selects and reveal the file element provided by the given resource if its found in the explorer. Will try to
	 * resolve the path from the disk in case the explorer is not yet expanded to the file yet.
	 */
	public select(resource: URI, reveal: boolean = this.autoReveal): TPromise<void> {

		// Require valid path
		if (!resource || resource.toString() === this.workspace.resource.toString()) {
			return TPromise.as(null);
		}

		// If path already selected, just reveal and return
		let selection = this.hasSelection(resource);
		if (selection) {
			return reveal ? this.reveal(selection, 0.5) : TPromise.as(null);
		}

		// First try to get the stat object from the input to avoid a roundtrip
		let root = this.getInput();
		if (!root) {
			return TPromise.as(null);
		}

		let fileStat = root.find(resource);
		if (fileStat) {
			return this.doSelect(fileStat, reveal);
		}

		// Stat needs to be resolved first and then revealed
		let options: IResolveFileOptions = { resolveTo: [resource] };
		return this.fileService.resolveFile(this.workspace.resource, options).then(stat => {

			// Convert to model
			let modelStat = FileStat.create(stat, options.resolveTo);

			// Update Input with disk Stat
			FileStat.mergeLocalWithDisk(modelStat, root);

			// Select and Reveal
			return this.explorerViewer.refresh(root).then(() => this.doSelect(root.find(resource), reveal));

		}, (e: any) => this.messageService.show(Severity.Error, e));
	}

	private hasSelection(resource: URI): FileStat {
		let currentSelection: FileStat[] = this.explorerViewer.getSelection();

		for (let i = 0; i < currentSelection.length; i++) {
			if (currentSelection[i].resource.toString() === resource.toString()) {
				return currentSelection[i];
			}
		}

		return null;
	}

	private doSelect(fileStat: FileStat, reveal: boolean): TPromise<void> {
		if (!fileStat) {
			return TPromise.as(null);
		}

		// Special case: we are asked to reveal and select an element that is not visible
		// In this case we take the parent element so that we are at least close to it.
		if (!this.filter.isVisible(this.tree, fileStat)) {
			fileStat = fileStat.parent;
			if (!fileStat) {
				return TPromise.as(null);
			}
		}

		// Reveal depending on flag
		let revealPromise: TPromise<void>;
		if (reveal) {
			revealPromise = this.reveal(fileStat, 0.5);
		} else {
			revealPromise = TPromise.as(null);
		}

		return revealPromise.then(() => {
			if (!fileStat.isDirectory) {
				this.explorerViewer.setSelection([fileStat]); // Since folders can not be opened, only select files
			}

			this.explorerViewer.setFocus(fileStat);
		});
	}

	public shutdown(): void {

		// Keep list of expanded folders to restore on next load
		let root = this.getInput();
		if (root) {
			let expanded = this.explorerViewer.getExpandedElements()
				.filter((e: FileStat) => e.resource.toString() !== this.workspace.resource.toString())
				.map((e: FileStat) => e.resource.toString());

			this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES] = expanded;
		}

		super.shutdown();
	}

	public dispose(): void {
		if (this.toolBar) {
			this.toolBar.dispose();
		}

		super.dispose();
	}
}