/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IConstructorSignature0, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export interface IEditorDescriptor {
	instantiate(instantiationService: IInstantiationService): BaseEditor;

	getId(): string;
	getName(): string;

	describes(obj: unknown): boolean;
}

export interface IEditorRegistry {

	/**
	 * Registers an editor to the platform for the given input type. The second parameter also supports an
	 * array of input classes to be passed in. If the more than one editor is registered for the same editor
	 * input, the input itself will be asked which editor it prefers if this method is provided. Otherwise
	 * the first editor in the list will be returned.
	 *
	 * @param inputDescriptors A set of constructor functions that return an instance of EditorInput for which the
	 * registered editor should be used for.
	 */
	registerEditor(descriptor: IEditorDescriptor, inputDescriptors: readonly SyncDescriptor<EditorInput>[]): void;

	/**
	 * Returns the editor descriptor for the given input or `undefined` if none.
	 */
	getEditor(input: EditorInput): IEditorDescriptor | undefined;

	/**
	 * Returns the editor descriptor for the given identifier or `undefined` if none.
	 */
	getEditorById(editorId: string): IEditorDescriptor | undefined;

	/**
	 * Returns an array of registered editors known to the platform.
	 */
	getEditors(): readonly IEditorDescriptor[];
}

/**
 * A lightweight descriptor of an editor. The descriptor is deferred so that heavy editors
 * can load lazily in the workbench.
 */
export class EditorDescriptor implements IEditorDescriptor {

	constructor(
		private readonly ctor: IConstructorSignature0<BaseEditor>,
		private readonly id: string,
		private readonly name: string
	) { }

	instantiate(instantiationService: IInstantiationService): BaseEditor {
		return instantiationService.createInstance(this.ctor);
	}

	getId(): string {
		return this.id;
	}

	getName(): string {
		return this.name;
	}

	describes(obj: unknown): boolean {
		return obj instanceof BaseEditor && obj.getId() === this.id;
	}
}

class EditorRegistry implements IEditorRegistry {

	private editors: EditorDescriptor[] = [];
	private readonly mapEditorToInputs = new Map<EditorDescriptor, readonly SyncDescriptor<EditorInput>[]>();

	registerEditor(descriptor: EditorDescriptor, inputDescriptors: readonly SyncDescriptor<EditorInput>[]): void {
		// Register (Support multiple Editors per Input)
		this.mapEditorToInputs.set(descriptor, inputDescriptors);

		this.editors.push(descriptor);
	}

	getEditor(input: EditorInput): EditorDescriptor | undefined {
		const findEditorDescriptors = (input: EditorInput, byInstanceOf?: boolean): EditorDescriptor[] => {
			const matchingDescriptors: EditorDescriptor[] = [];

			for (const editor of this.editors) {
				const inputDescriptors = this.mapEditorToInputs.get(editor) || [];
				for (const inputDescriptor of inputDescriptors) {
					const inputClass = inputDescriptor.ctor;

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
		if (descriptors.length > 0) {

			// Ask the input for its preferred Editor
			const preferredEditorId = input.getPreferredEditorId(descriptors.map(d => d.getId()));
			if (preferredEditorId) {
				return this.getEditorById(preferredEditorId);
			}

			// Otherwise, first come first serve
			return descriptors[0];
		}

		return undefined;
	}

	getEditorById(editorId: string): EditorDescriptor | undefined {
		for (const editor of this.editors) {
			if (editor.getId() === editorId) {
				return editor;
			}
		}

		return undefined;
	}

	getEditors(): readonly EditorDescriptor[] {
		return this.editors.slice(0);
	}

	setEditors(editorsToSet: EditorDescriptor[]): void {
		this.editors = editorsToSet;
	}

	getEditorInputs(): SyncDescriptor<EditorInput>[] {
		const inputClasses: SyncDescriptor<EditorInput>[] = [];
		for (const editor of this.editors) {
			const editorInputDescriptors = this.mapEditorToInputs.get(editor);
			if (editorInputDescriptors) {
				inputClasses.push(...editorInputDescriptors.map(descriptor => descriptor.ctor));
			}
		}

		return inputClasses;
	}
}

export const Extensions = {
	Editors: 'workbench.contributions.editors'
};

Registry.add(Extensions.Editors, new EditorRegistry());