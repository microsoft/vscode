/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter, once } from 'vs/base/common/event';
import { IEditorRegistry, Extensions, EditorInput, toResource, IEditorStacksModel, IEditorGroup, IEditorIdentifier, IGroupEvent, GroupIdentifier, IStacksModelChangeEvent, IWorkbenchEditorConfiguration, EditorOpenPositioning, SideBySideEditorInput } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { Position, Direction } from 'vs/platform/editor/common/editor';

export interface GroupEvent extends IGroupEvent {
	editor: EditorInput;
}

export interface EditorIdentifier extends IEditorIdentifier {
	group: EditorGroup;
	editor: EditorInput;
}

export interface IEditorOpenOptions {
	pinned?: boolean;
	active?: boolean;
	index?: number;
}

export interface ISerializedEditorInput {
	id: string;
	value: string;
}

export interface ISerializedEditorGroup {
	label: string;
	editors: ISerializedEditorInput[];
	mru: number[];
	preview: number;
}

export class EditorGroup implements IEditorGroup {

	private static IDS = 0;

	private _id: GroupIdentifier;
	private _label: string;

	private editors: EditorInput[];
	private mru: EditorInput[];
	private mapResourceToEditorCount: { [resource: string]: number };

	private preview: EditorInput; // editor in preview state
	private active: EditorInput;  // editor in active state

	private toDispose: IDisposable[];
	private editorOpenPositioning: 'left' | 'right' | 'first' | 'last';

	private _onEditorActivated: Emitter<EditorInput>;
	private _onEditorOpened: Emitter<EditorInput>;
	private _onEditorClosed: Emitter<GroupEvent>;
	private _onEditorDisposed: Emitter<EditorInput>;
	private _onEditorDirty: Emitter<EditorInput>;
	private _onEditorLabelChange: Emitter<EditorInput>;
	private _onEditorMoved: Emitter<EditorInput>;
	private _onEditorPinned: Emitter<EditorInput>;
	private _onEditorUnpinned: Emitter<EditorInput>;
	private _onEditorStateChanged: Emitter<EditorInput>;
	private _onEditorsStructureChanged: Emitter<EditorInput>;

	constructor(
		arg1: string | ISerializedEditorGroup,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this._id = EditorGroup.IDS++;

		this.editors = [];
		this.mru = [];
		this.toDispose = [];
		this.mapResourceToEditorCount = Object.create(null);
		this.onConfigurationUpdated(configurationService.getConfiguration<IWorkbenchEditorConfiguration>());

		this._onEditorActivated = new Emitter<EditorInput>();
		this._onEditorOpened = new Emitter<EditorInput>();
		this._onEditorClosed = new Emitter<GroupEvent>();
		this._onEditorDisposed = new Emitter<EditorInput>();
		this._onEditorDirty = new Emitter<EditorInput>();
		this._onEditorLabelChange = new Emitter<EditorInput>();
		this._onEditorMoved = new Emitter<EditorInput>();
		this._onEditorPinned = new Emitter<EditorInput>();
		this._onEditorUnpinned = new Emitter<EditorInput>();
		this._onEditorStateChanged = new Emitter<EditorInput>();
		this._onEditorsStructureChanged = new Emitter<EditorInput>();

		this.toDispose.push(this._onEditorActivated, this._onEditorOpened, this._onEditorClosed, this._onEditorDisposed, this._onEditorDirty, this._onEditorLabelChange, this._onEditorMoved, this._onEditorPinned, this._onEditorUnpinned, this._onEditorStateChanged, this._onEditorsStructureChanged);

		if (typeof arg1 === 'object') {
			this.deserialize(arg1);
		} else {
			this._label = arg1;
		}

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
	}

	private onConfigurationUpdated(config: IWorkbenchEditorConfiguration): void {
		if (config && config.workbench && config.workbench.editor) {
			this.editorOpenPositioning = config.workbench.editor.openPositioning;
		}
	}

	public get id(): GroupIdentifier {
		return this._id;
	}

	public get label(): string {
		return this._label;
	}

	public set label(label: string) {
		this._label = label;
	}

	public get count(): number {
		return this.editors.length;
	}

	public get onEditorActivated(): Event<EditorInput> {
		return this._onEditorActivated.event;
	}

