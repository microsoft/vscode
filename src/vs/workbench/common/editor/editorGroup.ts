/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Extensions, IEditorInputFactoryRegistry, EditorInput, toResource, IEditorIdentifier, IEditorCloseEvent, GroupIdentifier, SideBySideEditorInput, CloseDirection, IEditorInput, SideBySideEditor } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ResourceMap } from 'vs/base/common/map';
import { coalesce } from 'vs/base/common/arrays';

const EditorOpenPositioning = {
	LEFT: 'left',
	RIGHT: 'right',
	FIRST: 'first',
	LAST: 'last'
};

export interface EditorCloseEvent extends IEditorCloseEvent {
	editor: EditorInput;
}

export interface EditorIdentifier extends IEditorIdentifier {
	groupId: GroupIdentifier;
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
	editors: ISerializedEditorInput[];
	mru: number[];
	preview?: number;
}

export function isSerializedEditorGroup(obj?: any): obj is ISerializedEditorGroup {
	const group: ISerializedEditorGroup = obj;

	return obj && typeof obj === 'object' && Array.isArray(group.editors) && Array.isArray(group.mru);
}

export class EditorGroup extends Disposable {

	private static IDS = 0;

	//#region events

	private readonly _onDidEditorActivate = this._register(new Emitter<EditorInput>());
	readonly onDidEditorActivate: Event<EditorInput> = this._onDidEditorActivate.event;

	private readonly _onDidEditorOpen = this._register(new Emitter<EditorInput>());
	readonly onDidEditorOpen: Event<EditorInput> = this._onDidEditorOpen.event;

	private readonly _onDidEditorClose = this._register(new Emitter<EditorCloseEvent>());
	readonly onDidEditorClose: Event<EditorCloseEvent> = this._onDidEditorClose.event;

	private readonly _onDidEditorDispose = this._register(new Emitter<EditorInput>());
	readonly onDidEditorDispose: Event<EditorInput> = this._onDidEditorDispose.event;

	private readonly _onDidEditorBecomeDirty = this._register(new Emitter<EditorInput>());
	readonly onDidEditorBecomeDirty: Event<EditorInput> = this._onDidEditorBecomeDirty.event;

	private readonly _onDidEditorLabelChange = this._register(new Emitter<EditorInput>());
	readonly onDidEditorLabelChange: Event<EditorInput> = this._onDidEditorLabelChange.event;

	private readonly _onDidEditorMove = this._register(new Emitter<EditorInput>());
	readonly onDidEditorMove: Event<EditorInput> = this._onDidEditorMove.event;

	private readonly _onDidEditorPin = this._register(new Emitter<EditorInput>());
	readonly onDidEditorPin: Event<EditorInput> = this._onDidEditorPin.event;

	private readonly _onDidEditorUnpin = this._register(new Emitter<EditorInput>());
	readonly onDidEditorUnpin: Event<EditorInput> = this._onDidEditorUnpin.event;

	//#endregion

	private _id: GroupIdentifier;

	private editors: EditorInput[] = [];
	private mru: EditorInput[] = [];
	private mapResourceToEditorCount: ResourceMap<number> = new ResourceMap<number>();

	private preview: EditorInput | null; // editor in preview state
	private active: EditorInput | null;  // editor in active state

	private editorOpenPositioning: 'left' | 'right' | 'first' | 'last';
	private focusRecentEditorAfterClose: boolean;

