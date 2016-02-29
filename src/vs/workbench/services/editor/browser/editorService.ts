/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import network = require('vs/base/common/network');
import {guessMimeTypes} from 'vs/base/common/mime';
import {Registry} from 'vs/platform/platform';
import {basename, dirname} from 'vs/base/common/paths';
import types = require('vs/base/common/types');
import {IDiffEditor, ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {ICommonCodeEditor, IModel, EditorType, IEditor as ICommonEditor} from 'vs/editor/common/editorCommon';
import {BaseEditor, IEditorRegistry, Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, IFileEditorInput, TextEditorOptions} from 'vs/workbench/common/editor';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService, EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IEditorInput, IEditorModel, IEditorOptions, Position, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

export interface IEditorPart {
	setEditors(inputs: EditorInput[], options?: EditorOptions[]): TPromise<BaseEditor[]>;
	openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	openEditor(input?: EditorInput, options?: EditorOptions, position?: Position): TPromise<BaseEditor>;
	activateEditor(editor: IEditor): void;
	closeEditors(othersOnly?: boolean): TPromise<void>;
	getActiveEditor(): BaseEditor;
	getVisibleEditors(): IEditor[];
	getActiveEditorInput(): EditorInput;
	moveEditor(from: Position, to: Position): void;
	arrangeEditors(arrangement: EditorArrangement): void;
}

export class WorkbenchEditorService implements IWorkbenchEditorService {
	public serviceId = IWorkbenchEditorService;

	private editorPart: IEditorPart;
	private fileInputDescriptor: AsyncDescriptor<IFileEditorInput>;

	constructor(
		editorPart: IEditorPart,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService?: IInstantiationService
	) {
		this.editorPart = editorPart;
		this.fileInputDescriptor = (<IEditorRegistry>Registry.as(Extensions.Editors)).getDefaultFileInput();
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;
	}

	public getActiveEditor(): IEditor {
		return this.editorPart.getActiveEditor();
	}

	public getActiveEditorInput(): IEditorInput {
		return this.editorPart.getActiveEditorInput();
	}

	public getVisibleEditors(): IEditor[] {
		return this.editorPart.getVisibleEditors();
	}

	public isVisible(input: IEditorInput, includeDiff: boolean): boolean {
		if (!input) {
			return false;
		}

		return this.getVisibleEditors().some((editor) => {
			if (!editor.input) {
				return false;
			}

			if (input.matches(editor.input)) {
				return true;
			}

			if (includeDiff) {
				let diffInput = <DiffEditorInput>editor.input;
				if (types.isFunction(diffInput.getOriginalInput) && types.isFunction(diffInput.getModifiedInput)) {
					return input.matches(diffInput.getModifiedInput()) || input.matches(diffInput.getOriginalInput());
				}
			}

			return false;
		});
	}

	public moveEditor(from: Position, to: Position): void {
		this.editorPart.moveEditor(from, to);
	}

	public arrangeEditors(arrangement: EditorArrangement): void {
		this.editorPart.arrangeEditors(arrangement);
	}

	public setEditors(inputs: IEditorInput[], options?: IEditorOptions[]): TPromise<IEditor[]>;
	public setEditors(inputs: IResourceInput[]): TPromise<IEditor[]>;
	public setEditors(inputs: any[], options?: any[]): TPromise<IEditor[]> {
		return Promise.join(inputs.map((input) => this.inputToType(input))).then((typedInputs) => {
			return this.editorPart.setEditors(typedInputs, options || inputs.map(input => {
				if (input instanceof EditorInput) {
					return null; // no options for editor inputs
				}

				return TextEditorOptions.from(input); // ITextInputs can carry settings, so support that!
			}));
		});
	}

	public openEditor(input: IEditorInput, options?: IEditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: IEditorInput, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInput, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: any, arg2?: any, arg3?: any): TPromise<IEditor> {

		// Support for closing an opened editor at a position by passing null as input
		if (input === null) {
			return this.doOpenEditor(input, null, (types.isNumber(arg2) || types.isBoolean(arg2)) ? arg2 : arg3);
		}

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return this.doOpenEditor(<EditorInput>input, <EditorOptions>arg2, arg3);
		}

		// Support opening foreign resources (such as a http link that points outside of the workbench)
		let resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI) {
			let schema = resourceInput.resource.scheme;
			if (schema === network.Schemas.http || schema === network.Schemas.https) {
				window.open(resourceInput.resource.toString());
				return TPromise.as<IEditor>(null);
			}
		}

		// Untyped Text Editor Support (required for code that uses this service below workbench level)
		let textInput = <IResourceInput>input;
		return this.inputToType(textInput).then((typedFileInput: EditorInput) => {
			if (typedFileInput) {
				return this.doOpenEditor(typedFileInput, TextEditorOptions.from(textInput), arg2);
			}

			return TPromise.as<IEditor>(null);
		});
	}

	/**
	 * Allow subclasses to implement their own behavior for opening editor (see below).
	 */
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.editorPart.openEditor(input, options, arg3);
	}

	public closeEditor(editor?: IEditor): TPromise<IEditor>;
	public closeEditor(position?: Position): TPromise<IEditor>;
	public closeEditor(arg?: any): TPromise<IEditor> {
		let targetEditor = this.findEditor(arg);
		if (targetEditor) {
			return this.editorPart.openEditor(null, null, targetEditor.position);
		}

		return TPromise.as(null);
	}

	public closeEditors(othersOnly?: boolean): TPromise<void> {
		return this.editorPart.closeEditors(othersOnly);
	}

	public focusEditor(editor?: IEditor): TPromise<IEditor>;
	public focusEditor(position?: Position): TPromise<IEditor>;
	public focusEditor(arg?: any): TPromise<IEditor> {
		let targetEditor = this.findEditor(arg);
		if (targetEditor) {
			return this.editorPart.openEditor(targetEditor.input, null, targetEditor.position);
		}

		return TPromise.as(null);
	}

	public activateEditor(editor: IEditor): void;
	public activateEditor(position: Position): void;
	public activateEditor(arg: any): void {
		let targetEditor = this.findEditor(arg);
		if (targetEditor) {
			this.editorPart.activateEditor(targetEditor);
		}
	}

	private findEditor(editor?: IEditor): BaseEditor;
	private findEditor(position?: Position): BaseEditor;
	private findEditor(arg?: any): BaseEditor {

		// Editor provided
		if (arg instanceof BaseEditor) {
			return <BaseEditor>arg;
		}

		// Find active editor
		if (types.isUndefinedOrNull(arg)) {
			return this.editorPart.getActiveEditor();
		}

		// Target position provided
		if (types.isNumber(arg)) {
			let position = <Position>arg;
			let visibleEditors = this.editorPart.getVisibleEditors();
			for (let i = 0; i < visibleEditors.length; i++) {
				let editor = <BaseEditor>visibleEditors[i];
				if (editor.position === position) {
					return editor;
				}
			}
		}

		return null;
	}

	public resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;
	public resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
	public resolveEditorModel(input: any, refresh?: boolean): TPromise<IEditorModel> {
		return this.inputToType(input).then((workbenchInput: IEditorInput) => {
			if (workbenchInput) {

				// Resolve if applicable
				if (workbenchInput instanceof EditorInput) {
					return (<EditorInput>workbenchInput).resolve(!!refresh);
				}
			}

			return TPromise.as<IEditorModel>(null);
		});
	}

	public inputToType(input: EditorInput): TPromise<IEditorInput>;
	public inputToType(input: IResourceInput): TPromise<IEditorInput>;
	public inputToType(input: any): TPromise<IEditorInput> {

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return TPromise.as<EditorInput>(<EditorInput>input);
		}

		// Base Text Editor Support for inmemory resources
		let resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI && resourceInput.resource.scheme === network.Schemas.inMemory) {

			// For in-memory resources we only support to resolve the input from the current active editor
			// because the workbench does not track editor models by in memory URL. This concept is only
			// being used in the code editor.
			let activeEditor = this.getActiveEditor();
			if (activeEditor) {
				let control = <ICommonEditor>activeEditor.getControl();
				if (types.isFunction(control.getEditorType)) {

					// Single Editor: If code editor model matches, return input from editor
					if (control.getEditorType() === EditorType.ICodeEditor) {
						let codeEditor = <ICodeEditor>control;
						let model = this.findModel(codeEditor, input);
						if (model) {
							return TPromise.as(activeEditor.input);
						}
					}

					// Diff Editor: If left or right code editor model matches, return associated input
					else if (control.getEditorType() === EditorType.IDiffEditor) {
						let diffInput = <DiffEditorInput>activeEditor.input;
						let diffCodeEditor = <IDiffEditor>control;

						let originalModel = this.findModel(diffCodeEditor.getOriginalEditor(), input);
						if (originalModel) {
							return TPromise.as(diffInput.getOriginalInput());
						}

						let modifiedModel = this.findModel(diffCodeEditor.getModifiedEditor(), input);
						if (modifiedModel) {
							return TPromise.as(diffInput.getModifiedInput());
						}
					}
				}
			}
		}

		// Untitled file support
		else if (resourceInput.resource instanceof URI && (resourceInput.resource.scheme === UntitledEditorInput.SCHEMA)) {
			return TPromise.as<EditorInput>(this.untitledEditorService.createOrGet(resourceInput.resource));
		}

		// Base Text Editor Support for file resources
		else if (this.fileInputDescriptor && resourceInput.resource instanceof URI && resourceInput.resource.scheme === network.Schemas.file) {
			return this.createFileInput(resourceInput.resource, resourceInput.mime);
		}

		// Treat an URI as ResourceEditorInput
		else if (resourceInput.resource instanceof URI) {
			return TPromise.as(this.instantiationService.createInstance(ResourceEditorInput,
				basename(resourceInput.resource.fsPath),
				dirname(resourceInput.resource.fsPath),
				resourceInput.resource));
		}

		return TPromise.as<EditorInput>(null);
	}

	private createFileInput(resource: URI, mime?: string): TPromise<IFileEditorInput> {
		return this.instantiationService.createInstance(this.fileInputDescriptor).then((typedFileInput) => {
			typedFileInput.setResource(resource);
			typedFileInput.setMime(mime || guessMimeTypes(resource.fsPath).join(', '));

			return typedFileInput;
		});
	}

	private findModel(editor: ICommonCodeEditor, input: IResourceInput): IModel {
		let model = editor.getModel();
		if (!model) {
			return null;
		}

		return model.getAssociatedResource().toString() === input.resource.toString() ? model : null;
	}
}

