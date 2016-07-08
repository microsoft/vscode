/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import network = require('vs/base/common/network');
import {guessMimeTypes} from 'vs/base/common/mime';
import {Registry} from 'vs/platform/platform';
import {basename, dirname} from 'vs/base/common/paths';
import types = require('vs/base/common/types');
import {IDiffEditor, ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {ICommonCodeEditor, IModel, EditorType, IEditor as ICommonEditor} from 'vs/editor/common/editorCommon';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, IFileEditorInput, TextEditorOptions, IEditorRegistry, Extensions} from 'vs/workbench/common/editor';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEditorInput, IEditorModel, IEditorOptions, ITextEditorOptions, Position, Direction, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {AsyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';

export interface IEditorPart {
	openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	openEditor(input?: EditorInput, options?: EditorOptions, position?: Position): TPromise<BaseEditor>;
	openEditors(editors: { input: EditorInput, position: Position, options?: EditorOptions }[]): TPromise<BaseEditor[]>;
	replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: EditorOptions }[]): TPromise<BaseEditor[]>;
	closeEditor(position: Position, input: IEditorInput): TPromise<void>;
	closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void>;
	closeAllEditors(except?: Position): TPromise<void>;
	getActiveEditor(): BaseEditor;
	getVisibleEditors(): IEditor[];
	getActiveEditorInput(): EditorInput;
}

export class WorkbenchEditorService implements IWorkbenchEditorService {

	public _serviceBrand: any;

	private editorPart: IEditorPart | IWorkbenchEditorService;
	private fileInputDescriptor: AsyncDescriptor0<IFileEditorInput>;