	public get onEditorOpened(): Event<EditorInput> {
		return this._onEditorOpened.event;
	}

	public get onEditorClosed(): Event<GroupEvent> {
		return this._onEditorClosed.event;
	}

	public get onEditorDisposed(): Event<EditorInput> {
		return this._onEditorDisposed.event;
	}

	public get onEditorDirty(): Event<EditorInput> {
		return this._onEditorDirty.event;
	}

	public get onEditorLabelChange(): Event<EditorInput> {
		return this._onEditorLabelChange.event;
	}

	public get onEditorMoved(): Event<EditorInput> {
		return this._onEditorMoved.event;
	}

	public get onEditorPinned(): Event<EditorInput> {
		return this._onEditorPinned.event;
	}

	public get onEditorUnpinned(): Event<EditorInput> {
		return this._onEditorUnpinned.event;
	}

	public get onEditorStateChanged(): Event<EditorInput> {
		return this._onEditorStateChanged.event;
	}

	public get onEditorsStructureChanged(): Event<EditorInput> {
		return this._onEditorsStructureChanged.event;
	}

	public getEditors(mru?: boolean): EditorInput[] {
		return mru ? this.mru.slice(0) : this.editors.slice(0);
	}

	public getEditor(index: number): EditorInput;
	public getEditor(resource: URI): EditorInput;
	public getEditor(arg1: any): EditorInput {
		if (typeof arg1 === 'number') {
			return this.editors[arg1];
		}

		const resource: URI = arg1;
		if (!this.contains(resource)) {
			return null; // fast check for resource opened or not
		}

		for (let i = 0; i < this.editors.length; i++) {
			const editor = this.editors[i];
			const editorResource = toResource(editor, { supportSideBySide: true });
			if (editorResource && editorResource.toString() === resource.toString()) {
				return editor;
			}
		}

		return null;
	}

	public get activeEditor(): EditorInput {
		return this.active;
	}

	public isActive(editor: EditorInput): boolean {
		return this.matches(this.active, editor);
	}

	public get previewEditor(): EditorInput {
		return this.preview;
	}

	public isPreview(editor: EditorInput): boolean {
		return this.matches(this.preview, editor);
	}

	public openEditor(editor: EditorInput, options?: IEditorOpenOptions): void {
		const index = this.indexOf(editor);

		const makePinned = options && options.pinned;
		const makeActive = (options && options.active) || !this.activeEditor || (!makePinned && this.matches(this.preview, this.activeEditor));

		// New editor
		if (index === -1) {
			let targetIndex: number;
			const indexOfActive = this.indexOf(this.active);

			// Insert into specific position
			if (options && typeof options.index === 'number') {
				targetIndex = options.index;
			}

			// Insert to the BEGINNING
			else if (this.editorOpenPositioning === EditorOpenPositioning.FIRST) {
				targetIndex = 0;
			}

			// Insert to the END
			else if (this.editorOpenPositioning === EditorOpenPositioning.LAST) {
				targetIndex = this.editors.length;
			}

			// Insert to the LEFT of active editor
			else if (this.editorOpenPositioning === EditorOpenPositioning.LEFT) {
				if (indexOfActive === 0 || !this.editors.length) {
					targetIndex = 0; // to the left becoming first editor in list
				} else {
					targetIndex = indexOfActive; // to the left of active editor
				}
			}

			// Insert to the RIGHT of active editor
			else {
				targetIndex = indexOfActive + 1;
			}

			// Insert into our list of editors if pinned or we have no preview editor
			if (makePinned || !this.preview) {
				this.splice(targetIndex, false, editor);
			}

			// Handle preview
			if (!makePinned) {

				// Replace existing preview with this editor if we have a preview
				if (this.preview) {
					const indexOfPreview = this.indexOf(this.preview);
					if (targetIndex > indexOfPreview) {
						targetIndex--; // accomodate for the fact that the preview editor closes
					}

					this.closeEditor(this.preview, !makeActive); // optimization to prevent multiple setActive() in one call
					this.splice(targetIndex, false, editor);
				}

				this.preview = editor;
			}

			// Listeners
			this.hookEditorListeners(editor);

			// Event
			this.fireEvent(this._onEditorOpened, editor, true);

			// Handle active
			if (makeActive) {
				this.setActive(editor);
			}
		}

		// Existing editor
		else {

			// Pin it
			if (makePinned) {
				this.pin(editor);
			}

			// Activate it
			if (makeActive) {
				this.setActive(editor);
			}

			// Respect index
			if (options && typeof options.index === 'number') {
				this.moveEditor(editor, options.index);
			}
		}
	}