// Helper that implements IEditorPart through an instance of IEditorService
class EditorPartDelegate implements IEditorPart {
	private editorService: IWorkbenchEditorService;

	constructor(service: IWorkbenchEditorService) {
		this.editorService = service;
	}

	public setEditors(inputs: EditorInput[]): TPromise<BaseEditor[]> {
		return this.editorService.setEditors(inputs);
	}

	public openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.editorService.openEditor(input, options, arg3);
	}

	public getActiveEditor(): BaseEditor {
		return <BaseEditor>this.editorService.getActiveEditor();
	}


	public activateEditor(editor: IEditor): void {
		this.editorService.activateEditor(editor);
	}

	public getActiveEditorInput(): EditorInput {
		return <EditorInput>this.editorService.getActiveEditorInput();
	}

	public getVisibleEditors(): IEditor[] {
		return this.editorService.getVisibleEditors();
	}

	public moveEditor(from: Position, to: Position): void {
		this.editorService.moveEditor(from, to);
	}

	public arrangeEditors(arrangement: EditorArrangement): void {
		this.editorService.arrangeEditors(arrangement);
	}

	public closeEditors(othersOnly?: boolean): TPromise<void> {
		return this.editorService.closeEditors(othersOnly);
	}
}

export interface IDelegatingWorkbenchEditorHandler {
	(editor: BaseEditor, input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<boolean>;
	(editor: BaseEditor, input: EditorInput, options?: EditorOptions, position?: Position): TPromise<boolean>;
}

/**
 * Subclass of workbench editor service that delegates all calls to the provided editor service. Subclasses can choose to override the behavior
 * of openEditor() by providing a handler. The handler returns a promise that resolves to true or false to indicate if an action has been taken.
 * If false is returned, the service will delegate to editor service for handling the call to openEditor().
 *
 * This gives clients a chance to override the behavior of openEditor() to match their context.
 */
export class DelegatingWorkbenchEditorService extends WorkbenchEditorService {
	private editor: BaseEditor;
	private handler: IDelegatingWorkbenchEditorHandler;

	constructor(
		editor: BaseEditor,
		handler: IDelegatingWorkbenchEditorHandler,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(
			new EditorPartDelegate(editorService),
			untitledEditorService,
			instantiationService
		);

		this.editor = editor;
		this.handler = handler;
	}

	protected doOpenEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.handler(this.editor, input, options, arg3).then((result) => {
			if (result) {
				return TPromise.as<BaseEditor>(this.editor);
			}

			return super.doOpenEditor(input, options, arg3);
		});
	}
}