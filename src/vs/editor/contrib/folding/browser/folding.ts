/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <amd-dependency path="vs/css!./folding" />

'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {Range} from 'vs/editor/common/core/range';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IMouseEvent, ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import Modes = require('vs/editor/common/modes');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {TPromise} from 'vs/base/common/winjs.base';
import foldStrategy = require('vs/editor/contrib/folding/common/indentFoldStrategy');
import {IFoldingRange} from 'vs/editor/contrib/folding/common/foldingRange';


class CollapsableRegion {

	public visualDecorationId:string;
	public rangeDecorationId:string;
	public isCollapsed:boolean;

	public constructor(range:IFoldingRange, model:EditorCommon.IModel, changeAccessor:EditorCommon.IModelDecorationsChangeAccessor, isCollapsed:boolean) {
		this.isCollapsed = isCollapsed;

		var maxColumn = model.getLineMaxColumn(range.startLineNumber);
		var visualRng = {
			startLineNumber: range.startLineNumber,
			startColumn: maxColumn - 1,
			endLineNumber: range.startLineNumber,
			endColumn: maxColumn
		};

		this.visualDecorationId = changeAccessor.addDecoration(visualRng, this.getVisualDecorationOptions());

		var colRng = {
			startLineNumber: range.startLineNumber,
			startColumn: 1,
			endLineNumber: range.endLineNumber,
			endColumn: model.getLineMaxColumn(range.endLineNumber)
		};
		this.rangeDecorationId = changeAccessor.addDecoration(colRng, {});
	}

	public getVisualDecorationOptions():EditorCommon.IModelDecorationOptions {
		if (this.isCollapsed) {
			return {
				inlineClassName: 'inline-folded',
				linesDecorationsClassName: 'folding collapsed'
			};
		} else {
			return {
				linesDecorationsClassName: 'folding'
			};
		}
	}

	public dispose(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor): void {
		changeAccessor.removeDecoration(this.visualDecorationId);
		changeAccessor.removeDecoration(this.rangeDecorationId);
	}
}

export class Folding implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.folding';

	private editor:ICodeEditor;
	private globalToDispose:IDisposable[];

	private computeToken:number;
	private updateScheduler:RunOnceScheduler;
	private localToDispose:IDisposable[];

	private decorations:CollapsableRegion[];

	constructor(editor:ICodeEditor, @INullService nullService) {
		this.editor = editor;

		this.globalToDispose = [];
		this.localToDispose = [];
		this.decorations = [];
		this.computeToken = 0;

		this.globalToDispose.push(this.editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.globalToDispose.push(this.editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.onModelChanged()));

		this.onModelChanged();
	}

	public getId(): string {
		return Folding.ID;
	}

	public dispose(): void {
		this.cleanState();
		this.globalToDispose = disposeAll(this.globalToDispose);
	}

	private cleanState(): void {
		this.localToDispose = disposeAll(this.localToDispose);
	}

	private onModelChanged(): void {
		this.cleanState();

		var model = this.editor.getModel();
		if (!model) {
			return;
		}

		this.updateScheduler = new RunOnceScheduler(() => {
			var myToken = (++this.computeToken);

			this.computeCollapsableRegions().then(regions => {
				if (myToken !== this.computeToken) {
					// A new request was made in the meantime or the model was changed
					return;
				}
				this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
					var collapsedStartLineNumbers:{[lineNumber:string]:boolean} = {};
					this.decorations.forEach((dec) => {
						if (dec.isCollapsed) {
							var oldRange = model.getDecorationRange(dec.visualDecorationId);
							collapsedStartLineNumbers[oldRange.startLineNumber.toString()] = true;
						}
						changeAccessor.removeDecoration(dec.rangeDecorationId);
						changeAccessor.removeDecoration(dec.visualDecorationId);
					});

					this.decorations = [];

					regions.forEach(region => {
						this.decorations.push(new CollapsableRegion(region, model, changeAccessor, collapsedStartLineNumbers[region.startLineNumber.toString()]));
					});
				});

				this.updateHiddenAreas();
			});
		}, 500);

		this.localToDispose.push(this.updateScheduler);
		this.localToDispose.push(this.editor.addListener2('change', () => this.updateScheduler.schedule()));
		this.localToDispose.push({ dispose: () => {
			++this.computeToken;
			this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
				this.decorations.forEach((dec) => dec.dispose(changeAccessor));
			});
		}});
		this.localToDispose.push(this.editor.addListener2(EditorCommon.EventType.MouseDown, (e) => this._onEditorMouseDown(e)));

		this.updateScheduler.schedule();
	}

	private computeCollapsableRegions() : TPromise<IFoldingRange[]> {
		let tabSize = this.editor.getIndentationOptions().tabSize;
		var model = this.editor.getModel();
		if (!model) {
			return TPromise.as([]);
		}


		let ranges = foldStrategy.computeRanges(model, tabSize);
		return TPromise.as(ranges);
	}

	private _onEditorMouseDown(e:IMouseEvent): void {
		if (e.target.type !== EditorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}
		if (this.decorations.length === 0) {
			return;
		}
		var position = e.target.position;
		if (!position) {
			return;
		}

		var model = this.editor.getModel();

		var hasChanges = false;

		this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
			for (var i = 0; i < this.decorations.length; i++) {
				var dec = this.decorations[i];
				var decRange = model.getDecorationRange(dec.rangeDecorationId);
				if (decRange.startLineNumber === position.lineNumber) {
					dec.isCollapsed = !dec.isCollapsed;
					changeAccessor.changeDecorationOptions(dec.visualDecorationId, dec.getVisualDecorationOptions());
					hasChanges = true;
					break;
				}
			}
		});

		if (hasChanges) {
			this.updateHiddenAreas();
		}

	}

	private updateHiddenAreas(): void {
		var model = this.editor.getModel();
		var hiddenAreas:EditorCommon.IRange[] = [];
		this.decorations.filter((dec) => dec.isCollapsed).forEach((dec) => {
			var decRange = model.getDecorationRange(dec.rangeDecorationId);
			hiddenAreas.push({
				startLineNumber: decRange.startLineNumber + 1,
				startColumn: 1,
				endLineNumber: decRange.endLineNumber,
				endColumn: 1
			});
		});
		this.editor.setHiddenAreas(hiddenAreas);
	}
}

EditorBrowserRegistry.registerEditorContribution(Folding);