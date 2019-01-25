/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IResourceInput, ITextEditorOptions, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor, GroupIdentifier, IFileEditorInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IFileInputFactory, EditorInput, SideBySideEditorInput, IEditorInputWithOptions, isEditorInputWithOptions, EditorOptions, TextEditorOptions, IEditorIdentifier, IEditorCloseEvent, ITextEditor, ITextDiffEditor, ITextSideBySideEditor, toResource } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { ResourceMap } from 'vs/base/common/map';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { localize } from 'vs/nls';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, IEditorReplacement, GroupChangeKind, preferredSideBySideGroupDirection } from 'vs/workbench/services/group/common/editorGroupsService';
import { IResourceEditor, ACTIVE_GROUP_TYPE, SIDE_GROUP_TYPE, SIDE_GROUP, IResourceEditorReplacement, IOpenEditorOverrideHandler } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { coalesce } from 'vs/base/common/arrays';
import { isCodeEditor, isDiffEditor, ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupView, IEditorOpeningEvent, EditorGroupsServiceImpl, EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { ILabelService } from 'vs/platform/label/common/label';

type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class EditorService extends Disposable implements EditorServiceImpl {

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
	private lastActiveGroupId: GroupIdentifier;

	constructor(
		@IEditorGroupsService private readonly editorGroupService: EditorGroupsServiceImpl,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.editorGroupService.whenRestored.then(() => this.onEditorsRestored());
		this.editorGroupService.onDidActiveGroupChange(group => this.handleActiveEditorChange(group));
		this.editorGroupService.onDidAddGroup(group => this.registerGroupListeners(group as IEditorGroupView));
	}

	private onEditorsRestored(): void {

		// Register listeners to each opened group
		this.editorGroupService.groups.forEach(group => this.registerGroupListeners(group as IEditorGroupView));

		// Fire initial set of editor events if there is an active editor
		if (this.activeEditor) {
			this.doEmitActiveEditorChangeEvent();
			this._onDidVisibleEditorsChange.fire();
		}
	}

	private handleActiveEditorChange(group: IEditorGroup): void {
		if (group !== this.editorGroupService.activeGroup) {
			return; // ignore if not the active group
		}

		if (!this.lastActiveEditor && !group.activeEditor) {
			return; // ignore if we still have no active editor
		}

		if (this.lastActiveGroupId === group.id && this.lastActiveEditor === group.activeEditor) {
			return; // ignore if the editor actually did not change
		}

		this.doEmitActiveEditorChangeEvent();
	}

	private doEmitActiveEditorChangeEvent(): void {
		const activeGroup = this.editorGroupService.activeGroup;

		this.lastActiveGroupId = activeGroup.id;
		this.lastActiveEditor = activeGroup.activeEditor;

		this._onDidActiveEditorChange.fire();
	}

	private registerGroupListeners(group: IEditorGroupView): void {
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

		Event.once(group.onWillDispose)(() => {
			dispose(groupDisposeables);
		});
	}

	private onGroupWillOpenEditor(group: IEditorGroup, event: IEditorOpeningEvent): void {
		for (const handler of this.openEditorHandlers) {
			const result = handler(event.editor, event.options, group);
			if (result && result.override) {
				event.prevent((() => result.override));
				break;
			}
		}
	}

	get activeControl(): IEditor {
		const activeGroup = this.editorGroupService.activeGroup;

		return activeGroup ? activeGroup.activeControl : undefined;
	}

	get activeTextEditorWidget(): ICodeEditor | IDiffEditor {
		const activeControl = this.activeControl;
		if (activeControl) {
			const activeControlWidget = activeControl.getControl();
			if (isCodeEditor(activeControlWidget) || isDiffEditor(activeControlWidget)) {
				return activeControlWidget;
			}
		}

		return undefined;
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

		return activeGroup ? activeGroup.activeEditor : undefined;
	}

	get visibleControls(): IEditor[] {
		return coalesce(this.editorGroupService.groups.map(group => group.activeControl));
	}

	get visibleTextEditorWidgets(): Array<ICodeEditor | IDiffEditor> {
		return this.visibleControls.map(control => control.getControl() as ICodeEditor | IDiffEditor).filter(widget => isCodeEditor(widget) || isDiffEditor(widget));
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

	//#region openEditor()

	openEditor(editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditor>;
	openEditor(editor: IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextEditor>;
	openEditor(editor: IResourceDiffInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextDiffEditor>;
	openEditor(editor: IResourceSideBySideInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextSideBySideEditor>;
	openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | ITextEditorOptions | IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE, group?: GroupIdentifier): Promise<IEditor> {

		// Typed Editor Support
		if (editor instanceof EditorInput) {
			const editorOptions = this.toOptions(optionsOrGroup as IEditorOptions);
			const targetGroup = this.findTargetGroup(editor, editorOptions, group);

			return this.doOpenEditor(targetGroup, editor, editorOptions);
		}

		// Untyped Text Editor Support
		const textInput = <IResourceEditor>editor;
		const typedInput = this.createInput(textInput);
		if (typedInput) {
			const editorOptions = TextEditorOptions.from(textInput);
			const targetGroup = this.findTargetGroup(typedInput, editorOptions, optionsOrGroup as IEditorGroup | GroupIdentifier);

			return this.doOpenEditor(targetGroup, typedInput, editorOptions);
		}

		return Promise.resolve(null);
	}

	protected doOpenEditor(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions): Promise<IEditor> {
		return group.openEditor(editor, options);
	}

	private findTargetGroup(input: IEditorInput, options?: IEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): IEditorGroup {
		let targetGroup: IEditorGroup;

		// Group: Instance of Group
		if (group && typeof group !== 'number') {
			return group;
		}

		// Group: Side by Side
		if (group === SIDE_GROUP) {
			targetGroup = this.findSideBySideGroup();
		}

		// Group: Specific Group
		else if (typeof group === 'number' && group >= 0) {
			targetGroup = this.editorGroupService.getGroup(group);
		}

		// Group: Unspecified without a specific index to open
		else if (!options || typeof options.index !== 'number') {
			const groupsByLastActive = this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);

			// Respect option to reveal an editor if it is already visible in any group
			if (options && options.revealIfVisible) {
				for (const group of groupsByLastActive) {
					if (input.matches(group.activeEditor)) {
						targetGroup = group;
						break;
					}
				}
			}

			// Respect option to reveal an editor if it is open (not necessarily visible)
			if ((options && options.revealIfOpened) || this.configurationService.getValue<boolean>('workbench.editor.revealIfOpen')) {
				for (const group of groupsByLastActive) {
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
		const direction = preferredSideBySideGroupDirection(this.configurationService);

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

	openEditors(editors: IEditorInputWithOptions[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditor[]>;
	openEditors(editors: IResourceEditor[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditor[]>;
	openEditors(editors: Array<IEditorInputWithOptions | IResourceEditor>, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditor[]> {

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
		const result: Promise<IEditor>[] = [];
		mapGroupToEditors.forEach((editorsWithOptions, group) => {
			result.push(group.openEditors(editorsWithOptions));
		});

		return Promise.all(result);
	}

	//#endregion

	//#region isOpen()

	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): boolean {
		return !!this.doGetOpened(editor);
	}

	//#endregion

	//#region getOpend()

	getOpened(editor: IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): IEditorInput {
		return this.doGetOpened(editor);
	}

	private doGetOpened(editor: IEditorInput | IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): IEditorInput {
		if (!(editor instanceof EditorInput)) {
			const resourceInput = editor as IResourceInput | IUntitledResourceInput;
			if (!resourceInput.resource) {
				return undefined; // we need a resource at least
			}
		}

		let groups: IEditorGroup[] = [];
		if (typeof group === 'number') {
			groups.push(this.editorGroupService.getGroup(group));
		} else if (group) {
			groups.push(group);
		} else {
			groups = [...this.editorGroupService.groups];
		}

		// For each editor group
		for (const group of groups) {

			// Typed editor
			if (editor instanceof EditorInput) {
				if (group.isOpened(editor)) {
					return editor;
				}
			}

			// Resource editor
			else {
				for (const editorInGroup of group.editors) {
					const resource = toResource(editorInGroup, { supportSideBySide: true });
					if (!resource) {
						continue; // need a resource to compare with
					}

					const resourceInput = editor as IResourceInput | IUntitledResourceInput;
					if (resource.toString() === resourceInput.resource.toString()) {
						return editorInGroup;
					}
				}
			}
		}

		return undefined;
	}

	//#endregion

	//#region replaceEditors()

	replaceEditors(editors: IResourceEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	replaceEditors(editors: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	replaceEditors(editors: Array<IEditorReplacement | IResourceEditorReplacement>, group: IEditorGroup | GroupIdentifier): Promise<void> {
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
		const activeTextEditorWidget = this.activeTextEditorWidget;
		if (isCodeEditor(activeTextEditorWidget)) {
			return activeTextEditorWidget.invokeWithinContext(fn);
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
			const masterInput = this.createInput({ resource: resourceSideBySideInput.masterResource, forceFile: resourceSideBySideInput.forceFile });
			const detailInput = this.createInput({ resource: resourceSideBySideInput.detailResource, forceFile: resourceSideBySideInput.forceFile });

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
			const leftInput = this.createInput({ resource: resourceDiffInput.leftResource, forceFile: resourceDiffInput.forceFile });
			const rightInput = this.createInput({ resource: resourceDiffInput.rightResource, forceFile: resourceDiffInput.forceFile });
			const label = resourceDiffInput.label || localize('compareLabels', "{0} ↔ {1}", this.toDiffLabel(leftInput), this.toDiffLabel(rightInput));

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

			return this.createOrGet(resourceInput.resource, this.instantiationService, label, resourceInput.description, resourceInput.encoding, resourceInput.forceFile) as EditorInput;
		}

		return null;
	}

	private createOrGet(resource: URI, instantiationService: IInstantiationService, label: string, description: string, encoding?: string, forceFile?: boolean): ICachedEditorInput {
		if (EditorService.CACHE.has(resource)) {
			const input = EditorService.CACHE.get(resource);
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
		if (forceFile /* fix for https://github.com/Microsoft/vscode/issues/48275 */ || this.fileService.canHandleResource(resource)) {
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

		EditorService.CACHE.set(resource, input);
		Event.once(input.onDispose)(() => {
			EditorService.CACHE.delete(resource);
		});

		return input;
	}

	private toDiffLabel(input: EditorInput): string {
		const res = input.getResource();

		// Do not try to extract any paths from simple untitled editors
		if (res.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(res)) {
			return input.getName();
		}

		// Otherwise: for diff labels prefer to see the path as part of the label
		return this.labelService.getUriLabel(res, { relative: true });
	}

	//#endregion
}

export interface IEditorOpenHandler {
	(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions): Promise<IEditor>;
}

/**
 * The delegating workbench editor service can be used to override the behaviour of the openEditor()
 * method by providing a IEditorOpenHandler.
 */
export class DelegatingEditorService extends EditorService {
	private editorOpenHandler: IEditorOpenHandler;

	constructor(
		@IEditorGroupsService editorGroupService: EditorGroupsServiceImpl,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(
			editorGroupService,
			untitledEditorService,
			instantiationService,
			labelService,
			fileService,
			configurationService
		);
	}

	setEditorOpenHandler(handler: IEditorOpenHandler): void {
		this.editorOpenHandler = handler;
	}

	protected doOpenEditor(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions): Promise<IEditor> {
		if (!this.editorOpenHandler) {
			return super.doOpenEditor(group, editor, options);
		}

		return this.editorOpenHandler(group, editor, options).then(control => {
			if (control) {
				return control; // the opening was handled, so return early
			}

			return super.doOpenEditor(group, editor, options);
		});
	}
}
