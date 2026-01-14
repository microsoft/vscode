/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUntypedEditorInput, IMatchEditorOptions, EditorsOrder, GroupIdentifier } from '../editor.js';
import { EditorInput } from './editorInput.js';
import { Emitter } from '../../../base/common/event.js';
import { IGroupModelChangeEvent, IReadonlyEditorGroupModel } from './editorGroupModel.js';
import { Disposable } from '../../../base/common/lifecycle.js';

abstract class FilteredEditorGroupModel extends Disposable implements IReadonlyEditorGroupModel {

	private readonly _onDidModelChange = this._register(new Emitter<IGroupModelChangeEvent>());
	readonly onDidModelChange = this._onDidModelChange.event;

	constructor(
		protected readonly model: IReadonlyEditorGroupModel
	) {
		super();

		this._register(this.model.onDidModelChange(e => {
			const candidateOrIndex = e.editorIndex ?? e.editor;
			if (candidateOrIndex !== undefined) {
				if (!this.filter(candidateOrIndex)) {
					return; // exclude events for excluded items
				}
			}
			this._onDidModelChange.fire(e);
		}));
	}

	get id(): GroupIdentifier { return this.model.id; }
	get isLocked(): boolean { return this.model.isLocked; }
	get stickyCount(): number { return this.model.stickyCount; }

	get activeEditor(): EditorInput | null { return this.model.activeEditor && this.filter(this.model.activeEditor) ? this.model.activeEditor : null; }
	get previewEditor(): EditorInput | null { return this.model.previewEditor && this.filter(this.model.previewEditor) ? this.model.previewEditor : null; }
	get selectedEditors(): EditorInput[] { return this.model.selectedEditors.filter(e => this.filter(e)); }

	isPinned(editorOrIndex: EditorInput | number): boolean { return this.model.isPinned(editorOrIndex); }
	isTransient(editorOrIndex: EditorInput | number): boolean { return this.model.isTransient(editorOrIndex); }
	isSticky(editorOrIndex: EditorInput | number): boolean { return this.model.isSticky(editorOrIndex); }
	isActive(editor: EditorInput | IUntypedEditorInput): boolean { return this.model.isActive(editor); }
	isSelected(editorOrIndex: EditorInput | number): boolean { return this.model.isSelected(editorOrIndex); }

	isFirst(editor: EditorInput): boolean {
		return this.model.isFirst(editor, this.getEditors(EditorsOrder.SEQUENTIAL));
	}

	isLast(editor: EditorInput): boolean {
		return this.model.isLast(editor, this.getEditors(EditorsOrder.SEQUENTIAL));
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		const editors = this.model.getEditors(order, options);
		return editors.filter(e => this.filter(e));
	}

	findEditor(candidate: EditorInput | null, options?: IMatchEditorOptions): [EditorInput, number] | undefined {
		const result = this.model.findEditor(candidate, options);
		if (!result) {
			return undefined;
		}
		return this.filter(result[1]) ? result : undefined;
	}

	abstract get count(): number;

	abstract getEditorByIndex(index: number): EditorInput | undefined;
	abstract indexOf(editor: EditorInput | IUntypedEditorInput | null, editors?: EditorInput[], options?: IMatchEditorOptions): number;
	abstract contains(editor: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean;

	protected abstract filter(editorOrIndex: EditorInput | number): boolean;
}

export class StickyEditorGroupModel extends FilteredEditorGroupModel {
	get count(): number { return this.model.stickyCount; }

	override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		if (options?.excludeSticky) {
			return [];
		}
		if (order === EditorsOrder.SEQUENTIAL) {
			return this.model.getEditors(EditorsOrder.SEQUENTIAL).slice(0, this.model.stickyCount);
		}
		return super.getEditors(order, options);
	}

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return true;
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index < this.count ? this.model.getEditorByIndex(index) : undefined;
	}

	indexOf(editor: EditorInput | IUntypedEditorInput | null, editors?: EditorInput[], options?: IMatchEditorOptions): number {
		const editorIndex = this.model.indexOf(editor, editors, options);
		if (editorIndex < 0 || editorIndex >= this.model.stickyCount) {
			return -1;
		}
		return editorIndex;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		const editorIndex = this.model.indexOf(candidate, undefined, options);
		return editorIndex >= 0 && editorIndex < this.model.stickyCount;
	}

	protected filter(candidateOrIndex: EditorInput | number): boolean {
		return this.model.isSticky(candidateOrIndex);
	}
}

export class UnstickyEditorGroupModel extends FilteredEditorGroupModel {
	get count(): number { return this.model.count - this.model.stickyCount; }
	override get stickyCount(): number { return 0; }

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return false;
	}

	override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		if (order === EditorsOrder.SEQUENTIAL) {
			return this.model.getEditors(EditorsOrder.SEQUENTIAL).slice(this.model.stickyCount);
		}
		return super.getEditors(order, options);
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index >= 0 ? this.model.getEditorByIndex(index + this.model.stickyCount) : undefined;
	}

	indexOf(editor: EditorInput | IUntypedEditorInput | null, editors?: EditorInput[], options?: IMatchEditorOptions): number {
		const editorIndex = this.model.indexOf(editor, editors, options);
		if (editorIndex < this.model.stickyCount || editorIndex >= this.model.count) {
			return -1;
		}
		return editorIndex - this.model.stickyCount;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		const editorIndex = this.model.indexOf(candidate, undefined, options);
		return editorIndex >= this.model.stickyCount && editorIndex < this.model.count;
	}

	protected filter(candidateOrIndex: EditorInput | number): boolean {
		return !this.model.isSticky(candidateOrIndex);
	}
}

