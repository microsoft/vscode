/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./color';
import {RunOnceScheduler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IDisposable, cAll, disposeAll} from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

class ColorDecoration {
	public static createRenderingDecoration(range:editorCommon.IRange, inlineClassName:string): editorCommon.IModelDeltaDecoration {
		return {
			range: {
				startLineNumber: range.startLineNumber,
				startColumn: range.startColumn,
				endLineNumber: range.startLineNumber,
				endColumn: range.startColumn + 1
			},
			options: {
				inlineClassName: 'inline-color-decoration ' + inlineClassName,
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
			}
		};
	}

	public static createTrackingDecoration(range:editorCommon.IRange): editorCommon.IModelDeltaDecoration {
		return {
			range: range,
			options: {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
			}
		};
	}

	public trackingDecorationId:string;
	public renderingDecorationId:string;

	constructor(renderingDecorationId:string, trackingDecorationId:string) {

		this.renderingDecorationId = renderingDecorationId;
		this.trackingDecorationId = trackingDecorationId;
	}

	public getColorValue(model:editorCommon.IModel): string {
		var range = model.getDecorationRange(this.trackingDecorationId);
		if (range) {
			return model.getValueInRange(range);
		}
		return '';
	}
}

interface IFunction {
	(): void;
}

export class ColorContribution implements editorCommon.IEditorContribution {

	public static ID = 'css.editor.colorContribution';
	private static INSTANCE_COUNT = 0;

	private _instanceCount:number;
	private _editor:editorCommon.ICommonCodeEditor;
	private _contentChangedScheduler:RunOnceScheduler;
	private _decorationsChangedScheduler:RunOnceScheduler;

	private _callOnDispose:IDisposable[];
	private _callOnModelChange:IFunction[];

	private _currentFindColorDeclarationsPromise:TPromise<{range:editorCommon.IRange; value:string; }[]>;
	private _currentDecorations:ColorDecoration[];
	private _currentDynamicColors:string[];

	private _style:HTMLStyleElement;

	constructor(editor:editorCommon.ICommonCodeEditor) {
		this._instanceCount = (++ColorContribution.INSTANCE_COUNT);
		this._editor = editor;
		this._callOnDispose = [];
		this._callOnModelChange = [];
		this._currentDecorations = [];
		this._currentDynamicColors = [];
		this._contentChangedScheduler = new RunOnceScheduler(null, 250);
		this._decorationsChangedScheduler = new RunOnceScheduler(() => this.onDecorationsChanged(), 250);
		this._currentFindColorDeclarationsPromise = null;

		this._callOnDispose.push(this._contentChangedScheduler);
		this._callOnDispose.push(this._decorationsChangedScheduler);
		this._callOnDispose.push(this._editor.addListener2(editorCommon.EventType.ModelChanged, () => this.onModelChange()));
		this._callOnDispose.push(this._editor.addListener2(editorCommon.EventType.ModelModeChanged,() => this.onModelChange()));
		this._callOnDispose.push(this._editor.addListener2(editorCommon.EventType.ModelModeSupportChanged,(e: editorCommon.IModeSupportChangedEvent) => {
			this.onModelChange();
		}));

		this._style = dom.createStyleSheet();
		this.onModelChange();
	}

