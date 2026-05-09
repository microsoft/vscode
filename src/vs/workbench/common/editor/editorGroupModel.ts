/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../base/common/event.js';
import { IEditorFactoryRegistry, GroupIdentifier, EditorsOrder, EditorExtensions, IUntypedEditorInput, SideBySideEditor, EditorCloseContext, IMatchEditorOptions, GroupModelChangeKind } from '../editor.js';
import { EditorInput } from './editorInput.js';
import { SideBySideEditorInput } from './sideBySideEditorInput.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { dispose, Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { coalesce } from '../../../base/common/arrays.js';
import { generateUuid } from '../../../base/common/uuid.js';

export interface IEditorTabGroup {
	readonly id: string;
	name: string;
	color: string;
	collapsed: boolean;
	startIndex: number;
	count: number;
}

export interface ISerializedEditorTabGroup {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	readonly collapsed: boolean;
	readonly startIndex: number;
	readonly count: number;
}

const EditorOpenPositioning = {
	LEFT: 'left',
	RIGHT: 'right',
	FIRST: 'first',
	LAST: 'last'
};

export interface IEditorOpenOptions {
	readonly pinned?: boolean;
	readonly sticky?: boolean;
	readonly transient?: boolean;
	active?: boolean;
	readonly inactiveSelection?: EditorInput[];
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
	readonly tabGroups?: ISerializedEditorTabGroup[];
}

