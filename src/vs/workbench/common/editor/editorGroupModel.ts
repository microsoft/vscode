/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IEditorFactoryRegistry, GroupIdentifier, EditorsOrder, EditorExtensions, IUntypedEditorInput, SideBySideEditor, EditorCloseContext, IMatchEditorOptions, GroupModelChangeKind } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { coalesce } from 'vs/base/common/arrays';

const EditorOpenPositioning = {
	LEFT: 'left',
	RIGHT: 'right',
	FIRST: 'first',
	LAST: 'last'
};

export interface IEditorOpenOptions {
	readonly pinned?: boolean;
	sticky?: boolean;
	active?: boolean;
	readonly index?: number;
	readonly supportSideBySide?: SideBySideEditor.ANY | SideBySideEditor.BOTH;
}

export interface IEditorOpenResult {
	readonly editor: EditorInput;
	readonly isNew: boolean;
}

export interface ISerializedEditorInput {
	readonly id: string;
	readonly value: string;
}

export interface ISerializedEditorGroupModel {
	readonly id: number;
	readonly locked?: boolean;
	readonly editors: ISerializedEditorInput[];
	readonly mru: number[];
	readonly preview?: number;
	sticky?: number;
}

export function isSerializedEditorGroupModel(group?: unknown): group is ISerializedEditorGroupModel {
	const candidate = group as ISerializedEditorGroupModel | undefined;

	return !!(candidate && typeof candidate === 'object' && Array.isArray(candidate.editors) && Array.isArray(candidate.mru));
}

export interface IMatchOptions {

	/**
	 * Whether to consider a side by side editor as matching.
	 * By default, side by side editors will not be considered
	 * as matching, even if the editor is opened in one of the sides.
	 */
	readonly supportSideBySide?: SideBySideEditor.ANY | SideBySideEditor.BOTH;

	/**
	 * Only consider an editor to match when the
	 * `candidate === editor` but not when
	 * `candidate.matches(editor)`.
	 */
	readonly strictEquals?: boolean;
}

export interface IGroupModelChangeEvent {

	/**
	 * The kind of change that occurred in the group model.
	 */
	readonly kind: GroupModelChangeKind;

	/**
	 * Only applies when editors change providing
	 * access to the editor the event is about.
	 */
	readonly editor?: EditorInput;

	/**
	 * Only applies when editors change providing
	 * access to the index of the editor the event
	 * is about.
	 */
	readonly editorIndex?: number;
}

export interface IGroupEditorChangeEvent extends IGroupModelChangeEvent {
	readonly editor: EditorInput;
	readonly editorIndex: number;
}

export function isGroupEditorChangeEvent(e: IGroupModelChangeEvent): e is IGroupEditorChangeEvent {
	const candidate = e as IGroupEditorOpenEvent;

	return candidate.editor && candidate.editorIndex !== undefined;
}

export interface IGroupEditorOpenEvent extends IGroupEditorChangeEvent {

	readonly kind: GroupModelChangeKind.EDITOR_OPEN;
}

export function isGroupEditorOpenEvent(e: IGroupModelChangeEvent): e is IGroupEditorOpenEvent {
	const candidate = e as IGroupEditorOpenEvent;

	return candidate.kind === GroupModelChangeKind.EDITOR_OPEN && candidate.editorIndex !== undefined;
}

export interface IGroupEditorMoveEvent extends IGroupEditorChangeEvent {

	readonly kind: GroupModelChangeKind.EDITOR_MOVE;

	/**
	 * Signifies the index the editor is moving from.
	 * `editorIndex` will contain the index the editor
	 * is moving to.
	 */
	readonly oldEditorIndex: number;
}

export function isGroupEditorMoveEvent(e: IGroupModelChangeEvent): e is IGroupEditorMoveEvent {
	const candidate = e as IGroupEditorMoveEvent;

	return candidate.kind === GroupModelChangeKind.EDITOR_MOVE && candidate.editorIndex !== undefined && candidate.oldEditorIndex !== undefined;
}

export interface IGroupEditorCloseEvent extends IGroupEditorChangeEvent {

	readonly kind: GroupModelChangeKind.EDITOR_CLOSE;

	/**
	 * Signifies the context in which the editor
	 * is being closed. This allows for understanding
	 * if a replace or reopen is occurring
	 */
	readonly context: EditorCloseContext;