	private hookEditorListeners(editor: EditorInput): void {
		const unbind: IDisposable[] = [];

		// Re-emit disposal of editor input as our own event
		const onceDispose = once(editor.onDispose);
		unbind.push(onceDispose(() => {
			if (this.indexOf(editor) >= 0) {
				this._onEditorDisposed.fire(editor);
			}
		}));

		// Re-Emit dirty state changes
		unbind.push(editor.onDidChangeDirty(() => {
			this.fireEvent(this._onEditorDirty, editor, false);
		}));

		// Re-Emit label changes
		unbind.push(editor.onDidChangeLabel(() => {
			this.fireEvent(this._onEditorLabelChange, editor, false);
		}));

		// Clean up dispose listeners once the editor gets closed
		unbind.push(this.onEditorClosed(event => {
			if (event.editor.matches(editor)) {
				dispose(unbind);
			}
		}));
	}

	public closeEditor(editor: EditorInput, openNext = true): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		// Active Editor closed
		if (openNext && this.matches(this.active, editor)) {

			// More than one editor
			if (this.mru.length > 1) {
				this.setActive(this.mru[1]); // active editor is always first in MRU, so pick second editor after as new active
			}

			// One Editor
			else {
				this.active = null;
			}
		}

		// Preview Editor closed
		let pinned = true;
		if (this.matches(this.preview, editor)) {
			this.preview = null;
			pinned = false;
		}

		// Remove from arrays
		this.splice(index, true);

