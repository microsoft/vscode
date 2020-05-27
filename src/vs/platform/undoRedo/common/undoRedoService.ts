/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IUndoRedoService, IResourceUndoRedoElement, IWorkspaceUndoRedoElement, UndoRedoElementType, IUndoRedoElement, IPastFutureElements } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';

function uriGetComparisonKey(resource: URI): string {
	return resource.toString();
}

class ResourceStackElement {
	public readonly type = UndoRedoElementType.Resource;
	public readonly actual: IResourceUndoRedoElement;
	public readonly label: string;

	public readonly resource: URI;
	public readonly strResource: string;
	public readonly resources: URI[];
	public readonly strResources: string[];
	public isValid: boolean;

	constructor(actual: IResourceUndoRedoElement) {
		this.actual = actual;
		this.label = actual.label;
		this.resource = actual.resource;
		this.strResource = uriGetComparisonKey(this.resource);
		this.resources = [this.resource];
		this.strResources = [this.strResource];
		this.isValid = true;
	}

	public setValid(isValid: boolean): void {
		this.isValid = isValid;
	}
}

const enum RemovedResourceReason {
	ExternalRemoval = 0,
	NoParallelUniverses = 1
}

class ResourceReasonPair {
	constructor(
		public readonly resource: URI,
		public readonly reason: RemovedResourceReason
	) { }
}

class RemovedResources {
	private readonly elements = new Map<string, ResourceReasonPair>();

	private _getPath(resource: URI): string {
		return resource.scheme === Schemas.file ? resource.fsPath : resource.path;
	}

	public createMessage(): string {
		const externalRemoval: string[] = [];
		const noParallelUniverses: string[] = [];
		for (const [, element] of this.elements) {
			const dest = (
				element.reason === RemovedResourceReason.ExternalRemoval
					? externalRemoval
					: noParallelUniverses
			);
			dest.push(this._getPath(element.resource));
		}

		let messages: string[] = [];
		if (externalRemoval.length > 0) {
			messages.push(nls.localize('externalRemoval', "The following files have been closed and modified on disk: {0}.", externalRemoval.join(', ')));
		}
		if (noParallelUniverses.length > 0) {
			messages.push(nls.localize('noParallelUniverses', "The following files have been modified in an incompatible way: {0}.", noParallelUniverses.join(', ')));
		}
		return messages.join('\n');
	}

	public get size(): number {
		return this.elements.size;
	}

	public has(strResource: string): boolean {
		return this.elements.has(strResource);
	}

	public set(strResource: string, value: ResourceReasonPair): void {
		this.elements.set(strResource, value);
	}

	public delete(strResource: string): boolean {
		return this.elements.delete(strResource);
	}
}

class WorkspaceStackElement {
	public readonly type = UndoRedoElementType.Workspace;
	public readonly actual: IWorkspaceUndoRedoElement;
	public readonly label: string;

	public readonly resources: URI[];
	public readonly strResources: string[];
	public removedResources: RemovedResources | null;
	public invalidatedResources: RemovedResources | null;

	constructor(actual: IWorkspaceUndoRedoElement) {
		this.actual = actual;
		this.label = actual.label;
		this.resources = actual.resources.slice(0);
		this.strResources = this.resources.map(resource => uriGetComparisonKey(resource));
		this.removedResources = null;
		this.invalidatedResources = null;
	}

	public removeResource(resource: URI, strResource: string, reason: RemovedResourceReason): void {
		if (!this.removedResources) {
			this.removedResources = new RemovedResources();
		}
		if (!this.removedResources.has(strResource)) {
			this.removedResources.set(strResource, new ResourceReasonPair(resource, reason));
		}
	}

	public setValid(resource: URI, strResource: string, isValid: boolean): void {
		if (isValid) {
			if (this.invalidatedResources) {
				this.invalidatedResources.delete(strResource);
				if (this.invalidatedResources.size === 0) {
					this.invalidatedResources = null;
				}
			}
		} else {
			if (!this.invalidatedResources) {
				this.invalidatedResources = new RemovedResources();
			}
			if (!this.invalidatedResources.has(strResource)) {
				this.invalidatedResources.set(strResource, new ResourceReasonPair(resource, RemovedResourceReason.ExternalRemoval));
			}
		}
	}
}

type StackElement = ResourceStackElement | WorkspaceStackElement;

class ResourceEditStack {
	public readonly resource: URI;
	private readonly strResource: string;
	private _past: StackElement[];
	private _future: StackElement[];
	public locked: boolean;

