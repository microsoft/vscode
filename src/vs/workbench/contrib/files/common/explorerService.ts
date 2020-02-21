/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExplorerService, IFilesConfiguration, SortOrder, IContextProvider } from 'vs/workbench/contrib/files/common/files';
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
import { IEditableData } from 'vs/workbench/common/views';

function getFileEventsExcludes(configurationService: IConfigurationService, root?: URI): IExpression {
	const scope = root ? { resource: root } : undefined;
	const configuration = scope ? configurationService.getValue<IFilesConfiguration>(scope) : configurationService.getValue<IFilesConfiguration>();

	return configuration?.files?.exclude || Object.create(null);
}

export class ExplorerService implements IExplorerService {
	_serviceBrand: undefined;

	private static readonly EXPLORER_FILE_CHANGES_REACT_DELAY = 500; // delay in ms to react to file changes to give our internal events a chance to react first

	private readonly _onDidChangeRoots = new Emitter<void>();
	private readonly _onDidChangeItem = new Emitter<{ item?: ExplorerItem, recursive: boolean }>();
	private readonly _onDidChangeEditable = new Emitter<ExplorerItem>();
	private readonly _onDidSelectResource = new Emitter<{ resource?: URI, reveal?: boolean }>();
	private readonly _onDidCopyItems = new Emitter<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }>();
	private readonly disposables = new DisposableStore();
	private editable: { stat: ExplorerItem, data: IEditableData } | undefined;
	private _sortOrder: SortOrder;
	private cutItems: ExplorerItem[] | undefined;
	private contextProvider: IContextProvider | undefined;
	private model: ExplorerModel;

	constructor(
		@IFileService private fileService: IFileService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IClipboardService private clipboardService: IClipboardService,
		@IEditorService private editorService: IEditorService,
	) {
		this._sortOrder = this.configurationService.getValue('explorer.sortOrder');

		this.model = new ExplorerModel(this.contextService, this.fileService);
		this.disposables.add(this.model);
		this.disposables.add(this.fileService.onDidRunOperation(e => this.onDidRunOperation(e)));
		this.disposables.add(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IFilesConfiguration>())));
		this.disposables.add(Event.any<{ scheme: string }>(this.fileService.onDidChangeFileSystemProviderRegistrations, this.fileService.onDidChangeFileSystemProviderCapabilities)(e => {
			let affected = false;
			this.model.roots.forEach(r => {
				if (r.resource.scheme === e.scheme) {
					affected = true;
					r.forgetChildren();
				}
			});
			if (affected) {
				this._onDidChangeItem.fire({ recursive: true });
			}
		}));
		this.disposables.add(this.model.onDidChangeRoots(() => this._onDidChangeRoots.fire()));
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

	registerContextProvider(contextProvider: IContextProvider): void {
		this.contextProvider = contextProvider;
	}

	getContext(respectMultiSelection: boolean): ExplorerItem[] {
		if (!this.contextProvider) {
			return [];
		}

		return this.contextProvider.getContext(respectMultiSelection);
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

	getEditable(): { stat: ExplorerItem, data: IEditableData } | undefined {
		return this.editable;
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
		const options: IResolveFileOptions = { resolveTo: [resource], resolveMetadata: this.sortOrder === SortOrder.Modified };
		const workspaceFolder = this.contextService.getWorkspaceFolder(resource);
		if (workspaceFolder === null) {
			return Promise.resolve(undefined);
		}
		const rootUri = workspaceFolder.uri;

		const root = this.roots.filter(r => r.resource.toString() === rootUri.toString()).pop()!;

		try {
			const stat = await this.fileService.resolve(rootUri, options);

			// Convert to model
			const modelStat = ExplorerItem.create(this.fileService, stat, undefined, options.resolveTo);
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
		const resource = this.editorService.activeEditor ? this.editorService.activeEditor.resource : undefined;
		const autoReveal = this.configurationService.getValue<IFilesConfiguration>().explorer.autoReveal;

		if (resource && autoReveal) {
			// We did a top level refresh, reveal the active file #67118
			this.select(resource, true);
		}
	}

	// File events

	private onDidRunOperation(e: FileOperationEvent): void {
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
							const modelStat = ExplorerItem.create(this.fileService, stat, p.parent);
							ExplorerItem.mergeLocalWithDisk(modelStat, p);
						}

						const childElement = ExplorerItem.create(this.fileService, addedElement, p.parent);
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

	private onDidFilesChange(e: FileChangesEvent): void {
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
				if (this._sortOrder === SortOrder.Modified) {
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
			if (change.type === FileChangeType.UPDATED && this._sortOrder !== SortOrder.Modified) {
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
		const configSortOrder = configuration?.explorer?.sortOrder || 'default';
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
