/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, toDisposable, DisposableStore, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
export const IWorkingCopyService = createDecorator('workingCopyService');
class WorkingCopyLeakError extends Error {
    constructor(message, stack) {
        super(message);
        this.name = 'WorkingCopyLeakError';
        this.stack = stack;
    }
}
export class WorkingCopyService extends Disposable {
    constructor() {
        super(...arguments);
        //#region Events
        this._onDidRegister = this._register(new Emitter());
        this.onDidRegister = this._onDidRegister.event;
        this._onDidUnregister = this._register(new Emitter());
        this.onDidUnregister = this._onDidUnregister.event;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this._workingCopies = new Set();
        this.mapResourceToWorkingCopies = new ResourceMap();
        this.mapWorkingCopyToListeners = this._register(new DisposableMap());
        this.mapLeakToCounter = new Map();
        //#endregion
    }
    //#endregion
    //#region Registry
    get workingCopies() { return Array.from(this._workingCopies.values()); }
    registerWorkingCopy(workingCopy) {
        let workingCopiesForResource = this.mapResourceToWorkingCopies.get(workingCopy.resource);
        if (workingCopiesForResource?.has(workingCopy.typeId)) {
            throw new Error(`Cannot register more than one working copy with the same resource ${workingCopy.resource.toString()} and type ${workingCopy.typeId}.`);
        }
        // Registry (all)
        this._workingCopies.add(workingCopy);
        // Registry (type based)
        if (!workingCopiesForResource) {
            workingCopiesForResource = new Map();
            this.mapResourceToWorkingCopies.set(workingCopy.resource, workingCopiesForResource);
        }
        workingCopiesForResource.set(workingCopy.typeId, workingCopy);
        // Wire in Events
        const disposables = new DisposableStore();
        disposables.add(workingCopy.onDidChangeContent(() => this._onDidChangeContent.fire(workingCopy)));
        disposables.add(workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(workingCopy)));
        disposables.add(workingCopy.onDidSave(e => this._onDidSave.fire({ workingCopy, ...e })));
        this.mapWorkingCopyToListeners.set(workingCopy, disposables);
        // Send some initial events
        this._onDidRegister.fire(workingCopy);
        if (workingCopy.isDirty()) {
            this._onDidChangeDirty.fire(workingCopy);
        }
        // Track Leaks
        const leakId = this.trackLeaks(workingCopy);
        return toDisposable(() => {
            // Untrack Leaks
            if (leakId) {
                this.untrackLeaks(leakId);
            }
            // Unregister working copy
            this.unregisterWorkingCopy(workingCopy);
            // Signal as event
            this._onDidUnregister.fire(workingCopy);
        });
    }
    unregisterWorkingCopy(workingCopy) {
        // Registry (all)
        this._workingCopies.delete(workingCopy);
        // Registry (type based)
        const workingCopiesForResource = this.mapResourceToWorkingCopies.get(workingCopy.resource);
        if (workingCopiesForResource?.delete(workingCopy.typeId) && workingCopiesForResource.size === 0) {
            this.mapResourceToWorkingCopies.delete(workingCopy.resource);
        }
        // If copy is dirty, ensure to fire an event to signal the dirty change
        // (a disposed working copy cannot account for being dirty in our model)
        if (workingCopy.isDirty()) {
            this._onDidChangeDirty.fire(workingCopy);
        }
        // Remove all listeners associated to working copy
        this.mapWorkingCopyToListeners.deleteAndDispose(workingCopy);
    }
    has(resourceOrIdentifier) {
        if (URI.isUri(resourceOrIdentifier)) {
            return this.mapResourceToWorkingCopies.has(resourceOrIdentifier);
        }
        return this.mapResourceToWorkingCopies.get(resourceOrIdentifier.resource)?.has(resourceOrIdentifier.typeId) ?? false;
    }
    get(identifier) {
        return this.mapResourceToWorkingCopies.get(identifier.resource)?.get(identifier.typeId);
    }
    getAll(resource) {
        const workingCopies = this.mapResourceToWorkingCopies.get(resource);
        if (!workingCopies) {
            return undefined;
        }
        return Array.from(workingCopies.values());
    }
    //#endregion
    //#region Leak Monitoring
    static { this.LEAK_TRACKING_THRESHOLD = 256; }
    static { this.LEAK_REPORTING_THRESHOLD = 2 * WorkingCopyService.LEAK_TRACKING_THRESHOLD; }
    static { this.LEAK_REPORTED = false; }
    trackLeaks(workingCopy) {
        if (WorkingCopyService.LEAK_REPORTED || this._workingCopies.size < WorkingCopyService.LEAK_TRACKING_THRESHOLD) {
            return undefined;
        }
        const leakId = `${workingCopy.resource.scheme}#${workingCopy.typeId || '<no typeId>'}\n${new Error().stack?.split('\n').slice(2).join('\n') ?? ''}`;
        const leakCounter = (this.mapLeakToCounter.get(leakId) ?? 0) + 1;
        this.mapLeakToCounter.set(leakId, leakCounter);
        if (this._workingCopies.size > WorkingCopyService.LEAK_REPORTING_THRESHOLD) {
            WorkingCopyService.LEAK_REPORTED = true;
            const [topLeak, topCount] = Array.from(this.mapLeakToCounter.entries()).reduce(([topLeak, topCount], [key, val]) => val > topCount ? [key, val] : [topLeak, topCount]);
            const message = `Potential working copy LEAK detected, having ${this._workingCopies.size} working copies already. Most frequent owner (${topCount})`;
            onUnexpectedError(new WorkingCopyLeakError(message, topLeak));
        }
        return leakId;
    }
    untrackLeaks(leakId) {
        const stackCounter = (this.mapLeakToCounter.get(leakId) ?? 1) - 1;
        this.mapLeakToCounter.set(leakId, stackCounter);
        if (stackCounter === 0) {
            this.mapLeakToCounter.delete(leakId);
        }
    }
    //#endregion
    //#region Dirty Tracking
    get hasDirty() {
        for (const workingCopy of this._workingCopies) {
            if (workingCopy.isDirty()) {
                return true;
            }
        }
        return false;
    }
    get dirtyCount() {
        let totalDirtyCount = 0;
        for (const workingCopy of this._workingCopies) {
            if (workingCopy.isDirty()) {
                totalDirtyCount++;
            }
        }
        return totalDirtyCount;
    }
    get dirtyWorkingCopies() {
        return this.workingCopies.filter(workingCopy => workingCopy.isDirty());
    }
    get modifiedCount() {
        let totalModifiedCount = 0;
        for (const workingCopy of this._workingCopies) {
            if (workingCopy.isModified()) {
                totalModifiedCount++;
            }
        }
        return totalModifiedCount;
    }
    get modifiedWorkingCopies() {
        return this.workingCopies.filter(workingCopy => workingCopy.isModified());
    }
    isDirty(resource, typeId) {
        const workingCopies = this.mapResourceToWorkingCopies.get(resource);
        if (workingCopies) {
            // For a specific type
            if (typeof typeId === 'string') {
                return workingCopies.get(typeId)?.isDirty() ?? false;
            }
            // Across all working copies
            else {
                for (const [, workingCopy] of workingCopies) {
                    if (workingCopy.isDirty()) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
registerSingleton(IWorkingCopyService, WorkingCopyService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLGVBQWUsRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFdEUsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFzQixvQkFBb0IsQ0FBQyxDQUFDO0FBOEg5RixNQUFNLG9CQUFxQixTQUFRLEtBQUs7SUFFdkMsWUFBWSxPQUFlLEVBQUUsS0FBYTtRQUN6QyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFZixJQUFJLENBQUMsSUFBSSxHQUFHLHNCQUFzQixDQUFDO1FBQ25DLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxVQUFVO0lBQWxEOztRQUlDLGdCQUFnQjtRQUVDLG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBZ0IsQ0FBQyxDQUFDO1FB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