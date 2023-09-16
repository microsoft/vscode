/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorCloseEvent, IUntypedEditorInput, IVisibleEditorPane, IEditorWillMoveEvent, IEditorWillOpenEvent, IMatchEditorOptions, IActiveEditorChangeEvent, IFindEditorOptions, EditorsOrder } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IGroupModelChangeEvent } from 'vs/workbench/common/editor/editorGroupModel';
import { IReadonlyEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export abstract class FilteredEditorGroup implements IReadonlyEditorGroup {

	constructor(
		protected readonly group: IReadonlyEditorGroup
	) { }
	onDidCloseEditor: Event<IEditorCloseEvent> = this.group.onDidCloseEditor;
	onDidModelChange: Event<IGroupModelChangeEvent> = this.group.onDidModelChange;
	onWillDispose: Event<void> = this.group.onWillDispose;
	onDidActiveEditorChange: Event<IActiveEditorChangeEvent> = this.group.onDidActiveEditorChange;
	onWillCloseEditor: Event<IEditorCloseEvent> = this.group.onWillCloseEditor;
	onWillMoveEditor: Event<IEditorWillMoveEvent> = this.group.onWillMoveEditor;
	onWillOpenEditor: Event<IEditorWillOpenEvent> = this.group.onWillOpenEditor;

	get id(): number { return this.group.id; }
	get index(): number { return this.group.index; }
	get label(): string { return this.group.label; }
	get ariaLabel(): string { return this.group.ariaLabel; }
	get isLocked(): boolean { return this.group.isLocked; }
	get stickyCount(): number { return this.group.stickyCount; }
	get scopedContextKeyService(): IContextKeyService { return this.group.scopedContextKeyService; }

	abstract get activeEditorPane(): IVisibleEditorPane | undefined;
	abstract get activeEditor(): EditorInput | null;
	abstract get previewEditor(): EditorInput | null;
	abstract get count(): number;
	abstract get isEmpty(): boolean;
	abstract get editors(): readonly EditorInput[];

	isPinned(editorOrIndex: number | EditorInput): boolean { return this.group.isPinned(editorOrIndex); }
	isSticky(editorOrIndex: number | EditorInput): boolean { return this.group.isSticky(editorOrIndex); }
	isActive(editor: EditorInput | IUntypedEditorInput): boolean { return this.group.isActive(editor); }
	findEditors(resource: URI, options?: IFindEditorOptions | undefined): readonly EditorInput[] {
		return this.group.findEditors(resource, options).filter(e => this.contains(e));
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean | undefined } | undefined): readonly EditorInput[] {
		const editors = this.group.getEditors(order, options);
		return editors.filter(e => this.contains(e));
	}

	abstract isFirst(editor: EditorInput): boolean;
	abstract isLast(editor: EditorInput): boolean;
	abstract getEditorByIndex(index: number): EditorInput | undefined;
	abstract getIndexOfEditor(editor: EditorInput): number;
	abstract contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean;
}

export class StickyEditorGroupModel extends FilteredEditorGroup {
	get count(): number { return this.group.stickyCount; }
	override get stickyCount(): number { return this.count; }
	get isEmpty(): boolean { return this.group.stickyCount === 0; }
	get editors(): readonly EditorInput[] { return this.group.editors.slice(0, this.group.stickyCount); }
	get activeEditor(): EditorInput | null { return this.group.activeEditor && this.group.isSticky(this.group.activeEditor) ? this.group.activeEditor : null; }
	get previewEditor(): EditorInput | null { return this.group.previewEditor && this.group.isSticky(this.group.previewEditor) ? this.group.previewEditor : null; }
	get activeEditorPane(): IVisibleEditorPane | undefined { return this.group.activeEditorPane && this.group.isSticky(this.group.activeEditorPane.input) ? this.group.activeEditorPane : undefined; }

	override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean | undefined } | undefined): readonly EditorInput[] {
		if (options?.excludeSticky) {
			return [];
		}
		return super.getEditors(order, options);
	}

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return true;
	}

	isFirst(editor: EditorInput): boolean {
		return this.group.isFirst(editor);
	}

	isLast(editor: EditorInput): boolean {
		return this.group.getIndexOfEditor(editor) === this.group.stickyCount - 1;
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index < this.count ? this.group.getEditorByIndex(index) : undefined;
	}

	getIndexOfEditor(editor: EditorInput): number {
		return this.contains(editor) ? this.group.getIndexOfEditor(editor) : -1;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by StickyEditorGroupModel');
		}
		return this.group.contains(candidate, options) && this.group.getIndexOfEditor(candidate) < this.group.stickyCount;
	}
}

export class UnstickyEditorGroupModel extends FilteredEditorGroup {
	get count(): number { return this.group.count - this.group.stickyCount; }
	override get stickyCount(): number { return 0; }
	get isEmpty(): boolean { return this.group.stickyCount === this.group.count; }
	get editors(): readonly EditorInput[] { return this.group.editors.slice(this.group.stickyCount, this.group.count); }
	get activeEditor(): EditorInput | null { return this.group.activeEditor && !this.group.isSticky(this.group.activeEditor) ? this.group.activeEditor : null; }
	get previewEditor(): EditorInput | null { return this.group.previewEditor && !this.group.isSticky(this.group.previewEditor) ? this.group.previewEditor : null; }
	get activeEditorPane(): IVisibleEditorPane | undefined { return this.group.activeEditorPane && !this.group.isSticky(this.group.activeEditorPane.input) ? this.group.activeEditorPane : undefined; }

	override isSticky(editorOrIndex: number | EditorInput): boolean {
		return false;
	}

	isFirst(editor: EditorInput): boolean {
		return this.group.getIndexOfEditor(editor) === this.group.stickyCount;
	}

	isLast(editor: EditorInput): boolean {
		return this.group.isLast(editor);
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return index >= 0 ? this.group.getEditorByIndex(index + this.group.stickyCount) : undefined;
	}

	getIndexOfEditor(editor: EditorInput): number {
		return this.contains(editor) ? this.group.getIndexOfEditor(editor) - this.group.stickyCount : -1;
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined): boolean {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by UnstickyEditorGroupModel');
		}
		return this.group.contains(candidate, options) && this.group.getIndexOfEditor(candidate) >= this.group.stickyCount;
	}
}
