/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExplorerService, IEditableData, IFilesConfiguration, SortOrder, SortOrderConfiguration } from 'vs/workbench/parts/files/common/files';
import { ExplorerItem, ExplorerModel } from 'vs/workbench/parts/files/common/explorerModel';
import { URI } from 'vs/base/common/uri';
import { FileOperationEvent, FileOperation, IFileStat, IFileService, FileChangesEvent, FILES_EXCLUDE_CONFIG, FileChangeType, IResolveFileOptions } from 'vs/platform/files/common/files';
import { dirname } from 'vs/base/common/resources';
import { memoize } from 'vs/base/common/decorators';
import { ResourceGlobMatcher } from 'vs/workbench/electron-browser/resources';
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
	private _onDidChangeItem = new Emitter<ExplorerItem | undefined>();
	private _onDidChangeEditable = new Emitter<ExplorerItem>();
	private _onDidSelectItem = new Emitter<{ item?: ExplorerItem, reveal?: boolean }>();
	private _onDidCopyItems = new Emitter<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }>();
	private disposables: IDisposable[] = [];
	private editableStats = new Map<ExplorerItem, IEditableData>();
	private _sortOrder: SortOrder;
	private cutItems: ExplorerItem[] | undefined;

	constructor(
		@IFileService private fileService: IFileService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IClipboardService private clipboardService: IClipboardService,
		@IEditorService private editorService: IEditorService
	) { }

	get roots(): ExplorerItem[] {
		return this.model.roots;
	}

	get onDidChangeRoots(): Event<void> {
		return this._onDidChangeRoots.event;
	}

	get onDidChangeItem(): Event<ExplorerItem | undefined> {
		return this._onDidChangeItem.event;
	}

	get onDidChangeEditable(): Event<ExplorerItem> {
		return this._onDidChangeEditable.event;
	}

	get onDidSelectItem(): Event<{ item?: ExplorerItem, reveal?: boolean }> {
		return this._onDidSelectItem.event;
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
		this.disposables.push(fileEventsFilter);

		return fileEventsFilter;
	}

	@memoize get model(): ExplorerModel {
		const model = new ExplorerModel(this.contextService);
		this.disposables.push(model);
		this.disposables.push(this.fileService.onAfterOperation(e => this.onFileOperation(e)));
		this.disposables.push(this.fileService.onFileChanges(e => this.onFileChanges(e)));
		this.disposables.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>())));
		this.disposables.push(this.fileService.onDidChangeFileSystemProviderRegistrations(() => this._onDidChangeItem.fire(undefined)));
		this.disposables.push(model.onDidChangeRoots(() => this._onDidChangeRoots.fire()));

		return model;
	}

	// IExplorerService methods

	findClosest(resource: URI): ExplorerItem | null {
		return this.model.findClosest(resource);
	}

	setEditable(stat: ExplorerItem, data: IEditableData | null): void {
		if (!data) {
			this.editableStats.delete(stat);
		} else {
			this.editableStats.set(stat, data);
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
		return this.editableStats.get(stat);
	}

	isEditable(stat: ExplorerItem): boolean {
		return this.editableStats.has(stat);
	}

	select(resource: URI, reveal?: boolean): Promise<void> {
		const fileStat = this.findClosest(resource);
		if (fileStat) {
			this._onDidSelectItem.fire({ item: fileStat, reveal });
			return Promise.resolve(undefined);
		}

		// Stat needs to be resolved first and then revealed
		const options: IResolveFileOptions = { resolveTo: [resource] };
		const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
		const rootUri = workspaceFolder ? workspaceFolder.uri : this.roots[0].resource;
		const root = this.roots.filter(r => r.resource.toString() === rootUri.toString()).pop()!;
		return this.fileService.resolveFile(rootUri, options).then(stat => {

			// Convert to model
			const modelStat = ExplorerItem.create(stat, undefined, options.resolveTo);
			// Update Input with disk Stat
			ExplorerItem.mergeLocalWithDisk(modelStat, root);
			const item = root.find(resource);
			this._onDidChangeItem.fire(item ? item.parent : undefined);

			// Select and Reveal
			this._onDidSelectItem.fire({ item: item || undefined, reveal });
		}, () => {
			root.isError = true;
			this._onDidChangeItem.fire(root);
		});
	}

	refresh(): void {
		this.model.roots.forEach(r => r.forgetChildren());
		this._onDidChangeItem.fire(undefined);
		const resource = this.editorService.activeEditor ? this.editorService.activeEditor.getResource() : undefined;
		if (resource) {
			// We did a top level refresh, reveal the active file #67118
			this.select(resource, true);
		}
	}

	// File events

	private onFileOperation(e: FileOperationEvent): void {
		// Add
		if (e.operation === FileOperation.CREATE || e.operation === FileOperation.COPY) {
			const addedElement = e.target!;
			const parentResource = dirname(addedElement.resource)!;
			const parents = this.model.findAll(parentResource);

			if (parents.length) {

				// Add the new file to its parent (Model)
				parents.forEach(p => {
					// We have to check if the parent is resolved #29177
					const thenable: Promise<IFileStat | undefined> = p.isDirectoryResolved ? Promise.resolve(undefined) : this.fileService.resolveFile(p.resource);
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
						this._onDidChangeItem.fire(p);
					});
				});
			}
		}

		// Move (including Rename)
		else if (e.operation === FileOperation.MOVE) {
			const oldResource = e.resource;
			const newElement = e.target!;
			const oldParentResource = dirname(oldResource);
			const newParentResource = dirname(newElement.resource);

			// Handle Rename
			if (oldParentResource && newParentResource && oldParentResource.toString() === newParentResource.toString()) {
				const modelElements = this.model.findAll(oldResource);
				modelElements.forEach(modelElement => {
					// Rename File (Model)
					modelElement.rename(newElement);
					this._onDidChangeItem.fire(modelElement.parent);
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
						modelElement.move(newParents[index]);
						this._onDidChangeItem.fire(oldParent);
						this._onDidChangeItem.fire(newParents[index]);
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
					this._onDidChangeItem.fire(parent);
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
			e = this.filterToViewRelevantEvents(e);
			const explorerItemChanged = (item: ExplorerItem) => {
				item.forgetChildren();
				this._onDidChangeItem.fire(item);
			};

			// Handle added files/folders
			const added = e.getAdded();
			if (added.length) {

				// Check added: Refresh if added file/folder is not part of resolved root and parent is part of it
				const ignoredPaths: { [resource: string]: boolean } = <{ [resource: string]: boolean }>{};
				for (let i = 0; i < added.length; i++) {
					const change = added[i];

					// Find parent
					const parent = dirname(change.resource);
					if (!parent) {
						continue;
					}

					// Continue if parent was already determined as to be ignored
					if (ignoredPaths[parent.toString()]) {
						continue;
					}

					// Compute if parent is visible and added file not yet part of it
					const parentStat = this.model.findClosest(parent);
					if (parentStat && parentStat.isDirectoryResolved && !this.model.findClosest(change.resource)) {
						explorerItemChanged(parentStat);
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
					const item = this.model.findClosest(del.resource);
					if (item && item.parent) {
						explorerItemChanged(item.parent);
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
						explorerItemChanged(item.parent);
					}
				}
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
			const shouldFire = this._sortOrder !== undefined;
			this._sortOrder = configSortOrder;
			if (shouldFire) {
				this._onDidChangeRoots.fire();
			}
		}
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