export function isSerializedEditorGroupModel(group?: unknown): group is ISerializedEditorGroupModel {
	const candidate = group as ISerializedEditorGroupModel | undefined;

	return !!(candidate && typeof candidate === 'object' && Array.isArray(candidate.editors) && Array.isArray(candidate.mru));
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

export interface IReadonlyEditorGroupModel {

	readonly onDidModelChange: Event<IGroupModelChangeEvent>;

	readonly id: GroupIdentifier;
	readonly count: number;
	readonly stickyCount: number;
	readonly isLocked: boolean;
	readonly activeEditor: EditorInput | null;
	readonly previewEditor: EditorInput | null;
	readonly selectedEditors: EditorInput[];
	readonly tabGroups: readonly IEditorTabGroup[];

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[];
	getEditorByIndex(index: number): EditorInput | undefined;
	indexOf(editor: EditorInput | IUntypedEditorInput | null, editors?: EditorInput[], options?: IMatchEditorOptions): number;
	isActive(editor: EditorInput | IUntypedEditorInput): boolean;
	isPinned(editorOrIndex: EditorInput | number): boolean;
	isSticky(editorOrIndex: EditorInput | number): boolean;
	isSelected(editorOrIndex: EditorInput | number): boolean;
	isTransient(editorOrIndex: EditorInput | number): boolean;
	isFirst(editor: EditorInput, editors?: EditorInput[]): boolean;
	isLast(editor: EditorInput, editors?: EditorInput[]): boolean;
	findEditor(editor: EditorInput | null, options?: IMatchEditorOptions): [EditorInput, number /* index */] | undefined;
	contains(editor: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean;
	getTabGroupForEditor(editorOrIndex: EditorInput | number): IEditorTabGroup | undefined;
}

export interface ITabGroupMutations {
	createTabGroup(editors: EditorInput[], name?: string, color?: string): IEditorTabGroup | undefined;
	collapseTabGroup(groupId: string): void;
	expandTabGroup(groupId: string): void;
	addToTabGroup(groupId: string, editor: EditorInput): void;
	includeInTabGroup(groupId: string, editor: EditorInput): void;
	removeFromTabGroup(groupId: string, editor: EditorInput): void;
	renameTabGroup(groupId: string, name: string): void;
	recolorTabGroup(groupId: string, color: string): void;
	dissolveTabGroup(groupId: string): void;
	moveTabGroup(groupId: string, toIndex: number): void;
}

interface IEditorGroupModel extends IReadonlyEditorGroupModel, ITabGroupMutations {
	openEditor(editor: EditorInput, options?: IEditorOpenOptions): IEditorOpenResult;
	closeEditor(editor: EditorInput, context?: EditorCloseContext, openNext?: boolean): IEditorCloseResult | undefined;
	moveEditor(editor: EditorInput, toIndex: number): EditorInput | undefined;
	setActive(editor: EditorInput | undefined): EditorInput | undefined;
	setSelection(activeSelectedEditor: EditorInput, inactiveSelectedEditors: EditorInput[]): void;
}

export class EditorGroupModel extends Disposable implements IEditorGroupModel {

	private static IDS = 0;

	//#region events

	private readonly _onDidModelChange = this._register(new Emitter<IGroupModelChangeEvent>({ leakWarningThreshold: 500, leakWarningName: 'EditorGroupModel._onDidModelChange' /* increased for users with hundreds of inputs opened */ }));
	readonly onDidModelChange = this._onDidModelChange.event;

	//#endregion

	private _id: GroupIdentifier;
	get id(): GroupIdentifier { return this._id; }

	private editors: EditorInput[] = [];
	private mru: EditorInput[] = [];

	private readonly editorListeners = new Set<DisposableStore>();

	private locked = false;

	private selection: EditorInput[] = [];					// editors in selected state, first one is active

	private get active(): EditorInput | null {
		return this.selection[0] ?? null;
	}

	private preview: EditorInput | null = null; 			// editor in preview state
	private sticky = -1;									// index of first editor in sticky state
	private readonly transient = new Set<EditorInput>(); 	// editors in transient state
	private _tabGroups: IEditorTabGroup[] = [];				// tab groups (sorted by startIndex, non-overlapping)

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

	isActive(candidate: EditorInput | IUntypedEditorInput): boolean {
		return this.matches(this.active, candidate);
	}

	get previewEditor(): EditorInput | null {
		return this.preview;
	}

	openEditor(candidate: EditorInput, options?: IEditorOpenOptions): IEditorOpenResult {
		const makeSticky = options?.sticky || (typeof options?.index === 'number' && this.isSticky(options.index));
		const makePinned = options?.pinned || options?.sticky;
		const makeTransient = !!options?.transient;
		const makeActive = options?.active || !this.activeEditor || (!makePinned && this.preview === this.activeEditor);

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

			// Handle transient
			if (makeTransient) {
				this.doSetTransient(newEditor, targetIndex, true);
			}

			// Handle preview
			if (!makePinned) {

				// Replace existing preview with this editor if we have a preview
				if (this.preview) {
					const indexOfPreview = this.indexOf(this.preview);
					if (targetIndex > indexOfPreview) {
						targetIndex--; // accommodate for the fact that the preview editor closes
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

			// Handle active editor / selected editors
			this.setSelection(makeActive ? newEditor : this.activeEditor, options?.inactiveSelection ?? []);

			return {
				editor: newEditor,
				isNew: true
			};
		}

		// Existing editor
		else {
			const [existingEditor, existingEditorIndex] = existingEditorAndIndex;

			// Update transient (existing editors do not turn transient if they were not before)
			this.doSetTransient(existingEditor, existingEditorIndex, makeTransient === false ? false : this.isTransient(existingEditor));

			// Pin it
			if (makePinned) {
				this.doPin(existingEditor, existingEditorIndex);
			}

			// Handle active editor / selected editors
			this.setSelection(makeActive ? existingEditor : this.activeEditor, options?.inactiveSelection ?? []);

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
		this.editorListeners.add(listeners);

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
				this.editorListeners.delete(listeners);
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

		// Active editor closed
		const isActiveEditor = this.active === editor;
		if (openNext && isActiveEditor) {

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

				// Select editor as active
				const newInactiveSelectedEditors = this.selection.filter(selected => selected !== editor && selected !== newActive);
				this.doSetSelection(newActive, this.editors.indexOf(newActive), newInactiveSelectedEditors);
			}

			// Last editor closed: clear selection
			else {
				this.doSetSelection(null, undefined, []);
			}
		}

		// Inactive editor closed
		else if (!isActiveEditor) {

			// Remove editor from inactive selection
			if (this.doIsSelected(editor)) {
				const newInactiveSelectedEditors = this.selection.filter(selected => selected !== editor && selected !== this.activeEditor);
				this.doSetSelection(this.activeEditor, this.indexOf(this.activeEditor), newInactiveSelectedEditors);
			}
		}

		// Preview Editor closed
		if (this.preview === editor) {
			this.preview = null;
		}

		// Remove from transient
		this.transient.delete(editor);

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

		// Adjust tab groups for the move
		this.adjustTabGroupsForMove(index, toIndex);

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
		let result: EditorInput | undefined;

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

		this.doSetSelection(editor, editorIndex, []);

		return editor;
	}

	get selectedEditors(): EditorInput[] {
		return this.editors.filter(editor => this.doIsSelected(editor)); // return in sequential order
	}

	isSelected(editorCandidateOrIndex: EditorInput | number): boolean {
		let editor: EditorInput | undefined;
		if (typeof editorCandidateOrIndex === 'number') {
			editor = this.editors[editorCandidateOrIndex];
		} else {
			editor = this.findEditor(editorCandidateOrIndex)?.[0];
		}

		return !!editor && this.doIsSelected(editor);
	}

	private doIsSelected(editor: EditorInput): boolean {
		return this.selection.includes(editor);
	}

	setSelection(activeSelectedEditorCandidate: EditorInput, inactiveSelectedEditorCandidates: EditorInput[]): void {
		const res = this.findEditor(activeSelectedEditorCandidate);
		if (!res) {
			return; // not found
		}

		const [activeSelectedEditor, activeSelectedEditorIndex] = res;

		const inactiveSelectedEditors = new Set<EditorInput>();
		for (const inactiveSelectedEditorCandidate of inactiveSelectedEditorCandidates) {
			const res = this.findEditor(inactiveSelectedEditorCandidate);
			if (!res) {
				return; // not found
			}

			const [inactiveSelectedEditor] = res;
			if (inactiveSelectedEditor === activeSelectedEditor) {
				continue; // already selected
			}

			inactiveSelectedEditors.add(inactiveSelectedEditor);
		}

		this.doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, Array.from(inactiveSelectedEditors));
	}

	private doSetSelection(activeSelectedEditor: EditorInput | null, activeSelectedEditorIndex: number | undefined, inactiveSelectedEditors: EditorInput[]): void {
		const previousActiveEditor = this.activeEditor;
		const previousSelection = this.selection;

		let newSelection: EditorInput[];
		if (activeSelectedEditor) {
			newSelection = [activeSelectedEditor, ...inactiveSelectedEditors];
		} else {
			newSelection = [];
		}

		// Update selection
		this.selection = newSelection;

		// Update active editor if it has changed
		const activeEditorChanged = activeSelectedEditor && typeof activeSelectedEditorIndex === 'number' && previousActiveEditor !== activeSelectedEditor;
		if (activeEditorChanged) {

			// Bring to front in MRU list
			const mruIndex = this.indexOf(activeSelectedEditor, this.mru);
			this.mru.splice(mruIndex, 1);
			this.mru.unshift(activeSelectedEditor);

			// Event
			const event: IGroupEditorChangeEvent = {
				kind: GroupModelChangeKind.EDITOR_ACTIVE,
				editor: activeSelectedEditor,
				editorIndex: activeSelectedEditorIndex
			};
			this._onDidModelChange.fire(event);
		}

		// Fire event if the selection has changed
		if (
			activeEditorChanged ||
			previousSelection.length !== newSelection.length ||
			previousSelection.some(editor => !newSelection.includes(editor))
		) {
			const event: IGroupModelChangeEvent = {
				kind: GroupModelChangeKind.EDITORS_SELECTION
			};
			this._onDidModelChange.fire(event);
		}
	}

	setIndex(index: number) {
		// We do not really keep the `index` in our model because
		// it has no special meaning to us here. But for consistency
		// we emit a `onDidModelChange` event so that components can
		// react.
		this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_INDEX });
	}

	setLabel(label: string) {
		// We do not really keep the `label` in our model because
		// it has no special meaning to us here. But for consistency
		// we emit a `onDidModelChange` event so that components can
		// react.
		this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LABEL });
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

		// Clear Transient
		this.setTransient(editor, false);

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

	isPinned(editorCandidateOrIndex: EditorInput | number): boolean {
		let editor: EditorInput;
		if (typeof editorCandidateOrIndex === 'number') {
			editor = this.editors[editorCandidateOrIndex];
		} else {
			editor = editorCandidateOrIndex;
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

	setTransient(candidate: EditorInput, transient: boolean): EditorInput | undefined {
		if (!transient && this.transient.size === 0) {
			return; // no transient editor
		}

		const res = this.findEditor(candidate);
		if (!res) {
			return; // not found
		}

		const [editor, editorIndex] = res;

		this.doSetTransient(editor, editorIndex, transient);

		return editor;
	}

	private doSetTransient(editor: EditorInput, editorIndex: number, transient: boolean): void {
		if (transient) {
			if (this.transient.has(editor)) {
				return;
			}

			this.transient.add(editor);
		} else {
			if (!this.transient.has(editor)) {
				return;
			}

			this.transient.delete(editor);
		}

		// Event
		const event: IGroupEditorChangeEvent = {
			kind: GroupModelChangeKind.EDITOR_TRANSIENT,
			editor,
			editorIndex
		};
		this._onDidModelChange.fire(event);
	}

	isTransient(editorCandidateOrIndex: EditorInput | number): boolean {
		if (this.transient.size === 0) {
			return false; // no transient editor
		}

		let editor: EditorInput | undefined;
		if (typeof editorCandidateOrIndex === 'number') {
			editor = this.editors[editorCandidateOrIndex];
		} else {
			editor = this.findEditor(editorCandidateOrIndex)?.[0];
		}

		return !!editor && this.transient.has(editor);
	}

	private splice(index: number, del: boolean, editor?: EditorInput): void {
		const editorToDeleteOrReplace = this.editors[index];

		// Perform on sticky index
		if (del && this.isSticky(index)) {
			this.sticky--;
		}

		// Adjust tab groups for insertions and removals
		if (del && !editor) {
			this.adjustTabGroupsForRemove(index);
		} else if (!del && editor) {
			this.adjustTabGroupsForInsert(index);
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

	isFirst(candidate: EditorInput | null, editors = this.editors): boolean {
		return this.matches(editors[0], candidate);
	}

	isLast(candidate: EditorInput | null, editors = this.editors): boolean {
		return this.matches(editors[editors.length - 1], candidate);
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		return this.indexOf(candidate, this.editors, options) !== -1;
	}

	private matches(editor: EditorInput | null | undefined, candidate: EditorInput | IUntypedEditorInput | null, options?: IMatchEditorOptions): boolean {
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

	//#region Tab Groups

	get tabGroups(): readonly IEditorTabGroup[] {
		return this._tabGroups;
	}

	getTabGroupForEditor(editorOrIndex: EditorInput | number): IEditorTabGroup | undefined {
		const index = typeof editorOrIndex === 'number' ? editorOrIndex : this.indexOf(editorOrIndex);
		if (index < 0) {
			return undefined;
		}

		return this._tabGroups.find(g => index >= g.startIndex && index < g.startIndex + g.count);
	}

	createTabGroup(editors: EditorInput[], name?: string, color?: string): IEditorTabGroup | undefined {
		// Build a list of (editor, index) pairs, filter, and sort by index
		const editorEntries = editors
			.map(e => ({ editor: e, index: this.indexOf(e) }))
			.filter(entry => entry.index >= 0 && !this.isSticky(entry.index))
			.sort((a, b) => a.index - b.index);

		if (editorEntries.length === 0) {
			return undefined;
		}

		// Remove editors from any existing groups to prevent overlap
		for (const entry of editorEntries) {
			this.removeFromTabGroupByIndex(entry.index);
		}
		// Re-derive indices after potential group removals
		for (const entry of editorEntries) {
			entry.index = this.indexOf(entry.editor);
		}
		editorEntries.sort((a, b) => a.index - b.index);

		// Move editors to be contiguous starting at the first editor's position
		const targetStart = editorEntries[0].index;
		for (let i = 1; i < editorEntries.length; i++) {
			const entry = editorEntries[i];
			if (entry.index !== targetStart + i) {
				this.moveEditor(entry.editor, targetStart + i);
				// Re-derive indices after move
				for (let j = i + 1; j < editorEntries.length; j++) {
					editorEntries[j].index = this.indexOf(editorEntries[j].editor);
				}
			}
		}

		const indices = editorEntries.map(e => e.index);

		const tabGroupColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'gray'];
		const randomColor = tabGroupColors[Math.floor(Math.random() * tabGroupColors.length)];

		const tabGroup: IEditorTabGroup = {
			id: generateUuid(),
			name: name ?? '',
			color: color ?? randomColor,
			collapsed: false,
			startIndex: targetStart,
			count: indices.length
		};

		this._tabGroups.push(tabGroup);
		this._tabGroups.sort((a, b) => a.startIndex - b.startIndex);

		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CREATED });

		return tabGroup;
	}

	includeInTabGroup(groupId: string, editor: EditorInput): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (!group) {
			return;
		}

		const editorIndex = this.indexOf(editor);
		if (editorIndex < 0 || this.isSticky(editorIndex)) {
			return;
		}

		// Already in this group
		if (editorIndex >= group.startIndex && editorIndex < group.startIndex + group.count) {
			return;
		}

		// Only allow absorption of adjacent editors to maintain contiguity
		if (editorIndex !== group.startIndex + group.count && editorIndex !== group.startIndex - 1) {
			return;
		}

		// Remove from any other group
		this.removeFromTabGroupByIndex(editorIndex);

		// Expand the group to include the adjacent editor
		if (editorIndex === group.startIndex + group.count) {
			group.count++;
		} else if (editorIndex === group.startIndex - 1) {
			group.startIndex--;
			group.count++;
		}

		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_EDITOR_ADDED });
	}

	addToTabGroup(groupId: string, editor: EditorInput): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (!group) {
			return;
		}

		const editorIndex = this.indexOf(editor);
		if (editorIndex < 0 || this.isSticky(editorIndex)) {
			return;
		}

		// Already in this group
		if (editorIndex >= group.startIndex && editorIndex < group.startIndex + group.count) {
			return;
		}

		// Remove from any other group first (adjusts source group count)
		this.removeFromTabGroupByIndex(editorIndex);

		// After removing from a group, recalculate the editor's current index
		// and the target group's position (removeFromTabGroupByIndex only adjusts
		// the source group, not other groups or the editors array)
		const currentIndex = this.indexOf(editor);

		// Compute target: place at end of target group
		// After the source group removal, if the editor was before the target
		// group, the target group's startIndex hasn't shifted (editors array unchanged)
		const insertAt = group.startIndex + group.count;

		// Physically move the editor in the array
		this.editors.splice(currentIndex, 1);
		// After removal, adjust insert position
		const adjustedInsert = insertAt > currentIndex ? insertAt - 1 : insertAt;
		this.editors.splice(adjustedInsert, 0, editor);

		// Adjust all tab group indices for the move
		for (const other of this._tabGroups) {
			if (other.id === groupId) {
				continue;
			}
			// Editor was removed from currentIndex
			if (currentIndex < other.startIndex) {
				other.startIndex--;
			}
			// Editor was inserted at adjustedInsert
			if (adjustedInsert <= other.startIndex) {
				other.startIndex++;
			}
		}

		// Adjust target group for the removal effect on its own startIndex
		if (currentIndex < group.startIndex) {
			group.startIndex--;
		}

		// Add to the target group
		group.count++;

		// Fire move event so UI redraws tabs
		const moveEvent: IGroupEditorMoveEvent = {
			kind: GroupModelChangeKind.EDITOR_MOVE,
			editor,
			oldEditorIndex: currentIndex,
			editorIndex: this.indexOf(editor)
		};
		this._onDidModelChange.fire(moveEvent);

		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_EDITOR_ADDED });
	}

	removeFromTabGroup(groupId: string, editor: EditorInput): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (!group) {
			return;
		}

		const editorIndex = this.indexOf(editor);
		if (editorIndex < group.startIndex || editorIndex >= group.startIndex + group.count) {
			return;
		}

		if (group.count <= 1) {
			this._tabGroups = this._tabGroups.filter(g => g.id !== groupId);
			this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_REMOVED });
			return;
		}

		// Move the editor to just after the group to maintain contiguity
		const groupEnd = group.startIndex + group.count - 1;
		if (editorIndex < groupEnd) {
			// Move to the end of the group first, then shrink
			this.editors.splice(editorIndex, 1);
			this.editors.splice(groupEnd, 0, editor);
			// Adjust other groups between editorIndex and groupEnd
			for (const other of this._tabGroups) {
				if (other.id === groupId) {
					continue;
				}
				if (other.startIndex > editorIndex && other.startIndex <= groupEnd) {
					other.startIndex--;
				}
			}

			// Emit EDITOR_MOVE so other listeners (Open Editors, extension host) stay in sync
			const moveEvent: IGroupEditorMoveEvent = {
				kind: GroupModelChangeKind.EDITOR_MOVE,
				editor,
				oldEditorIndex: editorIndex,
				editorIndex: groupEnd
			};
			this._onDidModelChange.fire(moveEvent);
		}

		// Shrink the group from the end
		group.count--;

		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_EDITOR_REMOVED });
	}

	dissolveTabGroup(groupId: string): void {
		this._tabGroups = this._tabGroups.filter(g => g.id !== groupId);
		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_REMOVED });
	}

	collapseTabGroup(groupId: string): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (group && !group.collapsed) {
			group.collapsed = true;
			this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CHANGED });
		}
	}

	expandTabGroup(groupId: string): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (group && group.collapsed) {
			group.collapsed = false;
			this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CHANGED });
		}
	}

	renameTabGroup(groupId: string, name: string): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (group) {
			group.name = name;
			this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CHANGED });
		}
	}

	recolorTabGroup(groupId: string, color: string): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (group) {
			group.color = color;
			this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CHANGED });
		}
	}

	moveTabGroup(groupId: string, toIndex: number): void {
		const group = this._tabGroups.find(g => g.id === groupId);
		if (!group) {
			return;
		}

		const oldStart = group.startIndex;
		const count = group.count;

		// Clamp target index to valid range (after sticky tabs, within array)
		toIndex = Math.max(this.sticky + 1, Math.min(toIndex, this.editors.length));
		if (toIndex === oldStart) {
			return;
		}

		// Step 1: Snapshot each group's first editor before any mutation
		const groupFirstEditors = new Map<string, EditorInput>();
		for (const tg of this._tabGroups) {
			groupFirstEditors.set(tg.id, this.editors[tg.startIndex]);
		}

		// Step 2: Extract editors belonging to this group
		const groupEditors = this.editors.splice(oldStart, count);

		// Step 3: Compute insertion point (adjusted for removal)
		const insertAt = toIndex > oldStart ? toIndex - count : toIndex;

		// Step 4: Re-insert at the computed position
		this.editors.splice(insertAt, 0, ...groupEditors);

		// Step 5: Rebuild all startIndex values by finding each group's
		// first editor in the new array. Groups remain contiguous.
		for (const tg of this._tabGroups) {
			const firstEditor = groupFirstEditors.get(tg.id)!;
			tg.startIndex = this.editors.indexOf(firstEditor);
		}

		// Maintain sorted invariant
		this._tabGroups.sort((a, b) => a.startIndex - b.startIndex);

		// Emit EDITOR_MOVE events so other listeners stay in sync with the new order
		for (let i = 0; i < groupEditors.length; i++) {
			const moveEvent: IGroupEditorMoveEvent = {
				kind: GroupModelChangeKind.EDITOR_MOVE,
				editor: groupEditors[i],
				oldEditorIndex: oldStart + i,
				editorIndex: insertAt + i
			};
			this._onDidModelChange.fire(moveEvent);
		}

		this._onDidModelChange.fire({ kind: GroupModelChangeKind.TAB_GROUP_CHANGED });
	}

	private removeFromTabGroupByIndex(editorIndex: number): void {
		const group = this.getTabGroupForEditor(editorIndex);
		if (!group) {
			return;
		}

		group.count--;
		if (group.count <= 0) {
			this._tabGroups = this._tabGroups.filter(g => g.id !== group.id);
		} else if (editorIndex === group.startIndex) {
			group.startIndex++;
		}
	}

	/**
	 * Adjusts tab group indices when editors are inserted or removed.
	 * Call after editor list mutations.
	 */
	private adjustTabGroupsForInsert(insertIndex: number): void {
		for (const group of this._tabGroups) {
			if (insertIndex <= group.startIndex) {
				group.startIndex++;
			} else if (insertIndex > group.startIndex && insertIndex < group.startIndex + group.count) {
				group.count++;
			}
		}
	}

	private adjustTabGroupsForRemove(removeIndex: number): void {
		for (let i = this._tabGroups.length - 1; i >= 0; i--) {
			const group = this._tabGroups[i];
			if (removeIndex < group.startIndex) {
				group.startIndex--;
			} else if (removeIndex >= group.startIndex && removeIndex < group.startIndex + group.count) {
				group.count--;
				if (group.count <= 0) {
					this._tabGroups.splice(i, 1);
				}
			}
		}
	}

	private adjustTabGroupsForMove(fromIndex: number, toIndex: number): void {
		// Check if moving within the same group (membership preserved, no adjustment needed).
		// Both indices must be within the same group's range BEFORE any mutation.
		// Note: after splice, if fromIndex < toIndex, the effective insertion is at toIndex
		// which was the original position toIndex (since splice removes first, then inserts).
		// We check if both the source and destination are within the same group's boundaries.
		for (const group of this._tabGroups) {
			const end = group.startIndex + group.count;
			if (fromIndex >= group.startIndex && fromIndex < end &&
				toIndex >= group.startIndex && toIndex <= end) {
				// Moving within the same group: no boundary changes needed
				return;
			}
		}

		// Cross-group or ungrouped move: simulate as remove+insert
		this.adjustTabGroupsForRemove(fromIndex);
		this.adjustTabGroupsForInsert(toIndex);
	}

	//#endregion

	clone(): EditorGroupModel {
		const clone = this.instantiationService.createInstance(EditorGroupModel, undefined);

		// Copy over group properties
		clone.editors = this.editors.slice(0);
		clone.mru = this.mru.slice(0);
		clone.preview = this.preview;
		clone.selection = this.selection.slice(0);
		clone.sticky = this.sticky;
		clone._tabGroups = this._tabGroups.map(g => ({ ...g }));

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
				const value = editorSerializer.canSerialize(editor) ? editorSerializer.serialize(editor) : undefined;

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
			sticky: serializableSticky >= 0 ? serializableSticky : undefined,
			tabGroups: this._tabGroups.length > 0 ? this._tabGroups.map(g => ({
				id: g.id,
				name: g.name,
				color: g.color,
				collapsed: g.collapsed,
				startIndex: g.startIndex,
				count: g.count
			})) : undefined
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
			let editor: EditorInput | undefined;

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

		this.selection = this.mru.length > 0 ? [this.mru[0]] : [];

		if (typeof data.preview === 'number') {
			this.preview = this.editors[data.preview];
		}

		if (typeof data.sticky === 'number') {
			this.sticky = data.sticky;
		}

		if (data.tabGroups) {
			const restored = data.tabGroups
				.filter(g => g.startIndex >= 0 && g.count > 0 && g.startIndex + g.count <= this.editors.length)
				.map(g => ({
					id: g.id,
					name: g.name,
					color: g.color,
					collapsed: g.collapsed,
					startIndex: g.startIndex,
					count: g.count
				}));
			restored.sort((a, b) => a.startIndex - b.startIndex);

			// Drop overlapping groups (keep the first one encountered)
			const validated: typeof restored = [];
			let maxEnd = 0;
			for (const g of restored) {
				if (g.startIndex >= maxEnd) {
					validated.push(g);
					maxEnd = g.startIndex + g.count;
				}
			}
			this._tabGroups = validated;
		}

		return this._id;
	}

	override dispose(): void {
		dispose(Array.from(this.editorListeners));
		this.editorListeners.clear();

		this.transient.clear();

		super.dispose();
	}
}
