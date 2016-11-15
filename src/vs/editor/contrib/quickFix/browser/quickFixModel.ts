/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as arrays from 'vs/base/common/arrays';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMarker, IMarkerService } from 'vs/platform/markers/common/markers';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommonCodeEditor, IPosition, IRange } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeActionProviderRegistry, CodeAction } from 'vs/editor/common/modes';
import { getCodeActions } from '../common/quickFix';


class QuickFixOracle {

	private _disposables: IDisposable[] = [];

	constructor(private _editor: ICommonCodeEditor, private _markerService: IMarkerService, private _signalChange: (e: QuickFixComputeEvent) => any) {

		this._disposables.push(
			this._markerService.onMarkerChanged(e => this._onMarkerChanges(e)),
			this._editor.onDidChangeCursorPosition(e => this._onCursorChange())
		);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	private _onMarkerChanges(resources: URI[]): void {
		const {uri} = this._editor.getModel();
		let affectedBy = false;
		for (const resource of resources) {
			if (resource.toString() === uri.toString()) {
				affectedBy = true;
				break;
			}
		}
		if (affectedBy) {
			this._onCursorChange();
		}
	}

	private _onCursorChange(): void {
		const range = this._markerAtPosition() || this._wordAtPosition();

		this._signalChange({
			type: 'auto',
			range,
			position: this._editor.getPosition(),
			fixes: range && getCodeActions(this._editor.getModel(), Range.lift(range))
		});
	}

	private _markerAtPosition(): IMarker {

		const position = this._editor.getPosition();
		const {uri} = this._editor.getModel();
		const markers = this._markerService.read({ resource: uri }).sort(Range.compareRangesUsingStarts);

		let idx = arrays.findFirst(markers, marker => marker.endLineNumber >= position.lineNumber);
		while (idx < markers.length && markers[idx].endLineNumber >= position.lineNumber) {
			const marker = markers[idx];
			if (Range.containsPosition(marker, position)) {
				return marker;
			}
			idx++;
		}
	}

	private _wordAtPosition(): IRange {
		return;
		// todo@joh - enable once we decide to eagerly show the
		// light bulb as the cursor moves
		// const {positionLineNumber, positionColumn} = this._editor.getSelection();
		// const model = this._editor.getModel();

		// const info = model.getWordAtPosition({ lineNumber: positionLineNumber, column: positionColumn });
		// if (info) {
		// 	return {
		// 		startLineNumber: positionLineNumber,
		// 		startColumn: info.startColumn,
		// 		endLineNumber: positionLineNumber,
		// 		endColumn: info.endColumn
		// 	};
		// }
	}
}

export interface QuickFixComputeEvent {
	type: 'auto' | 'manual';
	range: IRange;
	position: IPosition;
	fixes: TPromise<CodeAction[]>;
}

export class QuickFixModel {

	private _editor: ICommonCodeEditor;
	private _markerService: IMarkerService;
	private _quickFixOracle: QuickFixOracle;
	private _onDidChangeFixes = new Emitter<QuickFixComputeEvent>();
	private _disposables: IDisposable[] = [];

	constructor(editor: ICodeEditor, markerService: IMarkerService) {
		this._editor = editor;
		this._markerService = markerService;

		this._disposables.push(this._editor.onDidChangeModel(() => this._update()));
		this._disposables.push(this._editor.onDidChangeModelMode(() => this._update()));
		this._disposables.push(CodeActionProviderRegistry.onDidChange(this._update, this));

		this._update();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
		dispose(this._quickFixOracle);
	}

	get onDidChangeFixes(): Event<QuickFixComputeEvent> {
		return this._onDidChangeFixes.event;
	}

	private _update(): void {

		if (this._quickFixOracle) {
			dispose(this._quickFixOracle);
			this._onDidChangeFixes.fire(undefined);
		}

		if (this._editor.getModel()
			&& CodeActionProviderRegistry.has(this._editor.getModel())
			&& !this._editor.getConfiguration().readOnly) {

			this._quickFixOracle = new QuickFixOracle(this._editor, this._markerService, p => this._onDidChangeFixes.fire(p));
		}
	}

	triggerManual(selection: Selection): void {
		const model = this._editor.getModel();
		if (model) {
			const fixes = getCodeActions(model, selection);
			this._onDidChangeFixes.fire({
				type: 'manual',
				range: selection,
				position: { lineNumber: selection.positionLineNumber, column: selection.positionColumn },
				fixes
			});
		}
	}
}
