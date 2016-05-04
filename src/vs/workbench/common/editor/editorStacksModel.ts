/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {EditorInput} from 'vs/workbench/common/editor';

/// --- API ----

export interface IEditorGroup {

	editors: EditorInput[];
	activeEditor: EditorInput;
	previewEditor: EditorInput;

	onEditorActivated: Event<EditorInput>;
	onEditorOpened: Event<EditorInput>;
	onEditorClosed: Event<EditorInput>;
	onEditorPinned: Event<EditorInput>;
	onEditorUnpinned: Event<EditorInput>;

	openEditor(editor: EditorInput, options?: IEditorOpenOptions): void;
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

class List<T> {
	private elements: T[];

	constructor() {
		this.elements = [];
	}

	public insert(entry: T, index?: number, dir?: Direction): void {

	}
}

export enum Direction {
	LEFT,
	RIGHT
}

const DEFAULT_OPEN_EDITOR_DIRECTION = Direction.RIGHT; // open new editors to the right of existing ones

export class EditorGroup implements IEditorGroup {
	private _editors: EditorInput[];

	private mru: number[]; // indeces of editors in MRU order

	private preview: EditorInput; // editor in preview state
	private active: EditorInput;  // editor in active state

	private _onEditorActivated: Emitter<EditorInput>;
	private _onEditorOpened: Emitter<EditorInput>;
	private _onEditorClosed: Emitter<EditorInput>;
	private _onEditorPinned: Emitter<EditorInput>;
	private _onEditorUnpinned: Emitter<EditorInput>;

	constructor(private label: string) {
		this._editors = [];
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

	public get editors(): EditorInput[] {
		return this._editors.slice(0);
	}

	public get activeEditor(): EditorInput {
		return this.active;
	}

	public isActive(editor: EditorInput): boolean {
		return this.active && this.active.matches(editor);
	}

	public get previewEditor(): EditorInput {
		return this.preview;
	}

	public isPreview(editor: EditorInput): boolean {
		return this.preview && this.preview.matches(editor);
	}

	public openEditor(editor: EditorInput, options?: IEditorOpenOptions): void {
		const index = this.indexOf(editor);
		const indexOfActive = this.indexOf(this.active);
		const indexOfPreview = this.indexOf(this.preview);
		let oldPreviewToClose:EditorInput;

		const makeActive = options && options.active;
		const makePinned = options && options.pinned;

		// New editor
		if (index === -1) {

			// Insert into our list of editors if pinned or we are first
			if (makePinned || indexOfPreview === -1) {
				if (!this._editors.length) {
					this._editors.push(editor); // first editor in list
				} else if (DEFAULT_OPEN_EDITOR_DIRECTION === Direction.LEFT) {
					if (indexOfActive === 0) {
						this._editors.unshift(editor); // to the left becoming first editor in list
					} else {
						this._editors.splice(indexOfActive - 1, 0, editor); // to the left of active editor
					}
				} else {
					this._editors.splice(indexOfActive, 0, editor); // to the right of active editor
				}
			}

			// Otherwise replace preview one
			else {
				oldPreviewToClose = this.preview;
				this.preview = editor;
				this._editors[indexOfPreview] = editor;
			}

			// Event
			this._onEditorOpened.fire(editor);

			// Make active
			if (makeActive) {
				this.setActive(editor);
			}

			// Close old preview editor if any
			this.closeEditor(oldPreviewToClose);
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
			if (this._editors.length > 1) {
				let newActiveEditor: EditorInput;
				if (this._editors.length > index + 1) {
					newActiveEditor = this._editors[index + 1]; // make next editor to the right active
				} else {
					newActiveEditor = this._editors[index - 1]; // make next editor to the left active
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

		this._editors.splice(index, 1);

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

	private indexOf(candidate: EditorInput): number {
		if (!candidate) {
			return -1;
		}

		for (let i = 0; i < this._editors.length; i++) {
			if (this._editors[i].matches(candidate)) {
				return i;
			}
		}

		return -1;
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