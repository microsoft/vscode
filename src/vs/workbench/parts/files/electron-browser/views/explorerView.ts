/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import * as perf from 'vs/base/common/performance';
import { ThrottledDelayer, sequence, ignoreErrors } from 'vs/base/common/async';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as glob from 'vs/base/common/glob';
import { Action, IAction } from 'vs/base/common/actions';
import { memoize } from 'vs/base/common/decorators';
import { IFilesConfiguration, ExplorerFolderContext, FilesExplorerFocusedContext, ExplorerFocusedContext, SortOrderConfiguration, SortOrder, IExplorerView, ExplorerRootContext, ExplorerResourceReadonlyContext, IExplorerService } from 'vs/workbench/parts/files/common/files';
import { FileOperation, FileOperationEvent, IResolveFileOptions, FileChangeType, FileChangesEvent, IFileService, FILES_EXCLUDE_CONFIG, IFileStat } from 'vs/platform/files/common/files';
import { RefreshViewExplorerAction, NewFolderAction, NewFileAction, FileCopiedContext } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { toResource } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import * as DOM from 'vs/base/browser/dom';
import { CollapseAction2 } from 'vs/workbench/browser/viewlet';
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
import { WorkbenchAsyncDataTree, IListService } from 'vs/platform/list/browser/listService';
import { DelayedDragHandler } from 'vs/base/browser/dnd';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ILabelService } from 'vs/platform/label/common/label';
import { ExplorerDelegate, ExplorerAccessibilityProvider, ExplorerDataSource, FilesRenderer, FilesFilter } from 'vs/workbench/parts/files/electron-browser/views/explorerViewer';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExplorerItem, NewStatPlaceholder } from 'vs/workbench/parts/files/common/explorerService';

