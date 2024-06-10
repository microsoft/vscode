/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived } from 'vs/base/common/observable';
import 'vs/css!./inlineEditSideBySideWidget';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { Position } from 'vs/editor/common/core/position';
import { IInlineEdit } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';

function* range(start: number, end: number, step = 1) {
	if (end === undefined) { [end, start] = [start, 0]; }
	for (let n = start; n < end; n += step) { yield n; }
}

type Pos = {
	top: number;
	left: Position;
};

export class InlineEditSideBySideWidget extends Disposable {
	private readonly position = derived(this, reader => {
		const ghostText = this.model.read(reader);

		if (!ghostText || ghostText.text.length === 0) {
			return null;
		}
		const editorModel = this.editor.getModel();
		if (!editorModel) {
			return null;
		}
		const lines = Array.from(range(ghostText.range.startLineNumber, ghostText.range.endLineNumber + 1));
		const lengths = lines.map(lineNumber => editorModel.getLineLastNonWhitespaceColumn(lineNumber));
		const maxColumn = Math.max(...lengths);
		const lineOfMaxColumn = lines[lengths.indexOf(maxColumn)];

		const position = new Position(lineOfMaxColumn, maxColumn);
		const pos = {
			top: ghostText.range.startLineNumber,
			left: position
		};

		return pos;
	});

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: IObservable<IInlineEdit | undefined>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			/** @description setup content widget */
			const model = this.model.read(reader);
			if (!model) {
				return;
			}

			const contentWidget = store.add(this.instantiationService.createInstance(
				InlineEditSideBySideContentWidget,
				this.editor,
				this.position,
				model.text
			));
			editor.addOverlayWidget(contentWidget);
			store.add(toDisposable(() => editor.removeOverlayWidget(contentWidget)));
		}));
	}
}

class InlineEditSideBySideContentWidget extends Disposable implements IOverlayWidget {
	private static _dropDownVisible = false;
	public static get dropDownVisible() { return this._dropDownVisible; }

	private static id = 0;

	private readonly id = `InlineEditSideBySideContentWidget${InlineEditSideBySideContentWidget.id++}`;
	public readonly allowEditorOverflow = true;
	public readonly suppressMouseDown = false;

	private readonly nodes;
	private readonly _markdownRenderer: MarkdownRenderer;


	constructor(
		private readonly editor: ICodeEditor,
		private readonly _position: IObservable<Pos | null>,
		private readonly text: string,

		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
	) {
		super();

		this._markdownRenderer = this._register(new MarkdownRenderer({ editor: this.editor }, languageService, openerService));

		this._register(autorun(reader => {
			/** @description update position */
			this._position.read(reader);
			this.editor.layoutOverlayWidget(this);
		}));

		const t = '```\n' + this.text + '\n```';
		console.log('InlineEditSideBySideContentWidget -> constructor -> t', t);

		const code = this._markdownRenderer.render({ value: t, isTrusted: true });

		this.nodes = $('div.inlineEditSideBySide', undefined,
			code.element
		);


	}

	getId(): string { return this.id; }

	getDomNode(): HTMLElement {
		return this.nodes;
	}

	getPosition(): IOverlayWidgetPosition | null {
		const position = this._position.get();
		if (!position) {
			return null;
		}
		const layoutInfo = this.editor.getLayoutInfo();
		const top = this.editor.getTopForLineNumber(position.top);
		const left = layoutInfo.contentLeft + this.editor.getOffsetForColumn(position.left.lineNumber, position.left.column) + 10;

		return {
			preference: {
				left,
				top,
			}
		};
	}
}
