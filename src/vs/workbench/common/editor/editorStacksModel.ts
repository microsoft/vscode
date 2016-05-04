/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {EditorInput} from 'vs/workbench/common/editor';

/// --- API ----

export interface IEditorGroup {

	activeEditor: EditorInput;
	previewEditor: EditorInput;

	onEditorActivated: Event<EditorInput>;
	onEditorOpened: Event<EditorInput>;
	onEditorClosed: Event<EditorInput>;
	onEditorPinned: Event<EditorInput>;
	onEditorUnpinned: Event<EditorInput>;

	getEditors(mru?: boolean): EditorInput[];
	openEditor(editor: EditorInput, options?: IEditorOpenOptions): void;
	closeEditor(editor: EditorInput): void;
	setActive(editor: EditorInput): void;
	isActive(editor: EditorInput): boolean;
	isPreview(editor: EditorInput): boolean;
	isPinned(editor: EditorInput): boolean;

	pin(editor: EditorInput): void;
	unpin(editor: EditorInput): void;
}

export interface IEditorStacksModel {

	onGroupOpened: Event<IEditorGroup>;
	onGroupClosed: Event<IEditorGroup>;
	onGroupActivated: Event<IEditorGroup>;

	groups: IEditorGroup[];
	activeGroup: IEditorGroup;

	openGroup(label: string): IEditorGroup;
	closeGroup(group: IEditorGroup): void;
	setActive(group: IEditorGroup): void;
}

export interface IEditorOpenOptions {
	pinned?: boolean;
	active?: boolean;
}

// N Groups with labels (start with Left, Center, Right)
// Group has a List of editors
// Group can have N editors state pinned and 1 state preview
// Group has 1 active edutir
// Group has MRV(isible) list of editors

// Model has actions to work with inputs
// Open
//   To the left / to the right (setting)
// Close
//   Reveals from the left / from the right (setting)
// Close Others
// Close Editors to the Right
// Close All
// Close All in Group
// Move Editor
// Move Group
// Pin Editor
// Unpin Editor

// Model has resulting events from operations

// Can be serialized and restored

// TODO what about editor input state (dirty decoration)?

export enum Direction {
	LEFT,
	RIGHT
}

const DEFAULT_OPEN_EDITOR_DIRECTION = Direction.RIGHT; // open new editors to the right of existing ones

export class EditorGroup implements IEditorGroup {
	private editors: EditorInput[];
	private mru: EditorInput[];

	private preview: EditorInput; // editor in preview state
	private active: EditorInput;  // editor in active state

	private _onEditorActivated: Emitter<EditorInput>;
	private _onEditorOpened: Emitter<EditorInput>;
	private _onEditorClosed: Emitter<EditorInput>;
	private _onEditorPinned: Emitter<EditorInput>;
	private _onEditorUnpinned: Emitter<EditorInput>;

	constructor(private label: string) {
		this.editors = [];
		this.mru = [];

		this._onEditorActivated = new Emitter<EditorInput>();
		this._onEditorOpened = new Emitter<EditorInput>();
		this._onEditorClosed = new Emitter<EditorInput>();
		this._onEditorPinned = new Emitter<EditorInput>();
		this._onEditorUnpinned = new Emitter<EditorInput>();
	}

	public get onEditorActivated(): Event<EditorInput> {
		return this._onEditorActivated.event;
	}

	public get onEditorOpened(): Event<EditorInput> {
		return this._onEditorOpened.event;
	}

	public get onEditorClosed(): Event<EditorInput> {
		return this._onEditorClosed.event;
	}

	public get onEditorPinned(): Event<EditorInput> {
		return this._onEditorPinned.event;
	}

	public get onEditorUnpinned(): Event<EditorInput> {
		return this._onEditorUnpinned.event;
	}

	public getEditors(mru?: boolean): EditorInput[] {
		return mru ? this.mru.slice(0) : this.editors.slice(0);
	}

	public get activeEditor(): EditorInput {
		return this.active;
	}

	public isActive(editor: EditorInput): boolean {
		return !!this.active && this.active.matches(editor);
	}

	public get previewEditor(): EditorInput {
		return this.preview;
	}

	public isPreview(editor: EditorInput): boolean {
		return !!this.preview && this.preview.matches(editor);
	}