function getFileEventsExcludes(configurationService: IConfigurationService, root?: URI): glob.IExpression {
	const scope = root ? { resource: root } : void 0;
	const configuration = configurationService.getValue<IFilesConfiguration>(scope);

	return (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
}

export class ExplorerView extends ViewletPanel implements IExplorerView {

	static readonly ID: string = 'workbench.explorer.fileView';
	private static readonly EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first
	private static readonly EXPLORER_FILE_CHANGES_REFRESH_DELAY = 100; // delay in ms to refresh the explorer from disk file changes

	private tree: WorkbenchAsyncDataTree<ExplorerItem>;
	private filter: FilesFilter;
	private isCreated: boolean;

	private explorerRefreshDelayer: ThrottledDelayer<void>;

	private resourceContext: ResourceContextKey;
	private folderContext: IContextKey<boolean>;
	private readonlyContext: IContextKey<boolean>;
	private rootContext: IContextKey<boolean>;

	private shouldRefresh: boolean;
	private sortOrder: SortOrder;
	private dragHandler: DelayedDragHandler;
	private decorationProvider: ExplorerDecorationsProvider;
	private autoReveal = false;
	private isDisposed = false;

	constructor(
		options: IViewletPanelOptions,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IProgressService private progressService: IProgressService,
		@IEditorService private editorService: IEditorService,
		@IFileService private fileService: IFileService,
		@IPartService private partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDecorationsService decorationService: IDecorationsService,
		@ILabelService private labelService: ILabelService,
		@IThemeService private themeService: IWorkbenchThemeService,
		@IListService private listService: IListService,
		@IMenuService private menuService: IMenuService,
		@IClipboardService private clipboardService: IClipboardService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IExplorerService private explorerService: IExplorerService
	) {
		super({ ...(options as IViewletPanelOptions), id: ExplorerView.ID, ariaHeaderLabel: nls.localize('explorerSection', "Files Explorer Section") }, keybindingService, contextMenuService, configurationService);

		this.explorerRefreshDelayer = new ThrottledDelayer<void>(ExplorerView.EXPLORER_FILE_CHANGES_REFRESH_DELAY);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);
		this.disposables.push(this.resourceContext);
		this.folderContext = ExplorerFolderContext.bindTo(contextKeyService);
		this.readonlyContext = ExplorerResourceReadonlyContext.bindTo(contextKeyService);
		this.rootContext = ExplorerRootContext.bindTo(contextKeyService);

		this.decorationProvider = new ExplorerDecorationsProvider(this.explorerService, contextService);
		decorationService.registerDecorationsProvider(this.decorationProvider);
		this.disposables.push(this.decorationProvider);
		this.disposables.push(this.resourceContext);
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

	protected layoutBody(size: number): void {
		this.tree.layout(size);
	}

	get name(): string {
		return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
	}

	get title(): string {
		return this.name;
	}

	set title(value: string) {
		// noop
	}

	// Memoized locals
	@memoize private get fileEventsFilter(): ResourceGlobMatcher {
		const fileEventsFilter = this.instantiationService.createInstance(
			ResourceGlobMatcher,
			(root: URI) => getFileEventsExcludes(this.configurationService, root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG)
		);
		this.disposables.push(fileEventsFilter);

		return fileEventsFilter;
	}

	@memoize private get contributedContextMenu(): IMenu {
		const contributedContextMenu = this.menuService.createMenu(MenuId.ExplorerContext, this.tree.contextKeyService);
		this.disposables.push(contributedContextMenu);
		return contributedContextMenu;
	}

	@memoize private get fileCopiedContextKey(): IContextKey<boolean> {
		return FileCopiedContext.bindTo(this.contextKeyService);
	}

	// Split view methods

	render(): void {
		super.render();

		// Update configuration
		const configuration = this.configurationService.getValue<IFilesConfiguration>();
		this.onConfigurationUpdated(configuration);

		// Load and Fill Viewer
		this.doRefresh().then(() => {

			// When the explorer viewer is loaded, listen to changes to the editor input
			this.disposables.push(this.editorService.onDidActiveEditorChange(() => this.revealActiveFile()));

			// Also handle configuration updates
			this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>(), e)));

			this.revealActiveFile();
		});
	}

	renderBody(container: HTMLElement): void {
		const treeContainer = DOM.append(container, DOM.$('.explorer-folders-view'));
		this.createTree(treeContainer);

		if (this.toolbar) {
			this.toolbar.setActions(this.getActions(), this.getSecondaryActions())();
		}

		this.disposables.push(this.contextService.onDidChangeWorkspaceFolders(e => this.refreshFromEvent(e.added)));
		this.disposables.push(this.contextService.onDidChangeWorkbenchState(() => this.refreshFromEvent()));
		this.disposables.push(this.fileService.onDidChangeFileSystemProviderRegistrations(() => this.refreshFromEvent()));
		this.disposables.push(this.labelService.onDidRegisterFormatter(() => {
			this._onDidChangeTitleArea.fire();
			this.refreshFromEvent();
		}));
	}

	getActions(): IAction[] {
		const actions: Action[] = [];

		actions.push(this.instantiationService.createInstance(NewFileAction, null));
		actions.push(this.instantiationService.createInstance(NewFolderAction, null));
		actions.push(this.instantiationService.createInstance(RefreshViewExplorerAction, this, 'explorer-action refresh-explorer'));
		actions.push(this.instantiationService.createInstance(CollapseAction2, this.tree, true, 'explorer-action collapse-explorer'));

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

			// Select file if input is inside workspace
			if (this.isVisible() && !this.isDisposed && this.contextService.isInsideWorkspace(activeFile)) {
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
			clearFocus = true;
		}

		// Otherwise clear
		if (clearSelection) {
			this.tree.setSelection([]);
		}

		if (clearFocus) {
			this.tree.setFocus([]);
		}
	}

	focus(): void {
		super.focus();

		let keepFocus = false;

		// Make sure the current selected element is revealed
		if (this.tree) {
			if (this.autoReveal) {
				const selection = this.tree.getSelection();
				if (selection.length > 0) {
					this.tree.reveal(selection[0], 0.5);
				}
			}

			// Pass Focus to Viewer
			this.tree.domFocus();
			keepFocus = true;
		}

		// Open the focused element in the editor if there is currently no file opened
		const activeFile = this.getActiveFile();
		if (!activeFile) {
			this.openFocusedElement(keepFocus);
		}
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);

		// Show
		if (visible) {
			DOM.show(this.tree.getHTMLElement());
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
			const focusedElements = this.tree.getFocus();
			if (focusedElements && focusedElements.length) {
				this.editorService.openEditor({ resource: focusedElements[0].resource, options: { revealIfVisible: true } });
				return;
			}

			// Otherwise restore last used file: By Explorer selection
			refreshPromise.then(() => {
				this.openFocusedElement();
			});
		} else {
			// make sure the tree goes out of the tabindex world by hiding it
			DOM.hide(this.tree.getHTMLElement());
		}
	}

	private openFocusedElement(preserveFocus?: boolean): void {
		const focusedElements = this.tree.getFocus();
		const stat = focusedElements && focusedElements.length ? focusedElements[0] : undefined;
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

	private createTree(container: HTMLElement): void {
		this.filter = this.instantiationService.createInstance(FilesFilter);
		this.disposables.push(this.filter);
		const filesRenderer = this.instantiationService.createInstance(FilesRenderer);
		this.disposables.push(filesRenderer);

		this.tree = new WorkbenchAsyncDataTree(container, new ExplorerDelegate(), [filesRenderer],
			this.instantiationService.createInstance(ExplorerDataSource), {
				accessibilityProvider: new ExplorerAccessibilityProvider(),
				ariaLabel: nls.localize('treeAriaLabel', "Files Explorer"),
				identityProvider: {
					getId: stat => stat.resource
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: stat => stat.name
				},
				filter: this.filter
			}, this.contextKeyService, this.listService, this.themeService, this.configurationService, this.keybindingService);

		this.disposables.push(this.tree);
		// Bind context keys
		FilesExplorerFocusedContext.bindTo(this.tree.contextKeyService);
		ExplorerFocusedContext.bindTo(this.tree.contextKeyService);

		// Update Viewer based on File Change Events
		this.disposables.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.disposables.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));

		// Update resource context based on focused element
		this.disposables.push(this.tree.onDidChangeFocus(e => {
			const stat = e.elements && e.elements.length ? e.elements[0] : undefined;
			const isSingleFolder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER;
			const resource = stat ? stat.resource : isSingleFolder ? this.contextService.getWorkspace().folders[0].uri : undefined;
			this.resourceContext.set(resource);
			this.folderContext.set((isSingleFolder && !stat) || stat && stat.isDirectory);
			this.readonlyContext.set(stat && stat.isReadonly);
			this.rootContext.set(!stat || (stat && stat.isRoot));
		}));

		// Open when selecting via keyboard
		this.disposables.push(this.tree.onDidChangeSelection(e => {
			const selection = e.elements;
			// Do not react if the user is expanding selection
			if (selection && selection.length === 1) {
				let isDoubleClick = false;
				let sideBySide = false;
				if (e.browserEvent instanceof MouseEvent) {
					isDoubleClick = e.browserEvent.detail === 2;
					sideBySide = this.tree.useAltAsMultipleSelectionModifier ? (e.browserEvent.ctrlKey || e.browserEvent.metaKey) : e.browserEvent.altKey;
				}

				if (!selection[0].isDirectory) {
					// Pass focus for keyboard events and for double click
					/* __GDPR__
					"workbenchActionExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}*/
					this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'explorer' });
					this.editorService.openEditor({ resource: selection[0].resource, options: { preserveFocus: !isDoubleClick, pinned: isDoubleClick } }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
				}
			}
		}));

		this.disposables.push(this.tree.onContextMenu(e => this.onContextMenu(e)));
	}

	getOptimalWidth(): number {
		const parentNode = this.tree.getHTMLElement();
		const childNodes = ([] as HTMLElement[]).slice.call(parentNode.querySelectorAll('.explorer-item .label-name')); // select all file labels

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	// React on events

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

	private onFileOperation(e: FileOperationEvent): void {
		if (!this.isCreated) {
			return; // ignore if not yet created
		}

		// Add
		if (e.operation === FileOperation.CREATE || e.operation === FileOperation.COPY) {
			const addedElement = e.target;
			const parentResource = resources.dirname(addedElement.resource);
			const parents = this.explorerService.findAll(parentResource);

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
						// Make sure to remove any previous version of the file if any
						p.removeChild(childElement);
						p.addChild(childElement);
						// Refresh the Parent (View)
						this.tree.refresh(p).then(() => {
							// Reveal and focus new element
							this.tree.reveal(childElement, 0.5);
							this.tree.setFocus([childElement]);
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
			const focusedElements = this.tree.getFocus();
			const focus = focusedElements && focusedElements.length ? focusedElements[0] : undefined;
			if (focus && focus.resource && focus.resource.toString() === oldResource.toString()) {
				restoreFocus = true;
			}

			let isExpanded = false;
			// Handle Rename
			if (oldParentResource && newParentResource && oldParentResource.toString() === newParentResource.toString()) {
				const modelElements = this.explorerService.findAll(oldResource);
				modelElements.forEach(modelElement => {
					//Check if element is expanded
					isExpanded = !this.tree.isCollapsed(modelElement);
					// Rename File (Model)
					modelElement.rename(newElement);

					// Update Parent (View)
					this.tree.refresh(modelElement.parent).then(() => {

						// Select in Viewer if set
						if (restoreFocus) {
							this.tree.setFocus([modelElement]);
						}
						//Expand the element again
						if (isExpanded) {
							this.tree.expand(modelElement);
						}
					});
				});
			}

			// Handle Move
			else if (oldParentResource && newParentResource) {
				const newParents = this.explorerService.findAll(newParentResource);
				const modelElements = this.explorerService.findAll(oldResource);

				if (newParents.length && modelElements.length) {

					// Move in Model
					modelElements.forEach((modelElement, index) => {
						const oldParent = modelElement.parent;
						modelElement.move(newParents[index], (callback: () => void) => {
							// Update old parent
							this.tree.refresh(oldParent).then(callback);
						}, () => {
							// Update new parent
							this.tree.refresh(newParents[index], true).then(() => this.tree.expand(newParents[index]));
						});
					});
				}
			}
		}

		// Delete
		else if (e.operation === FileOperation.DELETE) {
			const modelElements = this.explorerService.findAll(e.resource);
			modelElements.forEach(element => {
				if (element.parent) {
					const parent = element.parent;
					// Remove Element from Parent (Model)
					parent.removeChild(element);

					// Refresh Parent (View)
					const restoreFocus = document.activeElement === this.tree.getHTMLElement();
					this.tree.refresh(parent).then(() => {

						// Ensure viewer has keyboard focus if event originates from viewer
						if (restoreFocus) {
							this.tree.domFocus();
						}
					});
				}
			});
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
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
			for (let i = 0; i < added.length; i++) {
				const change = added[i];

				// Find parent
				const parent = resources.dirname(change.resource);

				// Continue if parent was already determined as to be ignored
				if (ignoredPaths[parent.toString()]) {
					continue;
				}

				// Compute if parent is visible and added file not yet part of it
				const parentStat = this.explorerService.findClosest(parent);
				if (parentStat && parentStat.isDirectoryResolved && !this.explorerService.findClosest(change.resource)) {
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
			for (let j = 0; j < deleted.length; j++) {
				const del = deleted[j];

				if (this.explorerService.findClosest(del.resource)) {
					return true;
				}
			}
		}

		// Handle updated files/folders if we sort by modified
		if (this.sortOrder === SortOrderConfiguration.MODIFIED) {
			const updated = e.getUpdated();

			// Check updated: Refresh if updated file/folder part of resolved root
			for (let j = 0; j < updated.length; j++) {
				const upd = updated[j];

				if (this.explorerService.findClosest(upd.resource)) {
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
		if (this.isVisible() && !this.isDisposed) {
			this.explorerRefreshDelayer.trigger(() => {
				return this.doRefresh().then(() => {
					if (newRoots.length === 1) {
						return this.tree.reveal(this.explorerService.findClosest(newRoots[0].uri), 0.5);
					}

					return undefined;
				});
			});
		} else {
			this.shouldRefresh = true;
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<ExplorerItem>): void {
		const stat = e.element;
		if (stat instanceof NewStatPlaceholder) {
			return;
		}

		// update dynamic contexts
		this.fileCopiedContextKey.set(this.clipboardService.hasResources());

		const selection = this.tree.getSelection();
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => {
				const actions: IAction[] = [];
				fillInContextMenuActions(this.contributedContextMenu, { arg: stat instanceof ExplorerItem ? stat.resource : {}, shouldForwardArgs: true }, actions, this.contextMenuService);
				return actions;
			},
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.tree.domFocus();
				}
			},
			getActionsContext: () => selection && selection.indexOf(stat) >= 0
				? selection.map((fs: ExplorerItem) => fs.resource)
				: stat instanceof ExplorerItem ? [stat.resource] : []
		});
	}

	// General methods

	/**
	 * Refresh the contents of the explorer to get up to date data from the disk about the file structure.
	 */
	refresh(): Promise<void> {
		if (!this.tree) {
			return Promise.resolve(void 0);
		}

		// Focus
		this.tree.domFocus();

		// Find resource to focus from active editor input if set
		let resourceToFocus: URI;
		if (this.autoReveal) {
			resourceToFocus = this.getActiveFile();
			if (!resourceToFocus) {
				const selection = this.tree.getSelection();
				if (selection && selection.length === 1) {
					resourceToFocus = selection[0].resource;
				}
			}
		}

		return this.doRefresh().then(() => {
			if (resourceToFocus) {
				return this.select(resourceToFocus, true);
			}

			return Promise.resolve(void 0);
		});
	}

	private doRefresh(): Promise<any> {
		const targetsToResolve = this.explorerService.roots.map(root => ({ root, resource: root.resource, options: { resolveTo: [] } }));

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
		}

		// Subsequent refresh: Receive targets through expanded folders in tree
		else {
			targetsToResolve.forEach(t => {
				this.getResolvedDirectories(t.root, t.options.resolveTo);
			});
		}

		const promise = this.resolveRoots(targetsToResolve).then(result => {
			this.isCreated = true;
			this.decorationProvider.changed(targetsToResolve.map(t => t.root.resource));
			return result;
		});
		this.progressService.showWhile(promise, this.partService.isRestored() ? 800 : 1200 /* less ugly initial startup */);

		return promise;
	}

	private resolveRoots(targetsToResolve: { root: ExplorerItem, resource: URI, options: { resolveTo: any[] } }[]): Promise<any> {

		if (!this.isCreated) {
			perf.mark('willResolveExplorer');
		}

		const errorRoot = (resource: URI, root: ExplorerItem) => {
			return ExplorerItem.create({
				resource: resource,
				name: paths.basename(resource.fsPath),
				mtime: 0,
				etag: undefined,
				isDirectory: true
			}, root, undefined, true);
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
					if (index < this.explorerService.roots.length) {
						ExplorerItem.mergeLocalWithDisk(modelStat, this.explorerService.roots[index]);
					}
				});

				return this.tree.refresh(null);
			});
		}

		// There is a remote root, resolve the roots sequantally
		return Promise.all(targetsToResolve.map((target, index) => this.fileService.resolveFile(target.resource, target.options)
			.then(result => result.isDirectory ? ExplorerItem.create(result, target.root, target.options.resolveTo) : errorRoot(target.resource, target.root), () => errorRoot(target.resource, target.root))
			.then(modelStat => {
				// Subsequent refresh: Merge stat into our local model and refresh tree
				if (index < this.explorerService.roots.length) {
					ExplorerItem.mergeLocalWithDisk(modelStat, this.explorerService.roots[index]);
				}

				return this.tree.refresh(null);
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
	select(resource: URI, reveal: boolean = this.autoReveal): void {

		// Require valid path
		if (!resource) {
			return;
		}

		// If path already selected, just reveal and return
		const selection = this.hasSingleSelection(resource);
		if (selection) {
			if (reveal) {
				this.tree.reveal(selection, 0.5);
			}

			return;
		}

		if (!this.isCreated) {
			return;
		}

		const fileStat = this.explorerService.findClosest(resource);
		if (fileStat) {
			this.doSelect(fileStat, reveal);
			return;
		}

		// Stat needs to be resolved first and then revealed
		const options: IResolveFileOptions = { resolveTo: [resource] };
		const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
		const rootUri = workspaceFolder ? workspaceFolder.uri : this.explorerService.roots[0].resource;
		this.fileService.resolveFile(rootUri, options).then(stat => {

			// Convert to model
			const root = this.explorerService.roots.filter(r => r.resource.toString() === rootUri.toString()).pop();
			const modelStat = ExplorerItem.create(stat, root, options.resolveTo);
			// Update Input with disk Stat
			ExplorerItem.mergeLocalWithDisk(modelStat, root);

			// Select and Reveal
			return this.tree.refresh(root).then(() => this.doSelect(root.find(resource), reveal));

		}, e => { this.notificationService.error(e); });
	}

	private hasSingleSelection(resource: URI): ExplorerItem {
		const currentSelection: ExplorerItem[] = this.tree.getSelection();
		return currentSelection.length === 1 && currentSelection[0].resource.toString() === resource.toString()
			? currentSelection[0]
			: undefined;
	}

	private doSelect(fileStat: ExplorerItem, reveal: boolean): Promise<void> {
		if (!fileStat) {
			return Promise.resolve(void 0);
		}

		// Expand all stats in the parent chain
		const toExpand: ExplorerItem[] = [];
		let parent = fileStat.parent;
		while (parent) {
			toExpand.push(parent);
			parent = parent.parent;
		}

		return sequence(toExpand.reverse().map(s => () => ignoreErrors(this.tree.expand(s)))).then(() => {
			if (reveal) {
				this.tree.reveal(fileStat, 0.5);
			}

			if (!fileStat.isDirectory) {
				this.tree.setSelection([fileStat]); // Since folders can not be opened, only select files
			}

			this.tree.setFocus([fileStat]);
		});
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	dispose(): void {
		this.isDisposed = true;
		if (this.dragHandler) {
			this.dragHandler.dispose();
		}
		super.dispose();
	}
}