	constructor(
		editorPart: IEditorPart | IWorkbenchEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService?: IInstantiationService
	) {
		this.editorPart = editorPart;
		this.fileInputDescriptor = (<IEditorRegistry>Registry.as(Extensions.Editors)).getDefaultFileInput();
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

			if (includeDiff && editor.input instanceof DiffEditorInput) {
				let diffInput = <DiffEditorInput>editor.input;
				return input.matches(diffInput.modifiedInput) || input.matches(diffInput.originalInput);
			}

			return false;
		});
	}

	public openEditor(input: IEditorInput, options?: IEditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: IEditorInput, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInput, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: any, arg2?: any, arg3?: any): TPromise<IEditor> {
		if (!input) {
			return TPromise.as<IEditor>(null);
		}

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return this.doOpenEditor(input, this.toOptions(arg2), arg3);
		}

		// Support opening foreign resources (such as a http link that points outside of the workbench)
		let resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI) {
			let schema = resourceInput.resource.scheme;
			if (schema === network.Schemas.http || schema === network.Schemas.https) {
				window.open(resourceInput.resource.toString(true));
				return TPromise.as<IEditor>(null);
			}
		}

		// Untyped Text Editor Support (required for code that uses this service below workbench level)
		let textInput = <IResourceInput>input;
		return this.createInput(textInput).then((typedFileInput: EditorInput) => {
			if (typedFileInput) {
				return this.doOpenEditor(typedFileInput, TextEditorOptions.from(textInput), arg2);
			}

			return TPromise.as<IEditor>(null);
		});
	}

	private toOptions(arg1?: any): EditorOptions {
		if (!arg1 || arg1 instanceof EditorOptions) {
			return arg1;
		}

		const textOptions: ITextEditorOptions = arg1;
		if (!!textOptions.selection) {
			return TextEditorOptions.create(arg1);
		}

		return EditorOptions.create(arg1);
	}

	/**
	 * Allow subclasses to implement their own behavior for opening editor (see below).
	 */
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.editorPart.openEditor(input, options, arg3);
	}

	public openEditors(editors: { input: IResourceInput, position: Position }[]): TPromise<IEditor[]>;
	public openEditors(editors: { input: IEditorInput, position: Position, options?: IEditorOptions }[]): TPromise<IEditor[]>;
	public openEditors(editors: any[]): TPromise<IEditor[]> {
		return TPromise.join(editors.map(editor => this.createInput(editor.input))).then(inputs => {
			const typedInputs: { input: EditorInput, position: Position, options?: EditorOptions }[] = inputs.map((input, index) => {
				const options = editors[index].input instanceof EditorInput ? this.toOptions(editors[index].options) : TextEditorOptions.from(editors[index].input);

				return {
					input,
					options,
					position: editors[index].position
				};
			});

			return this.editorPart.openEditors(typedInputs);
		});
	}

	public replaceEditors(editors: { toReplace: IResourceInput, replaceWith: IResourceInput }[]): TPromise<BaseEditor[]>;
	public replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: IEditorOptions }[]): TPromise<BaseEditor[]>;
	public replaceEditors(editors: any[]): TPromise<BaseEditor[]> {
		return TPromise.join(editors.map(editor => this.createInput(editor.toReplace))).then(toReplaceInputs => {
			return TPromise.join(editors.map(editor => this.createInput(editor.replaceWith))).then(replaceWithInputs => {
				const typedReplacements: { toReplace: EditorInput, replaceWith: EditorInput, options?: EditorOptions }[] = editors.map((editor, index) => {
					const options = editor.toReplace instanceof EditorInput ? this.toOptions(editor.options) : TextEditorOptions.from(editor.replaceWith);

					return {
						toReplace: toReplaceInputs[index],
						replaceWith: replaceWithInputs[index],
						options
					};
				});

				return this.editorPart.replaceEditors(typedReplacements);
			});
		});
	}

	public closeEditor(position: Position, input: IEditorInput): TPromise<void> {
		return this.editorPart.closeEditor(position, input);
	}

	public closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void> {
		return this.editorPart.closeEditors(position, except, direction);
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		return this.editorPart.closeAllEditors(except);
	}

	public resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;
	public resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
	public resolveEditorModel(input: any, refresh?: boolean): TPromise<IEditorModel> {
		return this.createInput(input).then((workbenchInput: IEditorInput) => {
			if (workbenchInput) {

				// Resolve if applicable
				if (workbenchInput instanceof EditorInput) {
					return workbenchInput.resolve(!!refresh);
				}
			}

			return TPromise.as<IEditorModel>(null);
		});
	}

	public createInput(input: EditorInput): TPromise<EditorInput>;
	public createInput(input: IResourceInput): TPromise<EditorInput>;
	public createInput(input: any): TPromise<IEditorInput> {

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return TPromise.as<EditorInput>(input);
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
							return TPromise.as(diffInput.originalInput);
						}

						let modifiedModel = this.findModel(diffCodeEditor.getModifiedEditor(), input);
						if (modifiedModel) {
							return TPromise.as(diffInput.modifiedInput);
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
			return this.createFileInput(resourceInput.resource, resourceInput.mime, resourceInput.encoding);
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

	private createFileInput(resource: URI, mime?: string, encoding?: string): TPromise<IFileEditorInput> {
		return this.instantiationService.createInstance(this.fileInputDescriptor).then((typedFileInput) => {
			typedFileInput.setResource(resource);
			typedFileInput.setMime(mime || guessMimeTypes(resource.fsPath).join(', '));
			typedFileInput.setPreferredEncoding(encoding);

			return typedFileInput;
		});
	}

	private findModel(editor: ICommonCodeEditor, input: IResourceInput): IModel {
		let model = editor.getModel();
		if (!model) {
			return null;
		}

		return model.uri.toString() === input.resource.toString() ? model : null;
	}
}

export interface IDelegatingWorkbenchEditorServiceHandler {
	(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	(input: EditorInput, options?: EditorOptions, position?: Position): TPromise<BaseEditor>;
}

/**
 * Subclass of workbench editor service that delegates all calls to the provided editor service. Subclasses can choose to override the behavior
 * of openEditor() by providing a handler. The handler returns a promise that resolves to an editor to indicate if an action has been taken.
 * If falsify is returned, the service will delegate to editor service for handling the call to openEditor().
 *
 * This gives clients a chance to override the behavior of openEditor() to match their context.
 */
export class DelegatingWorkbenchEditorService extends WorkbenchEditorService {
	private handler: IDelegatingWorkbenchEditorServiceHandler;

	constructor(
		handler: IDelegatingWorkbenchEditorServiceHandler,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(
			editorService,
			untitledEditorService,
			instantiationService
		);

		this.handler = handler;
	}

	protected doOpenEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: EditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.handler(input, options, arg3).then(editor => {
			if (editor) {
				return TPromise.as<BaseEditor>(editor);
			}

			return super.doOpenEditor(input, options, arg3);
		});
	}
}