/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { commonEditorContribution, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { SnippetSession } from './snippetSession';
import { EditorCommand } from 'vs/editor/common/config/config';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

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

	private _snippet: SnippetSession;
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
		dispose(this._snippet);
	}

	getId(): string {
		return 'snippetController2';
	}

	insert(
		template: string,
		overwriteBefore: number = 0, overwriteAfter: number = 0,
		undoStopBefore: boolean = true, undoStopAfter: boolean = true
	): void {
		if (this._snippet) {
			this.cancel();
		}
		this._snippet = new SnippetSession(this._editor, template, overwriteBefore, overwriteAfter);
		if (undoStopBefore) {
			this._editor.getModel().pushStackElement();
		}
		this._snippet.insert();
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
		if (!this._snippet) {
			// canceled in the meanwhile
			return;
		}

		if (!this._snippet.hasPlaceholder) {
			// don't listen for selection changes and don't
			// update context keys when the snippet is plain text
			return;
		}

		if (this._snippet.isAtFinalPlaceholder || !this._snippet.isSelectionWithPlaceholders()) {
			return this.cancel();
		}

		this._inSnippet.set(true);
		this._hasPrevTabstop.set(!this._snippet.isAtFirstPlaceholder);
		this._hasNextTabstop.set(!this._snippet.isAtFinalPlaceholder);
	}

	finish(): void {
		while (this._inSnippet.get()) {
			this.next();
		}
	}

	cancel(): void {
		if (this._snippet) {
			this._inSnippet.reset();
			this._hasPrevTabstop.reset();
			this._hasNextTabstop.reset();
			dispose(this._snippetListener);
			dispose(this._snippet);
			this._snippet = undefined;
		}
	}

	prev(): void {
		if (this._snippet) {
			this._snippet.prev();
			this._updateState();
		}
	}

	next(): void {
		if (this._snippet) {
			this._snippet.next();
			this._updateState();
		}
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
