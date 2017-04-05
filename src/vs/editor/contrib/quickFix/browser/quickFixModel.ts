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
import { ICommonCodeEditor, IPosition, IRange } from 'vs/editor/common/editorCommon';
import { CodeActionProviderRegistry, CodeAction } from 'vs/editor/common/modes';
import { getCodeActions } from './quickFix';


export class QuickFixOracle {

	private _disposables: IDisposable[] = [];
	private _currentRange: IRange;

	constructor(private _editor: ICommonCodeEditor, private _markerService: IMarkerService, private _signalChange: (e: QuickFixComputeEvent) => any) {
		this._disposables.push(
			this._markerService.onMarkerChanged(e => this._onMarkerChanges(e)),
			this._editor.onDidChangeCursorPosition(e => this._onCursorChange())
		);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	trigger(type: 'manual' | 'auto'): void {
		let range = this._rangeAtPosition();
		if (!range) {
			range = this._editor.getSelection();
		}
		this._signalChange({
			type,
			range,
			position: this._editor.getPosition(),
			fixes: range && getCodeActions(this._editor.getModel(), this._editor.getModel().validateRange(range))
		});

	}

	private _onMarkerChanges(resources: URI[]): void {
		const { uri } = this._editor.getModel();
		for (const resource of resources) {
			if (resource.toString() === uri.toString()) {
				this._currentRange = undefined;
				this._onCursorChange();
				return;
			}
		}
	}

	private _onCursorChange(): void {
		const range = this._rangeAtPosition();
		if (!Range.equalsRange(this._currentRange, range)) {
			this._currentRange = range;
			this._signalChange({
				type: 'auto',
				range,
				position: this._editor.getPosition(),
				fixes: range && getCodeActions(this._editor.getModel(), this._editor.getModel().validateRange(range))
			});
		}
	}

	private _rangeAtPosition(): IRange {

		// (1) check with non empty selection
		const selection = this._editor.getSelection();
		if (!selection.isEmpty()) {
			return selection;
		}

		// (2) check with diagnostics markers
		const marker = this._markerAtPosition();
		if (marker) {
			return Range.lift(marker);
		}

		// (3) check with word
		return this._wordAtPosition();
	}

	private _markerAtPosition(): IMarker {

		const position = this._editor.getPosition();
		const { uri } = this._editor.getModel();
		const markers = this._markerService.read({ resource: uri }).sort(Range.compareRangesUsingStarts);

		let idx = arrays.findFirst(markers, marker => marker.endLineNumber >= position.lineNumber);
		while (idx < markers.length && markers[idx].endLineNumber >= position.lineNumber) {
			const marker = markers[idx];
			if (Range.containsPosition(marker, position)) {
				return marker;
			}
			idx++;
		}
		return undefined;
	}

	private _wordAtPosition(): IRange {
		const pos = this._editor.getPosition();
		const model = this._editor.getModel();
		const info = model.getWordAtPosition(pos);
		if (info) {
			return {
				startLineNumber: pos.lineNumber,
				startColumn: info.startColumn,
				endLineNumber: pos.lineNumber,
				endColumn: info.endColumn
			};
		}
		return undefined;
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

	constructor(editor: ICommonCodeEditor, markerService: IMarkerService) {
		this._editor = editor;
		this._markerService = markerService;

		this._disposables.push(this._editor.onDidChangeModel(() => this._update()));
		this._disposables.push(this._editor.onDidChangeModelLanguage(() => this._update()));
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
			this._quickFixOracle.dispose();
			this._quickFixOracle = undefined;
			this._onDidChangeFixes.fire(undefined);
		}

		if (this._editor.getModel()
			&& CodeActionProviderRegistry.has(this._editor.getModel())
			&& !this._editor.getConfiguration().readOnly) {

			this._quickFixOracle = new QuickFixOracle(this._editor, this._markerService, p => this._onDidChangeFixes.fire(p));
			this._quickFixOracle.trigger('auto');
		}
	}

	trigger(type: 'auto' | 'manual'): void {
		if (this._quickFixOracle) {
			this._quickFixOracle.trigger(type);
		}
	}
}
