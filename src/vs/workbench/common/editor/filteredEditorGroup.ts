/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUntypedEditorInput, IMatchEditorOptions, EditorsOrder } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Event } from 'vs/base/common/event';
import { IGroupModelChangeEvent, IReadonlyEditorGroupModel } from 'vs/workbench/common/editor/editorGroupModel';

export abstract class FilteredEditorGroupModel implements IReadonlyEditorGroupModel {

	constructor(
		protected readonly model: IReadonlyEditorGroupModel
	) { }

	onDidModelChange: Event<IGroupModelChangeEvent> = this.model.onDidModelChange;

	get id(): number { return this.model.id; }
	get isLocked(): boolean { return this.model.isLocked; }
	get stickyCount(): number { return this.model.stickyCount; }

	abstract get activeEditor(): EditorInput | null;
	abstract get previewEditor(): EditorInput | null;
	abstract get count(): number;
	abstract get isEmpty(): boolean;

	isPinned(editorOrIndex: number | EditorInput): boolean { return this.model.isPinned(editorOrIndex); }
	isSticky(editorOrIndex: number | EditorInput): boolean { return this.model.isSticky(editorOrIndex); }
	isActive(editor: EditorInput | IUntypedEditorInput): boolean { return this.model.isActive(editor); }

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		const editors = this.model.getEditors(order, options);
		return editors.filter(e => this.contains(e));
	}

	findEditor(candidate: EditorInput | null, options?: IMatchEditorOptions | undefined): [EditorInput, number] | undefined {
		const result = this.model.findEditor(candidate, options);
		return !result || !this.contains(result[0]) ? undefined : result;
	}

	abstract isFirst(editor: EditorInput): boolean;
	abstract isLast(editor: EditorInput): boolean;
	abstract getEditorByIndex(index: number): EditorInput | undefined;
	abstract indexOf(editor: EditorInput): number;
	abstract contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean;
}

export class StickyEditorGroupModel extends FilteredEditorGroupModel {
	get count(): number { return this.model.stickyCount; }
	override get stickyCount(): number { return this.count; }
	get isEmpty(): boolean { return this.model.stickyCount === 0; }
	get activeEditor(): EditorInput | null { return this.model.activeEditor && this.model.isSticky(this.model.activeEditor) ? this.model.activeEditor : null; }
	get previewEditor(): EditorInput | null { return this.model.previewEditor && this.model.isSticky(this.model.previewEditor) ? this.model.previewEditor : null; }

	override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		if (options?.excludeSticky) {
			return [];
		}
		return super.getEditors(order, options);
	}

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return true;
	}

	isFirst(editor: EditorInput): boolean {
		return this.model.isFirst(editor);
	}

	isLast(editor: EditorInput): boolean {
		return this.model.indexOf(editor) === this.model.stickyCount - 1;
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index < this.count ? this.model.getEditorByIndex(index) : undefined;
	}

	indexOf(editor: EditorInput): number {
		return this.contains(editor) ? this.model.indexOf(editor) : -1;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by StickyEditorGroupModel');
		}
		return this.model.contains(candidate, options) && this.model.indexOf(candidate) < this.model.stickyCount;
	}
}

export class UnstickyEditorGroupModel extends FilteredEditorGroupModel {
	get count(): number { return this.model.count - this.model.stickyCount; }
	override get stickyCount(): number { return 0; }
	get isEmpty(): boolean { return this.model.stickyCount === this.model.count; }
	get activeEditor(): EditorInput | null { return this.model.activeEditor && !this.model.isSticky(this.model.activeEditor) ? this.model.activeEditor : null; }
	get previewEditor(): EditorInput | null { return this.model.previewEditor && !this.model.isSticky(this.model.previewEditor) ? this.model.previewEditor : null; }

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return false;
	}

	override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		return this.model.getEditors(order, { ...options, excludeSticky: true });
	}

	isFirst(editor: EditorInput): boolean {
		return this.model.indexOf(editor) === this.model.stickyCount;
	}

	isLast(editor: EditorInput): boolean {
		return this.model.isLast(editor);
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index >= 0 ? this.model.getEditorByIndex(index + this.model.stickyCount) : undefined;
	}

	indexOf(editor: EditorInput): number {
		return this.contains(editor) ? this.model.indexOf(editor) - this.model.stickyCount : -1;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by UnstickyEditorGroupModel');
		}
		return this.model.contains(candidate, options) && this.model.indexOf(candidate) >= this.model.stickyCount;
	}
}
