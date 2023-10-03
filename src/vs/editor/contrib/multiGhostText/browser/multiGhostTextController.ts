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
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { GhostTextWidget } from 'vs/editor/contrib/multiGhostText/browser/ghostTextWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

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

		this.editor.pushUndoStop();
		if (data.removeRange) {
			this.editor.executeEdits('acceptCurrent', [EditOperation.replace(Range.lift(data.removeRange), data.text)]);
			const removeLineNumbers = data.removeRange.endLineNumber - data.removeRange.startLineNumber;
			const addLineNumbers = data.text.split('\n').length - 1;
			lineDelta = addLineNumbers - removeLineNumbers;
		}
		else {
			this.editor.executeEdits('acceptCurrent', [EditOperation.insert(Position.lift(data.position), data.text)]);
			lineDelta = data.text.split('\n').length - 1;
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
		const ghostText = this._widgetsData.shift();
		console.log('acceptAndNext', JSON.stringify(ghostText, null, 2));
		if (ghostText) {
			this.showSingleGhostText(ghostText);
			this.editor.setPosition(Position.lift(ghostText.position));
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
	}
}
