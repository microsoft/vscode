/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as arrays from 'vs/base/common/arrays';
import {RunOnceScheduler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import * as timer from 'vs/base/common/timer';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {Range} from 'vs/editor/common/core/range';
import {ICursorPositionChangedEvent, IPosition, IRange} from 'vs/editor/common/editorCommon';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {CodeActionProviderRegistry} from 'vs/editor/common/modes';
import {IQuickFix2, getCodeActions} from '../common/quickFix';
import {LightBulpWidget} from './lightBulpWidget';

enum QuickFixSuggestState {
	NOT_ACTIVE = 0,
	MANUAL_TRIGGER = 1,
	AUTO_TRIGGER = 2
}

export class QuickFixModel extends EventEmitter {

	private editor: ICodeEditor;
	private onAccept: (fix: IQuickFix2, range:IRange) => void;

	private markers: IMarker[];
	private lastMarker: IMarker;
	private lightBulpPosition: IPosition;
	private toDispose: IDisposable[];
	private toLocalDispose: IDisposable[];
	private lightBulpDecoration: string[];

	private autoSuggestDelay: number;
	private enableAutoQuckFix: boolean;

	private triggerAutoSuggestPromise:TPromise<void>;
	private state:QuickFixSuggestState;

	private quickFixRequestPromiseRange: IRange;
	private quickFixRequestPromise: TPromise<IQuickFix2[]>;

	private markerService: IMarkerService;

	private updateScheduler: RunOnceScheduler;

	private lightBulp: LightBulpWidget;

	constructor(editor: ICodeEditor, markerService: IMarkerService, onAccept: (fix: IQuickFix2, marker:IMarker) => void) {
		super(/*[
			'cancel',
			'loading',
			'empty',
			'suggest',
			'destroy'
		]*/);
		this.editor = editor;
		this.markerService = markerService;
		this.onAccept = onAccept;

		this.quickFixRequestPromise = null;
		this.lightBulpDecoration = [];
		this.toDispose = [];
		this.toLocalDispose = [];

		this.lightBulp = new LightBulpWidget(editor, (pos) => { this.onLightBulpClicked(pos); });

		this.enableAutoQuckFix = false; // turn off for now
		this.autoSuggestDelay = this.editor.getConfiguration().contribInfo.quickSuggestionsDelay;
		if (isNaN(this.autoSuggestDelay) || (!this.autoSuggestDelay && this.autoSuggestDelay !== 0) || this.autoSuggestDelay > 2000 || this.autoSuggestDelay < 0) {
			this.autoSuggestDelay = 300;
		}

		this.toDispose.push(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this.toDispose.push(this.editor.onDidChangeModelMode(() => this.onModelChanged()));
		this.toDispose.push(CodeActionProviderRegistry.onDidChange(this.onModelChanged, this));
	}

	private onModelChanged(): void {
		this.cancelDialog();
		this.localDispose();
		this.lastMarker = null;
		this.lightBulpPosition = null;
		this.markers = null;
		this.updateScheduler = null;

		if (!CodeActionProviderRegistry.has(this.editor.getModel()) || this.editor.getConfiguration().readOnly) {
			this.setDecoration(null);
			return;
		}

		this.markerService.onMarkerChanged(this.onMarkerChanged, this, this.toLocalDispose);

		this.toLocalDispose.push(this.editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
			this.onCursorPositionChanged();
		}));
	}

	private onLightBulpClicked(pos: IPosition) : void {
		this.triggerDialog(true, pos);
	}

	private isSimilarMarker(marker1: IMarker, marker2: IMarker) : boolean {
		if (marker1) {
			return marker2 && marker1.owner === marker2.owner && marker1.code === marker2.code;
		}
		return !marker2;
	}

	private onMarkerChanged(changedResources: URI[]): void {
		var model = this.editor.getModel();
		if (!model) {
			return;
		}
		var associatedResource = model.uri;
		if (!changedResources.some(r => associatedResource.toString() === r.toString())) {
			return;
		}

		var lastMarker = this.lastMarker;

		this.markers = null;
		this.lastMarker = null;
		var currentMarker = this.findMarker(this.editor.getPosition(), false);
		if (this.isSimilarMarker(currentMarker, lastMarker)) {
			this.lastMarker = currentMarker;
		} else {
			this.onCursorPositionChanged();
		}
	}

	private setDecoration(pos: IPosition): void {
		this.lightBulpPosition = pos;
		this.updateDecoration();
	}

	private updateDecoration() : void {
		if (this.lightBulpPosition && this.state === QuickFixSuggestState.NOT_ACTIVE) {
			this.lightBulp.show(this.lightBulpPosition);
		} else {
			this.lightBulp.hide();
		}
	}

	private onCursorPositionChanged(): void {
		if (this.triggerAutoSuggestPromise) {
			this.triggerAutoSuggestPromise.cancel();
			this.triggerAutoSuggestPromise = null;
		}
		this.cancelDialog();

		if (!this.updateScheduler) {
			this.updateScheduler = new RunOnceScheduler(() => {

				const pos = this.editor.getPosition();
				let marker = this.lastMarker;
				if (marker && Range.containsPosition(marker, pos)) {
					// still on the same marker
					if (this.lightBulpPosition) {
						this.setDecoration(pos);
					}
					return;
				}

				if (!this.editor.isFocused()) {
					// remove lightbulb when editor lost focus
					this.setDecoration(null);
					return;
				}

				this.lastMarker = marker = this.findMarker(pos, false);
				if (!marker) {
					// remove lightbulp
					this.setDecoration(null);
					return;
				}

				const $tRequest = timer.start(timer.Topic.EDITOR, 'quickfix/lighbulp');
				const computeFixesPromise = this.computeFixes(marker);
				computeFixesPromise.done((fixes) => {
					this.setDecoration(!arrays.isFalsyOrEmpty(fixes) ? pos : null);
					this.triggerAutoSuggest(marker);
					$tRequest.stop();
				}, (error) => {
					onUnexpectedError(error);
					this.setDecoration(null);
					$tRequest.stop();
				});
			}, 250);
			this.toLocalDispose.push(this.updateScheduler);
		}
		this.updateScheduler.schedule();
	}

	private computeFixes(range: IMarker | IRange): TPromise<IQuickFix2[]> {
		let model = this.editor.getModel();
		if (!CodeActionProviderRegistry.has(model)) {
			return TPromise.as(null);
		}

		if (this.quickFixRequestPromise && range === this.quickFixRequestPromiseRange) {
			return this.quickFixRequestPromise;
		}

		if (this.quickFixRequestPromise) {
			this.quickFixRequestPromise.cancel();
			this.quickFixRequestPromise = null;
		}

		this.quickFixRequestPromiseRange = range;
		this.quickFixRequestPromise = getCodeActions(model, Range.lift(range));
		return this.quickFixRequestPromise;
	}

	/**
	 * Returns all marker sorted by startLineNumber
	 */
	private getMarkers(): IMarker[] {
		if (this.markers !== null) {
			return this.markers;
		}
		var model = this.editor.getModel();
		if (!model) {
			return;
		}
		this.markers = this.markerService.read({ resource: model.uri })
			.sort((e1, e2) => { return e1.startLineNumber - e2.startLineNumber; });

		return this.markers;
	}

	private findMarker(pos: IPosition, findOnSameLine: boolean): IMarker {
		if (this.lastMarker && Range.containsPosition(this.lastMarker, pos)) {
			return this.lastMarker;
		}

		var markers = this.getMarkers(); // makers sorted by line start number

		var result: IMarker = null;
		var bestDistance: number = 0;

		var lineNumber = pos.lineNumber;
		// find first marker with a line number greater equal the current position
		var idx = arrays.findFirst(markers, m => m.startLineNumber >= lineNumber);
		while (idx < markers.length && markers[idx].startLineNumber === lineNumber) {
			var marker = markers[idx];
			if (marker.startColumn <= pos.column && marker.endColumn >= pos.column) {
				return marker;
			}
			if (findOnSameLine) {
				var dist = pos.column < marker.startColumn ? marker.startColumn - pos.column : pos.column - marker.endColumn;
				if (!result || dist < bestDistance) {
					result = marker;
					bestDistance = dist;
				}
			}
			idx++;
		}
		return result;
	}

	public cancelDialog(silent:boolean = false):boolean {
		if (this.state !== QuickFixSuggestState.NOT_ACTIVE) {
			this.state = QuickFixSuggestState.NOT_ACTIVE;
			if (!silent) {
				this.emit('cancel');
			}
			this.updateDecoration();
			return true;
		}
		return false;
	}

	private isAutoSuggest():boolean {
		return this.state === QuickFixSuggestState.AUTO_TRIGGER;
	}

	private triggerAutoSuggest(marker: IMarker): void {
		if (this.enableAutoQuckFix && this.state === QuickFixSuggestState.NOT_ACTIVE) {
			this.triggerAutoSuggestPromise = TPromise.timeout(this.autoSuggestDelay);
			this.triggerAutoSuggestPromise.then(() => {
				this.triggerAutoSuggestPromise = null;
				if (marker === this.lastMarker) {
					this.triggerDialog(true, this.editor.getPosition());
				}
			});
		}
	}

	public triggerDialog(auto:boolean, pos: IPosition):void {
		// Cancel previous requests, change state & update UI
		this.cancelDialog(false);

		var range: IMarker | IRange;
		if (auto) {
			range = this.findMarker(pos, true);
			if (!range) {
				return;
			}
		} else {
			range = this.findMarker(pos, true);
			if (!range) {
				// no error on the same line: get code action for the current selection
				range = this.editor.getSelection();
			}

			if (!Range.containsPosition(range, pos)) {
				// move cursor
				this.editor.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
			}
		}

		var $tTrigger = timer.start(timer.Topic.EDITOR, 'quickfix/triggerdialog');
		this.state = auto ? QuickFixSuggestState.AUTO_TRIGGER : QuickFixSuggestState.MANUAL_TRIGGER;
		this.updateDecoration();

		this.emit('loading', { auto: this.isAutoSuggest() });
		this.computeFixes(range).done((fixes) => {
			if (fixes && fixes.length > 0) {
				fixes.sort((f1, f2) => f2.score - f1.score);
				this.emit('suggest', {
					fixes: fixes,
					range: range,
					auto: this.isAutoSuggest()
				});
			} else {
				this.emit('empty', { auto: this.isAutoSuggest() });
			}
			$tTrigger.stop();
		}, (error) => {
			onUnexpectedError(error);
			this.emit('empty', { auto: this.isAutoSuggest() });
			$tTrigger.stop();
		});
	}

	public accept(quickFix:IQuickFix2, range: IRange):boolean {
		this.cancelDialog();
		if (!quickFix) {
			return false;
		}

		this.onAccept(quickFix, range);

		return true;
	}

	private localDispose(): void {
		this.toLocalDispose = dispose(this.toLocalDispose);
		if (this.quickFixRequestPromise) {
			this.quickFixRequestPromise.cancel();
			this.quickFixRequestPromise = null;
		}
	}

	public dispose(): void {
		this.localDispose();
		this.toDispose = dispose(this.toDispose);
		this.emit('destroy', null);
	}

}

