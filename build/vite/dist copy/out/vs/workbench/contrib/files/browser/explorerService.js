/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExplorerService_1;
import { Event } from '../../../../base/common/event.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ExplorerItem, ExplorerModel } from '../common/explorerModel.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { dirname, basename } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { UndoRedoSource } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ResourceGlobMatcher } from '../../../common/resources.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
export const UNDO_REDO_SOURCE = new UndoRedoSource();
let ExplorerService = class ExplorerService {
    static { ExplorerService_1 = this; }
    static { this.EXPLORER_FILE_CHANGES_REACT_DELAY = 500; } // delay in ms to react to file changes to give our internal events a chance to react first
    constructor(fileService, configurationService, contextService, clipboardService, editorService, uriIdentityService, bulkEditService, progressService, hostService, filesConfigurationService) {
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.clipboardService = clipboardService;
        this.editorService = editorService;
        this.uriIdentityService = uriIdentityService;
        this.bulkEditService = bulkEditService;
        this.progressService = progressService;
        this.filesConfigurationService = filesConfigurationService;
        this.disposables = new DisposableStore();
        this.fileChangeEvents = [];
        this.config = this.configurationService.getValue('explorer');
        this.model = new ExplorerModel(this.contextService, this.uriIdentityService, this.fileService, this.configurationService, this.filesConfigurationService);
        this.disposables.add(this.model);
        this.disposables.add(this.fileService.onDidRunOperation(e => this.onDidRunOperation(e)));
        this.onFileChangesScheduler = this.disposables.add(new RunOnceScheduler(async () => {
            const events = this.fileChangeEvents;
            this.fileChangeEvents = [];
            // Filter to the ones we care
            const types = [2 /* FileChangeType.DELETED */];
            if (this.config.sortOrder === "modified" /* SortOrder.Modified */) {
                types.push(0 /* FileChangeType.UPDATED */);
            }
            let shouldRefresh = false;
            // For DELETED and UPDATED events go through the explorer model and check if any of the items got affected
            this.roots.forEach(r => {
                if (this.view && !shouldRefresh) {
                    shouldRefresh = doesFileEventAffect(r, this.view, events, types);
                }
            });
            // For ADDED events we need to go through all the events and check if the explorer is already aware of some of them
            // Or if they affect not yet resolved parts of the explorer. If that is the case we will not refresh.
            events.forEach(e => {
                if (!shouldRefresh) {
                    for (const resource of e.rawAdded) {
                        const parent = this.model.findClosest(dirname(resource));
                        // Parent of the added resource is resolved and the explorer model is not aware of the added resource - we need to refresh
                        if (parent && !parent.getChild(basename(resource))) {
                            shouldRefresh = true;
                            break;
                        }
                    }
                }
            });
            if (shouldRefresh) {
                await this.refresh(false);
            }
        }, ExplorerService_1.EXPLORER_FILE_CHANGES_REACT_DELAY));
        this.disposables.add(this.fileService.onDidFilesChange(e => {
            this.fileChangeEvents.push(e);
            // Don't mess with the file tree while in the process of editing. #112293
            if (this.editable) {
                return;
            }
            if (!this.onFileChangesScheduler.isScheduled()) {
                this.onFileChangesScheduler.schedule();
            }
        }));
        this.disposables.add(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
        this.disposables.add(Event.any(this.fileService.onDidChangeFileSystemProviderRegistrations, this.fileService.onDidChangeFileSystemProviderCapabilities)(async (e) => {
            let affected = false;
            this.model.roots.forEach(r => {
                if (r.resource.scheme === e.scheme) {
                    affected = true;
                    r.forgetChildren();
                }
            });
            if (affected) {
                if (this.view) {
                    await this.view.setTreeInput();
                }
            }
        }));
        this.disposables.add(this.model.onDidChangeRoots(() => {
            this.view?.setTreeInput();
        }));
        // Refresh explorer when window gets focus to compensate for missing file events #126817
        this.disposables.add(hostService.onDidChangeFocus(hasFocus => {
            if (hasFocus) {
                this.refresh(false);
            }
        }));
        this.revealExcludeMatcher = new ResourceGlobMatcher((uri) => getRevealExcludes(configurationService.getValue({ resource: uri })), (event) => event.affectsConfiguration('explorer.autoRevealExclude'), contextService, configurationService);
        this.disposables.add(this.revealExcludeMatcher);
    }
    get roots() {
        return this.model.roots;
    }
    get sortOrderConfiguration() {
        return {
            sortOrder: this.config.sortOrder,
            lexicographicOptions: this.config.sortOrderLexicographicOptions,
            reverse: this.config.sortOrderReverse,
        };
    }
    registerView(contextProvider) {
        this.view = contextProvider;
    }
    getContext(respectMultiSelection, ignoreNestedChildren = false) {
        if (!this.view) {
            return [];
        }
        const items = new Set(this.view.getContext(respectMultiSelection));
        items.forEach(item => {
            try {
                if (respectMultiSelection && !ignoreNestedChildren && this.view?.isItemCollapsed(item) && item.nestedChildren) {
                    for (const child of item.nestedChildren) {
                        items.add(child);
                    }
                }
            }
            catch {
                // We will error out trying to resolve collapsed nodes that have not yet been resolved.
                // So we catch and ignore them in the multiSelect context
                return;
            }
        });
        return [...items];
    }
    async applyBulkEdit(edit, options) {
        const cancellationTokenSource = new CancellationTokenSource();
        const location = options.progressLocation ?? 10 /* ProgressLocation.Window */;
        let progressOptions;
        if (location === 10 /* ProgressLocation.Window */) {
            progressOptions = {
                location: location,
                title: options.progressLabel,
                cancellable: edit.length > 1,
            };
        }
        else {
            progressOptions = {
                location: location,
                title: options.progressLabel,
                cancellable: edit.length > 1,
                delay: 500,
            };
        }
        const promise = this.progressService.withProgress(progressOptions, async (progress) => {
            await this.bulkEditService.apply(edit, {
                undoRedoSource: UNDO_REDO_SOURCE,
                label: options.undoLabel,
                code: 'undoredo.explorerOperation',
                progress,
                token: cancellationTokenSource.token,
                confirmBeforeUndo: options.confirmBeforeUndo
            });
        }, () => cancellationTokenSource.cancel());
        await this.progressService.withProgress({ location: 1 /* ProgressLocation.Explorer */, delay: 500 }, () => promise);
        cancellationTokenSource.dispose();
    }
    hasViewFocus() {
        return !!this.view && this.view.hasFocus();
    }
    // IExplorerService methods
    findClosest(resource) {
        return this.model.findClosest(resource);
    }
    findClosestRoot(resource) {
        const parentRoots = this.model.roots.filter(r => this.uriIdentityService.extUri.isEqualOrParent(resource, r.resource))
            .sort((first, second) => second.resource.path.length - first.resource.path.length);
        return parentRoots.length ? parentRoots[0] : null;
    }
    async setEditable(stat, data) {
        if (!this.view) {
            return;
        }
        if (!data) {
            this.editable = undefined;
        }
        else {
            this.editable = { stat, data };
        }
        const isEditing = this.isEditable(stat);
        try {
            await this.view.setEditable(stat, isEditing);
        }
        catch {
            return;
        }
        if (!this.editable && this.fileChangeEvents.length && !this.onFileChangesScheduler.isScheduled()) {
            this.onFileChangesScheduler.schedule();
        }
    }
    async setToCopy(items, cut) {
        const previouslyCutItems = this.cutItems;
        this.cutItems = cut ? items : undefined;
        await this.clipboardService.writeResources(items.map(s => s.resource));
        this.view?.itemsCopied(items, cut, previouslyCutItems);
    }
    isCut(item) {
        return !!this.cutItems && this.cutItems.some(i => this.uriIdentityService.extUri.isEqual(i.resource, item.resource));
    }
    getEditable() {
        return this.editable;
    }
    getEditableData(stat) {
        return this.editable && this.editable.stat === stat ? this.editable.data : undefined;
    }
    isEditable(stat) {
        return !!this.editable && (this.editable.stat === stat || !stat);
    }
    async select(resource, reveal) {
        if (!this.view) {
            return;
        }
        // If file or parent matches exclude patterns, do not reveal unless reveal argument is 'force'
        const ignoreRevealExcludes = reveal === 'force';
        const fileStat = this.findClosest(resource);
        if (fileStat) {
            if (!this.shouldAutoRevealItem(fileStat, ignoreRevealExcludes)) {
                return;
            }
            await this.view.selectResource(fileStat.resource, reveal);
            return Promise.resolve(undefined);
        }
        // Stat needs to be resolved first and then revealed
        const options = { resolveTo: [resource], resolveMetadata: this.config.sortOrder === "modified" /* SortOrder.Modified */ };
        const root = this.findClosestRoot(resource);
        if (!root) {
            return undefined;
        }
        try {
            const stat = await this.fileService.resolve(root.resource, options);
            // Convert to model
            const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, undefined, options.resolveTo);
            // Update Input with disk Stat
            ExplorerItem.mergeLocalWithDisk(modelStat, root);
            const item = root.find(resource);
            await this.view.refresh(true, root);
            // Once item is resolved, check again if folder should be expanded
            if (item && !this.shouldAutoRevealItem(item, ignoreRevealExcludes)) {
                return;
            }
            await this.view.selectResource(item ? item.resource : undefined, reveal);
        }
        catch (error) {
            root.error = error;
            await this.view.refresh(false, root);
        }
    }
    async refresh(reveal = true) {
        // Do not refresh the tree when it is showing temporary nodes (phantom elements)
        if (this.view?.hasPhantomElements()) {
            return;
        }
        this.model.roots.forEach(r => r.forgetChildren());
        if (this.view) {
            await this.view.refresh(true);
            const resource = this.editorService.activeEditor?.resource;
            const autoReveal = this.configurationService.getValue().explorer.autoReveal;
            if (reveal && resource && autoReveal) {
                // We did a top level refresh, reveal the active file #67118
                this.select(resource, autoReveal);
            }
        }
    }
    // File events
    async onDidRunOperation(e) {
        // When nesting, changes to one file in a folder may impact the rendered structure
        // of all the folder's immediate children, thus a recursive refresh is needed.
        // Ideally the tree would be able to recusively refresh just one level but that does not yet exist.
        const shouldDeepRefresh = this.config.fileNesting.enabled;
        // Add
        if (e.isOperation(0 /* FileOperation.CREATE */) || e.isOperation(3 /* FileOperation.COPY */)) {
            const addedElement = e.target;
            const parentResource = dirname(addedElement.resource);
            const parents = this.model.findAll(parentResource);
            if (parents.length) {
                // Add the new file to its parent (Model)
                await Promise.all(parents.map(async (p) => {
                    // We have to check if the parent is resolved #29177
                    const resolveMetadata = this.config.sortOrder === `modified`;
                    if (!p.isDirectoryResolved) {
                        const stat = await this.fileService.resolve(p.resource, { resolveMetadata });
                        if (stat) {
                            const modelStat = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, stat, p.parent);
                            ExplorerItem.mergeLocalWithDisk(modelStat, p);
                        }
                    }
                    const childElement = ExplorerItem.create(this.fileService, this.configurationService, this.filesConfigurationService, addedElement, p.parent);
                    // Make sure to remove any previous version of the file if any
                    p.removeChild(childElement);
                    p.addChild(childElement);
                    // Refresh the Parent (View)
                    await this.view?.refresh(shouldDeepRefresh, p);
                }));
            }
        }
        // Move (including Rename)
        else if (e.isOperation(2 /* FileOperation.MOVE */)) {
            const oldResource = e.resource;
            const newElement = e.target;
            const oldParentResource = dirname(oldResource);
            const newParentResource = dirname(newElement.resource);
            const modelElements = this.model.findAll(oldResource);
            const sameParentMove = modelElements.every(e => !e.nestedParent) && this.uriIdentityService.extUri.isEqual(oldParentResource, newParentResource);
            // Handle Rename
            if (sameParentMove) {
                await Promise.all(modelElements.map(async (modelElement) => {
                    // Rename File (Model)
                    modelElement.rename(newElement);
                    await this.view?.refresh(shouldDeepRefresh, modelElement.parent);
                }));
            }
            // Handle Move
            else {
                const newParents = this.model.findAll(newParentResource);
                if (newParents.length && modelElements.length) {
                    // Move in Model
                    await Promise.all(modelElements.map(async (modelElement, index) => {
                        const oldParent = modelElement.parent;
                        const oldNestedParent = modelElement.nestedParent;
                        modelElement.move(newParents[index]);
                        if (oldNestedParent) {
                            await this.view?.refresh(false, oldNestedParent);
                        }
                        await this.view?.refresh(false, oldParent);
                        await this.view?.refresh(shouldDeepRefresh, newParents[index]);
                    }));
                }
            }
        }
        // Delete
        else if (e.isOperation(1 /* FileOperation.DELETE */)) {
            const modelElements = this.model.findAll(e.resource);
            await Promise.all(modelElements.map(async (modelElement) => {
                if (modelElement.parent) {
                    // Remove Element from Parent (Model)
                    const parent = modelElement.parent;
                    parent.removeChild(modelElement);
                    this.view?.focusNext();
                    const oldNestedParent = modelElement.nestedParent;
                    if (oldNestedParent) {
                        oldNestedParent.removeChild(modelElement);
                        await this.view?.refresh(false, oldNestedParent);
                    }
                    // Refresh Parent (View)
                    await this.view?.refresh(shouldDeepRefresh, parent);
                    if (this.view?.getFocus().length === 0) {
                        this.view?.focusLast();
                    }
                }
            }));
        }
    }
    // Check if an item matches a explorer.autoRevealExclude pattern
    shouldAutoRevealItem(item, ignore) {
        if (item === undefined || ignore) {
            return true;
        }
        if (this.revealExcludeMatcher.matches(item.resource, name => !!(item.parent?.getChild(name)))) {
            return false;
        }
        const root = item.root;
        let currentItem = item.parent;
        while (currentItem !== root) {
            if (currentItem === undefined) {
                return true;
            }
            if (this.revealExcludeMatcher.matches(currentItem.resource)) {
                return false;
            }
            currentItem = currentItem.parent;
        }
        return true;
    }
    async onConfigurationUpdated(event) {
        if (!event.affectsConfiguration('explorer')) {
            return;
        }
        let shouldRefresh = false;
        if (event.affectsConfiguration('explorer.fileNesting')) {
            shouldRefresh = true;
        }
        const configuration = this.configurationService.getValue();
        const configSortOrder = configuration?.explorer?.sortOrder || "default" /* SortOrder.Default */;
        if (this.config.sortOrder !== configSortOrder) {
            shouldRefresh = this.config.sortOrder !== undefined;
        }
        const configLexicographicOptions = configuration?.explorer?.sortOrderLexicographicOptions || "default" /* LexicographicOptions.Default */;
        if (this.config.sortOrderLexicographicOptions !== configLexicographicOptions) {
            shouldRefresh = shouldRefresh || this.config.sortOrderLexicographicOptions !== undefined;
        }
        const sortOrderReverse = configuration?.explorer?.sortOrderReverse || false;
        if (this.config.sortOrderReverse !== sortOrderReverse) {
            shouldRefresh = shouldRefresh || this.config.sortOrderReverse !== undefined;
        }
        this.config = configuration.explorer;
        if (shouldRefresh) {
            await this.refresh();
        }
    }
    dispose() {
        this.disposables.dispose();
    }
};
ExplorerService = ExplorerService_1 = __decorate([
    __param(0, IFileService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceContextService),
    __param(3, IClipboardService),
    __param(4, IEditorService),
    __param(5, IUriIdentityService),
    __param(6, IBulkEditService),
    __param(7, IProgressService),
    __param(8, IHostService),
    __param(9, IFilesConfigurationService)
], ExplorerService);
export { ExplorerService };
function doesFileEventAffect(item, view, events, types) {
    for (const [_name, child] of item.children) {
        if (view.isItemVisible(child)) {
            if (events.some(e => e.contains(child.resource, ...types))) {
                return true;
            }
            if (child.isDirectory && child.isDirectoryResolved) {
                if (doesFileEventAffect(child, view, events, types)) {
                    return true;
                }
            }
        }
    }
    return false;
}
function getRevealExcludes(configuration) {
    const revealExcludes = configuration?.explorer?.autoRevealExclude;
    if (!revealExcludes) {
        return {};
    }
    return revealExcludes;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9leHBsb3JlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdkUsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV6RSxPQUFPLEVBQXFDLFlBQVksRUFBeUQsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwSyxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBNkIsTUFBTSw0REFBNEQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLHdEQUF3RCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQWlFLE1BQU0sa0RBQWtELENBQUM7QUFDbkosT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXRFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRXRILE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7QUFFOUMsSUFBTSxlQUFlLEdBQXJCLE1BQU0sZUFBZTs7YUFHSCxzQ0FBaUMsR0FBRyxHQUFHLEFBQU4sQ0FBTyxHQUFDLDJGQUEyRjtJQVk1SixZQUNlLFdBQWlDLEVBQ3hCLG9CQUFtRCxFQUNoRCxjQUFnRCxFQUN2RCxnQkFBMkMsRUFDOUMsYUFBcUMsRUFDaEMsa0JBQXdELEVBQzNELGVBQWtELEVBQ2xELGVBQWtELEVBQ3RELFdBQXlCLEVBQ1gseUJBQXNFO1FBVDVFLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2hCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDeEMsbUJBQWMsR0FBZCxjQUFjLENBQTBCO1FBQy9DLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDdEMsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQ2YsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUMxQyxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFDakMsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBRXZCLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBNEI7UUFwQmxGLGdCQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQU83QyxxQkFBZ0IsR0FBdUIsRUFBRSxDQUFDO1FBZWpELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUU3RCxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQzFKLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV6RixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNsRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7WUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztZQUUzQiw2QkFBNkI7WUFDN0IsTUFBTSxLQUFLLEdBQUcsZ0NBQXdCLENBQUM7WUFDdkMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsd0NBQXVCLEVBQUUsQ0FBQztnQkFDbEQsS0FBSyxDQUFDLElBQUksZ0NBQXdCLENBQUM7WUFDcEMsQ0FBQztZQUVELElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztZQUMxQiwwR0FBMEc7WUFDMUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3RCLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUNqQyxhQUFhLEdBQUcsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSCxtSEFBbUg7WUFDbkgscUdBQXFHO1lBQ3JHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ2xCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDcEIsS0FBSyxNQUFNLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQ25DLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUN6RCwwSEFBMEg7d0JBQzFILElBQUksTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDOzRCQUNwRCxhQUFhLEdBQUcsSUFBSSxDQUFDOzRCQUNyQixNQUFNO3dCQUNQLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0IsQ0FBQztRQUVGLENBQUMsRUFBRSxpQkFBZSxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQztRQUV2RCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzFELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIseUVBQXlFO1lBQ3pFLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNuQixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3hDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFxQixJQUFJLENBQUMsV0FBVyxDQUFDLDBDQUEwQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMseUNBQXlDLENBQUMsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7WUFDckwsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDNUIsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ3BDLFFBQVEsR0FBRyxJQUFJLENBQUM7b0JBQ2hCLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDZixNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2hDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFO1lBQ3JELElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLHdGQUF3RjtRQUN4RixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDNUQsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksbUJBQW1CLENBQ2xELENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQXNCLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFDakcsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyw0QkFBNEIsQ0FBQyxFQUNuRSxjQUFjLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUN6QixDQUFDO0lBRUQsSUFBSSxzQkFBc0I7UUFDekIsT0FBTztZQUNOLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVM7WUFDaEMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyw2QkFBNkI7WUFDL0QsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCO1NBQ3JDLENBQUM7SUFDSCxDQUFDO0lBRUQsWUFBWSxDQUFDLGVBQThCO1FBQzFDLElBQUksQ0FBQyxJQUFJLEdBQUcsZUFBZSxDQUFDO0lBQzdCLENBQUM7SUFFRCxVQUFVLENBQUMscUJBQThCLEVBQUUsdUJBQWdDLEtBQUs7UUFDL0UsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBZSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDakYsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNwQixJQUFJLENBQUM7Z0JBQ0osSUFBSSxxQkFBcUIsSUFBSSxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztvQkFDL0csS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7d0JBQ3pDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ2xCLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7WUFBQyxNQUFNLENBQUM7Z0JBQ1IsdUZBQXVGO2dCQUN2Rix5REFBeUQ7Z0JBQ3pELE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUF3QixFQUFFLE9BQTBKO1FBQ3ZNLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1FBQzlELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0Isb0NBQTJCLENBQUM7UUFDckUsSUFBSSxlQUFlLENBQUM7UUFDcEIsSUFBSSxRQUFRLHFDQUE0QixFQUFFLENBQUM7WUFDMUMsZUFBZSxHQUFHO2dCQUNqQixRQUFRLEVBQUUsUUFBUTtnQkFDbEIsS0FBSyxFQUFFLE9BQU8sQ0FBQyxhQUFhO2dCQUM1QixXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDO2FBQ0QsQ0FBQztRQUM5QixDQUFDO2FBQU0sQ0FBQztZQUNQLGVBQWUsR0FBRztnQkFDakIsUUFBUSxFQUFFLFFBQVE7Z0JBQ2xCLEtBQUssRUFBRSxPQUFPLENBQUMsYUFBYTtnQkFDNUIsV0FBVyxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFDNUIsS0FBSyxFQUFFLEdBQUc7YUFDMEIsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLEtBQUssRUFBQyxRQUFRLEVBQUMsRUFBRTtZQUNuRixNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtnQkFDdEMsY0FBYyxFQUFFLGdCQUFnQjtnQkFDaEMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxTQUFTO2dCQUN4QixJQUFJLEVBQUUsNEJBQTRCO2dCQUNsQyxRQUFRO2dCQUNSLEtBQUssRUFBRSx1QkFBdUIsQ0FBQyxLQUFLO2dCQUNwQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsaUJBQWlCO2FBQzVDLENBQUMsQ0FBQztRQUNKLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLG1DQUEyQixFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1Ryx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsWUFBWTtRQUNYLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUM1QyxDQUFDO0lBRUQsMkJBQTJCO0lBRTNCLFdBQVcsQ0FBQyxRQUFhO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELGVBQWUsQ0FBQyxRQUFhO1FBQzVCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDcEgsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BGLE9BQU8sV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDbkQsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBa0IsRUFBRSxJQUEwQjtRQUMvRCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsSUFBSSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ2hDLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixPQUFPO1FBQ1IsQ0FBQztRQUdELElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQztZQUNsRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQXFCLEVBQUUsR0FBWTtRQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDekMsSUFBSSxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3hDLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFdkUsSUFBSSxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRCxLQUFLLENBQUMsSUFBa0I7UUFDdkIsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDdEgsQ0FBQztJQUVELFdBQVc7UUFDVixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdEIsQ0FBQztJQUVELGVBQWUsQ0FBQyxJQUFrQjtRQUNqQyxPQUFPLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ3RGLENBQUM7SUFFRCxVQUFVLENBQUMsSUFBOEI7UUFDeEMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQWEsRUFBRSxNQUF5QjtRQUNwRCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE9BQU87UUFDUixDQUFDO1FBRUQsOEZBQThGO1FBQzlGLE1BQU0sb0JBQW9CLEdBQUcsTUFBTSxLQUFLLE9BQU8sQ0FBQztRQUVoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hFLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzFELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBRUQsb0RBQW9EO1FBQ3BELE1BQU0sT0FBTyxHQUF3QixFQUFFLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsd0NBQXVCLEVBQUUsQ0FBQztRQUM5SCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFcEUsbUJBQW1CO1lBQ25CLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZKLDhCQUE4QjtZQUM5QixZQUFZLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2pELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDakMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFcEMsa0VBQWtFO1lBQ2xFLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BFLE9BQU87WUFDUixDQUFDO1lBQ0QsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNuQixNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUk7UUFDMUIsZ0ZBQWdGO1FBQ2hGLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRSxFQUFFLENBQUM7WUFDckMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUNsRCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDO1lBQzNELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQXVCLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztZQUVqRyxJQUFJLE1BQU0sSUFBSSxRQUFRLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ3RDLDREQUE0RDtnQkFDNUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDbkMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsY0FBYztJQUVOLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFxQjtRQUNwRCxrRkFBa0Y7UUFDbEYsOEVBQThFO1FBQzlFLG1HQUFtRztRQUNuRyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQztRQUUxRCxNQUFNO1FBQ04sSUFBSSxDQUFDLENBQUMsV0FBVyw4QkFBc0IsSUFBSSxDQUFDLENBQUMsV0FBVyw0QkFBb0IsRUFBRSxDQUFDO1lBQzlFLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDOUIsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUVuRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFFcEIseUNBQXlDO2dCQUN6QyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7b0JBQ3ZDLG9EQUFvRDtvQkFDcEQsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDO29CQUM3RCxJQUFJLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixFQUFFLENBQUM7d0JBQzVCLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7d0JBQzdFLElBQUksSUFBSSxFQUFFLENBQUM7NEJBQ1YsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQzs0QkFDbkksWUFBWSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDL0MsQ0FBQztvQkFDRixDQUFDO29CQUVELE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQzlJLDhEQUE4RDtvQkFDOUQsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDekIsNEJBQTRCO29CQUM1QixNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNoRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNGLENBQUM7UUFFRCwwQkFBMEI7YUFDckIsSUFBSSxDQUFDLENBQUMsV0FBVyw0QkFBb0IsRUFBRSxDQUFDO1lBQzVDLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDL0IsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUM1QixNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMvQyxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdEQsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFFakosZ0JBQWdCO1lBQ2hCLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBQyxZQUFZLEVBQUMsRUFBRTtvQkFDeEQsc0JBQXNCO29CQUN0QixZQUFZLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUNoQyxNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbEUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxjQUFjO2lCQUNULENBQUM7Z0JBQ0wsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFDekQsSUFBSSxVQUFVLENBQUMsTUFBTSxJQUFJLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDL0MsZ0JBQWdCO29CQUNoQixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxFQUFFO3dCQUNqRSxNQUFNLFNBQVMsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO3dCQUN0QyxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsWUFBWSxDQUFDO3dCQUNsRCxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUNyQyxJQUFJLGVBQWUsRUFBRSxDQUFDOzRCQUNyQixNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQzt3QkFDbEQsQ0FBQzt3QkFDRCxNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQzt3QkFDM0MsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDaEUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxTQUFTO2FBQ0osSUFBSSxDQUFDLENBQUMsV0FBVyw4QkFBc0IsRUFBRSxDQUFDO1lBQzlDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNyRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsWUFBWSxFQUFDLEVBQUU7Z0JBQ3hELElBQUksWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN6QixxQ0FBcUM7b0JBQ3JDLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUM7b0JBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQ2pDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7b0JBRXZCLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxZQUFZLENBQUM7b0JBQ2xELElBQUksZUFBZSxFQUFFLENBQUM7d0JBQ3JCLGVBQWUsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7d0JBQzFDLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUNsRCxDQUFDO29CQUNELHdCQUF3QjtvQkFDeEIsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFFcEQsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQzt3QkFDeEMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztvQkFDeEIsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDRixDQUFDO0lBRUQsZ0VBQWdFO0lBQ3hELG9CQUFvQixDQUFDLElBQThCLEVBQUUsTUFBZTtRQUMzRSxJQUFJLElBQUksS0FBSyxTQUFTLElBQUksTUFBTSxFQUFFLENBQUM7WUFDbEMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUMvRixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDOUIsT0FBTyxXQUFXLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDN0IsSUFBSSxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQy9CLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDN0QsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1lBQ0QsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7UUFDbEMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxLQUFnQztRQUNwRSxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDN0MsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLGFBQWEsR0FBRyxLQUFLLENBQUM7UUFFMUIsSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO1lBQ3hELGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLEVBQXVCLENBQUM7UUFFaEYsTUFBTSxlQUFlLEdBQUcsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLHFDQUFxQixDQUFDO1FBQ2hGLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDL0MsYUFBYSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxLQUFLLFNBQVMsQ0FBQztRQUNyRCxDQUFDO1FBRUQsTUFBTSwwQkFBMEIsR0FBRyxhQUFhLEVBQUUsUUFBUSxFQUFFLDZCQUE2QixnREFBZ0MsQ0FBQztRQUMxSCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsNkJBQTZCLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztZQUM5RSxhQUFhLEdBQUcsYUFBYSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsNkJBQTZCLEtBQUssU0FBUyxDQUFDO1FBQzFGLENBQUM7UUFDRCxNQUFNLGdCQUFnQixHQUFHLGFBQWEsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLElBQUksS0FBSyxDQUFDO1FBRTVFLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZELGFBQWEsR0FBRyxhQUFhLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsS0FBSyxTQUFTLENBQUM7UUFDN0UsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQztRQUVyQyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE1BQU0sSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDNUIsQ0FBQzs7QUF2ZFcsZUFBZTtJQWdCekIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSwwQkFBMEIsQ0FBQTtHQXpCaEIsZUFBZSxDQXdkM0I7O0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxJQUFrQixFQUFFLElBQW1CLEVBQUUsTUFBMEIsRUFBRSxLQUF1QjtJQUN4SCxLQUFLLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzVDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQy9CLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsSUFBSSxLQUFLLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUNwRCxJQUFJLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3JELE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLGFBQWtDO0lBQzVELE1BQU0sY0FBYyxHQUFHLGFBQWEsRUFBRSxRQUFRLEVBQUUsaUJBQWlCLENBQUM7SUFFbEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELE9BQU8sY0FBYyxDQUFDO0FBQ3ZCLENBQUMifQ==