	/**
	 * Signifies whether or not the closed editor was
	 * sticky. This is necessary becasue state is lost
	 * after closing.
	 */
	readonly sticky: boolean;
}

export function isGroupEditorCloseEvent(e: IGroupModelChangeEvent): e is IGroupEditorCloseEvent {
	const candidate = e as IGroupEditorCloseEvent;

	return candidate.kind === GroupModelChangeKind.EDITOR_CLOSE && candidate.editorIndex !== undefined && candidate.context !== undefined && candidate.sticky !== undefined;
}

interface IEditorCloseResult {
	readonly editor: EditorInput;
	readonly context: EditorCloseContext;
	readonly editorIndex: number;
	readonly sticky: boolean;
}

export class EditorGroupModel extends Disposable {

	private static IDS = 0;

	//#region events

	private readonly _onDidModelChange = this._register(new Emitter<IGroupModelChangeEvent>());
	readonly onDidModelChange = this._onDidModelChange.event;

	//#endregion

	private _id: GroupIdentifier;
	get id(): GroupIdentifier { return this._id; }

	private editors: EditorInput[] = [];
	private mru: EditorInput[] = [];

	private locked = false;

	private preview: EditorInput | null = null; // editor in preview state
	private active: EditorInput | null = null;  // editor in active state
	private sticky = -1; 						// index of first editor in sticky state

	private editorOpenPositioning: ('left' | 'right' | 'first' | 'last') | undefined;
	private focusRecentEditorAfterClose: boolean | undefined;

