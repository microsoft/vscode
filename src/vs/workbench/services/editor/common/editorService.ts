/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator, ServiceIdentifier, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService, IEditor, IEditorInput, IEditorOptions, ITextEditorOptions, Position, Direction, IResourceInput, IResourceDiffInput, IResourceSideBySideInput, IUntitledResourceInput } from 'vs/platform/editor/common/editor';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { basename } from 'vs/base/common/paths';
import { EditorInput, EditorOptions, TextEditorOptions, Extensions as EditorExtensions, SideBySideEditorInput, IFileEditorInput, IFileInputFactory, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import nls = require('vs/nls');
import { getPathLabel } from 'vs/base/common/labels';
import { ResourceMap } from 'vs/base/common/map';
import { once } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
import { Schemas } from 'vs/base/common/network';

export const IWorkbenchEditorService = createDecorator<IWorkbenchEditorService>('editorService');

export type IResourceInputType = IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput;

export type ICloseEditorsFilter = { except?: IEditorInput, direction?: Direction, savedOnly?: boolean };

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IWorkbenchEditorService extends IEditorService {
	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Returns the currently active editor or null if none.
	 */
	getActiveEditor(): IEditor;

	/**
	 * Returns the currently active editor input or null if none.
	 */
	getActiveEditorInput(): IEditorInput;

	/**
	 * Returns an array of visible editors.
	 */
	getVisibleEditors(): IEditor[];

	/**
	 * Opens an Editor on the given input with the provided options at the given position. If sideBySide parameter
	 * is provided, causes the editor service to decide in what position to open the input.
	 */
	openEditor(input: IEditorInput, options?: IEditorOptions | ITextEditorOptions, position?: Position): TPromise<IEditor>;
	openEditor(input: IEditorInput, options?: IEditorOptions | ITextEditorOptions, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Specific overload to open an instance of IResourceInput, IResourceDiffInput or IResourceSideBySideInput.
	 */
	openEditor(input: IResourceInputType, position?: Position): TPromise<IEditor>;
	openEditor(input: IResourceInputType, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Similar to #openEditor() but allows to open multiple editors for different positions at the same time. If there are
	 * more than one editor per position, only the first one will be active and the others stacked behind inactive.
	 */
	openEditors(editors: { input: IResourceInputType, position?: Position }[]): TPromise<IEditor[]>;
	openEditors(editors: { input: IEditorInput, position?: Position, options?: IEditorOptions | ITextEditorOptions }[]): TPromise<IEditor[]>;
	openEditors(editors: { input: IResourceInputType }[], sideBySide?: boolean): TPromise<IEditor[]>;
	openEditors(editors: { input: IEditorInput, options?: IEditorOptions | ITextEditorOptions }[], sideBySide?: boolean): TPromise<IEditor[]>;

	/**
	 * Given a list of editors to replace, will look across all groups where this editor is open (active or hidden)
	 * and replace it with the new editor and the provied options.
	 */
	replaceEditors(editors: { toReplace: IResourceInputType, replaceWith: IResourceInputType }[], position?: Position): TPromise<IEditor[]>;
	replaceEditors(editors: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: IEditorOptions | ITextEditorOptions }[], position?: Position): TPromise<IEditor[]>;

	/**
	 * Closes the editor at the provided position.
	 */
	closeEditor(position: Position, input: IEditorInput): TPromise<void>;

	/**
	 * Closes all editors of the provided groups, or all editors across all groups
	 * if no position is provided.
	 */
	closeEditors(positions?: Position[]): TPromise<void>;

	/**
	 * Closes editors of a specific group at the provided position. If the optional editor is provided to exclude, it
	 * will not be closed. The direction can be used in that case to control if all other editors should get closed,
	 * or towards a specific direction.
	 */
	closeEditors(position: Position, filter?: ICloseEditorsFilter): TPromise<void>;

	/**
	 * Closes the provided editors of a specific group at the provided position.
	 */
	closeEditors(position: Position, editors: IEditorInput[]): TPromise<void>;

	/**
	 * Closes specific editors across all groups at once.
	 */
	closeEditors(editors: { positionOne?: ICloseEditorsFilter, positionTwo?: ICloseEditorsFilter, positionThree?: ICloseEditorsFilter }): TPromise<void>;

	/**
	 * Closes specific editors across all groups at once.
	 */
	closeEditors(editors: { positionOne?: IEditorInput[], positionTwo?: IEditorInput[], positionThree?: IEditorInput[] }): TPromise<void>;

	/**
	 * Allows to resolve an untyped input to a workbench typed instanceof editor input
	 */
	createInput(input: IResourceInputType): IEditorInput;
}

export interface IEditorPart {
	openEditor(input?: IEditorInput, options?: IEditorOptions | ITextEditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	openEditor(input?: IEditorInput, options?: IEditorOptions | ITextEditorOptions, position?: Position): TPromise<IEditor>;
	openEditors(editors: { input: IEditorInput, position?: Position, options?: IEditorOptions | ITextEditorOptions }[]): TPromise<IEditor[]>;
	openEditors(editors: { input: IEditorInput, options?: IEditorOptions | ITextEditorOptions }[], sideBySide?: boolean): TPromise<IEditor[]>;
	replaceEditors(editors: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: IEditorOptions | ITextEditorOptions }[], position?: Position): TPromise<IEditor[]>;
	closeEditors(positions?: Position[]): TPromise<void>;
	closeEditor(position: Position, input: IEditorInput): TPromise<void>;
	closeEditors(position: Position, filter?: ICloseEditorsFilter): TPromise<void>;
	closeEditors(position: Position, editors: IEditorInput[]): TPromise<void>;
	closeEditors(editors: { positionOne?: ICloseEditorsFilter, positionTwo?: ICloseEditorsFilter, positionThree?: ICloseEditorsFilter }): TPromise<void>;
	closeEditors(editors: { positionOne?: IEditorInput[], positionTwo?: IEditorInput[], positionThree?: IEditorInput[] }): TPromise<void>;
	getActiveEditor(): IEditor;
	getVisibleEditors(): IEditor[];
	getActiveEditorInput(): IEditorInput;
}

type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class WorkbenchEditorService implements IWorkbenchEditorService {

	public _serviceBrand: any;

	private static CACHE: ResourceMap<ICachedEditorInput> = new ResourceMap<ICachedEditorInput>();

	private editorPart: IEditorPart | IWorkbenchEditorService;
	private fileInputFactory: IFileInputFactory;

	constructor(
		editorPart: IEditorPart | IWorkbenchEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.editorPart = editorPart;
		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();
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

	public openEditor(input: IEditorInput, options?: IEditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: IEditorInput, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInputType, position?: Position): TPromise<IEditor>;
	public openEditor(input: IResourceInputType, sideBySide?: boolean): TPromise<IEditor>;
	public openEditor(input: any, arg2?: any, arg3?: any): TPromise<IEditor> {
		if (!input) {
			return TPromise.wrap<IEditor>(null);
		}

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return this.doOpenEditor(input, this.toOptions(arg2), arg3);
		}

		// Support opening foreign resources (such as a http link that points outside of the workbench)
		const resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI) {
			const schema = resourceInput.resource.scheme;
			if (schema === Schemas.http || schema === Schemas.https) {
				window.open(resourceInput.resource.toString(true));

				return TPromise.wrap<IEditor>(null);
			}
		}

		// Untyped Text Editor Support (required for code that uses this service below workbench level)
		const textInput = <IResourceInputType>input;
		const typedInput = this.createInput(textInput);
		if (typedInput) {
			return this.doOpenEditor(typedInput, TextEditorOptions.from(textInput), arg2);
		}

		return TPromise.wrap<IEditor>(null);
	}

	private toOptions(options?: IEditorOptions | EditorOptions): EditorOptions {
		if (!options || options instanceof EditorOptions) {
			return options as EditorOptions;
		}

		const textOptions: ITextEditorOptions = options;
		if (!!textOptions.selection) {
			return TextEditorOptions.create(options);
		}

		return EditorOptions.create(options);
	}

	/**
	 * Allow subclasses to implement their own behavior for opening editor (see below).
	 */
	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		return this.editorPart.openEditor(input, options, arg3);
	}

	public openEditors(editors: { input: IResourceInputType, position: Position }[]): TPromise<IEditor[]>;
	public openEditors(editors: { input: IEditorInput, position: Position, options?: IEditorOptions }[]): TPromise<IEditor[]>;
	public openEditors(editors: { input: IResourceInputType }[], sideBySide?: boolean): TPromise<IEditor[]>;
	public openEditors(editors: { input: IEditorInput, options?: IEditorOptions }[], sideBySide?: boolean): TPromise<IEditor[]>;
	public openEditors(editors: any[], sideBySide?: boolean): TPromise<IEditor[]> {
		const inputs = editors.map(editor => this.createInput(editor.input));
		const typedInputs: { input: IEditorInput, position: Position, options?: EditorOptions }[] = inputs.map((input, index) => {
			const options = editors[index].input instanceof EditorInput ? this.toOptions(editors[index].options) : TextEditorOptions.from(editors[index].input);

			return {
				input,
				options,
				position: editors[index].position
			};
		});

		return this.editorPart.openEditors(typedInputs, sideBySide);
	}

	public replaceEditors(editors: { toReplace: IResourceInputType, replaceWith: IResourceInputType }[], position?: Position): TPromise<IEditor[]>;
	public replaceEditors(editors: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: IEditorOptions }[], position?: Position): TPromise<IEditor[]>;
	public replaceEditors(editors: any[], position?: Position): TPromise<IEditor[]> {
		const toReplaceInputs = editors.map(editor => this.createInput(editor.toReplace));
		const replaceWithInputs = editors.map(editor => this.createInput(editor.replaceWith));
		const typedReplacements: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: EditorOptions }[] = editors.map((editor, index) => {
			const options = editor.toReplace instanceof EditorInput ? this.toOptions(editor.options) : TextEditorOptions.from(editor.replaceWith);

			return {
				toReplace: toReplaceInputs[index],
				replaceWith: replaceWithInputs[index],
				options
			};
		});

		return this.editorPart.replaceEditors(typedReplacements, position);
	}

	public closeEditor(position: Position, input: IEditorInput): TPromise<void> {
		return this.editorPart.closeEditor(position, input);
	}

	public closeEditors(positions?: Position[]): TPromise<void>;
	public closeEditors(position: Position, filter?: ICloseEditorsFilter): TPromise<void>;
	public closeEditors(position: Position, editors: IEditorInput[]): TPromise<void>;
	public closeEditors(editors: { positionOne?: ICloseEditorsFilter, positionTwo?: ICloseEditorsFilter, positionThree?: ICloseEditorsFilter }): TPromise<void>;
	public closeEditors(editors: { positionOne?: IEditorInput[], positionTwo?: IEditorInput[], positionThree?: IEditorInput[] }): TPromise<void>;
	public closeEditors(positionsOrEditors: any, filterOrEditors?: any): TPromise<void> {
		return this.editorPart.closeEditors(positionsOrEditors, filterOrEditors);
	}

	public createInput(input: IEditorInput): EditorInput;
	public createInput(input: IResourceInputType): EditorInput;
	public createInput(input: any): IEditorInput {

		// Workbench Input Support
		if (input instanceof EditorInput) {
			return input;
		}

		// Side by Side Support
		const resourceSideBySideInput = <IResourceSideBySideInput>input;
		if (resourceSideBySideInput.masterResource && resourceSideBySideInput.detailResource) {
			const masterInput = this.createInput({ resource: resourceSideBySideInput.masterResource });
			const detailInput = this.createInput({ resource: resourceSideBySideInput.detailResource });

			return new SideBySideEditorInput(resourceSideBySideInput.label || masterInput.getName(), typeof resourceSideBySideInput.description === 'string' ? resourceSideBySideInput.description : masterInput.getDescription(), detailInput, masterInput);
		}

		// Diff Editor Support
		const resourceDiffInput = <IResourceDiffInput>input;
		if (resourceDiffInput.leftResource && resourceDiffInput.rightResource) {
			const leftInput = this.createInput({ resource: resourceDiffInput.leftResource });
			const rightInput = this.createInput({ resource: resourceDiffInput.rightResource });
			const label = resourceDiffInput.label || nls.localize('compareLabels', "{0} ↔ {1}", this.toDiffLabel(leftInput, this.workspaceContextService, this.environmentService), this.toDiffLabel(rightInput, this.workspaceContextService, this.environmentService));

			return new DiffEditorInput(label, resourceDiffInput.description, leftInput, rightInput);
		}

		// Untitled file support
		const untitledInput = <IUntitledResourceInput>input;
		if (!untitledInput.resource || typeof untitledInput.filePath === 'string' || (untitledInput.resource instanceof URI && untitledInput.resource.scheme === Schemas.untitled)) {
			return this.untitledEditorService.createOrGet(untitledInput.filePath ? URI.file(untitledInput.filePath) : untitledInput.resource, untitledInput.language, untitledInput.contents, untitledInput.encoding);
		}

		// Resource Editor Support
		const resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI) {
			let label = resourceInput.label;
			if (!label && resourceInput.resource.scheme !== Schemas.data) {
				label = basename(resourceInput.resource.fsPath); // derive the label from the path (but not for data URIs)
			}

			return this.createOrGet(resourceInput.resource, this.instantiationService, label, resourceInput.description, resourceInput.encoding);
		}

		return null;
	}

	private createOrGet(resource: URI, instantiationService: IInstantiationService, label: string, description: string, encoding?: string): ICachedEditorInput {
		if (WorkbenchEditorService.CACHE.has(resource)) {
			const input = WorkbenchEditorService.CACHE.get(resource);
			if (input instanceof ResourceEditorInput) {
				input.setName(label);
				input.setDescription(description);
			} else if (!(input instanceof DataUriEditorInput)) {
				input.setPreferredEncoding(encoding);
			}

			return input;
		}

		let input: ICachedEditorInput;

		// File
		if (this.fileService.canHandleResource(resource)) {
			input = this.fileInputFactory.createFileInput(resource, encoding, instantiationService);
		}

		// Data URI
		else if (resource.scheme === Schemas.data) {
			input = instantiationService.createInstance(DataUriEditorInput, label, description, resource);
		}

		// Resource
		else {
			input = instantiationService.createInstance(ResourceEditorInput, label, description, resource);
		}

		WorkbenchEditorService.CACHE.set(resource, input);
		once(input.onDispose)(() => {
			WorkbenchEditorService.CACHE.delete(resource);
		});

		return input;
	}

	private toDiffLabel(input: EditorInput, context: IWorkspaceContextService, environment: IEnvironmentService): string {
		const res = input.getResource();

		// Do not try to extract any paths from simple untitled editors
		if (res.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(res)) {
			return input.getName();
		}

		// Otherwise: for diff labels prefer to see the path as part of the label
		return getPathLabel(res.fsPath, context, environment);
	}
}

