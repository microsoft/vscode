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
		let selection = this._editor.getSelection();
		let range = this._getActiveMarkerOrWordRange();
		if (type === 'manual' && !selection.isEmpty()) {
			range = selection;
		}

		// empty selection somewhere in nowhere
		if (!range) {
			range = selection;
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
		const range = this._getActiveMarkerOrWordRange();
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

	private _getActiveMarkerOrWordRange(): Range {

		const selection = this._editor.getSelection();
		const model = this._editor.getModel();

		// (1) return marker that contains a (empty/non-empty) selection
		for (const marker of this._markerService.read({ resource: model.uri })) {
			const range = Range.lift(marker);
			if (range.containsRange(selection)) {
				return range;
			}
		}

		// (2) return range of current word
		if (selection.isEmpty()) {
			const pos = selection.getStartPosition();
			const info = model.getWordAtPosition(pos);
			if (info) {
				return new Range(pos.lineNumber, info.startColumn, pos.lineNumber, info.endColumn);
			}
		}

		return undefined;
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
