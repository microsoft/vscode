/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, Emitter, once } from 'vs/base/common/event';
import { Extensions, IEditorInputFactoryRegistry, EditorInput, toResource, IEditorStacksModel, IEditorGroup, IEditorIdentifier, IEditorCloseEvent, GroupIdentifier, IStacksModelChangeEvent, EditorOpenPositioning, SideBySideEditorInput, OPEN_POSITIONING_CONFIG } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { dispose, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Position, Direction } from 'vs/platform/editor/common/editor';
import { ResourceMap } from 'vs/base/common/map';

export interface EditorCloseEvent extends IEditorCloseEvent {
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
	id: number;
	label: string;
	editors: ISerializedEditorInput[];
	mru: number[];
	preview: number;
}

export function isSerializedEditorGroup(obj?: any): obj is ISerializedEditorGroup {
	const group = obj as ISerializedEditorGroup;

	return obj && typeof obj === 'object' && Array.isArray(group.editors) && Array.isArray(group.mru);
}

export class EditorGroup extends Disposable implements IEditorGroup {

	private static IDS = 0;

	//#region events

	private readonly _onDidEditorActivate = this._register(new Emitter<EditorInput>());
	get onDidEditorActivate(): Event<EditorInput> { return this._onDidEditorActivate.event; }

	private readonly _onDidEditorOpen = this._register(new Emitter<EditorInput>());
	get onDidEditorOpen(): Event<EditorInput> { return this._onDidEditorOpen.event; }

	private readonly _onDidEditorClose = this._register(new Emitter<EditorCloseEvent>());
	get onDidEditorClose(): Event<EditorCloseEvent> { return this._onDidEditorClose.event; }

	private readonly _onDidEditorDispose = this._register(new Emitter<EditorInput>());
	get onDidEditorDispose(): Event<EditorInput> { return this._onDidEditorDispose.event; }

	private readonly _onDidEditorBecomeDirty = this._register(new Emitter<EditorInput>());
	get onDidEditorBecomeDirty(): Event<EditorInput> { return this._onDidEditorBecomeDirty.event; }

	private readonly _onDidEditorLabelChange = this._register(new Emitter<EditorInput>());
	get onDidEditorLabelChange(): Event<EditorInput> { return this._onDidEditorLabelChange.event; }

	private readonly _onDidEditorMove = this._register(new Emitter<EditorInput>());
	get onDidEditorMove(): Event<EditorInput> { return this._onDidEditorMove.event; }

	private readonly _onDidEditorPin = this._register(new Emitter<EditorInput>());
	get onDidEditorPin(): Event<EditorInput> { return this._onDidEditorPin.event; }

	private readonly _onDidEditorUnpin = this._register(new Emitter<EditorInput>());
	get onDidEditorUnpin(): Event<EditorInput> { return this._onDidEditorUnpin.event; }

	//#endregion

	private _id: GroupIdentifier;
	private _label: string;

	private editors: EditorInput[] = [];
	private mru: EditorInput[] = [];
	private mapResourceToEditorCount: ResourceMap<number> = new ResourceMap<number>();

	private preview: EditorInput; // editor in preview state
	private active: EditorInput;  // editor in active state

	private editorOpenPositioning: 'left' | 'right' | 'first' | 'last';

