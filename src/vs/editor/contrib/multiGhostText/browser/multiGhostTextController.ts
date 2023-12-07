/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { constObservable } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { GhostTextWidget } from 'vs/editor/contrib/multiGhostText/browser/ghostTextWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';

export type GhostTextData = {
	readonly position: IPosition;
	readonly text: string;
	readonly removeRange?: IRange;
};

export class MultiGhostTextController extends Disposable {
	static ID = 'editor.contrib.multiGhostTextController';

	public static readonly multiGhostTextVisibleContext = new RawContextKey<boolean>('multiGhostTextVisible', false);
	private _isVisibleContext = MultiGhostTextController.multiGhostTextVisibleContext.bindTo(this.contextKeyService);

	public static get(editor: ICodeEditor): MultiGhostTextController | null {
		return editor.getContribution<MultiGhostTextController>(MultiGhostTextController.ID);
	}

	private _currentWidget: [GhostTextWidget, GhostTextData] | undefined;
	private _widgetsData: GhostTextData[] = [];
	private _dontClear = false;

	private readonly _rulerDecorations: IEditorDecorationsCollection;
	private readonly _rulerDecoration: ModelDecorationOptions;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @IConfigurationService private readonly configurationService: IConfigurationService,
		// @ICommandService private readonly commandService: ICommandService,
		// @ILanguageFeatureDebounceService private readonly debounceService: ILanguageFeatureDebounceService,
		// @ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		// @IAudioCueService private readonly audioCueService: IAudioCueService,
	) {
		super();

		const opts: IModelDecorationOptions = {
			description: 'multi-ghost-text-decoration',
			overviewRuler: {
				color: Color.cyan.toString(),
				position: OverviewRulerLane.Full
			},
			minimap: {
				color: Color.cyan.toString(),
				position: MinimapPosition.Inline
			},
		};
		this._rulerDecoration = ModelDecorationOptions.createDynamic(opts);

		this._rulerDecorations = editor.createDecorationsCollection();
		this._register(editor.onDidChangeModelContent(() => this.clear()));
	}

	private showSingleGhostText(gt: GhostTextData) {
		if (this._currentWidget) {
			this._currentWidget[0].dispose();
			this._currentWidget = undefined;
		}

		const ghostText = new GhostText(gt.position.lineNumber, [new GhostTextPart(gt.position.column, gt.text.split('\n'), false)]);
		const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
			ghostText: constObservable(ghostText),
			minReservedLineCount: constObservable(0),
			targetTextModel: constObservable(this.editor.getModel() ?? undefined),
			removeRange: constObservable(gt.removeRange)
		});

		this._isVisibleContext.set(true);
		this._currentWidget = [instance, gt];
	}

	private showRulerDecoration(ghostText: GhostTextData | undefined) {
		if (!ghostText) {
			this._rulerDecorations.set([]);
			return;
		}
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		const col = model.getLineMaxColumn(ghostText.position.lineNumber);
		const range = new Range(ghostText.position.lineNumber, 0, ghostText.position.lineNumber, col);
		const decoration =
		{
			range: range,
			options: this._rulerDecoration
		};
		this._rulerDecorations.set([decoration]);
	}

	public showGhostText(ghostTexts: GhostTextData[], auto: boolean): void {
		if (this._currentWidget && auto) {
			//ignore auto requests if we're displaying suggestions
			return;
		}

		console.log('showGhostText', JSON.stringify(ghostTexts, null, 2));

		this._widgetsData = ghostTexts;

		const ghostText = this._widgetsData.shift();
		if (ghostText) {
			this.showSingleGhostText(ghostText);
			this.showRulerDecoration(ghostText);
			if (!auto) {
				this.editor.setPosition(Position.lift(ghostText.position));
			}
		}
		else {
			this.clear();
		}

	}

	private acceptCurrent(widget: GhostTextWidget, data: GhostTextData): number {
		if (!this._currentWidget) {
			return -1;
		}

		this._dontClear = true;
		let lineDelta = 0;

		//It should only happen in case of last line suggestion
		let text = data.text;
		if (data.text.startsWith('\n')) {
			text = data.text.substring(1);
		}

		this.editor.pushUndoStop();
		if (data.removeRange) {
			this.editor.executeEdits('acceptCurrent', [EditOperation.replace(Range.lift(data.removeRange), text)]);
			const removeLineNumbers = data.removeRange.endLineNumber - data.removeRange.startLineNumber;
			const addLineNumbers = text.split('\n').length - 1;
			lineDelta = addLineNumbers - removeLineNumbers;
		}
		else {
			this.editor.executeEdits('acceptCurrent', [EditOperation.insert(Position.lift(data.position), text)]);
			lineDelta = text.split('\n').length - 1;
		}
		widget.dispose();
		return lineDelta;
	}

	private updateLocations(insertionLine: number, lineDelta: number) {
		console.log('updateLocations', insertionLine, lineDelta);
		const tranlated = this._widgetsData.map((data) => {
			if (data.position.lineNumber < insertionLine) {
				console.log('updateLocations', 'no change');
				return data;
			}

			const newPosition = {
				lineNumber: data.position.lineNumber + lineDelta,
				column: data.position.column
			};


			const newRemoveRange = !data.removeRange ? undefined : {
				startLineNumber: data.removeRange.startLineNumber + lineDelta,
				startColumn: data.removeRange.startColumn,
				endLineNumber: data.removeRange.endLineNumber + lineDelta,
				endColumn: data.removeRange.endColumn
			};

			return {
				position: newPosition,
				removeRange: newRemoveRange,
				text: data.text
			};
		});

		console.log('updateLocations', JSON.stringify(tranlated, null, 2));
		this._widgetsData = tranlated;
	}

	public acceptAndNext(): void {
		if (!this._currentWidget) {
			return;
		}
		const widget = this._currentWidget[0];
		const data = this._currentWidget[1];

		const lineDelta = this.acceptCurrent(widget, data);
		console.log('acceptAndNext', lineDelta);
		this.updateLocations(data.position.lineNumber, lineDelta);
		let ghostText = this._widgetsData.shift();
		this.showRulerDecoration(ghostText);
		console.log('acceptAndNext', JSON.stringify(ghostText, null, 2));
		//if we'd show ghost text in a position that's outside of the file, we should display it at the end of the last line
		const fileLineCount = this.editor.getModel()?.getLineCount() ?? 1;
		if (ghostText && ghostText.position.lineNumber > fileLineCount) {
			ghostText = {
				position: {
					lineNumber: fileLineCount,
					column: this.editor.getModel()?.getLineMaxColumn(fileLineCount) ?? 1
				},
				removeRange: ghostText.removeRange,
				text: '\n' + ghostText.text
			};
		}


		if (ghostText) {
			this.showSingleGhostText(ghostText);
			this.editor.setPosition(Position.lift(ghostText.position));
			//if position is outside viewports, scroll to it
			this.editor.revealPositionInCenterIfOutsideViewport(Position.lift(ghostText.position));
		}
		else {
			this.clear();
		}


	}

	public clear() {
		if (this._dontClear) {
			this._dontClear = false;
			return;
		}
		this._widgetsData = [];
		this._currentWidget?.[0].dispose();
		this._currentWidget = undefined;
		this._isVisibleContext.set(false);
		this.showRulerDecoration(undefined);
	}
}