	constructor(
		labelOrSerializedGroup: ISerializedEditorGroup,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (isSerializedEditorGroup(labelOrSerializedGroup)) {
			this.deserialize(labelOrSerializedGroup);
		} else {
			this._id = EditorGroup.IDS++;
		}

		this.onConfigurationUpdated();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(event?: IConfigurationChangeEvent): void {
		this.editorOpenPositioning = this.configurationService.getValue('workbench.editor.openPositioning');
		this.focusRecentEditorAfterClose = this.configurationService.getValue('workbench.editor.focusRecentEditorAfterClose');
	}

	get id(): GroupIdentifier {
		return this._id;
	}

	get count(): number {
		return this.editors.length;
	}

	getEditors(mru?: boolean): EditorInput[] {
		return mru ? this.mru.slice(0) : this.editors.slice(0);
	}

	getEditor(index: number): EditorInput | undefined;
	getEditor(resource: URI): EditorInput | undefined;
	getEditor(arg1: number | URI): EditorInput | undefined {
		if (typeof arg1 === 'number') {
			return this.editors[arg1];
		}

		const resource: URI = arg1;
		if (!this.contains(resource)) {
			return undefined; // fast check for resource opened or not
		}

		for (const editor of this.editors) {
			const editorResource = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
			if (editorResource && editorResource.toString() === resource.toString()) {
				return editor;
			}
		}

		return undefined;
	}

	get activeEditor(): EditorInput | null {
		return this.active;
	}

	isActive(editor: EditorInput): boolean {
		return this.matches(this.active, editor);
	}

	get previewEditor(): EditorInput | null {
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
			this.registerEditorListeners(editor);

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

	private registerEditorListeners(editor: EditorInput): void {
		const listeners = new DisposableStore();

		// Re-emit disposal of editor input as our own event
		const onceDispose = Event.once(editor.onDispose);
		listeners.add(onceDispose(() => {
			if (this.indexOf(editor) >= 0) {
				this._onDidEditorDispose.fire(editor);
			}
		}));

		// Re-Emit dirty state changes
		listeners.add(editor.onDidChangeDirty(() => {
			this._onDidEditorBecomeDirty.fire(editor);
		}));

		// Re-Emit label changes
		listeners.add(editor.onDidChangeLabel(() => {
			this._onDidEditorLabelChange.fire(editor);
		}));

		// Clean up dispose listeners once the editor gets closed
		listeners.add(this.onDidEditorClose(event => {
			if (event.editor.matches(editor)) {
				dispose(listeners);
			}
		}));
	}

	private replaceEditor(toReplace: EditorInput, replaceWith: EditorInput, replaceIndex: number, openNext = true): void {
		const event = this.doCloseEditor(toReplace, openNext, true); // optimization to prevent multiple setActive() in one call

		// We want to first add the new editor into our model before emitting the close event because
		// firing the close event can trigger a dispose on the same editor that is now being added.
		// This can lead into opening a disposed editor which is not what we want.
		this.splice(replaceIndex, false, replaceWith);

		if (event) {
			this._onDidEditorClose.fire(event);
		}
	}

	closeEditor(editor: EditorInput, openNext = true): number | undefined {
		const event = this.doCloseEditor(editor, openNext, false);

		if (event) {
			this._onDidEditorClose.fire(event);

			return event.index;
		}

		return undefined;
	}

	private doCloseEditor(editor: EditorInput, openNext: boolean, replaced: boolean): EditorCloseEvent | null {
		const index = this.indexOf(editor);
		if (index === -1) {
			return null; // not found
		}

		// Active Editor closed
		if (openNext && this.matches(this.active, editor)) {

			// More than one editor
			if (this.mru.length > 1) {
				let newActive: EditorInput;
				if (this.focusRecentEditorAfterClose) {
					newActive = this.mru[1]; // active editor is always first in MRU, so pick second editor after as new active
				} else {
					if (index === this.editors.length - 1) {
						newActive = this.editors[index - 1]; // last editor is closed, pick previous as new active
					} else {
						newActive = this.editors[index + 1]; // pick next editor as new active
					}
				}

				this.setActive(newActive);
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
		return { editor, replaced, index, groupId: this.id };
	}

	closeEditors(except: EditorInput, direction?: CloseDirection): void {
		const index = this.indexOf(except);
		if (index === -1) {
			return; // not found
		}

		// Close to the left
		if (direction === CloseDirection.LEFT) {
			for (let i = index - 1; i >= 0; i--) {
				this.closeEditor(this.editors[i]);
			}
		}

		// Close to the right
		else if (direction === CloseDirection.RIGHT) {
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
		if (this.active) {
			this.closeEditor(this.active);
		}
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
		if (oldPreview) {
			this.closeEditor(oldPreview);
		}
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

		const args: (number | EditorInput)[] = [index, del ? 1 : 0];
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
			else if (del && editor) {
				this.mru.splice(indexInMRU, 1, editor); // replace MRU at location
				this.updateResourceMap(editor, false /* add */); // add new to resource map
				this.updateResourceMap(editorToDeleteOrReplace, true /* delete */); // remove replaced from resource map
			}
		}
	}

	private updateResourceMap(editor: EditorInput, remove: boolean): void {
		const resource = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
		if (resource) {

			// It is possible to have the same resource opened twice (once as normal input and once as diff input)
			// So we need to do ref counting on the resource to provide the correct picture
			const counter = this.mapResourceToEditorCount.get(resource) || 0;

			// Add
			let newCounter: number;
			if (!remove) {
				newCounter = counter + 1;
			}

			// Delete
			else {
				newCounter = counter - 1;
			}

			if (newCounter > 0) {
				this.mapResourceToEditorCount.set(resource, newCounter);
			} else {
				this.mapResourceToEditorCount.delete(resource);
			}
		}
	}

	indexOf(candidate: IEditorInput | null, editors = this.editors): number {
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

	private matches(editorA: IEditorInput | null, editorB: IEditorInput | null): boolean {
		return !!editorA && !!editorB && editorA.matches(editorB);
	}

	clone(): EditorGroup {
		const group = this.instantiationService.createInstance(EditorGroup, undefined);
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
		let serializablePreviewIndex: number | undefined;
		this.editors.forEach(e => {
			const factory = registry.getEditorInputFactory(e.getTypeId());
			if (factory) {
				const value = factory.serialize(e);
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

		this.editors = coalesce(data.editors.map(e => {
			const factory = registry.getEditorInputFactory(e.id);
			if (factory) {
				const editor = factory.deserialize(this.instantiationService, e.value);
				if (editor) {
					this.registerEditorListeners(editor);
					this.updateResourceMap(editor, false /* add */);
				}

				return editor;
			}

			return null;
		}));
		this.mru = data.mru.map(i => this.editors[i]);
		this.active = this.mru[0];
		if (typeof data.preview === 'number') {
			this.preview = this.editors[data.preview];
		}
	}
}
