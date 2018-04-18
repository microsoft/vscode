/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EditorInput } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IConstructorSignature0, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { isArray } from 'vs/base/common/types';

export interface IEditorDescriptor {
	instantiate(instantiationService: IInstantiationService): BaseEditor;

	getId(): string;
	getName(): string;

	describes(obj: any): boolean;
}

export interface IEditorRegistry {

	/**
	 * Registers an editor to the platform for the given input type. The second parameter also supports an
	 * array of input classes to be passed in. If the more than one editor is registered for the same editor
	 * input, the input itself will be asked which editor it prefers if this method is provided. Otherwise
	 * the first editor in the list will be returned.
	 *
	 * @param editorInputDescriptor a constructor function that returns an instance of EditorInput for which the
	 * registered editor should be used for.
	 */
	registerEditor(descriptor: IEditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>): void;
	registerEditor(descriptor: IEditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>[]): void;

	/**
	 * Returns the editor descriptor for the given input or null if none.
	 */
	getEditor(input: EditorInput): IEditorDescriptor;

	/**
	 * Returns the editor descriptor for the given identifier or null if none.
	 */
	getEditorById(editorId: string): IEditorDescriptor;

	/**
	 * Returns an array of registered editors known to the platform.
	 */
	getEditors(): IEditorDescriptor[];
}

/**
 * A lightweight descriptor of an editor. The descriptor is deferred so that heavy editors
 * can load lazily in the workbench.
 */
export class EditorDescriptor implements IEditorDescriptor {
	private ctor: IConstructorSignature0<BaseEditor>;
	private id: string;
	private name: string;

	constructor(ctor: IConstructorSignature0<BaseEditor>, id: string, name: string) {
		this.ctor = ctor;
		this.id = id;
		this.name = name;
	}

	public instantiate(instantiationService: IInstantiationService): BaseEditor {
		return instantiationService.createInstance(this.ctor);
	}

	public getId(): string {
		return this.id;
	}

	public getName(): string {
		return this.name;
	}

	public describes(obj: any): boolean {
		return obj instanceof BaseEditor && (<BaseEditor>obj).getId() === this.id;
	}
}

const INPUT_DESCRIPTORS_PROPERTY = '__$inputDescriptors';

class EditorRegistry implements IEditorRegistry {
	private editors: EditorDescriptor[];

	constructor() {
		this.editors = [];
	}

	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>[]): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: any): void {

		// Support both non-array and array parameter
		let inputDescriptors: SyncDescriptor<EditorInput>[] = [];
		if (!isArray(editorInputDescriptor)) {
			inputDescriptors.push(editorInputDescriptor);
		} else {
			inputDescriptors = editorInputDescriptor;
		}

		// Register (Support multiple Editors per Input)
		descriptor[INPUT_DESCRIPTORS_PROPERTY] = inputDescriptors;
		this.editors.push(descriptor);
	}

	public getEditor(input: EditorInput): EditorDescriptor {
		const findEditorDescriptors = (input: EditorInput, byInstanceOf?: boolean): EditorDescriptor[] => {
			const matchingDescriptors: EditorDescriptor[] = [];

			for (let i = 0; i < this.editors.length; i++) {
				const editor = this.editors[i];
				const inputDescriptors = <SyncDescriptor<EditorInput>[]>editor[INPUT_DESCRIPTORS_PROPERTY];
				for (let j = 0; j < inputDescriptors.length; j++) {
					const inputClass = inputDescriptors[j].ctor;

					// Direct check on constructor type (ignores prototype chain)
					if (!byInstanceOf && input.constructor === inputClass) {
						matchingDescriptors.push(editor);
						break;
					}

					// Normal instanceof check
					else if (byInstanceOf && input instanceof inputClass) {
						matchingDescriptors.push(editor);
						break;
					}
				}
			}

			// If no descriptors found, continue search using instanceof and prototype chain
			if (!byInstanceOf && matchingDescriptors.length === 0) {
				return findEditorDescriptors(input, true);
			}

			if (byInstanceOf) {
				return matchingDescriptors;
			}

			return matchingDescriptors;
		};

		const descriptors = findEditorDescriptors(input);
		if (descriptors && descriptors.length > 0) {

			// Ask the input for its preferred Editor
			const preferredEditorId = input.getPreferredEditorId(descriptors.map(d => d.getId()));
			if (preferredEditorId) {
				return this.getEditorById(preferredEditorId);
			}

			// Otherwise, first come first serve
			return descriptors[0];
		}

		return null;
	}

	public getEditorById(editorId: string): EditorDescriptor {
		for (let i = 0; i < this.editors.length; i++) {
			const editor = this.editors[i];
			if (editor.getId() === editorId) {
				return editor;
			}
		}

		return null;
	}

	public getEditors(): EditorDescriptor[] {
		return this.editors.slice(0);
	}

	public setEditors(editorsToSet: EditorDescriptor[]): void {
		this.editors = editorsToSet;
	}

	public getEditorInputs(): any[] {
		const inputClasses: any[] = [];
		for (let i = 0; i < this.editors.length; i++) {
			const editor = this.editors[i];
			const editorInputDescriptors = <SyncDescriptor<EditorInput>[]>editor[INPUT_DESCRIPTORS_PROPERTY];
			inputClasses.push(...editorInputDescriptors.map(descriptor => descriptor.ctor));
		}

		return inputClasses;
	}
}

export const Extensions = {
	Editors: 'workbench.contributions.editors'
};

Registry.add(Extensions.Editors, new EditorRegistry());