export class MultiGhostTextControllerMulti extends Disposable {
	static ID = 'editor.contrib.multiGhostTextControllerMulti';

	public static get(editor: ICodeEditor): MultiGhostTextControllerMulti | null {
		return editor.getContribution<MultiGhostTextControllerMulti>(MultiGhostTextControllerMulti.ID);
	}

	private _widgets: [GhostTextWidget, GhostTextData][] = [];
	private _selectedWidget: GhostTextWidget | undefined;
	private _dontClear = false;

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @IConfigurationService private readonly configurationService: IConfigurationService,
		// @ICommandService private readonly commandService: ICommandService,
		// @ILanguageFeatureDebounceService private readonly debounceService: ILanguageFeatureDebounceService,
		// @ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		// @IAudioCueService private readonly audioCueService: IAudioCueService,
	) {
		super();

		this._register(editor.onDidChangeModelContent(() => this.clear()));
	}

	private dataEquals(a: GhostTextData, b: GhostTextData): boolean {
		return a.position.lineNumber === b.position.lineNumber && a.position.column === b.position.column && a.text === b.text;
	}

	public showGhostText(ghostTexts: GhostTextData[]): void {
		//get repeated widgets
		const repeatedWidgets = this._widgets.filter(([widget, data]) => {
			return ghostTexts.some(ghostText => this.dataEquals(ghostText, data));
		});

		//non-repeated widgets
		const nonRepeatedWidgets = this._widgets.filter(([widget, data]) => {
			return !ghostTexts.some(ghostText => this.dataEquals(ghostText, data));
		});

		nonRepeatedWidgets.forEach(([widget, data]) => {
			widget.dispose();
		});
		this._widgets = repeatedWidgets;

		//non-repeated ghost texts
		const newGhostText = ghostTexts.filter(ghostText => {
			return !this._widgets.some(([widget, data]) => {
				return this.dataEquals(ghostText, data);
			});
		});

		for (const gt of newGhostText) {
			const ghostText = new GhostText(gt.position.lineNumber, [new GhostTextPart(gt.position.column, gt.text.split('\n'), false)]);

			const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
				ghostText: constObservable(ghostText),
				minReservedLineCount: constObservable(0),
				targetTextModel: constObservable(this.editor.getModel() ?? undefined),
				removeRange: constObservable(gt.removeRange)
			});
			this._widgets.push([instance, gt]);

		}
	}

	public selectNext() {
		if (this._widgets.length === 0) {
			return;
		}

		if (this._selectedWidget === undefined) {
			this._selectedWidget = this._widgets[0][0];
			this._selectedWidget.select();
			return;
		}

		const index = this._widgets.findIndex(([widget, data]) => {
			return widget === this._selectedWidget;
		});

		if (index === -1) {
			return;
		}

		const nextIndex = (index + 1) % this._widgets.length;
		const nextWidget = this._widgets[nextIndex][0];
		this._selectedWidget?.deselect();
		nextWidget.select();
		this._selectedWidget = nextWidget;
	}

	public selectPrevious() {
		if (this._widgets.length === 0) {
			return;
		}

		if (this._selectedWidget === undefined) {
			this._selectedWidget = this._widgets[0][0];
			this._selectedWidget.select();
			return;
		}

		const index = this._widgets.findIndex(([widget, data]) => {
			return widget === this._selectedWidget;
		});

		if (index === -1) {
			return;
		}

		const previousIndex = (index - 1 + this._widgets.length) % this._widgets.length;
		const previousWidget = this._widgets[previousIndex][0];
		this._selectedWidget?.deselect();
		previousWidget.select();
		this._selectedWidget = previousWidget;
	}

	public acceptAll() {
		this.editor.pushUndoStop();
		let lineDelta = 0;
		this._widgets.forEach(([widget, data]) => {
			if (data.removeRange) {
				const range = new Range(data.removeRange.startLineNumber + lineDelta, data.removeRange.startColumn, data.removeRange.endLineNumber + lineDelta, data.removeRange.endColumn);
				this.editor.executeEdits('acceptAll', [EditOperation.replace(range, data.text)]);
				lineDelta += data.text.split('\n').length - 1 - (data.removeRange.endLineNumber - data.removeRange.startLineNumber);
			}
			else {
				const position = new Position(data.position.lineNumber + lineDelta, data.position.column);
				this.editor.executeEdits('acceptAll', [EditOperation.insert(position, data.text)]);
				lineDelta += data.text.split('\n').length - 1;
			}
		});
	}

	public acceptSelected() {
		if (this._selectedWidget === undefined) {
			return;
		}

		const index = this._widgets.findIndex(([widget, data]) => {
			return widget === this._selectedWidget;
		});

		if (index === -1) {
			return;
		}

		const [widget, data] = this._widgets[index];

		this._dontClear = true;
		let lineDelta = 0;

		this.editor.pushUndoStop();
		if (data.removeRange) {
			this.editor.executeEdits('acceptSelected', [EditOperation.replace(Range.lift(data.removeRange), data.text)]);
			lineDelta = data.text.split('\n').length - 1 - (data.removeRange.endLineNumber - data.removeRange.startLineNumber);
		}
		else {
			this.editor.executeEdits('acceptSelected', [EditOperation.insert(Position.lift(data.position), data.text)]);
			lineDelta = data.text.split('\n').length - 1;
		}
		widget.dispose();
		this._widgets.splice(index, 1);
		//all widgets after the selected widget should be recalculated
		this._widgets.splice(index).forEach(([widget, data]) => {
			widget.dispose();

			const position = Position.lift(data.position).with(data.position.lineNumber + lineDelta, data.position.column);
			const ghostText = new GhostText(position.lineNumber, [new GhostTextPart(position.column, data.text.split('\n'), false)]);
			const removeRange =
				data.removeRange
					? new Range(data.removeRange.startLineNumber + lineDelta, data.removeRange.startColumn, data.removeRange.endLineNumber + lineDelta, data.removeRange.endColumn)
					: undefined;

			const gt = {
				position: position,
				text: data.text,
				removeRange: removeRange
			};
			const instance = this.instantiationService.createInstance(GhostTextWidget, this.editor, {
				ghostText: constObservable(ghostText),
				minReservedLineCount: constObservable(0),
				targetTextModel: constObservable(this.editor.getModel() ?? undefined),
				removeRange: constObservable(gt.removeRange)
			});
			this._widgets.push([instance, gt]);
		});


		//select next widget
		if (this._widgets.length > 0) {
			const nextIndex = index % this._widgets.length;
			const nextWidget = this._widgets[nextIndex][0];
			nextWidget.select();
			this._selectedWidget = nextWidget;
		} else {
			this._selectedWidget = undefined;
		}
	}

	public clear(): void {
		if (this._dontClear) {
			this._dontClear = false;
			return;
		}

		this._widgets.forEach(([widget, data]) => {
			widget.dispose();
		});
		this._widgets = [];
		this._selectedWidget = undefined;
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

}