	constructor(resource: URI, strResource: string) {
		this.resource = resource;
		this.strResource = strResource;
		this._past = [];
		this._future = [];
		this.locked = false;
	}

	public dispose(): void {
		for (const element of this._past) {
			if (element.type === UndoRedoElementType.Workspace) {
				element.removeResource(this.resource, this.strResource, RemovedResourceReason.ExternalRemoval);
			}
		}
		for (const element of this._future) {
			if (element.type === UndoRedoElementType.Workspace) {
				element.removeResource(this.resource, this.strResource, RemovedResourceReason.ExternalRemoval);
			}
		}
	}

	public flushAllElements(): void {
		this._past = [];
		this._future = [];
	}

	public setElementsIsValid(isValid: boolean): void {
		for (const element of this._past) {
			if (element.type === UndoRedoElementType.Workspace) {
				element.setValid(this.resource, this.strResource, isValid);
			} else {
				element.setValid(isValid);
			}
		}
		for (const element of this._future) {
			if (element.type === UndoRedoElementType.Workspace) {
				element.setValid(this.resource, this.strResource, isValid);
			} else {
				element.setValid(isValid);
			}
		}
	}

	public pushElement(element: StackElement): void {
		// remove the future
		for (const futureElement of this._future) {
			if (futureElement.type === UndoRedoElementType.Workspace) {
				futureElement.removeResource(this.resource, this.strResource, RemovedResourceReason.NoParallelUniverses);
			}
		}
		this._future = [];
		if (this._past.length > 0) {
			const lastElement = this._past[this._past.length - 1];
			if (lastElement.type === UndoRedoElementType.Resource && !lastElement.isValid) {
				// clear undo stack
				this._past = [];
			}
		}
		this._past.push(element);
	}

	public getElements(): IPastFutureElements {
		const past: IUndoRedoElement[] = [];
		const future: IUndoRedoElement[] = [];

		for (const element of this._past) {
			past.push(element.actual);
		}
		for (const element of this._future) {
			future.push(element.actual);
		}

		return { past, future };
	}

	public getClosestPastElement(): StackElement | null {
		if (this._past.length === 0) {
			return null;
		}
		return this._past[this._past.length - 1];
	}

	public getClosestFutureElement(): StackElement | null {
		if (this._future.length === 0) {
			return null;
		}
		return this._future[this._future.length - 1];
	}

	public hasPastElements(): boolean {
		return (this._past.length > 0);
	}

	public hasFutureElements(): boolean {
		return (this._future.length > 0);
	}

	public splitPastWorkspaceElement(toRemove: WorkspaceStackElement, individualMap: Map<string, ResourceStackElement>): void {
		for (let j = this._past.length - 1; j >= 0; j--) {
			if (this._past[j] === toRemove) {
				if (individualMap.has(this.strResource)) {
					// gets replaced
					this._past[j] = individualMap.get(this.strResource)!;
				} else {
					// gets deleted
					this._past.splice(j, 1);
				}
				break;
			}
		}
	}

	public splitFutureWorkspaceElement(toRemove: WorkspaceStackElement, individualMap: Map<string, ResourceStackElement>): void {
		for (let j = this._future.length - 1; j >= 0; j--) {
			if (this._future[j] === toRemove) {
				if (individualMap.has(this.strResource)) {
					// gets replaced
					this._future[j] = individualMap.get(this.strResource)!;
				} else {
					// gets deleted
					this._future.splice(j, 1);
				}
				break;
			}
		}
	}

	public moveBackward(element: StackElement): void {
		this._past.pop();
		this._future.push(element);
	}

	public moveForward(element: StackElement): void {
		this._future.pop();
		this._past.push(element);
	}
}

export class UndoRedoService implements IUndoRedoService {
	_serviceBrand: undefined;

	private readonly _editStacks: Map<string, ResourceEditStack>;

	constructor(
		@IDialogService private readonly _dialogService: IDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		this._editStacks = new Map<string, ResourceEditStack>();
	}

	public pushElement(_element: IUndoRedoElement): void {
		const element: StackElement = (_element.type === UndoRedoElementType.Resource ? new ResourceStackElement(_element) : new WorkspaceStackElement(_element));
		for (let i = 0, len = element.resources.length; i < len; i++) {
			const resource = element.resources[i];
			const strResource = element.strResources[i];

			let editStack: ResourceEditStack;
			if (this._editStacks.has(strResource)) {
				editStack = this._editStacks.get(strResource)!;
			} else {
				editStack = new ResourceEditStack(resource, strResource);
				this._editStacks.set(strResource, editStack);
			}

			editStack.pushElement(element);
		}
	}

