/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { IView, IViewSize } from 'vs/base/browser/ui/grid/grid';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { IObservable, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { setStyle } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';

export abstract class CodeEditorView extends Disposable {
	private readonly _viewModel = new ObservableValue<undefined | MergeEditorViewModel>(undefined, 'viewModel');
	readonly viewModel: IObservable<undefined | MergeEditorViewModel> = this._viewModel;
	readonly model = this._viewModel.map(m => m?.model);

	protected readonly htmlElements = h('div.code-view', [
		h('div.title', { $: 'title' }),
		h('div.container', [
			h('div.gutter', { $: 'gutterDiv' }),
			h('div', { $: 'editor' }),
		]),
	]);

	private readonly _onDidViewChange = new Emitter<IViewSize | undefined>();

	public readonly view: IView = {
		element: this.htmlElements.root,
		minimumWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
		maximumWidth: DEFAULT_EDITOR_MAX_DIMENSIONS.width,
		minimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
		maximumHeight: DEFAULT_EDITOR_MAX_DIMENSIONS.height,
		onDidChange: this._onDidViewChange.event,
		layout: (width: number, height: number, top: number, left: number) => {
			setStyle(this.htmlElements.root, { width, height, top, left });
			this.editor.layout({
				width: width - this.htmlElements.gutterDiv.clientWidth,
				height: height - this.htmlElements.title.clientHeight,
			});
		}
		// preferredWidth?: number | undefined;
		// preferredHeight?: number | undefined;
		// priority?: LayoutPriority | undefined;
		// snap?: boolean | undefined;
	};

	private readonly _title = new IconLabel(this.htmlElements.title, { supportIcons: true });
	protected readonly _detail = new IconLabel(this.htmlElements.title, { supportIcons: true });

	public readonly editor = this.instantiationService.createInstance(
		CodeEditorWidget,
		this.htmlElements.editor,
		{},
		{
			contributions: this.getEditorContributions(),
		}
	);

	public updateOptions(newOptions: Readonly<IEditorOptions>): void {
		this.editor.updateOptions(newOptions);
	}

	public readonly isFocused = observableFromEvent(
		Event.any(this.editor.onDidBlurEditorWidget, this.editor.onDidFocusEditorWidget),
		() => this.editor.hasWidgetFocus()
	);

	public readonly cursorPosition = observableFromEvent(
		this.editor.onDidChangeCursorPosition,
		() => this.editor.getPosition()
	);

	public readonly cursorLineNumber = this.cursorPosition.map(p => p?.lineNumber);

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	protected getEditorContributions(): IEditorContributionDescription[] | undefined {
		return undefined;
	}

	public setModel(
		viewModel: MergeEditorViewModel,
		textModel: ITextModel,
		title: string,
		description: string | undefined,
		detail: string | undefined
	): void {
		this.editor.setModel(textModel);
		this._title.setLabel(title, description);
		this._detail.setLabel('', detail);

		this._viewModel.set(viewModel, undefined);
	}
}