		// Event
		this.fireEvent(this._onEditorClosed, { editor, pinned, index }, true);
	}

	public closeEditors(except: EditorInput, direction?: Direction): void {
		const index = this.indexOf(except);
		if (index === -1) {
			return; // not found
		}

		// Close to the left
		if (direction === Direction.LEFT) {
			for (let i = index - 1; i >= 0; i--) {
				this.closeEditor(this.editors[i]);
			}
		}

		// Close to the right
		else if (direction === Direction.RIGHT) {
			for (let i = this.editors.length - 1; i > index; i--) {
				this.closeEditor(this.editors[i]);
			}
		}

		// Both directions
		else {
			this.mru.filter(e => !this.matches(e, except)).forEach(e => this.closeEditor(e));
		}
	}

	public closeAllEditors(): void {

		// Optimize: close all non active editors first to produce less upstream work
		this.mru.filter(e => !this.matches(e, this.active)).forEach(e => this.closeEditor(e));
		this.closeEditor(this.active);
	}

	public moveEditor(editor: EditorInput, toIndex: number): void {
		const index = this.indexOf(editor);
		if (index < 0) {
			return;
		}

		// Move
		this.editors.splice(index, 1);
		this.editors.splice(toIndex, 0, editor);

		// Event
		this.fireEvent(this._onEditorMoved, editor, true);
	}

	public setActive(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		if (this.matches(this.active, editor)) {
			return; // already active
		}

		this.active = editor;

		// Bring to front in MRU list
		this.setMostRecentlyUsed(editor);

		// Event
		this.fireEvent(this._onEditorActivated, editor, false);
	}

	public pin(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		if (!this.isPreview(editor)) {
			return; // can only pin a preview editor
		}

		// Convert the preview editor to be a pinned editor
		this.preview = null;

		// Event
		this.fireEvent(this._onEditorPinned, editor, false);
	}

	public unpin(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		if (!this.isPinned(editor)) {
			return; // can only unpin a pinned editor
		}

		// Set new
		const oldPreview = this.preview;
		this.preview = editor;

		// Event
		this.fireEvent(this._onEditorUnpinned, editor, false);

		// Close old preview editor if any
		this.closeEditor(oldPreview);
	}

	public isPinned(editor: EditorInput): boolean;
	public isPinned(index: number): boolean;
	public isPinned(arg1: EditorInput | number): boolean {
		let editor: EditorInput;
		let index: number;
		if (typeof arg1 === 'number') {
			editor = this.editors[arg1];
			index = arg1;
		} else {
			editor = arg1;
			index = this.indexOf(editor);
		}

		if (index === -1 || !editor) {
			return false; // editor not found
		}

		if (!this.preview) {
			return true; // no preview editor
		}

		return !this.matches(this.preview, editor);
	}

	private fireEvent(emitter: Emitter<EditorInput | GroupEvent>, arg2: EditorInput | GroupEvent, isStructuralChange: boolean): void {
		emitter.fire(arg2);

		if (isStructuralChange) {
			this._onEditorsStructureChanged.fire(arg2 instanceof EditorInput ? arg2 : arg2.editor);
		} else {
			this._onEditorStateChanged.fire(arg2 instanceof EditorInput ? arg2 : arg2.editor);
		}
	}

	private splice(index: number, del: boolean, editor?: EditorInput): void {
		const editorToDeleteOrReplace = this.editors[index];

		const args: any[] = [index, del ? 1 : 0];
		if (editor) {
			args.push(editor);
		}

		// Perform on editors array
		this.editors.splice.apply(this.editors, args);

		// Add
		if (!del && editor) {
			this.mru.push(editor); // make it LRU editor
			this.updateResourceMap(editor, false /* add */); // add new to resource map
		}

		// Remove / Replace
		else {
			const indexInMRU = this.indexOf(editorToDeleteOrReplace, this.mru);

			// Remove
			if (del && !editor) {
				this.mru.splice(indexInMRU, 1); // remove from MRU
				this.updateResourceMap(editorToDeleteOrReplace, true /* delete */); // remove from resource map
			}

			// Replace
			else {
				this.mru.splice(indexInMRU, 1, editor); // replace MRU at location
				this.updateResourceMap(editor, false /* add */); // add new to resource map
				this.updateResourceMap(editorToDeleteOrReplace, true /* delete */); // remove replaced from resource map
			}
		}
	}

	private updateResourceMap(editor: EditorInput, remove: boolean): void {
		const resource = toResource(editor, { supportSideBySide: true });
		if (resource) {

			// It is possible to have the same resource opened twice (once as normal input and once as diff input)
			// So we need to do ref counting on the resource to provide the correct picture
			let counter = this.mapResourceToEditorCount[resource.toString()] || 0;
			let newCounter: number;
			if (remove) {
				if (counter > 1) {
					newCounter = counter - 1;
				}
			} else {
				newCounter = counter + 1;
			}

			this.mapResourceToEditorCount[resource.toString()] = newCounter;
		}
	}

	public indexOf(candidate: EditorInput, editors = this.editors): number {
		if (!candidate) {
			return -1;
		}

		for (let i = 0; i < editors.length; i++) {
			if (this.matches(editors[i], candidate)) {
				return i;
			}
		}

		return -1;
	}

	public contains(candidate: EditorInput): boolean;
	public contains(resource: URI): boolean;
	public contains(arg1: any): boolean {
		if (arg1 instanceof EditorInput) {
			return this.indexOf(arg1) >= 0;
		}

		const counter = this.mapResourceToEditorCount[(<URI>arg1).toString()];

		return typeof counter === 'number' && counter > 0;
	}

	private setMostRecentlyUsed(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // editor not found
		}

		const mruIndex = this.indexOf(editor, this.mru);

		// Remove old index
		this.mru.splice(mruIndex, 1);

		// Set editor to front
		this.mru.unshift(editor);
	}

	private matches(editorA: EditorInput, editorB: EditorInput): boolean {
		return !!editorA && !!editorB && editorA.matches(editorB);
	}

	public serialize(): ISerializedEditorGroup {
		const registry = Registry.as<IEditorRegistry>(Extensions.Editors);

		// Serialize all editor inputs so that we can store them.
		// Editors that cannot be serialized need to be ignored
		// from mru, active and preview if any.
		let serializableEditors: EditorInput[] = [];
		let serializedEditors: ISerializedEditorInput[] = [];
		let serializablePreviewIndex: number;
		this.editors.forEach(e => {
			let factory = registry.getEditorInputFactory(e.getTypeId());
			if (factory) {
				let value = factory.serialize(e);
				if (typeof value === 'string') {
					serializedEditors.push({ id: e.getTypeId(), value });
					serializableEditors.push(e);

					if (this.preview === e) {
						serializablePreviewIndex = serializableEditors.length - 1;
					}
				}
			}
		});

		const serializableMru = this.mru.map(e => this.indexOf(e, serializableEditors)).filter(i => i >= 0);

		return {
			label: this.label,
			editors: serializedEditors,
			mru: serializableMru,
			preview: serializablePreviewIndex,
		};
	}

	private deserialize(data: ISerializedEditorGroup): void {
		const registry = Registry.as<IEditorRegistry>(Extensions.Editors);

		this._label = data.label;
		this.editors = data.editors.map(e => {
			const factory = registry.getEditorInputFactory(e.id);
			if (factory) {
				const editor = factory.deserialize(this.instantiationService, e.value);

				this.hookEditorListeners(editor);
				this.updateResourceMap(editor, false /* add */);

				return editor;
			}

			return null;
		}).filter(e => !!e);
		this.mru = data.mru.map(i => this.editors[i]);
		this.active = this.mru[0];
		this.preview = this.editors[data.preview];
	}

	public dispose(): void {
		dispose(this.toDispose);
	}
}