	public openEditor(editor: EditorInput, options?: IEditorOpenOptions): void {
		const index = this.indexOf(editor);
		const indexOfActive = this.indexOf(this.active);
		const indexOfPreview = this.indexOf(this.preview);

		const oldPreviewIsActive = this.preview && this.preview.matches(this.activeEditor);

		const makeActive = (options && options.active) || !this.activeEditor; // make active if this is the first editor to open
		const makePinned = options && options.pinned;

		// New editor
		if (index === -1) {

			// Insert into our list of editors if pinned or we are first
			if (makePinned || indexOfPreview === -1) {
				if (!this.editors.length) {
					this.splice(0, false, editor); // first editor in list
				} else if (DEFAULT_OPEN_EDITOR_DIRECTION === Direction.LEFT) {
					if (indexOfActive === 0) {
						this.splice(0, false, editor); // to the left becoming first editor in list
					} else {
						this.splice(indexOfActive - 1, false, editor); // to the left of active editor
					}
				} else {
					this.splice(indexOfActive, false, editor); // to the right of active editor
				}
			}

			// Handle preview
			if (!makePinned) {
				this.closeEditor(this.preview);
				this.preview = editor;
				this.splice(indexOfPreview, true, editor);
			}

			// Event
			this._onEditorOpened.fire(editor);

			// Handle active
			if (makeActive || oldPreviewIsActive) {
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
		}
	}

	public closeEditor(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		// Active Editor closed
		if (editor.matches(this.active)) {

			// More than one editor
			if (this.editors.length > 1) {
				let newActiveEditor: EditorInput;
				if (this.editors.length > index + 1) {
					newActiveEditor = this.editors[index + 1]; // make next editor to the right active
				} else {
					newActiveEditor = this.editors[index - 1]; // make next editor to the left active
				}

				this.setActive(newActiveEditor);
			}

			// One Editor
			else {
				this.active = null;
			}
		}

		// Preview Editor closed
		if (editor.matches(this.preview)) {
			this.preview = null;
		}

		this.splice(index, true);

		// Event
		this._onEditorClosed.fire(editor);
	}

	public setActive(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // not found
		}

		if (editor.matches(this.active)) {
			return; // already active
		}

		this.active = editor;

		this.setMostRecentlyUsed(editor);

		// Event
		this._onEditorActivated.fire(editor);
	}

	public pin(editor: EditorInput): void {
		if (!this.isPreview(editor)) {
			return; // can only pin a preview editor
		}

		// Convert the preview editor to be a pinned editor
		this.preview = null;

		// Event
		this._onEditorPinned.fire(editor);
	}

	public unpin(editor: EditorInput): void {
		if (!this.isPinned(editor)) {
			return; // can only unpin a pinned editor
		}

		// Set new
		const oldPreview = this.preview;
		this.preview = editor;

		// Event
		this._onEditorUnpinned.fire(editor);

		// Close old preview editor if any
		this.closeEditor(oldPreview);
	}

	public isPinned(editor: EditorInput): boolean {
		const index = this.indexOf(editor);
		if (index === -1) {
			return false; // editor not found
		}

		if (!this.preview) {
			return true; // no preview editor
		}

		return !this.preview.matches(editor);
	}

	private splice(index: number, del: boolean, editor?: EditorInput): void {

		// Perform on editors array
		const args:any[] = [index, del];
		if (editor) {
			args.push(editor);
		}
		this.editors.splice.apply(this.editors, args);

		// Add: make it LRU editor
		if (!del && editor) {
			this.mru.push(editor);
		}

		// Remove: remove from MRU
		else if (del && !editor) {
			this.mru.splice(this.indexOf(this.editors[index]), 1);
		}

		// Replace: replace MRU at location
		else {
			this.mru.splice(this.indexOf(this.editors[index]), 1, editor);
		}
	}

	private indexOf(candidate: EditorInput, editors = this.editors): number {
		if (!candidate) {
			return -1;
		}

		for (let i = 0; i < editors.length; i++) {
			if (editors[i].matches(candidate)) {
				return i;
			}
		}

		return -1;
	}

	private setMostRecentlyUsed(editor: EditorInput): void {
		const index = this.indexOf(editor);
		if (index === -1) {
			return; // editor not found
		}

		const mruIndex = this.indexOf(editor, this.mru);

		// Remove old index
		if (mruIndex >= 0) {
			this.mru.splice(mruIndex, 1);
		}

		// Set to front
		this.mru.unshift(editor);
	}
}

export class EditorStacksModel implements IEditorStacksModel {
	private _groups: EditorGroup[];
	private active: EditorGroup; // index of group with currently active editor

	private _onGroupOpened: Emitter<EditorGroup>;
	private _onGroupClosed: Emitter<EditorGroup>;
	private _onGroupActivated: Emitter<EditorGroup>;

	constructor() {
		this._groups = [];
		this._onGroupOpened = new Emitter<EditorGroup>();
		this._onGroupClosed = new Emitter<EditorGroup>();
		this._onGroupActivated = new Emitter<EditorGroup>();
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

	public get groups(): EditorGroup[] {
		return this._groups.slice(0);
	}

	public get activeGroup(): EditorGroup {
		return this.active;
	}

	public openGroup(label: string): EditorGroup {
		const group = new EditorGroup(label);

		// First group
		if (!this.active) {
			this._groups.push(group);
		}

		// Subsequent group (add to the right of active)
		else {
			this._groups.splice(this.indexOf(this.active), 0, group);
		}

		// Event
		this._onGroupOpened.fire(group);

		// Make active
		this.setActive(group);

		return group;
	}

	public closeGroup(group: EditorGroup): void {
		const index = this.indexOf(group);
		if (index < 0) {
			return; // group does not exist
		}

		// Active group closed: Find a new active one to the right
		if (group === this.active) {

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
				this.active = null;
			}
		}

		// Splice from groups
		this._groups.splice(index, 1);

		// Event
		this._onGroupClosed.fire(group);
	}

	public setActive(group: EditorGroup): void {
		this.active = group;

		this._onGroupActivated.fire(this.active);
	}

	private indexOf(group: EditorGroup): number {
		return this._groups.indexOf(group);
	}
}