/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IResourceEditorInput, IEditorOptions, EditorActivation, IResourceEditorInputIdentifier, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { SideBySideEditor, IEditorPane, GroupIdentifier, IUntitledTextResourceEditorInput, IResourceDiffEditorInput, EditorInputWithOptions, isEditorInputWithOptions, IEditorIdentifier, IEditorCloseEvent, ITextDiffEditorPane, IRevertOptions, SaveReason, EditorsOrder, IWorkbenchEditorConfiguration, EditorResourceAccessor, IVisibleEditorPane, EditorInputCapabilities, isResourceDiffEditorInput, IUntypedEditorInput, isResourceEditorInput, isEditorInput, isEditorInputWithOptionsAndGroup, IFindEditorOptions, isResourceMergeEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { ResourceMap, ResourceSet } from 'vs/base/common/map';
import { IFileService, FileOperationEvent, FileOperation, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, IEditorReplacement, isEditorReplacement, ICloseEditorOptions } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IUntypedEditorReplacement, IEditorService, ISaveEditorsOptions, ISaveAllEditorsOptions, IRevertAllEditorsOptions, IBaseSaveRevertAllEditorOptions, IOpenEditorsOptions, PreferredGroup, isPreferredGroup, IEditorsChangeEvent } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { isCodeEditor, isDiffEditor, ICodeEditor, IDiffEditor, isCompositeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupView, EditorServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { isUndefined, withNullAsUndefined } from 'vs/base/common/types';
import { EditorsObserver } from 'vs/workbench/browser/parts/editor/editorsObserver';
import { Promises, timeout } from 'vs/base/common/async';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { indexOfPath } from 'vs/base/common/extpath';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IEditorResolverService, ResolvedStatus } from 'vs/workbench/services/editor/common/editorResolverService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from 'vs/platform/workspace/common/workspaceTrust';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { findGroup } from 'vs/workbench/services/editor/common/editorGroupFinder';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';

export class EditorService extends Disposable implements EditorServiceImpl {

	declare readonly _serviceBrand: undefined;

	//#region events

	private readonly _onDidActiveEditorChange = this._register(new Emitter<void>());
	readonly onDidActiveEditorChange = this._onDidActiveEditorChange.event;

	private readonly _onDidVisibleEditorsChange = this._register(new Emitter<void>());
	readonly onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;

	private readonly _onDidEditorsChange = this._register(new Emitter<IEditorsChangeEvent>());
	readonly onDidEditorsChange = this._onDidEditorsChange.event;

	private readonly _onDidCloseEditor = this._register(new Emitter<IEditorCloseEvent>());
	readonly onDidCloseEditor = this._onDidCloseEditor.event;

	private readonly _onDidOpenEditorFail = this._register(new Emitter<IEditorIdentifier>());
	readonly onDidOpenEditorFail = this._onDidOpenEditorFail.event;

	private readonly _onDidMostRecentlyActiveEditorsChange = this._register(new Emitter<void>());
	readonly onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;

