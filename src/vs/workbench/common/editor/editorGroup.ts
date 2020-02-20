/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Extensions, IEditorInputFactoryRegistry, EditorInput, IEditorIdentifier, IEditorCloseEvent, GroupIdentifier, CloseDirection, SideBySideEditorInput, IEditorInput, EditorsOrder } from 'vs/workbench/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
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

export function isSerializedEditorGroup(obj?: unknown): obj is ISerializedEditorGroup {
	const group = obj as ISerializedEditorGroup;

	return obj && typeof obj === 'object' && Array.isArray(group.editors) && Array.isArray(group.mru);
}

export class EditorGroup extends Disposable {

	private static IDS = 0;

	//#region events

	private readonly _onDidActivateEditor = this._register(new Emitter<EditorInput>());
	readonly onDidActivateEditor = this._onDidActivateEditor.event;

	private readonly _onDidOpenEditor = this._register(new Emitter<EditorInput>());
	readonly onDidOpenEditor = this._onDidOpenEditor.event;

	private readonly _onDidCloseEditor = this._register(new Emitter<EditorCloseEvent>());
	readonly onDidCloseEditor = this._onDidCloseEditor.event;

	private readonly _onDidDisposeEditor = this._register(new Emitter<EditorInput>());
	readonly onDidDisposeEditor = this._onDidDisposeEditor.event;

	private readonly _onDidChangeEditorDirty = this._register(new Emitter<EditorInput>());
	readonly onDidChangeEditorDirty = this._onDidChangeEditorDirty.event;

	private readonly _onDidChangeEditorLabel = this._register(new Emitter<EditorInput>());
	readonly onDidEditorLabelChange = this._onDidChangeEditorLabel.event;

	private readonly _onDidMoveEditor = this._register(new Emitter<EditorInput>());
	readonly onDidMoveEditor = this._onDidMoveEditor.event;

	private readonly _onDidChangeEditorPinned = this._register(new Emitter<EditorInput>());
	readonly onDidChangeEditorPinned = this._onDidChangeEditorPinned.event;

	//#endregion

	private _id: GroupIdentifier;
	get id(): GroupIdentifier { return this._id; }

	private editors: EditorInput[] = [];
	private mru: EditorInput[] = [];

	private preview: EditorInput | null = null; // editor in preview state
	private active: EditorInput | null = null;  // editor in active state

	private editorOpenPositioning: ('left' | 'right' | 'first' | 'last') | undefined;
	private focusRecentEditorAfterClose: boolean | undefined;

