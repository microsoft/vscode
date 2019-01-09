/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import * as perf from 'vs/base/common/performance';
import { ThrottledDelayer, Delayer } from 'vs/base/common/async';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as glob from 'vs/base/common/glob';
import { Action, IAction } from 'vs/base/common/actions';
import { memoize } from 'vs/base/common/decorators';
import { IFilesConfiguration, ExplorerFolderContext, FilesExplorerFocusedContext, ExplorerFocusedContext, SortOrderConfiguration, SortOrder, IExplorerView, ExplorerRootContext, ExplorerResourceReadonlyContext } from 'vs/workbench/parts/files/common/files';
import { FileOperation, FileOperationEvent, IResolveFileOptions, FileChangeType, FileChangesEvent, IFileService, FILES_EXCLUDE_CONFIG, IFileStat } from 'vs/platform/files/common/files';
import { RefreshViewExplorerAction, NewFolderAction, NewFileAction } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { FileDragAndDrop, FileFilter, FileSorter, FileController, FileRenderer, FileDataSource, FileViewletState, FileAccessibilityProvider } from 'vs/workbench/parts/files/electron-browser/views/explorerViewer';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import * as DOM from 'vs/base/browser/dom';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { TreeViewsViewletPanel, FileIconThemableWorkbenchTree, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ExplorerItem, Model } from 'vs/workbench/parts/files/common/explorerModel';
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
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ILabelService } from 'vs/platform/label/common/label';
import { ResourceLabels, IResourceLabelsContainer } from 'vs/workbench/browser/labels';

export interface IExplorerViewOptions extends IViewletViewOptions {
	fileViewletState: FileViewletState;
}

export class ExplorerView extends TreeViewsViewletPanel implements IExplorerView {

	public static readonly ID: string = 'workbench.explorer.fileView';
	private static readonly EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first
	private static readonly EXPLORER_FILE_CHANGES_REFRESH_DELAY = 100; // delay in ms to refresh the explorer from disk file changes

	private static readonly MEMENTO_LAST_ACTIVE_FILE_RESOURCE = 'explorer.memento.lastActiveFileResource';
	private static readonly MEMENTO_EXPANDED_FOLDER_RESOURCES = 'explorer.memento.expandedFolderResources';

	public readonly id: string = ExplorerView.ID;

	private explorerViewer: WorkbenchTree;
	private explorerLabels: ResourceLabels;
	private filter: FileFilter;
	private fileViewletState: FileViewletState;

	private explorerRefreshDelayer: ThrottledDelayer<void>;

	private resourceContext: ResourceContextKey;
	private folderContext: IContextKey<boolean>;
	private readonlyContext: IContextKey<boolean>;
	private rootContext: IContextKey<boolean>;

	private fileEventsFilter: ResourceGlobMatcher;

	private shouldRefresh: boolean;
	private autoReveal: boolean;
	private sortOrder: SortOrder;
	private viewState: object;
	private treeContainer: HTMLElement;
	private dragHandler: DelayedDragHandler;
	private decorationProvider: ExplorerDecorationsProvider;
	private isDisposed: boolean;

	constructor(
		options: IExplorerViewOptions,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IProgressService private readonly progressService: IProgressService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@IPartService private readonly partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDecorationsService decorationService: IDecorationsService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService);

		this.viewState = options.viewletState;
		this.fileViewletState = options.fileViewletState;
		this.autoReveal = true;

