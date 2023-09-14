/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorCloseEvent, IUntypedEditorInput, IVisibleEditorPane, IEditorWillMoveEvent, IEditorWillOpenEvent, IMatchEditorOptions, IActiveEditorChangeEvent, IFindEditorOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorGroupTitleHeight, IReadableEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IGroupModelChangeEvent } from 'vs/workbench/common/editor/editorGroupModel';
import { IViewSize, LayoutPriority } from 'vs/base/browser/ui/grid/gridview';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';

abstract class DefaultEditorGroupModel implements IReadableEditorGroupView {

	constructor(
		protected readonly group: IReadableEditorGroupView
	) { }

	onDidFocus: Event<void> = this.group.onDidFocus;
	onDidOpenEditorFail: Event<EditorInput> = this.group.onDidOpenEditorFail;
	onDidCloseEditor: Event<IEditorCloseEvent> = this.group.onDidCloseEditor;
	onDidModelChange: Event<IGroupModelChangeEvent> = this.group.onDidModelChange;
	onWillDispose: Event<void> = this.group.onWillDispose;
	onDidActiveEditorChange: Event<IActiveEditorChangeEvent> = this.group.onDidActiveEditorChange;
	onWillCloseEditor: Event<IEditorCloseEvent> = this.group.onWillCloseEditor;
	onWillMoveEditor: Event<IEditorWillMoveEvent> = this.group.onWillMoveEditor;
	onWillOpenEditor: Event<IEditorWillOpenEvent> = this.group.onWillOpenEditor;
	onDidChange: Event<IViewSize | undefined> = this.group.onDidChange;

	get whenRestored(): Promise<void> { return this.group.whenRestored; }
	get titleHeight(): IEditorGroupTitleHeight { return this.group.titleHeight; }
	get disposed(): boolean { return this.group.disposed; }
	get preferredWidth(): number | undefined { return this.group.preferredWidth; }
	get preferredHeight(): number | undefined { return this.group.preferredHeight; }
	get element(): HTMLElement { return this.group.element; }
	get minimumWidth(): number { return this.group.minimumWidth; }
	get maximumWidth(): number { return this.group.maximumWidth; }
	get minimumHeight(): number { return this.group.minimumHeight; }
	get maximumHeight(): number { return this.group.maximumHeight; }
	get priority(): LayoutPriority | undefined { return this.group.priority; }
	get proportionalLayout(): boolean | undefined { return this.group.proportionalLayout; }
	get snap(): boolean | undefined { return this.group.snap; }
	get id(): number { return this.group.id; }
	get index(): number { return this.group.index; }
	get label(): string { return this.group.label; }
	get ariaLabel(): string { return this.group.ariaLabel; }
	get activeEditorPane(): IVisibleEditorPane | undefined { return this.group.activeEditorPane; }
	get activeEditor(): EditorInput | null { return this.group.activeEditor; }
	get previewEditor(): EditorInput | null { return this.group.previewEditor; }
	get count(): number { return this.group.count; }
	get isEmpty(): boolean { return this.group.isEmpty; }
	get isLocked(): boolean { return this.group.isLocked; }
	get stickyCount(): number { return this.group.stickyCount; }
	get editors(): readonly EditorInput[] { return this.group.editors; }
	get scopedContextKeyService(): IContextKeyService { return this.group.scopedContextKeyService; }

	dispose: () => void = () => this.group.dispose();
	toJSON: () => object = () => this.group.toJSON();

	layout: (width: number, height: number, top: number, left: number) => void = (w, h, t, l) => this.group.layout(w, h, t, l);
	setVisible?: (visible: boolean) => void = this.group.setVisible;
	setBoundarySashes?: (sashes: IBoundarySashes) => void = this.group.setBoundarySashes;

	findEditors: (resource: URI, options?: IFindEditorOptions | undefined) => readonly EditorInput[] = (r, o) => this.group.findEditors(r, o);
	getEditorByIndex: (index: number) => EditorInput | undefined = (i) => this.group.getEditorByIndex(i);
	getIndexOfEditor: (editor: EditorInput) => number = (e) => this.group.getIndexOfEditor(e);
	isFirst: (editor: EditorInput) => boolean = (e) => this.group.isFirst(e);
	isLast: (editor: EditorInput) => boolean = (e) => this.group.isLast(e);
	isPinned: (editorOrIndex: number | EditorInput) => boolean = (e) => this.group.isPinned(e);
	isSticky: (editorOrIndex: number | EditorInput) => boolean = (e) => this.group.isSticky(e);
	isActive: (editor: EditorInput | IUntypedEditorInput) => boolean = (e) => this.group.isActive(e);
	contains: (candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined) => boolean = (c, o) => this.group.contains(c, o);
}

export class StickyEditorGroupModel extends DefaultEditorGroupModel {
	override get count(): number { return this.group.stickyCount; }
	override get isEmpty(): boolean { return this.group.stickyCount === 0; }
	override get editors(): readonly EditorInput[] { return this.group.editors.slice(0, this.group.stickyCount); }
	override get activeEditor(): EditorInput | null {
		const activeEditor = this.group.activeEditor;
		if (!activeEditor) {
			return null;
		}
		return this.group.isSticky(activeEditor) ? activeEditor : null;
	}

	override isSticky: (editorOrIndex: number | EditorInput) => boolean = (editorOrIndex: number | EditorInput) => { return true; };
	override isLast: (editor: EditorInput) => boolean = (editor: EditorInput) => { return this.group.getIndexOfEditor(editor) === this.group.stickyCount - 1; };
	override contains: (candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined) => boolean = (candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined) => {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by StickyEditorGroupModel');
		}
		return this.group.contains(candidate, options) && this.group.getIndexOfEditor(candidate) < this.group.stickyCount;
	};
}

export class UnstickyEditorGroupModel extends DefaultEditorGroupModel {
	override get count(): number { return this.group.count - this.group.stickyCount; }
	override get isEmpty(): boolean { return this.group.stickyCount === this.group.count; }
	override get editors(): readonly EditorInput[] { return this.group.editors.slice(this.group.stickyCount, this.group.count); }
	override get activeEditor(): EditorInput | null {
		const activeEditor = this.group.activeEditor;
		if (!activeEditor) {
			return null;
		}
		return !this.group.isSticky(activeEditor) ? activeEditor : null;
	}

	override isSticky: (editorOrIndex: number | EditorInput) => boolean = (editorOrIndex: number | EditorInput) => { return false; };
	override getEditorByIndex: (index: number) => EditorInput | undefined = (index: number) => { return this.group.getEditorByIndex(index + this.group.stickyCount); };
	override getIndexOfEditor: (editor: EditorInput) => number = (editor: EditorInput) => { return this.group.getIndexOfEditor(editor) + this.group.stickyCount; };
	override contains: (candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined) => boolean = (candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions | undefined) => {
		if (!(candidate instanceof EditorInput)) {
			throw new Error('IUntypedEditorInput can\'t be handled by UnstickyEditorGroupModel');
		}
		return this.group.contains(candidate, options) && this.group.getIndexOfEditor(candidate) >= this.group.stickyCount;
	};
}
