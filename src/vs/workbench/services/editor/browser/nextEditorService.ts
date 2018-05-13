/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IResourceInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditor, ITextEditorOptions, IEditorOptions } from 'vs/platform/editor/common/editor';
import { GroupIdentifier, IFileEditorInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IFileInputFactory, EditorInput, SideBySideEditorInput, IEditorInputWithOptions, isEditorInputWithOptions, EditorOptions, TextEditorOptions, IEditorOpeningEvent, IEditorIdentifier } from 'vs/workbench/common/editor';
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
import { Event, once, Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { INextEditorGroupsService, INextEditorGroup, GroupDirection, GroupsOrder } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { INextEditorService, IResourceEditor, ACTIVE_GROUP_TYPE, SIDE_GROUP_TYPE, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/nextEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { coalesce } from 'vs/base/common/arrays';
import { isCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { toWinJsPromise } from 'vs/base/common/async';

type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class NextEditorService extends Disposable implements INextEditorService {

	_serviceBrand: any;

	private static CACHE: ResourceMap<ICachedEditorInput> = new ResourceMap<ICachedEditorInput>();

	//#region events

	private _onDidActiveEditorChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidActiveEditorChange(): Event<void> { return this._onDidActiveEditorChange.event; }

	private _onDidVisibleEditorsChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidVisibleEditorsChange(): Event<void> { return this._onDidVisibleEditorsChange.event; }

	private _onWillCloseEditor: Emitter<IEditorIdentifier> = this._register(new Emitter<IEditorIdentifier>());
	get onWillCloseEditor(): Event<IEditorIdentifier> { return this._onWillCloseEditor.event; }

	private _onDidCloseEditor: Emitter<IEditorIdentifier> = this._register(new Emitter<IEditorIdentifier>());
	get onDidCloseEditor(): Event<IEditorIdentifier> { return this._onDidCloseEditor.event; }

	private _onWillOpenEditor: Emitter<IEditorOpeningEvent> = this._register(new Emitter<IEditorOpeningEvent>());
	get onWillOpenEditor(): Event<IEditorOpeningEvent> { return this._onWillOpenEditor.event; }

	private _onDidOpenEditorFail: Emitter<IEditorIdentifier> = this._register(new Emitter<IEditorIdentifier>());
	get onDidOpenEditorFail(): Event<IEditorIdentifier> { return this._onDidOpenEditorFail.event; }

	//#endregion

	private fileInputFactory: IFileInputFactory;

	private lastActiveEditor: IEditorInput;

	constructor(
		@INextEditorGroupsService private nextEditorGroupsService: INextEditorGroupsService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();

		// Listen to changes for each initial group we already have
		this.nextEditorGroupsService.groups.forEach(group => this.onDidAddGroup(group));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.nextEditorGroupsService.onDidActiveGroupChange(group => this.handleActiveEditorChange(group));
		this.nextEditorGroupsService.onDidAddGroup(group => this.onDidAddGroup(group));
	}

	private handleActiveEditorChange(group: INextEditorGroup): void {
		if (group !== this.nextEditorGroupsService.activeGroup) {
			return; // ignore if not the active group
		}

		if (!this.lastActiveEditor && !group.activeEditor) {
			return; // ignore if we still have no active editor
		}

		this.lastActiveEditor = group.activeEditor;

		this._onDidActiveEditorChange.fire();
	}

	private onDidAddGroup(group: INextEditorGroup): void {
		const groupDisposeables: IDisposable[] = [];

		groupDisposeables.push(group.onDidActiveEditorChange(() => {
			this.handleActiveEditorChange(group);
			this._onDidVisibleEditorsChange.fire();
		}));

		groupDisposeables.push(group.onWillCloseEditor(editor => {
			this._onWillCloseEditor.fire({ editor, group: group.id });
		}));

		groupDisposeables.push(group.onDidCloseEditor(editor => {
			this._onDidCloseEditor.fire({ editor, group: group.id });
		}));

		groupDisposeables.push(group.onWillOpenEditor(editor => {
			this._onWillOpenEditor.fire(editor);
		}));

		groupDisposeables.push(group.onDidOpenEditorFail(editor => {
			this._onDidOpenEditorFail.fire({ editor, group: group.id });
		}));

		once(group.onWillDispose)(() => {
			dispose(groupDisposeables);
		});
	}

	get activeControl(): IEditor {
		const activeGroup = this.nextEditorGroupsService.activeGroup;

		return activeGroup ? activeGroup.activeControl : void 0;
	}

	get activeTextEditorControl(): ICodeEditor {
		const activeControl = this.activeControl;
		if (activeControl) {
			const activeControlWidget = activeControl.getControl();
			if (isCodeEditor(activeControlWidget)) {
				return activeControlWidget;
			}
		}

		return void 0;
	}

	get activeEditor(): IEditorInput {
		const activeGroup = this.nextEditorGroupsService.activeGroup;

		return activeGroup ? activeGroup.activeEditor : void 0;
	}

	get visibleControls(): IEditor[] {
		return coalesce(this.nextEditorGroupsService.groups.map(group => group.activeControl));
	}

	get visibleTextEditorControls(): ICodeEditor[] {
		return this.visibleControls.map(control => control.getControl() as ICodeEditor).filter(widget => isCodeEditor(widget));
	}

	get visibleEditors(): IEditorInput[] {
		return coalesce(this.nextEditorGroupsService.groups.map(group => group.activeEditor));
	}

	//#region openEditor()

	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Thenable<IEditor>;
	openEditor(editor: IResourceEditor, group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Thenable<IEditor>;
	openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE, group?: GroupIdentifier): Thenable<IEditor> {

		// Typed Editor Support
		if (editor instanceof EditorInput) {
			const editorOptions = this.toOptions(optionsOrGroup as IEditorOptions);
			const targetGroup = this.findTargetGroup(editor, editorOptions, group);

			return this.doOpenEditor(targetGroup, editor, editorOptions);
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
			const editorOptions = TextEditorOptions.from(textInput);
			const targetGroup = this.findTargetGroup(typedInput, editorOptions, optionsOrGroup as INextEditorGroup | GroupIdentifier);

			return this.doOpenEditor(targetGroup, typedInput, editorOptions);
		}

		return TPromise.wrap<IEditor>(null);
	}

	protected doOpenEditor(group: INextEditorGroup, editor: IEditorInput, options?: IEditorOptions): Thenable<IEditor> {
		return group.openEditor(editor, options).then(() => group.activeControl);
	}

	private findTargetGroup(input: IEditorInput, options?: IEditorOptions, group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): INextEditorGroup {
		let targetGroup: INextEditorGroup;

		// Group: Instance of Group
		if (group && typeof group !== 'number') {
			return group;
		}

		// Group: Active Group
		if (group === ACTIVE_GROUP) {
			targetGroup = this.nextEditorGroupsService.activeGroup;
		}

		// Group: Side by Side
		else if (group === SIDE_GROUP) {
			targetGroup = this.createSideBySideGroup();
		}

		// Group: Specific Group
		else if (typeof group === 'number') {
			targetGroup = this.nextEditorGroupsService.getGroup(group);
		}

		// Group: Unspecified without a specific index to open
		else if (!options || typeof options.index !== 'number') {
			const groupsByLastActive = this.nextEditorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);

			// Respect option to reveal an editor if it is already visible in any group
			if (options && options.revealIfVisible) {
				for (let i = 0; i < groupsByLastActive.length; i++) {
					const group = groupsByLastActive[i];
					if (input.matches(group.activeEditor)) {
						targetGroup = group;
						break;
					}
				}
			}

			// Respect option to reveal an editor if it is open (not necessarily visible)
			if ((options && options.revealIfOpened) || this.configurationService.getValue<boolean>('workbench.editor.revealIfOpen')) {
				for (let i = 0; i < groupsByLastActive.length; i++) {
					const group = groupsByLastActive[i];
					if (group.isOpened(input)) {
						targetGroup = group;
						break;
					}
				}
			}
		}

		// Fallback to active group if target not valid
		if (!targetGroup) {
			targetGroup = this.nextEditorGroupsService.activeGroup;
		}

		return targetGroup;
	}

	private createSideBySideGroup(): INextEditorGroup {
		return this.nextEditorGroupsService.addGroup(this.nextEditorGroupsService.activeGroup, GroupDirection.RIGHT); // TODO@grid this should use an existing side group if there is one
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

	//#endregion

	//#region openEditors()

	openEditors(editors: IEditorInputWithOptions[], group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Thenable<IEditor[]>;
	openEditors(editors: IResourceEditor[], group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Thenable<IEditor[]>;
	openEditors(editors: (IEditorInputWithOptions | IResourceEditor)[], group?: INextEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Thenable<IEditor[]> {

		// Convert to typed editors and options
		const typedEditors: IEditorInputWithOptions[] = [];
		editors.forEach(editor => {
			if (isEditorInputWithOptions(editor)) {
				typedEditors.push(editor);
			} else {
				typedEditors.push({ editor: this.createInput(editor), options: TextEditorOptions.from(editor) });
			}
		});

		// Find target groups to open
		const mapGroupToEditors = new Map<INextEditorGroup, IEditorInputWithOptions[]>();
		if (group === SIDE_GROUP) {
			mapGroupToEditors.set(this.createSideBySideGroup(), typedEditors);
		} else {
			typedEditors.forEach(typedEditor => {
				const targetGroup = this.findTargetGroup(typedEditor.editor, typedEditor.options, group);

				let targetGroupEditors = mapGroupToEditors.get(targetGroup);
				if (!targetGroupEditors) {
					targetGroupEditors = [];
					mapGroupToEditors.set(targetGroup, targetGroupEditors);
				}

				targetGroupEditors.push(typedEditor);
			});
		}

		// Open in targets
		const result: TPromise<IEditor>[] = [];
		mapGroupToEditors.forEach((editorsWithOptions, group) => {
			result.push((toWinJsPromise(group.openEditors(editorsWithOptions))).then(() => group.activeControl));
		});

		return TPromise.join(result);
	}

	//#endregion

	//#region isOpen()

	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput): boolean {
		return this.nextEditorGroupsService.groups.some(group => {
			if (editor instanceof EditorInput) {
				return group.isOpened(editor);
			}

			const resourceInput = editor as IResourceInput | IUntitledResourceInput;
			if (!resourceInput.resource) {
				return false;
			}

			return group.editors.some(editorInGroup => {
				const resource = editorInGroup.getResource();

				return resource && resource.toString() === resourceInput.resource.toString();
			});
		});
	}

	//#endregion

	//#region invokeWithinEditorContext()

	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		const activeTextEditorControl = this.activeTextEditorControl;
		if (activeTextEditorControl) {
			return activeTextEditorControl.invokeWithinContext(fn);
		}

		const activeGroup = this.nextEditorGroupsService.activeGroup;
		if (activeGroup) {
			return activeGroup.invokeWithinContext(fn);
		}

		return this.instantiationService.invokeFunction(fn);
	}

	//#endregion

	//#region createInput()

	createInput(input: IEditorInputWithOptions | IEditorInput | IResourceEditor): EditorInput {

		// Typed Editor Input Support (EditorInput)
		if (input instanceof EditorInput) {
			return input;
		}

		// Typed Editor Input Support (IEditorInputWithOptions)
		const editorInputWithOptions = input as IEditorInputWithOptions;
		if (editorInputWithOptions.editor instanceof EditorInput) {
			return editorInputWithOptions.editor;
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

	//#endregion
}

export interface IEditorOpenHandler {
	(group: INextEditorGroup, editor: IEditorInput, options?: IEditorOptions): Thenable<IEditor>;
}

/**
 * The delegating workbench editor service can be used to override the behaviour of the openEditor()
 * method by providing a IEditorOpenHandler.
 */
export class DelegatingWorkbenchEditorService extends NextEditorService {
	private editorOpenHandler: IEditorOpenHandler;

	constructor(
		@INextEditorGroupsService nextEditorGroupsService: INextEditorGroupsService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(
			nextEditorGroupsService,
			untitledEditorService,
			workspaceContextService,
			instantiationService,
			environmentService,
			fileService,
			configurationService
		);
	}

	setEditorOpenHandler(handler: IEditorOpenHandler): void {
		this.editorOpenHandler = handler;
	}

	protected doOpenEditor(group: INextEditorGroup, editor: IEditorInput, options?: IEditorOptions): Thenable<IEditor> {
		const handleOpen = this.editorOpenHandler ? this.editorOpenHandler(group, editor, options) : TPromise.as(void 0);

		return handleOpen.then(control => {
			if (control) {
				return TPromise.as<IEditor>(control); // the opening was handled, so return early
			}

			return super.doOpenEditor(group, editor, options);
		});
	}
}