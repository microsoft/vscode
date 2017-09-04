/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./lightBulbWidget';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import * as dom from 'vs/base/browser/dom';
import { TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { QuickFixComputeEvent } from './quickFixModel';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export class LightBulbWidget implements IDisposable {

	private readonly _options = {
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		glyphMarginClassName: 'lightbulb-glyph',
		glyphMarginHoverMessage: <IMarkdownString>undefined
	};

	private readonly _editor: ICodeEditor;
	private readonly _onClick = new Emitter<{ x: number, y: number }>();
	private readonly _mouseDownSubscription: IDisposable;

	private _decorationIds: string[] = [];
	private _currentLine: number;
	private _model: QuickFixComputeEvent;
	private _futureFixes = new CancellationTokenSource();

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._mouseDownSubscription = this._editor.onMouseDown(e => {

			// not on glyh margin or not on 💡
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN
				|| this._currentLine === undefined
				|| this._currentLine !== e.target.position.lineNumber
			) {
				return;
			}

			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(<HTMLDivElement>e.target.element);
			const { lineHeight } = this._editor.getConfiguration();
			this._onClick.fire({
				x: e.event.posx,
				y: top + height + Math.floor(lineHeight / 3)
			});
		});
	}

	dispose(): void {
		this._mouseDownSubscription.dispose();
		this.hide();
	}

	get onClick(): Event<{ x: number, y: number }> {
		return this._onClick.event;
	}

	set model(e: QuickFixComputeEvent) {
		this._model = e;
		this.hide();
		this._futureFixes = new CancellationTokenSource();
		const { token } = this._futureFixes;

		e.fixes.done(fixes => {
			if (!token.isCancellationRequested && fixes && fixes.length > 0) {
				this.show(e);
			} else {
				this.hide();
			}
		}, err => {
			this.hide();
		});
	}

	get model(): QuickFixComputeEvent {
		return this._model;
	}

	set title(value: string) {
		// TODO(joh,alex) this isn't working well because the hover hover
		// message sticks around after clicking the light bulb
		// this._options.glyphMarginHoverMessage = value;
	}

	get title() {
		return this._options.glyphMarginHoverMessage && this._options.glyphMarginHoverMessage.value;
	}

	show(e: QuickFixComputeEvent): void {
		this._currentLine = e.range.startLineNumber;
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, [{
			options: this._options,
			range: { ...e.range, endLineNumber: e.range.startLineNumber }
		}]);
	}

	hide(): void {
		this._decorationIds = this._editor.deltaDecorations(this._decorationIds, []);
		this._futureFixes.cancel();
		this._currentLine = undefined;
	}
}
