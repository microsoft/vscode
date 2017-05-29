/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { commonEditorContribution, CommonEditorRegistry, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { SnippetSession } from './snippetSession';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

class SnippetSessions {

	private _stack: SnippetSession[] = [];

	add(session: SnippetSession): number {
		return this._stack.push(session);
	}

	clear(): void {
		dispose(this._stack);
		this._stack.length = 0;
	}

	get empty(): boolean {
		return this._stack.length === 0;
	}

	get hasPlaceholder(): boolean {
		return this._stack.some(s => s.hasPlaceholder);
	}

	get isAtFirstPlaceholder(): boolean {
		return this._stack.every(s => s.isAtFirstPlaceholder);
	}

	get isAtFinalPlaceholder(): boolean {
		return !this.empty && this._stack[0].isAtLastPlaceholder;
	}

	get isSelectionWithinPlaceholders(): boolean {
		return this._stack.some(s => s.isSelectionWithinPlaceholders());
	}

	prev(): void {
		for (let i = this._stack.length - 1; i >= 0; i--) {
			const snippet = this._stack[i];
			if (!snippet.isAtFirstPlaceholder) {
				snippet.prev();
				break;
			}
		}
	}

	next(): void {
		for (let i = this._stack.length - 1; i >= 0; i--) {
			const snippet = this._stack[i];
			if (!snippet.isAtLastPlaceholder) {
				snippet.next();
				break;
			}
		}
	}
}

@commonEditorContribution
export class SnippetController2 {

	static get(editor: ICommonCodeEditor): SnippetController2 {
		return editor.getContribution<SnippetController2>('snippetController2');
	}

	static InSnippetMode = new RawContextKey('inSnippetMode', false);
	static HasNextTabstop = new RawContextKey('hasNextTabstop', false);
	static HasPrevTabstop = new RawContextKey('hasPrevTabstop', false);

	private readonly _inSnippet: IContextKey<boolean>;
	private readonly _hasNextTabstop: IContextKey<boolean>;
	private readonly _hasPrevTabstop: IContextKey<boolean>;

	// private _snippet: SnippetSession;
	private _sessions = new SnippetSessions();
	private _snippetListener: IDisposable[] = [];

	constructor(
		private readonly _editor: ICommonCodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this._inSnippet = SnippetController2.InSnippetMode.bindTo(contextKeyService);
		this._hasNextTabstop = SnippetController2.HasNextTabstop.bindTo(contextKeyService);
		this._hasPrevTabstop = SnippetController2.HasPrevTabstop.bindTo(contextKeyService);
	}

	dispose(): void {
		this._inSnippet.reset();
		this._hasPrevTabstop.reset();
		this._hasNextTabstop.reset();
		this._sessions.clear();
	}

	getId(): string {
		return 'snippetController2';
	}

	insert(
		template: string,
		overwriteBefore: number = 0, overwriteAfter: number = 0,
		undoStopBefore: boolean = true, undoStopAfter: boolean = true
	): void {

		// don't listen while inserting the snippet
		// as that is the inflight state causing cancelation
		this._snippetListener = dispose(this._snippetListener);

		if (undoStopBefore) {
			this._editor.getModel().pushStackElement();
		}

		const snippet = new SnippetSession(this._editor, template, overwriteBefore, overwriteAfter);
		const newLen = this._sessions.add(snippet);
		snippet.insert(newLen > 1);

		if (undoStopAfter) {
			this._editor.getModel().pushStackElement();
		}

		this._snippetListener = [
			this._editor.onDidChangeModel(() => this.cancel()),
			this._editor.onDidChangeCursorSelection(() => this._updateState())
		];
		this._updateState();
	}

	private _updateState(): void {
		if (this._sessions.empty) {
			// canceled in the meanwhile
			return;
		}

		if (!this._sessions.hasPlaceholder) {
			// don't listen for selection changes and don't
			// update context keys when the snippet is plain text
			return this.cancel();
		}

		if (this._sessions.isAtFinalPlaceholder || !this._sessions.isSelectionWithinPlaceholders) {
			return this.cancel();
		}

		this._inSnippet.set(true);
		this._hasPrevTabstop.set(!this._sessions.isAtFirstPlaceholder);
		this._hasNextTabstop.set(!this._sessions.isAtFinalPlaceholder);
	}

	finish(): void {
		while (this._inSnippet.get()) {
			this.next();
		}
	}

	cancel(): void {
		this._inSnippet.reset();
		this._hasPrevTabstop.reset();
		this._hasNextTabstop.reset();
		this._sessions.clear();
		dispose(this._snippetListener);
	}

	prev(): void {
		this._sessions.prev();
		this._updateState();
	}

	next(): void {
		this._sessions.next();
		this._updateState();
	}
}


const CommandCtor = EditorCommand.bindToContribution<SnippetController2>(SnippetController2.get);

CommonEditorRegistry.registerEditorCommand(new CommandCtor({
	id: 'jumpToNextSnippetPlaceholder',
	precondition: ContextKeyExpr.and(SnippetController2.InSnippetMode, SnippetController2.HasNextTabstop),
	handler: ctrl => ctrl.next(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.textFocus,
		primary: KeyCode.Tab
	}
}));
CommonEditorRegistry.registerEditorCommand(new CommandCtor({
	id: 'jumpToPrevSnippetPlaceholder',
	precondition: ContextKeyExpr.and(SnippetController2.InSnippetMode, SnippetController2.HasPrevTabstop),
	handler: ctrl => ctrl.prev(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.textFocus,
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));
CommonEditorRegistry.registerEditorCommand(new CommandCtor({
	id: 'leaveSnippet',
	precondition: SnippetController2.InSnippetMode,
	handler: ctrl => ctrl.cancel(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(30),
		kbExpr: EditorContextKeys.textFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

CommonEditorRegistry.registerEditorCommand(new CommandCtor({
	id: 'acceptSnippet',
	precondition: SnippetController2.InSnippetMode,
	handler: ctrl => ctrl.finish(),
	// kbOpts: {
	// 	weight: CommonEditorRegistry.commandWeight(30),
	// 	kbExpr: EditorContextKeys.textFocus,
	// 	primary: KeyCode.Enter,
	// }
}));
