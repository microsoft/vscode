/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import URI from 'vs/base/common/uri';
import { ThrottledDelayer } from 'vs/base/common/async';
import errors = require('vs/base/common/errors');
import labels = require('vs/base/common/labels');
import paths = require('vs/base/common/paths');
import glob = require('vs/base/common/glob');
import { Action, IAction } from 'vs/base/common/actions';
import { prepareActions } from 'vs/workbench/browser/actions';
import { memoize } from 'vs/base/common/decorators';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IFilesConfiguration, ExplorerFolderContext, FilesExplorerFocusedContext, ExplorerFocusedContext, SortOrderConfiguration, SortOrder } from 'vs/workbench/parts/files/common/files';
import { FileOperation, FileOperationEvent, IResolveFileOptions, FileChangeType, FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { RefreshViewExplorerAction, NewFolderAction, NewFileAction } from 'vs/workbench/parts/files/browser/fileActions';
import { FileDragAndDrop, FileFilter, FileSorter, FileController, FileRenderer, FileDataSource, FileViewletState, FileAccessibilityProvider } from 'vs/workbench/parts/files/browser/views/explorerViewer';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import * as DOM from 'vs/base/browser/dom';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { FileStat, Model } from 'vs/workbench/parts/files/common/explorerModel';
import { IListService } from 'vs/platform/list/browser/listService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ResourceContextKey, ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IWorkbenchThemeService, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { isLinux } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';

export interface IExplorerViewOptions extends IViewletViewOptions {
	viewletState: FileViewletState;
}

export class ExplorerView extends CollapsibleView {

	public static ID: string = 'workbench.explorer.fileView';
	private static EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first
	private static EXPLORER_FILE_CHANGES_REFRESH_DELAY = 100; // delay in ms to refresh the explorer from disk file changes
	private static EXPLORER_IMPORT_REFRESH_DELAY = 300; // delay in ms to refresh the explorer from imports

	private static MEMENTO_LAST_ACTIVE_FILE_RESOURCE = 'explorer.memento.lastActiveFileResource';
	private static MEMENTO_EXPANDED_FOLDER_RESOURCES = 'explorer.memento.expandedFolderResources';

	public readonly id: string = ExplorerView.ID;

	private explorerViewer: ITree;
	private filter: FileFilter;
	private viewletState: FileViewletState;

	private explorerRefreshDelayer: ThrottledDelayer<void>;
	private explorerImportDelayer: ThrottledDelayer<void>;

	private resourceContext: ResourceContextKey;
	private folderContext: IContextKey<boolean>;

	private filesExplorerFocusedContext: IContextKey<boolean>;
	private explorerFocusedContext: IContextKey<boolean>;

	private fileEventsFilter: ResourceGlobMatcher;

	private shouldRefresh: boolean;
	private autoReveal: boolean;
	private sortOrder: SortOrder;
	private settings: object;

	constructor(
		initialSize: number,
		options: IExplorerViewOptions,
		@IMessageService private messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IProgressService private progressService: IProgressService,
		@IListService private listService: IListService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(initialSize, { ...(options as IViewOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section"), sizing: ViewSizing.Flexible }, keybindingService, contextMenuService);

		this.settings = options.viewletSettings;
		this.viewletState = options.viewletState;
		this.actionRunner = options.actionRunner;
		this.autoReveal = true;

		this.explorerRefreshDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_FILE_CHANGES_REFRESH_DELAY);
		this.explorerImportDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_IMPORT_REFRESH_DELAY);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);
		this.folderContext = ExplorerFolderContext.bindTo(contextKeyService);

		this.filesExplorerFocusedContext = FilesExplorerFocusedContext.bindTo(contextKeyService);
		this.explorerFocusedContext = ExplorerFocusedContext.bindTo(contextKeyService);

		this.fileEventsFilter = instantiationService.createInstance(ResourceGlobMatcher, root => this.getFileEventsExcludes(root), (expression: glob.IExpression) => glob.parse(expression));
	}

	private getFileEventsExcludes(root?: URI): glob.IExpression {
		const scope = root ? { resource: root } : void 0;
		const configuration = this.configurationService.getConfiguration<IFilesConfiguration>(undefined, scope);

		return (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		const titleSpan = $('span').appendTo(titleDiv);
		const setHeader = () => {
			const workspace = this.contextService.getWorkspace();
			const title = workspace.roots.map(root => labels.getPathLabel(root.fsPath, void 0, this.environmentService)).join();
			titleSpan.text(this.name).title(title);
		};
		this.toDispose.push(this.contextService.onDidChangeWorkspaceName(() => setHeader()));
		setHeader();

		super.renderHeader(container);
	}

	public get name(): string {
		return this.contextService.getWorkspace().name;
	}

	public set name(value) {
		// noop
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'explorer-folders-view');
		DOM.addClass(this.treeContainer, 'show-file-icons');

		this.tree = this.createViewer($(this.treeContainer));

		if (this.toolBar) {
			this.toolBar.setActions(prepareActions(this.getActions()), this.getSecondaryActions())();
		}

		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			DOM.toggleClass(this.treeContainer, 'align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
		};

		this.toDispose.push(this.themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		this.toDispose.push(this.contextService.onDidChangeWorkspaceRoots(() => this.refreshFromEvent()));
		onFileIconThemeChange(this.themeService.getFileIconTheme());
	}

	public getActions(): IAction[] {
		const actions: Action[] = [];

		actions.push(this.instantiationService.createInstance(NewFileAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(NewFolderAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(RefreshViewExplorerAction, this, 'explorer-action refresh-explorer'));
		actions.push(this.instantiationService.createInstance(CollapseAction, this.getViewer(), true, 'explorer-action collapse-explorer'));

		// Set Order
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
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
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(this.configurationService.getConfiguration<IFilesConfiguration>(), true)));
		});
	}

	private onEditorsChanged(): void {
		if (!this.autoReveal) {
			return; // do not touch selection or focus if autoReveal === false
		}

		let clearSelection = true;
		let clearFocus = false;

		// Handle files
		const activeFile = this.getActiveFile();
		if (activeFile) {

			// Always remember last opened file
			this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = activeFile.toString();

			// Select file if input is inside workspace
			if (this.isVisible() && this.contextService.isInsideWorkspace(activeFile)) {
				const selection = this.hasSelection(activeFile);
				if (!selection) {
					this.select(activeFile).done(null, errors.onUnexpectedError);
				}

				clearSelection = false;
			}
		}

		// Handle closed or untitled file (convince explorer to not reopen any file when getting visible)
		const activeInput = this.editorService.getActiveEditorInput();
		if (!activeInput || toResource(activeInput, { supportSideBySide: true, filter: 'untitled' })) {
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
		if (this.isDisposed) {
			return; // guard against possible race condition when config change causes recreate of views
		}

		this.autoReveal = configuration && configuration.explorer && configuration.explorer.autoReveal;

		// Push down config updates to components of viewer
		let needsRefresh = false;
		if (this.filter) {
			needsRefresh = this.filter.updateConfiguration();
		}

		const configSortOrder = configuration && configuration.explorer && configuration.explorer.sortOrder || 'default';
		if (this.sortOrder !== configSortOrder) {
			this.sortOrder = configSortOrder;
			needsRefresh = true;
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
				const selection = this.explorerViewer.getSelection();
				if (selection.length > 0) {
					this.reveal(selection[0], 0.5).done(null, errors.onUnexpectedError);
				}
			}

			// Pass Focus to Viewer
			this.explorerViewer.DOMFocus();
			keepFocus = true;
		}

		// Open the focused element in the editor if there is currently no file opened
		const activeFile = this.getActiveFile();
		if (!activeFile) {
			this.openFocusedElement(keepFocus);
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {

			// Show
			if (visible) {

				// If a refresh was requested and we are now visible, run it
				let refreshPromise = TPromise.as<void>(null);
				if (this.shouldRefresh) {
					refreshPromise = this.doRefresh();
					this.shouldRefresh = false; // Reset flag
				}

				if (!this.autoReveal) {
					return refreshPromise; // do not react to setVisible call if autoReveal === false
				}

				// Always select the current navigated file in explorer if input is file editor input
				// unless autoReveal is set to false
				const activeFile = this.getActiveFile();
				if (activeFile) {
					return refreshPromise.then(() => {
						return this.select(activeFile);
					});
				}

				// Return now if the workbench has not yet been created - in this case the workbench takes care of restoring last used editors
				if (!this.partService.isCreated()) {
					return TPromise.as(null);
				}

				// Otherwise restore last used file: By lastActiveFileResource
				let lastActiveFileResource: URI;
				if (this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]) {
					lastActiveFileResource = URI.parse(this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]);
				}

				if (lastActiveFileResource && this.isCreated && this.model.findClosest(lastActiveFileResource)) {
					this.editorService.openEditor({ resource: lastActiveFileResource, options: { revealIfVisible: true } }).done(null, errors.onUnexpectedError);

					return refreshPromise;
				}

				// Otherwise restore last used file: By Explorer selection
				return refreshPromise.then(() => {
					this.openFocusedElement();
				});
			}

			return void 0;
		});
	}

	private openFocusedElement(preserveFocus?: boolean): void {
		const stat: FileStat = this.explorerViewer.getFocus();
		if (stat && !stat.isDirectory) {
			this.editorService.openEditor({ resource: stat.resource, options: { preserveFocus, revealIfVisible: true } }).done(null, errors.onUnexpectedError);
		}
	}

	private getActiveFile(): URI {
		const input = this.editorService.getActiveEditorInput();

		// ignore diff editor inputs (helps to get out of diffing when returning to explorer)
		if (input instanceof DiffEditorInput) {
			return null;
		}

		// check for files
		return toResource(input, { supportSideBySide: true, filter: 'file' });
	}

	private get isCreated(): boolean {
		return !!(this.explorerViewer && this.explorerViewer.getInput());
	}

	@memoize
	private get model(): Model {
		return this.instantiationService.createInstance(Model);
	}

	public createViewer(container: Builder): ITree {
		const dataSource = this.instantiationService.createInstance(FileDataSource);
		const renderer = this.instantiationService.createInstance(FileRenderer, this.viewletState);
		const controller = this.instantiationService.createInstance(FileController, this.viewletState);
		const sorter = this.instantiationService.createInstance(FileSorter);
		this.filter = this.instantiationService.createInstance(FileFilter);
		const dnd = this.instantiationService.createInstance(FileDragAndDrop);
		const accessibilityProvider = this.instantiationService.createInstance(FileAccessibilityProvider);

		this.explorerViewer = new Tree(container.getHTMLElement(), {
			dataSource,
			renderer,
			controller,
			sorter,
			filter: this.filter,
			dnd,
			accessibilityProvider
		}, {
				autoExpandSingleChildren: true,
				ariaLabel: nls.localize('treeAriaLabel', "Files Explorer"),
				twistiePixels: 12,
				showTwistie: false,
				keyboardSupport: false
			});

		// Theme styler
		this.toDispose.push(attachListStyler(this.explorerViewer, this.themeService));

		// Register to list service
		this.toDispose.push(this.listService.register(this.explorerViewer, [this.explorerFocusedContext, this.filesExplorerFocusedContext]));

		// Update Viewer based on File Change Events
		this.toDispose.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.toDispose.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Update resource context based on focused element
		this.toDispose.push(this.explorerViewer.addListener('focus', (e: { focus: FileStat }) => {
			this.resourceContext.set(e.focus && e.focus.resource);
			this.folderContext.set(e.focus && e.focus.isDirectory);
		}));

		// Open when selecting via keyboard
		this.toDispose.push(this.explorerViewer.addListener('selection', event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				const element = this.tree.getSelection();

				if (Array.isArray(element) && element[0] instanceof FileStat) {
					if (element[0].isDirectory) {
						this.explorerViewer.toggleExpansion(element[0]);
					}

					controller.openEditor(element[0], { pinned: false, sideBySide: false, preserveFocus: false });
				}
			}
		}));

		return this.explorerViewer;
	}

	public getOptimalWidth(): number {
		const parentNode = this.explorerViewer.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.explorer-item > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	private onFileOperation(e: FileOperationEvent): void {
		if (!this.isCreated) {
			return; // ignore if not yet created
		}

		// Add
		if (e.operation === FileOperation.CREATE || e.operation === FileOperation.IMPORT || e.operation === FileOperation.COPY) {
			const addedElement = e.target;
			const parentResource = URI.file(paths.dirname(addedElement.resource.fsPath));
			const parents = this.model.findAll(parentResource);

			if (parents.length) {

				// Add the new file to its parent (Model)
				parents.forEach(p => {
					// We have to check if the parent is resolved #29177
					(p.isDirectoryResolved ? TPromise.as(null) : this.fileService.resolveFile(p.resource)).then(stat => {
						if (stat) {
							const modelStat = FileStat.create(stat, p.root);
							FileStat.mergeLocalWithDisk(modelStat, p);
						}

						const childElement = FileStat.create(addedElement, p.root);
						p.removeChild(childElement); // make sure to remove any previous version of the file if any
						p.addChild(childElement);
						// Refresh the Parent (View)
						this.explorerViewer.refresh(p).then(() => {
							return this.reveal(childElement, 0.5).then(() => {

								// Focus new element
								this.explorerViewer.setFocus(childElement);
							});
						}).done(null, errors.onUnexpectedError);
					});
				});
			}
		}

		// Move (including Rename)
		else if (e.operation === FileOperation.MOVE) {
			const oldResource = e.resource;
			const newElement = e.target;

			const oldParentResource = URI.file(paths.dirname(oldResource.fsPath));
			const newParentResource = URI.file(paths.dirname(newElement.resource.fsPath));

			// Only update focus if renamed/moved element is selected
			let restoreFocus = false;
			const focus: FileStat = this.explorerViewer.getFocus();
			if (focus && focus.resource && focus.resource.toString() === oldResource.toString()) {
				restoreFocus = true;
			}

			// Handle Rename
			if (oldParentResource && newParentResource && oldParentResource.toString() === newParentResource.toString()) {
				const modelElements = this.model.findAll(oldResource);
				modelElements.forEach(modelElement => {
					// Rename File (Model)
					modelElement.rename(newElement);

					// Update Parent (View)
					this.explorerViewer.refresh(modelElement.parent).done(() => {

						// Select in Viewer if set
						if (restoreFocus) {
							this.explorerViewer.setFocus(modelElement);
						}
					}, errors.onUnexpectedError);
				});
			}

			// Handle Move
			else if (oldParentResource && newParentResource) {
				const newParents = this.model.findAll(newParentResource);
				const modelElements = this.model.findAll(oldResource);

				if (newParents.length && modelElements.length) {

					// Move in Model
					modelElements.forEach((modelElement, index) => {
						const oldParent = modelElement.parent;
						modelElement.move(newParents[index], (callback: () => void) => {
							// Update old parent
							this.explorerViewer.refresh(oldParent).done(callback, errors.onUnexpectedError);
						}, () => {
							// Update new parent
							this.explorerViewer.refresh(newParents[index], true).done(() => this.explorerViewer.expand(newParents[index]), errors.onUnexpectedError);
						});
					});
				}
			}
		}

		// Delete
		else if (e.operation === FileOperation.DELETE) {
			const modelElements = this.model.findAll(e.resource);
			modelElements.forEach(element => {
				if (element.parent) {
					const parent = element.parent;
					// Remove Element from Parent (Model)
					parent.removeChild(element);

					// Refresh Parent (View)
					const restoreFocus = this.explorerViewer.isDOMFocused();
					this.explorerViewer.refresh(parent).done(() => {

						// Ensure viewer has keyboard focus if event originates from viewer
						if (restoreFocus) {
							this.explorerViewer.DOMFocus();
						}
					}, errors.onUnexpectedError);
				}
			});
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Ensure memento state does not capture a deleted file (we run this from a timeout because
		// delete events can result in UI activity that will fill the memento again when multiple
		// editors are closing)
		setTimeout(() => {
			const lastActiveResource: string = this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE];
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
		e = this.filterFileEvents(e);

		if (!this.isCreated) {
			return false;
		}

		if (e.gotAdded()) {
			const added = e.getAdded();

			// Check added: Refresh if added file/folder is not part of resolved root and parent is part of it
			const ignoredPaths: { [fsPath: string]: boolean } = <{ [fsPath: string]: boolean }>{};
			for (let i = 0; i < added.length; i++) {
				const change = added[i];
				if (!this.contextService.isInsideWorkspace(change.resource)) {
					continue; // out of workspace file
				}

				// Find parent
				const parent = paths.dirname(change.resource.fsPath);

				// Continue if parent was already determined as to be ignored
				if (ignoredPaths[parent]) {
					continue;
				}

				// Compute if parent is visible and added file not yet part of it
				const parentStat = this.model.findClosest(URI.file(parent));
				if (parentStat && parentStat.isDirectoryResolved && !this.model.findClosest(change.resource)) {
					return true;
				}

				// Keep track of path that can be ignored for faster lookup
				if (!parentStat || !parentStat.isDirectoryResolved) {
					ignoredPaths[parent] = true;
				}
			}
		}

		if (e.gotDeleted()) {
			const deleted = e.getDeleted();

			// Check deleted: Refresh if deleted file/folder part of resolved root
			for (let j = 0; j < deleted.length; j++) {
				const del = deleted[j];
				if (!this.contextService.isInsideWorkspace(del.resource)) {
					continue; // out of workspace file
				}

				if (this.model.findClosest(del.resource)) {
					return true;
				}
			}
		}

		if (this.sortOrder === SortOrderConfiguration.MODIFIED && e.gotUpdated()) {
			const updated = e.getUpdated();

			// Check updated: Refresh if updated file/folder part of resolved root
			for (let j = 0; j < updated.length; j++) {
				const upd = updated[j];
				if (!this.contextService.isInsideWorkspace(upd.resource)) {
					continue; // out of workspace file
				}

				if (this.model.findClosest(upd.resource)) {
					return true;
				}
			}
		}

		return false;
	}

	private filterFileEvents(e: FileChangesEvent): FileChangesEvent {
		return new FileChangesEvent(e.changes.filter(change => {
			if (!this.contextService.isInsideWorkspace(change.resource)) {
				return false; // exclude changes for resources outside of workspace
			}

			if (this.fileEventsFilter.matches(change.resource)) {
				return false; // excluded via files.exclude setting
			}

			return true;
		}));
	}

	private refreshFromEvent(): void {
		if (this.isVisible()) {
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
			resourceToFocus = this.getActiveFile();
			if (!resourceToFocus) {
				const selection = this.explorerViewer.getSelection();
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
		const targetsToResolve: { root: FileStat, resource: URI, options: { resolveTo: URI[] } }[] = [];
		this.model.roots.forEach(root => {
			const rootAndTargets = { root, resource: root.resource, options: { resolveTo: [] } };
			targetsToResolve.push(rootAndTargets);
		});

		let targetsToExpand: URI[] = [];
		if (this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES]) {
			targetsToExpand = this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES].map((e: string) => URI.parse(e));
		} else if (this.contextService.hasFolderWorkspace() || (this.contextService.hasMultiFolderWorkspace() && this.model.roots.length === 1)) {
			targetsToExpand = this.model.roots.map(root => root.resource); // always expand single folder workspace and multi folder workspace with only 1 root
		}

		// First time refresh: Receive target through active editor input or selection and also include settings from previous session
		if (!this.isCreated) {
			const activeFile = this.getActiveFile();
			if (activeFile) {
				const root = this.contextService.getRoot(activeFile);
				if (root) {
					const found = targetsToResolve.filter(t => t.root.resource.toString() === root.toString()).pop();
					found.options.resolveTo.push(activeFile);
				}
			}

			targetsToExpand.forEach(toExpand => {
				const root = this.contextService.getRoot(toExpand);
				if (root) {
					const found = targetsToResolve.filter(ttr => ttr.resource.toString() === root.toString()).pop();
					found.options.resolveTo.push(toExpand);
				}
			});
		}

		// Subsequent refresh: Receive targets through expanded folders in tree
		else {
			targetsToResolve.forEach(t => {
				this.getResolvedDirectories(t.root, t.options.resolveTo);
			});
		}

		// Load Root Stat with given target path configured
		const promise = this.fileService.resolveFiles(targetsToResolve).then(results => {
			// Convert to model
			const modelStats = results.map((result, index) => {
				if (result.success) {
					return FileStat.create(result.stat, targetsToResolve[index].root, targetsToResolve[index].options.resolveTo);
				}

				return FileStat.create({
					resource: targetsToResolve[index].resource,
					name: paths.basename(targetsToResolve[index].resource.fsPath),
					mtime: 0,
					etag: undefined,
					isDirectory: true,
					hasChildren: false
				}, targetsToResolve[index].root);
			});
			// Subsequent refresh: Merge stat into our local model and refresh tree
			modelStats.forEach((modelStat, index) => FileStat.mergeLocalWithDisk(modelStat, this.model.roots[index]));

			const input = this.contextService.hasFolderWorkspace() ? this.model.roots[0] : this.model;
			if (input === this.explorerViewer.getInput()) {
				return this.explorerViewer.refresh();
			}

			// Preserve expanded elements if tree input changed.
			// If it is a brand new tree just expand elements from memento
			const expanded = this.explorerViewer.getExpandedElements();
			const statsToExpand = expanded.length ? [this.model.roots[0]].concat(expanded) :
				targetsToExpand.map(expand => this.model.findClosest(expand));

			// Display roots only when multi folder workspace
			// Make sure to expand all folders that where expanded in the previous session
			return this.explorerViewer.setInput(input).then(() => this.explorerViewer.expandAll(statsToExpand));
		}, e => TPromise.wrapError(e));

		this.progressService.showWhile(promise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

		return promise;
	}

	/**
	 * Given a stat, fills an array of path that make all folders below the stat that are resolved directories.
	 */
	private getResolvedDirectories(stat: FileStat, resolvedDirectories: URI[]): void {
		if (stat.isDirectoryResolved) {
			if (!stat.isRoot) {

				// Drop those path which are parents of the current one
				for (let i = resolvedDirectories.length - 1; i >= 0; i--) {
					const resource = resolvedDirectories[i];
					if (paths.isEqualOrParent(stat.resource.fsPath, resource.fsPath, !isLinux /* ignorecase */)) {
						resolvedDirectories.splice(i);
					}
				}

				// Add to the list of path to resolve
				resolvedDirectories.push(stat.resource);
			}

			// Recurse into children
			for (let i = 0; i < stat.children.length; i++) {
				const child = stat.children[i];
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
		if (!resource) {
			return TPromise.as(null);
		}

		// If path already selected, just reveal and return
		const selection = this.hasSelection(resource);
		if (selection) {
			return reveal ? this.reveal(selection, 0.5) : TPromise.as(null);
		}

		// First try to get the stat object from the input to avoid a roundtrip
		if (!this.isCreated) {
			return TPromise.as(null);
		}

		const fileStat = this.model.findClosest(resource);
		if (fileStat) {
			return this.doSelect(fileStat, reveal);
		}

		// Stat needs to be resolved first and then revealed
		const options: IResolveFileOptions = { resolveTo: [resource] };
		const rootUri = this.contextService.getRoot(resource) || this.model.roots[0].resource;
		return this.fileService.resolveFile(rootUri, options).then(stat => {

			// Convert to model
			const root = this.model.roots.filter(r => r.resource.toString() === rootUri.toString()).pop();
			const modelStat = FileStat.create(stat, root, options.resolveTo);
			// Update Input with disk Stat
			FileStat.mergeLocalWithDisk(modelStat, root);

			// Select and Reveal
			return this.explorerViewer.refresh(root).then(() => this.doSelect(root.find(resource), reveal));

		}, e => { this.messageService.show(Severity.Error, e); });
	}

	private hasSelection(resource: URI): FileStat {
		const currentSelection: FileStat[] = this.explorerViewer.getSelection();

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
		if (this.isCreated) {
			const expanded = this.explorerViewer.getExpandedElements()
				.filter(e => e instanceof FileStat)
				.map((e: FileStat) => e.resource.toString());

			if (expanded.length) {
				this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES] = expanded;
			} else {
				delete this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES];
			}
		}

		// Clean up last focused if not set
		if (!this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]) {
			delete this.settings[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE];
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
