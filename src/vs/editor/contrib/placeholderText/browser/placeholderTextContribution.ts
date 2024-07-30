/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { structuralEquals } from 'vs/base/common/equals';
import { Disposable } from 'vs/base/common/lifecycle';
import { autorun, constObservable, derivedObservableWithCache, derivedOpts, IObservable, IReader } from 'vs/base/common/observable';
import { DebugOwner } from 'vs/base/common/observableInternal/debugName';
import { derivedWithStore } from 'vs/base/common/observableInternal/derived';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';

/**
 * Use the editor option to set the placeholder text.
*/
export class PlaceholderTextContribution extends Disposable implements IEditorContribution {
	public static get(editor: ICodeEditor): PlaceholderTextContribution {
		return editor.getContribution<PlaceholderTextContribution>(PlaceholderTextContribution.ID)!;
	}

	public static readonly ID = 'editor.contrib.placeholderText';
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _placeholderText = this._editorObs.getOption(EditorOption.placeholder);

	private readonly _state = derivedOpts<{ placeholder: string } | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
		const p = this._placeholderText.read(reader);
		if (!p) { return undefined; }
		if (!this._editorObs.valueIsEmpty.read(reader)) { return undefined; }
		return { placeholder: p };
	});

	private readonly _shouldViewBeAlive = isOrWasTrue(this, reader => this._state.read(reader)?.placeholder !== undefined);

	private readonly _view = derivedWithStore((reader, store) => {
		if (!this._shouldViewBeAlive.read(reader)) { return; }

		const element = h('div.editorPlaceholder');

		store.add(autorun(reader => {
			const data = this._state.read(reader);
			const shouldBeVisibile = data?.placeholder !== undefined;
			element.root.style.display = shouldBeVisibile ? 'block' : 'none';
			element.root.innerText = data?.placeholder ?? '';
		}));
		store.add(autorun(reader => {
			const info = this._editorObs.layoutInfo.read(reader);
			element.root.style.left = `${info.contentLeft}px`;
			element.root.style.width = (info.contentWidth - info.verticalScrollbarWidth) + 'px';
			element.root.style.top = `${this._editor.getTopForLineNumber(0)}px`;
		}));
		store.add(autorun(reader => {
			element.root.style.fontFamily = this._editorObs.getOption(EditorOption.fontFamily).read(reader);
			element.root.style.fontSize = this._editorObs.getOption(EditorOption.fontSize).read(reader) + 'px';
			element.root.style.lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader) + 'px';
		}));
		store.add(this._editorObs.createOverlayWidget({
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
			position: constObservable(null),
			domNode: element.root,
		}));
	});

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		super();
		this._view.recomputeInitiallyAndOnChange(this._store);
	}
}

function isOrWasTrue(owner: DebugOwner, fn: (reader: IReader) => boolean): IObservable<boolean> {
	return derivedObservableWithCache<boolean>(owner, (reader, lastValue) => {
		if (lastValue === true) { return true; }
		return fn(reader);
	});
}
