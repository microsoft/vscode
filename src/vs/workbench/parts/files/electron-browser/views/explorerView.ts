/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import URI from 'vs/base/common/uri';
import { ThrottledDelayer, Delayer } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as glob from 'vs/base/common/glob';
import { Action, IAction } from 'vs/base/common/actions';
import { memoize } from 'vs/base/common/decorators';
import { IFilesConfiguration, ExplorerFolderContext, FilesExplorerFocusedContext, ExplorerFocusedContext, SortOrderConfiguration, SortOrder, IExplorerView, ExplorerRootContext } from 'vs/workbench/parts/files/common/files';
import { FileOperation, FileOperationEvent, IResolveFileOptions, FileChangeType, FileChangesEvent, IFileService, FILES_EXCLUDE_CONFIG } from 'vs/platform/files/common/files';
import { RefreshViewExplorerAction, NewFolderAction, NewFileAction } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { FileDragAndDrop, FileFilter, FileSorter, FileController, FileRenderer, FileDataSource, FileViewletState, FileAccessibilityProvider } from 'vs/workbench/parts/files/electron-browser/views/explorerViewer';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import * as DOM from 'vs/base/browser/dom';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { IViewletViewOptions, IViewOptions, TreeViewsViewletPanel, FileIconThemableWorkbenchTree } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ExplorerItem, Model } from 'vs/workbench/parts/files/common/explorerModel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ExplorerDecorationsProvider } from 'vs/workbench/parts/files/electron-browser/views/explorerDecorationsProvider';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { ResourceGlobMatcher } from 'vs/workbench/electron-browser/resources';
import { isLinux } from 'vs/base/common/platform';
import { IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';

export interface IExplorerViewOptions extends IViewletViewOptions {
	viewletState: FileViewletState;
}

export class ExplorerView extends TreeViewsViewletPanel implements IExplorerView {

	public static readonly ID: string = 'workbench.explorer.fileView';
	private static readonly EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first
	private static readonly EXPLORER_FILE_CHANGES_REFRESH_DELAY = 100; // delay in ms to refresh the explorer from disk file changes

	private static readonly MEMENTO_LAST_ACTIVE_FILE_RESOURCE = 'explorer.memento.lastActiveFileResource';
	private static readonly MEMENTO_EXPANDED_FOLDER_RESOURCES = 'explorer.memento.expandedFolderResources';

	public readonly id: string = ExplorerView.ID;

	private explorerViewer: WorkbenchTree;
	private filter: FileFilter;
	private viewletState: FileViewletState;

	private explorerRefreshDelayer: ThrottledDelayer<void>;

	private resourceContext: ResourceContextKey;
	private folderContext: IContextKey<boolean>;
	private rootContext: IContextKey<boolean>;

	private fileEventsFilter: ResourceGlobMatcher;

	private shouldRefresh: boolean;
	private autoReveal: boolean;
	private sortOrder: SortOrder;
	private settings: object;
	private treeContainer: HTMLElement;
	private dragHandler: DelayedDragHandler;
	private isDisposed: boolean;

	constructor(
		options: IExplorerViewOptions,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IProgressService private progressService: IProgressService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDecorationsService decorationService: IDecorationsService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService);

		this.settings = options.viewletSettings;
		this.viewletState = options.viewletState;
		this.autoReveal = true;

		this.explorerRefreshDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_FILE_CHANGES_REFRESH_DELAY);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);
		this.folderContext = ExplorerFolderContext.bindTo(contextKeyService);
		this.rootContext = ExplorerRootContext.bindTo(contextKeyService);

		this.fileEventsFilter = instantiationService.createInstance(
			ResourceGlobMatcher,
			(root: URI) => this.getFileEventsExcludes(root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG)
		);

		decorationService.registerDecorationsProvider(new ExplorerDecorationsProvider(this.model, contextService));
	}

	private getFileEventsExcludes(root?: URI): glob.IExpression {
		const scope = root ? { resource: root } : void 0;
		const configuration = this.configurationService.getValue<IFilesConfiguration>(scope);

		return (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
	}

	protected renderHeader(container: HTMLElement): void {
		super.renderHeader(container);

		// Expand on drag over
		this.dragHandler = new DelayedDragHandler(container, () => this.setExpanded(true));

		const titleElement = container.querySelector('.title') as HTMLElement;
		const setHeader = () => {
			const workspace = this.contextService.getWorkspace();
			const title = workspace.folders.map(folder => folder.name).join();
			titleElement.textContent = this.name;
			titleElement.title = title;
		};

		this.disposables.push(this.contextService.onDidChangeWorkspaceName(setHeader));
		setHeader();
	}

	public get name(): string {
		return this.contextService.getWorkspace().name;
	}

	public get title(): string {
		return this.name;
	}

	public set title(value: string) {
		// noop
	}

	public set name(value) {
		// noop
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = DOM.append(container, DOM.$('.explorer-folders-view'));
		this.tree = this.createViewer($(this.treeContainer));

		if (this.toolbar) {
			this.toolbar.setActions(this.getActions(), this.getSecondaryActions())();
		}

		this.disposables.push(this.contextService.onDidChangeWorkspaceFolders(e => this.refreshFromEvent(e.added)));
		this.disposables.push(this.contextService.onDidChangeWorkbenchState(e => this.refreshFromEvent()));
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	public getActions(): IAction[] {
		const actions: Action[] = [];

		actions.push(this.instantiationService.createInstance(NewFileAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(NewFolderAction, this.getViewer(), null));
		actions.push(this.instantiationService.createInstance(RefreshViewExplorerAction, this, 'explorer-action refresh-explorer'));
		actions.push(this.instantiationService.createInstance(CollapseAction, this.getViewer(), true, 'explorer-action collapse-explorer'));

		return actions;
	}

	public create(): TPromise<void> {

		// Update configuration
		const configuration = this.configurationService.getValue<IFilesConfiguration>();
		this.onConfigurationUpdated(configuration);

		// Load and Fill Viewer
		let targetsToExpand = [];
		if (this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES]) {
			targetsToExpand = this.settings[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES].map((e: string) => URI.parse(e));
		}
		return this.doRefresh(targetsToExpand).then(() => {

			// When the explorer viewer is loaded, listen to changes to the editor input
			this.disposables.push(this.editorGroupService.onEditorsChanged(() => this.revealActiveFile()));

			// Also handle configuration updates
			this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>(), e)));

			this.revealActiveFile();
		});
	}

	private revealActiveFile(): void {
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
			if (this.isVisible() && !this.isDisposed && this.contextService.isInsideWorkspace(activeFile)) {
				const selection = this.hasSingleSelection(activeFile);
				if (!selection) {
					this.select(activeFile).done(null, errors.onUnexpectedError);
				}

				clearSelection = false;
			}
		}

		// Handle closed or untitled file (convince explorer to not reopen any file when getting visible)
		const activeInput = this.editorService.getActiveEditorInput();
		if (!activeInput || toResource(activeInput, { supportSideBySide: true, filter: Schemas.untitled })) {
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

	private onConfigurationUpdated(configuration: IFilesConfiguration, event?: IConfigurationChangeEvent): void {
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

		if (event && !needsRefresh) {
			needsRefresh = event.affectsConfiguration('explorer.decorations.colors')
				|| event.affectsConfiguration('explorer.decorations.badges');
		}

		// Refresh viewer as needed if this originates from a config event
		if (event && needsRefresh) {
			this.doRefresh().done(null, errors.onUnexpectedError);
		}
	}

	public focus(): void {
		super.focus();

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
			this.explorerViewer.domFocus();
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
					return TPromise.wrap(null);
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
		const stat: ExplorerItem = this.explorerViewer.getFocus();
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
		return toResource(input, { supportSideBySide: true });
	}

	private get isCreated(): boolean {
		return !!(this.explorerViewer && this.explorerViewer.getInput());
	}

	@memoize
	private get model(): Model {
		const model = this.instantiationService.createInstance(Model);
		this.disposables.push(model);

		return model;
	}

	private createViewer(container: Builder): WorkbenchTree {
		const dataSource = this.instantiationService.createInstance(FileDataSource);
		const renderer = this.instantiationService.createInstance(FileRenderer, this.viewletState);
		const controller = this.instantiationService.createInstance(FileController);
		this.disposables.push(controller);
		const sorter = this.instantiationService.createInstance(FileSorter);
		this.disposables.push(sorter);
		this.filter = this.instantiationService.createInstance(FileFilter);
		this.disposables.push(this.filter);
		const dnd = this.instantiationService.createInstance(FileDragAndDrop);
		const accessibilityProvider = this.instantiationService.createInstance(FileAccessibilityProvider);

		this.explorerViewer = this.instantiationService.createInstance(FileIconThemableWorkbenchTree, container.getHTMLElement(), {
			dataSource,
			renderer,
			controller,
			sorter,
			filter: this.filter,
			dnd,
			accessibilityProvider
		}, {
				autoExpandSingleChildren: true,
				ariaLabel: nls.localize('treeAriaLabel', "Files Explorer")
			});

		// Bind context keys
		FilesExplorerFocusedContext.bindTo(this.explorerViewer.contextKeyService);
		ExplorerFocusedContext.bindTo(this.explorerViewer.contextKeyService);

		// Update Viewer based on File Change Events
		this.disposables.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.disposables.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Update resource context based on focused element
		this.disposables.push(this.explorerViewer.onDidChangeFocus((e: { focus: ExplorerItem }) => {
			const isSingleFolder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER;
			const resource = e.focus ? e.focus.resource : isSingleFolder ? this.contextService.getWorkspace().folders[0].uri : undefined;
			this.resourceContext.set(resource);
			this.folderContext.set((isSingleFolder && !e.focus) || e.focus && e.focus.isDirectory);
			this.rootContext.set(!e.focus || (e.focus && e.focus.isRoot));
		}));

		// Open when selecting via keyboard
		this.disposables.push(this.explorerViewer.onDidChangeSelection(event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				const element = this.tree.getSelection();

				if (Array.isArray(element) && element[0] instanceof ExplorerItem) {
					if (element[0].isDirectory) {
						this.explorerViewer.toggleExpansion(element[0]);
					}

					controller.openEditor(element[0], { pinned: false, sideBySide: false, preserveFocus: false });
				}
			}
		}));

		return this.explorerViewer;
	}

	getViewer(): WorkbenchTree {
		return this.tree;
	}

	public getOptimalWidth(): number {
		const parentNode = this.explorerViewer.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.explorer-item .label-name')); // select all file labels

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	private onFileOperation(e: FileOperationEvent): void {
		if (!this.isCreated) {
			return; // ignore if not yet created
		}

		// Add
		if (e.operation === FileOperation.CREATE || e.operation === FileOperation.IMPORT || e.operation === FileOperation.COPY) {
			const addedElement = e.target;
			const parentResource = resources.dirname(addedElement.resource);
			const parents = this.model.findAll(parentResource);

			if (parents.length) {

				// Add the new file to its parent (Model)
				parents.forEach(p => {
					// We have to check if the parent is resolved #29177
					(p.isDirectoryResolved ? TPromise.as(null) : this.fileService.resolveFile(p.resource)).then(stat => {
						if (stat) {
							const modelStat = ExplorerItem.create(stat, p.root);
							ExplorerItem.mergeLocalWithDisk(modelStat, p);
						}

						const childElement = ExplorerItem.create(addedElement, p.root);
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

			const oldParentResource = resources.dirname(oldResource);
			const newParentResource = resources.dirname(newElement.resource);

			// Only update focus if renamed/moved element is selected
			let restoreFocus = false;
			const focus: ExplorerItem = this.explorerViewer.getFocus();
			if (focus && focus.resource && focus.resource.toString() === oldResource.toString()) {
				restoreFocus = true;
			}

			let isExpanded = false;
			// Handle Rename
			if (oldParentResource && newParentResource && oldParentResource.toString() === newParentResource.toString()) {
				const modelElements = this.model.findAll(oldResource);
				modelElements.forEach(modelElement => {
					//Check if element is expanded
					isExpanded = this.explorerViewer.isExpanded(modelElement);
					// Rename File (Model)
					modelElement.rename(newElement);

					// Update Parent (View)
					this.explorerViewer.refresh(modelElement.parent).done(() => {

						// Select in Viewer if set
						if (restoreFocus) {
							this.explorerViewer.setFocus(modelElement);
						}
						//Expand the element again
						if (isExpanded) {
							this.explorerViewer.expand(modelElement);
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
							this.explorerViewer.domFocus();
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
			const ignoredPaths: { [resource: string]: boolean } = <{ [resource: string]: boolean }>{};
			for (let i = 0; i < added.length; i++) {
				const change = added[i];
				if (!this.contextService.isInsideWorkspace(change.resource)) {
					continue; // out of workspace file
				}

				// Find parent
				const parent = resources.dirname(change.resource);

				// Continue if parent was already determined as to be ignored
				if (ignoredPaths[parent.toString()]) {
					continue;
				}

				// Compute if parent is visible and added file not yet part of it
				const parentStat = this.model.findClosest(parent);
				if (parentStat && parentStat.isDirectoryResolved && !this.model.findClosest(change.resource)) {
					return true;
				}

				// Keep track of path that can be ignored for faster lookup
				if (!parentStat || !parentStat.isDirectoryResolved) {
					ignoredPaths[parent.toString()] = true;
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

	private refreshFromEvent(newRoots: IWorkspaceFolder[] = []): void {
		if (this.isVisible() && !this.isDisposed) {
			this.explorerRefreshDelayer.trigger(() => {
				if (!this.explorerViewer.getHighlight()) {
					return this.doRefresh(newRoots.map(r => r.uri)).then(() => {
						if (newRoots.length === 1) {
							return this.reveal(this.model.findClosest(newRoots[0].uri), 0.5);
						}

						return undefined;
					});
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
		this.explorerViewer.domFocus();

		// Find resource to focus from active editor input if set
		let resourceToFocus: URI;
		if (this.autoReveal) {
			resourceToFocus = this.getActiveFile();
			if (!resourceToFocus) {
				const selection = this.explorerViewer.getSelection();
				if (selection && selection.length === 1) {
					resourceToFocus = (<ExplorerItem>selection[0]).resource;
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

	private doRefresh(targetsToExpand: URI[] = []): TPromise<any> {
		const targetsToResolve = this.model.roots.map(root => ({ root, resource: root.resource, options: { resolveTo: [] } }));

		// First time refresh: Receive target through active editor input or selection and also include settings from previous session
		if (!this.isCreated) {
			const activeFile = this.getActiveFile();
			if (activeFile) {
				const workspaceFolder = this.contextService.getWorkspaceFolder(activeFile);
				if (workspaceFolder) {
					const found = targetsToResolve.filter(t => t.root.resource.toString() === workspaceFolder.uri.toString()).pop();
					found.options.resolveTo.push(activeFile);
				}
			}

			targetsToExpand.forEach(toExpand => {
				const workspaceFolder = this.contextService.getWorkspaceFolder(toExpand);
				if (workspaceFolder) {
					const found = targetsToResolve.filter(ttr => ttr.resource.toString() === workspaceFolder.uri.toString()).pop();
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

		const promise = this.resolveRoots(targetsToResolve, targetsToExpand);
		this.progressService.showWhile(promise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

		return promise;
	}

	private resolveRoots(targetsToResolve: { root: ExplorerItem, resource: URI, options: { resolveTo: any[] } }[], targetsToExpand: URI[]): TPromise<any> {

		// Display roots only when multi folder workspace
		const input = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.model.roots[0] : this.model;
		const errorFileStat = (resource: URI, root: ExplorerItem) => ExplorerItem.create({
			resource: resource,
			name: paths.basename(resource.fsPath),
			mtime: 0,
			etag: undefined,
			isDirectory: true
		}, root);

		const setInputAndExpand = (input: ExplorerItem | Model, statsToExpand: ExplorerItem[]) => {
			// Make sure to expand all folders that where expanded in the previous session
			// Special case: we are switching to multi workspace view, thus expand all the roots (they might just be added)
			if (input === this.model && statsToExpand.every(fs => fs && !fs.isRoot)) {
				statsToExpand = this.model.roots.concat(statsToExpand);
			}

			return this.explorerViewer.setInput(input).then(() => this.explorerViewer.expandAll(statsToExpand));
		};

		if (targetsToResolve.every(t => t.root.resource.scheme === 'file')) {
			// All the roots are local, resolve them in parallel
			return this.fileService.resolveFiles(targetsToResolve).then(results => {
				// Convert to model
				const modelStats = results.map((result, index) => {
					if (result.success && result.stat.isDirectory) {
						return ExplorerItem.create(result.stat, targetsToResolve[index].root, targetsToResolve[index].options.resolveTo);
					}

					return errorFileStat(targetsToResolve[index].resource, targetsToResolve[index].root);
				});
				// Subsequent refresh: Merge stat into our local model and refresh tree
				modelStats.forEach((modelStat, index) => {
					if (index < this.model.roots.length) {
						ExplorerItem.mergeLocalWithDisk(modelStat, this.model.roots[index]);
					}
				});

				const statsToExpand: ExplorerItem[] = this.explorerViewer.getExpandedElements().concat(targetsToExpand.map(expand => this.model.findClosest(expand)));
				if (input === this.explorerViewer.getInput()) {
					return this.explorerViewer.refresh().then(() => this.explorerViewer.expandAll(statsToExpand));
				}

				return setInputAndExpand(input, statsToExpand);
			});
		}

		// There is a remote root, resolve the roots sequantally
		let statsToExpand: ExplorerItem[] = [];
		let delayer = new Delayer(100);
		let delayerPromise: TPromise;
		return TPromise.join(targetsToResolve.map((target, index) => this.fileService.resolveFile(target.resource, target.options)
			.then(result => result.isDirectory ? ExplorerItem.create(result, target.root, target.options.resolveTo) : errorFileStat(target.resource, target.root), err => errorFileStat(target.resource, target.root))
			.then(modelStat => {
				// Subsequent refresh: Merge stat into our local model and refresh tree
				if (index < this.model.roots.length) {
					ExplorerItem.mergeLocalWithDisk(modelStat, this.model.roots[index]);
				}

				let toExpand: ExplorerItem[] = this.explorerViewer.getExpandedElements().concat(targetsToExpand.map(target => this.model.findClosest(target)));
				if (input === this.explorerViewer.getInput()) {
					statsToExpand = statsToExpand.concat(toExpand);
					if (!delayer.isTriggered()) {
						delayerPromise = delayer.trigger(() => this.explorerViewer.refresh()
							.then(() => this.explorerViewer.expandAll(statsToExpand))
							.then(() => statsToExpand = [])
						);
					}

					return delayerPromise;
				}

				return setInputAndExpand(input, statsToExpand);
			})));
	}

	/**
	 * Given a stat, fills an array of path that make all folders below the stat that are resolved directories.
	 */
	private getResolvedDirectories(stat: ExplorerItem, resolvedDirectories: URI[]): void {
		if (stat.isDirectoryResolved) {
			if (!stat.isRoot) {

				// Drop those path which are parents of the current one
				for (let i = resolvedDirectories.length - 1; i >= 0; i--) {
					const resource = resolvedDirectories[i];
					if (resources.isEqualOrParent(stat.resource, resource, !isLinux /* ignorecase */)) {
						resolvedDirectories.splice(i);
					}
				}

				// Add to the list of path to resolve
				resolvedDirectories.push(stat.resource);
			}

			// Recurse into children
			stat.getChildrenArray().forEach(child => {
				this.getResolvedDirectories(child, resolvedDirectories);
			});
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
		const selection = this.hasSingleSelection(resource);
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
		const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
		const rootUri = workspaceFolder ? workspaceFolder.uri : this.model.roots[0].resource;
		return this.fileService.resolveFile(rootUri, options).then(stat => {

			// Convert to model
			const root = this.model.roots.filter(r => r.resource.toString() === rootUri.toString()).pop();
			const modelStat = ExplorerItem.create(stat, root, options.resolveTo);
			// Update Input with disk Stat
			ExplorerItem.mergeLocalWithDisk(modelStat, root);

			// Select and Reveal
			return this.explorerViewer.refresh(root).then(() => this.doSelect(root.find(resource), reveal));

		}, e => { this.notificationService.error(e); });
	}

	private hasSingleSelection(resource: URI): ExplorerItem {
		const currentSelection: ExplorerItem[] = this.explorerViewer.getSelection();
		return currentSelection.length === 1 && currentSelection[0].resource.toString() === resource.toString()
			? currentSelection[0]
			: undefined;
	}

	private doSelect(fileStat: ExplorerItem, reveal: boolean): TPromise<void> {
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

	private reveal(element: any, relativeTop?: number): TPromise<void> {
		if (!this.tree) {
			return TPromise.as(null); // return early if viewlet has not yet been created
		}
		return this.tree.reveal(element, relativeTop);
	}

	public shutdown(): void {

		// Keep list of expanded folders to restore on next load
		if (this.isCreated) {
			const expanded = this.explorerViewer.getExpandedElements()
				.filter(e => e instanceof ExplorerItem)
				.map((e: ExplorerItem) => e.resource.toString());

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

	dispose(): void {
		this.isDisposed = true;
		if (this.dragHandler) {
			this.dragHandler.dispose();
		}
		super.dispose();
	}
}