	public getLastElement(resource: URI): IUndoRedoElement | null {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			if (editStack.hasFutureElements()) {
				return null;
			}
			const closestPastElement = editStack.getClosestPastElement();
			return closestPastElement ? closestPastElement.actual : null;
		}
		return null;
	}

	private _splitPastWorkspaceElement(toRemove: WorkspaceStackElement, ignoreResources: RemovedResources | null): void {
		const individualArr = toRemove.actual.split();
		const individualMap = new Map<string, ResourceStackElement>();
		for (const _element of individualArr) {
			const element = new ResourceStackElement(_element);
			individualMap.set(element.strResource, element);
		}

		for (const strResource of toRemove.strResources) {
			if (ignoreResources && ignoreResources.has(strResource)) {
				continue;
			}
			const editStack = this._editStacks.get(strResource)!;
			editStack.splitPastWorkspaceElement(toRemove, individualMap);
		}
	}

	private _splitFutureWorkspaceElement(toRemove: WorkspaceStackElement, ignoreResources: RemovedResources | null): void {
		const individualArr = toRemove.actual.split();
		const individualMap = new Map<string, ResourceStackElement>();
		for (const _element of individualArr) {
			const element = new ResourceStackElement(_element);
			individualMap.set(element.strResource, element);
		}

		for (const strResource of toRemove.strResources) {
			if (ignoreResources && ignoreResources.has(strResource)) {
				continue;
			}
			const editStack = this._editStacks.get(strResource)!;
			editStack.splitFutureWorkspaceElement(toRemove, individualMap);
		}
	}

	public removeElements(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			editStack.dispose();
			this._editStacks.delete(strResource);
		}
	}

	public setElementsIsValid(resource: URI, isValid: boolean): void {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			editStack.setElementsIsValid(isValid);
		}
	}

	// resource

	public hasElements(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return (editStack.hasPastElements() || editStack.hasFutureElements());
		}
		return false;
	}

	public getElements(resource: URI): IPastFutureElements {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return editStack.getElements();
		}
		return { past: [], future: [] };
	}

	public canUndo(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return editStack.hasPastElements();
		}
		return false;
	}

	private _onError(err: Error, element: StackElement): void {
		onUnexpectedError(err);
		// An error occured while undoing or redoing => drop the undo/redo stack for all affected resources
		for (const resource of element.resources) {
			this.removeElements(resource);
		}
		this._notificationService.error(err);
	}

	private _acquireLocks(affectedEditStacks: ResourceEditStack[]): () => void {
		// first, check if all locks can be acquired
		for (const editStack of affectedEditStacks) {
			if (editStack.locked) {
				throw new Error('Cannot acquire edit stack lock');
			}
		}

		// can acquire all locks
		for (const editStack of affectedEditStacks) {
			editStack.locked = true;
		}

		return () => {
			// release all locks
			for (const editStack of affectedEditStacks) {
				editStack.locked = false;
			}
		};
	}

	private _safeInvokeWithLocks(element: StackElement, invoke: () => Promise<void> | void, affectedEditStacks: ResourceEditStack[], cleanup: IDisposable = Disposable.None): Promise<void> | void {
		const releaseLocks = this._acquireLocks(affectedEditStacks);

		let result: Promise<void> | void;
		try {
			result = invoke();
		} catch (err) {
			releaseLocks();
			cleanup.dispose();
			return this._onError(err, element);
		}

		if (result) {
			// result is Promise<void>
			return result.then(
				() => {
					releaseLocks();
					cleanup.dispose();
				},
				(err) => {
					releaseLocks();
					cleanup.dispose();
					return this._onError(err, element);
				}
			);
		} else {
			// result is void
			releaseLocks();
			cleanup.dispose();
		}
	}

	private async _invokePrepare(element: WorkspaceStackElement): Promise<IDisposable> {
		if (typeof element.actual.prepareUndoRedo === 'undefined') {
			return Disposable.None;
		}
		const result = element.actual.prepareUndoRedo();
		if (typeof result === 'undefined') {
			return Disposable.None;
		}
		return result;
	}

	private _getAffectedEditStacks(element: WorkspaceStackElement): ResourceEditStack[] {
		const affectedEditStacks: ResourceEditStack[] = [];
		for (const strResource of element.strResources) {
			affectedEditStacks.push(this._editStacks.get(strResource)!);
		}
		return affectedEditStacks;
	}

	private _checkWorkspaceUndo(resource: URI, element: WorkspaceStackElement, affectedEditStacks: ResourceEditStack[], checkInvalidatedResources: boolean): WorkspaceVerificationError | null {
		if (element.removedResources) {
			this._splitPastWorkspaceElement(element, element.removedResources);
			const message = nls.localize('cannotWorkspaceUndo', "Could not undo '{0}' across all files. {1}", element.label, element.removedResources.createMessage());
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.undo(resource));
		}
		if (checkInvalidatedResources && element.invalidatedResources) {
			this._splitPastWorkspaceElement(element, element.invalidatedResources);
			const message = nls.localize('cannotWorkspaceUndo', "Could not undo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage());
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.undo(resource));
		}

		// this must be the last past element in all the impacted resources!
		const cannotUndoDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.getClosestPastElement() !== element) {
				cannotUndoDueToResources.push(editStack.resource);
			}
		}
		if (cannotUndoDueToResources.length > 0) {
			this._splitPastWorkspaceElement(element, null);
			const paths = cannotUndoDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceUndoDueToChanges', "Could not undo '{0}' across all files because changes were made to {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.undo(resource));
		}

		const cannotLockDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.locked) {
				cannotLockDueToResources.push(editStack.resource);
			}
		}
		if (cannotLockDueToResources.length > 0) {
			this._splitPastWorkspaceElement(element, null);
			const paths = cannotLockDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceUndoDueToInProgressUndoRedo', "Could not undo '{0}' across all files because there is already an undo or redo operation running on {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.undo(resource));
		}

		return null;
	}

	private _workspaceUndo(resource: URI, element: WorkspaceStackElement): Promise<void> | void {
		const affectedEditStacks = this._getAffectedEditStacks(element);
		const verificationError = this._checkWorkspaceUndo(resource, element, affectedEditStacks, /*invalidated resources will be checked after the prepare call*/false);
		if (verificationError) {
			return verificationError.returnValue;
		}
		return this._confirmAndExecuteWorkspaceUndo(resource, element, affectedEditStacks);
	}

	private async _confirmAndExecuteWorkspaceUndo(resource: URI, element: WorkspaceStackElement, affectedEditStacks: ResourceEditStack[]): Promise<void> {
		const result = await this._dialogService.show(
			Severity.Info,
			nls.localize('confirmWorkspace', "Would you like to undo '{0}' across all files?", element.label),
			[
				nls.localize('ok', "Undo in {0} Files", affectedEditStacks.length),
				nls.localize('nok', "Undo this File"),
				nls.localize('cancel', "Cancel"),
			],
			{
				cancelId: 2
			}
		);

		if (result.choice === 2) {
			// choice: cancel
			return;
		}

		if (result.choice === 1) {
			// choice: undo this file
			this._splitPastWorkspaceElement(element, null);
			return this.undo(resource);
		}

		// choice: undo in all files

		// At this point, it is possible that the element has been made invalid in the meantime (due to the confirmation await)
		const verificationError1 = this._checkWorkspaceUndo(resource, element, affectedEditStacks, /*invalidated resources will be checked after the prepare call*/false);
		if (verificationError1) {
			return verificationError1.returnValue;
		}

		// prepare
		let cleanup: IDisposable;
		try {
			cleanup = await this._invokePrepare(element);
		} catch (err) {
			return this._onError(err, element);
		}

		// At this point, it is possible that the element has been made invalid in the meantime (due to the prepare await)
		const verificationError2 = this._checkWorkspaceUndo(resource, element, affectedEditStacks, /*now also check that there are no more invalidated resources*/true);
		if (verificationError2) {
			cleanup.dispose();
			return verificationError2.returnValue;
		}

		for (const editStack of affectedEditStacks) {
			editStack.moveBackward(element);
		}
		return this._safeInvokeWithLocks(element, () => element.actual.undo(), affectedEditStacks, cleanup);
	}

	private _resourceUndo(editStack: ResourceEditStack, element: ResourceStackElement): Promise<void> | void {
		if (!element.isValid) {
			// invalid element => immediately flush edit stack!
			editStack.flushAllElements();
			return;
		}
		if (editStack.locked) {
			const message = nls.localize('cannotResourceUndoDueToInProgressUndoRedo', "Could not undo '{0}' because there is already an undo or redo operation running.", element.label);
			this._notificationService.info(message);
			return;
		}
		editStack.moveBackward(element);
		return this._safeInvokeWithLocks(element, () => element.actual.undo(), [editStack]);
	}

	public undo(resource: URI): Promise<void> | void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		const element = editStack.getClosestPastElement();
		if (!element) {
			return;
		}

		if (element.type === UndoRedoElementType.Workspace) {
			return this._workspaceUndo(resource, element);
		} else {
			return this._resourceUndo(editStack, element);
		}
	}

	public canRedo(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return editStack.hasFutureElements();
		}
		return false;
	}

	private _checkWorkspaceRedo(resource: URI, element: WorkspaceStackElement, affectedEditStacks: ResourceEditStack[], checkInvalidatedResources: boolean): WorkspaceVerificationError | null {
		if (element.removedResources) {
			this._splitFutureWorkspaceElement(element, element.removedResources);
			const message = nls.localize('cannotWorkspaceRedo', "Could not redo '{0}' across all files. {1}", element.label, element.removedResources.createMessage());
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.redo(resource));
		}
		if (checkInvalidatedResources && element.invalidatedResources) {
			this._splitFutureWorkspaceElement(element, element.invalidatedResources);
			const message = nls.localize('cannotWorkspaceRedo', "Could not redo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage());
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.redo(resource));
		}

		// this must be the last future element in all the impacted resources!
		const cannotRedoDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.getClosestFutureElement() !== element) {
				cannotRedoDueToResources.push(editStack.resource);
			}
		}
		if (cannotRedoDueToResources.length > 0) {
			this._splitFutureWorkspaceElement(element, null);
			const paths = cannotRedoDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceRedoDueToChanges', "Could not redo '{0}' across all files because changes were made to {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.redo(resource));
		}

		const cannotLockDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.locked) {
				cannotLockDueToResources.push(editStack.resource);
			}
		}
		if (cannotLockDueToResources.length > 0) {
			this._splitFutureWorkspaceElement(element, null);
			const paths = cannotLockDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceRedoDueToInProgressUndoRedo', "Could not redo '{0}' across all files because there is already an undo or redo operation running on {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return new WorkspaceVerificationError(this.redo(resource));
		}

		return null;
	}

	private _workspaceRedo(resource: URI, element: WorkspaceStackElement): Promise<void> | void {
		const affectedEditStacks = this._getAffectedEditStacks(element);
		const verificationError = this._checkWorkspaceRedo(resource, element, affectedEditStacks, /*invalidated resources will be checked after the prepare call*/false);
		if (verificationError) {
			return verificationError.returnValue;
		}
		return this._executeWorkspaceRedo(resource, element, affectedEditStacks);
	}

	private async _executeWorkspaceRedo(resource: URI, element: WorkspaceStackElement, affectedEditStacks: ResourceEditStack[]): Promise<void> {
		// prepare
		let cleanup: IDisposable;
		try {
			cleanup = await this._invokePrepare(element);
		} catch (err) {
			return this._onError(err, element);
		}

		// At this point, it is possible that the element has been made invalid in the meantime (due to the prepare await)
		const verificationError = this._checkWorkspaceRedo(resource, element, affectedEditStacks, /*now also check that there are no more invalidated resources*/true);
		if (verificationError) {
			cleanup.dispose();
			return verificationError.returnValue;
		}

		for (const editStack of affectedEditStacks) {
			editStack.moveForward(element);
		}
		return this._safeInvokeWithLocks(element, () => element.actual.redo(), affectedEditStacks, cleanup);
	}

	private _resourceRedo(editStack: ResourceEditStack, element: ResourceStackElement): Promise<void> | void {
		if (!element.isValid) {
			// invalid element => immediately flush edit stack!
			editStack.flushAllElements();
			return;
		}
		if (editStack.locked) {
			const message = nls.localize('cannotResourceRedoDueToInProgressUndoRedo', "Could not redo '{0}' because there is already an undo or redo operation running.", element.label);
			this._notificationService.info(message);
			return;
		}
		editStack.moveForward(element);
		return this._safeInvokeWithLocks(element, () => element.actual.redo(), [editStack]);
	}

	public redo(resource: URI): Promise<void> | void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		const element = editStack.getClosestFutureElement();
		if (!element) {
			return;
		}

		if (element.type === UndoRedoElementType.Workspace) {
			return this._workspaceRedo(resource, element);
		} else {
			return this._resourceRedo(editStack, element);
		}
	}
}

class WorkspaceVerificationError {
	constructor(public readonly returnValue: Promise<void> | void) { }
}

registerSingleton(IUndoRedoService, UndoRedoService);
