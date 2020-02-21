/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUndoRedoService, IUndoRedoElement } from 'vs/platform/undoRedo/common/undoRedo';
import { URI } from 'vs/base/common/uri';
import { getComparisonKey as uriGetComparisonKey } from 'vs/base/common/resources';
import { onUnexpectedError } from 'vs/base/common/errors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class StackElement {
	public readonly actual: IUndoRedoElement;
	public readonly label: string;

	public resources: URI[];
	public strResources: string[];

	constructor(actual: IUndoRedoElement) {
		this.actual = actual;
		this.label = actual.label;
		this.resources = actual.resources.slice(0);
		this.strResources = this.resources.map(resource => uriGetComparisonKey(resource));
	}

	public invalidate(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		for (let i = 0, len = this.strResources.length; i < len; i++) {
			if (this.strResources[i] === strResource) {
				this.resources.splice(i, 1);
				this.strResources.splice(i, 1);
				break;
			}
		}
		this.actual.invalidate(resource);
	}
}

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

	constructor() {
		this._editStacks = new Map<string, ResourceEditStack>();
	}

	public pushElement(_element: IUndoRedoElement): void {
		const element = new StackElement(_element);
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
				futureElement.invalidate(resource);
			}
			editStack.future = [];
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

	public removeElements(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			for (const pastElement of editStack.past) {
				pastElement.invalidate(resource);
			}
			for (const futureElement of editStack.future) {
				futureElement.invalidate(resource);
			}
			this._editStacks.delete(strResource);
		}
	}

	public canUndo(resource: URI): boolean {
		const strResource = uriGetComparisonKey(resource);
		if (this._editStacks.has(strResource)) {
			const editStack = this._editStacks.get(strResource)!;
			return (editStack.past.length > 0);
		}
		return false;
	}

	public undo(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		if (editStack.past.length === 0) {
			return;
		}

		const element = editStack.past[editStack.past.length - 1];

		let replaceCurrentElement: IUndoRedoElement[] | null = null as IUndoRedoElement[] | null;
		try {
			element.actual.undo({
				replaceCurrentElement: (others: IUndoRedoElement[]): void => {
					replaceCurrentElement = others;
				}
			});
		} catch (e) {
			onUnexpectedError(e);
			editStack.past.pop();
			editStack.future.push(element);
			return;
		}

		if (replaceCurrentElement === null) {
			// regular case
			editStack.past.pop();
			editStack.future.push(element);
			return;
		}

		const replaceCurrentElementMap = new Map<string, StackElement>();
		let foundReplacementForThisResource = false;
		for (const _replace of replaceCurrentElement) {
			const replace = new StackElement(_replace);
			for (const strReplaceResource of replace.strResources) {
				replaceCurrentElementMap.set(strReplaceResource, replace);
				if (strReplaceResource === strResource) {
					foundReplacementForThisResource = true;
				}
			}
		}

		for (let i = 0, len = element.strResources.length; i < len; i++) {
			const strResource = element.strResources[i];
			if (this._editStacks.has(strResource)) {
				const editStack = this._editStacks.get(strResource)!;
				for (let j = editStack.past.length - 1; j >= 0; j--) {
					if (editStack.past[j] === element) {
						if (replaceCurrentElementMap.has(strResource)) {
							editStack.past[j] = replaceCurrentElementMap.get(strResource)!;
						} else {
							editStack.past.splice(j, 1);
						}
						break;
					}
				}
			}
		}

		if (foundReplacementForThisResource) {
			this.undo(resource);
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

	public redo(resource: URI): void {
		const strResource = uriGetComparisonKey(resource);
		if (!this._editStacks.has(strResource)) {
			return;
		}

		const editStack = this._editStacks.get(strResource)!;
		if (editStack.future.length === 0) {
			return;
		}

		const element = editStack.future[editStack.future.length - 1];

		let replaceCurrentElement: IUndoRedoElement[] | null = null as IUndoRedoElement[] | null;
		try {
			element.actual.redo({
				replaceCurrentElement: (others: IUndoRedoElement[]): void => {
					replaceCurrentElement = others;
				}
			});
		} catch (e) {
			onUnexpectedError(e);
			editStack.future.pop();
			editStack.past.push(element);
			return;
		}

		if (replaceCurrentElement === null) {
			// regular case
			editStack.future.pop();
			editStack.past.push(element);
			return;
		}

		let foundReplacementForThisResource = false;
		const replaceCurrentElementMap = new Map<string, StackElement>();
		for (const _replace of replaceCurrentElement) {
			const replace = new StackElement(_replace);
			for (const strReplaceResource of replace.strResources) {
				replaceCurrentElementMap.set(strReplaceResource, replace);
				if (strReplaceResource === strResource) {
					foundReplacementForThisResource = true;
				}
			}
		}

		for (let i = 0, len = element.strResources.length; i < len; i++) {
			const strResource = element.strResources[i];
			if (this._editStacks.has(strResource)) {
				const editStack = this._editStacks.get(strResource)!;
				for (let j = editStack.future.length - 1; j >= 0; j--) {
					if (editStack.future[j] === element) {
						if (replaceCurrentElementMap.has(strResource)) {
							editStack.future[j] = replaceCurrentElementMap.get(strResource)!;
						} else {
							editStack.future.splice(j, 1);
						}
						break;
					}
				}
			}
		}

		if (foundReplacementForThisResource) {
			this.redo(resource);
		}
	}
}

registerSingleton(IUndoRedoService, UndoRedoService);
