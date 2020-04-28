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
			messages.push(nls.localize('externalRemoval', "The following files have been closed: {0}.", externalRemoval.join(', ')));
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
	public resource: URI;
	public past: StackElement[];
	public future: StackElement[];

	constructor(resource: URI) {
		this.resource = resource;
		this.past = [];
		this.future = [];
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
				editStack = new ResourceEditStack(resource);
				this._editStacks.set(strResource, editStack);
			}

			// remove the future
			for (const futureElement of editStack.future) {
				if (futureElement.type === UndoRedoElementType.Workspace) {
					futureElement.removeResource(resource, strResource, RemovedResourceReason.NoParallelUniverses);
				}
			}
			editStack.future = [];
			if (editStack.past.length > 0) {
				const lastElement = editStack.past[editStack.past.length - 1];
				if (lastElement.type === UndoRedoElementType.Resource && !lastElement.isValid) {
					// clear undo stack
					editStack.past = [];
				}
			}
			editStack.past.push(element);
		}
	}

	public getLastElement(resource: URI): IUndoRedoElement | null {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			if (editStack.future.length > 0) {
				return null;
			}
			if (editStack.past.length === 0) {
				return null;
			}
			return editStack.past[editStack.past.length - 1].actual;
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
			for (let j = editStack.past.length - 1; j >= 0; j--) {
				if (editStack.past[j] === toRemove) {
					if (individualMap.has(strResource)) {
						// gets replaced
						editStack.past[j] = individualMap.get(strResource)!;
					} else {
						// gets deleted
						editStack.past.splice(j, 1);
					}
					break;
				}
			}
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
			for (let j = editStack.future.length - 1; j >= 0; j--) {
				if (editStack.future[j] === toRemove) {
					if (individualMap.has(strResource)) {
						// gets replaced
						editStack.future[j] = individualMap.get(strResource)!;
					} else {
						// gets deleted
						editStack.future.splice(j, 1);
					}
					break;
				}
			}
		}
	}

	public removeElements(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			for (const element of editStack.past) {
				if (element.type === UndoRedoElementType.Workspace) {
					element.removeResource(resource, strResource, RemovedResourceReason.ExternalRemoval);
				}
			}
			for (const element of editStack.future) {
				if (element.type === UndoRedoElementType.Workspace) {
					element.removeResource(resource, strResource, RemovedResourceReason.ExternalRemoval);
				}
			}
			this._editStacks.delete(strResource);
		}
	}

	public setElementsIsValid(resource: URI, isValid: boolean): void {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			for (const element of editStack.past) {
				if (element.type === UndoRedoElementType.Workspace) {
					element.setValid(resource, strResource, isValid);
				} else {
					element.setValid(isValid);
				}
			}
			for (const element of editStack.future) {
				if (element.type === UndoRedoElementType.Workspace) {
					element.setValid(resource, strResource, isValid);
				} else {
					element.setValid(isValid);
				}
			}
		}
	}

	// resource

	public hasElements(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return (editStack.past.length > 0 || editStack.future.length > 0);
		}
		return false;
	}

	public getElements(resource: URI): IPastFutureElements {
		const past: IUndoRedoElement[] = [];
		const future: IUndoRedoElement[] = [];

		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			for (const element of editStack.past) {
				past.push(element.actual);
			}
			for (const element of editStack.future) {
				future.push(element.actual);
			}
		}

		return { past, future };
	}

	public canUndo(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return (editStack.past.length > 0);
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

	private _safeInvoke(element: StackElement, invoke: () => Promise<void> | void): Promise<void> | void {
		let result: Promise<void> | void;
		try {
			result = invoke();
		} catch (err) {
			return this._onError(err, element);
		}

		if (result) {
			return result.then(undefined, (err) => this._onError(err, element));
		}
	}

	private _workspaceUndo(resource: URI, element: WorkspaceStackElement): Promise<void> | void {
		if (element.removedResources) {
			this._splitPastWorkspaceElement(element, element.removedResources);
			const message = nls.localize('cannotWorkspaceUndo', "Could not undo '{0}' across all files. {1}", element.label, element.removedResources.createMessage());
			this._notificationService.info(message);
			return this.undo(resource);
		}
		if (element.invalidatedResources) {
			this._splitPastWorkspaceElement(element, element.invalidatedResources);
			const message = nls.localize('cannotWorkspaceUndo', "Could not undo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage());
			this._notificationService.info(message);
			return this.undo(resource);
		}

		// this must be the last past element in all the impacted resources!
		let affectedEditStacks: ResourceEditStack[] = [];
		for (const strResource of element.strResources) {
			affectedEditStacks.push(this._editStacks.get(strResource)!);
		}

		let cannotUndoDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.past.length === 0 || editStack.past[editStack.past.length - 1] !== element) {
				cannotUndoDueToResources.push(editStack.resource);
			}
		}

		if (cannotUndoDueToResources.length > 0) {
			this._splitPastWorkspaceElement(element, null);
			const paths = cannotUndoDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceUndoDueToChanges', "Could not undo '{0}' across all files because changes were made to {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return this.undo(resource);
		}

		return this._dialogService.show(
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
		).then((result) => {
			if (result.choice === 2) {
				// cancel
				return;
			} else if (result.choice === 0) {
				for (const editStack of affectedEditStacks) {
					editStack.past.pop();
					editStack.future.push(element);
				}
				return this._safeInvoke(element, () => element.actual.undo());
			} else {
				this._splitPastWorkspaceElement(element, null);
				return this.undo(resource);
			}
		});
	}

	private _resourceUndo(editStack: ResourceEditStack, element: ResourceStackElement): Promise<void> | void {
		if (!element.isValid) {
			// invalid element => immediately flush edit stack!
			editStack.past = [];
			editStack.future = [];
			return;
		}
		editStack.past.pop();
		editStack.future.push(element);
		return this._safeInvoke(element, () => element.actual.undo());
	}

	public undo(resource: URI): Promise<void> | void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		if (editStack.past.length === 0) {
			return;
		}

		const element = editStack.past[editStack.past.length - 1];
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
			return (editStack.future.length > 0);
		}
		return false;
	}

	private _workspaceRedo(resource: URI, element: WorkspaceStackElement): Promise<void> | void {
		if (element.removedResources) {
			this._splitFutureWorkspaceElement(element, element.removedResources);
			const message = nls.localize('cannotWorkspaceRedo', "Could not redo '{0}' across all files. {1}", element.label, element.removedResources.createMessage());
			this._notificationService.info(message);
			return this.redo(resource);
		}
		if (element.invalidatedResources) {
			this._splitFutureWorkspaceElement(element, element.invalidatedResources);
			const message = nls.localize('cannotWorkspaceRedo', "Could not redo '{0}' across all files. {1}", element.label, element.invalidatedResources.createMessage());
			this._notificationService.info(message);
			return this.redo(resource);
		}

		// this must be the last future element in all the impacted resources!
		let affectedEditStacks: ResourceEditStack[] = [];
		for (const strResource of element.strResources) {
			affectedEditStacks.push(this._editStacks.get(strResource)!);
		}

		let cannotRedoDueToResources: URI[] = [];
		for (const editStack of affectedEditStacks) {
			if (editStack.future.length === 0 || editStack.future[editStack.future.length - 1] !== element) {
				cannotRedoDueToResources.push(editStack.resource);
			}
		}

		if (cannotRedoDueToResources.length > 0) {
			this._splitFutureWorkspaceElement(element, null);
			const paths = cannotRedoDueToResources.map(r => r.scheme === Schemas.file ? r.fsPath : r.path);
			const message = nls.localize('cannotWorkspaceRedoDueToChanges', "Could not redo '{0}' across all files because changes were made to {1}", element.label, paths.join(', '));
			this._notificationService.info(message);
			return this.redo(resource);
		}

		for (const editStack of affectedEditStacks) {
			editStack.future.pop();
			editStack.past.push(element);
		}
		return this._safeInvoke(element, () => element.actual.redo());
	}

	private _resourceRedo(editStack: ResourceEditStack, element: ResourceStackElement): Promise<void> | void {
		if (!element.isValid) {
			// invalid element => immediately flush edit stack!
			editStack.past = [];
			editStack.future = [];
			return;
		}
		editStack.future.pop();
		editStack.past.push(element);
		return this._safeInvoke(element, () => element.actual.redo());
	}

	public redo(resource: URI): Promise<void> | void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		if (editStack.future.length === 0) {
			return;
		}

		const element = editStack.future[editStack.future.length - 1];
		if (element.type === UndoRedoElementType.Workspace) {
			return this._workspaceRedo(resource, element);
		} else {
			return this._resourceRedo(editStack, element);
		}
	}
}

registerSingleton(IUndoRedoService, UndoRedoService);
