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
import { Direction, Grid, IView, IViewSize } from 'vs/base/browser/ui/grid/grid';
import { Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { ITextModel } from 'vs/editor/common/model';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { Color } from 'vs/base/common/color';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { localize } from 'vs/nls';
import { ILabelService } from 'vs/platform/label/common/label';

export class MergeEditor extends EditorPane {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();

	private _grid!: Grid;

	private readonly inputOneView = this.instantiation.createInstance(CodeEditorView);
	private readonly inputTwoView = this.instantiation.createInstance(CodeEditorView);
	private readonly inputResultView = this.instantiation.createInstance(CodeEditorView);

	constructor(
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super(MergeEditor.ID, telemetryService, themeService, storageService);

		const reentrancyBarrier = new ReentrancyBarrier();
		this._store.add(this.inputOneView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputTwoView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputResultView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));
		this._store.add(this.inputTwoView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputOneView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputResultView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));
		this._store.add(this.inputResultView.editor.onDidScrollChange(c => {
			if (c.scrollTopChanged) {
				reentrancyBarrier.runExclusively(() => {
					this.inputOneView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					this.inputTwoView.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
				});
			}
		}));
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		super.dispose();
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('merge-editor');
		this._grid = new Grid(this.inputResultView, { styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent } });

		this._grid.addView(this.inputOneView, Sizing.Distribute, this.inputResultView, Direction.Up);
		this._grid.addView(this.inputTwoView, Sizing.Distribute, this.inputOneView, Direction.Right);
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

		this._sessionDisposables.clear();
		const model = await input.resolve();

		this.inputOneView.setModel(model.inputOne, localize('yours', 'Yours'), undefined);
		this.inputTwoView.setModel(model.inputTwo, localize('theirs', 'Theirs',), undefined);
		this.inputResultView.setModel(model.result, localize('result', 'Result',), this._labelService.getUriLabel(model.result.uri, { relative: true }));

	}

	// override clearInput(): void {
	// 	super.clearInput();
	// }

	// protected override setEditorVisible(visible: boolean, group: IEditorGroup | undefined): void {
	// 	console.log('VISISBLE', visible);
	// }

}

class CodeEditorView implements IView {

	// preferredWidth?: number | undefined;
	// preferredHeight?: number | undefined;

	element: HTMLElement = document.createElement('div');
	private _titleElement = document.createElement('div');
	private _editorElement = document.createElement('div');

	minimumWidth: number = 10;
	maximumWidth: number = Number.MAX_SAFE_INTEGER;
	minimumHeight: number = 10;
	maximumHeight: number = Number.MAX_SAFE_INTEGER;
	// priority?: LayoutPriority | undefined;
	// snap?: boolean | undefined;

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange = this._onDidChange.event;

	private _title = new IconLabel(this._titleElement, { supportIcons: true });

	public readonly editor = this.instantiationService.createInstance(
		CodeEditorWidget,
		this._editorElement,
		{ minimap: { enabled: false } },
		{}
	);


	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService
	) {
		this.element.classList.add('code-view');
		this._titleElement.classList.add('title');
		this.element.appendChild(this._titleElement);
		this.element.appendChild(this._editorElement);
	}

	public setModel(model: ITextModel, title: string, description: string | undefined): void {
		this.editor.setModel(model);
		this._title.setLabel(title, description);
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.element.style.width = `${width}px`;
		this.element.style.height = `${height}px`;
		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
		this.editor.layout({ width, height: height - this._titleElement.clientHeight });
	}
}

class ReentrancyBarrier {
	private isActive = false;

	public runExclusively(fn: () => void): void {
		if (this.isActive) {
			return;
		}
		this.isActive = true;
		try {
			fn();
		} finally {
			this.isActive = false;
		}
	}
}