	//#endregion

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IHostService private readonly hostService: IHostService,
		@ITextEditorService private readonly textEditorService: ITextEditorService
	) {
		super();

		this.onConfigurationUpdated(configurationService.getValue<IWorkbenchEditorConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {

		// Editor & group changes
		this.editorGroupService.whenReady.then(() => this.onEditorGroupsReady());
		this.editorGroupService.onDidChangeActiveGroup(group => this.handleActiveEditorChange(group));
		this.editorGroupService.onDidAddGroup(group => this.registerGroupListeners(group as IEditorGroupView));
		this.editorsObserver.onDidMostRecentlyActiveEditorsChange(() => this._onDidMostRecentlyActiveEditorsChange.fire());

		// Out of workspace file watchers
		this._register(this.onDidVisibleEditorsChange(() => this.handleVisibleEditorsChange()));

		// File changes & operations
		// Note: there is some duplication with the two file event handlers- Since we cannot always rely on the disk events
		// carrying all necessary data in all environments, we also use the file operation events to make sure operations are handled.
		// In any case there is no guarantee if the local event is fired first or the disk one. Thus, code must handle the case
		// that the event ordering is random as well as might not carry all information needed.
		this._register(this.fileService.onDidRunOperation(e => this.onDidRunFileOperation(e)));
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// Configuration
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(this.configurationService.getValue<IWorkbenchEditorConfiguration>())));
	}

	//#region Editor & group event handlers

	private lastActiveEditor: EditorInput | undefined = undefined;

	private onEditorGroupsReady(): void {

		// Register listeners to each opened group
		for (const group of this.editorGroupService.groups) {
			this.registerGroupListeners(group as IEditorGroupView);
		}

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

		groupDisposables.add(group.onDidModelChange(e => {
			this._onDidEditorsChange.fire({ groupId: group.id, event: e });
		}));

		groupDisposables.add(group.onDidActiveEditorChange(() => {
			this.handleActiveEditorChange(group);
			this._onDidVisibleEditorsChange.fire();
		}));

		groupDisposables.add(group.onDidCloseEditor(e => {
			this._onDidCloseEditor.fire(e);
		}));

		groupDisposables.add(group.onDidOpenEditorFail(editor => {
			this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
		}));

		Event.once(group.onWillDispose)(() => {
			dispose(groupDisposables);
		});
	}

	//#endregion

	//#region Visible Editors Change: Install file watchers for out of workspace resources that became visible

	private readonly activeOutOfWorkspaceWatchers = new ResourceMap<IDisposable>();

	private handleVisibleEditorsChange(): void {
		const visibleOutOfWorkspaceResources = new ResourceSet();

		for (const editor of this.visibleEditors) {
			const resources = distinct(coalesce([
				EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }),
				EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY })
			]), resource => resource.toString());

			for (const resource of resources) {
				if (this.fileService.hasProvider(resource) && !this.contextService.isInsideWorkspace(resource)) {
					visibleOutOfWorkspaceResources.add(resource);
				}
			}
		}

		// Handle no longer visible out of workspace resources
		for (const resource of this.activeOutOfWorkspaceWatchers.keys()) {
			if (!visibleOutOfWorkspaceResources.has(resource)) {
				dispose(this.activeOutOfWorkspaceWatchers.get(resource));
				this.activeOutOfWorkspaceWatchers.delete(resource);
			}
		}

		// Handle newly visible out of workspace resources
		for (const resource of visibleOutOfWorkspaceResources.keys()) {
			if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
				const disposable = this.fileService.watch(resource);
				this.activeOutOfWorkspaceWatchers.set(resource, disposable);
			}
		}
	}

	//#endregion

	//#region File Changes: Move & Deletes to move or close opend editors

	private async onDidRunFileOperation(e: FileOperationEvent): Promise<void> {

		// Handle moves specially when file is opened
		if (e.isOperation(FileOperation.MOVE)) {
			this.handleMovedFile(e.resource, e.target.resource);
		}

		// Handle deletes
		if (e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.MOVE)) {
			this.handleDeletedFile(e.resource, false, e.target ? e.target.resource : undefined);
		}
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		if (e.gotDeleted()) {
			this.handleDeletedFile(e, true);
		}
	}

	private async handleMovedFile(source: URI, target: URI): Promise<void> {
		for (const group of this.editorGroupService.groups) {
			const replacements: (IUntypedEditorReplacement | IEditorReplacement)[] = [];

			for (const editor of group.editors) {
				const resource = editor.resource;
				if (!resource || !this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
					continue; // not matching our resource
				}

				// Determine new resulting target resource
				let targetResource: URI;
				if (this.uriIdentityService.extUri.isEqual(source, resource)) {
					targetResource = target; // file got moved
				} else {
					const index = indexOfPath(resource.path, source.path, this.uriIdentityService.extUri.ignorePathCasing(resource));
					targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1)); // parent folder got moved
				}

				// Delegate rename() to editor instance
				const moveResult = await editor.rename(group.id, targetResource);
				if (!moveResult) {
					return; // not target - ignore
				}

				const optionOverrides = {
					preserveFocus: true,
					pinned: group.isPinned(editor),
					sticky: group.isSticky(editor),
					index: group.getIndexOfEditor(editor),
					inactive: !group.isActive(editor)
				};

				// Construct a replacement with our extra options mixed in
				if (isEditorInput(moveResult.editor)) {
					replacements.push({
						editor,
						replacement: moveResult.editor,
						options: {
							...moveResult.options,
							...optionOverrides
						}
					});
				} else {
					replacements.push({
						editor,
						replacement: {
							...moveResult.editor,
							options: {
								...moveResult.editor.options,
								...optionOverrides
							}
						}
					});
				}
			}

			// Apply replacements
			if (replacements.length) {
				this.replaceEditors(replacements, group);
			}
		}
	}

	private closeOnFileDelete: boolean = false;

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		if (typeof configuration.workbench?.editor?.closeOnFileDelete === 'boolean') {
			this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
		} else {
			this.closeOnFileDelete = false; // default
		}
	}

	private handleDeletedFile(arg1: URI | FileChangesEvent, isExternal: boolean, movedTo?: URI): void {
		for (const editor of this.getAllNonDirtyEditors({ includeUntitled: false, supportSideBySide: true })) {
			(async () => {
				const resource = editor.resource;
				if (!resource) {
					return;
				}

				// Handle deletes in opened editors depending on:
				// - we close any editor when `closeOnFileDelete: true`
				// - we close any editor when the delete occurred from within VSCode
				// - we close any editor without resolved working copy assuming that
				//   this editor could not be opened after the file is gone
				if (this.closeOnFileDelete || !isExternal || !this.workingCopyService.has(resource)) {

					// Do NOT close any opened editor that matches the resource path (either equal or being parent) of the
					// resource we move to (movedTo). Otherwise we would close a resource that has been renamed to the same
					// path but different casing.
					if (movedTo && this.uriIdentityService.extUri.isEqualOrParent(resource, movedTo)) {
						return;
					}

					let matches = false;
					if (arg1 instanceof FileChangesEvent) {
						matches = arg1.contains(resource, FileChangeType.DELETED);
					} else {
						matches = this.uriIdentityService.extUri.isEqualOrParent(resource, arg1);
					}

					if (!matches) {
						return;
					}

					// We have received reports of users seeing delete events even though the file still
					// exists (network shares issue: https://github.com/microsoft/vscode/issues/13665).
					// Since we do not want to close an editor without reason, we have to check if the
					// file is really gone and not just a faulty file event.
					// This only applies to external file events, so we need to check for the isExternal
					// flag.
					let exists = false;
					if (isExternal && this.fileService.hasProvider(resource)) {
						await timeout(100);
						exists = await this.fileService.exists(resource);
					}

					if (!exists && !editor.isDisposed()) {
						editor.dispose();
					}
				}
			})();
		}
	}

	private getAllNonDirtyEditors(options: { includeUntitled: boolean; supportSideBySide: boolean }): EditorInput[] {
		const editors: EditorInput[] = [];

		function conditionallyAddEditor(editor: EditorInput): void {
			if (editor.hasCapability(EditorInputCapabilities.Untitled) && !options.includeUntitled) {
				return;
			}

			if (editor.isDirty()) {
				return;
			}

			editors.push(editor);
		}

		for (const editor of this.editors) {
			if (options.supportSideBySide && editor instanceof SideBySideEditorInput) {
				conditionallyAddEditor(editor.primary);
				conditionallyAddEditor(editor.secondary);
			} else {
				conditionallyAddEditor(editor);
			}
		}

		return editors;
	}

	//#endregion

	//#region Editor accessors

	private readonly editorsObserver = this._register(this.instantiationService.createInstance(EditorsObserver));

	get activeEditorPane(): IVisibleEditorPane | undefined {
		return this.editorGroupService.activeGroup?.activeEditorPane;
	}

	get activeTextEditorControl(): ICodeEditor | IDiffEditor | undefined {
		const activeEditorPane = this.activeEditorPane;
		if (activeEditorPane) {
			const activeControl = activeEditorPane.getControl();
			if (isCodeEditor(activeControl) || isDiffEditor(activeControl)) {
				return activeControl;
			}
			if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
				return activeControl.activeCodeEditor;
			}
		}

		return undefined;
	}

	get activeTextEditorLanguageId(): string | undefined {
		let activeCodeEditor: ICodeEditor | undefined = undefined;

		const activeTextEditorControl = this.activeTextEditorControl;
		if (isDiffEditor(activeTextEditorControl)) {
			activeCodeEditor = activeTextEditorControl.getModifiedEditor();
		} else {
			activeCodeEditor = activeTextEditorControl;
		}

		return activeCodeEditor?.getModel()?.getLanguageId();
	}

	get count(): number {
		return this.editorsObserver.count;
	}

	get editors(): EditorInput[] {
		return this.getEditors(EditorsOrder.SEQUENTIAL).map(({ editor }) => editor);
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): readonly IEditorIdentifier[] {
		switch (order) {

			// MRU
			case EditorsOrder.MOST_RECENTLY_ACTIVE:
				if (options?.excludeSticky) {
					return this.editorsObserver.editors.filter(({ groupId, editor }) => !this.editorGroupService.getGroup(groupId)?.isSticky(editor));
				}

				return this.editorsObserver.editors;

			// Sequential
			case EditorsOrder.SEQUENTIAL: {
				const editors: IEditorIdentifier[] = [];

				for (const group of this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
					editors.push(...group.getEditors(EditorsOrder.SEQUENTIAL, options).map(editor => ({ editor, groupId: group.id })));
				}

				return editors;
			}
		}
	}

	get activeEditor(): EditorInput | undefined {
		const activeGroup = this.editorGroupService.activeGroup;

		return activeGroup ? withNullAsUndefined(activeGroup.activeEditor) : undefined;
	}

	get visibleEditorPanes(): IVisibleEditorPane[] {
		return coalesce(this.editorGroupService.groups.map(group => group.activeEditorPane));
	}

	get visibleTextEditorControls(): Array<ICodeEditor | IDiffEditor> {
		const visibleTextEditorControls: Array<ICodeEditor | IDiffEditor> = [];
		for (const visibleEditorPane of this.visibleEditorPanes) {
			const control = visibleEditorPane.getControl();
			if (isCodeEditor(control) || isDiffEditor(control)) {
				visibleTextEditorControls.push(control);
			}
		}

		return visibleTextEditorControls;
	}

	get visibleEditors(): EditorInput[] {
		return coalesce(this.editorGroupService.groups.map(group => group.activeEditor));
	}

	//#endregion

	//#region openEditor()

	openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: IUntypedEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: ITextResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrPreferredGroup?: IEditorOptions | PreferredGroup, preferredGroup?: PreferredGroup): Promise<IEditorPane | undefined>;
	async openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrPreferredGroup?: IEditorOptions | PreferredGroup, preferredGroup?: PreferredGroup): Promise<IEditorPane | undefined> {
		let typedEditor: EditorInput | undefined = undefined;
		let options = isEditorInput(editor) ? optionsOrPreferredGroup as IEditorOptions : editor.options;
		let group: IEditorGroup | undefined = undefined;

		if (isPreferredGroup(optionsOrPreferredGroup)) {
			preferredGroup = optionsOrPreferredGroup;
		}

		// Resolve override unless disabled
		if (!isEditorInput(editor)) {
			const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);

			if (resolvedEditor === ResolvedStatus.ABORT) {
				return; // skip editor if override is aborted
			}

			// We resolved an editor to use
			if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
				typedEditor = resolvedEditor.editor;
				options = resolvedEditor.options;
				group = resolvedEditor.group;
			}
		}

		// Override is disabled or did not apply: fallback to default
		if (!typedEditor) {
			typedEditor = isEditorInput(editor) ? editor : await this.textEditorService.resolveTextEditor(editor);
		}

		// If group still isn't defined because of a disabled override we resolve it
		if (!group) {
			let activation: EditorActivation | undefined = undefined;
			([group, activation] = this.instantiationService.invokeFunction(findGroup, { editor: typedEditor, options }, preferredGroup));

			// Mixin editor group activation if returned
			if (activation) {
				options = { ...options, activation };
			}
		}

		return group.openEditor(typedEditor, options);
	}

	//#endregion

	//#region openEditors()

	openEditors(editors: EditorInputWithOptions[], group?: PreferredGroup, options?: IOpenEditorsOptions): Promise<IEditorPane[]>;
	openEditors(editors: IUntypedEditorInput[], group?: PreferredGroup, options?: IOpenEditorsOptions): Promise<IEditorPane[]>;
	openEditors(editors: Array<EditorInputWithOptions | IUntypedEditorInput>, group?: PreferredGroup, options?: IOpenEditorsOptions): Promise<IEditorPane[]>;
	async openEditors(editors: Array<EditorInputWithOptions | IUntypedEditorInput>, preferredGroup?: PreferredGroup, options?: IOpenEditorsOptions): Promise<IEditorPane[]> {

		// Pass all editors to trust service to determine if
		// we should proceed with opening the editors if we
		// are asked to validate trust.
		if (options?.validateTrust) {
			const editorsTrusted = await this.handleWorkspaceTrust(editors);
			if (!editorsTrusted) {
				return [];
			}
		}

		// Find target groups for editors to open
		const mapGroupToTypedEditors = new Map<IEditorGroup, Array<EditorInputWithOptions>>();
		for (const editor of editors) {
			let typedEditor: EditorInputWithOptions | undefined = undefined;
			let group: IEditorGroup | undefined = undefined;

			// Resolve override unless disabled
			if (!isEditorInputWithOptions(editor)) {
				const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);

				if (resolvedEditor === ResolvedStatus.ABORT) {
					continue; // skip editor if override is aborted
				}

				// We resolved an editor to use
				if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
					typedEditor = resolvedEditor;
					group = resolvedEditor.group;
				}
			}

			// Override is disabled or did not apply: fallback to default
			if (!typedEditor) {
				typedEditor = isEditorInputWithOptions(editor) ? editor : { editor: await this.textEditorService.resolveTextEditor(editor), options: editor.options };
			}

			// If group still isn't defined because of a disabled override we resolve it
			if (!group) {
				[group] = this.instantiationService.invokeFunction(findGroup, typedEditor, preferredGroup);
			}

			// Update map of groups to editors
			let targetGroupEditors = mapGroupToTypedEditors.get(group);
			if (!targetGroupEditors) {
				targetGroupEditors = [];
				mapGroupToTypedEditors.set(group, targetGroupEditors);
			}

			targetGroupEditors.push(typedEditor);
		}

		// Open in target groups
		const result: Promise<IEditorPane | undefined>[] = [];
		for (const [group, editors] of mapGroupToTypedEditors) {
			result.push(group.openEditors(editors));
		}

		return coalesce(await Promises.settled(result));
	}

	private async handleWorkspaceTrust(editors: Array<EditorInputWithOptions | IUntypedEditorInput>): Promise<boolean> {
		const { resources, diffMode, mergeMode } = this.extractEditorResources(editors);

		const trustResult = await this.workspaceTrustRequestService.requestOpenFilesTrust(resources);
		switch (trustResult) {
			case WorkspaceTrustUriResponse.Open:
				return true;
			case WorkspaceTrustUriResponse.OpenInNewWindow:
				await this.hostService.openWindow(resources.map(resource => ({ fileUri: resource })), { forceNewWindow: true, diffMode, mergeMode });
				return false;
			case WorkspaceTrustUriResponse.Cancel:
				return false;
		}
	}

	private extractEditorResources(editors: Array<EditorInputWithOptions | IUntypedEditorInput>): { resources: URI[]; diffMode?: boolean; mergeMode?: boolean } {
		const resources = new ResourceSet();
		let diffMode = false;
		let mergeMode = false;

		for (const editor of editors) {

			// Typed Editor
			if (isEditorInputWithOptions(editor)) {
				const resource = EditorResourceAccessor.getOriginalUri(editor.editor, { supportSideBySide: SideBySideEditor.BOTH });
				if (URI.isUri(resource)) {
					resources.add(resource);
				} else if (resource) {
					if (resource.primary) {
						resources.add(resource.primary);
					}

					if (resource.secondary) {
						resources.add(resource.secondary);
					}

					diffMode = editor.editor instanceof DiffEditorInput;
				}
			}

			// Untyped editor
			else {
				if (isResourceMergeEditorInput(editor)) {
					if (URI.isUri(editor.input1)) {
						resources.add(editor.input1.resource);
					}

					if (URI.isUri(editor.input2)) {
						resources.add(editor.input2.resource);
					}

					if (URI.isUri(editor.base)) {
						resources.add(editor.base.resource);
					}

					if (URI.isUri(editor.result)) {
						resources.add(editor.result.resource);
					}

					mergeMode = true;
				} if (isResourceDiffEditorInput(editor)) {
					if (URI.isUri(editor.original.resource)) {
						resources.add(editor.original.resource);
					}

					if (URI.isUri(editor.modified.resource)) {
						resources.add(editor.modified.resource);
					}

					diffMode = true;
				} else if (isResourceEditorInput(editor)) {
					resources.add(editor.resource);
				}
			}
		}

		return {
			resources: Array.from(resources.keys()),
			diffMode,
			mergeMode
		};
	}

	//#endregion

	//#region isOpened()

	isOpened(editor: IResourceEditorInputIdentifier): boolean {
		return this.editorsObserver.hasEditor({
			resource: this.uriIdentityService.asCanonicalUri(editor.resource),
			typeId: editor.typeId,
			editorId: editor.editorId
		});
	}

	//#endregion

	//#region isOpened()

	isVisible(editor: EditorInput): boolean {
		for (const group of this.editorGroupService.groups) {
			if (group.activeEditor?.matches(editor)) {
				return true;
			}
		}

		return false;
	}

	//#endregion

	//#region closeEditor()

	async closeEditor({ editor, groupId }: IEditorIdentifier, options?: ICloseEditorOptions): Promise<void> {
		const group = this.editorGroupService.getGroup(groupId);

		await group?.closeEditor(editor, options);
	}

	//#endregion

	//#region closeEditors()

	async closeEditors(editors: IEditorIdentifier[], options?: ICloseEditorOptions): Promise<void> {
		const mapGroupToEditors = new Map<IEditorGroup, EditorInput[]>();

		for (const { editor, groupId } of editors) {
			const group = this.editorGroupService.getGroup(groupId);
			if (!group) {
				continue;
			}

			let editors = mapGroupToEditors.get(group);
			if (!editors) {
				editors = [];
				mapGroupToEditors.set(group, editors);
			}

			editors.push(editor);
		}

		for (const [group, editors] of mapGroupToEditors) {
			await group.closeEditors(editors, options);
		}
	}

	//#endregion

	//#region findEditors()

	findEditors(resource: URI, options?: IFindEditorOptions): readonly IEditorIdentifier[];
	findEditors(editor: IResourceEditorInputIdentifier, options?: IFindEditorOptions): readonly IEditorIdentifier[];
	findEditors(resource: URI, options: IFindEditorOptions | undefined, group: IEditorGroup | GroupIdentifier): readonly EditorInput[];
	findEditors(editor: IResourceEditorInputIdentifier, options: IFindEditorOptions | undefined, group: IEditorGroup | GroupIdentifier): EditorInput | undefined;
	findEditors(arg1: URI | IResourceEditorInputIdentifier, options: IFindEditorOptions | undefined, arg2?: IEditorGroup | GroupIdentifier): readonly IEditorIdentifier[] | readonly EditorInput[] | EditorInput | undefined;
	findEditors(arg1: URI | IResourceEditorInputIdentifier, options: IFindEditorOptions | undefined, arg2?: IEditorGroup | GroupIdentifier): readonly IEditorIdentifier[] | readonly EditorInput[] | EditorInput | undefined {
		const resource = URI.isUri(arg1) ? arg1 : arg1.resource;
		const typeId = URI.isUri(arg1) ? undefined : arg1.typeId;

		// Do a quick check for the resource via the editor observer
		// which is a very efficient way to find an editor by resource.
		// However, we can only do that unless we are asked to find an
		// editor on the secondary side of a side by side editor, because
		// the editor observer provides fast lookups only for primary
		// editors.
		if (options?.supportSideBySide !== SideBySideEditor.ANY && options?.supportSideBySide !== SideBySideEditor.SECONDARY) {
			if (!this.editorsObserver.hasEditors(resource)) {
				if (URI.isUri(arg1) || isUndefined(arg2)) {
					return [];
				}

				return undefined;
			}
		}

		// Search only in specific group
		if (!isUndefined(arg2)) {
			const targetGroup = typeof arg2 === 'number' ? this.editorGroupService.getGroup(arg2) : arg2;

			// Resource provided: result is an array
			if (URI.isUri(arg1)) {
				if (!targetGroup) {
					return [];
				}

				return targetGroup.findEditors(resource, options);
			}

			// Editor identifier provided, result is single
			else {
				if (!targetGroup) {
					return undefined;
				}

				const editors = targetGroup.findEditors(resource, options);
				for (const editor of editors) {
					if (editor.typeId === typeId) {
						return editor;
					}
				}

				return undefined;
			}
		}

		// Search across all groups in MRU order
		else {
			const result: IEditorIdentifier[] = [];

			for (const group of this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
				const editors: EditorInput[] = [];

				// Resource provided: result is an array
				if (URI.isUri(arg1)) {
					editors.push(...this.findEditors(arg1, options, group));
				}

				// Editor identifier provided, result is single
				else {
					const editor = this.findEditors(arg1, options, group);
					if (editor) {
						editors.push(editor);
					}
				}

				result.push(...editors.map(editor => ({ editor, groupId: group.id })));
			}

			return result;
		}
	}

	//#endregion

	//#region replaceEditors()

	async replaceEditors(replacements: IUntypedEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	async replaceEditors(replacements: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	async replaceEditors(replacements: Array<IEditorReplacement | IUntypedEditorReplacement>, group: IEditorGroup | GroupIdentifier): Promise<void> {
		const targetGroup = typeof group === 'number' ? this.editorGroupService.getGroup(group) : group;

		// Convert all replacements to typed editors unless already
		// typed and handle overrides properly.
		const typedReplacements: IEditorReplacement[] = [];
		for (const replacement of replacements) {
			let typedReplacement: IEditorReplacement | undefined = undefined;

			// Resolve override unless disabled
			if (!isEditorInput(replacement.replacement)) {
				const resolvedEditor = await this.editorResolverService.resolveEditor(
					replacement.replacement,
					targetGroup
				);

				if (resolvedEditor === ResolvedStatus.ABORT) {
					continue; // skip editor if override is aborted
				}

				// We resolved an editor to use
				if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
					typedReplacement = {
						editor: replacement.editor,
						replacement: resolvedEditor.editor,
						options: resolvedEditor.options,
						forceReplaceDirty: replacement.forceReplaceDirty
					};
				}
			}

			// Override is disabled or did not apply: fallback to default
			if (!typedReplacement) {
				typedReplacement = {
					editor: replacement.editor,
					replacement: isEditorReplacement(replacement) ? replacement.replacement : await this.textEditorService.resolveTextEditor(replacement.replacement),
					options: isEditorReplacement(replacement) ? replacement.options : replacement.replacement.options,
					forceReplaceDirty: replacement.forceReplaceDirty
				};
			}

			typedReplacements.push(typedReplacement);
		}

		return targetGroup?.replaceEditors(typedReplacements);
	}

	//#endregion

	//#region save/revert

	async save(editors: IEditorIdentifier | IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<boolean> {

		// Convert to array
		if (!Array.isArray(editors)) {
			editors = [editors];
		}

		// Make sure to not save the same editor multiple times
		// by using the `matches()` method to find duplicates
		const uniqueEditors = this.getUniqueEditors(editors);

		// Split editors up into a bucket that is saved in parallel
		// and sequentially. Unless "Save As", all non-untitled editors
		// can be saved in parallel to speed up the operation. Remaining
		// editors are potentially bringing up some UI and thus run
		// sequentially.
		const editorsToSaveParallel: IEditorIdentifier[] = [];
		const editorsToSaveSequentially: IEditorIdentifier[] = [];
		if (options?.saveAs) {
			editorsToSaveSequentially.push(...uniqueEditors);
		} else {
			for (const { groupId, editor } of uniqueEditors) {
				if (editor.hasCapability(EditorInputCapabilities.Untitled)) {
					editorsToSaveSequentially.push({ groupId, editor });
				} else {
					editorsToSaveParallel.push({ groupId, editor });
				}
			}
		}

		// Editors to save in parallel
		const saveResults = await Promises.settled(editorsToSaveParallel.map(({ groupId, editor }) => {

			// Use save as a hint to pin the editor if used explicitly
			if (options?.reason === SaveReason.EXPLICIT) {
				this.editorGroupService.getGroup(groupId)?.pinEditor(editor);
			}

			// Save
			return editor.save(groupId, options);
		}));

		// Editors to save sequentially
		for (const { groupId, editor } of editorsToSaveSequentially) {
			if (editor.isDisposed()) {
				continue; // might have been disposed from the save already
			}

			// Preserve view state by opening the editor first if the editor
			// is untitled or we "Save As". This also allows the user to review
			// the contents of the editor before making a decision.
			const editorPane = await this.openEditor(editor, groupId);
			const editorOptions: IEditorOptions = {
				pinned: true,
				viewState: editorPane?.getViewState()
			};

			const result = options?.saveAs ? await editor.saveAs(groupId, options) : await editor.save(groupId, options);
			saveResults.push(result);

			if (!result) {
				break; // failed or cancelled, abort
			}

			// Replace editor preserving viewstate (either across all groups or
			// only selected group) if the resulting editor is different from the
			// current one.
			if (!editor.matches(result)) {
				const targetGroups = editor.hasCapability(EditorInputCapabilities.Untitled) ? this.editorGroupService.groups.map(group => group.id) /* untitled replaces across all groups */ : [groupId];
				for (const targetGroup of targetGroups) {
					if (result instanceof EditorInput) {
						await this.replaceEditors([{ editor, replacement: result, options: editorOptions }], targetGroup);
					} else {
						await this.replaceEditors([{ editor, replacement: { ...result, options: editorOptions } }], targetGroup);
					}
				}
			}
		}

		return saveResults.every(result => !!result);
	}

	saveAll(options?: ISaveAllEditorsOptions): Promise<boolean> {
		return this.save(this.getAllDirtyEditors(options), options);
	}

	async revert(editors: IEditorIdentifier | IEditorIdentifier[], options?: IRevertOptions): Promise<boolean> {

		// Convert to array
		if (!Array.isArray(editors)) {
			editors = [editors];
		}

		// Make sure to not revert the same editor multiple times
		// by using the `matches()` method to find duplicates
		const uniqueEditors = this.getUniqueEditors(editors);

		await Promises.settled(uniqueEditors.map(async ({ groupId, editor }) => {

			// Use revert as a hint to pin the editor
			this.editorGroupService.getGroup(groupId)?.pinEditor(editor);

			return editor.revert(groupId, options);
		}));

		return !uniqueEditors.some(({ editor }) => editor.isDirty());
	}

	async revertAll(options?: IRevertAllEditorsOptions): Promise<boolean> {
		return this.revert(this.getAllDirtyEditors(options), options);
	}

	private getAllDirtyEditors(options?: IBaseSaveRevertAllEditorOptions): IEditorIdentifier[] {
		const editors: IEditorIdentifier[] = [];

		for (const group of this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
				if (!editor.isDirty()) {
					continue;
				}

				if (!options?.includeUntitled && editor.hasCapability(EditorInputCapabilities.Untitled)) {
					continue;
				}

				if (options?.excludeSticky && group.isSticky(editor)) {
					continue;
				}

				editors.push({ groupId: group.id, editor });
			}
		}

		return editors;
	}

	private getUniqueEditors(editors: IEditorIdentifier[]): IEditorIdentifier[] {
		const uniqueEditors: IEditorIdentifier[] = [];
		for (const { editor, groupId } of editors) {
			if (uniqueEditors.some(uniqueEditor => uniqueEditor.editor.matches(editor))) {
				continue;
			}

			uniqueEditors.push({ editor, groupId });
		}

		return uniqueEditors;
	}

	//#endregion

	override dispose(): void {
		super.dispose();

		// Dispose remaining watchers if any
		this.activeOutOfWorkspaceWatchers.forEach(disposable => dispose(disposable));
		this.activeOutOfWorkspaceWatchers.clear();
	}
}

registerSingleton(IEditorService, EditorService, false);
