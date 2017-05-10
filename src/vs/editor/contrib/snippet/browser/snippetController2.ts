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
		dispose(this._snippet);
	}

	getId(): string {
		return 'snippetController2';
	}

	insert(template: string, overwriteBefore: number = 0, overwriteAfter: number = 0): void {

		if (this._snippet) {
			this.abort();
		}

		this._snippet = new SnippetSession(this._editor, template, overwriteBefore, overwriteAfter);
		this._snippetListener = [this._editor.onDidChangeCursorSelection(() => this._updateState())];
		this._snippet.insert();
	}

	private _updateState(): void {
		if (!this._snippet) {
			return;
		}
		if (this._snippet.isAtFinalPlaceholder || !this._snippet.validateSelections()) {
			return this.abort();
		}

		this._hasPrevTabstop.set(!this._snippet.isAtFirstPlaceholder);
		this._hasNextTabstop.set(!this._snippet.isAtFinalPlaceholder);
		this._inSnippet.set(true);
	}

	abort(): void {
		if (this._snippet) {
			this._hasPrevTabstop.reset();
			this._hasNextTabstop.reset();
			this._inSnippet.reset();
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
