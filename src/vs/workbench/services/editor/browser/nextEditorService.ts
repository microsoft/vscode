/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IResourceInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditor, ITextEditorOptions, IEditorOptions } from 'vs/platform/editor/common/editor';
import { GroupIdentifier, IFileEditorInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IFileInputFactory, EditorInput, SideBySideEditorInput, EditorOptions, TextEditorOptions } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { ResourceMap } from 'vs/base/common/map';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { getPathLabel } from 'vs/base/common/labels';
import { once } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorGroupsService, INextEditorGroup } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { INextEditorService, IResourceEditor, SIDE_BY_SIDE } from 'vs/workbench/services/editor/common/nextEditorService';

type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class NextEditorService implements INextEditorService {

	_serviceBrand: any;

	private static CACHE: ResourceMap<ICachedEditorInput> = new ResourceMap<ICachedEditorInput>();

	private fileInputFactory: IFileInputFactory;

	constructor(
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService
	) {
		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();
	}

	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;
	openEditor(editor: IResourceEditor, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;
	openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | GroupIdentifier, group?: GroupIdentifier): Thenable<IEditor> {

		// Typed Editor Support
		if (editor instanceof EditorInput) {
			return this.doOpenEditor(editor, this.toOptions(optionsOrGroup as IEditorOptions), group);
		}

		// Throw error for well known foreign resources (such as a http link) (TODO@ben remove me after this has been adopted)
		const resourceInput = <IResourceInput>editor;
		if (resourceInput.resource instanceof URI) {
			const schema = resourceInput.resource.scheme;
			if (schema === Schemas.http || schema === Schemas.https) {
				return TPromise.wrapError(new Error('Invalid scheme http/https to open resource as editor. Use IOpenerService instead.'));
			}
		}

		// Untyped Text Editor Support
		const textInput = <IResourceEditor>editor;
		const typedInput = this.createInput(textInput);
		if (typedInput) {
			return this.doOpenEditor(typedInput, TextEditorOptions.from(textInput), optionsOrGroup as GroupIdentifier);
		}

		return TPromise.wrap<IEditor>(null);
	}

	private doOpenEditor(input: IEditorInput, options?: EditorOptions, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor> {
		let targetGroup: INextEditorGroup;

		if (group === -1) {
			group = void 0; // TODO@grid find correct side group based on active group
		}

		if (typeof group === 'number') {
			targetGroup = this.nextEditorGroupsService.getGroup(group);
		}

		if (!targetGroup) {
			targetGroup = this.nextEditorGroupsService.activeGroup;
		}

		return targetGroup.openEditor(input, options).then(() => targetGroup.activeControl);
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

	createInput(input: IEditorInput | IResourceEditor): EditorInput {

		// Typed Editor Input Support
		if (input instanceof EditorInput) {
			return input;
		}

		// Side by Side Support
		const resourceSideBySideInput = <IResourceSideBySideInput>input;
		if (resourceSideBySideInput.masterResource && resourceSideBySideInput.detailResource) {
			const masterInput = this.createInput({ resource: resourceSideBySideInput.masterResource });
			const detailInput = this.createInput({ resource: resourceSideBySideInput.detailResource });

			return new SideBySideEditorInput(
				resourceSideBySideInput.label || masterInput.getName(),
				typeof resourceSideBySideInput.description === 'string' ? resourceSideBySideInput.description : masterInput.getDescription(),
				detailInput,
				masterInput
			);
		}

		// Diff Editor Support
		const resourceDiffInput = <IResourceDiffInput>input;
		if (resourceDiffInput.leftResource && resourceDiffInput.rightResource) {
			const leftInput = this.createInput({ resource: resourceDiffInput.leftResource });
			const rightInput = this.createInput({ resource: resourceDiffInput.rightResource });
			const label = resourceDiffInput.label || localize('compareLabels', "{0} ↔ {1}", this.toDiffLabel(leftInput, this.workspaceContextService, this.environmentService), this.toDiffLabel(rightInput, this.workspaceContextService, this.environmentService));

			return new DiffEditorInput(label, resourceDiffInput.description, leftInput, rightInput);
		}

		// Untitled file support
		const untitledInput = <IUntitledResourceInput>input;
		if (!untitledInput.resource || typeof untitledInput.filePath === 'string' || (untitledInput.resource instanceof URI && untitledInput.resource.scheme === Schemas.untitled)) {
			return this.untitledEditorService.createOrGet(
				untitledInput.filePath ? URI.file(untitledInput.filePath) : untitledInput.resource,
				untitledInput.language,
				untitledInput.contents,
				untitledInput.encoding
			);
		}

		// Resource Editor Support
		const resourceInput = <IResourceInput>input;
		if (resourceInput.resource instanceof URI) {
			let label = resourceInput.label;
			if (!label && resourceInput.resource.scheme !== Schemas.data) {
				label = basename(resourceInput.resource.fsPath); // derive the label from the path (but not for data URIs)
			}

			return this.createOrGet(resourceInput.resource, this.instantiationService, label, resourceInput.description, resourceInput.encoding) as EditorInput;
		}

		return null;
	}

	private createOrGet(resource: URI, instantiationService: IInstantiationService, label: string, description: string, encoding?: string): ICachedEditorInput {
		if (NextEditorService.CACHE.has(resource)) {
			const input = NextEditorService.CACHE.get(resource);
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

		NextEditorService.CACHE.set(resource, input);
		once(input.onDispose)(() => {
			NextEditorService.CACHE.delete(resource);
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

//#region TODO@grid adopt legacy code to find a position based on options
// private findPosition(input: EditorInput, options ?: EditorOptions, sideBySide ?: boolean, ratio ?: number[]): Position;
// 	private findPosition(input: EditorInput, options ?: EditorOptions, desiredPosition ?: Position, ratio ?: number[]): Position;
// 	private findPosition(input: EditorInput, options ?: EditorOptions, arg1 ?: any, ratio ?: number[]): Position {

// 	// With defined ratios, always trust the provided position
// 	if (ratio && types.isNumber(arg1)) {
// 		return arg1;
// 	}

// 	// No editor open
// 	const visibleEditors = this.getVisibleEditors();
// 	const activeEditor = this.getActiveEditor();
// 	if (visibleEditors.length === 0 || !activeEditor) {
// 		return Position.ONE; // can only be ONE
// 	}

// 	// Ignore revealIfVisible/revealIfOpened option if we got instructed explicitly to
// 	// * open at a specific index
// 	// * open to the side
// 	// * open in a specific group
// 	const skipReveal = (options && options.index) || arg1 === true /* open to side */ || typeof arg1 === 'number' /* open specific group */;

// 	// Respect option to reveal an editor if it is already visible
// 	if (!skipReveal && options && options.revealIfVisible) {
// 		const group = this.stacks.findGroup(input, true);
// 		if (group) {
// 			return this.stacks.positionOfGroup(group);
// 		}
// 	}

// 	// Respect option to reveal an editor if it is open (not necessarily visible)
// 	if (!skipReveal && (this.revealIfOpen /* workbench.editor.revealIfOpen */ || (options && options.revealIfOpened))) {
// 		const group = this.stacks.findGroup(input);
// 		if (group) {
// 			return this.stacks.positionOfGroup(group);
// 		}
// 	}

// 	// Position is unknown: pick last active or ONE
// 	if (types.isUndefinedOrNull(arg1) || arg1 === false) {
// 		const lastActivePosition = this.editorGroupsControl.getActivePosition();

// 		return lastActivePosition || Position.ONE;
// 	}

// 	// Position is sideBySide: Find position relative to active editor
// 	if (arg1 === true) {
// 		switch (activeEditor.position) {
// 			case Position.ONE:
// 				return Position.TWO;
// 			case Position.TWO:
// 				return Position.THREE;
// 			case Position.THREE:
// 				return null; // Cannot open to the side of the right/bottom most editor
// 		}

// 		return null; // Prevent opening to the side
// 	}

// 	// Position is provided, validate it
// 	if (arg1 === Position.THREE && visibleEditors.length === 1) {
// 		return Position.TWO;
// 	}

// 	return arg1;
// }
//#endregion