/**
 * A filter function that determines if an editor belongs to a specific type group.
 */
export type EditorTypeGroupFilter = (editor: EditorInput) => boolean;

/**
 * A filtered editor group model that filters editors by their type group.
 * This model filters out sticky editors and only includes editors matching the provided type group filter.
 */
export class TypeFilteredEditorGroupModel extends Disposable implements IReadonlyEditorGroupModel {

	private readonly _onDidModelChange = this._register(new Emitter<IGroupModelChangeEvent>());
	readonly onDidModelChange = this._onDidModelChange.event;

	private readonly _onDidFilterChange = this._register(new Emitter<void>());
	readonly onDidFilterChange = this._onDidFilterChange.event;

	private _typeGroupFilter: EditorTypeGroupFilter;

	constructor(
		private readonly model: IReadonlyEditorGroupModel,
		typeGroupFilter: EditorTypeGroupFilter
	) {
		super();

		this._typeGroupFilter = typeGroupFilter;

		this._register(this.model.onDidModelChange(e => {
			const candidateOrIndex = e.editorIndex ?? e.editor;
			if (candidateOrIndex !== undefined) {
				if (!this.filter(candidateOrIndex)) {
					return; // exclude events for excluded items
				}
			}
			this._onDidModelChange.fire(e);
		}));
	}

	/**
	 * Update the type group filter. Call this when the expanded type group changes.
	 */
	setTypeGroupFilter(filter: EditorTypeGroupFilter): void {
		this._typeGroupFilter = filter;
		this._onDidFilterChange.fire();
	}

	get id(): GroupIdentifier { return this.model.id; }
	get isLocked(): boolean { return this.model.isLocked; }
	get stickyCount(): number { return 0; } // Type filtered model excludes sticky editors

	get count(): number {
		return this.getEditors(EditorsOrder.SEQUENTIAL).length;
	}

	get activeEditor(): EditorInput | null {
		return this.model.activeEditor && this.filter(this.model.activeEditor) ? this.model.activeEditor : null;
	}

	get previewEditor(): EditorInput | null {
		return this.model.previewEditor && this.filter(this.model.previewEditor) ? this.model.previewEditor : null;
	}

	get selectedEditors(): EditorInput[] {
		return this.model.selectedEditors.filter(e => this.filter(e));
	}

	isPinned(editorOrIndex: EditorInput | number): boolean { return this.model.isPinned(editorOrIndex); }
	isTransient(editorOrIndex: EditorInput | number): boolean { return this.model.isTransient(editorOrIndex); }
	isSticky(editorOrIndex: EditorInput | number): boolean { return false; } // Type filtered model excludes sticky editors
	isActive(editor: EditorInput | IUntypedEditorInput): boolean { return this.model.isActive(editor); }
	isSelected(editorOrIndex: EditorInput | number): boolean { return this.model.isSelected(editorOrIndex); }

	isFirst(editor: EditorInput): boolean {
		return this.model.isFirst(editor, this.getEditors(EditorsOrder.SEQUENTIAL));
	}

	isLast(editor: EditorInput): boolean {
		return this.model.isLast(editor, this.getEditors(EditorsOrder.SEQUENTIAL));
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		// Always exclude sticky editors in type filtered model
		const editors = this.model.getEditors(order, { excludeSticky: true });
		return editors.filter(e => this._typeGroupFilter(e));
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		const editors = this.getEditors(EditorsOrder.SEQUENTIAL);
		return editors[index];
	}

	indexOf(editor: EditorInput | IUntypedEditorInput | null, editors?: EditorInput[], options?: IMatchEditorOptions): number {
		if (!editor) {
			return -1;
		}
		const filteredEditors = editors ?? this.getEditors(EditorsOrder.SEQUENTIAL);
		return filteredEditors.findIndex(e => {
			if (editor instanceof EditorInput) {
				return e.matches(editor);
			}
			return e.matches(editor);
		});
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		return this.indexOf(candidate, undefined, options) !== -1;
	}

	findEditor(candidate: EditorInput | null, options?: IMatchEditorOptions): [EditorInput, number] | undefined {
		if (!candidate) {
			return undefined;
		}
		const index = this.indexOf(candidate, undefined, options);
		if (index === -1) {
			return undefined;
		}
		const editors = this.getEditors(EditorsOrder.SEQUENTIAL);
		return [editors[index], index];
	}

	private filter(candidateOrIndex: EditorInput | number): boolean {
		let editor: EditorInput | undefined;
		if (typeof candidateOrIndex === 'number') {
			editor = this.model.getEditorByIndex(candidateOrIndex);
		} else {
			editor = candidateOrIndex;
		}

		if (!editor) {
			return false;
		}

		// Exclude sticky editors
		if (this.model.isSticky(editor)) {
			return false;
		}

		// Check type group filter
		return this._typeGroupFilter(editor);
	}
}

