/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import { Builder } from 'vs/base/browser/builder';
import { Registry } from 'vs/platform/platform';
import { Panel } from 'vs/workbench/browser/panel';
import { EditorInput, EditorOptions, IEditorDescriptor, IEditorInputFactory, IEditorRegistry, Extensions, IFileInputFactory } from 'vs/workbench/common/editor';
import { IEditor, Position } from 'vs/platform/editor/common/editor';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor, AsyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';

/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench. Only one editor can be open at a time.
 * Each editor has a minimized representation that is good enough to provide some information about the
 * state of the editor data.
 * The workbench will keep an editor alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a editor goes in the order create(), setVisible(true|false),
 * layout(), setInput(), focus(), dispose(). During use of the workbench, a editor will often receive a
 * clearInput, setVisible, layout and focus call, but only one create and dispose call.
 *
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseEditor extends Panel implements IEditor {
	protected _input: EditorInput;
	private _options: EditorOptions;
	private _position: Position;

	constructor(id: string, telemetryService: ITelemetryService, themeService: IThemeService) {
		super(id, telemetryService, themeService);
	}

	public get input(): EditorInput {
		return this._input;
	}

	public get options(): EditorOptions {
		return this._options;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given input with the options to the part. An editor has to deal with the
	 * situation that the same input is being set with different options.
	 */
	public setInput(input: EditorInput, options?: EditorOptions): TPromise<void> {
		this._input = input;
		this._options = options;

		return TPromise.as<void>(null);
	}

	/**
	 * Called to indicate to the editor that the input should be cleared and resources associated with the
	 * input should be freed.
	 */
	public clearInput(): void {
		this._input = null;
		this._options = null;
	}

	public create(parent: Builder): void; // create is sync for editors
	public create(parent: Builder): TPromise<void>;
	public create(parent: Builder): TPromise<void> {
		const res = super.create(parent);

		// Create Editor
		this.createEditor(parent);

		return res;
	}

	/**
	 * Called to create the editor in the parent builder.
	 */
	protected abstract createEditor(parent: Builder): void;

	/**
	 * Overload this function to allow for passing in a position argument.
	 */
	public setVisible(visible: boolean, position?: Position): void; // setVisible is sync for editors
	public setVisible(visible: boolean, position?: Position): TPromise<void>;
	public setVisible(visible: boolean, position: Position = null): TPromise<void> {
		const promise = super.setVisible(visible);

		// Propagate to Editor
		this.setEditorVisible(visible, position);

		return promise;
	}

	protected setEditorVisible(visible: boolean, position: Position = null): void {
		this._position = position;
	}

	/**
	 * Called when the position of the editor changes while it is visible.
	 */
	public changePosition(position: Position): void {
		this._position = position;
	}

	/**
	 * The position this editor is showing in or null if none.
	 */
	public get position(): Position {
		return this._position;
	}

	public dispose(): void {
		this._input = null;
		this._options = null;

		// Super Dispose
		super.dispose();
	}
}

/**
 * A lightweight descriptor of an editor. The descriptor is deferred so that heavy editors
 * can load lazily in the workbench.
 */
export class EditorDescriptor extends AsyncDescriptor<BaseEditor> implements IEditorDescriptor {
	private id: string;
	private name: string;

	constructor(id: string, name: string, moduleId: string, ctorName: string) {
		super(moduleId, ctorName);

		this.id = id;
		this.name = name;
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
	private instantiationService: IInstantiationService;
	private fileInputFactory: IFileInputFactory;
	private editorInputFactoryConstructors: { [editorInputId: string]: IConstructorSignature0<IEditorInputFactory> } = Object.create(null);
	private editorInputFactoryInstances: { [editorInputId: string]: IEditorInputFactory } = Object.create(null);

	constructor() {
		this.editors = [];
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;

		for (let key in this.editorInputFactoryConstructors) {
			const element = this.editorInputFactoryConstructors[key];
			this.createEditorInputFactory(key, element);
		}

		this.editorInputFactoryConstructors = {};
	}

	private createEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		const instance = this.instantiationService.createInstance(ctor);
		this.editorInputFactoryInstances[editorInputId] = instance;
	}

	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>[]): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: any): void {

		// Support both non-array and array parameter
		let inputDescriptors: SyncDescriptor<EditorInput>[] = [];
		if (!types.isArray(editorInputDescriptor)) {
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

	public registerFileInputFactory(factory: IFileInputFactory): void {
		this.fileInputFactory = factory;
	}

	public getFileInputFactory(): IFileInputFactory {
		return this.fileInputFactory;
	}

	public registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		if (!this.instantiationService) {
			this.editorInputFactoryConstructors[editorInputId] = ctor;
		} else {
			this.createEditorInputFactory(editorInputId, ctor);
		}
	}

	public getEditorInputFactory(editorInputId: string): IEditorInputFactory {
		return this.editorInputFactoryInstances[editorInputId];
	}
}

Registry.add(Extensions.Editors, new EditorRegistry());