	constructor(
		labelOrSerializedGroup: string | ISerializedEditorGroup,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();

		if (isSerializedEditorGroup(labelOrSerializedGroup)) {
			this.deserialize(labelOrSerializedGroup);
		} else {
			this._id = EditorGroup.IDS++;
			this._label = labelOrSerializedGroup;
		}

		this.onConfigurationUpdated();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(event?: IConfigurationChangeEvent): void {
		this.editorOpenPositioning = this.configurationService.getValue(OPEN_POSITIONING_CONFIG);
	}

	get id(): GroupIdentifier {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	set label(label: string) {
		this._label = label;
	}

	get count(): number {
		return this.editors.length;
	}

	getEditors(mru?: boolean): EditorInput[] {
		return mru ? this.mru.slice(0) : this.editors.slice(0);
	}

	getEditor(index: number): EditorInput;
	getEditor(resource: URI): EditorInput;
	getEditor(arg1: any): EditorInput {
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

	get activeEditor(): EditorInput {
		return this.active;
	}

	isActive(editor: EditorInput): boolean {
		return this.matches(this.active, editor);
	}

	get previewEditor(): EditorInput {
		return this.preview;
	}

	isPreview(editor: EditorInput): boolean {
		return this.matches(this.preview, editor);
	}

	openEditor(editor: EditorInput, options?: IEditorOpenOptions): void {
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

					this.replaceEditor(this.preview, editor, targetIndex, !makeActive);
				}

				this.preview = editor;
			}

			// Listeners
			this.hookEditorListeners(editor);

			// Event
			this._onDidEditorOpen.fire(editor);

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
				this._onDidEditorDispose.fire(editor);
			}
		}));

		// Re-Emit dirty state changes
		unbind.push(editor.onDidChangeDirty(() => {
			this._onDidEditorBecomeDirty.fire(editor);
		}));

		// Re-Emit label changes
		unbind.push(editor.onDidChangeLabel(() => {
			this._onDidEditorLabelChange.fire(editor);
		}));

		// Clean up dispose listeners once the editor gets closed
		unbind.push(this.onDidEditorClose(event => {
			if (event.editor.matches(editor)) {
				dispose(unbind);
			}
		}));
	}

	private replaceEditor(toReplace: EditorInput, replaceWidth: EditorInput, replaceIndex: number, openNext = true): void {
		const event = this.doCloseEditor(toReplace, openNext, true); // optimization to prevent multiple setActive() in one call

		// We want to first add the new editor into our model before emitting the close event because
		// firing the close event can trigger a dispose on the same editor that is now being added.
		// This can lead into opening a disposed editor which is not what we want.
		this.splice(replaceIndex, false, replaceWidth);

		if (event) {
			this._onDidEditorClose.fire(event);
		}
	}

	closeEditor(editor: EditorInput, openNext = true): number {
		const event = this.doCloseEditor(editor, openNext, false);

		if (event) {
			this._onDidEditorClose.fire(event);

			return event.index;
		}

		return void 0;
	}

	private doCloseEditor(editor: EditorInput, openNext: boolean, replaced: boolean): EditorCloseEvent {
		const index = this.indexOf(editor);
		if (index === -1) {
			return null; // not found
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
		if (this.matches(this.preview, editor)) {
			this.preview = null;
		}

		// Remove from arrays
		this.splice(index, true);

		// Event
		return { editor, replaced, index, group: this };
	}

	closeEditors(except: EditorInput, direction?: Direction): void {
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

	closeAllEditors(): void {

		// Optimize: close all non active editors first to produce less upstream work
		this.mru.filter(e => !this.matches(e, this.active)).forEach(e => this.closeEditor(e));
		this.closeEditor(this.active);
	}

	moveEditor(editor: EditorInput, toIndex: number): void {
		const index = this.indexOf(editor);
		if (index < 0) {
			return;
		}

		// Move
		this.editors.splice(index, 1);
		this.editors.splice(toIndex, 0, editor);

		// Event
		this._onDidEditorMove.fire(editor);
	}

	setActive(editor: EditorInput): void {
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
		this._onDidEditorActivate.fire(editor);
	}

	pin(editor: EditorInput): void {
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
		this._onDidEditorPin.fire(editor);
	}

	unpin(editor: EditorInput): void {
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
		this._onDidEditorUnpin.fire(editor);

		// Close old preview editor if any
		this.closeEditor(oldPreview);
	}

	isPinned(editor: EditorInput): boolean;
	isPinned(index: number): boolean;
	isPinned(arg1: EditorInput | number): boolean {
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
			let counter = this.mapResourceToEditorCount.get(resource) || 0;
			let newCounter: number;
			if (remove) {
				if (counter > 1) {
					newCounter = counter - 1;
				}
			} else {
				newCounter = counter + 1;
			}

			this.mapResourceToEditorCount.set(resource, newCounter);
		}
	}

	indexOf(candidate: EditorInput, editors = this.editors): number {
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

	contains(editorOrResource: EditorInput | URI): boolean;
	contains(editor: EditorInput, supportSideBySide?: boolean): boolean;
	contains(editorOrResource: EditorInput | URI, supportSideBySide?: boolean): boolean {
		if (editorOrResource instanceof EditorInput) {
			const index = this.indexOf(editorOrResource);
			if (index >= 0) {
				return true;
			}

			if (supportSideBySide && editorOrResource instanceof SideBySideEditorInput) {
				const index = this.indexOf(editorOrResource.master);
				if (index >= 0) {
					return true;
				}
			}

			return false;
		}

		const counter = this.mapResourceToEditorCount.get(editorOrResource);

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

	clone(): EditorGroup {
		const group = this.instantiationService.createInstance(EditorGroup, '');
		group.editors = this.editors.slice(0);
		group.mru = this.mru.slice(0);
		group.mapResourceToEditorCount = this.mapResourceToEditorCount.clone();
		group.preview = this.preview;
		group.active = this.active;
		group.editorOpenPositioning = this.editorOpenPositioning;

		return group;
	}

	serialize(): ISerializedEditorGroup {
		const registry = Registry.as<IEditorInputFactoryRegistry>(Extensions.EditorInputFactories);

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
			id: this.id,
			label: this.label,
			editors: serializedEditors,
			mru: serializableMru,
			preview: serializablePreviewIndex,
		};
	}

	private deserialize(data: ISerializedEditorGroup): void {
		const registry = Registry.as<IEditorInputFactoryRegistry>(Extensions.EditorInputFactories);

		if (typeof data.id === 'number') {
			this._id = data.id;

			EditorGroup.IDS = Math.max(data.id + 1, EditorGroup.IDS); // make sure our ID generator is always larger
		} else {
			this._id = EditorGroup.IDS++; // backwards compatibility
		}

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
}

//#region legacy stacks model

interface ISerializedEditorStacksModel {
	groups: ISerializedEditorGroup[];
	active: number;
}

export class EditorStacksModel implements IEditorStacksModel {

	private static readonly STORAGE_KEY = 'editorStacks.model';

	private toDispose: IDisposable[];
	private loaded: boolean;

	private _groups: EditorGroup[];
	private _activeGroup: EditorGroup;
	private groupToIdentifier: { [id: number]: EditorGroup };

	private readonly _onGroupOpened: Emitter<EditorGroup>;
	private readonly _onGroupClosed: Emitter<EditorGroup>;
	private readonly _onGroupMoved: Emitter<EditorGroup>;
	private readonly _onGroupActivated: Emitter<EditorGroup>;
	private readonly _onGroupDeactivated: Emitter<EditorGroup>;
	private readonly _onGroupRenamed: Emitter<EditorGroup>;

	private readonly _onEditorDisposed: Emitter<EditorIdentifier>;
	private readonly _onEditorDirty: Emitter<EditorIdentifier>;
	private readonly _onEditorLabelChange: Emitter<EditorIdentifier>;
	private readonly _onEditorOpened: Emitter<EditorIdentifier>;

	private readonly _onWillCloseEditor: Emitter<EditorCloseEvent>;
	private readonly _onEditorClosed: Emitter<EditorCloseEvent>;

	private readonly _onModelChanged: Emitter<IStacksModelChangeEvent>;

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
		this._onWillCloseEditor = new Emitter<EditorCloseEvent>();
		this._onEditorClosed = new Emitter<EditorCloseEvent>();

		this.toDispose.push(this._onGroupOpened, this._onGroupClosed, this._onGroupActivated, this._onGroupDeactivated, this._onGroupMoved, this._onGroupRenamed, this._onModelChanged, this._onEditorDisposed, this._onEditorDirty, this._onEditorLabelChange, this._onEditorOpened, this._onEditorClosed, this._onWillCloseEditor);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.lifecycleService.onShutdown(reason => this.onShutdown()));
	}

	get onGroupOpened(): Event<EditorGroup> {
		return this._onGroupOpened.event;
	}

	get onGroupClosed(): Event<EditorGroup> {
		return this._onGroupClosed.event;
	}

	get onGroupActivated(): Event<EditorGroup> {
		return this._onGroupActivated.event;
	}

	get onGroupDeactivated(): Event<EditorGroup> {
		return this._onGroupDeactivated.event;
	}

	get onGroupMoved(): Event<EditorGroup> {
		return this._onGroupMoved.event;
	}

	get onGroupRenamed(): Event<EditorGroup> {
		return this._onGroupRenamed.event;
	}

	get onModelChanged(): Event<IStacksModelChangeEvent> {
		return this._onModelChanged.event;
	}

	get onEditorDisposed(): Event<EditorIdentifier> {
		return this._onEditorDisposed.event;
	}

	get onEditorDirty(): Event<EditorIdentifier> {
		return this._onEditorDirty.event;
	}

	get onEditorLabelChange(): Event<EditorIdentifier> {
		return this._onEditorLabelChange.event;
	}

	get onEditorOpened(): Event<EditorIdentifier> {
		return this._onEditorOpened.event;
	}

	get onWillCloseEditor(): Event<EditorCloseEvent> {
		return this._onWillCloseEditor.event;
	}

	get onEditorClosed(): Event<EditorCloseEvent> {
		return this._onEditorClosed.event;
	}

	get groups(): EditorGroup[] {
		this.ensureLoaded();

		return this._groups.slice(0);
	}

	get activeGroup(): EditorGroup {
		this.ensureLoaded();

		return this._activeGroup;
	}

	isActive(group: EditorGroup): boolean {
		return this.activeGroup === group;
	}

	getGroup(id: GroupIdentifier): EditorGroup {
		this.ensureLoaded();

		return this.groupToIdentifier[id];
	}

	openGroup(label: string, activate = true, index?: number): EditorGroup {
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

	renameGroup(group: EditorGroup, label: string): void {
		this.ensureLoaded();

		if (group.label !== label) {
			group.label = label;
			this.fireEvent(this._onGroupRenamed, group, false);
		}
	}

	closeGroup(group: EditorGroup): void {
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

	closeGroups(except?: EditorGroup): void {
		this.ensureLoaded();

		// Optimize: close all non active groups first to produce less upstream work
		this.groups.filter(g => g !== this._activeGroup && g !== except).forEach(g => this.closeGroup(g));

		// Close active unless configured to skip
		if (this._activeGroup !== except) {
			this.closeGroup(this._activeGroup);
		}
	}

	setActive(group: EditorGroup): void {
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

	moveGroup(group: EditorGroup, toIndex: number): void {
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

	findGroup(editor: EditorInput, activeOnly?: boolean): EditorGroup {
		const groupsToCheck = (this.activeGroup ? [this.activeGroup] : []).concat(this.groups.filter(g => g !== this.activeGroup));

		for (let i = 0; i < groupsToCheck.length; i++) {
			const group = groupsToCheck[i];
			const editorsToCheck = (group.activeEditor ? [group.activeEditor] : []).concat(group.getEditors().filter(e => e !== group.activeEditor));

			for (let j = 0; j < editorsToCheck.length; j++) {
				const editorToCheck = editorsToCheck[j];

				if ((!activeOnly || group.isActive(editorToCheck)) && editor.matches(editorToCheck)) {
					return group;
				}
			}
		}

		return void 0;
	}

	positionOfGroup(group: IEditorGroup): Position;
	positionOfGroup(group: EditorGroup): Position;
	positionOfGroup(group: EditorGroup): Position {
		return this.indexOf(group);
	}

	groupAt(position: Position): EditorGroup {
		this.ensureLoaded();

		return this._groups[position];
	}

	next(jumpGroups: boolean, cycleAtEnd = true): IEditorIdentifier {
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
			if (!cycleAtEnd) {
				return null;
			}
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(0) };
		}

		// Return first in next group
		const indexOfGroup = this.indexOf(this.activeGroup);
		const nextGroup = this.groups[indexOfGroup + 1];
		if (nextGroup) {
			return { group: nextGroup, editor: nextGroup.getEditor(0) };
		}

		// Return null if we are not cycling at the end
		if (!cycleAtEnd) {
			return null;
		}

		// Return first in first group
		const firstGroup = this.groups[0];
		return { group: firstGroup, editor: firstGroup.getEditor(0) };
	}

	previous(jumpGroups: boolean, cycleAtStart = true): IEditorIdentifier {
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
			if (!cycleAtStart) {
				return null;
			}
			return { group: this.activeGroup, editor: this.activeGroup.getEditor(this.activeGroup.count - 1) };
		}

		// Return last in previous group
		const indexOfGroup = this.indexOf(this.activeGroup);
		const previousGroup = this.groups[indexOfGroup - 1];
		if (previousGroup) {
			return { group: previousGroup, editor: previousGroup.getEditor(previousGroup.count - 1) };
		}

		// Return null if we are not cycling at the start
		if (!cycleAtStart) {
			return null;
		}

		// Return last in last group
		const lastGroup = this.groups[this.groups.length - 1];
		return { group: lastGroup, editor: lastGroup.getEditor(lastGroup.count - 1) };
	}

	last(): IEditorIdentifier {
		this.ensureLoaded();

		if (!this.activeGroup) {
			return null;
		}

		return { group: this.activeGroup, editor: this.activeGroup.getEditor(this.activeGroup.count - 1) };
	}

	private save(): void {
		const serialized = this.serialize();

		if (serialized.groups.length) {
			this.storageService.store(EditorStacksModel.STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(EditorStacksModel.STORAGE_KEY, StorageScope.WORKSPACE);
		}
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
		unbind.push(group.onDidEditorClose(event => this._onModelChanged.fire({ group, editor: event.editor, structural: true })));
		unbind.push(group.onDidEditorOpen(editor => this._onModelChanged.fire({ group, editor: editor, structural: true })));
		unbind.push(group.onDidEditorMove(editor => this._onModelChanged.fire({ group, editor: editor, structural: true })));
		unbind.push(group.onDidEditorActivate(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onDidEditorBecomeDirty(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onDidEditorLabelChange(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onDidEditorPin(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onDidEditorUnpin(editor => this._onModelChanged.fire({ group, editor })));
		unbind.push(group.onDidEditorOpen(editor => this._onEditorOpened.fire({ editor, group })));
		unbind.push(group.onDidEditorClose(event => {
			this._onWillCloseEditor.fire(event);
			this.handleOnEditorClosed(event);
			this._onEditorClosed.fire(event);
		}));
		unbind.push(group.onDidEditorDispose(editor => this._onEditorDisposed.fire({ editor, group })));
		unbind.push(group.onDidEditorBecomeDirty(editor => this._onEditorDirty.fire({ editor, group })));
		unbind.push(group.onDidEditorLabelChange(editor => this._onEditorLabelChange.fire({ editor, group })));
		unbind.push(this.onGroupClosed(g => {
			if (g === group) {
				dispose(unbind);
			}
		}));

		return group;
	}

	private handleOnEditorClosed(event: EditorCloseEvent): void {
		const editor = event.editor;
		const editorsToClose = [editor];

		// Include both sides of side by side editors when being closed and not opened multiple times
		if (editor instanceof SideBySideEditorInput && !this.isOpen(editor)) {
			editorsToClose.push(editor.master, editor.details);
		}

		// Close the editor when it is no longer open in any group including diff editors
		editorsToClose.forEach(editorToClose => {
			const resource = editorToClose ? editorToClose.getResource() : void 0; // prefer resource to not close right-hand side editors of a diff editor
			if (!this.isOpen(resource || editorToClose)) {
				editorToClose.close();
			}
		});
	}

	isOpen(editorOrResource: URI | EditorInput): boolean {
		return this._groups.some(group => group.contains(editorOrResource));
	}

	count(editor: EditorInput): number {
		return this._groups.filter(group => group.contains(editor)).length;
	}

	private onShutdown(): void {
		this.save();

		dispose(this.toDispose);
	}

	validate(): void {
		const serialized = this.serialize();
		const invalidId = this.doValidate(serialized);
		if (invalidId) {
			console.warn(`Ignoring invalid stacks model (Error code: ${invalidId}): ${JSON.stringify(serialized)}`);
			console.warn(serialized);
		} else {
			console.log('Stacks Model OK!');
		}
	}

	toString(): string {
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

//#endregion