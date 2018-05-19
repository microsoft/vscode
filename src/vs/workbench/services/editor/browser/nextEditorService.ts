/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IResourceInput, ITextEditorOptions, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor, GroupIdentifier, IFileEditorInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IFileInputFactory, EditorInput, SideBySideEditorInput, IEditorInputWithOptions, isEditorInputWithOptions, EditorOptions, TextEditorOptions, IEditorIdentifier, IEditorCloseEvent, IEditorOpeningEvent } from 'vs/workbench/common/editor';
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
import { INextEditorGroupsService, IEditorGroup, GroupsOrder, IEditorReplacement, GroupChangeKind, preferredGroupDirection } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { INextEditorService, IResourceEditor, ACTIVE_GROUP_TYPE, SIDE_GROUP_TYPE, SIDE_GROUP, ACTIVE_GROUP, IResourceEditorReplacement, IOpenEditorOverrideHandler } from 'vs/workbench/services/editor/common/nextEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { coalesce } from 'vs/base/common/arrays';
import { isCodeEditor, isDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditor as ITextEditor } from 'vs/editor/common/editorCommon';

type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class NextEditorService extends Disposable implements INextEditorService {

	_serviceBrand: any;

	private static CACHE: ResourceMap<ICachedEditorInput> = new ResourceMap<ICachedEditorInput>();

	//#region events

	private _onDidActiveEditorChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidActiveEditorChange(): Event<void> { return this._onDidActiveEditorChange.event; }

	private _onDidVisibleEditorsChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidVisibleEditorsChange(): Event<void> { return this._onDidVisibleEditorsChange.event; }

	private _onDidCloseEditor: Emitter<IEditorCloseEvent> = this._register(new Emitter<IEditorCloseEvent>());
	get onDidCloseEditor(): Event<IEditorCloseEvent> { return this._onDidCloseEditor.event; }

	private _onDidOpenEditorFail: Emitter<IEditorIdentifier> = this._register(new Emitter<IEditorIdentifier>());
	get onDidOpenEditorFail(): Event<IEditorIdentifier> { return this._onDidOpenEditorFail.event; }

	//#endregion

	private fileInputFactory: IFileInputFactory;
	private openEditorHandlers: IOpenEditorOverrideHandler[] = [];
	private lastActiveEditor: IEditorInput;

	constructor(
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.editorGroupService.whenRestored.then(() => this.editorGroupService.groups.forEach(group => this.registerGroupListeners(group)));
		this.editorGroupService.onDidActiveGroupChange(group => this.handleActiveEditorChange(group));
		this.editorGroupService.onDidAddGroup(group => this.registerGroupListeners(group));
	}

	private handleActiveEditorChange(group: IEditorGroup): void {
		if (group !== this.editorGroupService.activeGroup) {
			return; // ignore if not the active group
		}

		if (!this.lastActiveEditor && !group.activeEditor) {
			return; // ignore if we still have no active editor
		}

		this.lastActiveEditor = group.activeEditor;

		this._onDidActiveEditorChange.fire();
	}

	private registerGroupListeners(group: IEditorGroup): void {
		const groupDisposeables: IDisposable[] = [];

		groupDisposeables.push(group.onDidGroupChange(e => {
			if (e.kind === GroupChangeKind.EDITOR_ACTIVE) {
				this.handleActiveEditorChange(group);
				this._onDidVisibleEditorsChange.fire();
			}
		}));

		groupDisposeables.push(group.onDidCloseEditor(event => {
			this._onDidCloseEditor.fire(event);
		}));

		groupDisposeables.push(group.onWillOpenEditor(event => {
			this.onGroupWillOpenEditor(group, event);
		}));

		groupDisposeables.push(group.onDidOpenEditorFail(editor => {
			this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
		}));

		once(group.onWillDispose)(() => {
			dispose(groupDisposeables);
		});
	}

	private onGroupWillOpenEditor(group: IEditorGroup, event: IEditorOpeningEvent): void {
		for (let i = 0; i < this.openEditorHandlers.length; i++) {
			const handler = this.openEditorHandlers[i];
			const result = handler(event.editor, event.options, group);
			if (result && result.override) {
				event.prevent((() => result.override));
				break;
			}
		}
	}

	get activeControl(): IEditor {
		const activeGroup = this.editorGroupService.activeGroup;

		return activeGroup ? activeGroup.activeControl : void 0;
	}

	get activeTextEditorControl(): ITextEditor {
		const activeControl = this.activeControl;
		if (activeControl) {
			const activeControlWidget = activeControl.getControl();
			if (isCodeEditor(activeControlWidget) || isDiffEditor(activeControlWidget)) {
				return activeControlWidget;
			}
		}

		return void 0;
	}

	get editors(): IEditorInput[] {
		const editors: IEditorInput[] = [];
		this.editorGroupService.groups.forEach(group => {
			editors.push(...group.editors);
		});

		return editors;
	}

	get activeEditor(): IEditorInput {
		const activeGroup = this.editorGroupService.activeGroup;

		return activeGroup ? activeGroup.activeEditor : void 0;
	}

	get visibleControls(): IEditor[] {
		return coalesce(this.editorGroupService.groups.map(group => group.activeControl));
	}

	get visibleTextEditorControls(): ITextEditor[] {
		return this.visibleControls.map(control => control.getControl() as ITextEditor).filter(widget => isCodeEditor(widget) || isDiffEditor(widget));
	}

	get visibleEditors(): IEditorInput[] {
		return coalesce(this.editorGroupService.groups.map(group => group.activeEditor));
	}

	//#region preventOpenEditor()

	overrideOpenEditor(handler: IOpenEditorOverrideHandler): IDisposable {
		this.openEditorHandlers.push(handler);

		return toDisposable(() => {
			const index = this.openEditorHandlers.indexOf(handler);
			if (index >= 0) {
				this.openEditorHandlers.splice(index, 1);
			}
		});
	}

	//#endregion

	//#region openTextEditor()

	openTextEditor(editor: IResourceInput, sideBySide?: boolean): TPromise<ICodeEditor> {
		return this.openEditor(editor, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(control => {
			if (!control) {
				return null;
			}

			if (control) {
				const widget = control.getControl();
				if (isCodeEditor(widget)) {
					return widget;
				}
			}

			return null;
		});
	}

	//#endregion

	//#region openEditor()

	openEditor(editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): TPromise<IEditor>;
	openEditor(editor: IResourceEditor, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): TPromise<IEditor>;
	openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | ITextEditorOptions | IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE, group?: GroupIdentifier): TPromise<IEditor> {

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
			const targetGroup = this.findTargetGroup(typedInput, editorOptions, optionsOrGroup as IEditorGroup | GroupIdentifier);

			return this.doOpenEditor(targetGroup, typedInput, editorOptions);
		}

		return TPromise.wrap<IEditor>(null);
	}

	protected doOpenEditor(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions): TPromise<IEditor> {
		return group.openEditor(editor, options).then(() => group.activeControl);
	}

	private findTargetGroup(input: IEditorInput, options?: IEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): IEditorGroup {
		let targetGroup: IEditorGroup;

		// Group: Instance of Group
		if (group && typeof group !== 'number') {
			return group;
		}

		// Group: Active Group
		if (group === ACTIVE_GROUP) {
			targetGroup = this.editorGroupService.activeGroup;
		}

		// Group: Side by Side
		else if (group === SIDE_GROUP) {
			targetGroup = this.findSideBySideGroup();
		}

		// Group: Specific Group
		else if (typeof group === 'number') {
			targetGroup = this.editorGroupService.getGroup(group);
		}

		// Group: Unspecified without a specific index to open
		else if (!options || typeof options.index !== 'number') {
			const groupsByLastActive = this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);

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
			targetGroup = this.editorGroupService.activeGroup;
		}

		return targetGroup;
	}

	private findSideBySideGroup(): IEditorGroup {
		const direction = preferredGroupDirection(this.configurationService);

		let neighbourGroup = this.editorGroupService.findGroup({ direction });
		if (!neighbourGroup) {
			neighbourGroup = this.editorGroupService.addGroup(this.editorGroupService.activeGroup, direction);
		}

		return neighbourGroup;
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

	openEditors(editors: IEditorInputWithOptions[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): TPromise<IEditor[]>;
	openEditors(editors: IResourceEditor[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): TPromise<IEditor[]>;
	openEditors(editors: (IEditorInputWithOptions | IResourceEditor)[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): TPromise<IEditor[]> {

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
		const mapGroupToEditors = new Map<IEditorGroup, IEditorInputWithOptions[]>();
		if (group === SIDE_GROUP) {
			mapGroupToEditors.set(this.findSideBySideGroup(), typedEditors);
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
			result.push((group.openEditors(editorsWithOptions)).then(() => group.activeControl));
		});

		return TPromise.join(result);
	}

	//#endregion

	//#region isOpen()

	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): boolean {
		let groups: IEditorGroup[] = [];
		if (typeof group === 'number') {
			groups.push(this.editorGroupService.getGroup(group));
		} else if (group) {
			groups.push(group);
		} else {
			groups = [...this.editorGroupService.groups];
		}

		return groups.some(group => {
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

	//#region replaceEditors()

	replaceEditors(editors: IResourceEditorReplacement[], group: IEditorGroup | GroupIdentifier): TPromise<void>;
	replaceEditors(editors: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): TPromise<void>;
	replaceEditors(editors: (IEditorReplacement | IResourceEditorReplacement)[], group: IEditorGroup | GroupIdentifier): TPromise<void> {
		const typedEditors: IEditorReplacement[] = [];

		editors.forEach(replaceEditorArg => {
			if (replaceEditorArg.editor instanceof EditorInput) {
				typedEditors.push(replaceEditorArg as IEditorReplacement);
			} else {
				const editor = replaceEditorArg.editor as IResourceEditor;
				const typedEditor = this.createInput(editor);
				const replacementEditor = this.createInput(replaceEditorArg.replacement as IResourceEditor);

				typedEditors.push({
					editor: typedEditor,
					replacement: replacementEditor,
					options: this.toOptions(editor.options)
				});
			}
		});

		const targetGroup = typeof group === 'number' ? this.editorGroupService.getGroup(group) : group;
		return targetGroup.replaceEditors(typedEditors);
	}

	//#endregion

	//#region invokeWithinEditorContext()

	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		const activeTextEditorControl = this.activeTextEditorControl;
		if (isCodeEditor(activeTextEditorControl)) {
			return activeTextEditorControl.invokeWithinContext(fn);
		}

		const activeGroup = this.editorGroupService.activeGroup;
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
	(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions): TPromise<IEditor>;
}

/**
 * The delegating workbench editor service can be used to override the behaviour of the openEditor()
 * method by providing a IEditorOpenHandler.
 */
export class DelegatingWorkbenchEditorService extends NextEditorService {
	private editorOpenHandler: IEditorOpenHandler;

	constructor(
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(
			editorGroupService,
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

	protected doOpenEditor(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions): TPromise<IEditor> {
		const handleOpen = this.editorOpenHandler ? this.editorOpenHandler(group, editor, options) : TPromise.as(void 0);

		return handleOpen.then(control => {
			if (control) {
				return TPromise.as<IEditor>(control); // the opening was handled, so return early
			}

			return super.doOpenEditor(group, editor, options);
		});
	}
}