	public dispose(): void {
		if (this._currentDecorations.length > 0) {
			this._editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {
				let oldDecorations: string[] = [];
				for (let i = 0, len = this._currentDecorations.length; i < len; i++) {
					oldDecorations.push(this._currentDecorations[i].renderingDecorationId);
					oldDecorations.push(this._currentDecorations[i].trackingDecorationId);
				}
				changeAccessor.deltaDecorations(oldDecorations, []);
				this._currentDecorations = null;
			});
		}
		this._style.parentNode.removeChild(this._style);
		this._style = null;
		this._callOnDispose = disposeAll(this._callOnDispose);
	}

	public getId():string {
		return ColorContribution.ID;
	}

	private onModelChange(): void {
		cAll(this._callOnModelChange);

		var model = <editorCommon.IModel> this._editor.getModel();
		if(!model) {
			return;
		}

		var rawMode = model.getMode();
		if(typeof rawMode['findColorDeclarations'] !== 'function') {
			return;
		}

		this._contentChangedScheduler.setRunner(() => {
			if (this._currentFindColorDeclarationsPromise) {
				this._currentFindColorDeclarationsPromise.cancel();
			}

			this._currentFindColorDeclarationsPromise = rawMode['findColorDeclarations'](model.getAssociatedResource());

			var myModelVersion = this._editor.getModel().getVersionId();
			this._currentFindColorDeclarationsPromise.then((result) => {
				if (myModelVersion !== this._editor.getModel().getVersionId()) {
					return;
				}
				this.renderAndTrackColors(result);
			}, (error) => {
				onUnexpectedError(error);
			});
		});
		this._contentChangedScheduler.schedule();


		this._callOnModelChange.push(() => {
			this._contentChangedScheduler.cancel();
			this._decorationsChangedScheduler.cancel();
		});
		this._callOnModelChange.push(() => {
			if (this._currentFindColorDeclarationsPromise) {
				this._currentFindColorDeclarationsPromise.cancel();
			}
			this._currentFindColorDeclarationsPromise = null;
		});
		this._callOnModelChange.push(this._editor.addListener(editorCommon.EventType.ModelContentChanged, (event) => this._contentChangedScheduler.schedule()));
		this._callOnModelChange.push(model.addListener(editorCommon.EventType.ModelDecorationsChanged, (event) => this._decorationsChangedScheduler.schedule()));
	}

	private renderAndTrackColors(colors:{range:editorCommon.IRange; value:string; }[]): void {

		// Reduce to a maximum of 500 colors
		colors = colors.slice(0, 500);

		this._editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {
			let oldDecorations: string[] = [];
			for (let i = 0, len = this._currentDecorations.length; i < len; i++) {
				oldDecorations.push(this._currentDecorations[i].renderingDecorationId);
				oldDecorations.push(this._currentDecorations[i].trackingDecorationId);
			}

			let newDecorations: editorCommon.IModelDeltaDecoration[] = [];
			for (let i = 0, len = colors.length; i < len; i++) {
				newDecorations.push(ColorDecoration.createRenderingDecoration(colors[i].range, this.getCSSRuleName(i)));
				newDecorations.push(ColorDecoration.createTrackingDecoration(colors[i].range));
			}

			let decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);

			this._currentDecorations = [];
			for (let i = 0, len = colors.length; i < len; i++) {
				this._currentDecorations.push(new ColorDecoration(decorations[2*i], decorations[2*i+1]));
			}
		});

		this.onDecorationsChanged();
	}

	private onDecorationsChanged(): void {

		var model = this._editor.getModel(),
			i:number,
			len:number,
			range:editorCommon.IEditorRange,
			renderingRange:editorCommon.IEditorRange,
			desiredRenderingRange:editorCommon.IRange,
			decoration: ColorDecoration,
			desiredColors: string[] = [];

		this._editor.changeDecorations((changeAccessor:editorCommon.IModelDecorationsChangeAccessor) => {

			for (i = 0, len = this._currentDecorations.length; i < len; i++) {
				decoration = this._currentDecorations[i];

				range = model.getDecorationRange(decoration.trackingDecorationId);

				if (range && !range.isEmpty()) {
					// Collect color for this decoration
					desiredColors[i] = model.getValueInRange(range).replace(/[^%#a-z0-9.,()]/gi, '');

					// Prevent rendering decorations from growing too much
					renderingRange = model.getDecorationRange(decoration.renderingDecorationId);
					desiredRenderingRange = model.validateRange({
						startLineNumber: range.startLineNumber,
						startColumn: range.startColumn,
						endLineNumber: range.startLineNumber,
						endColumn: range.startColumn + 1
					});
					if (!renderingRange || !renderingRange.equalsRange(desiredRenderingRange)) {
						changeAccessor.changeDecoration(decoration.renderingDecorationId, desiredRenderingRange);
					}
				} else {
					desiredColors[i] = '';
				}
			}

			this.ensureColors(desiredColors);
		});


	}

	private getCSSRuleName(index:number): string {
		if (index < 0) {
			return '.monaco-css-dynamic-' + this._instanceCount + '-';
		}
		return '.monaco-css-dynamic-' + this._instanceCount + '-' + index + ':before';
	}

	private _changeCost(desiredColors:string[]): number {
		if (this._currentDynamicColors.length !== desiredColors.length) {
			return Number.MAX_VALUE;
		}

		var modifiedCnt = 0;
		for (var i = 0; i < desiredColors.length; i++) {
			if (desiredColors[i] !== this._currentDynamicColors[i]) {
				modifiedCnt++;
			}
		}
		return modifiedCnt;
	}

	private ensureColors(desiredColors:string[]): void {
		var i:number,
			changeCost = this._changeCost(desiredColors);

		if (changeCost === 0) {
			// Nothing to change
			return;
		}


		if (changeCost < 10) {
			// Simply modify up to 10 rules (lengths will match for sure)
			for (i = 0; i < desiredColors.length; i++) {
				if (desiredColors[i] !== this._currentDynamicColors[i]) {
					var rule = dom.getCSSRule(this.getCSSRuleName(i), this._style);
					if (rule) {
						rule.style.backgroundColor = desiredColors[i];
					}
				}
			}
		} else {
			// .innerHTML is the friend here
			var result:string[] = [];

			for (i = 0; i < desiredColors.length; i++) {
				result.push(this.getCSSRuleName(i));
				result.push('{');
				result.push(this.getCSSText(desiredColors[i]));
				result.push('}');
			}
			this._style.innerHTML = result.join('');
		}
		this._currentDynamicColors = desiredColors;
	}

	private getCSSText(color:string): string {
		// Variants:
		return strings.format('background-color:{0};', color);
	}

}

CommonEditorRegistry.registerEditorContribution(ColorContribution);