	constructor(
		labelOrSerializedGroup: ISerializedEditorGroupModel | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (isSerializedEditorGroupModel(labelOrSerializedGroup)) {
			this._id = this.deserialize(labelOrSerializedGroup);
		} else {
			this._id = EditorGroupModel.IDS++;
		}

		this.onConfigurationUpdated();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private onConfigurationUpdated(e?: IConfigurationChangeEvent): void {
		if (e && !e.affectsConfiguration('workbench.editor.openPositioning') && !e.affectsConfiguration('workbench.editor.focusRecentEditorAfterClose')) {
			return;
		}

		this.editorOpenPositioning = this.configurationService.getValue('workbench.editor.openPositioning');
		this.focusRecentEditorAfterClose = this.configurationService.getValue('workbench.editor.focusRecentEditorAfterClose');
	}

	get count(): number {
		return this.editors.length;
	}

	get stickyCount(): number {
		return this.sticky + 1;
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		const editors = order === EditorsOrder.MOST_RECENTLY_ACTIVE ? this.mru.slice(0) : this.editors.slice(0);

		if (options?.excludeSticky) {

			// MRU: need to check for index on each
			if (order === EditorsOrder.MOST_RECENTLY_ACTIVE) {
				return editors.filter(editor => !this.isSticky(editor));
			}

			// Sequential: simply start after sticky index
			return editors.slice(this.sticky + 1);
		}

		return editors;
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return this.editors[index];
	}

	get activeEditor(): EditorInput | null {
		return this.active;
	}

	isActive(editor: EditorInput | IUntypedEditorInput): boolean {
		return this.matches(this.active, editor);
	}

	get previewEditor(): EditorInput | null {
		return this.preview;
	}

	openEditor(candidate: EditorInput, options?: IEditorOpenOptions): IEditorOpenResult {
		const makeSticky = options?.sticky || (typeof options?.index === 'number' && this.isSticky(options.index));
		const makePinned = options?.pinned || options?.sticky;
		const makeActive = options?.active || !this.activeEditor || (!makePinned && this.matches(this.preview, this.activeEditor));

		const existingEditorAndIndex = this.findEditor(candidate, options);

		// New editor
		if (!existingEditorAndIndex) {
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

				// Always make sure targetIndex is after sticky editors
				// unless we are explicitly told to make the editor sticky
				if (!makeSticky && this.isSticky(targetIndex)) {
					targetIndex = this.sticky + 1;
				}
			}

			// Insert to the END
			else if (this.editorOpenPositioning === EditorOpenPositioning.LAST) {
				targetIndex = this.editors.length;
			}

			// Insert to LEFT or RIGHT of active editor
			else {

				// Insert to the LEFT of active editor
				if (this.editorOpenPositioning === EditorOpenPositioning.LEFT) {
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

				// Always make sure targetIndex is after sticky editors
				// unless we are explicitly told to make the editor sticky
				if (!makeSticky && this.isSticky(targetIndex)) {
					targetIndex = this.sticky + 1;
				}
			}

			// If the editor becomes sticky, increment the sticky index and adjust
			// the targetIndex to be at the end of sticky editors unless already.
			if (makeSticky) {
				this.sticky++;

				if (!this.isSticky(targetIndex)) {
					targetIndex = this.sticky;
				}
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
			const event: IGroupEditorOpenEvent = {
				kind: GroupModelChangeKind.EDITOR_OPEN,
				editor: newEditor,
				editorIndex: targetIndex
			};
			this._onDidModelChange.fire(event);

			// Handle active
			if (makeActive) {
				this.doSetActive(newEditor, targetIndex);
			}

			return {
				editor: newEditor,
				isNew: true
			};
		}

		// Existing editor
		else {
			const [existingEditor, existingEditorIndex] = existingEditorAndIndex;

			// Pin it
			if (makePinned) {
				this.doPin(existingEditor, existingEditorIndex);
			}

			// Activate it
			if (makeActive) {
				this.doSetActive(existingEditor, existingEditorIndex);
			}

			// Respect index
			if (options && typeof options.index === 'number') {
				this.moveEditor(existingEditor, options.index);
			}

			// Stick it (intentionally after the moveEditor call in case
			// the editor was already moved into the sticky range)
			if (makeSticky) {
				this.doStick(existingEditor, this.indexOf(existingEditor));
			}

			return {
				editor: existingEditor,
				isNew: false
			};
		}
	}

	private registerEditorListeners(editor: EditorInput): void {
		const listeners = new DisposableStore();

		// Re-emit disposal of editor input as our own event
		listeners.add(Event.once(editor.onWillDispose)(() => {
			const editorIndex = this.editors.indexOf(editor);
			if (editorIndex >= 0) {
				const event: IGroupEditorChangeEvent = {
					kind: GroupModelChangeKind.EDITOR_WILL_DISPOSE,
					editor,
					editorIndex
				};
				this._onDidModelChange.fire(event);
			}
		}));

		// Re-Emit dirty state changes
		listeners.add(editor.onDidChangeDirty(() => {
			const event: IGroupEditorChangeEvent = {
				kind: GroupModelChangeKind.EDITOR_DIRTY,
				editor,
				editorIndex: this.editors.indexOf(editor)
			};
			this._onDidModelChange.fire(event);
		}));

		// Re-Emit label changes
		listeners.add(editor.onDidChangeLabel(() => {
			const event: IGroupEditorChangeEvent = {
				kind: GroupModelChangeKind.EDITOR_LABEL,
				editor,
				editorIndex: this.editors.indexOf(editor)
			};
			this._onDidModelChange.fire(event);
		}));

		// Re-Emit capability changes
		listeners.add(editor.onDidChangeCapabilities(() => {
			const event: IGroupEditorChangeEvent = {
				kind: GroupModelChangeKind.EDITOR_CAPABILITIES,
				editor,
				editorIndex: this.editors.indexOf(editor)
			};
			this._onDidModelChange.fire(event);
		}));

		// Clean up dispose listeners once the editor gets closed
		listeners.add(this.onDidModelChange(event => {
			if (event.kind === GroupModelChangeKind.EDITOR_CLOSE && event.editor?.matches(editor)) {
				dispose(listeners);
			}
		}));
	}

	private replaceEditor(toReplace: EditorInput, replaceWith: EditorInput, replaceIndex: number, openNext = true): void {
		const closeResult = this.doCloseEditor(toReplace, EditorCloseContext.REPLACE, openNext); // optimization to prevent multiple setActive() in one call

		// We want to first add the new editor into our model before emitting the close event because
		// firing the close event can trigger a dispose on the same editor that is now being added.
		// This can lead into opening a disposed editor which is not what we want.
		this.splice(replaceIndex, false, replaceWith);

		if (closeResult) {
			const event: IGroupEditorCloseEvent = {
				kind: GroupModelChangeKind.EDITOR_CLOSE,
				...closeResult
			};
			this._onDidModelChange.fire(event);
		}
	}

	closeEditor(candidate: EditorInput, context = EditorCloseContext.UNKNOWN, openNext = true): IEditorCloseResult | undefined {
		const closeResult = this.doCloseEditor(candidate, context, openNext);

		if (closeResult) {
			const event: IGroupEditorCloseEvent = {
				kind: GroupModelChangeKind.EDITOR_CLOSE,
				...closeResult
			};
			this._onDidModelChange.fire(event);

			return closeResult;
		}

		return undefined;
	}

	private doCloseEditor(candidate: EditorInput, context: EditorCloseContext, openNext: boolean): IEditorCloseResult | undefined {
		const index = this.indexOf(candidate);
		if (index === -1) {
			return undefined; // not found
		}

		const editor = this.editors[index];
		const sticky = this.isSticky(index);

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

				this.doSetActive(newActive, this.editors.indexOf(newActive));
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
		return { editor, sticky, editorIndex: index, context };
	}

	moveEditor(candidate: EditorInput, toIndex: number): EditorInput | undefined {

		// Ensure toIndex is in bounds of our model
		if (toIndex >= this.editors.length) {
			toIndex = this.editors.length - 1;
		} else if (toIndex < 0) {
			toIndex = 0;
		}

		const index = this.indexOf(candidate);
		if (index < 0 || toIndex === index) {
			return;
		}

		const editor = this.editors[index];
		const sticky = this.sticky;

		// Adjust sticky index: editor moved out of sticky state into unsticky state
		if (this.isSticky(index) && toIndex > this.sticky) {
			this.sticky--;
		}

		// ...or editor moved into sticky state from unsticky state
		else if (!this.isSticky(index) && toIndex <= this.sticky) {
			this.sticky++;
		}

		// Move
		this.editors.splice(index, 1);
		this.editors.splice(toIndex, 0, editor);

		// Move Event
		const event: IGroupEditorMoveEvent = {
			kind: GroupModelChangeKind.EDITOR_MOVE,
			editor,
			oldEditorIndex: index,
			editorIndex: toIndex
		};
		this._onDidModelChange.fire(event);

		// Sticky Event (if sticky changed as part of the move)
		if (sticky !== this.sticky) {
			const event: IGroupEditorChangeEvent = {
				kind: GroupModelChangeKind.EDITOR_STICKY,
				editor,
				editorIndex: toIndex
			};
			this._onDidModelChange.fire(event);
		}

		return editor;
	}

	setActive(candidate: EditorInput | undefined): EditorInput | undefined {
		let result: EditorInput | undefined = undefined;

		if (!candidate) {
			this.setGroupActive();
		} else {
			result = this.setEditorActive(candidate);
		}

		return result;
	}

	private setGroupActive(): void {
		// We do not really keep the `active` state in our model because
		// it has no special meaning to us here. But for consistency
		// we emit a `onDidModelChange` event so that components can
		// react.
		this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_ACTIVE });
	}

