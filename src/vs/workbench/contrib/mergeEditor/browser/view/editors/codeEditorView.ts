/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { IView, IViewSize } from 'vs/base/browser/ui/grid/grid';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IObservable, observableFromEvent } from 'vs/base/common/observable';
import { IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { setStyle } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';

export abstract class CodeEditorView extends Disposable {
	readonly model = this.viewModel.map(m => /** @description model */ m?.model);

	protected readonly htmlElements = h('div.code-view', [
		h('div.title@header', [
			h('span.title@title'),
			h('span.description@description'),
			h('span.detail@detail'),
			h('span.toolbar@toolbar'),
		]),
		h('div.container', [
			h('div.gutter@gutterDiv'),
			h('div@editor'),
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
				height: height - this.htmlElements.header.clientHeight,
			});
		}
		// preferredWidth?: number | undefined;
		// preferredHeight?: number | undefined;
		// priority?: LayoutPriority | undefined;
		// snap?: boolean | undefined;
	};

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
		() => /** @description editor.hasWidgetFocus */ this.editor.hasWidgetFocus()
	);

	public readonly cursorPosition = observableFromEvent(
		this.editor.onDidChangeCursorPosition,
		() => /** @description editor.getPosition */ this.editor.getPosition()
	);

	public readonly selection = observableFromEvent(
		this.editor.onDidChangeCursorSelection,
		() => /** @description editor.getSelections */ this.editor.getSelections()
	);

	public readonly cursorLineNumber = this.cursorPosition.map(p => /** @description cursorPosition.lineNumber */ p?.lineNumber);

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
		public readonly viewModel: IObservable<undefined | MergeEditorViewModel>,
	) {
		super();
	}

	protected getEditorContributions(): IEditorContributionDescription[] | undefined {
		return undefined;
	}
}

export function createSelectionsAutorun(
	codeEditorView: CodeEditorView,
	translateRange: (baseRange: Range, viewModel: MergeEditorViewModel) => Range
): IDisposable {
	const selections = derived('selections', reader => {
		const viewModel = codeEditorView.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const baseRange = viewModel.selectionInBase.read(reader);
		if (!baseRange || baseRange.sourceEditor === codeEditorView) {
			return [];
		}
		return baseRange.rangesInBase.map(r => translateRange(r, viewModel));
	});

	return autorun('set selections', (reader) => {
		const ranges = selections.read(reader);
		if (ranges.length === 0) {
			return;
		}
		codeEditorView.editor.setSelections(ranges.map(r => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)));
	});
}

export class TitleMenu extends Disposable {
	constructor(
		menuId: MenuId,
		targetHtmlElement: HTMLElement,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const titleMenu = menuService.createMenu(menuId, contextKeyService);
		const toolBar = new ToolBar(targetHtmlElement, contextMenuService);
		const toolBarUpdate = () => {
			const secondary: IAction[] = [];
			createAndFillInActionBarActions(titleMenu, { renderShortTitle: true }, secondary);
			toolBar.setActions([], secondary);
		};
		this._store.add(toolBar);
		this._store.add(titleMenu);
		this._store.add(titleMenu.onDidChange(toolBarUpdate));
		toolBarUpdate();
	}
}
