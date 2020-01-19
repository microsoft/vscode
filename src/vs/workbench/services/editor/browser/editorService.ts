/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IResourceInput, ITextEditorOptions, IEditorOptions, EditorActivation } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor, GroupIdentifier, IFileEditorInput, IUntitledTextResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditorInputFactoryRegistry, Extensions as EditorExtensions, IFileInputFactory, EditorInput, SideBySideEditorInput, IEditorInputWithOptions, isEditorInputWithOptions, EditorOptions, TextEditorOptions, IEditorIdentifier, IEditorCloseEvent, ITextEditor, ITextDiffEditor, ITextSideBySideEditor, toResource, SideBySideEditor, IRevertOptions, SaveReason, EditorsOrder } from 'vs/workbench/common/editor';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { ResourceMap } from 'vs/base/common/map';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { basename, isEqual } from 'vs/base/common/resources';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, IEditorReplacement, GroupChangeKind, preferredSideBySideGroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IResourceEditor, SIDE_GROUP, IResourceEditorReplacement, IOpenEditorOverrideHandler, IVisibleEditor, IEditorService, SIDE_GROUP_TYPE, ACTIVE_GROUP_TYPE, ISaveEditorsOptions, ISaveAllEditorsOptions, IRevertAllEditorsOptions, IBaseSaveRevertAllEditorOptions } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable, dispose, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { coalesce } from 'vs/base/common/arrays';
import { isCodeEditor, isDiffEditor, ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupView, IEditorOpeningEvent, EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { ILabelService } from 'vs/platform/label/common/label';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { withNullAsUndefined } from 'vs/base/common/types';
import { EditorsObserver } from 'vs/workbench/browser/parts/editor/editorsObserver';

type CachedEditorInput = ResourceEditorInput | IFileEditorInput;
type OpenInEditorGroup = IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE;

export class EditorService extends Disposable implements EditorServiceImpl {

	_serviceBrand: undefined;

	private static CACHE = new ResourceMap<CachedEditorInput>();

	//#region events

	private readonly _onDidActiveEditorChange = this._register(new Emitter<void>());
	readonly onDidActiveEditorChange = this._onDidActiveEditorChange.event;

	private readonly _onDidVisibleEditorsChange = this._register(new Emitter<void>());
	readonly onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;

	private readonly _onDidCloseEditor = this._register(new Emitter<IEditorCloseEvent>());
	readonly onDidCloseEditor = this._onDidCloseEditor.event;

	private readonly _onDidOpenEditorFail = this._register(new Emitter<IEditorIdentifier>());
	readonly onDidOpenEditorFail = this._onDidOpenEditorFail.event;

	private readonly _onDidMostRecentlyActiveEditorsChange = this._register(new Emitter<void>());
	readonly onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;

	//#endregion

	private fileInputFactory: IFileInputFactory;
	private readonly openEditorHandlers: IOpenEditorOverrideHandler[] = [];

	private lastActiveEditor: IEditorInput | undefined = undefined;

	private readonly editorsObserver = this._register(this.instantiationService.createInstance(EditorsObserver));

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
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

		// Editor & group changes
		this.editorGroupService.whenRestored.then(() => this.onEditorsRestored());
		this.editorGroupService.onDidActiveGroupChange(group => this.handleActiveEditorChange(group));
		this.editorGroupService.onDidAddGroup(group => this.registerGroupListeners(group as IEditorGroupView));
		this.editorsObserver.onDidChange(() => this._onDidMostRecentlyActiveEditorsChange.fire());
	}

	private onEditorsRestored(): void {

		// Register listeners to each opened group
		this.editorGroupService.groups.forEach(group => this.registerGroupListeners(group as IEditorGroupView));

		// Fire initial set of editor events if there is an active editor
		if (this.activeEditor) {
			this.doHandleActiveEditorChangeEvent();
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

		this.doHandleActiveEditorChangeEvent();
	}

	private doHandleActiveEditorChangeEvent(): void {

		// Remember as last active
		const activeGroup = this.editorGroupService.activeGroup;
		this.lastActiveEditor = withNullAsUndefined(activeGroup.activeEditor);

		// Fire event to outside parties
		this._onDidActiveEditorChange.fire();
	}

	private registerGroupListeners(group: IEditorGroupView): void {
		const groupDisposables = new DisposableStore();

		groupDisposables.add(group.onDidGroupChange(e => {
			if (e.kind === GroupChangeKind.EDITOR_ACTIVE) {
				this.handleActiveEditorChange(group);
				this._onDidVisibleEditorsChange.fire();
			}
		}));

		groupDisposables.add(group.onDidCloseEditor(event => {
			this._onDidCloseEditor.fire(event);
		}));

		groupDisposables.add(group.onWillOpenEditor(event => {
			this.onGroupWillOpenEditor(group, event);
		}));

		groupDisposables.add(group.onDidOpenEditorFail(editor => {
			this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
		}));

		Event.once(group.onWillDispose)(() => {
			dispose(groupDisposables);
		});
	}

	private onGroupWillOpenEditor(group: IEditorGroup, event: IEditorOpeningEvent): void {
		if (event.options && event.options.ignoreOverrides) {
			return;
		}

		for (const handler of this.openEditorHandlers) {
			const result = handler(event.editor, event.options, group);
			const override = result?.override;
			if (override) {
				event.prevent((() => override.then(editor => withNullAsUndefined(editor))));
				break;
			}
		}
	}

	get activeControl(): IVisibleEditor | undefined {
		return this.editorGroupService.activeGroup?.activeControl;
	}

	get activeTextEditorWidget(): ICodeEditor | IDiffEditor | undefined {
		const activeControl = this.activeControl;
		if (activeControl) {
			const activeControlWidget = activeControl.getControl();
			if (isCodeEditor(activeControlWidget) || isDiffEditor(activeControlWidget)) {
				return activeControlWidget;
			}
		}

		return undefined;
	}

	get activeTextEditorMode(): string | undefined {
		let activeCodeEditor: ICodeEditor | undefined = undefined;

		const activeTextEditorWidget = this.activeTextEditorWidget;
		if (isDiffEditor(activeTextEditorWidget)) {
			activeCodeEditor = activeTextEditorWidget.getModifiedEditor();
		} else {
			activeCodeEditor = activeTextEditorWidget;
		}

		return activeCodeEditor?.getModel()?.getLanguageIdentifier().language;
	}

	get count(): number {
		return this.editorsObserver.count;
	}

	get editors(): IEditorInput[] {
		return this.getEditors(EditorsOrder.SEQUENTIAL).map(({ editor }) => editor);
	}

	getEditors(order: EditorsOrder): ReadonlyArray<IEditorIdentifier> {
		if (order === EditorsOrder.MOST_RECENTLY_ACTIVE) {
			return this.editorsObserver.editors;
		}

		const editors: IEditorIdentifier[] = [];

		this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach(group => {
			editors.push(...group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => ({ editor, groupId: group.id })));
		});

		return editors;
	}

	get activeEditor(): IEditorInput | undefined {
		const activeGroup = this.editorGroupService.activeGroup;

		return activeGroup ? withNullAsUndefined(activeGroup.activeEditor) : undefined;
	}

	get visibleControls(): IVisibleEditor[] {
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

	openEditor(editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions, group?: OpenInEditorGroup): Promise<IEditor | undefined>;
	openEditor(editor: IResourceInput | IUntitledTextResourceInput, group?: OpenInEditorGroup): Promise<ITextEditor | undefined>;
	openEditor(editor: IResourceDiffInput, group?: OpenInEditorGroup): Promise<ITextDiffEditor | undefined>;
	openEditor(editor: IResourceSideBySideInput, group?: OpenInEditorGroup): Promise<ITextSideBySideEditor | undefined>;
	async openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | ITextEditorOptions | OpenInEditorGroup, group?: OpenInEditorGroup): Promise<IEditor | undefined> {
		const result = this.doResolveEditorOpenRequest(editor, optionsOrGroup, group);
		if (result) {
			const [resolvedGroup, resolvedEditor, resolvedOptions] = result;

			return withNullAsUndefined(await resolvedGroup.openEditor(resolvedEditor, resolvedOptions));
		}

		return undefined;
	}

	doResolveEditorOpenRequest(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | ITextEditorOptions | OpenInEditorGroup, group?: OpenInEditorGroup): [IEditorGroup, EditorInput, EditorOptions | undefined] | undefined {
		let resolvedGroup: IEditorGroup | undefined;
		let candidateGroup: OpenInEditorGroup | undefined;

		let typedEditor: EditorInput | undefined;
		let typedOptions: EditorOptions | undefined;

		// Typed Editor Support
		if (editor instanceof EditorInput) {
			typedEditor = editor;
			typedOptions = this.toOptions(optionsOrGroup as IEditorOptions);

			candidateGroup = group;
			resolvedGroup = this.findTargetGroup(typedEditor, typedOptions, candidateGroup);
		}

		// Untyped Text Editor Support
		else {
			const textInput = <IResourceEditor>editor;
			typedEditor = this.createInput(textInput);
			if (typedEditor) {
				typedOptions = TextEditorOptions.from(textInput);

				candidateGroup = optionsOrGroup as OpenInEditorGroup;
				resolvedGroup = this.findTargetGroup(typedEditor, typedOptions, candidateGroup);
			}
		}

		if (typedEditor && resolvedGroup) {
			if (
				this.editorGroupService.activeGroup !== resolvedGroup && 	// only if target group is not already active
				typedOptions && !typedOptions.inactive &&					// never for inactive editors
				typedOptions.preserveFocus &&								// only if preserveFocus
				typeof typedOptions.activation !== 'number' &&				// only if activation is not already defined (either true or false)
				candidateGroup !== SIDE_GROUP								// never for the SIDE_GROUP
			) {
				// If the resolved group is not the active one, we typically
				// want the group to become active. There are a few cases
				// where we stay away from encorcing this, e.g. if the caller
				// is already providing `activation`.
				//
				// Specifically for historic reasons we do not activate a
				// group is it is opened as `SIDE_GROUP` with `preserveFocus:true`.
				// repeated Alt-clicking of files in the explorer always open
				// into the same side group and not cause a group to be created each time.
				typedOptions.overwrite({ activation: EditorActivation.ACTIVATE });
			}

			return [resolvedGroup, typedEditor, typedOptions];
		}

		return undefined;
	}

	private findTargetGroup(input: IEditorInput, options?: IEditorOptions, group?: OpenInEditorGroup): IEditorGroup {
		let targetGroup: IEditorGroup | undefined;

		// Group: Instance of Group
		if (group && typeof group !== 'number') {
			targetGroup = group;
		}

		// Group: Side by Side
		else if (group === SIDE_GROUP) {
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
			if (options?.revealIfVisible) {
				for (const group of groupsByLastActive) {
					if (group.isActive(input)) {
						targetGroup = group;
						break;
					}
				}
			}

			// Respect option to reveal an editor if it is open (not necessarily visible)
			// Still prefer to reveal an editor in a group where the editor is active though.
			if (!targetGroup) {
				if (options?.revealIfOpened || this.configurationService.getValue<boolean>('workbench.editor.revealIfOpen')) {
					let groupWithInputActive: IEditorGroup | undefined = undefined;
					let groupWithInputOpened: IEditorGroup | undefined = undefined;

					for (const group of groupsByLastActive) {
						if (group.isOpened(input)) {
							if (!groupWithInputOpened) {
								groupWithInputOpened = group;
							}

							if (!groupWithInputActive && group.isActive(input)) {
								groupWithInputActive = group;
							}
						}

						if (groupWithInputOpened && groupWithInputActive) {
							break; // we found all groups we wanted
						}
					}

					// Prefer a target group where the input is visible
					targetGroup = groupWithInputActive || groupWithInputOpened;
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

	private toOptions(options?: IEditorOptions | ITextEditorOptions | EditorOptions): EditorOptions {
		if (!options || options instanceof EditorOptions) {
			return options as EditorOptions;
		}

		const textOptions: ITextEditorOptions = options;
		if (textOptions.selection || textOptions.viewState) {
			return TextEditorOptions.create(options);
		}

		return EditorOptions.create(options);
	}

	//#endregion

	//#region openEditors()

	openEditors(editors: IEditorInputWithOptions[], group?: OpenInEditorGroup): Promise<IEditor[]>;
	openEditors(editors: IResourceEditor[], group?: OpenInEditorGroup): Promise<IEditor[]>;
	async openEditors(editors: Array<IEditorInputWithOptions | IResourceEditor>, group?: OpenInEditorGroup): Promise<IEditor[]> {

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

		// Open in target groups
		const result: Promise<IEditor | null>[] = [];
		mapGroupToEditors.forEach((editorsWithOptions, group) => {
			result.push(group.openEditors(editorsWithOptions));
		});

		return coalesce(await Promise.all(result));
	}

	//#endregion

	//#region isOpen()

	isOpen(editor: IEditorInput | IResourceInput | IUntitledTextResourceInput): boolean {
		return !!this.doGetOpened(editor);
	}

	//#endregion

	//#region getOpend()

	getOpened(editor: IResourceInput | IUntitledTextResourceInput): IEditorInput | undefined {
		return this.doGetOpened(editor);
	}

	private doGetOpened(editor: IEditorInput | IResourceInput | IUntitledTextResourceInput): IEditorInput | undefined {
		if (!(editor instanceof EditorInput)) {
			const resourceInput = editor as IResourceInput | IUntitledTextResourceInput;
			if (!resourceInput.resource) {
				return undefined; // we need a resource at least
			}
		}

		// For each editor group
		for (const group of this.editorGroupService.groups) {

			// Typed editor
			if (editor instanceof EditorInput) {
				if (group.isOpened(editor)) {
					return editor;
				}
			}

			// Resource editor
			else {
				for (const editorInGroup of group.editors) {
					const resource = toResource(editorInGroup, { supportSideBySide: SideBySideEditor.MASTER });
					if (!resource) {
						continue; // need a resource to compare with
					}

					const resourceInput = editor as IResourceInput | IUntitledTextResourceInput;
					if (resourceInput.resource && isEqual(resource, resourceInput.resource)) {
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
				const replacementArg = replaceEditorArg as IEditorReplacement;

				typedEditors.push({
					editor: replacementArg.editor,
					replacement: replacementArg.replacement,
					options: this.toOptions(replacementArg.options)
				});
			} else {
				const replacementArg = replaceEditorArg as IResourceEditorReplacement;

				typedEditors.push({
					editor: this.createInput(replacementArg.editor),
					replacement: this.createInput(replacementArg.replacement),
					options: this.toOptions(replacementArg.replacement.options)
				});
			}
		});

		const targetGroup = typeof group === 'number' ? this.editorGroupService.getGroup(group) : group;
		if (targetGroup) {
			return targetGroup.replaceEditors(typedEditors);
		}

		return Promise.resolve();
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
		const resourceSideBySideInput = input as IResourceSideBySideInput;
		if (resourceSideBySideInput.masterResource && resourceSideBySideInput.detailResource) {
			const masterInput = this.createInput({ resource: resourceSideBySideInput.masterResource, forceFile: resourceSideBySideInput.forceFile });
			const detailInput = this.createInput({ resource: resourceSideBySideInput.detailResource, forceFile: resourceSideBySideInput.forceFile });

			return new SideBySideEditorInput(
				resourceSideBySideInput.label || this.toSideBySideLabel(detailInput, masterInput, '-'),
				resourceSideBySideInput.description,
				detailInput,
				masterInput
			);
		}

		// Diff Editor Support
		const resourceDiffInput = input as IResourceDiffInput;
		if (resourceDiffInput.leftResource && resourceDiffInput.rightResource) {
			const leftInput = this.createInput({ resource: resourceDiffInput.leftResource, forceFile: resourceDiffInput.forceFile });
			const rightInput = this.createInput({ resource: resourceDiffInput.rightResource, forceFile: resourceDiffInput.forceFile });

			return new DiffEditorInput(
				resourceDiffInput.label || this.toSideBySideLabel(leftInput, rightInput, '↔'),
				resourceDiffInput.description,
				leftInput,
				rightInput
			);
		}

		// Untitled file support
		const untitledInput = input as IUntitledTextResourceInput;
		if (untitledInput.forceUntitled || !untitledInput.resource || (untitledInput.resource && untitledInput.resource.scheme === Schemas.untitled)) {
			const untitledOptions = {
				mode: untitledInput.mode,
				initialValue: untitledInput.contents,
				encoding: untitledInput.encoding
			};

			// Untitled resource: use as hint for an existing untitled editor
			if (untitledInput.resource?.scheme === Schemas.untitled) {
				return this.untitledTextEditorService.create({ untitledResource: untitledInput.resource, ...untitledOptions });
			}

			// Other resource: use as hint for associated filepath
			else {
				return this.untitledTextEditorService.create({ associatedResource: untitledInput.resource, ...untitledOptions });
			}
		}

		// Resource Editor Support
		const resourceInput = input as IResourceInput;
		if (resourceInput.resource instanceof URI) {
			let label = resourceInput.label;
			if (!label) {
				label = basename(resourceInput.resource); // derive the label from the path
			}

			return this.createOrGet(resourceInput.resource, this.instantiationService, label, resourceInput.description, resourceInput.encoding, resourceInput.mode, resourceInput.forceFile) as EditorInput;
		}

		throw new Error('Unknown input type');
	}

	private createOrGet(resource: URI, instantiationService: IInstantiationService, label: string | undefined, description: string | undefined, encoding: string | undefined, mode: string | undefined, forceFile: boolean | undefined): CachedEditorInput {
		if (EditorService.CACHE.has(resource)) {
			const input = EditorService.CACHE.get(resource)!;
			if (input instanceof ResourceEditorInput) {
				if (label) {
					input.setName(label);
				}

				if (description) {
					input.setDescription(description);
				}

				if (mode) {
					input.setPreferredMode(mode);
				}
			} else {
				if (encoding) {
					input.setPreferredEncoding(encoding);
				}

				if (mode) {
					input.setPreferredMode(mode);
				}
			}

			return input;
		}

		// File
		let input: CachedEditorInput;
		if (forceFile /* fix for https://github.com/Microsoft/vscode/issues/48275 */ || this.fileService.canHandleResource(resource)) {
			input = this.fileInputFactory.createFileInput(resource, encoding, mode, instantiationService);
		}

		// Resource
		else {
			input = instantiationService.createInstance(ResourceEditorInput, label, description, resource, mode);
		}

		// Add to cache and remove when input gets disposed
		EditorService.CACHE.set(resource, input);
		Event.once(input.onDispose)(() => EditorService.CACHE.delete(resource));

		return input;
	}

	private toSideBySideLabel(leftInput: EditorInput, rightInput: EditorInput, divider: string): string | undefined {
		const leftResource = leftInput.getResource();
		const rightResource = rightInput.getResource();

		// Without any resource, do not try to compute a label
		if (!leftResource || !rightResource) {
			return undefined;
		}

		// If both editors are file inputs, we produce an optimized label
		// by adding the relative path of both inputs to the label. This
		// makes it easier to understand a file-based comparison.
		if (this.fileInputFactory.isFileInput(leftInput) && this.fileInputFactory.isFileInput(rightInput)) {
			return `${this.labelService.getUriLabel(leftResource, { relative: true })} ${divider} ${this.labelService.getUriLabel(rightResource, { relative: true })}`;
		}

		// Signal back that the label should be computed from within the editor
		return undefined;
	}

	//#endregion

	//#region save/revert

	async save(editors: IEditorIdentifier | IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<boolean> {

		// Convert to array
		if (!Array.isArray(editors)) {
			editors = [editors];
		}

		// Split editors up into a bucket that is saved in parallel
		// and sequentially. Unless "Save As", all non-untitled editors
		// can be saved in parallel to speed up the operation. Remaining
		// editors are potentially bringing up some UI and thus run
		// sequentially.
		const editorsToSaveParallel: IEditorIdentifier[] = [];
		const editorsToSaveAsSequentially: IEditorIdentifier[] = [];
		if (options?.saveAs) {
			editorsToSaveAsSequentially.push(...editors);
		} else {
			for (const { groupId, editor } of editors) {
				if (editor.isUntitled()) {
					editorsToSaveAsSequentially.push({ groupId, editor });
				} else {
					editorsToSaveParallel.push({ groupId, editor });
				}
			}
		}

		// Editors to save in parallel
		await Promise.all(editorsToSaveParallel.map(({ groupId, editor }) => {

			// Use save as a hint to pin the editor if used explicitly
			if (options?.reason === SaveReason.EXPLICIT) {
				this.editorGroupService.getGroup(groupId)?.pinEditor(editor);
			}

			// Save
			return editor.save(groupId, options);
		}));

		// Editors to save sequentially
		for (const { groupId, editor } of editorsToSaveAsSequentially) {
			if (editor.isDisposed()) {
				continue; // might have been disposed from from the save already
			}

			const result = options?.saveAs ? await editor.saveAs(groupId, options) : await editor.save(groupId, options);
			if (!result) {
				return false; // failed or cancelled, abort
			}
		}

		return true;
	}

	saveAll(options?: ISaveAllEditorsOptions): Promise<boolean> {
		return this.save(this.getAllDirtyEditors(options), options);
	}

	async revert(editors: IEditorIdentifier | IEditorIdentifier[], options?: IRevertOptions): Promise<boolean> {

		// Convert to array
		if (!Array.isArray(editors)) {
			editors = [editors];
		}

		const result = await Promise.all(editors.map(async ({ groupId, editor }) => {

			// Use revert as a hint to pin the editor
			this.editorGroupService.getGroup(groupId)?.pinEditor(editor);

			return editor.revert(options);
		}));

		return result.every(success => !!success);
	}

	async revertAll(options?: IRevertAllEditorsOptions): Promise<boolean> {
		return this.revert(this.getAllDirtyEditors(options), options);
	}

	private getAllDirtyEditors(options?: IBaseSaveRevertAllEditorOptions): IEditorIdentifier[] {
		const editors: IEditorIdentifier[] = [];

		for (const group of this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
				if (editor.isDirty() && (!editor.isUntitled() || !!options?.includeUntitled)) {
					editors.push({ groupId: group.id, editor });
				}
			}
		}

		return editors;
	}

	//#endregion
}

export interface IEditorOpenHandler {
	(
		delegate: (group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions) => Promise<IEditor | null>,
		group: IEditorGroup,
		editor: IEditorInput,
		options?: IEditorOptions | ITextEditorOptions
	): Promise<IEditor | null>;
}

/**
 * The delegating workbench editor service can be used to override the behaviour of the openEditor()
 * method by providing a IEditorOpenHandler. All calls are being delegated to the existing editor
 * service otherwise.
 */
export class DelegatingEditorService implements IEditorService {

	_serviceBrand: undefined;

	constructor(
		private editorOpenHandler: IEditorOpenHandler,
		@IEditorService private editorService: EditorService
	) { }

	openEditor(editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions, group?: OpenInEditorGroup): Promise<IEditor | undefined>;
	openEditor(editor: IResourceInput | IUntitledTextResourceInput, group?: OpenInEditorGroup): Promise<ITextEditor | undefined>;
	openEditor(editor: IResourceDiffInput, group?: OpenInEditorGroup): Promise<ITextDiffEditor | undefined>;
	openEditor(editor: IResourceSideBySideInput, group?: OpenInEditorGroup): Promise<ITextSideBySideEditor | undefined>;
	async openEditor(editor: IEditorInput | IResourceEditor, optionsOrGroup?: IEditorOptions | ITextEditorOptions | OpenInEditorGroup, group?: OpenInEditorGroup): Promise<IEditor | undefined> {
		const result = this.editorService.doResolveEditorOpenRequest(editor, optionsOrGroup, group);
		if (result) {
			const [resolvedGroup, resolvedEditor, resolvedOptions] = result;

			// Pass on to editor open handler
			const control = await this.editorOpenHandler(
				(group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions) => group.openEditor(editor, options),
				resolvedGroup,
				resolvedEditor,
				resolvedOptions
			);

			if (control) {
				return control; // the opening was handled, so return early
			}

			return withNullAsUndefined(await resolvedGroup.openEditor(resolvedEditor, resolvedOptions));
		}

		return undefined;
	}

	//#region Delegate to IEditorService

	get onDidActiveEditorChange(): Event<void> { return this.editorService.onDidActiveEditorChange; }
	get onDidVisibleEditorsChange(): Event<void> { return this.editorService.onDidVisibleEditorsChange; }

	get activeEditor(): IEditorInput | undefined { return this.editorService.activeEditor; }
	get activeControl(): IVisibleEditor | undefined { return this.editorService.activeControl; }
	get activeTextEditorWidget(): ICodeEditor | IDiffEditor | undefined { return this.editorService.activeTextEditorWidget; }
	get activeTextEditorMode(): string | undefined { return this.editorService.activeTextEditorMode; }
	get visibleEditors(): ReadonlyArray<IEditorInput> { return this.editorService.visibleEditors; }
	get visibleControls(): ReadonlyArray<IVisibleEditor> { return this.editorService.visibleControls; }
	get visibleTextEditorWidgets(): ReadonlyArray<ICodeEditor | IDiffEditor> { return this.editorService.visibleTextEditorWidgets; }
	get editors(): ReadonlyArray<IEditorInput> { return this.editorService.editors; }
	get count(): number { return this.editorService.count; }

	getEditors(order: EditorsOrder): ReadonlyArray<IEditorIdentifier> { return this.editorService.getEditors(order); }

	openEditors(editors: IEditorInputWithOptions[], group?: OpenInEditorGroup): Promise<IEditor[]>;
	openEditors(editors: IResourceEditor[], group?: OpenInEditorGroup): Promise<IEditor[]>;
	openEditors(editors: Array<IEditorInputWithOptions | IResourceEditor>, group?: OpenInEditorGroup): Promise<IEditor[]> {
		return this.editorService.openEditors(editors, group);
	}

	replaceEditors(editors: IResourceEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	replaceEditors(editors: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	replaceEditors(editors: Array<IEditorReplacement | IResourceEditorReplacement>, group: IEditorGroup | GroupIdentifier): Promise<void> {
		return this.editorService.replaceEditors(editors as IResourceEditorReplacement[] /* TS fail */, group);
	}

	isOpen(editor: IEditorInput | IResourceInput | IUntitledTextResourceInput): boolean { return this.editorService.isOpen(editor); }

	getOpened(editor: IResourceInput | IUntitledTextResourceInput): IEditorInput | undefined { return this.editorService.getOpened(editor); }

	overrideOpenEditor(handler: IOpenEditorOverrideHandler): IDisposable { return this.editorService.overrideOpenEditor(handler); }

	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T { return this.editorService.invokeWithinEditorContext(fn); }

	createInput(input: IResourceEditor): IEditorInput { return this.editorService.createInput(input); }

	save(editors: IEditorIdentifier | IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<boolean> { return this.editorService.save(editors, options); }
	saveAll(options?: ISaveAllEditorsOptions): Promise<boolean> { return this.editorService.saveAll(options); }

	revert(editors: IEditorIdentifier | IEditorIdentifier[], options?: IRevertOptions): Promise<boolean> { return this.editorService.revert(editors, options); }
	revertAll(options?: IRevertAllEditorsOptions): Promise<boolean> { return this.editorService.revertAll(options); }

	//#endregion
}

registerSingleton(IEditorService, EditorService);
