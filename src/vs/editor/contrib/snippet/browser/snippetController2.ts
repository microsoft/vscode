/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { SnippetSession } from './editorSnippets';


@commonEditorContribution
export class SnippetController2 {

	static InSnippetMode = new RawContextKey('inSnippet', false);
	static HasNextTabstop = new RawContextKey('hasNextTabstop', false);
	static HasPrevTabstop = new RawContextKey('hasPrevTabstop', false);

	private readonly _inSnippet: IContextKey<boolean>;
	private readonly _hasNextTabstop: IContextKey<boolean>;
	private readonly _hasPrevTabstop: IContextKey<boolean>;

	private _snippetStack: SnippetSession[] = [];
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
		dispose(this._snippetStack);
	}

	getId(): string {
		return 'snippetController2';
	}

	insert(template: string, overwriteBefore: number = 0, overwriteAfter: number = 0): void {
		const session = new SnippetSession(this._editor, template);
		const newLen = this._snippetStack.unshift(session);
		if (newLen === 1) {
			this._inSnippet.set(true);
			this._snippetListener = [this._editor.onDidChangeCursorSelection(() => this._updateState())];
		}
		session.insert();
	}

	private _updateState(): void {
		if (!this._snippetStack[0].validateSelections()) {
			return this.abort();
		}

		let prev = false;
		let next = false;
		for (let i = 0; i < this._snippetStack.length && !(prev && next); i++) {
			if (!this._snippetStack[i].isAtFirstPlaceholder) {
				prev = true;
			}
			if (!this._snippetStack[i].isAtFinalPlaceholder) {
				next = true;
			}
		}
		this._hasNextTabstop.set(next);
		this._hasPrevTabstop.set(prev);
	}

	abort(): void {

		// remove current, check for next
		const element = this._snippetStack.shift();
		dispose(element);

		// clean up if last snippet is gone
		// or validate the new active snippet
		if (this._snippetStack.length === 0) {
			this._inSnippet.set(false);
			this._hasNextTabstop.set(false);
			this._hasPrevTabstop.set(false);
			this._snippetListener = dispose(this._snippetListener);

		} else {
			//
			this._updateState();
		}
	}

	prev(): void {
		for (let i = 0; i < this._snippetStack.length; i++) {
			if (this._snippetStack[i].prev()) {
				return;
			}
		}
	}

	next(): void {
		for (let i = 0; i < this._snippetStack.length; i++) {
			if (this._snippetStack[i].next()) {
				return;
			}
		}
	}

}