interface ISerializedEditorStacksModel {
	groups: ISerializedEditorGroup[];
	active: number;
}

export class EditorStacksModel implements IEditorStacksModel {

	private static STORAGE_KEY = 'editorStacks.model';

	private toDispose: IDisposable[];
	private loaded: boolean;

	private _groups: EditorGroup[];
	private _activeGroup: EditorGroup;
	private groupToIdentifier: { [id: number]: EditorGroup };

	private _onGroupOpened: Emitter<EditorGroup>;
	private _onGroupClosed: Emitter<EditorGroup>;
	private _onGroupMoved: Emitter<EditorGroup>;
	private _onGroupActivated: Emitter<EditorGroup>;
	private _onGroupDeactivated: Emitter<EditorGroup>;
	private _onGroupRenamed: Emitter<EditorGroup>;
	private _onEditorDisposed: Emitter<EditorIdentifier>;
	private _onEditorDirty: Emitter<EditorIdentifier>;
	private _onEditorLabelChange: Emitter<EditorIdentifier>;
	private _onEditorOpened: Emitter<EditorIdentifier>;
	private _onEditorClosed: Emitter<GroupEvent>;
	private _onModelChanged: Emitter<IStacksModelChangeEvent>;

	constructor(
		private restoreFromStorage: boolean,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.toDispose = [];

		this._groups = [];
		this.groupToIdentifier = Object.create(null);

		this._onGroupOpened = new Emitter<EditorGroup>();
		this._onGroupClosed = new Emitter<EditorGroup>();
		this._onGroupActivated = new Emitter<EditorGroup>();
		this._onGroupDeactivated = new Emitter<EditorGroup>();
		this._onGroupMoved = new Emitter<EditorGroup>();
		this._onGroupRenamed = new Emitter<EditorGroup>();
		this._onModelChanged = new Emitter<IStacksModelChangeEvent>();
		this._onEditorDisposed = new Emitter<EditorIdentifier>();
		this._onEditorDirty = new Emitter<EditorIdentifier>();
		this._onEditorLabelChange = new Emitter<EditorIdentifier>();
		this._onEditorOpened = new Emitter<EditorIdentifier>();
		this._onEditorClosed = new Emitter<GroupEvent>();

		this.toDispose.push(this._onGroupOpened, this._onGroupClosed, this._onGroupActivated, this._onGroupDeactivated, this._onGroupMoved, this._onGroupRenamed, this._onModelChanged, this._onEditorDisposed, this._onEditorDirty, this._onEditorLabelChange, this._onEditorClosed);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.lifecycleService.onShutdown(reason => this.onShutdown()));
	}

	public get onGroupOpened(): Event<EditorGroup> {
		return this._onGroupOpened.event;
	}

	public get onGroupClosed(): Event<EditorGroup> {
		return this._onGroupClosed.event;
	}

	public get onGroupActivated(): Event<EditorGroup> {
		return this._onGroupActivated.event;
	}

	public get onGroupDeactivated(): Event<EditorGroup> {
		return this._onGroupDeactivated.event;
	}

	public get onGroupMoved(): Event<EditorGroup> {
		return this._onGroupMoved.event;
	}

	public get onGroupRenamed(): Event<EditorGroup> {
		return this._onGroupRenamed.event;
	}

	public get onModelChanged(): Event<IStacksModelChangeEvent> {
		return this._onModelChanged.event;
	}

	public get onEditorDisposed(): Event<EditorIdentifier> {
		return this._onEditorDisposed.event;
	}

	public get onEditorDirty(): Event<EditorIdentifier> {
		return this._onEditorDirty.event;
	}

	public get onEditorLabelChange(): Event<EditorIdentifier> {
		return this._onEditorLabelChange.event;
	}

	public get onEditorOpened(): Event<EditorIdentifier> {
		return this._onEditorOpened.event;
	}

	public get onEditorClosed(): Event<GroupEvent> {
		return this._onEditorClosed.event;
	}

	public get groups(): EditorGroup[] {
		this.ensureLoaded();

		return this._groups.slice(0);
	}

	public get activeGroup(): EditorGroup {
		this.ensureLoaded();

		return this._activeGroup;
	}

	public isActive(group: EditorGroup): boolean {
		return this.activeGroup === group;
	}

	public getGroup(id: GroupIdentifier): EditorGroup {
		this.ensureLoaded();

		return this.groupToIdentifier[id];
	}

	public openGroup(label: string, activate = true, index?: number): EditorGroup {
		this.ensureLoaded();

		const group = this.doCreateGroup(label);

		// Direct index provided
		if (typeof index === 'number') {
			this._groups[index] = group;
		}

		// First group
		else if (!this._activeGroup) {
			this._groups.push(group);
		}

		// Subsequent group (open to the right of active one)
		else {
			this._groups.splice(this.indexOf(this._activeGroup) + 1, 0, group);
		}

		// Event
		this.fireEvent(this._onGroupOpened, group, true);

		// Activate if we are first or set to activate groups
		if (!this._activeGroup || activate) {
			this.setActive(group);
		}

		return group;
	}

	public renameGroup(group: EditorGroup, label: string): void {
		this.ensureLoaded();

		if (group.label !== label) {
			group.label = label;
			this.fireEvent(this._onGroupRenamed, group, false);
		}
	}

	public closeGroup(group: EditorGroup): void {
		this.ensureLoaded();

		const index = this.indexOf(group);
		if (index < 0) {
			return; // group does not exist
		}

		// Active group closed: Find a new active one to the right
		if (group === this._activeGroup) {

			// More than one group
			if (this._groups.length > 1) {
				let newActiveGroup: EditorGroup;
				if (this._groups.length > index + 1) {
					newActiveGroup = this._groups[index + 1]; // make next group to the right active
				} else {
					newActiveGroup = this._groups[index - 1]; // make next group to the left active
				}

				this.setActive(newActiveGroup);
			}

			// One group
			else {
				this._activeGroup = null;
			}
		}

		// Close Editors in Group first and dispose then
		group.closeAllEditors();
		group.dispose();

		// Splice from groups
		this._groups.splice(index, 1);
		this.groupToIdentifier[group.id] = void 0;

		// Events
		this.fireEvent(this._onGroupClosed, group, true);
		for (let i = index; i < this._groups.length; i++) {
			this.fireEvent(this._onGroupMoved, this._groups[i], true); // send move event for groups to the right that moved to the left into the closed group position
		}
	}

	public closeGroups(except?: EditorGroup): void {
		this.ensureLoaded();

		// Optimize: close all non active groups first to produce less upstream work
		this.groups.filter(g => g !== this._activeGroup && g !== except).forEach(g => this.closeGroup(g));

		// Close active unless configured to skip
		if (this._activeGroup !== except) {
			this.closeGroup(this._activeGroup);
		}
	}

	public setActive(group: EditorGroup): void {
		this.ensureLoaded();

		if (this._activeGroup === group) {
			return;
		}

		const oldActiveGroup = this._activeGroup;
		this._activeGroup = group;

		this.fireEvent(this._onGroupActivated, group, false);
		if (oldActiveGroup) {
			this.fireEvent(this._onGroupDeactivated, oldActiveGroup, false);
		}
	}

	public moveGroup(group: EditorGroup, toIndex: number): void {
		this.ensureLoaded();

		const index = this.indexOf(group);
		if (index < 0) {
			return;
		}

		// Move
		this._groups.splice(index, 1);
		this._groups.splice(toIndex, 0, group);

		// Event
		for (let i = Math.min(index, toIndex); i <= Math.max(index, toIndex) && i < this._groups.length; i++) {
			this.fireEvent(this._onGroupMoved, this._groups[i], true); // send move event for groups to the right that moved to the left into the closed group position
		}
	}

	private indexOf(group: EditorGroup): number {
		return this._groups.indexOf(group);
	}

	public positionOfGroup(group: IEditorGroup): Position;
	public positionOfGroup(group: EditorGroup): Position;
	public positionOfGroup(group: EditorGroup): Position {
		return this.indexOf(group);
	}

	public groupAt(position: Position): EditorGroup {
		this.ensureLoaded();

		return this._groups[position];
	}

	public next(jumpGroups: boolean): IEditorIdentifier {
		this.ensureLoaded();

		if (!this.activeGroup) {
			return null;
		}

		const index = this.activeGroup.indexOf(this.activeGroup.activeEditor);

		// Return next in group
		if (index + 1 < this.activeGroup.count) {
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(index + 1) };
		}

		// Return first if we are not jumping groups
		if (!jumpGroups) {
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(0) };
		}

		// Return first in next group
		const indexOfGroup = this.indexOf(this.activeGroup);
		const nextGroup = this.groups[indexOfGroup + 1];
		if (nextGroup) {
			return { group: nextGroup, editor: nextGroup.getEditor(0) };
		}

		// Return first in first group
		const firstGroup = this.groups[0];
		return { group: firstGroup, editor: firstGroup.getEditor(0) };
	}

	public previous(jumpGroups: boolean): IEditorIdentifier {
		this.ensureLoaded();

		if (!this.activeGroup) {
			return null;
		}

		const index = this.activeGroup.indexOf(this.activeGroup.activeEditor);

		// Return previous in group
		if (index > 0) {
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(index - 1) };
		}

		// Return last if we are not jumping groups
		if (!jumpGroups) {
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(this.activeGroup.count - 1) };
		}

		// Return last in previous group
		const indexOfGroup = this.indexOf(this.activeGroup);
		const previousGroup = this.groups[indexOfGroup - 1];
		if (previousGroup) {
			return { group: previousGroup, editor: previousGroup.getEditor(previousGroup.count - 1) };
		}

		// Return last in last group
		const lastGroup = this.groups[this.groups.length - 1];
		return { group: lastGroup, editor: lastGroup.getEditor(lastGroup.count - 1) };
	}

	private save(): void {
		const serialized = this.serialize();

		this.storageService.store(EditorStacksModel.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE);
	}

	private serialize(): ISerializedEditorStacksModel {

		// Exclude now empty groups (can happen if an editor cannot be serialized)
		let serializableGroups = this._groups.map(g => g.serialize()).filter(g => g.editors.length > 0);

		// Only consider active index if we do not have empty groups
		let serializableActiveIndex: number;
		if (serializableGroups.length > 0) {
			if (serializableGroups.length === this._groups.length) {
				serializableActiveIndex = this.indexOf(this._activeGroup);
			} else {
				serializableActiveIndex = 0;
			}
		}

		return {
			groups: serializableGroups,
			active: serializableActiveIndex
		};
	}

	private fireEvent(emitter: Emitter<EditorGroup>, group: EditorGroup, isStructuralChange: boolean): void {
		emitter.fire(group);
		this._onModelChanged.fire({ group, structural: isStructuralChange });
	}

	private ensureLoaded(): void {
		if (!this.loaded) {
			this.loaded = true;
			this.load();
		}
	}

	private load(): void {
		if (!this.restoreFromStorage) {
			return; // do not load from last session if the user explicitly asks to open a set of files
		}

		const modelRaw = this.storageService.get(EditorStacksModel.STORAGE_KEY, StorageScope.WORKSPACE);
		if (modelRaw) {
			const serialized: ISerializedEditorStacksModel = JSON.parse(modelRaw);

			const invalidId = this.doValidate(serialized);
			if (invalidId) {
				console.warn(`Ignoring invalid stacks model (Error code: ${invalidId}): ${JSON.stringify(serialized)}`);
				console.warn(serialized);
				return;
			}

			this._groups = serialized.groups.map(s => this.doCreateGroup(s));
			this._activeGroup = this._groups[serialized.active];
		}
	}

	private doValidate(serialized: ISerializedEditorStacksModel): number {
		if (!serialized.groups.length && typeof serialized.active === 'number') {
			return 1; // Invalid active (we have no groups, but an active one)
		}

		if (serialized.groups.length && !serialized.groups[serialized.active]) {
			return 2; // Invalid active (we cannot find the active one in group)
		}

		if (serialized.groups.length > 3) {
			return 3; // Too many groups
		}

		if (serialized.groups.some(g => !g.editors.length)) {
			return 4; // Some empty groups
		}

		if (serialized.groups.some(g => g.editors.length !== g.mru.length)) {
			return 5; // MRU out of sync with editors
		}

		if (serialized.groups.some(g => typeof g.preview === 'number' && !g.editors[g.preview])) {
			return 6; // Invalid preview editor
		}

		if (serialized.groups.some(g => !g.label)) {
			return 7; // Group without label
		}

		return 0;
	}

	private doCreateGroup(arg1: string | ISerializedEditorGroup): EditorGroup {
		const group = this.instantiationService.createInstance(EditorGroup, arg1);

		this.groupToIdentifier[group.id] = group;

		// Funnel editor changes in the group through our event aggregator
		const unbind: IDisposable[] = [];
		unbind.push(group.onEditorsStructureChanged(editor => this._onModelChanged.fire({ group, editor, structural: true })));
		unbind.push(group.onEditorStateChanged(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onEditorOpened(editor => this._onEditorOpened.fire({ editor, group })));
		unbind.push(group.onEditorClosed(event => {
			this.handleOnEditorClosed(event);
			this._onEditorClosed.fire(event);
		}));
		unbind.push(group.onEditorDisposed(editor => this._onEditorDisposed.fire({ editor, group })));
		unbind.push(group.onEditorDirty(editor => this._onEditorDirty.fire({ editor, group })));
		unbind.push(group.onEditorLabelChange(editor => this._onEditorLabelChange.fire({ editor, group })));
		unbind.push(this.onGroupClosed(g => {
			if (g === group) {
				dispose(unbind);
			}
		}));

		return group;
	}

	private handleOnEditorClosed(event: GroupEvent): void {
		const editor = event.editor;

		// Close the editor when it is no longer open in any group
		if (!this.isOpen(editor)) {
			editor.close();

			// Also take care of side by side editor inputs that wrap around 2 editors
			if (editor instanceof SideBySideEditorInput) {
				[editor.master, editor.details].forEach(editor => {
					if (!this.isOpen(editor)) {
						editor.close();
					}
				});
			}
		}
	}

	public isOpen(resource: URI): boolean;
	public isOpen(editor: EditorInput): boolean;
	public isOpen(arg1: any): boolean {
		return this._groups.some(group => group.contains(arg1));
	}

	public count(resource: URI): number;
	public count(editor: EditorInput): number;
	public count(arg1: any): number {
		return this._groups.filter(group => group.contains(arg1)).length;
	}

	private onShutdown(): void {
		this.save();

		dispose(this.toDispose);
	}

	public validate(): void {
		const serialized = this.serialize();
		const invalidId = this.doValidate(serialized);
		if (invalidId) {
			console.warn(`Ignoring invalid stacks model (Error code: ${invalidId}): ${JSON.stringify(serialized)}`);
			console.warn(serialized);
		} else {
			console.log('Stacks Model OK!');
		}
	}

	public toString(): string {
		this.ensureLoaded();

		const lines: string[] = [];

		if (!this.groups.length) {
			return '<No Groups>';
		}

		this.groups.forEach(g => {
			let label = `Group: ${g.label}`;

			if (this._activeGroup === g) {
				label = `${label} [active]`;
			}

			lines.push(label);

			g.getEditors().forEach(e => {
				let label = `\t${e.getName()}`;

				if (g.previewEditor === e) {
					label = `${label} [preview]`;
				}

				if (g.activeEditor === e) {
					label = `${label} [active]`;
				}

				lines.push(label);
			});
		});

		return lines.join('\n');
	}
}