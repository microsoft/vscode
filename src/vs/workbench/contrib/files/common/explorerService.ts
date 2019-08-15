/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExplorerService, IEditableData, IFilesConfiguration, SortOrder, SortOrderConfiguration } from 'vs/workbench/contrib/files/common/files';
import { ExplorerItem, ExplorerModel } from 'vs/workbench/contrib/files/common/explorerModel';
import { URI } from 'vs/base/common/uri';
import { FileOperationEvent, FileOperation, IFileStat, IFileService, FileChangesEvent, FILES_EXCLUDE_CONFIG, FileChangeType, IResolveFileOptions } from 'vs/platform/files/common/files';
import { dirname } from 'vs/base/common/resources';
import { memoize } from 'vs/base/common/decorators';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IExpression } from 'vs/base/common/glob';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

function getFileEventsExcludes(configurationService: IConfigurationService, root?: URI): IExpression {
	const scope = root ? { resource: root } : undefined;
	const configuration = scope ? configurationService.getValue<IFilesConfiguration>(scope) : configurationService.getValue<IFilesConfiguration>();

	return (configuration && configuration.files && configuration.files.exclude) || Object.create(null);
}

export class ExplorerService implements IExplorerService {
	_serviceBrand: any;

	private static readonly EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first

	private _onDidChangeRoots = new Emitter<void>();
	private _onDidChangeItem = new Emitter<{ item?: ExplorerItem, recursive: boolean }>();
	private _onDidChangeEditable = new Emitter<ExplorerItem>();
	private _onDidSelectResource = new Emitter<{ resource?: URI, reveal?: boolean }>();
	private _onDidCopyItems = new Emitter<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }>();
	private readonly disposables = new DisposableStore();
	private editable: { stat: ExplorerItem, data: IEditableData } | undefined;
	private _sortOrder: SortOrder;
	private cutItems: ExplorerItem[] | undefined;
	private fileSystemProviderSchemes = new Set<string>();

	constructor(
		@IFileService private fileService: IFileService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IClipboardService private clipboardService: IClipboardService,
		@IEditorService private editorService: IEditorService
	) {
		this._sortOrder = this.configurationService.getValue('explorer.sortOrder');
	}

	get roots(): ExplorerItem[] {
		return this.model.roots;
	}

	get onDidChangeRoots(): Event<void> {
		return this._onDidChangeRoots.event;
	}

	get onDidChangeItem(): Event<{ item?: ExplorerItem, recursive: boolean }> {
		return this._onDidChangeItem.event;
	}

	get onDidChangeEditable(): Event<ExplorerItem> {
		return this._onDidChangeEditable.event;
	}

	get onDidSelectResource(): Event<{ resource?: URI, reveal?: boolean }> {
		return this._onDidSelectResource.event;
	}

	get onDidCopyItems(): Event<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }> {
		return this._onDidCopyItems.event;
	}

	get sortOrder(): SortOrder {
		return this._sortOrder;
	}

	// Memoized locals
	@memoize private get fileEventsFilter(): ResourceGlobMatcher {
		const fileEventsFilter = this.instantiationService.createInstance(
			ResourceGlobMatcher,
			(root?: URI) => getFileEventsExcludes(this.configurationService, root),
			(event: IConfigurationChangeEvent) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG)
		);
		this.disposables.add(fileEventsFilter);

		return fileEventsFilter;
	}

	@memoize get model(): ExplorerModel {
		const model = new ExplorerModel(this.contextService);
		this.disposables.add(model);
		this.disposables.add(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.disposables.add(this.fileService.onFileChanges(e => this.onFileChanges(e)));
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>())));
		this.disposables.add(this.fileService.onDidChangeFileSystemProviderRegistrations(e => {
			if (e.added && this.fileSystemProviderSchemes.has(e.scheme)) {
				// A file system provider got re-registered, we should update all file stats since they might change (got read-only)
				this.model.roots.forEach(r => r.forgetChildren());
				this._onDidChangeItem.fire({ recursive: true });
			} else {
				this.fileSystemProviderSchemes.add(e.scheme);
			}
		}));
		this.disposables.add(model.onDidChangeRoots(() => this._onDidChangeRoots.fire()));

		return model;
	}

	// IExplorerService methods

	findClosest(resource: URI): ExplorerItem | null {
		return this.model.findClosest(resource);
	}

	setEditable(stat: ExplorerItem, data: IEditableData | null): void {
		if (!data) {
			this.editable = undefined;
		} else {
			this.editable = { stat, data };
		}
		this._onDidChangeEditable.fire(stat);
	}

	setToCopy(items: ExplorerItem[], cut: boolean): void {
		const previouslyCutItems = this.cutItems;
		this.cutItems = cut ? items : undefined;
		this.clipboardService.writeResources(items.map(s => s.resource));

		this._onDidCopyItems.fire({ items, cut, previouslyCutItems });
	}

	isCut(item: ExplorerItem): boolean {
		return !!this.cutItems && this.cutItems.indexOf(item) >= 0;
	}

	getEditableData(stat: ExplorerItem): IEditableData | undefined {
		return this.editable && this.editable.stat === stat ? this.editable.data : undefined;
	}

	isEditable(stat: ExplorerItem | undefined): boolean {
		return !!this.editable && (this.editable.stat === stat || !stat);
	}

	async select(resource: URI, reveal?: boolean): Promise<void> {
		const fileStat = this.findClosest(resource);
		if (fileStat) {
			this._onDidSelectResource.fire({ resource: fileStat.resource, reveal });
			return Promise.resolve(undefined);
		}

		// Stat needs to be resolved first and then revealed
		const options: IResolveFileOptions = { resolveTo: [resource], resolveMetadata: this.sortOrder === 'modified' };
		const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
		if (workspaceFolder === null) {
			return Promise.resolve(undefined);
		}
		const rootUri = workspaceFolder.uri;

		const root = this.roots.filter(r => r.resource.toString() === rootUri.toString()).pop()!;

		try {
			const stat = await this.fileService.resolve(rootUri, options);

			// Convert to model
			const modelStat = ExplorerItem.create(stat, undefined, options.resolveTo);
			// Update Input with disk Stat
			ExplorerItem.mergeLocalWithDisk(modelStat, root);
			const item = root.find(resource);
			this._onDidChangeItem.fire({ item: root, recursive: true });

			// Select and Reveal
			this._onDidSelectResource.fire({ resource: item ? item.resource : undefined, reveal });
		} catch (error) {
			root.isError = true;
			this._onDidChangeItem.fire({ item: root, recursive: false });
		}
	}

	refresh(): void {
		this.model.roots.forEach(r => r.forgetChildren());
		this._onDidChangeItem.fire({ recursive: true });
		const resource = this.editorService.activeEditor ? this.editorService.activeEditor.getResource() : undefined;
		const autoReveal = this.configurationService.getValue<IFilesConfiguration>().explorer.autoReveal;

		if (resource && autoReveal) {
			// We did a top level refresh, reveal the active file #67118
			this.select(resource, true);
		}
	}

	// File events

	private onFileOperation(e: FileOperationEvent): void {
		// Add
		if (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY)) {
			const addedElement = e.target;
			const parentResource = dirname(addedElement.resource)!;
			const parents = this.model.findAll(parentResource);

			if (parents.length) {

				// Add the new file to its parent (Model)
				parents.forEach(p => {
					// We have to check if the parent is resolved #29177
					const resolveMetadata = this.sortOrder === `modified`;
					const thenable: Promise<IFileStat | undefined> = p.isDirectoryResolved ? Promise.resolve(undefined) : this.fileService.resolve(p.resource, { resolveMetadata });
					thenable.then(stat => {
						if (stat) {
							const modelStat = ExplorerItem.create(stat, p.parent);
							ExplorerItem.mergeLocalWithDisk(modelStat, p);
						}

						const childElement = ExplorerItem.create(addedElement, p.parent);
						// Make sure to remove any previous version of the file if any
						p.removeChild(childElement);
						p.addChild(childElement);
						// Refresh the Parent (View)
						this._onDidChangeItem.fire({ item: p, recursive: false });
					});
				});
			}
		}

		// Move (including Rename)
		else if (e.isOperation(FileOperation.MOVE)) {
			const oldResource = e.resource;
			const newElement = e.target;
			const oldParentResource = dirname(oldResource);
			const newParentResource = dirname(newElement.resource);

			// Handle Rename
			if (oldParentResource.toString() === newParentResource.toString()) {
				const modelElements = this.model.findAll(oldResource);
				modelElements.forEach(modelElement => {
					// Rename File (Model)
					modelElement.rename(newElement);
					this._onDidChangeItem.fire({ item: modelElement.parent, recursive: false });
				});
			}

			// Handle Move
			else {
				const newParents = this.model.findAll(newParentResource);
				const modelElements = this.model.findAll(oldResource);

				if (newParents.length && modelElements.length) {
					// Move in Model
					modelElements.forEach((modelElement, index) => {
						const oldParent = modelElement.parent;
						modelElement.move(newParents[index]);
						this._onDidChangeItem.fire({ item: oldParent, recursive: false });
						this._onDidChangeItem.fire({ item: newParents[index], recursive: false });
					});
				}
			}
		}

		// Delete
		else if (e.isOperation(FileOperation.DELETE)) {
			const modelElements = this.model.findAll(e.resource);
			modelElements.forEach(element => {
				if (element.parent) {
					const parent = element.parent;
					// Remove Element from Parent (Model)
					parent.removeChild(element);
					// Refresh Parent (View)
					this._onDidChangeItem.fire({ item: parent, recursive: false });
				}
			});
		}
	}

	private onFileChanges(e: FileChangesEvent): void {
		// Check if an explorer refresh is necessary (delayed to give internal events a chance to react first)
		// Note: there is no guarantee when the internal events are fired vs real ones. Code has to deal with the fact that one might
		// be fired first over the other or not at all.
		setTimeout(() => {
			// Filter to the ones we care
			const shouldRefresh = () => {
				e = this.filterToViewRelevantEvents(e);
				// Handle added files/folders
				const added = e.getAdded();
				if (added.length) {

					// Check added: Refresh if added file/folder is not part of resolved root and parent is part of it
					const ignoredPaths: Set<string> = new Set();
					for (let i = 0; i < added.length; i++) {
						const change = added[i];

						// Find parent
						const parent = dirname(change.resource);

						// Continue if parent was already determined as to be ignored
						if (ignoredPaths.has(parent.toString())) {
							continue;
						}

						// Compute if parent is visible and added file not yet part of it
						const parentStat = this.model.findClosest(parent);
						if (parentStat && parentStat.isDirectoryResolved && !this.model.findClosest(change.resource)) {
							return true;
						}

						// Keep track of path that can be ignored for faster lookup
						if (!parentStat || !parentStat.isDirectoryResolved) {
							ignoredPaths.add(parent.toString());
						}
					}
				}

				// Handle deleted files/folders
				const deleted = e.getDeleted();
				if (deleted.length) {

					// Check deleted: Refresh if deleted file/folder part of resolved root
					for (let j = 0; j < deleted.length; j++) {
						const del = deleted[j];
						const item = this.model.findClosest(del.resource);
						if (item && item.parent) {
							return true;
						}
					}
				}

				// Handle updated files/folders if we sort by modified
				if (this._sortOrder === SortOrderConfiguration.MODIFIED) {
					const updated = e.getUpdated();

					// Check updated: Refresh if updated file/folder part of resolved root
					for (let j = 0; j < updated.length; j++) {
						const upd = updated[j];
						const item = this.model.findClosest(upd.resource);

						if (item && item.parent) {
							return true;
						}
					}
				}

				return false;
			};

			if (shouldRefresh()) {
				this.roots.forEach(r => r.forgetChildren());
				this._onDidChangeItem.fire({ recursive: true });
			}
		}, ExplorerService.EXPLORER_FILE_CHANGES_REACT_DELAY);
	}

	private filterToViewRelevantEvents(e: FileChangesEvent): FileChangesEvent {
		return new FileChangesEvent(e.changes.filter(change => {
			if (change.type === FileChangeType.UPDATED && this._sortOrder !== SortOrderConfiguration.MODIFIED) {
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

	private onConfigurationUpdated(configuration: IFilesConfiguration, event?: IConfigurationChangeEvent): void {
		const configSortOrder = configuration && configuration.explorer && configuration.explorer.sortOrder || 'default';
		if (this._sortOrder !== configSortOrder) {
			const shouldRefresh = this._sortOrder !== undefined;
			this._sortOrder = configSortOrder;
			if (shouldRefresh) {
				this.refresh();
			}
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