	constructor(
		labelOrSerializedGroup: ISerializedEditorGroup | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (isSerializedEditorGroup(labelOrSerializedGroup)) {
			this._id = this.deserialize(labelOrSerializedGroup);
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

	get count(): number {
		return this.editors.length;
	}

	getEditors(order: EditorsOrder): EditorInput[] {
		return order === EditorsOrder.MOST_RECENTLY_ACTIVE ? this.mru.slice(0) : this.editors.slice(0);
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return this.editors[index];
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

	openEditor(candidate: EditorInput, options?: IEditorOpenOptions): EditorInput {
		const makePinned = options?.pinned;
		const makeActive = options?.active || !this.activeEditor || (!makePinned && this.matches(this.preview, this.activeEditor));

		const existingEditor = this.findEditor(candidate);

		// New editor
		if (!existingEditor) {
			const newEditor = candidate;
			const indexOfActive = this.indexOf(this.active);

			// Insert into specific position
			let targetIndex: number;
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
				this.splice(targetIndex, false, newEditor);
			}

			// Handle preview
			if (!makePinned) {

				// Replace existing preview with this editor if we have a preview
				if (this.preview) {
					const indexOfPreview = this.indexOf(this.preview);
					if (targetIndex > indexOfPreview) {
						targetIndex--; // accomodate for the fact that the preview editor closes
					}

					this.replaceEditor(this.preview, newEditor, targetIndex, !makeActive);
				}

				this.preview = newEditor;
			}

			// Listeners
			this.registerEditorListeners(newEditor);

			// Event
			this._onDidOpenEditor.fire(newEditor);

			// Handle active
			if (makeActive) {
				this.doSetActive(newEditor);
			}

			return newEditor;
		}

		// Existing editor
		else {

			// Pin it
			if (makePinned) {
				this.doPin(existingEditor);
			}

			// Activate it
			if (makeActive) {
				this.doSetActive(existingEditor);
			}

			// Respect index
			if (options && typeof options.index === 'number') {
				this.moveEditor(existingEditor, options.index);
			}

			return existingEditor;
		}
	}

	private registerEditorListeners(editor: EditorInput): void {
		const listeners = new DisposableStore();

		// Re-emit disposal of editor input as our own event
		const onceDispose = Event.once(editor.onDispose);
		listeners.add(onceDispose(() => {
			if (this.indexOf(editor) >= 0) {
				this._onDidDisposeEditor.fire(editor);
			}
		}));

		// Re-Emit dirty state changes
		listeners.add(editor.onDidChangeDirty(() => {
			this._onDidChangeEditorDirty.fire(editor);
		}));

		// Re-Emit label changes
		listeners.add(editor.onDidChangeLabel(() => {
			this._onDidChangeEditorLabel.fire(editor);
		}));

		// Clean up dispose listeners once the editor gets closed
		listeners.add(this.onDidCloseEditor(event => {
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
			this._onDidCloseEditor.fire(event);
		}
	}

	closeEditor(candidate: EditorInput, openNext = true): EditorInput | undefined {
		const event = this.doCloseEditor(candidate, openNext, false);

		if (event) {
			this._onDidCloseEditor.fire(event);

			return event.editor;
		}

		return undefined;
	}

	private doCloseEditor(candidate: EditorInput, openNext: boolean, replaced: boolean): EditorCloseEvent | undefined {
		const index = this.indexOf(candidate);
		if (index === -1) {
			return undefined; // not found
		}

		const editor = this.editors[index];

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

				this.doSetActive(newActive);
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

	moveEditor(candidate: EditorInput, toIndex: number): EditorInput | undefined {
		const index = this.indexOf(candidate);
		if (index < 0) {
			return;
		}

		const editor = this.editors[index];

		// Move
		this.editors.splice(index, 1);
		this.editors.splice(toIndex, 0, editor);

		// Event
		this._onDidMoveEditor.fire(editor);

		return editor;
	}

	setActive(candidate: EditorInput): EditorInput | undefined {
		const editor = this.findEditor(candidate);
		if (!editor) {
			return; // not found
		}

		this.doSetActive(editor);

		return editor;
	}

	private doSetActive(editor: EditorInput): void {
		if (this.matches(this.active, editor)) {
			return; // already active
		}

		this.active = editor;

		// Bring to front in MRU list
		const mruIndex = this.indexOf(editor, this.mru);
		this.mru.splice(mruIndex, 1);
		this.mru.unshift(editor);

		// Event
		this._onDidActivateEditor.fire(editor);
	}

	pin(candidate: EditorInput): EditorInput | undefined {
		const editor = this.findEditor(candidate);
		if (!editor) {
			return; // not found
		}

		this.doPin(editor);

		return editor;
	}

	private doPin(editor: EditorInput): void {
		if (!this.isPreview(editor)) {
			return; // can only pin a preview editor
		}

		// Convert the preview editor to be a pinned editor
		this.preview = null;

		// Event
		this._onDidChangeEditorPinned.fire(editor);
	}

	unpin(candidate: EditorInput): EditorInput | undefined {
		const editor = this.findEditor(candidate);
		if (!editor) {
			return; // not found
		}

		this.doUnpin(editor);

		return editor;
	}

	private doUnpin(editor: EditorInput): void {
		if (!this.isPinned(editor)) {
			return; // can only unpin a pinned editor
		}

		// Set new
		const oldPreview = this.preview;
		this.preview = editor;

		// Event
		this._onDidChangeEditorPinned.fire(editor);

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

		// Perform on editors array
		if (editor) {
			this.editors.splice(index, del ? 1 : 0, editor);
		} else {
			this.editors.splice(index, del ? 1 : 0);
		}

		// Add
		if (!del && editor) {
			if (this.mru.length === 0) {
				// the list of most recent editors is empty
				// so this editor can only be the most recent
				this.mru.push(editor);
			} else {
				// we have most recent editors. as such we
				// put this newly opened editor right after
				// the current most recent one because it cannot
				// be the most recently active one unless
				// it becomes active. but it is still more
				// active then any other editor in the list.
				this.mru.splice(1, 0, editor);
			}
		}

		// Remove / Replace
		else {
			const indexInMRU = this.indexOf(editorToDeleteOrReplace, this.mru);

			// Remove
			if (del && !editor) {
				this.mru.splice(indexInMRU, 1); // remove from MRU
			}

			// Replace
			else if (del && editor) {
				this.mru.splice(indexInMRU, 1, editor); // replace MRU at location
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

	private findEditor(candidate: EditorInput | null): EditorInput | undefined {
		const index = this.indexOf(candidate, this.editors);
		if (index === -1) {
			return undefined;
		}

		return this.editors[index];
	}

	contains(candidate: EditorInput, searchInSideBySideEditors?: boolean): boolean {
		for (const editor of this.editors) {
			if (this.matches(editor, candidate)) {
				return true;
			}

			if (searchInSideBySideEditors && editor instanceof SideBySideEditorInput) {
				if (this.matches(editor.master, candidate) || this.matches(editor.details, candidate)) {
					return true;
				}
			}
		}

		return false;
	}

	private matches(editor: IEditorInput | null, candidate: IEditorInput | null): boolean {
		if (!editor || !candidate) {
			return false;
		}

		return editor.matches(candidate);
	}

	clone(): EditorGroup {
		const group = this.instantiationService.createInstance(EditorGroup, undefined);
		group.editors = this.editors.slice(0);
		group.mru = this.mru.slice(0);
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

	private deserialize(data: ISerializedEditorGroup): number {
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

		return this._id;
	}
}
