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
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, isDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import Severity from '../../../base/common/severity.js';
import * as nls from '../../../nls.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { INotificationService } from '../../notification/common/notification.js';
import { IUndoRedoService, ResourceEditStackSnapshot, UndoRedoGroup, UndoRedoSource } from './undoRedo.js';
const DEBUG = false;
function getResourceLabel(resource) {
    return resource.scheme === Schemas.file ? resource.fsPath : resource.path;
}
let stackElementCounter = 0;
class ResourceStackElement {
    constructor(actual, resourceLabel, strResource, groupId, groupOrder, sourceId, sourceOrder) {
        this.id = (++stackElementCounter);
        this.type = 0 /* UndoRedoElementType.Resource */;
        this.actual = actual;
        this.label = actual.label;
        this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
        this.resourceLabel = resourceLabel;
        this.strResource = strResource;
        this.resourceLabels = [this.resourceLabel];
        this.strResources = [this.strResource];
        this.groupId = groupId;
        this.groupOrder = groupOrder;
        this.sourceId = sourceId;
        this.sourceOrder = sourceOrder;
        this.isValid = true;
    }
    setValid(isValid) {
        this.isValid = isValid;
    }
    toString() {
        return `[id:${this.id}] [group:${this.groupId}] [${this.isValid ? '  VALID' : 'INVALID'}] ${this.actual.constructor.name} - ${this.actual}`;
    }
}
var RemovedResourceReason;
(function (RemovedResourceReason) {
    RemovedResourceReason[RemovedResourceReason["ExternalRemoval"] = 0] = "ExternalRemoval";
    RemovedResourceReason[RemovedResourceReason["NoParallelUniverses"] = 1] = "NoParallelUniverses";
})(RemovedResourceReason || (RemovedResourceReason = {}));
class ResourceReasonPair {
    constructor(resourceLabel, reason) {
        this.resourceLabel = resourceLabel;
        this.reason = reason;
    }
}
class RemovedResources {
    constructor() {
        this.elements = new Map();
    }
    createMessage() {
        const externalRemoval = [];
        const noParallelUniverses = [];
        for (const [, element] of this.elements) {
            const dest = (element.reason === 0 /* RemovedResourceReason.ExternalRemoval */
                ? externalRemoval
                : noParallelUniverses);
            dest.push(element.resourceLabel);
        }
        const messages = [];
        if (externalRemoval.length > 0) {
            messages.push(nls.localize({ key: 'externalRemoval', comment: ['{0} is a list of filenames'] }, "The following files have been closed and modified on disk: {0}.", externalRemoval.join(', ')));
        }
        if (noParallelUniverses.length > 0) {
            messages.push(nls.localize({ key: 'noParallelUniverses', comment: ['{0} is a list of filenames'] }, "The following files have been modified in an incompatible way: {0}.", noParallelUniverses.join(', ')));
        }
        return messages.join('\n');
    }
    get size() {
        return this.elements.size;
    }
    has(strResource) {
        return this.elements.has(strResource);
    }
    set(strResource, value) {
        this.elements.set(strResource, value);
    }
    delete(strResource) {
        return this.elements.delete(strResource);
    }
}
class WorkspaceStackElement {
    constructor(actual, resourceLabels, strResources, groupId, groupOrder, sourceId, sourceOrder) {
        this.id = (++stackElementCounter);
        this.type = 1 /* UndoRedoElementType.Workspace */;
        this.actual = actual;
        this.label = actual.label;
        this.confirmBeforeUndo = actual.confirmBeforeUndo || false;
        this.resourceLabels = resourceLabels;
        this.strResources = strResources;
        this.groupId = groupId;
        this.groupOrder = groupOrder;
        this.sourceId = sourceId;
        this.sourceOrder = sourceOrder;
        this.removedResources = null;
        this.invalidatedResources = null;
    }
    canSplit() {
        return (typeof this.actual.split === 'function');
    }
    removeResource(resourceLabel, strResource, reason) {
        if (!this.removedResources) {
            this.removedResources = new RemovedResources();
        }
        if (!this.removedResources.has(strResource)) {
            this.removedResources.set(strResource, new ResourceReasonPair(resourceLabel, reason));
        }
    }
    setValid(resourceLabel, strResource, isValid) {
        if (isValid) {
            if (this.invalidatedResources) {
                this.invalidatedResources.delete(strResource);
                if (this.invalidatedResources.size === 0) {
                    this.invalidatedResources = null;
                }
            }
        }
        else {
            if (!this.invalidatedResources) {
                this.invalidatedResources = new RemovedResources();
            }
            if (!this.invalidatedResources.has(strResource)) {
                this.invalidatedResources.set(strResource, new ResourceReasonPair(resourceLabel, 0 /* RemovedResourceReason.ExternalRemoval */));
            }
        }
    }
    toString() {
        return `[id:${this.id}] [group:${this.groupId}] [${this.invalidatedResources ? 'INVALID' : '  VALID'}] ${this.actual.constructor.name} - ${this.actual}`;
    }
}
class ResourceEditStack {
    constructor(resourceLabel, strResource) {
        this.resourceLabel = resourceLabel;
        this.strResource = strResource;
        this._past = [];
        this._future = [];
        this.locked = false;
        this.versionId = 1;
    }
    dispose() {
        for (const element of this._past) {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.removeResource(this.resourceLabel, this.strResource, 0 /* RemovedResourceReason.ExternalRemoval */);
            }
        }
        for (const element of this._future) {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.removeResource(this.resourceLabel, this.strResource, 0 /* RemovedResourceReason.ExternalRemoval */);
            }
        }
        this.versionId++;
    }
    toString() {
        const result = [];
        result.push(`* ${this.strResource}:`);
        for (let i = 0; i < this._past.length; i++) {
            result.push(`   * [UNDO] ${this._past[i]}`);
        }
        for (let i = this._future.length - 1; i >= 0; i--) {
            result.push(`   * [REDO] ${this._future[i]}`);
        }
        return result.join('\n');
    }
    flushAllElements() {
        this._past = [];
        this._future = [];
        this.versionId++;
    }
    setElementsIsValid(isValid) {
        for (const element of this._past) {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.setValid(this.resourceLabel, this.strResource, isValid);
            }
            else {
                element.setValid(isValid);
            }
        }
        for (const element of this._future) {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.setValid(this.resourceLabel, this.strResource, isValid);
            }
            else {
                element.setValid(isValid);
            }
        }
    }
    _setElementValidFlag(element, isValid) {
        if (element.type === 1 /* UndoRedoElementType.Workspace */) {
            element.setValid(this.resourceLabel, this.strResource, isValid);
        }
        else {
            element.setValid(isValid);
        }
    }
    setElementsValidFlag(isValid, filter) {
        for (const element of this._past) {
            if (filter(element.actual)) {
                this._setElementValidFlag(element, isValid);
            }
        }
        for (const element of this._future) {
            if (filter(element.actual)) {
                this._setElementValidFlag(element, isValid);
            }
        }
    }
    pushElement(element) {
        // remove the future
        for (const futureElement of this._future) {
            if (futureElement.type === 1 /* UndoRedoElementType.Workspace */) {
                futureElement.removeResource(this.resourceLabel, this.strResource, 1 /* RemovedResourceReason.NoParallelUniverses */);
            }
        }
        this._future = [];
        this._past.push(element);
        this.versionId++;
    }
    createSnapshot(resource) {
        const elements = [];
        for (let i = 0, len = this._past.length; i < len; i++) {
            elements.push(this._past[i].id);
        }
        for (let i = this._future.length - 1; i >= 0; i--) {
            elements.push(this._future[i].id);
        }
        return new ResourceEditStackSnapshot(resource, elements);
    }
    restoreSnapshot(snapshot) {
        const snapshotLength = snapshot.elements.length;
        let isOK = true;
        let snapshotIndex = 0;
        let removePastAfter = -1;
        for (let i = 0, len = this._past.length; i < len; i++, snapshotIndex++) {
            const element = this._past[i];
            if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
                isOK = false;
                removePastAfter = i;
            }
            if (!isOK && element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.removeResource(this.resourceLabel, this.strResource, 0 /* RemovedResourceReason.ExternalRemoval */);
            }
        }
        let removeFutureBefore = -1;
        for (let i = this._future.length - 1; i >= 0; i--, snapshotIndex++) {
            const element = this._future[i];
            if (isOK && (snapshotIndex >= snapshotLength || element.id !== snapshot.elements[snapshotIndex])) {
                isOK = false;
                removeFutureBefore = i;
            }
            if (!isOK && element.type === 1 /* UndoRedoElementType.Workspace */) {
                element.removeResource(this.resourceLabel, this.strResource, 0 /* RemovedResourceReason.ExternalRemoval */);
            }
        }
        if (removePastAfter !== -1) {
            this._past = this._past.slice(0, removePastAfter);
        }
        if (removeFutureBefore !== -1) {
            this._future = this._future.slice(removeFutureBefore + 1);
        }
        this.versionId++;
    }
    getElements() {
        const past = [];
        const future = [];
        for (const element of this._past) {
            past.push(element.actual);
        }
        for (const element of this._future) {
            future.push(element.actual);
        }
        return { past, future };
    }
    getClosestPastElement() {
        if (this._past.length === 0) {
            return null;
        }
        return this._past[this._past.length - 1];
    }
    getSecondClosestPastElement() {
        if (this._past.length < 2) {
            return null;
        }
        return this._past[this._past.length - 2];
    }
    getClosestFutureElement() {
        if (this._future.length === 0) {
            return null;
        }
        return this._future[this._future.length - 1];
    }
    hasPastElements() {
        return (this._past.length > 0);
    }
    hasFutureElements() {
        return (this._future.length > 0);
    }
    splitPastWorkspaceElement(toRemove, individualMap) {
        for (let j = this._past.length - 1; j >= 0; j--) {
            if (this._past[j] === toRemove) {
                if (individualMap.has(this.strResource)) {
                    // gets replaced
                    this._past[j] = individualMap.get(this.strResource);
                }
                else {
                    // gets deleted
                    this._past.splice(j, 1);
                }
                break;
            }
        }
        this.versionId++;
    }
    splitFutureWorkspaceElement(toRemove, individualMap) {
        for (let j = this._future.length - 1; j >= 0; j--) {
            if (this._future[j] === toRemove) {
                if (individualMap.has(this.strResource)) {
                    // gets replaced
                    this._future[j] = individualMap.get(this.strResource);
                }
                else {
                    // gets deleted
                    this._future.splice(j, 1);
                }
                break;
            }
        }
        this.versionId++;
    }
    moveBackward(element) {
        this._past.pop();
        this._future.push(element);
        this.versionId++;
    }
    moveForward(element) {
        this._future.pop();
        this._past.push(element);
        this.versionId++;
    }
}
class EditStackSnapshot {
    constructor(editStacks) {
        this.editStacks = editStacks;
        this._versionIds = [];
        for (let i = 0, len = this.editStacks.length; i < len; i++) {
            this._versionIds[i] = this.editStacks[i].versionId;
        }
    }
    isValid() {
        for (let i = 0, len = this.editStacks.length; i < len; i++) {
            if (this._versionIds[i] !== this.editStacks[i].versionId) {
                return false;
            }
        }
        return true;
    }
}
const missingEditStack = new ResourceEditStack('', '');
missingEditStack.locked = true;
let UndoRedoService = class UndoRedoService {
    constructor(_dialogService, _notificationService) {
        this._dialogService = _dialogService;
        this._notificationService = _notificationService;
        this._editStacks = new Map();
        this._uriComparisonKeyComputers = [];
    }
    registerUriComparisonKeyComputer(scheme, uriComparisonKeyComputer) {
        this._uriComparisonKeyComputers.push([scheme, uriComparisonKeyComputer]);
        return {
            dispose: () => {
                for (let i = 0, len = this._uriComparisonKeyComputers.length; i < len; i++) {
                    if (this._uriComparisonKeyComputers[i][1] === uriComparisonKeyComputer) {
                        this._uriComparisonKeyComputers.splice(i, 1);
                        return;
                    }
                }
            }
        };
    }
    getUriComparisonKey(resource) {
        for (const uriComparisonKeyComputer of this._uriComparisonKeyComputers) {
            if (uriComparisonKeyComputer[0] === resource.scheme) {
                return uriComparisonKeyComputer[1].getComparisonKey(resource);
            }
        }
        return resource.toString();
    }
    _print(label) {
        console.log(`------------------------------------`);
        console.log(`AFTER ${label}: `);
        const str = [];
        for (const element of this._editStacks) {
            str.push(element[1].toString());
        }
        console.log(str.join('\n'));
    }
    pushElement(element, group = UndoRedoGroup.None, source = UndoRedoSource.None) {
        if (element.type === 0 /* UndoRedoElementType.Resource */) {
            const resourceLabel = getResourceLabel(element.resource);
            const strResource = this.getUriComparisonKey(element.resource);
            this._pushElement(new ResourceStackElement(element, resourceLabel, strResource, group.id, group.nextOrder(), source.id, source.nextOrder()));
        }
        else {
            const seen = new Set();
            const resourceLabels = [];
            const strResources = [];
            for (const resource of element.resources) {
                const resourceLabel = getResourceLabel(resource);
                const strResource = this.getUriComparisonKey(resource);
                if (seen.has(strResource)) {
                    continue;
                }
                seen.add(strResource);
                resourceLabels.push(resourceLabel);
                strResources.push(strResource);
            }
            if (resourceLabels.length === 1) {
                this._pushElement(new ResourceStackElement(element, resourceLabels[0], strResources[0], group.id, group.nextOrder(), source.id, source.nextOrder()));
            }
            else {
                this._pushElement(new WorkspaceStackElement(element, resourceLabels, strResources, group.id, group.nextOrder(), source.id, source.nextOrder()));
            }
        }
        if (DEBUG) {
            this._print('pushElement');
        }
    }
    _pushElement(element) {
        for (let i = 0, len = element.strResources.length; i < len; i++) {
            const resourceLabel = element.resourceLabels[i];
            const strResource = element.strResources[i];
            let editStack;
            if (this._editStacks.has(strResource)) {
                editStack = this._editStacks.get(strResource);
            }
            else {
                editStack = new ResourceEditStack(resourceLabel, strResource);
                this._editStacks.set(strResource, editStack);
            }
            editStack.pushElement(element);
        }
    }
    getLastElement(resource) {
        const strResource = this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            if (editStack.hasFutureElements()) {
                return null;
            }
            const closestPastElement = editStack.getClosestPastElement();
            return closestPastElement ? closestPastElement.actual : null;
        }
        return null;
    }
    _splitPastWorkspaceElement(toRemove, ignoreResources) {
        const individualArr = toRemove.actual.split();
        const individualMap = new Map();
        for (const _element of individualArr) {
            const resourceLabel = getResourceLabel(_element.resource);
            const strResource = this.getUriComparisonKey(_element.resource);
            const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
            individualMap.set(element.strResource, element);
        }
        for (const strResource of toRemove.strResources) {
            if (ignoreResources && ignoreResources.has(strResource)) {
                continue;
            }
            const editStack = this._editStacks.get(strResource);
            editStack.splitPastWorkspaceElement(toRemove, individualMap);
        }
    }
    _splitFutureWorkspaceElement(toRemove, ignoreResources) {
        const individualArr = toRemove.actual.split();
        const individualMap = new Map();
        for (const _element of individualArr) {
            const resourceLabel = getResourceLabel(_element.resource);
            const strResource = this.getUriComparisonKey(_element.resource);
            const element = new ResourceStackElement(_element, resourceLabel, strResource, 0, 0, 0, 0);
            individualMap.set(element.strResource, element);
        }
        for (const strResource of toRemove.strResources) {
            if (ignoreResources && ignoreResources.has(strResource)) {
                continue;
            }
            const editStack = this._editStacks.get(strResource);
            editStack.splitFutureWorkspaceElement(toRemove, individualMap);
        }
    }
    removeElements(resource) {
        const strResource = typeof resource === 'string' ? resource : this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            editStack.dispose();
            this._editStacks.delete(strResource);
        }
        if (DEBUG) {
            this._print('removeElements');
        }
    }
    setElementsValidFlag(resource, isValid, filter) {
        const strResource = this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            editStack.setElementsValidFlag(isValid, filter);
        }
        if (DEBUG) {
            this._print('setElementsValidFlag');
        }
    }
    hasElements(resource) {
        const strResource = this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            return (editStack.hasPastElements() || editStack.hasFutureElements());
        }
        return false;
    }
    createSnapshot(resource) {
        const strResource = this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            return editStack.createSnapshot(resource);
        }
        return new ResourceEditStackSnapshot(resource, []);
    }
    restoreSnapshot(snapshot) {
        const strResource = this.getUriComparisonKey(snapshot.resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            editStack.restoreSnapshot(snapshot);
            if (!editStack.hasPastElements() && !editStack.hasFutureElements()) {
                // the edit stack is now empty, just remove it entirely
                editStack.dispose();
                this._editStacks.delete(strResource);
            }
        }
        if (DEBUG) {
            this._print('restoreSnapshot');
        }
    }
    getElements(resource) {
        const strResource = this.getUriComparisonKey(resource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            return editStack.getElements();
        }
        return { past: [], future: [] };
    }
    _findClosestUndoElementWithSource(sourceId) {
        if (!sourceId) {
            return [null, null];
        }
        // find an element with the sourceId and with the highest sourceOrder ready to be undone
        let matchedElement = null;
        let matchedStrResource = null;
        for (const [strResource, editStack] of this._editStacks) {
            const candidate = editStack.getClosestPastElement();
            if (!candidate) {
                continue;
            }
            if (candidate.sourceId === sourceId) {
                if (!matchedElement || candidate.sourceOrder > matchedElement.sourceOrder) {
                    matchedElement = candidate;
                    matchedStrResource = strResource;
                }
            }
        }
        return [matchedElement, matchedStrResource];
    }
    canUndo(resourceOrSource) {
        if (resourceOrSource instanceof UndoRedoSource) {
            const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
            return matchedStrResource ? true : false;
        }
        const strResource = this.getUriComparisonKey(resourceOrSource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            return editStack.hasPastElements();
        }
        return false;
    }
    _onError(err, element) {
        onUnexpectedError(err);
        // An error occurred while undoing or redoing => drop the undo/redo stack for all affected resources
        for (const strResource of element.strResources) {
            this.removeElements(strResource);
        }
        this._notificationService.error(err);
    }
    _acquireLocks(editStackSnapshot) {
        // first, check if all locks can be acquired
        for (const editStack of editStackSnapshot.editStacks) {
            if (editStack.locked) {
                throw new Error('Cannot acquire edit stack lock');
            }
        }
        // can acquire all locks
        for (const editStack of editStackSnapshot.editStacks) {
            editStack.locked = true;
        }
        return () => {
            // release all locks
            for (const editStack of editStackSnapshot.editStacks) {
                editStack.locked = false;
            }
        };
    }
    _safeInvokeWithLocks(element, invoke, editStackSnapshot, cleanup, continuation) {
        const releaseLocks = this._acquireLocks(editStackSnapshot);
        let result;
        try {
            result = invoke();
        }
        catch (err) {
            releaseLocks();
            cleanup.dispose();
            return this._onError(err, element);
        }
        if (result) {
            // result is Promise<void>
            return result.then(() => {
                releaseLocks();
                cleanup.dispose();
                return continuation();
            }, (err) => {
                releaseLocks();
                cleanup.dispose();
                return this._onError(err, element);
            });
        }
        else {
            // result is void
            releaseLocks();
            cleanup.dispose();
            return continuation();
        }
    }
    async _invokeWorkspacePrepare(element) {
        if (typeof element.actual.prepareUndoRedo === 'undefined') {
            return Disposable.None;
        }
        const result = element.actual.prepareUndoRedo();
        if (typeof result === 'undefined') {
            return Disposable.None;
        }
        return result;
    }
    _invokeResourcePrepare(element, callback) {
        if (element.actual.type !== 1 /* UndoRedoElementType.Workspace */ || typeof element.actual.prepareUndoRedo === 'undefined') {
            // no preparation needed
            return callback(Disposable.None);
        }
        const r = element.actual.prepareUndoRedo();
        if (!r) {
            // nothing to clean up
            return callback(Disposable.None);
        }
        if (isDisposable(r)) {
            return callback(r);
        }
        return r.then((disposable) => {
            return callback(disposable);
        });
    }
    _getAffectedEditStacks(element) {
        const affectedEditStacks = [];
        for (const strResource of element.strResources) {
            affectedEditStacks.push(this._editStacks.get(strResource) || missingEditStack);
        }
        return new EditStackSnapshot(affectedEditStacks);
    }
    _tryToSplitAndUndo(strResource, element, ignoreResources, message) {
        if (element.canSplit()) {
            this._splitPastWorkspaceElement(element, ignoreResources);
            this._notificationService.warn(message);
            return new WorkspaceVerificationError(this._undo(strResource, 0, true));
        }
        else {
            // Cannot safely split this workspace element => flush all undo/redo stacks
            for (const strResource of element.strResources) {
                this.removeElements(strResource);
            }
            this._notificationService.warn(message);
            return new WorkspaceVerificationError();
        }
    }
    _checkWorkspaceUndo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
        if (element.removedResources) {
            return this._tryToSplitAndUndo(strResource, element, element.removedResources, nls.localize({ key: 'cannotWorkspaceUndo', comment: ['{0} is a label for an operation. {1} is another message.'] }, "Could not undo '{0}' across all files. {1}", element.label, element.removedResources.createMessage()));
        }
        if (checkInvalidatedResources && element.invalidatedResources) {
            return this._tryToSplitAndUndo(strResource, element, element.invalidatedResources, nls.localize({ key: 'cannotWorkspaceUndo', comment: ['{0} is a label for an operation. {1} is another message.'] }, "Could not undo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage()));
        }
        // this must be the last past element in all the impacted resources!
        const cannotUndoDueToResources = [];
        for (const editStack of editStackSnapshot.editStacks) {
            if (editStack.getClosestPastElement() !== element) {
                cannotUndoDueToResources.push(editStack.resourceLabel);
            }
        }
        if (cannotUndoDueToResources.length > 0) {
            return this._tryToSplitAndUndo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceUndoDueToChanges', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not undo '{0}' across all files because changes were made to {1}", element.label, cannotUndoDueToResources.join(', ')));
        }
        const cannotLockDueToResources = [];
        for (const editStack of editStackSnapshot.editStacks) {
            if (editStack.locked) {
                cannotLockDueToResources.push(editStack.resourceLabel);
            }
        }
        if (cannotLockDueToResources.length > 0) {
            return this._tryToSplitAndUndo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceUndoDueToInProgressUndoRedo', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not undo '{0}' across all files because there is already an undo or redo operation running on {1}", element.label, cannotLockDueToResources.join(', ')));
        }
        // check if new stack elements were added in the meantime...
        if (!editStackSnapshot.isValid()) {
            return this._tryToSplitAndUndo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceUndoDueToInMeantimeUndoRedo', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not undo '{0}' across all files because an undo or redo operation occurred in the meantime", element.label));
        }
        return null;
    }
    _workspaceUndo(strResource, element, undoConfirmed) {
        const affectedEditStacks = this._getAffectedEditStacks(element);
        const verificationError = this._checkWorkspaceUndo(strResource, element, affectedEditStacks, /*invalidated resources will be checked after the prepare call*/ false);
        if (verificationError) {
            return verificationError.returnValue;
        }
        return this._confirmAndExecuteWorkspaceUndo(strResource, element, affectedEditStacks, undoConfirmed);
    }
    _isPartOfUndoGroup(element) {
        if (!element.groupId) {
            return false;
        }
        // check that there is at least another element with the same groupId ready to be undone
        for (const [, editStack] of this._editStacks) {
            const pastElement = editStack.getClosestPastElement();
            if (!pastElement) {
                continue;
            }
            if (pastElement === element) {
                const secondPastElement = editStack.getSecondClosestPastElement();
                if (secondPastElement && secondPastElement.groupId === element.groupId) {
                    // there is another element with the same group id in the same stack!
                    return true;
                }
            }
            if (pastElement.groupId === element.groupId) {
                // there is another element with the same group id in another stack!
                return true;
            }
        }
        return false;
    }
    async _confirmAndExecuteWorkspaceUndo(strResource, element, editStackSnapshot, undoConfirmed) {
        if (element.canSplit() && !this._isPartOfUndoGroup(element)) {
            // this element can be split
            let UndoChoice;
            (function (UndoChoice) {
                UndoChoice[UndoChoice["All"] = 0] = "All";
                UndoChoice[UndoChoice["This"] = 1] = "This";
                UndoChoice[UndoChoice["Cancel"] = 2] = "Cancel";
            })(UndoChoice || (UndoChoice = {}));
            const { result } = await this._dialogService.prompt({
                type: Severity.Info,
                message: nls.localize('confirmWorkspace', "Would you like to undo '{0}' across all files?", element.label),
                buttons: [
                    {
                        label: nls.localize({ key: 'ok', comment: ['{0} denotes a number that is > 1, && denotes a mnemonic'] }, "&&Undo in {0} Files", editStackSnapshot.editStacks.length),
                        run: () => UndoChoice.All
                    },
                    {
                        label: nls.localize({ key: 'nok', comment: ['&& denotes a mnemonic'] }, "Undo this &&File"),
                        run: () => UndoChoice.This
                    }
                ],
                cancelButton: {
                    run: () => UndoChoice.Cancel
                }
            });
            if (result === UndoChoice.Cancel) {
                // choice: cancel
                return;
            }
            if (result === UndoChoice.This) {
                // choice: undo this file
                this._splitPastWorkspaceElement(element, null);
                return this._undo(strResource, 0, true);
            }
            // choice: undo in all files
            // At this point, it is possible that the element has been made invalid in the meantime (due to the confirmation await)
            const verificationError1 = this._checkWorkspaceUndo(strResource, element, editStackSnapshot, /*invalidated resources will be checked after the prepare call*/ false);
            if (verificationError1) {
                return verificationError1.returnValue;
            }
            undoConfirmed = true;
        }
        // prepare
        let cleanup;
        try {
            cleanup = await this._invokeWorkspacePrepare(element);
        }
        catch (err) {
            return this._onError(err, element);
        }
        // At this point, it is possible that the element has been made invalid in the meantime (due to the prepare await)
        const verificationError2 = this._checkWorkspaceUndo(strResource, element, editStackSnapshot, /*now also check that there are no more invalidated resources*/ true);
        if (verificationError2) {
            cleanup.dispose();
            return verificationError2.returnValue;
        }
        for (const editStack of editStackSnapshot.editStacks) {
            editStack.moveBackward(element);
        }
        return this._safeInvokeWithLocks(element, () => element.actual.undo(), editStackSnapshot, cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
    }
    _resourceUndo(editStack, element, undoConfirmed) {
        if (!element.isValid) {
            // invalid element => immediately flush edit stack!
            editStack.flushAllElements();
            return;
        }
        if (editStack.locked) {
            const message = nls.localize({ key: 'cannotResourceUndoDueToInProgressUndoRedo', comment: ['{0} is a label for an operation.'] }, "Could not undo '{0}' because there is already an undo or redo operation running.", element.label);
            this._notificationService.warn(message);
            return;
        }
        return this._invokeResourcePrepare(element, (cleanup) => {
            editStack.moveBackward(element);
            return this._safeInvokeWithLocks(element, () => element.actual.undo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueUndoInGroup(element.groupId, undoConfirmed));
        });
    }
    _findClosestUndoElementInGroup(groupId) {
        if (!groupId) {
            return [null, null];
        }
        // find another element with the same groupId and with the highest groupOrder ready to be undone
        let matchedElement = null;
        let matchedStrResource = null;
        for (const [strResource, editStack] of this._editStacks) {
            const candidate = editStack.getClosestPastElement();
            if (!candidate) {
                continue;
            }
            if (candidate.groupId === groupId) {
                if (!matchedElement || candidate.groupOrder > matchedElement.groupOrder) {
                    matchedElement = candidate;
                    matchedStrResource = strResource;
                }
            }
        }
        return [matchedElement, matchedStrResource];
    }
    _continueUndoInGroup(groupId, undoConfirmed) {
        if (!groupId) {
            return;
        }
        const [, matchedStrResource] = this._findClosestUndoElementInGroup(groupId);
        if (matchedStrResource) {
            return this._undo(matchedStrResource, 0, undoConfirmed);
        }
    }
    undo(resourceOrSource) {
        if (resourceOrSource instanceof UndoRedoSource) {
            const [, matchedStrResource] = this._findClosestUndoElementWithSource(resourceOrSource.id);
            return matchedStrResource ? this._undo(matchedStrResource, resourceOrSource.id, false) : undefined;
        }
        if (typeof resourceOrSource === 'string') {
            return this._undo(resourceOrSource, 0, false);
        }
        return this._undo(this.getUriComparisonKey(resourceOrSource), 0, false);
    }
    _undo(strResource, sourceId = 0, undoConfirmed) {
        if (!this._editStacks.has(strResource)) {
            return;
        }
        const editStack = this._editStacks.get(strResource);
        const element = editStack.getClosestPastElement();
        if (!element) {
            return;
        }
        if (element.groupId) {
            // this element is a part of a group, we need to make sure undoing in a group is in order
            const [matchedElement, matchedStrResource] = this._findClosestUndoElementInGroup(element.groupId);
            if (element !== matchedElement && matchedStrResource) {
                // there is an element in the same group that should be undone before this one
                return this._undo(matchedStrResource, sourceId, undoConfirmed);
            }
        }
        const shouldPromptForConfirmation = (element.sourceId !== sourceId || element.confirmBeforeUndo);
        if (shouldPromptForConfirmation && !undoConfirmed) {
            // Hit a different source or the element asks for prompt before undo, prompt for confirmation
            return this._confirmAndContinueUndo(strResource, sourceId, element);
        }
        try {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                return this._workspaceUndo(strResource, element, undoConfirmed);
            }
            else {
                return this._resourceUndo(editStack, element, undoConfirmed);
            }
        }
        finally {
            if (DEBUG) {
                this._print('undo');
            }
        }
    }
    async _confirmAndContinueUndo(strResource, sourceId, element) {
        const result = await this._dialogService.confirm({
            message: nls.localize('confirmDifferentSource', "Would you like to undo '{0}'?", element.label),
            primaryButton: nls.localize({ key: 'confirmDifferentSource.yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
            cancelButton: nls.localize('confirmDifferentSource.no', "No")
        });
        if (!result.confirmed) {
            return;
        }
        return this._undo(strResource, sourceId, true);
    }
    _findClosestRedoElementWithSource(sourceId) {
        if (!sourceId) {
            return [null, null];
        }
        // find an element with sourceId and with the lowest sourceOrder ready to be redone
        let matchedElement = null;
        let matchedStrResource = null;
        for (const [strResource, editStack] of this._editStacks) {
            const candidate = editStack.getClosestFutureElement();
            if (!candidate) {
                continue;
            }
            if (candidate.sourceId === sourceId) {
                if (!matchedElement || candidate.sourceOrder < matchedElement.sourceOrder) {
                    matchedElement = candidate;
                    matchedStrResource = strResource;
                }
            }
        }
        return [matchedElement, matchedStrResource];
    }
    canRedo(resourceOrSource) {
        if (resourceOrSource instanceof UndoRedoSource) {
            const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
            return matchedStrResource ? true : false;
        }
        const strResource = this.getUriComparisonKey(resourceOrSource);
        if (this._editStacks.has(strResource)) {
            const editStack = this._editStacks.get(strResource);
            return editStack.hasFutureElements();
        }
        return false;
    }
    _tryToSplitAndRedo(strResource, element, ignoreResources, message) {
        if (element.canSplit()) {
            this._splitFutureWorkspaceElement(element, ignoreResources);
            this._notificationService.warn(message);
            return new WorkspaceVerificationError(this._redo(strResource));
        }
        else {
            // Cannot safely split this workspace element => flush all undo/redo stacks
            for (const strResource of element.strResources) {
                this.removeElements(strResource);
            }
            this._notificationService.warn(message);
            return new WorkspaceVerificationError();
        }
    }
    _checkWorkspaceRedo(strResource, element, editStackSnapshot, checkInvalidatedResources) {
        if (element.removedResources) {
            return this._tryToSplitAndRedo(strResource, element, element.removedResources, nls.localize({ key: 'cannotWorkspaceRedo', comment: ['{0} is a label for an operation. {1} is another message.'] }, "Could not redo '{0}' across all files. {1}", element.label, element.removedResources.createMessage()));
        }
        if (checkInvalidatedResources && element.invalidatedResources) {
            return this._tryToSplitAndRedo(strResource, element, element.invalidatedResources, nls.localize({ key: 'cannotWorkspaceRedo', comment: ['{0} is a label for an operation. {1} is another message.'] }, "Could not redo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage()));
        }
        // this must be the last future element in all the impacted resources!
        const cannotRedoDueToResources = [];
        for (const editStack of editStackSnapshot.editStacks) {
            if (editStack.getClosestFutureElement() !== element) {
                cannotRedoDueToResources.push(editStack.resourceLabel);
            }
        }
        if (cannotRedoDueToResources.length > 0) {
            return this._tryToSplitAndRedo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceRedoDueToChanges', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not redo '{0}' across all files because changes were made to {1}", element.label, cannotRedoDueToResources.join(', ')));
        }
        const cannotLockDueToResources = [];
        for (const editStack of editStackSnapshot.editStacks) {
            if (editStack.locked) {
                cannotLockDueToResources.push(editStack.resourceLabel);
            }
        }
        if (cannotLockDueToResources.length > 0) {
            return this._tryToSplitAndRedo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceRedoDueToInProgressUndoRedo', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not redo '{0}' across all files because there is already an undo or redo operation running on {1}", element.label, cannotLockDueToResources.join(', ')));
        }
        // check if new stack elements were added in the meantime...
        if (!editStackSnapshot.isValid()) {
            return this._tryToSplitAndRedo(strResource, element, null, nls.localize({ key: 'cannotWorkspaceRedoDueToInMeantimeUndoRedo', comment: ['{0} is a label for an operation. {1} is a list of filenames.'] }, "Could not redo '{0}' across all files because an undo or redo operation occurred in the meantime", element.label));
        }
        return null;
    }
    _workspaceRedo(strResource, element) {
        const affectedEditStacks = this._getAffectedEditStacks(element);
        const verificationError = this._checkWorkspaceRedo(strResource, element, affectedEditStacks, /*invalidated resources will be checked after the prepare call*/ false);
        if (verificationError) {
            return verificationError.returnValue;
        }
        return this._executeWorkspaceRedo(strResource, element, affectedEditStacks);
    }
    async _executeWorkspaceRedo(strResource, element, editStackSnapshot) {
        // prepare
        let cleanup;
        try {
            cleanup = await this._invokeWorkspacePrepare(element);
        }
        catch (err) {
            return this._onError(err, element);
        }
        // At this point, it is possible that the element has been made invalid in the meantime (due to the prepare await)
        const verificationError = this._checkWorkspaceRedo(strResource, element, editStackSnapshot, /*now also check that there are no more invalidated resources*/ true);
        if (verificationError) {
            cleanup.dispose();
            return verificationError.returnValue;
        }
        for (const editStack of editStackSnapshot.editStacks) {
            editStack.moveForward(element);
        }
        return this._safeInvokeWithLocks(element, () => element.actual.redo(), editStackSnapshot, cleanup, () => this._continueRedoInGroup(element.groupId));
    }
    _resourceRedo(editStack, element) {
        if (!element.isValid) {
            // invalid element => immediately flush edit stack!
            editStack.flushAllElements();
            return;
        }
        if (editStack.locked) {
            const message = nls.localize({ key: 'cannotResourceRedoDueToInProgressUndoRedo', comment: ['{0} is a label for an operation.'] }, "Could not redo '{0}' because there is already an undo or redo operation running.", element.label);
            this._notificationService.warn(message);
            return;
        }
        return this._invokeResourcePrepare(element, (cleanup) => {
            editStack.moveForward(element);
            return this._safeInvokeWithLocks(element, () => element.actual.redo(), new EditStackSnapshot([editStack]), cleanup, () => this._continueRedoInGroup(element.groupId));
        });
    }
    _findClosestRedoElementInGroup(groupId) {
        if (!groupId) {
            return [null, null];
        }
        // find another element with the same groupId and with the lowest groupOrder ready to be redone
        let matchedElement = null;
        let matchedStrResource = null;
        for (const [strResource, editStack] of this._editStacks) {
            const candidate = editStack.getClosestFutureElement();
            if (!candidate) {
                continue;
            }
            if (candidate.groupId === groupId) {
                if (!matchedElement || candidate.groupOrder < matchedElement.groupOrder) {
                    matchedElement = candidate;
                    matchedStrResource = strResource;
                }
            }
        }
        return [matchedElement, matchedStrResource];
    }
    _continueRedoInGroup(groupId) {
        if (!groupId) {
            return;
        }
        const [, matchedStrResource] = this._findClosestRedoElementInGroup(groupId);
        if (matchedStrResource) {
            return this._redo(matchedStrResource);
        }
    }
    redo(resourceOrSource) {
        if (resourceOrSource instanceof UndoRedoSource) {
            const [, matchedStrResource] = this._findClosestRedoElementWithSource(resourceOrSource.id);
            return matchedStrResource ? this._redo(matchedStrResource) : undefined;
        }
        if (typeof resourceOrSource === 'string') {
            return this._redo(resourceOrSource);
        }
        return this._redo(this.getUriComparisonKey(resourceOrSource));
    }
    _redo(strResource) {
        if (!this._editStacks.has(strResource)) {
            return;
        }
        const editStack = this._editStacks.get(strResource);
        const element = editStack.getClosestFutureElement();
        if (!element) {
            return;
        }
        if (element.groupId) {
            // this element is a part of a group, we need to make sure redoing in a group is in order
            const [matchedElement, matchedStrResource] = this._findClosestRedoElementInGroup(element.groupId);
            if (element !== matchedElement && matchedStrResource) {
                // there is an element in the same group that should be redone before this one
                return this._redo(matchedStrResource);
            }
        }
        try {
            if (element.type === 1 /* UndoRedoElementType.Workspace */) {
                return this._workspaceRedo(strResource, element);
            }
            else {
                return this._resourceRedo(editStack, element);
            }
        }
        finally {
            if (DEBUG) {
                this._print('redo');
            }
        }
    }
};
UndoRedoService = __decorate([
    __param(0, IDialogService),
    __param(1, INotificationService)
], UndoRedoService);
export { UndoRedoService };
class WorkspaceVerificationError {
    constructor(returnValue) {
        this.returnValue = returnValue;
    }
}
registerSingleton(IUndoRedoService, UndoRedoService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5kb1JlZG9TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUV4RCxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDakYsT0FBTyxFQUFtRSxnQkFBZ0IsRUFBNkIseUJBQXlCLEVBQXVCLGFBQWEsRUFBRSxjQUFjLEVBQTRCLE1BQU0sZUFBZSxDQUFDO0FBRXRQLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQztBQUVwQixTQUFTLGdCQUFnQixDQUFDLFFBQWE7SUFDdEMsT0FBTyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7QUFDM0UsQ0FBQztBQUVELElBQUksbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBRTVCLE1BQU0sb0JBQW9CO0lBaUJ6QixZQUFZLE1BQXdCLEVBQUUsYUFBcUIsRUFBRSxXQUFtQixF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