	private setEditorActive(candidate: EditorInput): EditorInput | undefined {
		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doSetActive(editor, editorIndex);

		return editor;
	}

	private doSetActive(editor: EditorInput, editorIndex: number): void {
		if (this.matches(this.active, editor)) {
			return; // already active
		}

		this.active = editor;

		// Bring to front in MRU list
		const mruIndex = this.indexOf(editor, this.mru);
		this.mru.splice(mruIndex, 1);
		this.mru.unshift(editor);

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_ACTIVE,
			editor,
			editorIndex
		};
		this._onDidModelChange.fire(event);
	}

	setIndex(index: number) {
		// We do not really keep the `index` in our model because
		// it has no special meaning to us here. But for consistency
		// we emit a `onDidModelChange` event so that components can
		// react.
		this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_INDEX });
	}

	pin(candidate: EditorInput): EditorInput | undefined {
		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doPin(editor, editorIndex);

		return editor;
	}

	private doPin(editor: EditorInput, editorIndex: number): void {
		if (this.isPinned(editor)) {
			return; // can only pin a preview editor
		}

		// Convert the preview editor to be a pinned editor
		this.preview = null;

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_PIN,
			editor,
			editorIndex
		};
		this._onDidModelChange.fire(event);
	}

	unpin(candidate: EditorInput): EditorInput | undefined {
		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doUnpin(editor, editorIndex);

		return editor;
	}

	private doUnpin(editor: EditorInput, editorIndex: number): void {
		if (!this.isPinned(editor)) {
			return; // can only unpin a pinned editor
		}

		// Set new
		const oldPreview = this.preview;
		this.preview = editor;

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_PIN,
			editor,
			editorIndex
		};
		this._onDidModelChange.fire(event);

		// Close old preview editor if any
		if (oldPreview) {
			this.closeEditor(oldPreview, EditorCloseContext.UNPIN);
		}
	}

	isPinned(editorOrIndex: EditorInput | number): boolean {
		let editor: EditorInput;
		if (typeof editorOrIndex === 'number') {
			editor = this.editors[editorOrIndex];
		} else {
			editor = editorOrIndex;
		}

		return !this.matches(this.preview, editor);
	}

	stick(candidate: EditorInput): EditorInput | undefined {
		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doStick(editor, editorIndex);

		return editor;
	}

	private doStick(editor: EditorInput, editorIndex: number): void {
		if (this.isSticky(editorIndex)) {
			return; // can only stick a non-sticky editor
		}

		// Pin editor
		this.pin(editor);

		// Move editor to be the last sticky editor
		const newEditorIndex = this.sticky + 1;
		this.moveEditor(editor, newEditorIndex);

		// Adjust sticky index
		this.sticky++;

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_STICKY,
			editor,
			editorIndex: newEditorIndex
		};
		this._onDidModelChange.fire(event);
	}

	unstick(candidate: EditorInput): EditorInput | undefined {
		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doUnstick(editor, editorIndex);

		return editor;
	}

	private doUnstick(editor: EditorInput, editorIndex: number): void {
		if (!this.isSticky(editorIndex)) {
			return; // can only unstick a sticky editor
		}

		// Move editor to be the first non-sticky editor
		const newEditorIndex = this.sticky;
		this.moveEditor(editor, newEditorIndex);

		// Adjust sticky index
		this.sticky--;

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_STICKY,
			editor,
			editorIndex: newEditorIndex
		};
		this._onDidModelChange.fire(event);
	}

	isSticky(candidateOrIndex: EditorInput | number): boolean {
		if (this.sticky < 0) {
			return false; // no sticky editor
		}

		let index: number;
		if (typeof candidateOrIndex === 'number') {
			index = candidateOrIndex;
		} else {
			index = this.indexOf(candidateOrIndex);
		}

		if (index < 0) {
			return false;
		}

		return index <= this.sticky;
	}

	private splice(index: number, del: boolean, editor?: EditorInput): void {
		const editorToDeleteOrReplace = this.editors[index];

		// Perform on sticky index
		if (del && this.isSticky(index)) {
			this.sticky--;
		}

		// Perform on editors array
		if (editor) {
			this.editors.splice(index, del ? 1 : 0, editor);
		} else {
			this.editors.splice(index, del ? 1 : 0);
		}

		// Perform on MRU
		{
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
	}

	indexOf(candidate: EditorInput | IUntypedEditorInput | null, editors = this.editors, options?: IMatchEditorOptions): number {
		let index = -1;
		if (!candidate) {
			return index;
		}

		for (let i = 0; i < editors.length; i++) {
			const editor = editors[i];

			if (this.matches(editor, candidate, options)) {
				// If we are to support side by side matching, it is possible that
				// a better direct match is found later. As such, we continue finding
				// a matching editor and prefer that match over the side by side one.
				if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
					index = i;
				} else {
					index = i;
					break;
				}
			}
		}

		return index;
	}

	findEditor(candidate: EditorInput | null, options?: IMatchEditorOptions): [EditorInput, number /* index */] | undefined {
		const index = this.indexOf(candidate, this.editors, options);
		if (index === -1) {
			return undefined;
		}

		return [this.editors[index], index];
	}

	isFirst(candidate: EditorInput | null): boolean {
		return this.matches(this.editors[0], candidate);
	}

	isLast(candidate: EditorInput | null): boolean {
		return this.matches(this.editors[this.editors.length - 1], candidate);
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		return this.indexOf(candidate, this.editors, options) !== -1;
	}

	private matches(editor: EditorInput | null, candidate: EditorInput | IUntypedEditorInput | null, options?: IMatchEditorOptions): boolean {
		if (!editor || !candidate) {
			return false;
		}

		if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
			switch (options.supportSideBySide) {
				case SideBySideEditor.ANY:
					if (this.matches(editor.primary, candidate, options) || this.matches(editor.secondary, candidate, options)) {
						return true;
					}
					break;
				case SideBySideEditor.BOTH:
					if (this.matches(editor.primary, candidate, options) && this.matches(editor.secondary, candidate, options)) {
						return true;
					}
					break;
			}
		}

		const strictEquals = editor === candidate;

		if (options?.strictEquals) {
			return strictEquals;
		}

		return strictEquals || editor.matches(candidate);
	}

	get isLocked(): boolean {
		return this.locked;
	}

	lock(locked: boolean): void {
		if (this.isLocked !== locked) {
			this.locked = locked;

			this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LOCKED });
		}
	}

	clone(): EditorGroupModel {
		const clone = this.instantiationService.createInstance(EditorGroupModel, undefined);

		// Copy over group properties
		clone.editors = this.editors.slice(0);
		clone.mru = this.mru.slice(0);
		clone.preview = this.preview;
		clone.active = this.active;
		clone.sticky = this.sticky;

		// Ensure to register listeners for each editor
		for (const editor of clone.editors) {
			clone.registerEditorListeners(editor);
		}

		return clone;
	}

	serialize(): ISerializedEditorGroupModel {
		const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);

		// Serialize all editor inputs so that we can store them.
		// Editors that cannot be serialized need to be ignored
		// from mru, active, preview and sticky if any.
		const serializableEditors: EditorInput[] = [];
		const serializedEditors: ISerializedEditorInput[] = [];
		let serializablePreviewIndex: number | undefined;
		let serializableSticky = this.sticky;

		for (let i = 0; i < this.editors.length; i++) {
			const editor = this.editors[i];
			let canSerializeEditor = false;

			const editorSerializer = registry.getEditorSerializer(editor);
			if (editorSerializer) {
				const value = editorSerializer.serialize(editor);

				// Editor can be serialized
				if (typeof value === 'string') {
					canSerializeEditor = true;

					serializedEditors.push({ id: editor.typeId, value });
					serializableEditors.push(editor);

					if (this.preview === editor) {
						serializablePreviewIndex = serializableEditors.length - 1;
					}
				}

				// Editor cannot be serialized
				else {
					canSerializeEditor = false;
				}
			}

			// Adjust index of sticky editors if the editor cannot be serialized and is pinned
			if (!canSerializeEditor && this.isSticky(i)) {
				serializableSticky--;
			}
		}

		const serializableMru = this.mru.map(editor => this.indexOf(editor, serializableEditors)).filter(i => i >= 0);

		return {
			id: this.id,
			locked: this.locked ? true : undefined,
			editors: serializedEditors,
			mru: serializableMru,
			preview: serializablePreviewIndex,
			sticky: serializableSticky >= 0 ? serializableSticky : undefined
		};
	}

	private deserialize(data: ISerializedEditorGroupModel): number {
		const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);

		if (typeof data.id === 'number') {
			this._id = data.id;

			EditorGroupModel.IDS = Math.max(data.id + 1, EditorGroupModel.IDS); // make sure our ID generator is always larger
		} else {
			this._id = EditorGroupModel.IDS++; // backwards compatibility
		}

		if (data.locked) {
			this.locked = true;
		}

		this.editors = coalesce(data.editors.map((e, index) => {
			let editor: EditorInput | undefined = undefined;

			const editorSerializer = registry.getEditorSerializer(e.id);
			if (editorSerializer) {
				const deserializedEditor = editorSerializer.deserialize(this.instantiationService, e.value);
				if (deserializedEditor instanceof EditorInput) {
					editor = deserializedEditor;
					this.registerEditorListeners(editor);
				}
			}

			if (!editor && typeof data.sticky === 'number' && index <= data.sticky) {
				data.sticky--; // if editor cannot be deserialized but was sticky, we need to decrease sticky index
			}

			return editor;
		}));

		this.mru = coalesce(data.mru.map(i => this.editors[i]));

		this.active = this.mru[0];

		if (typeof data.preview === 'number') {
			this.preview = this.editors[data.preview];
		}

		if (typeof data.sticky === 'number') {
			this.sticky = data.sticky;
		}

		return this._id;
	}
}
