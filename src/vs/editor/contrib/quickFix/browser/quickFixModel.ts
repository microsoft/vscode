/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { CodeActionProviderRegistry, Command } from 'vs/editor/common/modes';
import { getCodeActions } from './quickFix';
import { Position } from 'vs/editor/common/core/position';


export class QuickFixOracle {

	private _disposables: IDisposable[] = [];
	private _currentRange: Range;

	constructor(
		private _editor: ICommonCodeEditor,
		private _markerService: IMarkerService,
		private _signalChange: (e: QuickFixComputeEvent) => any,
		delay: number = 250
	) {
		this._disposables.push(
			debounceEvent(this._markerService.onMarkerChanged, (last, cur) => last ? last.concat(cur) : cur, delay / 2)(e => this._onMarkerChanges(e)),
			debounceEvent(this._editor.onDidChangeCursorPosition, last => last, delay)(e => this._onCursorChange())
		);
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	trigger(type: 'manual' | 'auto'): void {

		// get selection from marker or current word
		// unless the selection is non-empty and manually
		// requesting code actions
		const range = (type === 'manual' && this._getRangeOfNonEmptySelection())
			|| this._getRangeOfMarker()
			|| this._getRangeOfWord()
			|| this._editor.getSelection();

		this._createEventAndSignalChange(type, range);
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
		const rangeOrSelection = this._getRangeOfMarker() || this._getRangeOfNonEmptySelection();
		if (!Range.equalsRange(this._currentRange, rangeOrSelection)) {
			this._currentRange = rangeOrSelection;
			this._createEventAndSignalChange('auto', rangeOrSelection);
		}
	}

	private _getRangeOfMarker(): Range {
		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		for (const marker of this._markerService.read({ resource: model.uri })) {
			if (Range.intersectRanges(marker, selection)) {
				return Range.lift(marker);
			}
		}
		return undefined;
	}

	private _getRangeOfWord(): Range {
		const pos = this._editor.getPosition();
		const info = this._editor.getModel().getWordAtPosition(pos);
		return info ? new Range(pos.lineNumber, info.startColumn, pos.lineNumber, info.endColumn) : undefined;
	}

	private _getRangeOfNonEmptySelection(): Selection {
		const selection = this._editor.getSelection();
		return !selection.isEmpty() ? selection : undefined;
	}

	private _createEventAndSignalChange(type: 'auto' | 'manual', rangeOrSelection: Range | Selection): void {
		if (!rangeOrSelection) {
			// cancel
			this._signalChange({
				type,
				range: undefined,
				position: undefined,
				fixes: undefined
			});
		} else {
			// actual
			const model = this._editor.getModel();
			const range = model.validateRange(rangeOrSelection);
			const position = rangeOrSelection instanceof Selection ? rangeOrSelection.getPosition() : rangeOrSelection.getStartPosition();
			this._signalChange({
				type,
				range,
				position,
				fixes: getCodeActions(model, range)
			});
		}
	}
}

export interface QuickFixComputeEvent {
	type: 'auto' | 'manual';
	range: Range;
	position: Position;
	fixes: TPromise<Command[]>;
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