export interface IEditorOpenHandler {
	(input: IEditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	(input: IEditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
}

export interface IEditorCloseHandler {
	(position: Position, input: IEditorInput): TPromise<void>;
}

/**
 * Subclass of workbench editor service that delegates all calls to the provided editor service. Subclasses can choose to override the behavior
 * of openEditor() and closeEditor() by providing a handler.
 *
 * This gives clients a chance to override the behavior of openEditor() and closeEditor().
 */
export class DelegatingWorkbenchEditorService extends WorkbenchEditorService {
	private editorOpenHandler: IEditorOpenHandler;

	constructor(
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService
	) {
		super(
			editorService,
			untitledEditorService,
			workspaceContextService,
			instantiationService,
			environmentService,
			fileService
		);
	}

	public setEditorOpenHandler(handler: IEditorOpenHandler): void {
		this.editorOpenHandler = handler;
	}

	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<IEditor>;
	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, position?: Position): TPromise<IEditor>;
	protected doOpenEditor(input: IEditorInput, options?: EditorOptions, arg3?: any): TPromise<IEditor> {
		const handleOpen = this.editorOpenHandler ? this.editorOpenHandler(input, options, arg3) : TPromise.as(void 0);

		return handleOpen.then(editor => {
			if (editor) {
				return TPromise.as<IEditor>(editor);
			}

			return super.doOpenEditor(input, options, arg3);
		});
	}
}