		this.explorerRefreshDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_FILE_CHANGES_REFRESH_DELAY);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);
		this.disposables.push(this.resourceContext);
		this.folderContext = ExplorerFolderContext.bindTo(contextKeyService);
		this.readonlyContext = ExplorerResourceReadonlyContext.bindTo(contextKeyService);
		this.rootContext = ExplorerRootContext.bindTo(contextKeyService);

		this.fileEventsFilter = instantiationService.createInstance(
			ResourceGlobMatcher,
			(root: URI) => this.getFileEventsExcludes(root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG)
		);

		this.decorationProvider = new ExplorerDecorationsProvider(this.model, contextService);
		decorationService.registerDecorationsProvider(this.decorationProvider);
		this.disposables.push(this.decorationProvider);
		this.disposables.push(this.resourceContext);
	}

	private getFileEventsExcludes(root?: URI): glob.IExpression {
		const scope = root ? { resource: root } : undefined;
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
		this.disposables.push(this.labelService.onDidRegisterFormatter(setHeader));
		setHeader();
	}

	public get name(): string {
		return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
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

	public render(): void {

		super.render();

		// Update configuration
		const configuration = this.configurationService.getValue<IFilesConfiguration>();
		this.onConfigurationUpdated(configuration);

		// Load and Fill Viewer
		let targetsToExpand: URI[] = [];
		if (this.viewState[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES]) {
			targetsToExpand = this.viewState[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES].map((e: string) => URI.parse(e));
		}
		this.doRefresh(targetsToExpand).then(() => {

			// When the explorer viewer is loaded, listen to changes to the editor input
			this.disposables.push(this.editorService.onDidActiveEditorChange(() => this.revealActiveFile()));

			// Also handle configuration updates
			this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>(), e)));

			this.revealActiveFile();
		});
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = DOM.append(container, DOM.$('.explorer-folders-view'));
		this.tree = this.createViewer(this.treeContainer);

		if (this.toolbar) {
			this.toolbar.setActions(this.getActions(), this.getSecondaryActions())();
		}

		this.disposables.push(this.contextService.onDidChangeWorkspaceFolders(e => this.refreshFromEvent(e.added)));
		this.disposables.push(this.contextService.onDidChangeWorkbenchState(e => this.refreshFromEvent()));
		this.disposables.push(this.fileService.onDidChangeFileSystemProviderRegistrations(() => this.refreshFromEvent()));
		this.disposables.push(this.labelService.onDidRegisterFormatter(() => {
			this._onDidChangeTitleArea.fire();
			this.refreshFromEvent();
		}));
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
			this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = activeFile.toString();

			// Select file if input is inside workspace
			if (this.isBodyVisible() && !this.isDisposed && this.contextService.isInsideWorkspace(activeFile)) {
				const selection = this.hasSingleSelection(activeFile);
				if (!selection) {
					this.select(activeFile);
				}

				clearSelection = false;
			}
		}

		// Handle closed or untitled file (convince explorer to not reopen any file when getting visible)
		const activeInput = this.editorService.activeEditor;
		if (!activeInput || toResource(activeInput, { supportSideBySide: true, filter: Schemas.untitled })) {
			this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = undefined;
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
			this.doRefresh();
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
					this.reveal(selection[0], 0.5);
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

	public setVisible(visible: boolean): void {
		super.setVisible(visible);

		// Show
		if (visible) {

			// If a refresh was requested and we are now visible, run it
			let refreshPromise: Promise<void> = Promise.resolve(null);
			if (this.shouldRefresh) {
				refreshPromise = this.doRefresh();
				this.shouldRefresh = false; // Reset flag
			}

			if (!this.autoReveal) {
				return; // do not react to setVisible call if autoReveal === false
			}

			// Always select the current navigated file in explorer if input is file editor input
			// unless autoReveal is set to false
			const activeFile = this.getActiveFile();
			if (activeFile) {
				refreshPromise.then(() => {
					this.select(activeFile);
				});
				return;
			}

			// Return now if the workbench has not yet been restored - in this case the workbench takes care of restoring last used editors
			if (!this.partService.isRestored()) {
				return;
			}

			// Otherwise restore last used file: By lastActiveFileResource
			let lastActiveFileResource: URI;
			if (this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]) {
				lastActiveFileResource = URI.parse(this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]);
			}

			if (lastActiveFileResource && this.isCreated && this.model.findClosest(lastActiveFileResource)) {
				this.editorService.openEditor({ resource: lastActiveFileResource, options: { revealIfVisible: true } });
				return;
			}

			// Otherwise restore last used file: By Explorer selection
			refreshPromise.then(() => {
				this.openFocusedElement();
			});
		}
	}

	private openFocusedElement(preserveFocus?: boolean): void {
		const stat: ExplorerItem = this.explorerViewer.getFocus();
		if (stat && !stat.isDirectory) {
			this.editorService.openEditor({ resource: stat.resource, options: { preserveFocus, revealIfVisible: true } });
		}
	}

	private getActiveFile(): URI {
		const input = this.editorService.activeEditor;

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

	private createViewer(container: HTMLElement): WorkbenchTree {
		const dataSource = this.instantiationService.createInstance(FileDataSource);
		this.explorerLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility } as IResourceLabelsContainer);
		this.disposables.push(this.explorerLabels);
		const renderer = this.instantiationService.createInstance(FileRenderer, this.fileViewletState, this.explorerLabels);
		const controller = this.instantiationService.createInstance(FileController);
		this.disposables.push(controller);
		const sorter = this.instantiationService.createInstance(FileSorter);
		this.disposables.push(sorter);
		this.filter = this.instantiationService.createInstance(FileFilter);
		this.disposables.push(this.filter);
		const dnd = this.instantiationService.createInstance(FileDragAndDrop);
		const accessibilityProvider = this.instantiationService.createInstance(FileAccessibilityProvider);

		this.explorerViewer = this.instantiationService.createInstance(FileIconThemableWorkbenchTree, container, {
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
			this.readonlyContext.set(e.focus && e.focus.isReadonly);
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
		const childNodes = ([] as HTMLElement[]).slice.call(parentNode.querySelectorAll('.explorer-item .label-name')); // select all file labels

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	private onFileOperation(e: FileOperationEvent): void {
		if (!this.isCreated) {
			return; // ignore if not yet created
		}

		// Add
		if (e.operation === FileOperation.CREATE || e.operation === FileOperation.COPY) {
			const addedElement = e.target;
			const parentResource = resources.dirname(addedElement.resource);
			const parents = this.model.findAll(parentResource);

			if (parents.length) {

				// Add the new file to its parent (Model)
				parents.forEach(p => {
					// We have to check if the parent is resolved #29177
					const thenable: Promise<IFileStat> = p.isDirectoryResolved ? Promise.resolve(null) : this.fileService.resolveFile(p.resource);
					thenable.then(stat => {
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
						});
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
					this.explorerViewer.refresh(modelElement.parent).then(() => {

						// Select in Viewer if set
						if (restoreFocus) {
							this.explorerViewer.setFocus(modelElement);
						}
						//Expand the element again
						if (isExpanded) {
							this.explorerViewer.expand(modelElement);
						}
					});
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
							this.explorerViewer.refresh(oldParent).then(callback);
						}, () => {
							// Update new parent
							this.explorerViewer.refresh(newParents[index], true).then(() => this.explorerViewer.expand(newParents[index]));
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
					this.explorerViewer.refresh(parent).then(() => {

						// Ensure viewer has keyboard focus if event originates from viewer
						if (restoreFocus) {
							this.explorerViewer.domFocus();
						}
					});
				}
			});
		}
	}

	private onFileChanges(e: FileChangesEvent): void {

		// Ensure memento state does not capture a deleted file (we run this from a timeout because
		// delete events can result in UI activity that will fill the memento again when multiple
		// editors are closing)
		setTimeout(() => {
			const lastActiveResource: string = this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE];
			if (lastActiveResource && e.contains(URI.parse(lastActiveResource), FileChangeType.DELETED)) {
				this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE] = null;
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
		if (!this.isCreated) {
			return false;
		}

		// Filter to the ones we care
		e = this.filterToViewRelevantEvents(e);

		// Handle added files/folders
		const added = e.getAdded();
		if (added.length) {

			// Check added: Refresh if added file/folder is not part of resolved root and parent is part of it
			const ignoredPaths: { [resource: string]: boolean } = <{ [resource: string]: boolean }>{};
			for (const change of added) {
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

		// Handle deleted files/folders
		const deleted = e.getDeleted();
		if (deleted.length) {

			// Check deleted: Refresh if deleted file/folder part of resolved root
			for (const del of deleted) {
				if (this.model.findClosest(del.resource)) {
					return true;
				}
			}
		}

		// Handle updated files/folders if we sort by modified
		if (this.sortOrder === SortOrderConfiguration.MODIFIED) {
			const updated = e.getUpdated();

			// Check updated: Refresh if updated file/folder part of resolved root
			for (const upd of updated) {
				if (this.model.findClosest(upd.resource)) {
					return true;
				}
			}
		}

		return false;
	}

	private filterToViewRelevantEvents(e: FileChangesEvent): FileChangesEvent {
		return new FileChangesEvent(e.changes.filter(change => {
			if (change.type === FileChangeType.UPDATED && this.sortOrder !== SortOrderConfiguration.MODIFIED) {
				return false; // we only are about updated if we sort by modified time
			}

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
		if (this.isBodyVisible() && !this.isDisposed) {
			this.explorerRefreshDelayer.trigger(() => {
				if (!this.explorerViewer.getHighlight()) {
					return this.doRefresh(newRoots.map(r => r.uri)).then(() => {
						if (newRoots.length === 1) {
							return this.reveal(this.model.findClosest(newRoots[0].uri), 0.5);
						}

						return undefined;
					});
				}

				return Promise.resolve(null);
			});
		} else {
			this.shouldRefresh = true;
		}
	}

	/**
	 * Refresh the contents of the explorer to get up to date data from the disk about the file structure.
	 */
	public refresh(): Promise<void> {
		if (!this.explorerViewer || this.explorerViewer.getHighlight()) {
			return Promise.resolve(undefined);
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

			return Promise.resolve(undefined);
		});
	}

	private doRefresh(targetsToExpand: URI[] = []): Promise<any> {
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

		const promise = this.resolveRoots(targetsToResolve, targetsToExpand).then(result => {
			this.decorationProvider.changed(targetsToResolve.map(t => t.root.resource));
			return result;
		});
		this.progressService.showWhile(promise, this.partService.isRestored() ? 800 : 1200 /* less ugly initial startup */);

		return promise;
	}

	private resolveRoots(targetsToResolve: { root: ExplorerItem, resource: URI, options: { resolveTo: any[] } }[], targetsToExpand: URI[]): Promise<any> {

		// Display roots only when multi folder workspace
		let input = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.model.roots[0] : this.model;
		if (input !== this.explorerViewer.getInput()) {
			perf.mark('willResolveExplorer');
		}

		const errorRoot = (resource: URI, root: ExplorerItem) => {
			if (input === this.model.roots[0]) {
				input = this.model;
			}

			return ExplorerItem.create({
				resource: resource,
				name: paths.basename(resource.fsPath),
				mtime: 0,
				etag: undefined,
				isDirectory: true
			}, root, undefined, true);
		};

		const setInputAndExpand = (input: ExplorerItem | Model, statsToExpand: ExplorerItem[]) => {
			// Make sure to expand all folders that where expanded in the previous session
			// Special case: we are switching to multi workspace view, thus expand all the roots (they might just be added)
			if (input === this.model && statsToExpand.every(fs => fs && !fs.isRoot)) {
				statsToExpand = this.model.roots.concat(statsToExpand);
			}

			return this.explorerViewer.setInput(input).then(() => this.explorerViewer.expandAll(statsToExpand))
				.then(() => perf.mark('didResolveExplorer'));
		};

		if (targetsToResolve.every(t => t.root.resource.scheme === 'file')) {
			// All the roots are local, resolve them in parallel
			return this.fileService.resolveFiles(targetsToResolve).then(results => {
				// Convert to model
				const modelStats = results.map((result, index) => {
					if (result.success && result.stat.isDirectory) {
						return ExplorerItem.create(result.stat, targetsToResolve[index].root, targetsToResolve[index].options.resolveTo);
					}

					return errorRoot(targetsToResolve[index].resource, targetsToResolve[index].root);
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
		let delayerPromise: Promise<any>;
		return Promise.all(targetsToResolve.map((target, index) => this.fileService.resolveFile(target.resource, target.options)
			.then(result => result.isDirectory ? ExplorerItem.create(result, target.root, target.options.resolveTo) : errorRoot(target.resource, target.root), () => errorRoot(target.resource, target.root))
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
	public select(resource: URI, reveal: boolean = this.autoReveal): Promise<void> {

		// Require valid path
		if (!resource) {
			return Promise.resolve(undefined);
		}

		// If path already selected, just reveal and return
		const selection = this.hasSingleSelection(resource);
		if (selection) {
			return reveal ? this.reveal(selection, 0.5) : Promise.resolve(undefined);
		}

		// First try to get the stat object from the input to avoid a roundtrip
		if (!this.isCreated) {
			return Promise.resolve(undefined);
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

	private doSelect(fileStat: ExplorerItem, reveal: boolean): Promise<void> {
		if (!fileStat) {
			return Promise.resolve(undefined);
		}

		// Special case: we are asked to reveal and select an element that is not visible
		// In this case we take the parent element so that we are at least close to it.
		if (!this.filter.isVisible(this.tree, fileStat)) {
			fileStat = fileStat.parent;
			if (!fileStat) {
				return Promise.resolve(undefined);
			}
		}

		// Reveal depending on flag
		let revealPromise: Promise<void>;
		if (reveal) {
			revealPromise = this.reveal(fileStat, 0.5);
		} else {
			revealPromise = Promise.resolve(undefined);
		}

		return revealPromise.then(() => {
			if (!fileStat.isDirectory) {
				this.explorerViewer.setSelection([fileStat]); // Since folders can not be opened, only select files
			}

			this.explorerViewer.setFocus(fileStat);
		});
	}

	private reveal(element: any, relativeTop?: number): Promise<void> {
		if (!this.tree) {
			return Promise.resolve(undefined); // return early if viewlet has not yet been created
		}
		return this.tree.reveal(element, relativeTop);
	}

	saveState(): void {

		// Keep list of expanded folders to restore on next load
		if (this.isCreated) {
			const expanded = this.explorerViewer.getExpandedElements()
				.filter(e => e instanceof ExplorerItem)
				.map((e: ExplorerItem) => e.resource.toString());

			if (expanded.length) {
				this.viewState[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES] = expanded;
			} else {
				delete this.viewState[ExplorerView.MEMENTO_EXPANDED_FOLDER_RESOURCES];
			}
		}

		// Clean up last focused if not set
		if (!this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE]) {
			delete this.viewState[ExplorerView.MEMENTO_LAST_ACTIVE_FILE_RESOURCE];
		}

		super.saveState();
	}

	dispose(): void {
		this.isDisposed = true;
		if (this.dragHandler) {
			this.dragHandler.dispose();
		}
		super.dispose();
	}
}
