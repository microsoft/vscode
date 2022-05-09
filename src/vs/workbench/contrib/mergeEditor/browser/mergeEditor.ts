/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/mergeEditor';
import { Dimension, reset } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { BugIndicatingError } from 'vs/base/common/errors';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Direction, Grid, IView, IViewSize, LayoutPriority } from 'vs/base/browser/ui/grid/grid';
import { Sizing } from 'vs/base/browser/ui/splitview/splitview';


class CodeEditorView implements IView {

	preferredWidth?: number | undefined;
	preferredHeight?: number | undefined;

	element: HTMLElement = document.createElement('div');

	minimumWidth: number = 10;
	maximumWidth: number = Number.MAX_SAFE_INTEGER;
	minimumHeight: number = 10;
	maximumHeight: number = Number.MAX_SAFE_INTEGER;
	priority?: LayoutPriority | undefined;
	snap?: boolean | undefined;

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange = this._onDidChange.event;

	constructor(text: string) {
		this.element.innerText = text;
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
	}

}

export class MergeEditor extends EditorPane {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();

	private _grid!: Grid;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super(MergeEditor.ID, telemetryService, themeService, storageService);
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		super.dispose();
	}

	protected createEditor(parent: HTMLElement): void {


		const inputOneView = new CodeEditorView('one');
		const inputTwoView = new CodeEditorView('two');
		const inputResultView = new CodeEditorView('result');

		this._grid = new Grid(inputResultView);

		this._grid.addView(inputOneView, Sizing.Distribute, inputResultView, Direction.Up);
		this._grid.addView(inputTwoView, Sizing.Distribute, inputOneView, Direction.Right);
		reset(parent, this._grid.element);
	}

	layout(dimension: Dimension): void {
		this._grid.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);
		console.trace('mergeEditor@53');
		this._sessionDisposables.clear();
		// const model = await input.resolve();
		// if (token.isCancellationRequested) {
		// 	return;
		// }
	}

	override clearInput(): void {
		console.trace('mergeEditor@66');
	}

}
