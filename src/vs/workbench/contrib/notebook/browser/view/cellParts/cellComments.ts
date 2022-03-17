/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as languages from 'vs/editor/common/languages';
import { Emitter, Event } from 'vs/base/common/event';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRange } from 'vs/editor/common/core/range';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CommentThreadWidget } from 'vs/workbench/contrib/comments/browser/commentThreadWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { coalesce } from 'vs/base/common/arrays';

export class TestCommentThread implements languages.CommentThread<ICellRange> {
	private _input?: languages.CommentInput;
	get input(): languages.CommentInput | undefined {
		return this._input;
	}

	set input(value: languages.CommentInput | undefined) {
		this._input = value;
		this._onDidChangeInput.fire(value);
	}

	private readonly _onDidChangeInput = new Emitter<languages.CommentInput | undefined>();
	get onDidChangeInput(): Event<languages.CommentInput | undefined> { return this._onDidChangeInput.event; }

	private _label: string | undefined;

	get label(): string | undefined {
		return this._label;
	}

	set label(label: string | undefined) {
		this._label = label;
		this._onDidChangeLabel.fire(this._label);
	}

	private _contextValue: string | undefined;

	get contextValue(): string | undefined {
		return this._contextValue;
	}

	set contextValue(context: string | undefined) {
		this._contextValue = context;
	}

	private readonly _onDidChangeLabel = new Emitter<string | undefined>();
	readonly onDidChangeLabel: Event<string | undefined> = this._onDidChangeLabel.event;

	private _comments: languages.Comment[] | undefined;

	public get comments(): languages.Comment[] | undefined {
		return this._comments;
	}

	public set comments(newComments: languages.Comment[] | undefined) {
		this._comments = newComments;
		this._onDidChangeComments.fire(this._comments);
	}

	private readonly _onDidChangeComments = new Emitter<languages.Comment[] | undefined>();
	get onDidChangeComments(): Event<languages.Comment[] | undefined> { return this._onDidChangeComments.event; }

	set range(range: ICellRange) {
		this._range = range;
		this._onDidChangeRange.fire(this._range);
	}

	get range(): ICellRange {
		return this._range;
	}

	private readonly _onDidChangeCanReply = new Emitter<boolean>();
	get onDidChangeCanReply(): Event<boolean> { return this._onDidChangeCanReply.event; }
	set canReply(state: boolean) {
		this._canReply = state;
		this._onDidChangeCanReply.fire(this._canReply);
	}

	get canReply() {
		return this._canReply;
	}

	private readonly _onDidChangeRange = new Emitter<ICellRange>();
	public onDidChangeRange = this._onDidChangeRange.event;

	private _collapsibleState: languages.CommentThreadCollapsibleState | undefined;
	get collapsibleState() {
		return this._collapsibleState;
	}

	set collapsibleState(newState: languages.CommentThreadCollapsibleState | undefined) {
		this._collapsibleState = newState;
		this._onDidChangeCollasibleState.fire(this._collapsibleState);
	}

	private readonly _onDidChangeCollasibleState = new Emitter<languages.CommentThreadCollapsibleState | undefined>();
	public onDidChangeCollasibleState = this._onDidChangeCollasibleState.event;

	private _isDisposed: boolean;

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	constructor(
		public commentThreadHandle: number,
		public controllerHandle: number,
		public extensionId: string,
		public threadId: string,
		public resource: string,
		private _range: ICellRange,
		private _canReply: boolean
	) {
		this._isDisposed = false;
	}
	isDocumentCommentThread(): this is languages.CommentThread<IRange> {
		return false;
	}

	dispose() {
		this._isDisposed = true;
		this._onDidChangeCollasibleState.dispose();
		this._onDidChangeComments.dispose();
		this._onDidChangeInput.dispose();
		this._onDidChangeLabel.dispose();
		this._onDidChangeRange.dispose();
	}
}

export class CellComments extends CellPart {
	private _initialized: boolean = false;
	private _commentThreadWidget: CommentThreadWidget<ICellRange> | null = null;
	private currentElement: CodeCellViewModel | undefined;
	private readonly commentTheadDisposables = this._register(new DisposableStore());

	constructor(
		private readonly notebookEditor: INotebookEditorDelegate,
		private readonly container: HTMLElement,

		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommentService private readonly commentService: ICommentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.container.classList.add('review-widget');

		this._register(this.themeService.onDidColorThemeChange(this._applyTheme, this));
		// TODO @rebornix onDidChangeLayout (font change)
		// this._register(this.notebookEditor.onDidchangeLa)
		this._applyTheme();
	}

	private async initialize(element: ICellViewModel) {
		if (this._initialized) {
			return;
		}

		this._initialized = true;
		const commentThread = await this._getCommentThreadForCell(element);

		if (commentThread) {
			this._createCommentTheadWidget(commentThread);
		}
	}

	private _createCommentTheadWidget(commentThread: languages.CommentThread<ICellRange>) {
		this._commentThreadWidget?.dispose();
		this.commentTheadDisposables.clear();
		this._commentThreadWidget = this.instantiationService.createInstance(
			CommentThreadWidget,
			this.container,
			this.notebookEditor.getId(),
			this.notebookEditor.textModel!.uri,
			this.contextKeyService,
			this.instantiationService,
			commentThread,
			null,
			{},
			undefined,
			{
				actionRunner: () => {
				},
				collapse: () => { }
			}
		) as unknown as CommentThreadWidget<ICellRange>;

		const layoutInfo = this.notebookEditor.getLayoutInfo();

		this._commentThreadWidget.display(layoutInfo.fontInfo.lineHeight);
		this._applyTheme();

		this.commentTheadDisposables.add(this._commentThreadWidget.onDidResize(() => {
			if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
				this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
			}
		}));
	}

	private _bindListeners() {
		this.cellDisposables.add(this.commentService.onDidUpdateCommentThreads(async () => {
			if (this.currentElement) {
				const commentThread = await this._getCommentThreadForCell(this.currentElement);
				if (!this._commentThreadWidget && commentThread) {
					this._createCommentTheadWidget(commentThread);
					const layoutInfo = (this.currentElement as CodeCellViewModel).layoutInfo;
					this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight}px`;

					this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget!.container).height;

					return;
				}

				if (this._commentThreadWidget) {
					if (commentThread) {
						this._commentThreadWidget.updateCommentThread(commentThread);
						this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
					} else {
						this._commentThreadWidget.dispose();
						this.currentElement.commentHeight = 0;
					}
				}
			}
		}));
	}

	private async _getCommentThreadForCell(element: ICellViewModel) {
		if (this.notebookEditor.hasModel()) {
			const commentInfos = coalesce(await this.commentService.getNotebookComments(element.uri));
			if (commentInfos.length && commentInfos[0].threads.length) {
				return commentInfos[0].threads[0];
			}
		}

		return null;
	}

	private _applyTheme() {
		const theme = this.themeService.getColorTheme();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		this._commentThreadWidget?.applyTheme(theme, fontInfo);
	}

	protected override didRenderCell(element: ICellViewModel): void {
		if (element.cellKind === CellKind.Code) {
			this.currentElement = element as CodeCellViewModel;
			this.initialize(element);
			this._bindListeners();
		}

	}

	override prepareLayout(): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
			this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
		}
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
			const layoutInfo = (element as CodeCellViewModel).layoutInfo;
			this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight} px`;
		}
	}
}
